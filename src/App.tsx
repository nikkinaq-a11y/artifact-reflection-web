import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { Studio } from './scene/Studio';
import { Pedestal } from './scene/Pedestal';
import { Acrylic } from './scene/Acrylic';
import { Lighting } from './scene/Lighting';
import { Environment } from './scene/Environment';
import { CameraRig } from './scene/CameraRig';
import { ArtifactMesh } from './scene/ArtifactMesh';
import { useObjectZ } from './scene/panelGeometry';
import {
  CAMERA_PRESETS,
  ROTATION_STEP_DEG,
  ROTATION_STEPS,
  STUDIO_THEMES,
} from './scene/presets';
import { currentArtifact, currentArtwork, useViewer } from './store';
import { useKeybinds } from './ui/keybinds';
import { cm } from './lib/units';
import { DropZone } from './import/DropZone';
import { GalleryPanel } from './library/GalleryPanel';
import { listArtifactMeta, listArtworkMeta } from './library/db';
import { seedLibraryOnce } from './library/seed';
import { useImportFiles } from './import/useImport';
import './App.css';

function Hud() {
  const camIndex = useViewer((s) => s.camIndex);
  const pedestal = useViewer((s) => s.pedestal);
  const panel = useViewer((s) => s.panel);
  const reflectance = useViewer((s) => s.reflectance);
  const polish = useViewer((s) => s.polish);
  const print = useViewer((s) => s.print);
  const rotationStep = useViewer((s) => s.rotationStep);
  const objectScale = useViewer((s) => s.objectScale);
  const showHelp = useViewer((s) => s.showHelp);
  const pedestalVisible = useViewer((s) => s.pedestalVisible);
  const frontLightOn = useViewer((s) => s.lights.front?.on ?? false);
  const artifacts = useViewer((s) => s.artifacts);
  const artworks = useViewer((s) => s.artworks);
  const objectIndex = useViewer((s) => s.objectIndex);
  const artIndex = useViewer((s) => s.artIndex);
  const meta = useViewer(currentArtifact);
  const art = useViewer(currentArtwork);

  const n = CAMERA_PRESETS.length;
  const preset = CAMERA_PRESETS[((camIndex % n) + n) % n];

  // rotationStep is unbounded (and can go negative), so wrap it for display only.
  const rotationIndex = ((rotationStep % ROTATION_STEPS) + ROTATION_STEPS) % ROTATION_STEPS;
  const rotationDeg = rotationIndex * ROTATION_STEP_DEG;

  return (
    <>
      <div className="hud">
        <div className="hud-cam">
          <span className="hud-cam-index">
            {String((((camIndex % n) + n) % n) + 1).padStart(2, '0')}
          </span>
          <span className="hud-cam-name">{preset.name}</span>
          <span className="hud-cam-total">of {n}</span>
        </div>

        {artifacts.length > 0 && (
          <div className="hud-row">
            <span className="hud-key">Object</span>
            {meta?.name}{' '}
            <span className="dim">({objectIndex + 1}/{artifacts.length})</span>
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
          {panel.widthCm} cm wide <span className="dim">· {panel.bottomCm} cm up</span>
        </div>
        <div className="hud-row">
          <span className="hud-key">Gap</span>
          {panel.gapCm} cm <span className="dim">object to sheet</span>
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
          {pedestalVisible ? (
            `${pedestal.widthCm} × ${pedestal.lengthCm} × ${pedestal.heightCm} cm`
          ) : (
            <span className="dim">hidden — V to show</span>
          )}
        </div>
        <div className="hud-row">
          <span className="hud-key">Rotation</span>
          {rotationDeg}° <span className="dim">· step {rotationIndex + 1}/{ROTATION_STEPS}</span>
        </div>
        <div className="hud-row">
          <span className="hud-key">Scale</span>
          {objectScale.toFixed(2)}×
        </div>
        {frontLightOn && (
          <div className="hud-row">
            <span className="hud-key">Front light</span>
            on
          </div>
        )}
        <div className="hud-hint">Tab for controls</div>
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
                <li><b>B</b> background — void / gallery / reveal</li>
                <li><b>F</b> front light on / off</li>
              </ul>
            </div>
          </div>
          <p className="dim">
            Click and drag to revolve · scroll to zoom. The sheet reflects more the further
            round you go — head-on it is mostly print, from the side it is mostly mirror.
          </p>
          <p className="dim">Drop a model to add an object · drop an image on its own to print it</p>
          <p className="dim">Gallery — top right corner · Click + Tab to close</p>
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
function Grounding() {
  const pedestalTop = cm(useViewer((s) => s.pedestal.heightCm));
  const pedestalVisible = useViewer((s) => s.pedestalVisible);
  const theme = useViewer((s) => s.studioTheme);
  const z = useObjectZ();

  // Goes away with the pedestal: a floating object has nothing to cast onto.
  if (!pedestalVisible) return null;

  return (
    <ContactShadows
      position={[0, pedestalTop + 0.001, z]}
      scale={1.2}
      resolution={1024}
      blur={2.4}
      opacity={STUDIO_THEMES[theme].contactShadowOpacity}
      far={0.6}
    />
  );
}

export default function App() {
  useKeybinds();
  const theme = useViewer((s) => s.studioTheme);
  const setArtifacts = useViewer((s) => s.setArtifacts);
  const setArtworks = useViewer((s) => s.setArtworks);
  const selectObject = useViewer((s) => s.selectObject);
  const importFiles = useImportFiles();

  // Restore the library on load — objects and prints persist per machine, not per session.
  // A first run on a machine with a local starter gallery loads that instead (seed.ts).
  useEffect(() => {
    void (async () => {
      const list = await listArtifactMeta();
      if (list.length === 0 && (await seedLibraryOnce(importFiles))) {
        setArtifacts(await listArtifactMeta());
        // Each import jumps to itself; start on the first of the set, not the last.
        selectObject(0);
        return;
      }
      setArtifacts(list);
    })();
    void listArtworkMeta().then(setArtworks);
  }, [setArtifacts, setArtworks, selectObject, importFiles]);

  const t = STUDIO_THEMES[theme];

  return (
    <div className={`app theme-${theme}`}>
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

        <CameraRig />
        <Environment intensity={t.envIntensity} />
        <Lighting />
        <Studio />
        <Acrylic />
        <Pedestal />
        <ArtifactMesh />
        <Grounding />
      </Canvas>

      <Hud />
      <DropZone />
      {/* Always mounted — the tab is a permanent affordance and expands in place. */}
      <GalleryPanel />
    </div>
  );
}
