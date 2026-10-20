import { useEffect, useMemo, useRef } from 'react';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Object3D, RectAreaLight, SpotLight } from 'three';
import { useViewer } from '../store';
import { LIGHT_PRESETS } from './presets';

/**
 * Mirrors the UE RectLight rig. RectAreaLight is three.js's analogue of Unreal's
 * RectLight, but it renders black unless the LTC lookup textures are initialised once
 * before any rect light is created.
 */
RectAreaLightUniformsLib.init();

/** Where the shadow-casting spot sits and aims — roughly co-located with the key. */
const SHADOW_SPOT = { position: [1.35, 2.2, 1.6] as const, aimAt: [0, 1.1, 0.4] as const };

export function Lighting() {
  const lights = useViewer((s) => s.lights);
  const spot = useRef<SpotLight>(null);
  const spotTarget = useRef<Object3D>(null);

  // A spotLight aims at its `target` object, which must itself be in the scene graph.
  useEffect(() => {
    if (spot.current && spotTarget.current) spot.current.target = spotTarget.current;
  }, []);

  // Rect lights are not JSX-declarative-friendly for target aiming, so build them once
  // and mutate intensity/visibility on state change.
  const objects = useMemo(
    () =>
      LIGHT_PRESETS.map((p) => {
        const l = new RectAreaLight(p.color, p.intensity, p.width, p.height);
        l.position.set(...p.position);

        // RectAreaLight emits along its local -Z, which is exactly where Object3D.lookAt
        // points, so aiming and orienting are the same operation. A preset can still
        // carry an explicit Euler, which is how a captured Unreal transform drops in.
        if (p.rotation) l.rotation.set(...p.rotation);
        else l.lookAt(...p.aimAt);

        return { preset: p, light: l };
      }),
    [],
  );

  useEffect(() => {
    for (const { preset, light } of objects) {
      const s = lights[preset.id];
      light.visible = s.on;
      light.intensity = s.intensity;
    }
  }, [lights, objects]);

  const keyOn = lights.key?.on ?? true;

  return (
    <>
      {objects.map(({ preset, light }) => (
        <primitive key={preset.id} object={light} />
      ))}

      {/* three.js RectAreaLight cannot cast shadows, so the soft studio shaping and the
          shadowing are split across two lights: the rect rig above does the look, and
          this spot — roughly co-located with the key — does the cast shadow. In Unreal a
          single RectLight does both via Virtual Shadow Maps.

          It is placed on the camera side so the object's shadow falls back toward the
          sheet. The shadow lands on the floor and the back wall but not on the acrylic
          itself: that surface runs a custom shader that composites print and reflection
          and does not sample the shadow map. A shadow across a mirror would be wrong
          anyway — what the sheet shows is the reflection, and the reflection is lit. */}
      <object3D ref={spotTarget} position={[...SHADOW_SPOT.aimAt]} />
      <spotLight
        ref={spot}
        position={[...SHADOW_SPOT.position]}
        angle={0.32}
        penumbra={0.9}
        decay={2}
        distance={12}
        intensity={keyOn ? 24 : 0}
        color="#fff4e8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />

      {/* Very low ambient stands in for the floor/wall inter-reflection Lumen provides.
          Kept near-black: the sheet reflects the room, so ambient that lifts the walls
          also lifts the reflection and washes the print out from behind. */}
      <ambientLight intensity={0.03} color="#8090a8" />
    </>
  );
}
