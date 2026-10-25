import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SupportedFormat, TextureFile } from '../import/loadModel';
import type { SceneSettings } from './galleryFile';

/**
 * The library lives entirely on the viewer's machine — no server, no accounts, works
 * offline. Original file bytes are stored rather than a converted mesh: it is lossless,
 * keeps the record re-openable by other tools, and avoids a conversion step that could
 * silently degrade a scan. The cost is storage, revisited if it bites.
 *
 * Two collections, because this setup has two kinds of thing in it: the objects that
 * stand in front of the sheet, and the artworks printed on it.
 */
export type ArtifactRecord = {
  id: string;
  name: string;
  format: SupportedFormat;
  bytes: ArrayBuffer;
  /** Sidecar images dropped with the model, for FBX that reference textures externally. */
  textures: TextureFile[];
  sizeBytes: number;
  addedAt: number;
  /** True when the model rendered without any colour map — surfaced in the gallery. */
  untextured: boolean;
  /** Per-artifact nudges so a badly-oriented scan is corrected once and stays corrected. */
  scaleMultiplier: number;
  yawOffsetDeg: number;
  /**
   * The object's real height, cm, when known — glTF is in metres by spec, so a scan's own
   * size is read at import, and the stage panel takes a catalogue height for the rest.
   * Absent means auto-fit to a display size.
   */
  heightCm?: number;
};

/** Metadata only — payloads are deliberately excluded so lists stay cheap. */
export type ArtifactMeta = Omit<ArtifactRecord, 'bytes' | 'textures'>;

/**
 * An image printed on the acrylic. Pixel dimensions are stored because the sheet is cut
 * to the artwork's aspect ratio, and the geometry is needed on the frame the app starts
 * on — long before the texture itself has finished decoding.
 */
export type ArtworkRecord = {
  id: string;
  name: string;
  /** MIME type, so the blob URL handed to TextureLoader is tagged correctly. */
  mime: string;
  bytes: ArrayBuffer;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  addedAt: number;
};

export type ArtworkMeta = Omit<ArtworkRecord, 'bytes'>;

/**
 * A saved arrangement — a station as the curator adjusted it, or anything staged by hand.
 * The scene settings are the same ones a gallery export carries. What stood where is kept
 * by library id, not position: the library is reordered whenever something is added or
 * removed, and a setup has to find the same scan and the same print afterwards.
 */
export type SetupRecord = {
  id: string;
  name: string;
  savedAt: number;
  settings: SceneSettings;
  objects: { A: string | null; B: string | null };
  artworkId: string | null;
};

interface ViewerDB extends DBSchema {
  artifacts: { key: string; value: ArtifactRecord };
  artworks: { key: string; value: ArtworkRecord };
  setups: { key: string; value: SetupRecord };
}

let dbPromise: Promise<IDBPDatabase<ViewerDB>> | null = null;

function db() {
  // Its own database, not a shared one: this app installs alongside the baseline viewer
  // and the two must not fight over the same records.
  dbPromise ??= openDB<ViewerDB>('artifact-reflection', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('artifacts', { keyPath: 'id' });
        database.createObjectStore('artworks', { keyPath: 'id' });
      }
      // v2: saved setups. Existing libraries keep their objects and prints untouched.
      if (oldVersion < 2) database.createObjectStore('setups', { keyPath: 'id' });
    },
    // Another tab running a newer build wants to upgrade; step aside rather than block it.
    // This tab's next database call reopens at whatever version is current.
    blocking(_current, _next, event) {
      (event.target as IDBDatabase).close();
      dbPromise = null;
    },
  });
  return dbPromise;
}

export async function putArtifact(record: ArtifactRecord): Promise<void> {
  await (await db()).put('artifacts', record);
}

export async function getArtifact(id: string): Promise<ArtifactRecord | undefined> {
  return (await db()).get('artifacts', id);
}

/** Change an artifact's metadata in place — its real height, or a yaw correction. */
export async function updateArtifactMeta(
  id: string,
  patch: Partial<Pick<ArtifactRecord, 'heightCm' | 'yawOffsetDeg' | 'scaleMultiplier' | 'name'>>,
): Promise<void> {
  const d = await db();
  const record = await d.get('artifacts', id);
  if (record) await d.put('artifacts', { ...record, ...patch });
}

export async function deleteArtifact(id: string): Promise<void> {
  await (await db()).delete('artifacts', id);
}

/** Full records including payloads — used by gallery export. */
export async function listArtifactRecords(): Promise<ArtifactRecord[]> {
  const all = await (await db()).getAll('artifacts');
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export async function clearArtifacts(): Promise<void> {
  await (await db()).clear('artifacts');
}

export async function listArtifactMeta(): Promise<ArtifactMeta[]> {
  const all = await (await db()).getAll('artifacts');
  return all
    .map(({ bytes: _bytes, textures: _textures, ...meta }) => meta)
    .sort((a, b) => a.addedAt - b.addedAt);
}
// ── Artworks ────────────────────────────────────────────────────────────────────

export async function putArtwork(record: ArtworkRecord): Promise<void> {
  await (await db()).put('artworks', record);
}

export async function getArtwork(id: string): Promise<ArtworkRecord | undefined> {
  return (await db()).get('artworks', id);
}

export async function deleteArtwork(id: string): Promise<void> {
  await (await db()).delete('artworks', id);
}

/** Full records including payloads — used by gallery export. */
export async function listArtworkRecords(): Promise<ArtworkRecord[]> {
  const all = await (await db()).getAll('artworks');
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export async function clearArtworks(): Promise<void> {
  await (await db()).clear('artworks');
}

export async function listArtworkMeta(): Promise<ArtworkMeta[]> {
  const all = await (await db()).getAll('artworks');
  return all
    .map(({ bytes: _bytes, ...meta }) => meta)
    .sort((a, b) => a.addedAt - b.addedAt);
}

export async function putSetup(record: SetupRecord): Promise<void> {
  await (await db()).put('setups', record);
}

export async function deleteSetup(id: string): Promise<void> {
  await (await db()).delete('setups', id);
}

/** Most recently saved first — the one just made is the one usually wanted next. */
export async function listSetups(): Promise<SetupRecord[]> {
  const all = await (await db()).getAll('setups');
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function clearSetups(): Promise<void> {
  await (await db()).clear('setups');
}
