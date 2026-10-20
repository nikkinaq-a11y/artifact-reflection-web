import { useEffect } from 'react';
import { useViewer } from '../store';

/**
 * Matches the BP_KeyboardControls legend so muscle memory, any existing demo script, and
 * the baseline Artifact Viewer all carry over unchanged:
 *   C camera · O object · R rotate · P scale · H height · K width · L length · Tab help
 * Shift reverses the adjustment, exactly as the Unreal legend describes.
 *
 * B, V and F are the additions the baseline viewer already made: background theme,
 * hiding the pedestal, and the front light BP_PhotoViewerController defines but never
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
 */
export function useKeybinds() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

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
        case 'KeyB':
          s.toggleStudioTheme();
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
          s.adjustPanel('gapCm', dir);
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
