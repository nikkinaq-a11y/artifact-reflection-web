import { useMemo } from 'react';
import { Edges, Html } from '@react-three/drei';
import { floorCm, useViewer, type SlotId } from '../store';
import { cm } from '../lib/units';
import { STUDIO_THEMES } from './presets';
import { usePlinthDepth, usePlinthSpan } from './panelGeometry';
import { grabRef } from './grab';

/**
 * Dielectric specular does not scale with albedo, so a near-black plinth still throws a
 * broad bright lobe off its top face — and every camera preset here sits at an angle
 * that catches it, unlike the baseline viewer's head-on default. Left alone it reads as
 * a pale grey box in a dark room, and the sheet reflects that straight into the artwork.
 *
 * Roughness alone does not fix it; it spreads the lobe without removing energy.
 * specularIntensity does, and it is the honest knob: a museum plinth is finished in a
 * deep matte that absorbs rather than returns, which is exactly a dielectric with its F0
 * pulled well below the 0.04 default.
 */
function MatteMaterial({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} roughness={0.96} metalness={0} specularIntensity={0.2} />;
}

/**
 * The selection outline: white, as asked, over a soft dark line so it still reads against
 * a white pedestal in the white room.
 */
function Outline() {
  return (
    <>
      <Edges lineWidth={5} color="#000000" transparent opacity={0.35} />
      <Edges lineWidth={2} color="#ffffff" />
    </>
  );
}

/** "Move pedestal?" — and once confirmed, a way to put it down again. */
function MovePrompt({ id, y, z }: { id: SlotId; y: number; z: number }) {
  const unlocked = useViewer((s) => s.moveUnlocked === id);
  const confirmMove = useViewer((s) => s.confirmMove);
  const lockMove = useViewer((s) => s.lockMove);
  const twoUp = useViewer((s) => s.twoUp);

  return (
    <Html position={[0, y, z]} center zIndexRange={[20, 10]}>
      <div className="move-prompt" onPointerDown={(e) => e.stopPropagation()}>
        {unlocked ? (
          <>
            <span>Drag to move{twoUp ? ` ${id}` : ''}</span>
            <button type="button" onClick={lockMove}>
              Done
            </button>
          </>
        ) : (
          <>
            <span>Move pedestal{twoUp ? ` ${id}` : ''}?</span>
            <button type="button" className="is-primary" onClick={confirmMove}>
              Move
            </button>
            <button type="button" onClick={lockMove}>
              Cancel
            </button>
          </>
        )}
      </div>
    </Html>
  );
}

/**
 * BP_AdjustablePedestal, one per slot, with the install plan's riser on top of it.
 * WidthCm / LengthCm / HeightCm are driven by H / K / L (+Shift) on the active slot.
 * Dimensions live in centimetres in the store to stay directly comparable with the
 * Blueprint's exposed values.
 *
 * The stand only ever translates. It has no rotation at all, so it is always square to
 * the sheet however the object on it is turned or wherever it is dragged.
 */
export function Stand({ id }: { id: SlotId }) {
  const slot = useViewer((s) => s.slots[id]);
  const floor = cm(useViewer(floorCm));
  const theme = STUDIO_THEMES[useViewer((s) => s.studioTheme)];
  const selected = useViewer((s) => s.moveAsk === id || s.moveUnlocked === id);
  const pedestalRef = useMemo(() => grabRef(id), [id]);
  const baseRef = useMemo(() => grabRef(id), [id]);

  const { pedestal: p, base: b, pedestalVisible, baseOn } = slot;
  const x = cm(slot.xCm);
  const z = cm(slot.gapCm);
  const h = cm(p.heightCm);

  // Hidden rather than unmounted: the object stays seated at the pedestal's height, so
  // toggling leaves it floating in place instead of dropping it to the floor.
  return (
    <group position={[x, floor, z]}>
      <mesh
        ref={pedestalRef}
        visible={pedestalVisible}
        castShadow={pedestalVisible}
        receiveShadow={pedestalVisible}
        position={[0, h / 2, 0]}
      >
        <boxGeometry args={[cm(p.widthCm), h, cm(p.lengthCm)]} />
        <MatteMaterial color={theme.pedestal} />
        {selected && <Outline />}
      </mesh>
      {baseOn && (
        <mesh ref={baseRef} castShadow receiveShadow position={[0, h + cm(b.heightCm) / 2, 0]}>
          <boxGeometry args={[cm(b.widthCm), cm(b.heightCm), cm(b.lengthCm)]} />
          <MatteMaterial color={theme.base} />
          {selected && <Outline />}
        </mesh>
      )}
      {/* Sits just in front of the pedestal's top front edge, below the object. */}
      {selected && <MovePrompt id={id} y={h - 0.06} z={cm(p.lengthCm) / 2 + 0.02} />}
    </group>
  );
}

/**
 * The floor platform along the wall — the grey band under every station in the install
 * plan. It runs the room's width, from the back wall out to just past the frontmost
 * pedestal, and lifts the stands and the sheet's mount height with it.
 */
export function Plinth({ roomWidth, backFaceZ }: { roomWidth: number; backFaceZ: number }) {
  const plinth = useViewer((s) => s.plinth);
  const color = STUDIO_THEMES[useViewer((s) => s.studioTheme)].plinth;
  const depth = usePlinthDepth() - backFaceZ;
  const span = usePlinthSpan();

  if (!plinth.on) return null;
  const h = cm(plinth.heightCm);
  // Never wider than the room it stands in.
  const left = Math.max(span.left, -roomWidth / 2);
  const right = Math.min(span.right, roomWidth / 2);

  return (
    <mesh receiveShadow castShadow position={[(left + right) / 2, h / 2, backFaceZ + depth / 2]}>
      <boxGeometry args={[right - left, h, depth]} />
      <MatteMaterial color={color} />
    </mesh>
  );
}
