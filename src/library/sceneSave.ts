import { applySettings, captureSettings, useViewer } from '../store';
import type { SceneSettings } from './galleryFile';
import type { SetupRecord } from './db';
import { saveSetup } from './setups';

/**
 * The Save button (right edge, or Cmd/Ctrl+S). Asked for by Nikki, 2026-11-16: one press
 * that makes sure the scene as it stands — objects turned, moved, re-stood, the sheet, the
 * lights — is kept.
 *
 * It does two things:
 *
 * 1. **Remembers the scene for next time.** The whole staging is written to this browser's
 *    storage and put back when the app opens, instead of the app opening on its defaults.
 *    Objects and the print are recorded by library id, so they are found again even after
 *    the library has been reordered.
 *
 * 2. **Keeps the pairing as a saved setup.** If a setup is loaded, it is updated in place.
 *    Otherwise the setup that already pairs these objects with this print is updated, or a
 *    new one is made, named after them. Setups are the gallery's record of which objects go
 *    with which print and on what stands — pedestal, base, plinth, gap, turn — and they
 *    ride along in every gallery export (gallery.json), so a gallery carries its pairings.
 *
 * The orientation fix (J) is already kept on the library object itself the moment it is
 * saved there, and travels in the gallery with the object.
 */

const SCENE_KEY = 'reflection-scene-v1';

type StoredScene = { savedAt: number; settings: SceneSettings; setupId?: string | null };

/** Write the current scene to this browser's storage. Never throws — storage can be refused. */
export function rememberScene(): boolean {
  try {
    const record: StoredScene = {
      savedAt: Date.now(),
      settings: captureSettings(),
      setupId: useViewer.getState().setupId,
    };
    localStorage.setItem(SCENE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** The scene last saved in this browser, if any. */
function storedScene(): StoredScene | null {
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScene;
    return parsed && typeof parsed === 'object' && parsed.settings ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Put the last saved scene back. Call once the library is loaded — objects and the print
 * are found by id. Resolves true when there was one to restore.
 */
export function restoreScene(): boolean {
  const stored = storedScene();
  if (!stored) return false;
  applySettings(stored.settings);
  useViewer.setState({ setupId: stored.setupId ?? null });
  useViewer.getState().reframe();
  return true;
}

const nameOf = (id: string | null, list: { id: string; name: string }[]) =>
  id ? list.find((x) => x.id === id)?.name : undefined;

/** "BM45 — object", or the print and objects by name for a hand-staged scene. */
function pairingName(): string {
  const s = useViewer.getState();
  const settings = captureSettings();
  const ids = settings.objectIds ?? { A: null, B: null };
  const objects = [ids.A, s.twoUp ? ids.B : null]
    .map((id) => nameOf(id, s.artifacts))
    .filter(Boolean)
    .join(' + ');
  // A station already names its print; a hand-staged scene names it outright.
  if (s.station) return `${s.station} — ${objects || 'empty pedestal'}`;
  const print = nameOf(settings.artworkId ?? null, s.artworks);
  return [print, objects].filter(Boolean).join(' · ') || 'Untitled setup';
}

/** The setup that already holds this exact pairing — same print, same object(s). */
function matchingSetup(): SetupRecord | undefined {
  const s = useViewer.getState();
  const idAt = (i: number) => (i < 0 ? null : (s.artifacts[i]?.id ?? null));
  const A = idAt(s.slots.A.objectIndex);
  const B = s.twoUp ? idAt(s.slots.B.objectIndex) : null;
  const art = s.artIndex < 0 ? null : (s.artworks[s.artIndex]?.id ?? null);
  return s.setups.find(
    (x) =>
      x.artworkId === art &&
      x.objects.A === A &&
      (x.settings.twoUp ? x.objects.B : null) === B,
  );
}

/** The Save button. Resolves with what to tell the curator. */
export async function saveScene(): Promise<string> {
  const s = useViewer.getState();
  // Put a stand down if one was mid-move, so what is saved is what is shown.
  s.lockMove();

  const loaded = s.setups.find((x) => x.id === s.setupId);
  const target = loaded ?? matchingSetup();
  const record = await saveSetup(target?.name ?? pairingName(), target);
  const remembered = rememberScene();

  return remembered
    ? `Saved — “${record.name}”`
    : `Saved “${record.name}” — but this browser would not keep the scene for next time`;
}
