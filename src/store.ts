import { create } from 'zustand';
import {
  ACRYLIC,
  LIGHT_PRESETS,
  PANEL_DEFAULTS,
  PEDESTAL_DEFAULTS,
  STUDIO_THEME_ORDER,
  type StudioTheme,
} from './scene/presets';
import type { ArtifactMeta, ArtworkMeta } from './library/db';
import type { SceneSettings } from './library/galleryFile';

/**
 * The state BP_PhotoViewerController holds — CurrentCamIndex, CurrentObjectIndex,
 * per-light on/off + intensity, pedestal dimensions, rotation and scale — plus what the
 * reflective level adds: the acrylic sheet's dimensions and placement, its optical
 * properties, and which artwork is printed on it.
 */
type ViewerState = {
  camIndex: number;
  nextCam: () => void;
  prevCam: () => void;

  lights: Record<string, { on: boolean; intensity: number }>;
  toggleLight: (id: string) => void;
  setLightIntensity: (id: string, v: number) => void;

  pedestal: { widthCm: number; lengthCm: number; heightCm: number };
  adjustPedestal: (key: 'widthCm' | 'lengthCm' | 'heightCm', dir: 1 | -1) => void;

  /**
   * The acrylic sheet. Height is absent on purpose — it is derived from the artwork's
   * aspect ratio in scene/panelGeometry.ts, because a sheet is cut to what is printed
   * on it.
   */
  panel: { widthCm: number; bottomCm: number; gapCm: number };
  adjustPanel: (key: 'widthCm' | 'bottomCm' | 'gapCm', dir: 1 | -1) => void;

  /** Fresnel F0 — the sheet's reflectance seen head-on. Z. */
  reflectance: number;
  adjustReflectance: (dir: 1 | -1) => void;

  /** Surface finish: 0 mirror-sharp, 1 strongly diffused. U. */
  polish: number;
  adjustPolish: (dir: 1 | -1) => void;

  /** Brightness of the printed artwork. X. */
  print: number;
  adjustPrint: (dir: 1 | -1) => void;

  /**
   * Unbounded step counter, not wrapped to 0..11. Letting it run past a full turn keeps
   * the animation monotonic, so stepping from 11 to 12 eases forward through 360° rather
   * than unwinding all the way back to zero.
   */
  rotationStep: number;
  stepRotation: (dir: 1 | -1) => void;

  /** Multiplier on the object's auto-fit scale — P / Shift+P in Unreal. */
  objectScale: number;
  adjustScale: (dir: 1 | -1) => void;

  studioTheme: StudioTheme;
  /** Advances through STUDIO_THEME_ORDER — B is a cycle, not a two-way switch. */
  toggleStudioTheme: () => void;

  /**
   * Hides the pedestal without moving the object, leaving it floating in front of the
   * sheet. The object keeps its seated height so toggling does not reframe the shot.
   */
  pedestalVisible: boolean;
  togglePedestal: () => void;

  /** Metadata only; the parsed scene graphs live in library/models.ts. */
  artifacts: ArtifactMeta[];
  objectIndex: number;
  setArtifacts: (a: ArtifactMeta[]) => void;
  addArtifactMeta: (a: ArtifactMeta) => void;
  removeArtifactMeta: (id: string) => void;
  stepObject: (dir: 1 | -1) => void;
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

  /** Progress for an in-flight import, shown as a modal. null when idle. */
  importing: { name: string; note: string } | null;
  setImporting: (v: { name: string; note: string } | null) => void;
  importError: string | null;
  setImportError: (v: string | null) => void;

  showGallery: boolean;
  toggleGallery: () => void;

  showHelp: boolean;
  toggleHelp: () => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Adjustment keys land on clean values rather than accumulating float drift. */
const stepTo = (v: number, dir: 1 | -1, step: number, lo: number, hi: number) =>
  clamp(Math.round((v + dir * step) / step) * step, lo, hi);

export const useViewer = create<ViewerState>((set) => ({
  camIndex: 0,
  nextCam: () => set((s) => ({ camIndex: s.camIndex + 1 })),
  prevCam: () => set((s) => ({ camIndex: s.camIndex - 1 })),

  lights: Object.fromEntries(
    LIGHT_PRESETS.map((l) => [l.id, { on: l.on, intensity: l.intensity }]),
  ),
  toggleLight: (id) =>
    set((s) => ({ lights: { ...s.lights, [id]: { ...s.lights[id], on: !s.lights[id].on } } })),
  setLightIntensity: (id, v) =>
    set((s) => ({ lights: { ...s.lights, [id]: { ...s.lights[id], intensity: v } } })),

  pedestal: {
    widthCm: PEDESTAL_DEFAULTS.widthCm,
    lengthCm: PEDESTAL_DEFAULTS.lengthCm,
    heightCm: PEDESTAL_DEFAULTS.heightCm,
  },
  adjustPedestal: (key, dir) =>
    set((s) => {
      const d = PEDESTAL_DEFAULTS;
      const bounds = {
        widthCm: [d.minWidthCm, d.maxWidthCm],
        lengthCm: [d.minLengthCm, d.maxLengthCm],
        heightCm: [d.minHeightCm, d.maxHeightCm],
      }[key];
      return {
        pedestal: {
          ...s.pedestal,
          [key]: clamp(s.pedestal[key] + dir * d.stepCm, bounds[0], bounds[1]),
        },
      };
    }),

  panel: {
    widthCm: PANEL_DEFAULTS.widthCm,
    bottomCm: PANEL_DEFAULTS.bottomCm,
    gapCm: PANEL_DEFAULTS.gapCm,
  },
  adjustPanel: (key, dir) =>
    set((s) => {
      const d = PANEL_DEFAULTS;
      const bounds = {
        widthCm: [d.minWidthCm, d.maxWidthCm],
        bottomCm: [d.minBottomCm, d.maxBottomCm],
        gapCm: [d.minGapCm, d.maxGapCm],
      }[key];
      return {
        panel: {
          ...s.panel,
          [key]: clamp(s.panel[key] + dir * d.stepCm, bounds[0], bounds[1]),
        },
      };
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

  rotationStep: 0,
  stepRotation: (dir) => set((s) => ({ rotationStep: s.rotationStep + dir })),

  objectScale: 1,
  adjustScale: (dir) => set((s) => ({ objectScale: clamp(s.objectScale + dir * 0.05, 0.25, 3) })),

  studioTheme: 'void',
  toggleStudioTheme: () =>
    set((s) => {
      const i = STUDIO_THEME_ORDER.indexOf(s.studioTheme);
      return { studioTheme: STUDIO_THEME_ORDER[(i + 1) % STUDIO_THEME_ORDER.length] };
    }),

  pedestalVisible: true,
  togglePedestal: () => set((s) => ({ pedestalVisible: !s.pedestalVisible })),

  artifacts: [],
  objectIndex: 0,
  setArtifacts: (artifacts) => set({ artifacts }),
  addArtifactMeta: (a) =>
    set((s) => ({
      artifacts: [...s.artifacts, a],
      // Jump to whatever was just added — the expected result of dropping a file in.
      objectIndex: s.artifacts.length,
    })),
  removeArtifactMeta: (id) =>
    set((s) => {
      const artifacts = s.artifacts.filter((a) => a.id !== id);
      return {
        artifacts,
        objectIndex: artifacts.length ? Math.min(s.objectIndex, artifacts.length - 1) : 0,
      };
    }),
  stepObject: (dir) =>
    set((s) => {
      if (s.artifacts.length === 0) return {};
      const n = s.artifacts.length;
      return { objectIndex: (((s.objectIndex + dir) % n) + n) % n };
    }),
  selectObject: (index) => set({ objectIndex: index }),

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

  importing: null,
  setImporting: (importing) => set({ importing }),
  importError: null,
  setImportError: (importError) => set({ importError }),

  showGallery: false,
  toggleGallery: () => set((s) => ({ showGallery: !s.showGallery })),

  showHelp: false,
  toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),
}));

/** The metadata for the object currently on the pedestal, if any. */
export const currentArtifact = (s: ViewerState): ArtifactMeta | undefined =>
  s.artifacts[s.objectIndex];

/** The artwork currently printed on the sheet, or undefined for a bare sheet. */
export const currentArtwork = (s: ViewerState): ArtworkMeta | undefined =>
  s.artIndex < 0 ? undefined : s.artworks[s.artIndex];

/** Everything a gallery export needs to reproduce how the curator staged the scene. */
export function captureSettings(): SceneSettings {
  const s = useViewer.getState();
  return {
    pedestal: { ...s.pedestal },
    pedestalVisible: s.pedestalVisible,
    panel: { ...s.panel },
    reflectance: s.reflectance,
    polish: s.polish,
    print: s.print,
    lights: structuredClone(s.lights),
    studioTheme: s.studioTheme,
    objectScale: s.objectScale,
    camIndex: s.camIndex,
    artIndex: s.artIndex,
  };
}

/** Restore a staged scene from an imported gallery, ignoring anything unrecognised. */
export function applySettings(next: SceneSettings | null): void {
  if (!next) return;
  useViewer.setState((s) => ({
    pedestal: { ...s.pedestal, ...next.pedestal },
    pedestalVisible: next.pedestalVisible ?? s.pedestalVisible,
    panel: { ...s.panel, ...next.panel },
    reflectance: next.reflectance ?? s.reflectance,
    polish: next.polish ?? s.polish,
    print: next.print ?? s.print,
    // Merge rather than replace: a gallery from an older version may not know about
    // lights added since, and those should keep their defaults.
    lights: { ...s.lights, ...next.lights },
    // Checked against the known themes rather than trusted: the field is a plain string
    // in the gallery format, and a file written by a newer version may name one this
    // build has never heard of.
    studioTheme: STUDIO_THEME_ORDER.includes(next.studioTheme as StudioTheme)
      ? (next.studioTheme as StudioTheme)
      : 'void',
    objectScale: next.objectScale ?? s.objectScale,
    camIndex: next.camIndex ?? s.camIndex,
    artIndex: next.artIndex ?? s.artIndex,
  }));
}
