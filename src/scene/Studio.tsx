import { useViewer } from '../store';
import { PANEL_Z, STUDIO_THEMES } from './presets';
import { Plinth } from './Pedestal';

/**
 * The room from BP_RoomRig / the Cube..Cube5 wall actors.
 *
 * Two things differ from the baseline viewer. The back wall sits immediately behind the
 * acrylic rather than metres away, because the sheet is mounted on it and any gap shows
 * as a dark band around the edges. And the room only extends *forward* of the sheet: the
 * mirrored camera renders from behind the plane looking out, so anything modelled behind
 * it is geometry nobody will ever see, paid for twice a frame.
 */
const ROOM = {
  width: 8,
  height: 4.5,
  /** How far the room runs out in front of the sheet. */
  depth: 7,
  thickness: 0.1,
  /** Clearance between the back wall's face and the sheet's face. */
  standoff: 0.08,
};

export function Studio() {
  const theme = useViewer((s) => s.studioTheme);
  const { wall: wallColor, floor: floorColor, floorRoughness } = STUDIO_THEMES[theme];

  const { width, height, depth, thickness, standoff } = ROOM;

  // Back wall face sits behind the sheet; everything else is measured off that.
  const backFaceZ = PANEL_Z - standoff;
  const floorCentreZ = backFaceZ + depth / 2;

  return (
    <group>
      {/* Floor */}
      <mesh receiveShadow position={[0, -thickness / 2, floorCentreZ]}>
        <boxGeometry args={[width, thickness, depth]} />
        <meshStandardMaterial color={floorColor} roughness={floorRoughness} metalness={0} />
      </mesh>

      {/* Back wall — what the acrylic is mounted on, and the surround the print sits in */}
      <mesh receiveShadow position={[0, height / 2, backFaceZ - thickness / 2]}>
        <boxGeometry args={[width, height, thickness]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} metalness={0} />
      </mesh>

      {/* Side walls */}
      <mesh receiveShadow position={[-width / 2, height / 2, floorCentreZ]}>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[width / 2, height / 2, floorCentreZ]}>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} metalness={0} />
      </mesh>

      <Plinth roomWidth={width - thickness} backFaceZ={backFaceZ} />
    </group>
  );
}
