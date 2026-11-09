import { Box3, Matrix4, Object3D, Quaternion, Vector3, type BufferGeometry, type Mesh } from 'three';
import type { Quat } from '../library/db';

/**
 * The upright correction a curator sets in the Orientation window, for scans exported
 * face-down or on their side by someone without Blender to hand.
 *
 * It is stored on the library object, not on a slot or a setup: a scan that is the wrong
 * way up is wrong in every pairing, so it is fixed once. Turning it to face the sheet,
 * R, Shift-drag and the Stage panel's Turn all still act on top of it.
 */

export const IDENTITY: Quat = [0, 0, 0, 1];

export const toQuaternion = (q: Quat | undefined) =>
  q ? new Quaternion(q[0], q[1], q[2], q[3]).normalize() : new Quaternion();

/** Rounded so a few 90° presses store clean values (0.7071…, 0, 1) rather than float drift. */
export const fromQuaternion = (q: Quaternion): Quat => {
  const r = (n: number) => {
    const v = Math.round(n * 1e6) / 1e6;
    return Object.is(v, -0) ? 0 : v;
  };
  // q and -q are the same rotation; keep w ≥ 0 so equal turns compare equal.
  const s = q.w < 0 ? -1 : 1;
  return [r(q.x * s), r(q.y * s), r(q.z * s), r(q.w * s)];
};

export const isIdentity = (q: Quat | undefined) =>
  !q || (Math.abs(q[0]) < 1e-6 && Math.abs(q[1]) < 1e-6 && Math.abs(q[2]) < 1e-6);

export type Axis = 'x' | 'y' | 'z';
const AXES: Record<Axis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/**
 * Turn about a *fixed* axis of the view — tip forward is always toward the viewer however
 * the object has already been turned. Composing in the object's own frame instead makes
 * the second press of a different button do something nobody expects.
 */
export function rotateWorld(q: Quat | undefined, axis: Axis, deg: number): Quat {
  const step = new Quaternion().setFromAxisAngle(AXES[axis], (deg * Math.PI) / 180);
  return fromQuaternion(step.multiply(toQuaternion(q)));
}

/**
 * Bounds of `model` once `q` is applied, in the frame of the group that holds the
 * orientation — vertex-exact, so a scan tipped to an odd angle still seats with its
 * lowest point on the pedestal rather than on a loose box corner.
 *
 * Works whether or not the model is already in a scene: it measures each mesh relative
 * to the model's own root, so whatever the root is parented under never leaks in.
 */
export function orientedBounds(model: Object3D, q: Quaternion): Box3 {
  const box = new Box3();
  model.updateWorldMatrix(true, true);
  const toRoot = new Matrix4().copy(model.matrixWorld).invert();
  // The root's own transform (FBX roots often carry one) belongs inside the correction.
  const outer = new Matrix4().makeRotationFromQuaternion(q).multiply(model.matrix);
  const m = new Matrix4();
  const v = new Vector3();

  model.traverse((o) => {
    const mesh = o as Mesh;
    const geom = mesh.geometry as BufferGeometry | undefined;
    if (!mesh.isMesh || !geom) return;
    const pos = geom.attributes.position;
    if (!pos) return;
    m.multiplyMatrices(toRoot, mesh.matrixWorld).premultiply(outer);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      box.expandByPoint(v);
    }
  });

  if (box.isEmpty()) box.set(new Vector3(-0.1, 0, -0.1), new Vector3(0.1, 0.2, 0.1));
  return box;
}

/** The correction as tip / turn / tilt degrees, for a readout only — storage is the quaternion. */
export function readoutDeg(q: Quat | undefined): { x: number; y: number; z: number } {
  const e = new Object3D();
  e.quaternion.copy(toQuaternion(q));
  e.rotation.reorder('YXZ');
  const d = (r: number) => {
    const v = Math.round((r * 180) / Math.PI);
    return v === -0 ? 0 : v;
  };
  return { x: d(e.rotation.x), y: d(e.rotation.y), z: d(e.rotation.z) };
}
