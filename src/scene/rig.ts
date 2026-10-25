import { liveSlotIds, seatCm, useViewer } from '../store';
import { cm } from '../lib/units';
import { RIG_ORIGIN, SUBJECT_LIFT_M } from './presets';

type State = ReturnType<typeof useViewer.getState>;

/**
 * How far the subject has moved from where the lights and camera presets were authored
 * (RIG_ORIGIN), metres. The subject is the middle of whichever objects are in the scene,
 * at their seat height plus the lift that puts RIG_ORIGIN at the default object's mass.
 * Zero in the default scene, so nothing about the original single-object setup changes.
 */
export function rigOffset(s: State): [number, number, number] {
  const ids = liveSlotIds(s);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const id of ids) {
    const slot = s.slots[id];
    x += cm(slot.xCm);
    y += cm(seatCm(s, slot)) + SUBJECT_LIFT_M;
    z += cm(slot.gapCm);
  }
  const n = ids.length;
  return [x / n - RIG_ORIGIN[0], y / n - RIG_ORIGIN[1], z / n - RIG_ORIGIN[2]];
}

/** The offset as a live subscription, for things that should follow the objects as they move. */
export function useRigOffset(): [number, number, number] {
  const x = useViewer((s) => rigOffset(s)[0]);
  const y = useViewer((s) => rigOffset(s)[1]);
  const z = useViewer((s) => rigOffset(s)[2]);
  return [x, y, z];
}
