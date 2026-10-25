import { applySettings, captureSettings, useViewer, type SlotId } from '../store';
import { deleteSetup, listSetups, putSetup, type SetupRecord } from './db';

/**
 * Saved setups: any arrangement — a station as adjusted, or something staged by hand —
 * kept under a name in this browser's library, and carried in gallery exports.
 *
 * The scene itself is the same SceneSettings a gallery export writes. What stood on each
 * pedestal and what was on the sheet are recorded by library id, because positions in the
 * library shift as things are added and removed.
 */

export async function refreshSetups(): Promise<void> {
  useViewer.setState({ setups: await listSetups() });
}

/** Save the current scene. With `overwrite`, replaces that setup in place, keeping its name unless a new one is given. */
export async function saveSetup(name: string, overwrite?: SetupRecord): Promise<SetupRecord> {
  const s = useViewer.getState();
  const idAt = (i: number) => (i < 0 ? null : (s.artifacts[i]?.id ?? null));
  const record: SetupRecord = {
    id: overwrite?.id ?? crypto.randomUUID(),
    name: name.trim() || overwrite?.name || 'Untitled setup',
    savedAt: Date.now(),
    settings: captureSettings(),
    objects: { A: idAt(s.slots.A.objectIndex), B: idAt(s.slots.B.objectIndex) },
    artworkId: s.artIndex < 0 ? null : (s.artworks[s.artIndex]?.id ?? null),
  };
  await putSetup(record);
  useViewer.setState({ setupId: record.id });
  await refreshSetups();
  return record;
}

/**
 * Restore a setup. Resolves with anything it could not find — an object or print removed
 * from the library since it was saved — so the caller can say so; the rest still loads.
 */
export function loadSetup(record: SetupRecord): string[] {
  const missing: string[] = [];
  applySettings(record.settings);

  const s = useViewer.getState();
  const indexOf = (id: string | null, slot: SlotId) => {
    if (!id) return -1;
    const i = s.artifacts.findIndex((a) => a.id === id);
    if (i < 0) missing.push(`object ${slot} is no longer in the library`);
    return i;
  };
  const artIndex = record.artworkId ? s.artworks.findIndex((a) => a.id === record.artworkId) : -1;
  if (record.artworkId && artIndex < 0) missing.push('the print is no longer in the library');

  useViewer.setState((st) => ({
    slots: {
      A: { ...st.slots.A, objectIndex: indexOf(record.objects.A, 'A') },
      B: { ...st.slots.B, objectIndex: indexOf(record.objects.B, 'B') },
    },
    artIndex,
    setupId: record.id,
    moveAsk: null,
    moveUnlocked: null,
  }));
  useViewer.getState().reframe();
  return missing;
}

export async function removeSetup(id: string): Promise<void> {
  await deleteSetup(id);
  if (useViewer.getState().setupId === id) useViewer.setState({ setupId: null });
  await refreshSetups();
}
