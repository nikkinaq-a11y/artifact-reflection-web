import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, MathUtils, Vector3 } from 'three';
import { currentArtifact, useViewer } from '../store';
import { usePedestalTop } from './Pedestal';
import { useObjectZ } from './panelGeometry';
import { FACE_PANEL_YAW_DEG, ROTATION_STEP_DEG } from './presets';
import { ensureModel, getModel } from '../library/models';

/** Longest axis of the displayed object, metres. Auto-fit normalises every scan to this. */
const TARGET_LONGEST = 0.45;

/** How quickly the object settles into each 30° step. Higher is snappier. */
const STEP_SMOOTHING = 9;

/**
 * The object currently on the pedestal, standing in front of the acrylic sheet.
 *
 * It rests turned to face the sheet (FACE_PANEL_YAW_DEG), so the camera sees its back
 * and the reflection carries its front. Cycling R turns it in place from there, which
 * means six presses puts its front to the camera and its back into the print.
 *
 * Auto-fit is the load-bearing part: FBX files arrive in arbitrary units, orientations
 * and pivots, so every model is normalised to a known display size, centred on X/Z, and
 * seated with its lowest point on the pedestal top. Without it a dropped scan lands
 * kilometres wide or buried under the floor.
 */
export function ArtifactMesh() {
  const spin = useRef<Group>(null);
  const fit = useRef<Group>(null);

  const meta = useViewer(currentArtifact);
  const rotationStep = useViewer((s) => s.rotationStep);
  const objectScale = useViewer((s) => s.objectScale);
  const pedestalTop = usePedestalTop();
  const z = useObjectZ();

  // Models are cached outside React; this only tracks when one becomes available.
  const [, bump] = useState(0);
  const id = meta?.id;

  useEffect(() => {
    if (!id || getModel(id)) return;
    let cancelled = false;
    void ensureModel(id).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const model = id ? getModel(id) : undefined;

  const { scale, offset } = useMemo(() => {
    if (!model) return { scale: 1, offset: new Vector3() };
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const s = TARGET_LONGEST / longest;
    return {
      scale: s,
      // Centre on X/Z, and lift so the model's minimum Y lands at y=0 of the fit group.
      offset: new Vector3(-centre.x, -box.min.y, -centre.z),
    };
  }, [model]);

  useLayoutEffect(() => {
    if (!fit.current) return;
    fit.current.position.set(offset.x * scale, offset.y * scale, offset.z * scale);
    fit.current.scale.setScalar(scale);
  }, [offset, scale]);

  // Ease toward the current step rather than snapping, so the movement reads as a
  // deliberate increment and it stays clear which way the object turned.
  useFrame((_, dt) => {
    if (!spin.current) return;
    const yaw = MathUtils.degToRad(
      FACE_PANEL_YAW_DEG + (meta?.yawOffsetDeg ?? 0) + rotationStep * ROTATION_STEP_DEG,
    );
    const t = 1 - Math.exp(-STEP_SMOOTHING * dt);
    spin.current.rotation.y += (yaw - spin.current.rotation.y) * t;
  });

  if (!model) return null;

  return (
    <group
      position={[0, pedestalTop, z]}
      scale={objectScale * (meta?.scaleMultiplier ?? 1)}
    >
      <group ref={spin}>
        <group ref={fit}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}
