import { create } from 'zustand';
import {
  ACRYLIC,
  BASE_DEFAULTS,
  DEFAULT_LIGHT_LEVEL,
  LIGHT_LEVELS,
  LIGHT_PRESETS,
  PANEL_DEFAULTS,
  PEDESTAL_DEFAULTS,
  PLACEMENT,
  PLINTH_DEFAULTS,
  type StudioTheme,
} from './scene/presets';
import type { ArtifactMeta, ArtworkMeta, SetupRecord } from './library/db';
import type { SceneSettings } from './library/galleryFile';

/** A box in centimetres, in BP_AdjustablePedestal's terms: width along the wall, length out from it. */
export type BoxCm = { widthCm: number; lengthCm: number; heightCm: number };
export type BoxKey = keyof BoxCm;

/**
 * One object standing in front of the sheet, with everything under it.
 *
 * Two of these exist so a scene can hold a pair (BM43, BM48). Each has its own pedestal
 * and its own base, and each moves independently. A pedestal only ever translates —
 * it never turns, so it always stays square to the sheet. Turning is the object's alone.
 */
export type Slot = {
  /** Index into `artifacts`; -1 when nothing stands here. */
  objectIndex: number;
  /** Along the wall, centimetres from the sheet's centre line. */
  xCm: number;
  /** Out from the sheet's face to the centre of the pedestal. */
  gapCm: number;
  /**
   * Unbounded step counter, not wrapped to 0..11. Letting it run past a full turn keeps
   * the animation monotonic, so stepping from 11 to 12 eases forward through 360° rather
   * than unwinding all the way back to zero.
   */
  rotationStep: number;
  /** Free turn on top of the 30° steps, from Shift-dragging the object. */
  nudgeDeg: number;
  /** Multiplier on the object's size — P / Shift+P in Unreal. */
  scale: number;
  pedestal: BoxCm;
  /**
   * Hides the pedestal without moving the object, leaving it floating in front of the
   * sheet. The object keeps its seated height so toggling does not reframe the shot.
   */
  pedestalVisible: boolean;
  /** The riser on top of the pedestal — "Base FCME" / "Base FJM" in the install plan. */
  base: BoxCm;
  baseOn: boolean;
};

export type SlotId = 'A' | 'B';
export const SLOT_IDS: SlotId[] = ['A', 'B'];

/**
 * The state BP_PhotoViewerController holds — CurrentCamIndex, CurrentObjectIndex,
 * per-light on/off + intensity, pedestal dimensions, rotation and scale — plus what the
 * reflective level adds: the acrylic sheet's dimensions and placement, its optical
 * properties, and which artwork is printed on it. Everything per-object lives in a slot.
 */
type ViewerState = {
  camIndex: number;
  nextCam: () => void;
  prevCam: () => void;
  /**
   * Bumped to make the camera re-blend to the current preset — after a station moves
   * everything, so the view follows the new arrangement instead of staying where it was.
   */
  camNonce: number;
  reframe: () => void;

  lights: Record<string, { on: boolean; intensity: number }>;
  /** Index into LIGHT_LEVELS — the five-step brightness slider on the right edge. */
  lightLevel: number;
  setLightLevel: (level: number) => void;

  /**
   * I or the camera button: bumped to ask the canvas for a snapshot. A counter rather than
   * a flag so two presses in a row are two snapshots; the capture lives inside the Canvas.
   */
  snapshotRequest: number;
  requestSnapshot: () => void;
  /** Short confirmation shown after a snapshot is saved. Clears itself. */
  notice: string | null;
  setNotice: (v: string | null) => void;
  toggleLight: (id: string) => void;
  setLightIntensity: (id: string, v: number) => void;

  slots: Record<SlotId, Slot>;
  /** Which object the keys and the stage panel act on. Clicking an object makes it active. */
  active: SlotId;
  /** Whether the second object (B) is in the scene. */
  twoUp: boolean;
  setActive: (id: SlotId) => void;
  toggleTwoUp: () => void;
  /** Patch a slot. Values are clamped to what can physically stand there. */
  updateSlot: (id: SlotId, patch: Partial<Slot>) => void;
  setSlotBox: (id: SlotId, which: 'pedestal' | 'base', key: BoxKey, cm: number) => void;
  /**
   * Move an object to a spot. Refuses to put one pedestal inside the other: if the full
   * move would collide it slides along whichever axis is still free, so dragging one
   * object into the other stops it at the contact instead of passing through.
   */
  moveSlotTo: (id: SlotId, xCm: number, gapCm: number) => void;

  /**
   * Moving a stand takes a confirmation, so a stray drag across the scene never shifts a
   * staged pedestal. Clicking one sets `moveAsk` — it is outlined and asks "Move
   * pedestal?" — and confirming sets `moveUnlocked`, after which dragging it moves it
   * until Done, Escape, or a click on empty space locks it again.
   */
  moveAsk: SlotId | null;
  moveUnlocked: SlotId | null;
  askMove: (id: SlotId) => void;
  confirmMove: () => void;
  lockMove: () => void;

  /** Active-slot shortcuts for the keyboard — the Unreal legend, unchanged. */
  adjustPedestal: (key: BoxKey, dir: 1 | -1) => void;
  adjustGap: (dir: 1 | -1) => void;
  nudgeActive: (dxCm: number, dGapCm: number) => void;
  stepRotation: (dir: 1 | -1) => void;
  adjustScale: (dir: 1 | -1) => void;
  togglePedestal: () => void;
  toggleBase: () => void;

  /** The floor platform the stations stand on. Shared by every slot and the sheet. */
  plinth: { on: boolean; heightCm: number };
  setPlinth: (patch: Partial<{ on: boolean; heightCm: number }>) => void;
  togglePlinth: () => void;

  /**
   * The acrylic sheet. Height is null by default — derived from the artwork's aspect
   * ratio in scene/panelGeometry.ts, because a sheet is cut to what is printed on it. A
   * number pins it, and the print is then cropped to fill the sheet.
   */
  panel: { widthCm: number; heightCm: number | null; bottomCm: number };
  adjustPanel: (key: 'widthCm' | 'bottomCm', dir: 1 | -1) => void;
  setPanel: (patch: Partial<{ widthCm: number; heightCm: number | null; bottomCm: number }>) => void;

  /** Fresnel F0 — the sheet's reflectance seen head-on. Z. */
  reflectance: number;
  adjustReflectance: (dir: 1 | -1) => void;

  /** Surface finish: 0 mirror-sharp, 1 strongly diffused. U. */
  polish: number;
  adjustPolish: (dir: 1 | -1) => void;

  /** Brightness of the printed artwork. X. */
  print: number;
  adjustPrint: (dir: 1 | -1) => void;

  /** Always the white gallery — kept in state only so gallery files keep their field. */
  studioTheme: StudioTheme;

  /** Metadata only; the parsed scene graphs live in library/models.ts. */
  artifacts: ArtifactMeta[];
  setArtifacts: (a: ArtifactMeta[]) => void;
  addArtifactMeta: (a: ArtifactMeta) => void;
  removeArtifactMeta: (id: string) => void;
  patchArtifactMeta: (id: string, patch: Partial<ArtifactMeta>) => void;
  /** O / Shift+O — cycles what stands in the active slot. */
  stepObject: (dir: 1 | -1) => void;
  /** Put an artifact in the active slot. */
  selectObject: (index: number) => void;

  /**
   * Artworks printed on the sheet. Metadata only; decoded textures live in
   * library/artworks.ts.
   */
  artworks: ArtworkMeta[];
  /** -1 is the bare sheet, and a real position in the cycle rather than an empty state. */
  artIndex: number;
  setArtworks: (a: ArtworkMeta[]) => void;
  addArtworkMeta: (a: ArtworkMeta) => void;
  removeArtworkMeta: (id: string) => void;
  stepArt: (dir: 1 | -1) => void;
  selectArt: (index: number) => void;

  /** The install-plan station last applied, for the HUD. Cleared by nothing — a label. */
  station: string | null;
  setStation: (id: string | null) => void;

  /** Saved setups, newest first, and the one last saved or loaded. See library/setups.ts. */
  setups: SetupRecord[];
  setupId: string | null;

  /** Progress for an in-flight import, shown as a modal. null when idle. */
  importing: { name: string; note: string } | null;
  setImporting: (v: { name: string; note: string } | null) => void;
  importError: string | null;
  setImportError: (v: string | null) => void;

  showGallery: boolean;
  toggleGallery: () => void;

  showStage: boolean;
  toggleStage: () => void;

  /** Collapses the lower-left readout to its camera chip, as in the Pair Viewer. */
  showHud: boolean;
  toggleHud: () => void;

  showHelp: boolean;
  toggleHelp: () => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Adjustment keys land on clean values rather than accumulating float drift. */
const stepTo = (v: number, dir: 1 | -1, step: number, lo: number, hi: number) =>
  clamp(Math.round((v + dir * step) / step) * step, lo, hi);

/** Typed values keep a millimetre of precision — the install plan has 82.5 and 158.8. */
const mm = (v: number) => Math.round(v * 10) / 10;

const BOX_BOUNDS: Record<'pedestal' | 'base', Record<BoxKey, [number, number]>> = {
  pedestal: {
    widthCm: [PEDESTAL_DEFAULTS.minWidthCm, PEDESTAL_DEFAULTS.maxWidthCm],
    lengthCm: [PEDESTAL_DEFAULTS.minLengthCm, PEDESTAL_DEFAULTS.maxLengthCm],
    heightCm: [PEDESTAL_DEFAULTS.minHeightCm, PEDESTAL_DEFAULTS.maxHeightCm],
  },
  base: {
    widthCm: [BASE_DEFAULTS.min, BASE_DEFAULTS.max],
    lengthCm: [BASE_DEFAULTS.min, BASE_DEFAULTS.max],
    heightCm: [BASE_DEFAULTS.min, BASE_DEFAULTS.max],
  },
};

const clampBox = (b: BoxCm, which: 'pedestal' | 'base'): BoxCm => ({
  widthCm: mm(clamp(b.widthCm, ...BOX_BOUNDS[which].widthCm)),
  lengthCm: mm(clamp(b.lengthCm, ...BOX_BOUNDS[which].lengthCm)),
  heightCm: mm(clamp(b.heightCm, ...BOX_BOUNDS[which].heightCm)),
});

/** The pedestal's back face can come up to the sheet but never through it. */
export const minGapFor = (slot: Pick<Slot, 'pedestal'>) =>
  mm(slot.pedestal.lengthCm / 2 + PLACEMENT.sheetClearanceCm);

/** Everything a slot must satisfy to stand in the room. */
function normalizeSlot(s: Slot): Slot {
  const pedestal = clampBox(s.pedestal, 'pedestal');
  const base = clampBox(s.base, 'base');
  return {
    ...s,
    pedestal,
    base,
    xCm: mm(clamp(s.xCm, -PLACEMENT.maxXCm, PLACEMENT.maxXCm)),
    gapCm: mm(clamp(s.gapCm, minGapFor({ pedestal }), PLACEMENT.maxGapCm)),
    scale: clamp(s.scale, 0.1, 5),
  };
}

/** Whether two pedestals' footprints overlap. Touching is allowed — BM43 is built that way. */
function collides(a: Slot, b: Slot): boolean {
  const eps = 0.05;
  return (
    Math.abs(a.xCm - b.xCm) < (a.pedestal.widthCm + b.pedestal.widthCm) / 2 - eps &&
    Math.abs(a.gapCm - b.gapCm) < (a.pedestal.lengthCm + b.pedestal.lengthCm) / 2 - eps
  );
}

const DEFAULT_SLOT: Slot = {
  objectIndex: 0,
  xCm: 0,
  gapCm: 40,
  rotationStep: 0,
  nudgeDeg: 0,
  scale: 1,
  pedestal: {
    widthCm: PEDESTAL_DEFAULTS.widthCm,
    lengthCm: PEDESTAL_DEFAULTS.lengthCm,
    heightCm: PEDESTAL_DEFAULTS.heightCm,
  },
  pedestalVisible: true,
  base: {
    widthCm: BASE_DEFAULTS.widthCm,
    lengthCm: BASE_DEFAULTS.lengthCm,
    heightCm: BASE_DEFAULTS.heightCm,
  },
  baseOn: false,
};

export const freshSlot = (patch: Partial<Slot> = {}): Slot =>
  normalizeSlot({ ...structuredClone(DEFAULT_SLOT), ...patch });

/** The slots that are actually in the scene: A always, B when two-up. */
export const liveSlotIds = (s: { twoUp: boolean }): SlotId[] => (s.twoUp ? ['A', 'B'] : ['A']);

export const useViewer = create<ViewerState>((set, get) => {
  /** Apply a function to the active slot, normalising the result. */
  const onActive = (fn: (slot: Slot) => Partial<Slot>) =>
    set((s) => ({
      slots: { ...s.slots, [s.active]: normalizeSlot({ ...s.slots[s.active], ...fn(s.slots[s.active]) }) },
    }));

  return {
    camIndex: 0,
    nextCam: () => set((s) => ({ camIndex: s.camIndex + 1 })),
    prevCam: () => set((s) => ({ camIndex: s.camIndex - 1 })),
    camNonce: 0,
    reframe: () => set((s) => ({ camNonce: s.camNonce + 1 })),

    lights: Object.fromEntries(
      LIGHT_PRESETS.map((l) => [l.id, { on: l.on, intensity: l.intensity }]),
    ),
    lightLevel: DEFAULT_LIGHT_LEVEL,
    setLightLevel: (level) =>
      set({ lightLevel: clamp(Math.round(level), 0, LIGHT_LEVELS.length - 1) }),

    snapshotRequest: 0,
    requestSnapshot: () => set((s) => ({ snapshotRequest: s.snapshotRequest + 1 })),
    notice: null,
    setNotice: (notice) => set({ notice }),

    toggleLight: (id) =>
      set((s) => ({ lights: { ...s.lights, [id]: { ...s.lights[id], on: !s.lights[id].on } } })),
    setLightIntensity: (id, v) =>
      set((s) => ({ lights: { ...s.lights, [id]: { ...s.lights[id], intensity: v } } })),

    slots: { A: freshSlot(), B: freshSlot({ objectIndex: 1 }) },
    active: 'A',
    twoUp: false,
    setActive: (active) => set((s) => (s.twoUp || active === 'A' ? { active } : {})),
    toggleTwoUp: () =>
      set((s) => {
        if (s.twoUp) return { twoUp: false, active: 'A', moveAsk: null, moveUnlocked: null };
        // B arrives beside A, on a matching pedestal, carrying the next object in the
        // library — the usual reason for a second slot is to stage a different piece.
        const a = s.slots.A;
        const n = s.artifacts.length;
        const b = normalizeSlot({
          ...s.slots.B,
          objectIndex: n > 1 ? (a.objectIndex + 1) % n : n === 1 ? 0 : -1,
          pedestal: { ...a.pedestal },
          gapCm: a.gapCm,
          xCm: a.xCm + a.pedestal.widthCm / 2 + PLACEMENT.pairSpacingCm + a.pedestal.widthCm / 2,
        });
        return { twoUp: true, active: 'B', slots: { ...s.slots, B: b } };
      }),
    updateSlot: (id, patch) =>
      set((s) => ({ slots: { ...s.slots, [id]: normalizeSlot({ ...s.slots[id], ...patch }) } })),
    setSlotBox: (id, which, key, value) =>
      set((s) => {
        const slot = s.slots[id];
        return {
          slots: {
            ...s.slots,
            [id]: normalizeSlot({ ...slot, [which]: { ...slot[which], [key]: value } }),
          },
        };
      }),
    moveSlotTo: (id, xCm, gapCm) =>
      set((s) => {
        const cur = s.slots[id];
        const other = s.twoUp ? s.slots[id === 'A' ? 'B' : 'A'] : null;
        const tries = [
          { xCm, gapCm },
          { xCm, gapCm: cur.gapCm },
          { xCm: cur.xCm, gapCm },
        ];
        for (const t of tries) {
          const next = normalizeSlot({ ...cur, ...t });
          if (!other || !collides(next, other)) return { slots: { ...s.slots, [id]: next } };
        }
        return {};
      }),

    moveAsk: null,
    moveUnlocked: null,
    askMove: (id) =>
      set((s) =>
        s.moveUnlocked === id ? { active: id } : { active: id, moveAsk: id, moveUnlocked: null },
      ),
    confirmMove: () => set((s) => ({ moveUnlocked: s.moveAsk, moveAsk: null })),
    lockMove: () => set({ moveAsk: null, moveUnlocked: null }),

    adjustPedestal: (key, dir) =>
      onActive((slot) => ({
        pedestal: {
          ...slot.pedestal,
          [key]: stepTo(slot.pedestal[key], dir, PEDESTAL_DEFAULTS.stepCm, ...BOX_BOUNDS.pedestal[key]),
        },
      })),
    adjustGap: (dir) =>
      onActive((slot) => ({
        gapCm: stepTo(slot.gapCm, dir, PLACEMENT.gapStepCm, minGapFor(slot), PLACEMENT.maxGapCm),
      })),
    nudgeActive: (dx, dGap) => {
      const s = get();
      const slot = s.slots[s.active];
      s.moveSlotTo(s.active, slot.xCm + dx, slot.gapCm + dGap);
    },
    stepRotation: (dir) => onActive((slot) => ({ rotationStep: slot.rotationStep + dir })),
    adjustScale: (dir) =>
      onActive((slot) => ({ scale: Math.round(clamp(slot.scale + dir * 0.05, 0.25, 3) * 100) / 100 })),
    togglePedestal: () => onActive((slot) => ({ pedestalVisible: !slot.pedestalVisible })),
    toggleBase: () => onActive((slot) => ({ baseOn: !slot.baseOn })),

    plinth: { on: PLINTH_DEFAULTS.on, heightCm: PLINTH_DEFAULTS.heightCm },
    setPlinth: (patch) =>
      set((s) => {
        const next = { ...s.plinth, ...patch };
        next.heightCm = mm(clamp(next.heightCm, PLINTH_DEFAULTS.minHeightCm, PLINTH_DEFAULTS.maxHeightCm));
        return { plinth: next };
      }),
    togglePlinth: () => set((s) => ({ plinth: { ...s.plinth, on: !s.plinth.on } })),

    panel: {
      widthCm: PANEL_DEFAULTS.widthCm,
      heightCm: PANEL_DEFAULTS.heightCm,
      bottomCm: PANEL_DEFAULTS.bottomCm,
    },
    adjustPanel: (key, dir) =>
      set((s) => {
        const d = PANEL_DEFAULTS;
        const bounds = {
          widthCm: [d.minWidthCm, d.maxWidthCm],
          bottomCm: [d.minBottomCm, d.maxBottomCm],
        }[key];
        return {
          panel: {
            ...s.panel,
            [key]: clamp(s.panel[key] + dir * d.stepCm, bounds[0], bounds[1]),
          },
        };
      }),
    setPanel: (patch) =>
      set((s) => {
        const d = PANEL_DEFAULTS;
        const next = { ...s.panel, ...patch };
        next.widthCm = mm(clamp(next.widthCm, d.minWidthCm, d.maxWidthCm));
        next.bottomCm = mm(clamp(next.bottomCm, d.minBottomCm, d.maxBottomCm));
        if (next.heightCm !== null) next.heightCm = mm(clamp(next.heightCm, d.minHeightCm, d.maxHeightCm));
        return { panel: next };
      }),

    reflectance: ACRYLIC.reflectance,
    adjustReflectance: (dir) =>
      set((s) => ({
        reflectance: stepTo(
          s.reflectance, dir, ACRYLIC.reflectanceStep, ACRYLIC.minReflectance, ACRYLIC.maxReflectance,
        ),
      })),

    polish: ACRYLIC.polish,
    adjustPolish: (dir) =>
      set((s) => ({
        polish: stepTo(s.polish, dir, ACRYLIC.polishStep, ACRYLIC.minPolish, ACRYLIC.maxPolish),
      })),

    print: ACRYLIC.print,
    adjustPrint: (dir) =>
      set((s) => ({
        print: stepTo(s.print, dir, ACRYLIC.printStep, ACRYLIC.minPrint, ACRYLIC.maxPrint),
      })),

    studioTheme: 'white',

    artifacts: [],
    setArtifacts: (artifacts) => set({ artifacts }),
    addArtifactMeta: (a) =>
      set((s) => ({
        artifacts: [...s.artifacts, a],
        // Jump to whatever was just added — the expected result of dropping a file in.
        slots: { ...s.slots, [s.active]: { ...s.slots[s.active], objectIndex: s.artifacts.length } },
      })),
    removeArtifactMeta: (id) =>
      set((s) => {
        const gone = s.artifacts.findIndex((a) => a.id === id);
        const artifacts = s.artifacts.filter((a) => a.id !== id);
        const fix = (i: number) =>
          i < 0 || gone < 0 ? i : i > gone ? i - 1 : artifacts.length ? Math.min(i, artifacts.length - 1) : -1;
        return {
          artifacts,
          slots: {
            A: { ...s.slots.A, objectIndex: fix(s.slots.A.objectIndex) },
            B: { ...s.slots.B, objectIndex: fix(s.slots.B.objectIndex) },
          },
        };
      }),
    patchArtifactMeta: (id, patch) =>
      set((s) => ({ artifacts: s.artifacts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    stepObject: (dir) =>
      set((s) => {
        if (s.artifacts.length === 0) return {};
        const n = s.artifacts.length;
        const slot = s.slots[s.active];
        const from = slot.objectIndex < 0 ? (dir > 0 ? -1 : 0) : slot.objectIndex;
        return {
          slots: { ...s.slots, [s.active]: { ...slot, objectIndex: (((from + dir) % n) + n) % n } },
        };
      }),
    selectObject: (index) =>
      set((s) => ({ slots: { ...s.slots, [s.active]: { ...s.slots[s.active], objectIndex: index } } })),

    artworks: [],
    artIndex: -1,
    setArtworks: (artworks) =>
      // Land on the first artwork rather than the bare sheet when the app restores a
      // library on load: a printed sheet is the point of the setup.
      set((s) => ({ artworks, artIndex: s.artIndex === -1 && artworks.length ? 0 : s.artIndex })),
    addArtworkMeta: (a) =>
      set((s) => ({ artworks: [...s.artworks, a], artIndex: s.artworks.length })),
    removeArtworkMeta: (id) =>
      set((s) => {
        const artworks = s.artworks.filter((a) => a.id !== id);
        return {
          artworks,
          artIndex: artworks.length ? Math.min(s.artIndex, artworks.length - 1) : -1,
        };
      }),
    stepArt: (dir) =>
      set((s) => {
        // The cycle runs over the artworks *plus* the bare sheet at -1, so one key both
        // changes the print and takes it off.
        const n = s.artworks.length + 1;
        const from = s.artIndex + 1;
        return { artIndex: (((from + dir) % n) + n) % n - 1 };
      }),
    selectArt: (index) => set({ artIndex: index }),

    station: null,
    setStation: (station) => set({ station }),

    setups: [],
    setupId: null,

    importing: null,
    setImporting: (importing) => set({ importing }),
    importError: null,
    setImportError: (importError) => set({ importError }),

    showGallery: false,
    toggleGallery: () => set((s) => ({ showGallery: !s.showGallery })),

    showStage: false,
    toggleStage: () => set((s) => ({ showStage: !s.showStage })),

    showHud: true,
    toggleHud: () => set((s) => ({ showHud: !s.showHud })),

    showHelp: false,
    toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),
  };
});

/** The artifact standing in a slot, if any. */
export const slotArtifact = (s: ViewerState, id: SlotId): ArtifactMeta | undefined => {
  const i = s.slots[id].objectIndex;
  return i < 0 ? undefined : s.artifacts[i];
};

/** The metadata for the object in the active slot, if any. */
export const currentArtifact = (s: ViewerState): ArtifactMeta | undefined => slotArtifact(s, s.active);

/** The artwork currently printed on the sheet, or undefined for a bare sheet. */
export const currentArtwork = (s: ViewerState): ArtworkMeta | undefined =>
  s.artIndex < 0 ? undefined : s.artworks[s.artIndex];

/** Height of the plinth's top above the floor, cm — where pedestals and the sheet measure from. */
export const floorCm = (s: Pick<ViewerState, 'plinth'>) => (s.plinth.on ? s.plinth.heightCm : 0);

/** Where an object in a slot is seated: plinth + pedestal + base, cm above the floor. */
export const seatCm = (s: Pick<ViewerState, 'plinth'>, slot: Slot) =>
  floorCm(s) + slot.pedestal.heightCm + (slot.baseOn ? slot.base.heightCm : 0);

/** Everything a gallery export needs to reproduce how the curator staged the scene. */
export function captureSettings(): SceneSettings {
  const s = useViewer.getState();
  const a = s.slots.A;
  return {
    // The v1 fields, still written so an older build opening this file gets slot A.
    pedestal: { ...a.pedestal },
    pedestalVisible: a.pedestalVisible,
    panel: { ...s.panel, gapCm: a.gapCm },
    objectScale: a.scale,
    reflectance: s.reflectance,
    polish: s.polish,
    print: s.print,
    lights: structuredClone(s.lights),
    lightLevel: s.lightLevel,
    studioTheme: s.studioTheme,
    camIndex: s.camIndex,
    artIndex: s.artIndex,
    slots: structuredClone(s.slots),
    twoUp: s.twoUp,
    active: s.active,
    plinth: { ...s.plinth },
    station: s.station,
  };
}

/** Restore a staged scene from an imported gallery, ignoring anything unrecognised. */
export function applySettings(next: SceneSettings | null): void {
  if (!next) return;
  useViewer.setState((s) => {
    // A v1 gallery has one object and keeps its placement in the old top-level fields.
    const legacyA: Partial<Slot> = {
      ...(next.pedestal ? { pedestal: { ...s.slots.A.pedestal, ...next.pedestal } } : {}),
      ...(next.pedestalVisible !== undefined ? { pedestalVisible: next.pedestalVisible } : {}),
      ...(next.panel?.gapCm !== undefined ? { gapCm: next.panel.gapCm } : {}),
      ...(next.objectScale !== undefined ? { scale: next.objectScale } : {}),
    };
    const slots = {
      A: normalizeSlot({ ...s.slots.A, ...legacyA, ...(next.slots?.A ?? {}) }),
      B: normalizeSlot({ ...s.slots.B, ...(next.slots?.B ?? {}) }),
    };
    const twoUp = next.twoUp ?? false;
    return {
      slots,
      twoUp,
      active: twoUp && next.active === 'B' ? 'B' : 'A',
      plinth: { ...s.plinth, ...(next.plinth ?? {}) },
      panel: {
        widthCm: next.panel?.widthCm ?? s.panel.widthCm,
        bottomCm: next.panel?.bottomCm ?? s.panel.bottomCm,
        heightCm: next.panel?.heightCm ?? null,
      },
      reflectance: next.reflectance ?? s.reflectance,
      polish: next.polish ?? s.polish,
      print: next.print ?? s.print,
      // Merge rather than replace: a gallery from an older version may not know about
      // lights added since, and those should keep their defaults.
      lights: { ...s.lights, ...next.lights },
      // Checked rather than trusted, as the theme is: a missing or out-of-range level
      // (galleries from before the slider) keeps whatever the viewer has now.
      lightLevel:
        Number.isInteger(next.lightLevel) &&
        (next.lightLevel as number) >= 0 &&
        (next.lightLevel as number) < LIGHT_LEVELS.length
          ? (next.lightLevel as number)
          : s.lightLevel,
      // There is only the white room now; galleries saved in the old dark rooms open in it.
      studioTheme: 'white',
      camIndex: next.camIndex ?? s.camIndex,
      artIndex: next.artIndex ?? s.artIndex,
      station: next.station ?? null,
    };
  });
}
