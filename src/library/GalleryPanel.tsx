import { useCallback, useState } from 'react';
import { applySettings, captureSettings, useViewer } from '../store';
import { deleteArtifact, deleteArtwork, listArtifactMeta, listArtworkMeta } from './db';
import { clearModels, dropModel } from './models';
import { clearArt, dropArt } from './artworks';
import { useImportFiles } from '../import/useImport';
import { ACCEPTED_EXTENSIONS } from '../import/loadModel';
import { downloadBlob, exportGallery, importGallery } from './galleryFile';

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * The roster. This is what replaces re-packaging the Unreal build: adding and removing
 * both the objects and the prints happens here at runtime, per machine.
 *
 * It is split in two because this setup has two halves and they are managed separately —
 * you swap the object in front of a fixed print as often as you swap the print behind a
 * fixed object. Which one the add button reaches is whichever half is showing, so the
 * same drop-a-file gesture means different things on purpose and the panel says which.
 */
export function GalleryPanel() {
  const [tab, setTab] = useState<'objects' | 'prints'>('objects');

  const artifacts = useViewer((s) => s.artifacts);
  const artworks = useViewer((s) => s.artworks);
  const open = useViewer((s) => s.showGallery);
  const objectIndex = useViewer((s) => s.objectIndex);
  const artIndex = useViewer((s) => s.artIndex);
  const selectObject = useViewer((s) => s.selectObject);
  const selectArt = useViewer((s) => s.selectArt);
  const removeArtifactMeta = useViewer((s) => s.removeArtifactMeta);
  const removeArtworkMeta = useViewer((s) => s.removeArtworkMeta);
  const toggleGallery = useViewer((s) => s.toggleGallery);
  const setArtifacts = useViewer((s) => s.setArtifacts);
  const setArtworks = useViewer((s) => s.setArtworks);
  const setImportError = useViewer((s) => s.setImportError);

  // Packing a gallery of 100 MB scans takes a moment; the buttons report their own state
  // rather than borrowing the import modal, which is about loading a single file.
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const importFiles = useImportFiles();

  const removeObject = async (id: string) => {
    await deleteArtifact(id);
    dropModel(id);
    removeArtifactMeta(id);
  };

  const removePrint = async (id: string) => {
    await deleteArtwork(id);
    dropArt(id);
    removeArtworkMeta(id);
  };

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) void importFiles(files);
      e.target.value = '';
    },
    [importFiles],
  );

  const doExport = async () => {
    setBusy('export');
    setImportError(null);
    try {
      const blob = await exportGallery(captureSettings());
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `reflection-gallery-${stamp}.zip`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy('import');
    setImportError(null);
    try {
      const { count, artworkCount, settings } = await importGallery(file);
      // Parsed models and decoded prints are keyed by id, and importing replaces the
      // library, so both caches have to go or removed entries would linger in memory.
      clearModels();
      clearArt();
      applySettings(settings);
      setArtifacts(await listArtifactMeta());
      setArtworks(await listArtworkMeta());
      selectObject(0);
      if (count === 0 && artworkCount === 0) {
        setImportError('That gallery contained no objects and no artworks.');
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that gallery file.');
    } finally {
      setBusy(null);
    }
  };

  const showing = tab === 'objects' ? artifacts.length : artworks.length;

  return (
    <div className={`gallery${open ? '' : ' is-closed'}`}>
      {/* The tab stays put whether the panel is open or shut, so the gallery is always
          visible as an affordance rather than something you have to know a key for. */}
      <button type="button" className="gallery-tab" onClick={toggleGallery}>
        <span>Gallery</span>
        <span className="gallery-count">{artifacts.length + artworks.length}</span>
        <span className="gallery-chevron">{open ? '×' : '▾'}</span>
      </button>

      {open && (
        <div className="gallery-seg" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'objects'}
            className={tab === 'objects' ? 'is-on' : undefined}
            onClick={() => setTab('objects')}
          >
            Objects <span>{artifacts.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'prints'}
            className={tab === 'prints' ? 'is-on' : undefined}
            onClick={() => setTab('prints')}
          >
            Prints <span>{artworks.length}</span>
          </button>
        </div>
      )}

      {open && tab === 'objects' && (
        showing === 0 ? (
          <div className="gallery-empty">
            Nothing added yet — drag a model onto the window.
          </div>
        ) : (
          <ul className="gallery-list">
            {artifacts.map((a, i) => (
              <li key={a.id} className={i === objectIndex ? 'is-active' : undefined}>
                <button type="button" className="gallery-pick" onClick={() => selectObject(i)}>
                  <span className="gallery-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="gallery-name">{a.name}</span>
                  <span className="gallery-meta">
                    {a.untextured && <span className="gallery-warn">no texture</span>}
                    {a.format.toUpperCase()} · {mb(a.sizeBytes)}
                  </span>
                </button>
                <button
                  type="button"
                  className="gallery-remove"
                  onClick={() => void removeObject(a.id)}
                  aria-label={`Remove ${a.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {open && tab === 'prints' && (
        <ul className="gallery-list">
          {/* The bare sheet is a real choice, not the absence of one — it is what the
              acrylic looks like before the artwork is printed, and A cycles through it
              too. Listing it keeps the panel and the keyboard telling the same story. */}
          <li className={artIndex < 0 ? 'is-active' : undefined}>
            <button type="button" className="gallery-pick" onClick={() => selectArt(-1)}>
              <span className="gallery-index">—</span>
              <span className="gallery-name">Bare sheet</span>
              <span className="gallery-meta">no print</span>
            </button>
          </li>
          {artworks.map((a, i) => (
            <li key={a.id} className={i === artIndex ? 'is-active' : undefined}>
              <button type="button" className="gallery-pick" onClick={() => selectArt(i)}>
                <span className="gallery-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="gallery-name">{a.name}</span>
                <span className="gallery-meta">
                  {a.widthPx}×{a.heightPx} · {mb(a.sizeBytes)}
                </span>
              </button>
              <button
                type="button"
                className="gallery-remove"
                onClick={() => void removePrint(a.id)}
                aria-label={`Remove ${a.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Packaging: object, print and the geometry between them travel as one file, so a
          staged pairing can be handed to a colleague, archived, or moved machines. */}
      {open && (
        <div className="gallery-pack">
          <button
            type="button"
            onClick={() => void doExport()}
            disabled={(artifacts.length === 0 && artworks.length === 0) || busy !== null}
          >
            {busy === 'export' ? 'Exporting…' : 'Export gallery'}
          </button>
          <label className={busy ? 'is-busy' : undefined}>
            {busy === 'import' ? 'Importing…' : 'Import gallery'}
            <input type="file" accept=".zip" onChange={onImport} hidden disabled={busy !== null} />
          </label>
        </div>
      )}

      {open && (
        <label className="gallery-add">
          <span className="gallery-add-plus">+</span>
          <span>{tab === 'objects' ? 'Add object' : 'Add print'}</span>
          <span className="gallery-add-hint">
            {tab === 'objects' ? 'model, plus its texture if separate' : 'an image for the acrylic'}
          </span>
          <input
            type="file"
            accept={
              tab === 'objects' ? `${ACCEPTED_EXTENSIONS.join(',')},.mtl,image/*` : 'image/*'
            }
            multiple
            onChange={onPick}
            hidden
          />
        </label>
      )}
    </div>
  );
}
