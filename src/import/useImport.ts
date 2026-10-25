import { useCallback } from 'react';
import { Box3, Vector3, type Object3D } from 'three';
import { useViewer } from '../store';
import {
  ACCEPTED_EXTENSIONS,
  formatOf,
  isImageFile,
  isMaterialFile,
  loadModel,
  triangleCount,
  type TextureFile,
} from './loadModel';
import { putArtifact, putArtwork, type ArtifactMeta, type ArtworkMeta } from '../library/db';
import { setModel } from '../library/models';
import { ensureArt, measureImage } from '../library/artworks';

const HEAVY_TRIANGLES = 1_500_000;

/**
 * A glTF's own height, cm, if it is plausibly a real one. glTF is metres by spec, and
 * photogrammetry exports (Metashape, RealityCapture) keep the scan at true size — the
 * Museo de América scans come in within millimetres of their catalogue heights. Outside
 * 1 cm to 4 m the file was clearly scaled for something else, so it is auto-fit instead.
 * Other formats carry no reliable unit and are always auto-fit until a height is typed.
 */
function nativeHeightCm(group: Object3D, format: string): number | undefined {
  if (format !== 'gltf') return undefined;
  const h = new Box3().setFromObject(group).getSize(new Vector3()).y * 100;
  return h >= 1 && h <= 400 ? Math.round(h * 10) / 10 : undefined;
}

/** The store actions the two import paths need. Passed in rather than captured. */
type ImportSink = {
  setImporting: (v: { name: string; note: string } | null) => void;
  addArtifactMeta: (a: ArtifactMeta) => void;
  addArtworkMeta: (a: ArtworkMeta) => void;
};

/**
 * Import dropped or picked files.
 *
 * This app takes two kinds of file and they overlap, so the rule for telling them apart
 * has to be predictable rather than clever:
 *
 *   a drop containing a model  →  images in it are that model's textures
 *   a drop of images only      →  they are artworks to print on the acrylic
 *
 * Most museum scans embed their texture inside the FBX, but a few only reference an
 * absolute path from the exporting machine and load black unless the .jpg comes with
 * them — so model-plus-image has to keep meaning "here is the texture". Dropping a
 * picture on its own is unambiguous, and it is how the artwork gets onto the sheet.
 */
export function useImportFiles() {
  const setImporting = useViewer((s) => s.setImporting);
  const setImportError = useViewer((s) => s.setImportError);
  const addArtifactMeta = useViewer((s) => s.addArtifactMeta);
  const addArtworkMeta = useViewer((s) => s.addArtworkMeta);

  return useCallback(
    async (files: File[]) => {
      setImportError(null);

      const sink: ImportSink = { setImporting, addArtifactMeta, addArtworkMeta };
      const models = files.filter((f) => formatOf(f.name));
      const images = files.filter((f) => isImageFile(f.name));
      const materials = files.filter((f) => isMaterialFile(f.name));

      if (models.length === 0 && images.length === 0) {
        setImportError(
          materials.length
            ? '.mtl files must be dropped together with the model they belong to.'
            : `Drop a model (${ACCEPTED_EXTENSIONS.join(' ')}) or an image to print on the acrylic.`,
        );
        return;
      }

      const warnings =
        models.length === 0
          ? await importArtworks(images, sink)
          : await importModels(models, [...images, ...materials], sink);

      if (warnings.length) setImportError(warnings.join('  •  '));
    },
    [addArtifactMeta, addArtworkMeta, setImporting, setImportError],
  );
}

/** Images dropped on their own become artworks printed on the sheet. */
async function importArtworks(images: File[], sink: ImportSink): Promise<string[]> {
  const warnings: string[] = [];

  for (const file of images) {
    const label = file.name.replace(/\.[^.]+$/, '');
    try {
      sink.setImporting({ name: label, note: 'Reading artwork…' });

      // Measured now rather than at first render: the sheet is cut to the artwork's
      // aspect ratio, so the geometry needs the dimensions before anything is drawn.
      const [{ widthPx, heightPx }, bytes] = await Promise.all([
        measureImage(file),
        file.arrayBuffer(),
      ]);

      const meta: ArtworkMeta = {
        id: crypto.randomUUID(),
        name: label,
        mime: file.type || 'image/jpeg',
        widthPx,
        heightPx,
        sizeBytes: file.size,
        addedAt: Date.now(),
      };

      sink.setImporting({ name: label, note: 'Saving to library…' });
      await putArtwork({ ...meta, bytes });

      // Decoded before it becomes the visible artwork, so the sheet does not flash bare.
      sink.setImporting({ name: label, note: 'Printing on the acrylic…' });
      await ensureArt(meta.id);

      sink.addArtworkMeta(meta);
    } catch (err) {
      warnings.push(`${label} — ${err instanceof Error ? err.message : 'not a readable image'}`);
    } finally {
      sink.setImporting(null);
    }
  }

  return warnings;
}

/**
 * Models, with any images in the same drop treated as their sidecar textures.
 *
 * Parsing runs on the main thread behind a progress modal. That is deliberate for v1:
 * FBXLoader and texture decode both want DOM APIs, and these files are mostly 3-16 MB.
 * The very large Museo scans are the case that would justify a Worker.
 */
async function importModels(
  models: File[],
  support: File[],
  sink: ImportSink,
): Promise<string[]> {
  const textures: TextureFile[] = await Promise.all(
    support.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })),
  );

  const warnings: string[] = [];

  for (const file of models) {
    const format = formatOf(file.name)!;
    const label = file.name.replace(/\.[^.]+$/, '');

    try {
      sink.setImporting({ name: label, note: 'Reading file…' });
      const bytes = await file.arrayBuffer();

      // Yield once so the modal paints before the parse blocks the main thread.
      sink.setImporting({ name: label, note: 'Parsing mesh…' });
      await new Promise((r) => setTimeout(r, 0));

      const { group, missing } = await loadModel(bytes, format, textures);

      const untextured = missing.length > 0;
      if (untextured) {
        warnings.push(
          `${label} needs ${missing.join(', ')} — drag the .fbx and its image in together.`,
        );
      }

      const tris = triangleCount(group);
      if (tris > HEAVY_TRIANGLES) {
        // Worth flagging harder here than in the baseline viewer: the acrylic renders the
        // whole scene a second time every frame, so a heavy scan costs roughly double.
        warnings.push(
          `${label} is ~${tris.toLocaleString()} triangles. The reflection pass draws the ` +
            'scene twice per frame, so expect this one to run slowly.',
        );
      }

      const meta: ArtifactMeta = {
        id: crypto.randomUUID(),
        name: label,
        format,
        sizeBytes: file.size,
        addedAt: Date.now(),
        scaleMultiplier: 1,
        yawOffsetDeg: 0,
        untextured,
        heightCm: nativeHeightCm(group, format),
      };

      sink.setImporting({ name: label, note: 'Saving to library…' });
      await putArtifact({ ...meta, bytes, textures });

      setModel(meta.id, group);
      sink.addArtifactMeta(meta);
    } catch (err) {
      warnings.push(`${label} — ${err instanceof Error ? err.message : 'failed to load'}`);
    } finally {
      sink.setImporting(null);
    }
  }

  return warnings;
}
