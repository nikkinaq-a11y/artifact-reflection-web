import { useViewer } from '../store';
import { cm } from '../lib/units';
import { STUDIO_THEMES } from './presets';
import { useObjectZ } from './panelGeometry';

/**
 * BP_AdjustablePedestal: WidthCm / LengthCm / HeightCm, driven by H / K / L (+Shift).
 * Dimensions live in centimetres in the store to stay directly comparable with the
 * Blueprint's exposed values.
 *
 * It stands in front of the acrylic at the gap distance, so G moves it too — and the
 * sheet reflects it, which is why the themes keep it barely lighter than the floor.
 */
export function Pedestal() {
  const { widthCm, lengthCm, heightCm } = useViewer((s) => s.pedestal);
  const theme = useViewer((s) => s.studioTheme);
  const visible = useViewer((s) => s.pedestalVisible);
  const z = useObjectZ();

  const w = cm(widthCm);
  const l = cm(lengthCm);
  const h = cm(heightCm);

  // Hidden rather than unmounted: the object stays seated at the pedestal's height, so
  // toggling leaves it floating in place instead of dropping it to the floor.
  return (
    <mesh visible={visible} castShadow={visible} receiveShadow={visible} position={[0, h / 2, z]}>
      <boxGeometry args={[w, h, l]} />
      {/* Dielectric specular does not scale with albedo, so a near-black plinth still
          throws a broad bright lobe off its top face — and every camera preset here sits
          at an angle that catches it, unlike the baseline viewer's head-on default. Left
          alone it reads as a pale grey box in a dark room, and the sheet reflects that
          straight into the artwork.

          Roughness alone does not fix it; it spreads the lobe without removing energy.
          specularIntensity does, and it is the honest knob: a museum plinth is finished
          in a deep matte that absorbs rather than returns, which is exactly a dielectric
          with its F0 pulled well below the 0.04 default. */}
      <meshPhysicalMaterial
        color={STUDIO_THEMES[theme].pedestal}
        roughness={0.96}
        metalness={0}
        specularIntensity={0.2}
      />
    </mesh>
  );
}

/** Pedestal top height in metres — where the object is seated. */
export function usePedestalTop() {
  return cm(useViewer((s) => s.pedestal.heightCm));
}
