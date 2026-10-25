import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewer } from '../store';
import { useImportFiles } from './useImport';
import { ACCEPTED_EXTENSIONS } from './loadModel';

/**
 * Whole-window drag target. Dropping a scan straight from Finder is the headline
 * interaction, so the drop area is the page itself rather than a small panel.
 *
 * A drop can mean two different things here — an object to stand in front of the sheet,
 * or an artwork to print on it — so the overlay says which one it is about to do before
 * the file lands. See useImport for the rule; the short version is that images on their
 * own are artwork, and images alongside a model are that model's textures.
 */
export function DropZone() {
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState<'any' | 'print'>('any');
  const depth = useRef(0);
  const importFiles = useImportFiles();

  const importing = useViewer((s) => s.importing);
  const importError = useViewer((s) => s.importError);
  const setImportError = useViewer((s) => s.setImportError);
  const [notesReduced, setNotesReduced] = useState(false);
  useEffect(() => setNotesReduced(false), [importError]);
  const artifacts = useViewer((s) => s.artifacts);
  const artworks = useViewer((s) => s.artworks);

  useEffect(() => {
    // dragenter/dragleave fire for every child element, so track depth rather than
    // toggling on each event or the overlay flickers as the cursor crosses the HUD.
    const onEnter = (e: DragEvent) => {
      e.preventDefault();
      depth.current += 1;
      if (!e.dataTransfer?.types.includes('Files')) return;
      setDragging(true);

      // Filenames are not exposed during a drag — only MIME types — so this can tell an
      // all-images drop from anything else, which is exactly the distinction that
      // decides whether the drop prints or adds an object.
      const items = Array.from(e.dataTransfer.items ?? []).filter((i) => i.kind === 'file');
      const allImages = items.length > 0 && items.every((i) => i.type.startsWith('image/'));
      setKind(allImages ? 'print' : 'any');
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onLeave = (e: DragEvent) => {
      e.preventDefault();
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void importFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles]);

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) void importFiles(files);
      e.target.value = '';
    },
    [importFiles],
  );

  return (
    <>
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            {kind === 'print' ? (
              <>
                <div className="drop-title">Drop to print on the acrylic</div>
                <div className="drop-sub">
                  the sheet is cut to the image — drop a model too if this is its texture
                </div>
              </>
            ) : (
              <>
                <div className="drop-title">Drop to add an object</div>
                <div className="drop-sub">fbx · glb · gltf · obj · stl · ply · usd</div>
              </>
            )}
          </div>
        </div>
      )}

      {importing && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-title">{importing.name}</div>
            <div className="modal-note">{importing.note}</div>
            <div className="modal-bar"><span /></div>
          </div>
        </div>
      )}

      {/* A station's notes can run to a paragraph; reduced, they wait in the corner as a
          chip instead of sitting over the scene. A new message always opens full size. */}
      {importError &&
        (notesReduced ? (
          <button
            type="button"
            className="toast toast-chip"
            onClick={() => setNotesReduced(false)}
            title="Show notes"
          >
            Notes ▴
          </button>
        ) : (
          <div className="toast" role="alert">
            <span className="toast-text">{importError}</span>
            <button type="button" onClick={() => setImportError(null)}>
              Dismiss
            </button>
            <button
              type="button"
              className="toast-reduce"
              onClick={() => setNotesReduced(true)}
              title="Reduce"
              aria-label="Reduce notes"
            >
              –
            </button>
          </div>
        ))}

      {artifacts.length === 0 && !importing && (
        <div className="empty">
          <div className="empty-title">Drag a model onto this window</div>
          <div className="empty-sub">
            fbx · glb · gltf · obj · stl · ply · usd — if the texture is not embedded,
            drag the image in alongside it.
          </div>
          <div className="empty-sub">
            {artworks.length === 0
              ? 'Drop an image on its own and it is printed on the acrylic instead.'
              : 'Press A to change what is printed on the acrylic.'}
          </div>
          <label className="empty-pick">
            Or choose a file
            <input type="file" accept={`${ACCEPTED_EXTENSIONS.join(",")},.mtl,image/*`} multiple onChange={onPick} hidden />
          </label>
        </div>
      )}
    </>
  );
}