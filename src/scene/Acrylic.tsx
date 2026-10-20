import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  DepthFormat,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  Texture,
  UnsignedShortType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { useViewer } from '../store';
import { ACRYLIC, PANEL_Z } from './presets';
import { usePanelGeometry } from './panelGeometry';
import { useArtTexture } from '../library/artworks';

/**
 * The dark acrylic sheet the object faces, and the reason this app exists.
 *
 * Three things happen on this surface, and the whole point is that they happen *at the
 * same time*, in the right order:
 *
 *   1. the artwork printed on the sheet,
 *   2. the sheet's own darkness absorbing most of it,
 *   3. the mirror reflection of the object laid over the top.
 *
 * A print sits in or behind the surface; the specular reflection happens at the surface,
 * in front of it. So the reflection *adds* over the artwork rather than hiding behind it,
 * and how much it adds depends on viewing angle. That is one equation:
 *
 *     out = print · (1 − F)  +  reflection · F,     F = Fresnel(view angle)
 *
 * Head-on, F is a few percent and the artwork dominates. At a raking angle F approaches
 * 1 and the sheet turns into a mirror. Walking around the piece is what makes it work,
 * which is why every camera preset is off-axis and why the reflection has to be a real
 * planar render rather than an environment map — it has to show *this* object, at *this*
 * distance, with correct parallax against the print behind it.
 */

/**
 * Cost control. The reflection pass renders the entire scene a second time, every frame,
 * from a mirrored camera — and the Museo scans run to millions of triangles. See
 * ACRYLIC.reflectionScale.
 */
function useReflectionTarget() {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  return useMemo(() => {
    const cap = ACRYLIC.maxReflectionPx;
    const scale = ACRYLIC.reflectionScale * dpr;
    const w = Math.min(cap, Math.max(256, Math.round(size.width * scale)));
    const h = Math.min(cap, Math.max(256, Math.round(size.height * scale)));

    const target = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      // Rendering into a target skips tone mapping and output encoding, so this holds
      // raw linear radiance. Half float keeps the highlights on a lit artifact from
      // clipping to white before they are composited and tone mapped below.
      type: HalfFloatType,
      depthBuffer: true,
    });
    target.texture.generateMipmaps = false;

    // The blur radius is driven by how far past the sheet each reflected surface sits,
    // so the pass has to keep its depth, not just use it for sorting. 16 bits is ample:
    // the oblique near plane puts the sheet itself at depth 0, so the values in play are
    // a narrow band near the bottom of the range rather than spread over the full scene.
    const depth = new DepthTexture(w, h);
    depth.format = DepthFormat;
    depth.type = UnsignedShortType;
    target.depthTexture = depth;

    return target;
  }, [size.width, size.height, dpr]);
}

const VERTEX = /* glsl */ `
  uniform mat4 textureMatrix;

  varying vec2 vUv;
  varying vec4 vReflectCoord;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    // textureMatrix already folds in the sheet's world matrix, so this takes the local
    // position — matching three's Reflector, which this pass is derived from.
    vReflectCoord = textureMatrix * vec4(position, 1.0);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tReflect;
  uniform sampler2D tReflectDepth;
  uniform sampler2D tArt;
  uniform bool uHasArt;

  uniform vec3 uAcrylic;
  uniform vec3 uReflectTint;
  uniform float uReflectance;
  uniform float uPrint;
  uniform float uTransmission;
  uniform float uEdgeGlow;
  uniform vec2 uBlur;
  uniform float uBlurDistance;
  uniform vec2 uArtScale;
  uniform vec2 uArtOffset;

  varying vec2 vUv;
  varying vec4 vReflectCoord;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  const int TAPS = 12;
  const float GOLDEN_ANGLE = 2.39996323;

  /**
   * Surface finish. A polished sheet returns a sharp reflection; a satin one scatters it.
   * Taps are laid out on a golden-angle spiral with sqrt radii, which distributes them
   * evenly by area instead of bunching them at the centre the way a plain ring does.
   *
   * The radius is passed in rather than read from uBlur, because it is no longer constant
   * across the sheet — see travelPastSheet below.
   */
  vec3 sampleReflection(vec2 uv, vec2 spread) {
    vec3 sum = texture2D(tReflect, uv).rgb;
    if (spread.x <= 0.00001) return sum;

    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float angle = fi * GOLDEN_ANGLE;
      float radius = sqrt((fi + 0.5) / float(TAPS));
      sum += texture2D(tReflect, uv + vec2(cos(angle), sin(angle)) * radius * spread).rgb;
    }
    return sum / float(TAPS + 1);
  }

  /**
   * Metres of reflected path between the sheet and whatever is being reflected — which is
   * what governs how sharp that reflection can be. A scratch on the sheet's own surface is
   * perfectly sharp; the far wall is a smear. Scatter accumulates over the distance the
   * ray travels, so the object reads sharper the closer it is brought to the acrylic.
   *
   * The reflection pass clips its near plane onto the sheet (see the oblique clip below),
   * so its depth buffer already measures distance *past the sheet* rather than distance
   * from the camera. With the near plane at the sheet, sitting L metres along this ray:
   *
   *     d = 1 - L / (L + t)   =>   t = d * L / (1 - d)
   *
   * L is the camera's own distance to this fragment, because the mirrored camera is the
   * real one reflected and is therefore exactly as far from the sheet. That makes t a real
   * distance in metres and independent of where the camera is standing — the reflection
   * does not change sharpness as you orbit or dolly, only as the object actually moves.
   *
   * (The exact form carries a f/(f-L) factor for the far plane; at f = 100 and L of a
   * couple of metres that is a 2% error on a quantity feeding a blur radius, so it is
   * dropped.)
   */
  float travelPastSheet(vec2 uv, float sheetDistance) {
    float d = texture2D(tReflectDepth, uv).x;
    return d * sheetDistance / max(1.0 - d, 0.0001);
  }

  void main() {
    // What is printed on the sheet. Outside the artwork's footprint the sheet is bare.
    vec3 print = uAcrylic;
    if (uHasArt) {
      vec2 artUv = (vUv - uArtOffset) / uArtScale;
      if (artUv.x >= 0.0 && artUv.x <= 1.0 && artUv.y >= 0.0 && artUv.y <= 1.0) {
        // Ink under a tinted substrate. Two things happen here and both matter:
        //
        // uTransmission is the sheet swallowing most of the print — without it the
        // artwork composites at full photographic brightness and buries the reflection.
        //
        // The sheet's own colour is added rather than replacing the print, so pure black
        // in the artwork leaves bare acrylic showing through, which is what a real print
        // on a dark ground does.
        print = uAcrylic + texture2D(tArt, artUv).rgb * uPrint * uTransmission;
      }
    }

    // Reflection, sampled projectively — the coordinates come from the mirrored camera's
    // own projection, so the reflected object lands where the geometry says it should.
    vec2 reflectUv = vReflectCoord.xy / vReflectCoord.w;

    // Cleared depth is 1, which sends travel to its ceiling — so the empty room behind the
    // object blurs out completely instead of coming back as a sharp edge. That is the
    // correct answer rather than a special case.
    float travel = travelPastSheet(reflectUv, length(cameraPosition - vWorldPos));
    vec2 spread = uBlur * clamp(travel / uBlurDistance, 0.0, 1.0);

    vec3 reflection = sampleReflection(reflectUv, spread) * uReflectTint;

    // Schlick. uReflectance is F0, the head-on value; the rest is the grazing-angle rise
    // that turns the sheet into a mirror as the camera swings around to the side.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(normalize(vWorldNormal), viewDir), 0.0, 1.0);
    float fresnel = uReflectance + (1.0 - uReflectance) * pow(1.0 - ndv, 5.0);

    vec3 color = print * (1.0 - fresnel) + reflection * fresnel;

    // A cut sheet catches light on its edges. Without this the acrylic has no silhouette
    // against a dark wall and reads as a floating image rather than an object.
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    color += uEdgeGlow * (1.0 - smoothstep(0.0, 0.004, edge));

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Acrylic() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const mesh = useRef<Mesh>(null);
  const target = useReflectionTarget();

  const { width, height, centreY } = usePanelGeometry();
  const art = useArtTexture();

  const reflectance = useViewer((s) => s.reflectance);
  const polish = useViewer((s) => s.polish);
  const print = useViewer((s) => s.print);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          tReflect: { value: null as Texture | null },
          tReflectDepth: { value: null as Texture | null },
          tArt: { value: null as Texture | null },
          uHasArt: { value: false },
          textureMatrix: { value: new Matrix4() },
          uAcrylic: { value: new Color(ACRYLIC.color) },
          uReflectTint: { value: new Color(ACRYLIC.reflectTint) },
          uReflectance: { value: ACRYLIC.reflectance },
          uPrint: { value: ACRYLIC.print },
          uTransmission: { value: ACRYLIC.transmission },
          uEdgeGlow: { value: ACRYLIC.edgeGlow },
          uBlur: { value: new Vector2() },
          uBlurDistance: { value: ACRYLIC.blurDistanceM },
          uArtScale: { value: new Vector2(1, 1) },
          uArtOffset: { value: new Vector2(0, 0) },
        },
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => target.dispose(), [target]);

  useEffect(() => {
    material.uniforms.tReflect.value = target.texture;
    material.uniforms.tReflectDepth.value = target.depthTexture;
  }, [material, target]);

  useEffect(() => {
    material.uniforms.tArt.value = art?.texture ?? null;
    material.uniforms.uHasArt.value = Boolean(art);

    // The sheet is cut to the artwork's aspect (see usePanelGeometry), so the print
    // normally fills it exactly. This still fits rather than stretches, because the
    // fallback sheet has no artwork to take its shape from and a mid-import frame can
    // land here with the old geometry and the new image.
    if (art) {
      const sheetAspect = width / height;
      const fit = art.aspect > sheetAspect ? [1, sheetAspect / art.aspect] : [art.aspect / sheetAspect, 1];
      material.uniforms.uArtScale.value.set(fit[0], fit[1]);
      material.uniforms.uArtOffset.value.set((1 - fit[0]) / 2, (1 - fit[1]) / 2);
    }
  }, [material, art, width, height]);

  useEffect(() => {
    material.uniforms.uReflectance.value = reflectance;
    material.uniforms.uPrint.value = print;

    // Blur is a radius in the reflection texture's UV space, so it has to be squashed by
    // the target's aspect or a "circular" scatter comes out as an ellipse.
    //
    // This is now the radius reached at ACRYLIC.blurDistanceM and beyond, not a flat blur
    // over the whole sheet: the finish sets how hard the sheet scatters, and distance sets
    // how much of that scattering has accumulated. A mirror finish stays sharp at every
    // distance, which is exactly what a mirror finish means.
    const radius = polish * ACRYLIC.maxBlurUv;
    const aspect = target.width / target.height;
    material.uniforms.uBlur.value.set(radius, radius * aspect);
  }, [material, reflectance, print, polish, target]);

  // ── Planar reflection pass ──────────────────────────────────────────────────────
  // Mirror the camera through the sheet's plane, render, and hand the result to the
  // shader with a projective texture matrix. Derived from three's Reflector, which is
  // not used directly because it owns its own material and this surface has to composite
  // the print underneath the reflection.
  //
  // Priority -1 runs this before R3F's own render without taking over the render loop —
  // only a *positive* priority does that.
  const rig = useMemo(
    () => ({
      virtualCamera: new PerspectiveCamera(),
      reflectorPlane: new Plane(),
      normal: new Vector3(),
      sheetWorldPos: new Vector3(),
      cameraWorldPos: new Vector3(),
      rotation: new Matrix4(),
      lookAtPosition: new Vector3(),
      view: new Vector3(),
      lookTarget: new Vector3(),
      clipPlane: new Vector4(),
      q: new Vector4(),
    }),
    [],
  );

  useFrame(() => {
    const sheet = mesh.current;
    if (!sheet) return;

    const {
      virtualCamera, reflectorPlane, normal, sheetWorldPos, cameraWorldPos,
      rotation, lookAtPosition, view, lookTarget, clipPlane, q,
    } = rig;

    // The main render updates world matrices, but that has not happened yet this frame,
    // so anything that moved would be mirrored from its previous position.
    sheet.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();

    sheetWorldPos.setFromMatrixPosition(sheet.matrixWorld);
    cameraWorldPos.setFromMatrixPosition(camera.matrixWorld);

    rotation.extractRotation(sheet.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotation);

    // Nothing to draw when the camera has swung behind the sheet.
    view.subVectors(sheetWorldPos, cameraWorldPos);
    if (view.dot(normal) > 0) return;

    view.reflect(normal).negate().add(sheetWorldPos);

    rotation.extractRotation(camera.matrixWorld);
    lookAtPosition.set(0, 0, -1).applyMatrix4(rotation).add(cameraWorldPos);
    lookTarget.subVectors(sheetWorldPos, lookAtPosition).reflect(normal).negate().add(sheetWorldPos);

    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    virtualCamera.lookAt(lookTarget);
    virtualCamera.far = (camera as PerspectiveCamera).far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy((camera as PerspectiveCamera).projectionMatrix);

    // Clip space -> [0,1] texture space, then the mirrored camera's view-projection, then
    // the sheet's own transform. The vertex shader applies this to the local position.
    material.uniforms.textureMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(virtualCamera.projectionMatrix)
      .multiply(virtualCamera.matrixWorldInverse)
      .multiply(sheet.matrixWorld);

    // Oblique near-plane clipping: push the near plane onto the sheet so the pedestal and
    // the object cannot leak in from behind the mirror and appear floating in the print.
    reflectorPlane
      .setFromNormalAndCoplanarPoint(normal, sheetWorldPos)
      .applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(
      reflectorPlane.normal.x,
      reflectorPlane.normal.y,
      reflectorPlane.normal.z,
      reflectorPlane.constant,
    );

    const p = virtualCamera.projectionMatrix.elements;
    q.set(
      (Math.sign(clipPlane.x) + p[8]) / p[0],
      (Math.sign(clipPlane.y) + p[9]) / p[5],
      -1,
      (1 + p[10]) / p[14],
    );
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    p[2] = clipPlane.x;
    p[6] = clipPlane.y;
    p[10] = clipPlane.z + 1 - 0.003;
    p[14] = clipPlane.w;

    // The sheet cannot be in its own reflection.
    sheet.visible = false;
    const previousTarget = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, virtualCamera);
    gl.setRenderTarget(previousTarget);
    sheet.visible = true;
  }, -1);

  return (
    <mesh ref={mesh} position={[0, centreY, PANEL_Z]} material={material}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}
