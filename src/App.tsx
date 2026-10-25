import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { Studio } from './scene/Studio';
import { Stand } from './scene/Pedestal';
import { DragMove } from './scene/DragMove';
import { Acrylic } from './scene/Acrylic';
import { Lighting } from './scene/Lighting';
import { Environment } from './scene/Environment';
import { CameraRig } from './scene/CameraRig';
import { ArtifactMesh } from './scene/ArtifactMesh';
import {
  CAMERA_PRESETS,
  ROTATION_STEP_DEG,
  ROTATION_STEPS,
  STUDIO_THEMES,
} from './scene/presets';
import {
  currentArtifact,
  currentArtwork,
  liveSlotIds,
  seatCm,
  useViewer,
  type SlotId,
} from './store';
import { StagePanel } from './ui/StagePanel';
import { Notice, RightRail } from './ui/RightRail';
import { Snapshot } from './scene/Snapshot';
import { useKeybinds } from './ui/keybinds';
import { cm } from './lib/units';
import { DropZone } from './import/DropZone';
import { GalleryPanel } from './library/GalleryPanel';
import { listArtifactMeta, listArtworkMeta } from './library/db';
import { seedLibraryOnce } from './library/seed';
import { applyStation, STATIONS } from './library/stations';
import { refreshSetups } from './library/setups';
import { useImportFiles } from './import/useImport';
import './App.css';

function Hud() {
  const camIndex = useViewer((s) => s.camIndex);
  const active = useViewer((s) => s.active);
  const twoUp = useViewer((s) => s.twoUp);
  const slot = useViewer((s) => s.slots[s.active]);
  const plinth = useViewer((s) => s.plinth);
  const station = useViewer((s) => s.station);
  const setupName = useViewer((s) => s.setups.find((x) => x.id === s.setupId)?.name);
  const panel = useViewer((s) => s.panel);
  const reflectance = useViewer((s) => s.reflectance);
  const polish = useViewer((s) => s.polish);
  const print = useViewer((s) => s.print);
  const showHelp = useViewer((s) => s.showHelp);
  const showHud = useViewer((s) => s.showHud);
  const toggleHud = useViewer((s) => s.toggleHud);
  const frontLightOn = useViewer((s) => s.lights.front?.on ?? false);
  const artifacts = useViewer((s) => s.artifacts);
  const artworks = useViewer((s) => s.artworks);
  const artIndex = useViewer((s) => s.artIndex);
  const meta = useViewer(currentArtifact);
  const art = useViewer(currentArtwork);

  const n = CAMERA_PRESETS.length;
  const preset = CAMERA_PRESETS[((camIndex % n) + n) % n];

  const { pedestal, pedestalVisible, base, baseOn, objectIndex, rotationStep } = slot;
  // rotationStep is unbounded (and can go negative), so wrap it for display only.
  const rotationIndex = ((rotationStep % ROTATION_STEPS) + ROTATION_STEPS) % ROTATION_STEPS;
  const rotationDeg = Math.round((rotationIndex * ROTATION_STEP_DEG + slot.nudgeDeg) * 10) / 10;
  const box = (b: { heightCm: number; widthCm: number; lengthCm: number }) =>
    `${b.widthCm} × ${b.lengthCm} × ${b.heightCm} cm`;

  return (
    <>
      <div className={`hud${showHud ? '' : ' is-closed'}`}>
        {/* The camera readout doubles as the collapse control, as in the Pair Viewer:
            reduced, this chip is all that is left in the corner. */}
        <button
          type="button"
          className="hud-tab"
          onClick={toggleHud}
          aria-expanded={showHud}
          title={showHud ? 'Reduce scene readout' : 'Show scene readout'}
        >
          <span className="hud-cam-index">
            {String((((camIndex % n) + n) % n) + 1).padStart(2, '0')}
          </span>
          <span className="hud-cam-name">{preset.name}</span>
          {showHud && <span className="hud-cam-total">of {n}</span>}
          <span className="hud-chevron">{showHud ? '×' : '▴'}</span>
        </button>

        {showHud && (
          <div className="hud-body">

        {setupName ? (
          <div className="hud-row">
            <span className="hud-key">Setup</span>
            {setupName}
          </div>
        ) : (
          station && (
            <div className="hud-row">
              <span className="hud-key">Station</span>
              {station}
            </div>
          )
        )}

        {artifacts.length > 0 && (
          <div className="hud-row">
            <span className="hud-key">{twoUp ? `Object ${active}` : 'Object'}</span>
            {meta ? (
              <>
                {meta.name} <span className="dim">({objectIndex + 1}/{artifacts.length})</span>
              </>
            ) : (
              <span className="dim">empty pedestal — O to fill</span>
            )}
          </div>
        )}

        <div className="hud-row">
          <span className="hud-key">Print</span>
          {art ? (
            <>
              {art.name}{' '}
              <span className="dim">({artIndex + 1}/{artworks.length})</span>
            </>
          ) : (
            <span className="dim">
              {artworks.length ? 'bare sheet — A to print' : 'none — drop an image in'}
            </span>
          )}
        </div>

        <div className="hud-sep" />

        <div className="hud-row">
          <span className="hud-key">Sheet</span>
          {panel.heightCm !== null && `${panel.heightCm} × `}
          {panel.widthCm} cm wide <span className="dim">· {panel.bottomCm} cm up</span>
        </div>
        <div className="hud-row">
          <span className="hud-key">Gap</span>
          {slot.gapCm} cm <span className="dim">object to sheet · {slot.xCm} cm along</span>
        </div>
        <div className="hud-row">
          <span className="hud-key">Reflectance</span>
          {reflectance.toFixed(2)}{' '}
          <span className="dim">head-on · {polishLabel(polish)}</span>
        </div>
        <div className="hud-row">
          <span className="hud-key">Print level</span>
          {print.toFixed(1)}×
        </div>

        <div className="hud-sep" />

        <div className="hud-row">
          <span className="hud-key">Pedestal</span>
          {pedestalVisible ? box(pedestal) : <span className="dim">hidden — V to show</span>}
        </div>
        {baseOn && (
          <div className="hud-row">
            <span className="hud-key">Base</span>
            {box(base)}
          </div>
        )}
        {plinth.on && (
          <div className="hud-row">
            <span className="hud-key">Plinth</span>
            {plinth.heightCm} cm
          </div>
        )}
        <div className="hud-row">
          <span className="hud-key">Rotation</span>
          {rotationDeg}° <span className="dim">· step {rotationIndex + 1}/{ROTATION_STEPS}</span>
        </div>
        <div className="hud-row">
          <span className="hud-key">Scale</span>
          {slot.scale.toFixed(2)}×
          {meta?.heightCm ? <span className="dim"> · {meta.heightCm} cm true height</span> : null}
        </div>
        {frontLightOn && (
          <div className="hud-row">
            <span className="hud-key">Front light</span>
            on
          </div>
        )}
        <div className="hud-hint">Tab for controls</div>
          </div>
        )}
      </div>

      {showHelp && (
        <div className="help help-wide">
          <h2>Controls</h2>
          <div className="help-cols">
            <div>
              <h3>Object</h3>
              <ul>
                <li><b>C</b> switch camera view <span className="dim">(Shift+C back)</span></li>
                <li><b>O</b> cycle object <span className="dim">(Shift+O back)</span></li>
                <li>
                  <b>R</b> rotate {ROTATION_STEP_DEG}° <span className="dim">(Shift+R to undo)</span>
                </li>
                <li><b>P</b> object scale <span className="dim">(Shift+P to undo)</span></li>
                <li><b>H</b> pedestal height <span className="dim">(Shift+H to undo)</span></li>
                <li><b>K</b> pedestal width <span className="dim">(Shift+K to undo)</span></li>
                <li><b>L</b> pedestal length <span className="dim">(Shift+L to undo)</span></li>
                <li><b>V</b> show / hide pedestal</li>
                <li><b>E</b> base on the pedestal on / off</li>
              </ul>
              <h3>Two objects</h3>
              <ul>
                <li><b>T</b> second object on / off</li>
                <li><b>1</b> / <b>2</b> which object the keys move</li>
                <li>
                  <b>Click</b> a pedestal → <b>Move</b>, then drag it{' '}
                  <span className="dim">(Esc or Done locks it)</span>
                </li>
                <li><b>Shift-drag</b> an object to turn it</li>
                <li><b>Arrows</b> nudge 1 cm, once confirmed <span className="dim">(Shift 10 cm)</span></li>
              </ul>
            </div>
            <div>
              <h3>The acrylic</h3>
              <ul>
                <li><b>A</b> cycle print <span className="dim">(Shift+A back · includes bare)</span></li>
                <li><b>G</b> gap, object to sheet <span className="dim">(Shift+G closer)</span></li>
                <li><b>N</b> sheet width <span className="dim">(Shift+N narrower)</span></li>
                <li><b>M</b> mount height <span className="dim">(Shift+M lower)</span></li>
                <li><b>Z</b> reflectance <span className="dim">(Shift+Z less mirror)</span></li>
                <li><b>U</b> surface finish <span className="dim">(Shift+U more polished)</span></li>
                <li><b>X</b> print brightness <span className="dim">(Shift+X dimmer)</span></li>
              </ul>
              <h3>Room</h3>
              <ul>
                <li><b>Y</b> plinth on / off</li>
                <li><b>F</b> front light on / off</li>
                <li><b>Light</b> slider, right edge — five brightness steps</li>
                <li><b>I</b> save an image <span className="dim">(PNG, scene only — or the camera button)</span></li>
              </ul>
            </div>
          </div>
          <p className="dim">
            Click and drag to revolve · scroll to zoom. The sheet reflects more the further
            round you go — head-on it is mostly print, from the side it is mostly mirror.
          </p>
          <p className="dim">Drop a model to add an object · drop an image on its own to print it</p>
          <p className="dim">Stage — top left, typed cm and the BM42–49 stations · Gallery — top right</p>
          <p className="dim">Click + Tab to close</p>
        </div>
      )}
    </>
  );
}

/** The finish dial reads as a description, not a number — nobody thinks in blur radii. */
function polishLabel(polish: number): string {
  if (polish < 0.12) return 'mirror finish';
  if (polish < 0.3) return 'polished';
  if (polish < 0.55) return 'satin';
  if (polish < 0.8) return 'frosted';
  return 'heavily diffused';
}

/**
 * Grounding contact under the object. Stands in for the ambient occlusion Lumen resolves
 * for free — see PLAN.md Appendix A. It has to follow the object out from the sheet as
 * the gap changes, or the shadow stays behind while the object moves.
 */
function Grounding({ id }: { id: SlotId }) {
  const slot = useViewer((s) => s.slots[id]);
  const seat = cm(useViewer((s) => seatCm(s, s.slots[id])));
  const theme = useViewer((s) => s.studioTheme);

  // Goes away with the pedestal: a floating object has nothing to cast onto.
  if (!slot.pedestalVisible) return null;

  return (
    <ContactShadows
      position={[cm(slot.xCm), seat + 0.001, cm(slot.gapCm)]}
      scale={1.2}
      resolution={1024}
      blur={2.4}
      opacity={STUDIO_THEMES[theme].contactShadowOpacity}
      far={0.6}
    />
  );
}

/** Each room sets its own exposure — the white one sits a touch under 1 to keep the paint off pure white. */
function Exposure() {
  const gl = useThree((s) => s.gl);
  const exposure = STUDIO_THEMES[useViewer((s) => s.studioTheme)].exposure;
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

/** One stand, object and contact shadow per object in the scene. */
function Objects() {
  const ids = useViewer((s) => liveSlotIds(s).join(''));
  return (
    <>
      {(ids.split('') as SlotId[]).map((id) => (
        <group key={id}>
          <Stand id={id} />
          <ArtifactMesh id={id} />
          <Grounding id={id} />
        </group>
      ))}
    </>
  );
}

/** StrictMode runs the load effect twice in dev; the opening station is staged once. */
let openedOnStation = false;

export default function App() {
  useKeybinds();
  const theme = useViewer((s) => s.studioTheme);
  const showStage = useViewer((s) => s.showStage);
  const setArtifacts = useViewer((s) => s.setArtifacts);
  const setArtworks = useViewer((s) => s.setArtworks);
  const importFiles = useImportFiles();

  // Restore the library on load — objects and prints persist per machine, not per session.
  // A machine with the local pairing set gets it added once (seed.ts), and the first
  // station is staged so the app opens on a pairing rather than an empty sheet.
  useEffect(() => {
    void (async () => {
      setArtifacts(await listArtifactMeta());
      setArtworks(await listArtworkMeta());
      void refreshSetups();
      if (!(await seedLibraryOnce(importFiles)) || openedOnStation) return;
      openedOnStation = true;
      setArtifacts(await listArtifactMeta());
      setArtworks(await listArtworkMeta());
      await applyStation(STATIONS[0], importFiles);
    })();
  }, [setArtifacts, setArtworks, importFiles]);

  const t = STUDIO_THEMES[theme];

  return (
    <div className={`app theme-${theme}${showStage ? ' stage-open' : ''}`}>
      <Canvas
        // Stated explicitly rather than `shadows`, which means PCFSoftShadowMap — three
        // 0.185 deprecated that and silently falls back to exactly this, warning on every
        // load. Naming it changes nothing about the render and takes the noise out of the
        // console, where the FBX and material warnings are worth actually reading.
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.05, far: 100, position: [1.45, 1.3, 2.05] }}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <color attach="background" args={[t.background]} />

        <Exposure />
        <Snapshot />
        <CameraRig />
        <Environment intensity={t.envIntensity} />
        <Lighting />
        <Studio />
        <Acrylic />
        <Objects />
        <DragMove />
      </Canvas>

      <Hud />
      <DropZone />
      {/* Always mounted — the tab is a permanent affordance and expands in place. */}
      <GalleryPanel />
      <StagePanel />
      <RightRail />
      <Notice />
    </div>
  );
}
