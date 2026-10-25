import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, MathUtils, Vector3 } from 'three';
import { seatCm, slotArtifact, useViewer, type SlotId } from '../store';
import { cm } from '../lib/units';
import { FACE_PANEL_YAW_DEG, ROTATION_STEP_DEG } from './presets';
import { ensureModel, getModel } from '../library/models';
import { grabRef } from './grab';

/** Longest axis of an object with no known real size, metres. Auto-fit normalises to this. */
const TARGET_LONGEST = 0.45;

/** How quickly the object settles into each 30° step. Higher is snappier. */
const STEP_SMOOTHING = 9;

/**
 * The object standing in one slot, in front of the acrylic sheet.
 *
 * It rests turned to face the sheet (FACE_PANEL_YAW_DEG), so the camera sees its back
 * and the reflection carries its front. Cycling R turns it in place from there, which
 * means six presses puts its front to the camera and its back into the print.
 *
 * Size comes from one of two places. An artifact with a real height (glTF scans are in
 * metres, and the stage panel lets a curator type the catalogue height) is drawn at that
 * height, so it stands at true scale against a print of known size — the whole point of
 * staging an install plan. Anything else is auto-fit: FBX files arrive in arbitrary
 * units, orientations and pivots, so they are normalised to a known display size. Either
 * way the model is centred on X/Z and seated with its lowest point on the pedestal top.
 */
export function ArtifactMesh({ id }: { id: SlotId }) {
  const spin = useRef<Group>(null);
  const fit = useRef<Group>(null);
  const handle = useMemo(() => grabRef(id), [id]);

  const meta = useViewer((s) => slotArtifact(s, id));
  const slot = useViewer((s) => s.slots[id]);
  const seat = cm(useViewer((s) => seatCm(s, s.slots[id])));

  // Models are cached outside React; this only tracks when one becomes available.
  const [, bump] = useState(0);
  const artifactId = meta?.id;

  useEffect(() => {
    if (!artifactId || getModel(artifactId)) return;
    let cancelled = false;
    void ensureModel(artifactId).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const cached = artifactId ? getModel(artifactId) : undefined;

  // A scene graph can only have one parent, and both slots may show the same scan. B
  // gets a clone, which shares geometry, materials and textures — it costs a few nodes.
  const model = useMemo(() => (cached && id === 'B' ? cached.clone() : cached), [cached, id]);

  const { scale, offset, size } = useMemo(() => {
    if (!model) return { scale: 1, offset: new Vector3(), size: new Vector3() };
    const box = new Box3().setFromObject(model);
    const sz = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const longest = Math.max(sz.x, sz.y, sz.z) || 1;
    const s = meta?.heightCm ? cm(meta.heightCm) / (sz.y || 1) : TARGET_LONGEST / longest;
    return {
      scale: s,
      // Centre on X/Z, and lift so the model's minimum Y lands at y=0 of the fit group.
      offset: new Vector3(-centre.x, -box.min.y, -centre.z),
      size: sz,
    };
  }, [model, meta?.heightCm]);

  useLayoutEffect(() => {
    if (!fit.current) return;
    fit.current.position.set(offset.x * scale, offset.y * scale, offset.z * scale);
    fit.current.scale.setScalar(scale);
  }, [offset, scale]);

  const yawDeg = FACE_PANEL_YAW_DEG + (meta?.yawOffsetDeg ?? 0) + slot.rotationStep * ROTATION_STEP_DEG + slot.nudgeDeg;

  // Ease toward the current step rather than snapping, so the movement reads as a
  // deliberate increment and it stays clear which way the object turned.
  useFrame((_, dt) => {
    if (!spin.current) return;
    const yaw = MathUtils.degToRad(yawDeg);
    const t = 1 - Math.exp(-STEP_SMOOTHING * dt);
    spin.current.rotation.y += (yaw - spin.current.rotation.y) * t;
  });

  if (!model) return null;

  const total = slot.scale * (meta?.scaleMultiplier ?? 1);
  // The handle is the object's footprint swept round a full turn, so it stays a good
  // target whichever way the object is facing.
  const reach = Math.max(size.x, size.z) * scale;
  const tall = size.y * scale;

  return (
    <group position={[cm(slot.xCm), seat, cm(slot.gapCm)]} scale={total}>
      <group ref={spin}>
        <group ref={fit}>
          <primitive object={model} />
        </group>
      </group>
      <mesh ref={handle} visible={false} position={[0, tall / 2, 0]}>
        <boxGeometry args={[reach, tall, reach]} />
      </mesh>
    </group>
  );
}
