import { useEffect } from 'react';
import { useViewer } from '../store';
import { LIGHT_LEVELS } from '../scene/presets';

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

/** The right edge: snapshot above brightness, one column, centred clear of the corner panels. */
export function RightRail() {
  return (
    <div className="right-rail">
      <SnapshotButton />
      <LightSlider />
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
