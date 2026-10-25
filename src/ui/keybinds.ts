import { useEffect } from 'react';
import { useViewer } from '../store';
import { PLACEMENT } from '../scene/presets';

/**
 * Matches the BP_KeyboardControls legend so muscle memory, any existing demo script, and
 * the baseline Artifact Viewer all carry over unchanged:
 *   C camera · O object · R rotate · P scale · H height · K width · L length · Tab help
 * Shift reverses the adjustment, exactly as the Unreal legend describes.
 *
 * V and F are additions the baseline viewer already made: hiding the pedestal and the
 * front light BP_PhotoViewerController defines but never
 * binds. They keep their meanings here.
 *
 * Everything else is new, and all of it is the acrylic sheet. The grouping is
 * deliberate — the sheet's *placement* keys sit under the fingers next to the pedestal
 * keys, and its *optical* keys sit together on the bottom row:
 *
 *   placement   G gap · N sheet width · M mount height
 *   optics      Z reflectance · U surface finish · X print brightness
 *   content     A cycle artwork
 *
 * A cycles through the loaded artworks *and* a bare-sheet slot, so one key both changes
 * the print and takes it off — there is no separate hide toggle to remember.
 *
 * The gallery is deliberately not bound to a key: it lives behind a permanent tab in the
 * corner so it is discoverable without knowing a shortcut.
 *
 * The BM38–49 install plan added a second object and the stand under it:
 *
 *   objects     T second object on/off · 1 / 2 which one the keys act on
 *   stand       E base (riser) on/off · Y plinth on/off
 *   placement   arrows move the active object 1 cm (Shift 10) — along the wall, and
 *               toward / away from the sheet
 *
 * Every per-object key (O R P H K L V G E, arrows) acts on the active object.
 */
export function useKeybinds() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const s = useViewer.getState();
      const dir = e.shiftKey ? -1 : 1;

      switch (e.code) {
        // ── Baseline viewer parity ──────────────────────────────────────────────
        case 'KeyC':
          e.shiftKey ? s.prevCam() : s.nextCam();
          break;
        case 'KeyO':
          s.stepObject(dir);
          break;
        case 'KeyV':
          s.togglePedestal();
          break;
        case 'KeyF':
          s.toggleLight('front');
          break;
        case 'KeyR':
          s.stepRotation(dir);
          break;
        case 'KeyP':
          s.adjustScale(dir);
          break;
        case 'KeyH':
          s.adjustPedestal('heightCm', dir);
          break;
        case 'KeyK':
          s.adjustPedestal('widthCm', dir);
          break;
        case 'KeyL':
          s.adjustPedestal('lengthCm', dir);
          break;

        // ── The acrylic sheet ───────────────────────────────────────────────────
        case 'KeyG':
          s.adjustGap(dir);
          break;
        case 'KeyN':
          s.adjustPanel('widthCm', dir);
          break;
        case 'KeyM':
          s.adjustPanel('bottomCm', dir);
          break;
        case 'KeyZ':
          s.adjustReflectance(dir);
          break;
        case 'KeyU':
          s.adjustPolish(dir);
          break;
        case 'KeyX':
          s.adjustPrint(dir);
          break;
        case 'KeyA':
          s.stepArt(dir);
          break;

        // ── Two objects and their stands ─────────────────────────────────────────
        case 'KeyT':
          s.toggleTwoUp();
          break;
        case 'Digit1':
          s.setActive('A');
          break;
        case 'Digit2':
          s.setActive('B');
          break;
        case 'KeyE':
          s.toggleBase();
          break;
        case 'KeyY':
          s.togglePlinth();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          // Same rule as dragging: a stand moves only once it has been confirmed.
          if (s.moveUnlocked !== s.active) {
            s.askMove(s.active);
            break;
          }
          const d = (e.shiftKey ? 10 : 1) * PLACEMENT.nudgeCm;
          // Up is away from the viewer, which from any front-side camera is toward the sheet.
          const dx = e.code === 'ArrowLeft' ? -d : e.code === 'ArrowRight' ? d : 0;
          const dz = e.code === 'ArrowUp' ? -d : e.code === 'ArrowDown' ? d : 0;
          s.nudgeActive(dx, dz);
          break;
        }

        case 'KeyI':
          // Snapshot — the capture itself runs inside the Canvas (scene/Snapshot.tsx).
          s.requestSnapshot();
          break;
        case 'Escape':
          s.lockMove();
          break;

        case 'Tab':
          e.preventDefault();
          s.toggleHelp();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
