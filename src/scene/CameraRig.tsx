import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { useViewer } from '../store';
import { CAMERA_PRESETS, FOCUS_HEIGHT } from './presets';
import { rigOffset } from './rig';

/**
 * Seconds to blend between presets — the analogue of BlendTime on SetViewTargetWithBlend.
 * A short hop takes the minimum; the long way round the piece takes up to the maximum, so
 * a wide swing never whips past.
 */
const BLEND_MIN_SECONDS = 0.7;
const BLEND_MAX_SECONDS = 1.3;

/** Keeps the camera above the floor while still allowing the low presets to look upward. */
const MIN_POLAR = 0.2;
const MAX_POLAR = 1.85;

/**
 * The camera is fenced into the half-space in front of the sheet. Past about 100° the
 * acrylic turns edge-on and then away, the reflection stops being rendered at all, and
 * the orbit runs into the back wall — so free orbit stops just past the grazing preset
 * rather than letting the user drift somewhere with nothing to see.
 */
const MAX_AZIMUTH = 1.75;

const MIN_DISTANCE = 0.8;
const MAX_DISTANCE = 6;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Camera presets plus free orbit.
 *
 * C jumps to the next preset (the Unreal SetViewTargetWithBlend behaviour), and from
 * wherever it lands the user can click-drag to revolve. Dragging cancels an in-flight
 * blend so the camera never fights the mouse.
 *
 * While blending, OrbitControls is disabled and the camera is driven directly; letting
 * both run at once means OrbitControls recomputes position from its own spherical state
 * every frame and undoes the blend. On arrival, update() re-syncs its internal state to
 * the new position so orbiting continues smoothly from there.
 *
 * Orbiting matters more here than in the baseline viewer: the sheet's reflectance climbs
 * with viewing angle, so moving around the piece is what takes it from a readable print
 * with a ghost on it to a near-total mirror. The presets are stations along that arc.
 */
export function CameraRig() {
  const camIndex = useViewer((s) => s.camIndex);
  const camNonce = useViewer((s) => s.camNonce);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useRef<OrbitControlsImpl>(null);

  const blending = useRef(false);
  const t = useRef(0);
  const fromPos = useRef(new Vector3());
  const fromTarget = useRef(new Vector3());
  const fromFov = useRef(28);
  const toPos = useRef(new Vector3());
  const toTarget = useRef(new Vector3());
  const toFov = useRef(28);
  const scratch = useRef(new Vector3());
  /** Where the camera sits relative to what it looks at, at each end of the blend. */
  const fromArc = useRef(new Spherical());
  const toArc = useRef(new Spherical());
  const arc = useRef(new Spherical());
  const duration = useRef(BLEND_MIN_SECONDS);

  useEffect(() => {
    const n = CAMERA_PRESETS.length;
    const preset = CAMERA_PRESETS[((camIndex % n) + n) % n];

    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls.current?.target ?? new Vector3(0, FOCUS_HEIGHT, 0));
    fromFov.current = camera.fov;

    // Presets are authored around the default object position. They follow the objects
    // when a preset is chosen — not continuously, so dragging an object never drags the
    // camera with it.
    const [ox, oy, oz] = rigOffset(useViewer.getState());
    toPos.current.set(...preset.position).add(scratch.current.set(ox, oy, oz));
    toTarget.current.set(...preset.target).add(scratch.current);
    toFov.current = preset.fov;

    // Blend round the subject, not across it: interpolate the camera's angle and distance
    // about its target. A straight line between two views on opposite sides cuts in front
    // of the piece, or through it; an arc keeps it framed the whole way round.
    fromArc.current.setFromVector3(scratch.current.subVectors(fromPos.current, fromTarget.current));
    toArc.current.setFromVector3(scratch.current.subVectors(toPos.current, toTarget.current));
    // The short way round, in case a free orbit left the angle past ±180°.
    let dTheta = toArc.current.theta - fromArc.current.theta;
    dTheta = MathUtils.euclideanModulo(dTheta + Math.PI, Math.PI * 2) - Math.PI;
    toArc.current.theta = fromArc.current.theta + dTheta;
    duration.current = MathUtils.lerp(
      BLEND_MIN_SECONDS,
      BLEND_MAX_SECONDS,
      Math.min(1, Math.abs(dTheta) / Math.PI),
    );

    t.current = 0;
    blending.current = true;
    if (controls.current) controls.current.enabled = false;
  }, [camIndex, camNonce, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!blending.current || !c) return;

    t.current = Math.min(1, t.current + dt / duration.current);
    const e = easeInOutCubic(t.current);

    scratch.current.lerpVectors(fromTarget.current, toTarget.current, e);
    const a = arc.current;
    a.radius = MathUtils.lerp(fromArc.current.radius, toArc.current.radius, e);
    a.phi = MathUtils.lerp(fromArc.current.phi, toArc.current.phi, e);
    a.theta = MathUtils.lerp(fromArc.current.theta, toArc.current.theta, e);
    camera.position.setFromSpherical(a).add(scratch.current);
    c.target.copy(scratch.current);
    camera.lookAt(scratch.current);

    const fov = fromFov.current + (toFov.current - fromFov.current) * e;
    if (Math.abs(camera.fov - fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (t.current >= 1) {
      blending.current = false;
      c.enabled = true;
      c.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={CAMERA_PRESETS[0].target}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.6}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      minAzimuthAngle={-MAX_AZIMUTH}
      maxAzimuthAngle={MAX_AZIMUTH}
      // Taking hold of the camera cancels the blend rather than fighting it.
      onStart={() => {
        blending.current = false;
      }}
    />
  );
}
