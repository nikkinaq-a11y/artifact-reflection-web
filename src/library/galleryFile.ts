import { unzip, zip } from 'fflate';
import {
  clearArtifacts,
  clearArtworks,
  clearSetups,
  listArtifactRecords,
  listArtworkRecords,
  listSetups,
  putArtifact,
  putArtwork,
  putSetup,
  type SetupRecord,
  type ArtifactRecord,
  type ArtworkRecord,
  type Quat,
} from './db';
import type { SupportedFormat } from '../import/loadModel';
import type { Slot, SlotId } from '../store';

/**
 * A curated pairing saved as a single .zip: every object's original bytes, any sidecar
 * textures, the artworks printed on the acrylic, and the scene setup the curator staged
 * it with. Opening it on another machine reproduces what they saw, which is what makes a
 * collection portable rather than stuck in one browser's storage.
 *
 * This format carries more than the baseline viewer's, because in this setup the pairing
 * *is* the work — an object in front of a particular print, at a particular gap and
 * reflectance. Shipping the object without the artwork, or either without the geometry
 * between them, loses the thing being shared.
 *
 * Layout inside the zip:
 *   gallery.json                       manifest + scene settings
 *   README.md                          the same, in words — every pairing and its stands
 *   artifacts/<id>/<filename>          the model, under its original name
 *   artifacts/<id>/textures/<name>     sidecar images for models that need them
 *   artworks/<id>/<filename>           images printed on the acrylic
 */

export const GALLERY_FORMAT_VERSION = 1;

/**
 * Fields marked v1 are what the first release wrote, describing a single object. They
 * are still written, from slot A, so an older build can open a newer gallery; a newer
 * build reading an older gallery builds slot A from them. Everything added since is
 * optional and additive, which is why the format version has not moved.
 */
export type SceneSettings = {
  /** v1 — slot A's pedestal. */
  pedestal?: { widthCm: number; lengthCm: number; heightCm: number };
  pedestalVisible?: boolean;
  /** The acrylic sheet's width, mount height and (v1) slot A's distance from it, in cm. */
  panel: { widthCm: number; bottomCm: number; gapCm?: number; heightCm?: number | null };
  /** Fresnel F0 of the sheet. */
  reflectance: number;
  /** Surface finish: 0 mirror-sharp, 1 diffused. */
  polish: number;
  /** Brightness of the print. */
  print: number;
  lights: Record<string, { on: boolean; intensity: number }>;
  /** Index into LIGHT_LEVELS — the brightness slider. Optional: older galleries have none. */
  lightLevel?: number;
  studioTheme: string;
  /** v1 — slot A's scale. */
  objectScale?: number;
  camIndex: number;
  /** The view by name — preferred over camIndex, which shifts when a view is added. */
  camName?: string;
  /** Index into CAMERA_DISTANCES — D. Optional: older galleries have none. */
  camDistance?: number;
  /** Which artwork is on the sheet; -1 is a bare sheet. */
  artIndex: number;
  /**
   * What stood on each pedestal and what was printed, by library id. Preferred over the
   * slots' objectIndex and artIndex, which are positions in a list that reorders. null is
   * an empty pedestal / bare sheet. Optional: older galleries have only the positions.
   */
  objectIds?: Record<SlotId, string | null>;
  artworkId?: string | null;

  /** Both objects' placement, stands and turn. */
  slots?: Record<SlotId, Slot>;
  twoUp?: boolean;
  active?: SlotId;
  plinth?: { on: boolean; heightCm: number };
  /** The install-plan station the scene was staged from, if any. */
  station?: string | null;
};

type ManifestArtifact = {
  id: string;
  name: string;
  format: SupportedFormat;
  file: string;
  textures: string[];
  sizeBytes: number;
  addedAt: number;
  scaleMultiplier: number;
  yawOffsetDeg: number;
  heightCm?: number;
  /** The upright correction, [x, y, z, w]. Optional: absent means as imported. */
  orientation?: Quat;
  untextured: boolean;
};

type ManifestArtwork = {
  id: string;
  name: string;
  mime: string;
  file: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  addedAt: number;
};

type Manifest = {
  formatVersion: number;
  exportedAt: string;
  settings: SceneSettings;
  artifacts: ManifestArtifact[];
  artworks: ManifestArtwork[];
  /** Saved setups. Optional: older galleries have none, and older builds ignore it. */
  setups?: SetupRecord[];
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const asU8 = (b: ArrayBuffer) => new Uint8Array(b);

/** Model files keep their original extension so the zip is legible outside the app. */
const extFor = (format: SupportedFormat, name: string) =>
  /\.[^.]+$/.test(name) ? '' : `.${format === 'gltf' ? 'glb' : format}`;

export async function exportGallery(settings: SceneSettings): Promise<Blob> {
  const [records, artworkRecords, setups] = await Promise.all([
    listArtifactRecords(),
    listArtworkRecords(),
    listSetups(),
  ]);

  // A sheet with only a print on it is a legitimate thing to hand someone, so an export
  // needs one or the other rather than specifically an object.
  if (records.length === 0 && artworkRecords.length === 0) {
    throw new Error('Nothing to export — the library has no objects and no artworks.');
  }

  const files: Record<string, Uint8Array> = {};
  const artifacts: ManifestArtifact[] = [];
  const artworks: ManifestArtwork[] = [];

  for (const r of records) {
    const fileName = `${r.name}${extFor(r.format, r.name)}`;
    files[`artifacts/${r.id}/${fileName}`] = asU8(r.bytes);

    const textureNames: string[] = [];
    for (const t of r.textures ?? []) {
      files[`artifacts/${r.id}/textures/${t.name}`] = asU8(t.bytes);
      textureNames.push(t.name);
    }

    artifacts.push({
      id: r.id,
      name: r.name,
      format: r.format,
      file: fileName,
      textures: textureNames,
      sizeBytes: r.sizeBytes,
      addedAt: r.addedAt,
      scaleMultiplier: r.scaleMultiplier,
      yawOffsetDeg: r.yawOffsetDeg,
      heightCm: r.heightCm,
      ...(r.orientation ? { orientation: r.orientation } : {}),
      untextured: r.untextured,
    });
  }

  for (const a of artworkRecords) {
    const fileName = `${a.name}${extForImage(a.mime, a.name)}`;
    files[`artworks/${a.id}/${fileName}`] = asU8(a.bytes);
    artworks.push({
      id: a.id,
      name: a.name,
      mime: a.mime,
      file: fileName,
      widthPx: a.widthPx,
      heightPx: a.heightPx,
      sizeBytes: a.sizeBytes,
      addedAt: a.addedAt,
    });
  }

  const manifest: Manifest = {
    formatVersion: GALLERY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    artifacts,
    artworks,
    setups,
  };

  files['gallery.json'] = enc.encode(JSON.stringify(manifest, null, 2));
  files['README.md'] = enc.encode(readmeFor(manifest));

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    // Level 0: the payload is already-compressed JPEG and binary mesh data, so deflating
    // it again costs seconds and saves almost nothing.
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
  });

  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

/**
 * README.md — the same gallery in words, for anyone opening the zip by hand: every object
 * and print, and every saved pairing with its stands. The app does not read it back;
 * gallery.json is the record, and this is written from it.
 */
function readmeFor(m: Manifest): string {
  const s = m.settings;
  const objectName = (id: string | null | undefined) =>
    id ? (m.artifacts.find((a) => a.id === id)?.name ?? '(not in this gallery)') : '— empty —';
  const printName = (id: string | null | undefined) =>
    id ? (m.artworks.find((a) => a.id === id)?.name ?? '(not in this gallery)') : 'bare sheet';
  const box = (b: { widthCm: number; lengthCm: number; heightCm: number }) =>
    `${b.widthCm} W × ${b.lengthCm} D × ${b.heightCm} H cm`;

  const describe = (
    settings: SceneSettings,
    objects: { A: string | null; B: string | null },
    artworkId: string | null | undefined,
  ): string[] => {
    const lines = [
      `- **Print:** ${printName(artworkId)}`,
      `- **Sheet:** ${settings.panel.heightCm ? `${settings.panel.heightCm} H × ` : ''}${settings.panel.widthCm} W cm, bottom edge ${settings.panel.bottomCm} cm up`,
      `- **Plinth:** ${settings.plinth?.on ? `${settings.plinth.heightCm} cm` : 'none'}`,
    ];
    const ids: SlotId[] = settings.twoUp ? ['A', 'B'] : ['A'];
    for (const id of ids) {
      const slot = settings.slots?.[id];
      const label = settings.twoUp ? `Object ${id}` : 'Object';
      lines.push(`- **${label}:** ${objectName(objects[id])}`);
      if (!slot) continue;
      const turn = Math.round(((((slot.rotationStep % 12) + 12) % 12) * 30 + slot.nudgeDeg) * 10) / 10;
      lines.push(
        `  - stands on: ${slot.onFloor ? 'the floor / plinth' : `pedestal ${box(slot.pedestal)}${slot.baseOn ? `, base ${box(slot.base)}` : ''}`}`,
        `  - placed ${slot.gapCm} cm out from the sheet, ${slot.xCm} cm along; turned ${turn}°; scale ${slot.scale}×`,
      );
    }
    return lines;
  };

  const lines = [
    '# Reflection Viewer — exported gallery',
    '',
    `Exported ${new Date(m.exportedAt).toLocaleString()} · ${m.artifacts.length} objects · ${m.artworks.length} prints · ${m.setups?.length ?? 0} saved pairings`,
    '',
    'Open the Reflection Viewer and use **Import gallery** to load this file. Everything',
    'below is restored from `gallery.json`; this page is the same information for reading.',
    '',
    '## Scene as exported',
    '',
    ...(s.station ? [`- **Station:** ${s.station}`] : []),
    ...describe(
      s,
      s.objectIds ?? {
        A: m.artifacts[s.slots?.A.objectIndex ?? -1]?.id ?? null,
        B: m.artifacts[s.slots?.B.objectIndex ?? -1]?.id ?? null,
      },
      s.artworkId !== undefined ? s.artworkId : (m.artworks[s.artIndex]?.id ?? null),
    ),
    `- **Reflectance:** ${s.reflectance?.toFixed(2) ?? '?'} head-on`,
    '',
    '## Saved pairings',
    '',
    ...(m.setups?.length
      ? m.setups.flatMap((x) => [`### ${x.name}`, '', ...describe(x.settings, x.objects, x.artworkId), ''])
      : ['None saved. Use **Save** (right edge) to keep a pairing.', '']),
    '## Objects',
    '',
    ...m.artifacts.map(
      (a) =>
        `- ${a.name} (${a.format.toUpperCase()})${a.heightCm ? `, ${a.heightCm} cm tall` : ''}${a.orientation ? ' — orientation corrected in the app' : ''}`,
    ),
    '',
    '## Prints',
    '',
    ...m.artworks.map((a) => `- ${a.name} (${a.widthPx}×${a.heightPx})`),
    '',
    'The models and images are also readable directly from the `artifacts/` and `artworks/`',
    'folders if you need them outside the app.',
    '',
  ];
  return lines.join('\n');
}

export type ImportResult = {
  count: number;
  artworkCount: number;
  setupCount: number;
  settings: SceneSettings | null;
};

/**
 * Load a gallery zip. Replaces the current library rather than merging — a shared gallery
 * is a curated set, and silently mixing it into whatever was already there makes it
 * impossible to tell what came from where.
 */
export async function importGallery(file: File): Promise<ImportResult> {
  const buf = new Uint8Array(await file.arrayBuffer());

  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });

  const manifestRaw = entries['gallery.json'];
  if (!manifestRaw) throw new Error('Not a Reflection Viewer gallery — gallery.json is missing.');

  const manifest = JSON.parse(dec.decode(manifestRaw)) as Manifest;
  if (manifest.formatVersion > GALLERY_FORMAT_VERSION) {
    throw new Error(
      `This gallery was made by a newer version of the app (format ${manifest.formatVersion}).`,
    );
  }

  await Promise.all([clearArtifacts(), clearArtworks(), clearSetups()]);

  let count = 0;
  for (const a of manifest.artifacts) {
    const bytes = entries[`artifacts/${a.id}/${a.file}`];
    if (!bytes) continue;

    const record: ArtifactRecord = {
      id: a.id,
      name: a.name,
      format: a.format,
      bytes: toArrayBuffer(bytes),
      textures: a.textures
        .map((name) => {
          const t = entries[`artifacts/${a.id}/textures/${name}`];
          return t ? { name, bytes: toArrayBuffer(t) } : null;
        })
        .filter((t): t is { name: string; bytes: ArrayBuffer } => t !== null),
      sizeBytes: a.sizeBytes,
      addedAt: a.addedAt,
      scaleMultiplier: a.scaleMultiplier ?? 1,
      yawOffsetDeg: a.yawOffsetDeg ?? 0,
      ...(typeof a.heightCm === 'number' ? { heightCm: a.heightCm } : {}),
      ...(isQuat(a.orientation) ? { orientation: a.orientation } : {}),
      untextured: a.untextured ?? false,
    };

    await putArtifact(record);
    count += 1;
  }

  let artworkCount = 0;
  for (const a of manifest.artworks ?? []) {
    const bytes = entries[`artworks/${a.id}/${a.file}`];
    if (!bytes) continue;

    const record: ArtworkRecord = {
      id: a.id,
      name: a.name,
      mime: a.mime,
      bytes: toArrayBuffer(bytes),
      widthPx: a.widthPx,
      heightPx: a.heightPx,
      sizeBytes: a.sizeBytes,
      addedAt: a.addedAt,
    };

    await putArtwork(record);
    artworkCount += 1;
  }

  // Setups refer to objects and prints by id, and ids survive the round trip, so they come
  // back pointing at the same things.
  let setupCount = 0;
  for (const setup of manifest.setups ?? []) {
    await putSetup(setup);
    setupCount += 1;
  }

  return { count, artworkCount, setupCount, settings: manifest.settings ?? null };
}

/** A gallery is a file from anywhere — only a well-formed rotation is trusted. */
function isQuat(q: unknown): q is Quat {
  return Array.isArray(q) && q.length === 4 && q.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Artworks keep a readable extension so the zip is legible outside the app. */
function extForImage(mime: string, name: string): string {
  if (/\.[^.]+$/.test(name)) return '';
  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/tiff': '.tif',
  };
  return known[mime] ?? '.jpg';
}

/** fflate hands back views into a larger buffer; IndexedDB needs a standalone copy. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
    ? (u8.buffer as ArrayBuffer)
    : (u8.slice().buffer as ArrayBuffer);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}