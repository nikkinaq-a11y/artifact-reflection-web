import { useViewer, currentArtwork } from '../store';
import { cm } from '../lib/units';
import { PANEL_DEFAULTS } from './presets';

/**
 * The sheet's real dimensions, derived rather than stored.
 *
 * Height is not a control. A sheet is cut to the piece printed on it, so the artwork's
 * aspect ratio decides it and the curator sets only the width — which is how a print is
 * actually ordered. With no artwork loaded it falls back to a plausible shape so there is
 * still a sheet to compose against.
 *
 * This reads from the artwork *metadata*, not the decoded texture, so the geometry is
 * correct on the first frame instead of popping when the image finishes decoding.
 */
export function usePanelGeometry() {
  const { widthCm, bottomCm, gapCm } = useViewer((s) => s.panel);
  const art = useViewer(currentArtwork);

  const aspect = art ? art.widthPx / art.heightPx : PANEL_DEFAULTS.FALLBACK_ASPECT;

  const width = cm(widthCm);
  const height = width / aspect;
  const bottom = cm(bottomCm);

  return {
    width,
    height,
    aspect,
    bottom,
    top: bottom + height,
    centreY: bottom + height / 2,
    /** Distance from the sheet's face to the centre of the pedestal, metres. */
    gap: cm(gapCm),
  };
}

/** Where the pedestal and object stand: in front of the sheet, on the camera's side. */
export function useObjectZ() {
  return cm(useViewer((s) => s.panel.gapCm));
}
