import type { Mesh } from 'three';
import type { SlotId } from '../store';

/**
 * Everything DragMove hit-tests against, and which slot it belongs to: each pedestal,
 * each base, and an invisible box around each object. A box around the object rather
 * than the scan itself: raycasting a multi-million-triangle mesh on every pointer move is
 * slow, and a box is also far easier to grab on a thin object like a mask on a stand.
 */
export const grabTargets = new Map<Mesh, SlotId>();

/** A ref callback that registers a mesh as a handle for a slot while it is mounted. */
export const grabRef = (slot: SlotId) => {
  let current: Mesh | null = null;
  return (m: Mesh | null) => {
    if (current) grabTargets.delete(current);
    current = m;
    if (m) grabTargets.set(m, slot);
  };
};
