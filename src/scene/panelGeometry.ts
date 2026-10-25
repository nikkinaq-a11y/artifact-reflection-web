import { useViewer, currentArtwork, floorCm, liveSlotIds } from '../store';
import { cm } from '../lib/units';
import { PANEL_DEFAULTS, PLINTH_DEFAULTS } from './presets';

/**
 * The sheet's real dimensions.
 *
 * By default height is not a control. A sheet is cut to the piece printed on it, so the
 * artwork's aspect ratio decides it and the curator sets only the width — which is how a
 * print is actually ordered. With no artwork loaded it falls back to a plausible shape so
 * there is still a sheet to compose against.
 *
 * A station pins the height as well, because the install plan specifies the glass as
 * H × W and some sheets are a detail cut from a larger painting. The print is then
 * cropped to fill the sheet (see Acrylic.tsx).
 *
 * This reads from the artwork *metadata*, not the decoded texture, so the geometry is
 * correct on the first frame instead of popping when the image finishes decoding.
 *
 * The mount height measures from the plinth's top when there is one, as the install
 * plan's elevations do.
 */
export function usePanelGeometry() {
  const { widthCm, heightCm, bottomCm } = useViewer((s) => s.panel);
  const floor = cm(useViewer(floorCm));
  const art = useViewer(currentArtwork);

  const artAspect = art ? art.widthPx / art.heightPx : PANEL_DEFAULTS.FALLBACK_ASPECT;

  const width = cm(widthCm);
  const height = heightCm === null ? width / artAspect : cm(heightCm);
  const bottom = floor + cm(bottomCm);

  return {
    width,
    height,
    aspect: width / height,
    artAspect,
    bottom,
    top: bottom + height,
    centreY: bottom + height / 2,
  };
}

/**
 * The floor platform's extent along the wall, metres: everything that stands on it — each
 * pedestal and the sheet above it — plus a margin either side. A rectangle sized to the
 * station, not a band down the whole wall; it follows the pedestals as they move.
 */
export function usePlinthSpan(): { left: number; right: number } {
  const left = useViewer((s) => {
    let x = -s.panel.widthCm / 2;
    for (const id of liveSlotIds(s)) x = Math.min(x, s.slots[id].xCm - s.slots[id].pedestal.widthCm / 2);
    return cm(x - PLINTH_DEFAULTS.sideMarginCm);
  });
  const right = useViewer((s) => {
    let x = s.panel.widthCm / 2;
    for (const id of liveSlotIds(s)) x = Math.max(x, s.slots[id].xCm + s.slots[id].pedestal.widthCm / 2);
    return cm(x + PLINTH_DEFAULTS.sideMarginCm);
  });
  return { left, right };
}

/** The floor platform's depth: just past the frontmost pedestal's front face, metres. */
export function usePlinthDepth() {
  return useViewer((s) => {
    let reach = 0;
    for (const id of liveSlotIds(s)) {
      const slot = s.slots[id];
      reach = Math.max(reach, slot.gapCm + slot.pedestal.lengthCm / 2);
    }
    return cm(Math.max(PLINTH_DEFAULTS.minDepthCm, reach + PLINTH_DEFAULTS.frontMarginCm));
  });
}
