import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  Vector3,
  type Group,
  type WebGLRenderer,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useViewer, type SlotId } from '../store';
import { updateArtifactMeta, type ArtifactMeta, type Quat } from '../library/db';
import { ensureModel } from '../library/models';
import { saveFile } from '../lib/saveFile';
import { cm } from '../lib/units';
import { Environment } from '../scene/Environment';
import { BASE_DEFAULTS, PEDESTAL_DEFAULTS, STUDIO_THEMES } from '../scene/presets';
import {
  IDENTITY,
  isIdentity,
  orientedBounds,
  readoutDeg,
  rotateWorld,
  toQuaternion,
  type Axis,
} from '../scene/orient';

/**
 * The Orientation window (J, or "Orientation…" in the Stage panel and the gallery).
 *
 * For scans that arrive face-down or on their side: big 90° buttons fix almost every bad
 * export without knowing anything about axes, with 15° and 1° for the rest. Save as
 * default writes the correction to the library object, so it holds in every pairing and
 * travels in gallery zips; the original file is never rewritten.
 *
 * It is also a small product-shot studio: the object on a plain floor or on its pedestal,
 * a room, white or transparent background, four set views, and a screenshot button —
 * the canvas keeps its drawing buffer so a capture is just a read of what is on screen.
 */

/** Longest axis of an object with no known real size, metres — matches the scene's auto-fit. */
const TARGET_LONGEST = 0.45;

type Stand = 'floor' | 'pedestal';
type Backdrop = 'room' | 'white' | 'transparent';
type View = 'Front' | 'Three-quarter' | 'Side' | 'Top';
const VIEWS: View[] = ['Front', 'Three-quarter', 'Side', 'Top'];

const BACKDROPS: Record<Exclude<Backdrop, 'transparent'>, { background: string; floor: string }> = {
  room: { background: STUDIO_THEMES.white.background, floor: STUDIO_THEMES.white.floor },
  // A seamless sweep: floor and background a hair apart so the horizon disappears.
  white: { background: '#f3f1ed', floor: '#efece7' },
};

const unsafe = /[\\/:*?"<>|]+/g;
const pad = (n: number) => String(n).padStart(2, '0');

export function OrientDialog() {
  const orienting = useViewer((s) => s.orienting);
  const meta = useViewer((s) => s.artifacts.find((a) => a.id === s.orienting?.artifactId));
  if (!orienting || !meta) return null;
  return <OrientWindow key={meta.id} meta={meta} slot={orienting.slot} />;
}

function OrientWindow({ meta, slot }: { meta: ArtifactMeta; slot: SlotId | null }) {
  const close = useViewer((s) => s.closeOrient);
  const setNotice = useViewer((s) => s.setNotice);
  const patchArtifactMeta = useViewer((s) => s.patchArtifactMeta);
  const updateSlot = useViewer((s) => s.updateSlot);
  const slotState = useViewer((s) => (slot ? s.slots[slot] : null));

  const saved = meta.orientation ?? IDENTITY;
  const [q, setQ] = useState<Quat>(saved);
  const [step, setStep] = useState<90 | 15 | 1>(90);
  const [stand, setStand] = useState<Stand>(
    // Starts as the scene has it, so Save never moves an object off its pedestal unasked.
    !slotState || slotState.onFloor ? 'floor' : 'pedestal',
  );
  const [backdrop, setBackdrop] = useState<Backdrop>('room');
  const [view, setView] = useState<{ name: View; nonce: number }>({ name: 'Front', nonce: 0 });
  const [model, setModel] = useState<Group | null>(null);
  const [failed, setFailed] = useState(false);
  const glRef = useRef<WebGLRenderer | null>(null);

  // A clone: the cached model may be standing in the main scene, and a scene graph can
  // have only one parent. Clones share geometry and textures, so this costs nodes only.
  useEffect(() => {
    let live = true;
    void ensureModel(meta.id).then((g) => {
      if (!live) return;
      if (g) setModel(g.clone());
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [meta.id]);

  const turn = (axis: Axis, sign: 1 | -1) => setQ((cur) => rotateWorld(cur, axis, sign * step));

  const screenshot = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;
    const d = new Date();
    const stamp =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const where = stand === 'floor' ? 'on floor' : 'on pedestal';
    const filename = `${meta.name} - ${where} - ${view.name} - ${stamp}.png`.replace(unsafe, '-');
    gl.domElement.toBlob((blob) => {
      if (!blob) {
        setNotice('Screenshot failed — the preview could not be read.');
        return;
      }
      void saveFile(blob, filename).then(
        (ok) => setNotice(ok ? `Screenshot saved — ${filename}` : 'Screenshot not saved.'),
        () => setNotice('Screenshot could not be saved.'),
      );
    }, 'image/png');
  }, [meta.name, stand, view.name, setNotice]);

  const save = () => {
    const orientation = isIdentity(q) ? undefined : q;
    patchArtifactMeta(meta.id, { orientation });
    void updateArtifactMeta(meta.id, { orientation });
    if (slot) updateSlot(slot, { onFloor: stand === 'floor' });
    setNotice(`Orientation saved for ${meta.name}.`);
    close();
  };

  // This window owns the keyboard while it is open; the scene's keys are switched off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.code === 'KeyI') screenshot();
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const deg = readoutDeg(q);
  const changed = q.join(',') !== saved.join(',');
  const bd = backdrop === 'transparent' ? null : BACKDROPS[backdrop];

  return (
    <div className="orient" role="dialog" aria-modal="true" aria-label={`Orientation — ${meta.name}`}>
      <div className="orient-card">
        <div className={`orient-view${backdrop === 'transparent' ? ' is-transparent' : ''}`}>
          <Canvas
            shadows={{ type: PCFShadowMap }}
            dpr={[1, 2]}
            camera={{ fov: 30, near: 0.01, far: 50, position: [0, 1.2, 2.4] }}
            // Kept, unlike the main scene's: this canvas draws once per frame, and keeping
            // the buffer makes a screenshot a plain read of what is on screen.
            gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: ACESFilmicToneMapping }}
            onCreated={({ gl }) => {
              glRef.current = gl;
              gl.toneMappingExposure = STUDIO_THEMES.white.exposure;
            }}
          >
            {bd && <color attach="background" args={[bd.background]} />}
            <Environment intensity={0.45} />
            <hemisphereLight args={['#ffffff', '#8a857c', 0.35]} />
            {model && (
              <Preview
                model={model}
                q={q}
                meta={meta}
                stand={stand}
                floorColor={bd?.floor ?? null}
                pedestal={slotState?.pedestal ?? PEDESTAL_DEFAULTS}
                base={slotState?.baseOn ? slotState.base : null}
                view={view}
              />
            )}
          </Canvas>
          {!model && (
            <div className="orient-loading">{failed ? 'This object could not be loaded.' : 'Loading…'}</div>
          )}
          <div className="orient-views">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                className={view.name === v ? 'is-on' : undefined}
                onClick={() => setView((cur) => ({ name: v, nonce: cur.nonce + 1 }))}
              >
                {v}
              </button>
            ))}
          </div>
          <button type="button" className="orient-shot" onClick={screenshot} title="Save this view as a PNG (I)">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="12" cy="13.3" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Screenshot
          </button>
        </div>

        <aside className="orient-side">
          <header>
            <h3>Orientation</h3>
            <p className="orient-name" title={meta.name}>{meta.name}</p>
            <button type="button" className="orient-close" onClick={close} aria-label="Close">×</button>
          </header>

          <section>
            <h4>Turn the object upright</h4>
            <p className="orient-help">
              Front view shows the side that faces the acrylic — the side you see in the reflection.
            </p>
            <div className="gallery-seg orient-seg" role="radiogroup" aria-label="Rotate by">
              {([90, 15, 1] as const).map((n) => (
                <button key={n} type="button" className={step === n ? 'is-on' : undefined} onClick={() => setStep(n)}>
                  {n}°
                </button>
              ))}
            </div>
            <div className="orient-rows">
              <span>Tip</span>
              <button type="button" className="stage-btn" onClick={() => turn('x', -1)} title="Top tips away from you">
                ↑ Away
              </button>
              <button type="button" className="stage-btn" onClick={() => turn('x', 1)} title="Top tips toward you">
                ↓ Toward
              </button>
              <span>Lean</span>
              <button type="button" className="stage-btn" onClick={() => turn('z', 1)} title="Top leans to the left">
                ↶ Left
              </button>
              <button type="button" className="stage-btn" onClick={() => turn('z', -1)} title="Top leans to the right">
                ↷ Right
              </button>
              <span>Spin</span>
              <button type="button" className="stage-btn" onClick={() => turn('y', 1)} title="Spin anticlockwise, seen from above">
                ↺ Left
              </button>
              <button type="button" className="stage-btn" onClick={() => turn('y', -1)} title="Spin clockwise, seen from above">
                ↻ Right
              </button>
            </div>
            <p className="orient-readout">
              tip {deg.x}° · spin {deg.y}° · lean {deg.z}°
            </p>
            <div className="orient-pair">
              <button type="button" className="stage-btn" onClick={() => setQ(IDENTITY)} disabled={isIdentity(q)}>
                As imported
              </button>
              <button type="button" className="stage-btn" onClick={() => setQ(saved)} disabled={!changed}>
                Undo changes
              </button>
            </div>
          </section>

          <section>
            <h4>Stand on</h4>
            <div className="gallery-seg orient-seg">
              <button type="button" className={stand === 'floor' ? 'is-on' : undefined} onClick={() => setStand('floor')}>
                Floor
              </button>
              <button type="button" className={stand === 'pedestal' ? 'is-on' : undefined} onClick={() => setStand('pedestal')}>
                Pedestal
              </button>
            </div>
            {slot && (
              <p className="orient-help">Saving also stands object {slot} on the {stand} in the scene.</p>
            )}
          </section>

          <section>
            <h4>Background</h4>
            <div className="gallery-seg orient-seg">
              {(['room', 'white', 'transparent'] as const).map((b) => (
                <button key={b} type="button" className={backdrop === b ? 'is-on' : undefined} onClick={() => setBackdrop(b)}>
                  {b === 'room' ? 'Gallery' : b === 'white' ? 'White' : 'Clear'}
                </button>
              ))}
            </div>
            {backdrop === 'transparent' && (
              <p className="orient-help">Screenshots save as a PNG with a transparent background and a soft shadow.</p>
            )}
          </section>

          <footer>
            <button type="button" className="stage-btn" onClick={close}>
              Cancel
            </button>
            <button type="button" className="stage-btn is-primary" onClick={save}>
              Save as default
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function Preview({
  model,
  q,
  meta,
  stand,
  floorColor,
  pedestal,
  base,
  view,
}: {
  model: Group;
  q: Quat;
  meta: ArtifactMeta;
  stand: Stand;
  floorColor: string | null;
  pedestal: { widthCm: number; lengthCm: number; heightCm: number };
  base: { widthCm: number; lengthCm: number; heightCm: number } | null;
  view: { name: View; nonce: number };
}) {
  const orient = useRef<Group>(null);
  const quat = useMemo(() => toQuaternion(q), [q]);

  // Same measure as the scene: after the correction, so it seats on its new base.
  const { scale, offset, size } = useMemo(() => {
    const box = orientedBounds(model, quat);
    const sz = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const s = meta.heightCm ? cm(meta.heightCm) / (sz.y || 1) : TARGET_LONGEST / (Math.max(sz.x, sz.y, sz.z) || 1);
    return { scale: s, offset: new Vector3(-centre.x, -box.min.y, -centre.z), size: sz.multiplyScalar(s) };
  }, [model, quat, meta.heightCm]);

  useLayoutEffect(() => {
    orient.current?.quaternion.copy(quat);
  }, [quat]);

  const onPedestal = stand === 'pedestal';
  const pedH = onPedestal ? cm(pedestal.heightCm) : 0;
  const baseH = onPedestal && base ? cm(base.heightCm) : 0;
  const seat = pedH + baseH;

  return (
    <>
      <directionalLight
        position={[1.2, seat + 2.2, 1.8]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        // Scans cast from both faces (loadModel.ts); this keeps that off their lit side.
        shadow-normalBias={0.015}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={1.5}
        shadow-camera-bottom={-1.5}
      />
      <directionalLight position={[-1.6, seat + 1, 1.2]} intensity={0.6} />
      <directionalLight position={[0, seat + 1.2, -2]} intensity={0.5} />

      {floorColor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[12, 64]} />
          <meshStandardMaterial color={floorColor} roughness={0.7} />
        </mesh>
      )}

      {onPedestal && (
        <mesh position={[0, pedH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[cm(pedestal.widthCm), pedH, cm(pedestal.lengthCm)]} />
          <meshPhysicalMaterial color={STUDIO_THEMES.white.pedestal} roughness={0.96} specularIntensity={0.2} />
        </mesh>
      )}
      {onPedestal && base && (
        <mesh position={[0, pedH + baseH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[cm(base.widthCm || BASE_DEFAULTS.widthCm), baseH, cm(base.lengthCm || BASE_DEFAULTS.lengthCm)]} />
          <meshPhysicalMaterial color={STUDIO_THEMES.white.base} roughness={0.96} specularIntensity={0.2} />
        </mesh>
      )}

      <group position={[0, seat, 0]}>
        <group position={[offset.x * scale, offset.y * scale, offset.z * scale]} scale={scale}>
          <group ref={orient}>
            <primitive object={model} />
          </group>
        </group>
      </group>

      {/* Grounds the object where it stands, and is the only shadow on a clear background. */}
      <ContactShadows
        position={[0, seat + 0.001, 0]}
        scale={Math.max(size.x, size.z) * 3 + 0.3}
        resolution={1024}
        blur={2.2}
        opacity={floorColor ? 0.55 : 0.7}
        far={Math.max(size.y, 0.3)}
      />

      <ViewRig view={view} seat={seat} size={size} />
    </>
  );
}

/** Puts the camera on a set view, framed to the object, whenever a view is chosen or the stand changes. */
function ViewRig({ view, seat, size }: { view: { name: View; nonce: number }; seat: number; size: Vector3 }) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const h = size.y;
  const reach = Math.max(size.x, size.y, size.z, 0.05);

  useEffect(() => {
    const target = new Vector3(0, seat + h * 0.5, 0);
    // Far enough that the whole object fits a 30° lens, with room around it.
    const d = (reach * 0.5) / Math.tan((15 * Math.PI) / 180) * 1.5 + 0.1;
    const dir = {
      Front: new Vector3(0, 0.12, 1),
      'Three-quarter': new Vector3(0.7, 0.35, 0.7),
      Side: new Vector3(1, 0.12, 0),
      Top: new Vector3(0, 1, 0.0001),
    }[view.name].normalize();
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
    // Re-frame on a new view, a new stand height or a new size — not on every orbit.
  }, [view.nonce, view.name, seat, h, reach, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} minDistance={0.05} maxDistance={20} />;
}
