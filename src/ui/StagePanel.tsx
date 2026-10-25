import { useEffect, useState } from 'react';
import {
  floorCm,
  slotArtifact,
  useViewer,
  type BoxKey,
  type SlotId,
} from '../store';
import { ROTATION_STEP_DEG } from '../scene/presets';
import { updateArtifactMeta } from '../library/db';
import { applyStation, STATIONS, useRecommendations } from '../library/stations';
import { useImportFiles } from '../import/useImport';
import { loadSetup, removeSetup, saveSetup } from '../library/setups';

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Save the scene as it stands — a station as adjusted, or anything staged by hand — and
 * bring any saved one back. Kept in this browser's library and carried in gallery exports.
 */
function Setups() {
  const setups = useViewer((s) => s.setups);
  const setupId = useViewer((s) => s.setupId);
  const station = useViewer((s) => s.station);
  const setImportError = useViewer((s) => s.setImportError);
  const current = setups.find((x) => x.id === setupId);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggested = current?.name ?? (station ? `${station} — adjusted` : 'My setup');

  const save = async (overwrite?: typeof current) => {
    setBusy(true);
    try {
      await saveSetup(overwrite ? overwrite.name : name || suggested, overwrite);
      setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h4>Saved setups</h4>
      <div className="stage-row">
        <input
          className="stage-name"
          type="text"
          placeholder={suggested}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button type="button" className="stage-btn is-primary" disabled={busy} onClick={() => void save()}>
          Save
        </button>
      </div>
      {current && (
        <button type="button" className="stage-btn stage-update" disabled={busy} onClick={() => void save(current)}>
          Update “{current.name}”
        </button>
      )}
      {setups.length > 0 && (
        <ul className="stage-setups">
          {setups.map((x) => (
            <li key={x.id} className={x.id === setupId ? 'is-active' : undefined}>
              <button
                type="button"
                className="stage-setup-load"
                title="Load this setup"
                onClick={() => {
                  setConfirmDelete(null);
                  const missing = loadSetup(x);
                  setImportError(missing.length ? `${x.name}: ${missing.join(', ')}.` : null);
                }}
              >
                <span>{x.name}</span>
                <em>{when(x.savedAt)}</em>
              </button>
              {confirmDelete === x.id ? (
                <button type="button" className="stage-btn is-danger" onClick={() => void removeSetup(x.id)}>
                  Delete?
                </button>
              ) : (
                <button
                  type="button"
                  className="stage-btn"
                  title="Delete this setup"
                  onClick={() => setConfirmDelete(x.id)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A number typed in centimetres. It edits a draft and commits on Enter or blur, so typing
 * "158.8" does not stage 1, 15 and 158 on the way. Empty commits null where `blank` is
 * allowed — "auto" for a derived sheet height or an auto-fit object.
 */
function Num({
  value,
  onCommit,
  blank,
  title,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  blank?: string;
  title?: string;
}) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t === '') {
      if (blank) onCommit(null);
      else setDraft(shown);
      return;
    }
    const v = Number(t.replace(',', '.'));
    if (Number.isFinite(v)) onCommit(v);
    else setDraft(shown);
  };

  return (
    <input
      className="stage-num"
      type="text"
      inputMode="decimal"
      title={title}
      placeholder={blank}
      value={draft}
      onFocus={(e) => {
        setEditing(true);
        // Clicking a measurement selects it, so typing replaces it rather than appending.
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(shown);
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Height × width × depth, the install plan's order, for a pedestal or a base. */
function BoxFields({ id, which }: { id: SlotId; which: 'pedestal' | 'base' }) {
  const box = useViewer((s) => s.slots[id][which]);
  const setSlotBox = useViewer((s) => s.setSlotBox);
  const field = (key: BoxKey, title: string) => (
    <Num value={box[key]} title={title} onCommit={(v) => v !== null && setSlotBox(id, which, key, v)} />
  );
  return (
    <span className="stage-box">
      {field('heightCm', 'height')}
      <i>×</i>
      {field('widthCm', 'width, along the wall')}
      <i>×</i>
      {field('lengthCm', 'depth, out from the wall')}
    </span>
  );
}

function SlotFields({ id }: { id: SlotId }) {
  const slot = useViewer((s) => s.slots[id]);
  const meta = useViewer((s) => slotArtifact(s, id));
  const artifacts = useViewer((s) => s.artifacts);
  const updateSlot = useViewer((s) => s.updateSlot);
  const moveSlotTo = useViewer((s) => s.moveSlotTo);
  const patchArtifactMeta = useViewer((s) => s.patchArtifactMeta);
  const { station: pairing, recs } = useRecommendations();

  const turn = Math.round((slot.rotationStep * ROTATION_STEP_DEG + slot.nudgeDeg) * 10) / 10;

  const setHeight = (v: number | null) => {
    if (!meta) return;
    const heightCm = v === null ? undefined : Math.max(0.5, Math.round(v * 10) / 10);
    patchArtifactMeta(meta.id, { heightCm });
    void updateArtifactMeta(meta.id, { heightCm });
  };

  return (
    <div className="stage-rows">
      <label className="stage-row">
        <span>Object</span>
        <select
          value={slot.objectIndex}
          onChange={(e) => updateSlot(id, { objectIndex: Number(e.target.value) })}
        >
          {/* The install plan's pairing for what is on the sheet comes first. An object with
              no scan here is still listed, greyed, so the recommendation is never silent. */}
          {recs.length > 0 && (
            <optgroup label={`Paired with ${pairing?.id} in the install plan`}>
              {recs.map((r) => (
                <option key={r.tag} value={r.index < 0 ? `none-${r.tag}` : r.index} disabled={r.index < 0}>
                  {r.tag} — {r.label}
                  {r.missing ? ` (${r.missing})` : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Library">
            <option value={-1}>— empty pedestal —</option>
            {artifacts.map((a, i) => (
              <option key={a.id} value={i}>
                {a.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="stage-row">
        <span>True height</span>
        <Num
          value={meta?.heightCm}
          blank="auto-fit"
          title="The object's real height. Blank scales it to a display size instead."
          onCommit={setHeight}
        />
        <em>cm</em>
      </div>
      <div className="stage-row">
        <span>Along wall</span>
        <Num value={slot.xCm} onCommit={(v) => v !== null && moveSlotTo(id, v, slot.gapCm)} />
        <em>cm</em>
      </div>
      <div className="stage-row">
        <span>Gap</span>
        <Num value={slot.gapCm} onCommit={(v) => v !== null && moveSlotTo(id, slot.xCm, v)} />
        <em>cm to sheet</em>
      </div>
      <div className="stage-row">
        <span>Turn</span>
        <Num
          value={turn}
          onCommit={(v) => v !== null && updateSlot(id, { nudgeDeg: v - slot.rotationStep * ROTATION_STEP_DEG })}
        />
        <em>°</em>
      </div>
      <div className="stage-row">
        <span>Scale</span>
        <Num value={slot.scale} onCommit={(v) => v !== null && updateSlot(id, { scale: v })} />
        <em>×</em>
      </div>
      <div className="stage-row">
        <label className="stage-check">
          <input
            type="checkbox"
            checked={slot.pedestalVisible}
            onChange={() => updateSlot(id, { pedestalVisible: !slot.pedestalVisible })}
          />
          <span>Pedestal</span>
        </label>
        <BoxFields id={id} which="pedestal" />
      </div>
      <div className="stage-row">
        <label className="stage-check">
          <input type="checkbox" checked={slot.baseOn} onChange={() => updateSlot(id, { baseOn: !slot.baseOn })} />
          <span>Base</span>
        </label>
        {slot.baseOn ? <BoxFields id={id} which="base" /> : <em>off — E</em>}
      </div>
    </div>
  );
}

/**
 * Everything the install plan specifies, as typed centimetres: the sheet's size and mount
 * height, the plinth, and each object's position, pedestal and base. The keys still step
 * the same values in 5 cm increments; this is for the 82.5s and 158.8s.
 *
 * The station list stages BM42–BM49 straight from the plan.
 */
export function StagePanel() {
  const open = useViewer((s) => s.showStage);
  const toggle = useViewer((s) => s.toggleStage);
  const panel = useViewer((s) => s.panel);
  const setPanel = useViewer((s) => s.setPanel);
  const plinth = useViewer((s) => s.plinth);
  const setPlinth = useViewer((s) => s.setPlinth);
  const floor = useViewer(floorCm);
  const active = useViewer((s) => s.active);
  const twoUp = useViewer((s) => s.twoUp);
  const setActive = useViewer((s) => s.setActive);
  const toggleTwoUp = useViewer((s) => s.toggleTwoUp);
  const station = useViewer((s) => s.station);
  const setImportError = useViewer((s) => s.setImportError);
  const importFiles = useImportFiles();
  const [busy, setBusy] = useState(false);

  const stage = async (id: string) => {
    const st = STATIONS.find((x) => x.id === id);
    if (!st) return;
    setBusy(true);
    try {
      const problems = await applyStation(st, importFiles);
      setImportError(problems.length ? problems.join('  •  ') : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`stage${open ? '' : ' is-closed'}`}>
      <button type="button" className="gallery-tab" onClick={toggle} aria-expanded={open}>
        <span>Stage</span>
        {station && <span className="gallery-count">{station}</span>}
        <span className="gallery-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="stage-body">
          <section>
            <h4>Station</h4>
            <select
              className="stage-station"
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && void stage(e.target.value)}
            >
              <option value="">{busy ? 'Staging…' : 'Stage from the install plan…'}</option>
              {STATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.title} · {s.painting}
                </option>
              ))}
            </select>
          </section>

          <Setups />

          <section>
            <h4>Sheet</h4>
            <div className="stage-row">
              <span>H × W</span>
              <span className="stage-box">
                <Num
                  value={panel.heightCm}
                  blank="auto"
                  title="Blank takes the height from the print's proportions."
                  onCommit={(v) => setPanel({ heightCm: v })}
                />
                <i>×</i>
                <Num value={panel.widthCm} onCommit={(v) => v !== null && setPanel({ widthCm: v })} />
              </span>
              <em>cm</em>
            </div>
            <div className="stage-row">
              <span>Bottom</span>
              <Num value={panel.bottomCm} onCommit={(v) => v !== null && setPanel({ bottomCm: v })} />
              <em>cm above {floor ? 'plinth' : 'floor'}</em>
            </div>
          </section>

          <section>
            <h4>Plinth</h4>
            <div className="stage-row">
              <label className="stage-check">
                <input type="checkbox" checked={plinth.on} onChange={() => setPlinth({ on: !plinth.on })} />
                <span>Floor platform</span>
              </label>
              <Num value={plinth.heightCm} onCommit={(v) => v !== null && setPlinth({ heightCm: v })} />
              <em>cm high</em>
            </div>
          </section>

          <section>
            <h4>Objects</h4>
            <div className="gallery-seg stage-seg">
              <button type="button" className={active === 'A' ? 'is-on' : undefined} onClick={() => setActive('A')}>
                A
              </button>
              {twoUp ? (
                <button type="button" className={active === 'B' ? 'is-on' : undefined} onClick={() => setActive('B')}>
                  B
                </button>
              ) : null}
              <button type="button" onClick={toggleTwoUp} title="T">
                {twoUp ? 'Remove B' : '+ Second object'}
              </button>
            </div>
            <SlotFields id={active} />
          </section>

          <p className="stage-hint">
            Click a pedestal and confirm to move it · Shift-drag an object to turn it · arrows
            nudge 1 cm once confirmed (Shift 10)
          </p>
        </div>
      )}
    </div>
  );
}
