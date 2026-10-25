import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3, type Mesh } from 'three';
import { useViewer, type SlotId } from '../store';
import { DRAG_DEG_PER_PX } from './presets';
import { grabTargets } from './grab';

/** Dragged positions land on half-centimetres, so a placement reads back as a clean number. */
const snap = (cm: number) => Math.round(cm * 2) / 2;

type Drag =
  | { mode: 'move'; slot: SlotId; pointerId: number; plane: Plane; start: Vector3; xCm: number; gapCm: number }
  | { mode: 'turn'; slot: SlotId; pointerId: number; startX: number; startDeg: number };

/** A press that travels less than this many pixels is a click, not a drag. */
const CLICK_PX = 5;

/**
 * Take hold of an object — or its pedestal, or its base — and slide it across the floor.
 * Shift-drag turns the object instead. Dragging anywhere else orbits the camera.
 *
 * Moving is behind a confirmation, so a staged pedestal is never shifted by a stray drag.
 * Clicking a stand selects it and asks "Move pedestal?" (Stand draws the outline and the
 * prompt); only once that is confirmed does dragging it move it. Until then a press on it
 * is left to OrbitControls like any other, so sweeping the camera across a pedestal is
 * just an orbit. A click on empty space locks it again.
 *
 * The object and everything under it move together, in translation only: the pedestal
 * never turns, so it stays square to the sheet wherever it is put. Moving out from the
 * sheet is the gap, the single most important number for how the reflection reads, so
 * pulling an object forward visibly softens its reflection as it goes.
 *
 * The press is claimed in the *capture* phase on window, which runs before any listener
 * on the canvas — OrbitControls' included. A press that lands on an object is stopped
 * there, so the camera never starts moving; one that misses is left alone and orbits as
 * usual. That is sturdier than asking OrbitControls to stand down mid-gesture, which it
 * only does once it has already taken the pointer. (Lifted from the Pair Viewer.)
 *
 * The drag runs on a horizontal plane at the height the object was grabbed, so the point
 * under the cursor stays under the cursor from any camera angle.
 */
export function DragMove() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const canvas = gl.domElement;
    const app = canvas.closest('.app');
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const point = new Vector3();

    let drag: Drag | null = null;
    /** A press that is not ours yet — it becomes a click (ask, or lock) if it barely moves. */
    let press: { slot: SlotId | null; pointerId: number; x: number; y: number } | null = null;

    const aim = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
    };

    /** Which slot, if any, is under the pointer — nearest first — and where it was hit. */
    const hit = (e: PointerEvent): { slot: SlotId; at: Vector3 } | null => {
      aim(e);
      const [first] = raycaster.intersectObjects([...grabTargets.keys()], false);
      if (!first) return null;
      const slot = grabTargets.get(first.object as Mesh);
      return slot ? { slot, at: first.point.clone() } : null;
    };

    const setCursor = (c: string) => {
      canvas.style.cursor = c;
    };

    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas || e.button !== 0) return;
      const found = hit(e);
      const s = useViewer.getState();

      // Not a confirmed stand, and not a turn: leave the press to the camera, and see on
      // release whether it was a click.
      if (!found || (!e.shiftKey && s.moveUnlocked !== found.slot)) {
        press = { slot: found?.slot ?? null, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        return;
      }

      // Ours. OrbitControls and R3F's own handlers never see this press.
      e.stopPropagation();
      e.preventDefault();

      s.setActive(found.slot);
      const slot = s.slots[found.slot];

      drag = e.shiftKey
        ? { mode: 'turn', slot: found.slot, pointerId: e.pointerId, startX: e.clientX, startDeg: slot.nudgeDeg }
        : {
            mode: 'move',
            slot: found.slot,
            pointerId: e.pointerId,
            plane: new Plane(new Vector3(0, 1, 0), -found.at.y),
            start: found.at,
            xCm: slot.xCm,
            gapCm: slot.gapCm,
          };
      app?.classList.add('is-dragging');
      setCursor('grabbing');
    };

    const onMove = (e: PointerEvent) => {
      if (drag) {
        if (e.pointerId !== drag.pointerId) return;
        e.stopPropagation();
        const s = useViewer.getState();
        if (drag.mode === 'turn') {
          const deg = drag.startDeg + (e.clientX - drag.startX) * DRAG_DEG_PER_PX;
          s.updateSlot(drag.slot, { nudgeDeg: Math.round(deg * 10) / 10 });
          return;
        }
        aim(e);
        // Near the horizon the plane is hit very far away, or not at all; the store's
        // clamps keep the object in the room either way.
        if (!raycaster.ray.intersectPlane(drag.plane, point)) return;
        s.moveSlotTo(
          drag.slot,
          snap(drag.xCm + (point.x - drag.start.x) * 100),
          snap(drag.gapCm + (point.z - drag.start.z) * 100),
        );
        return;
      }
      // Hover: a confirmed stand can be taken hold of; any other is clickable. Only when no
      // button is down, so an orbit sweeping across an object does not flicker the cursor.
      if (e.buttons === 0 && e.target === canvas) {
        const over = hit(e);
        setCursor(!over ? '' : useViewer.getState().moveUnlocked === over.slot ? 'grab' : 'pointer');
      }
    };

    const onUp = (e: PointerEvent) => {
      if (press && e.pointerId === press.pointerId) {
        const still = Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_PX;
        const s = useViewer.getState();
        if (still && press.slot) s.askMove(press.slot);
        else if (still && (s.moveAsk || s.moveUnlocked)) s.lockMove();
        press = null;
        return;
      }
      if (!drag || e.pointerId !== drag.pointerId) return;
      e.stopPropagation();
      drag = null;
      app?.classList.remove('is-dragging');
      setCursor('grab');
    };

    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onUp, opts);
    return () => {
      window.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onUp, opts);
      app?.classList.remove('is-dragging');
      setCursor('');
    };
  }, [gl, camera]);

  return null;
}
