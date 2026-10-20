import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Image-based lighting. Without an environment, anything with metalness > 0 has nothing
 * to reflect and renders black — which is also why the gold Quimbaya pieces are the hard
 * case for this whole approach (PLAN.md Appendix A).
 *
 * RoomEnvironment is generated procedurally, so this needs no network access and the app
 * still works fully offline.
 *
 * PHASE 0 HANDOFF: replace this with a cubemap rendered from the actual Unreal studio so
 * reflections match the real room. Swap the source here; nothing else changes.
 */
export function Environment({ intensity = 0.3 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);

    scene.environment = env.texture;
    scene.environmentIntensity = intensity;

    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}