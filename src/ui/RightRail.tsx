import { useEffect, useState } from 'react';
import { useViewer } from '../store';
import { LIGHT_LEVELS, WALL_LIGHT } from '../scene/presets';
import { saveScene } from '../library/sceneSave';

/**
 * Brightness: five fixed steps rather than a free dial, so a staged look can be named and
 * repeated ("light, step 2") — the baseline viewer's slider, same control and same logic.
 */
function LightSlider() {
  const level = useViewer((s) => s.lightLevel);
  const setLevel = useViewer((s) => s.setLightLevel);

  return (
    <div className="rail-slider">
      <div className="rail-slider-label">Light</div>
      <div className="rail-slider-value">
        {level + 1} / {LIGHT_LEVELS.length}
      </div>
      <input
        type="range"
        className="is-stepped"
        aria-label="Light brightness"
        min={0}
        max={LIGHT_LEVELS.length - 1}
        step={1}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        // Keyboard shortcuts ignore keys while an input has focus, so hand focus back.
        onPointerUp={(e) => e.currentTarget.blur()}
        title="Drag to brighten or dim the light"
      />
    </div>
  );
}

/**
 * The wall light's strength. Only shown while the light is on (F) — there is nothing to
 * set when it is off. A free dial, not steps: it is balanced by eye against the print.
 * Shown as a percentage of the default so "100%" is the authored strength.
 */
function WallLightSlider() {
  const light = useViewer((s) => s.lights[WALL_LIGHT.id]);
  const setIntensity = useViewer((s) => s.setLightIntensity);
  if (!light?.on) return null;

  return (
    <div className="rail-slider rail-slider-wall">
      <div className="rail-slider-label">Wall light</div>
      <div className="rail-slider-value">{Math.round((light.intensity / WALL_LIGHT.intensity) * 100)}%</div>
      <input
        type="range"
        aria-label="Wall light strength"
        min={0}
        max={WALL_LIGHT.maxIntensity}
        step={1}
        value={light.intensity}
        onChange={(e) => setIntensity(WALL_LIGHT.id, Number(e.target.value))}
        onPointerUp={(e) => e.currentTarget.blur()}
        title="Drag to strengthen or soften the wall light (F turns it off)"
      />
    </div>
  );
}

/**
 * Save — keeps the scene as it stands for next time and as a saved setup that travels in
 * gallery exports. See library/sceneSave.ts. Also Cmd/Ctrl+S.
 */
function SaveButton() {
  const setNotice = useViewer((s) => s.setNotice);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="rail-button"
      disabled={busy}
      onClick={async (e) => {
        e.currentTarget.blur();
        setBusy(true);
        try {
          setNotice(await saveScene());
        } catch (err) {
          setNotice(`Could not save — ${err instanceof Error ? err.message : 'unknown error'}`);
        } finally {
          setBusy(false);
        }
      }}
      title="Save the scene — orientation, stands, sheet and lights (Cmd+S)"
      aria-label="Save the scene"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span>{busy ? 'Saving…' : 'Save'}</span>
    </button>
  );
}

/** The snapshot, as a button as well as the I key — it is the thing marketing will reach for. */
function SnapshotButton() {
  const requestSnapshot = useViewer((s) => s.requestSnapshot);
  return (
    <button
      type="button"
      className="rail-button"
      onClick={(e) => {
        requestSnapshot();
        e.currentTarget.blur();
      }}
      title="Save the scene as a PNG (I)"
      aria-label="Save a snapshot"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="13.3" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span>Snapshot</span>
    </button>
  );
}

/** The right edge: save and snapshot above brightness, one column, centred clear of the corner panels. */
export function RightRail() {
  return (
    <div className="right-rail">
      <SaveButton />
      <SnapshotButton />
      <LightSlider />
      <WallLightSlider />
    </div>
  );
}

/** Brief confirmation after a snapshot. Clears itself. */
export function Notice() {
  const notice = useViewer((s) => s.notice);
  const setNotice = useViewer((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(id);
  }, [notice, setNotice]);

  return notice ? (
    <div className="notice" role="status">
      {notice}
    </div>
  ) : null;
}
