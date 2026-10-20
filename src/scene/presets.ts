/**
 * Scene data for the reflection setup, ported from LV_ReflectiveObjectCapture.
 *
 * PHASE 0 HANDOFF: the camera and light values below are reconstructions, not the real
 * ones. The Unreal level has 13 CineCameraActors plus a RectLight rig whose transforms,
 * FOV and intensities should replace these verbatim once captured from the Windows
 * machine (the project lives on the Duke SMB share — see CLAUDE.md). Everything here is
 * plain data specifically so that swap is an edit to this file and nothing else.
 *
 * ── World layout ────────────────────────────────────────────────────────────────
 * The acrylic sheet is the fixed landmark: its front face sits on the world plane
 * z = 0, facing +z. Everything else is described relative to it.
 *
 *        camera side (+z)                        behind the sheet (-z)
 *   ┌──────────────────────────────────────┬─────────────────────────┐
 *   │   camera        object on pedestal   │ acrylic     back wall   │
 *   │     ●  ────────▶   ▓  (faces -z)     │   ║            │        │
 *   │                    ↑ gapCm           │   ║ z=0        │ z=-0.08 │
 *   └──────────────────────────────────────┴─────────────────────────┘
 *
 * The object faces the sheet, so the camera sees its back directly and its front in the
 * reflection, overlaid on whatever is printed on the acrylic.
 */

export type CameraPreset = {
  name: string;
  /** metres, world space */
  position: [number, number, number];
  /** metres, world space — what the camera looks at */
  target: [number, number, number];
  /** vertical FOV, degrees */
  fov: number;
};

/** Front face of the acrylic sheet. The whole scene is laid out around this plane. */
export const PANEL_Z = 0;

/** Height of the composition's visual centre above the floor, metres. */
export const FOCUS_HEIGHT = 1.08;

/**
 * Where the cameras aim: between the object and the sheet, so a preset frames the piece
 * and its reflection together rather than centring on one and cropping the other.
 */
const F: [number, number, number] = [0, FOCUS_HEIGHT, 0.25];

/**
 * A flat mirror puts the reflected object directly behind the real one, so a camera on
 * the object's own axis sees the reflection perfectly eclipsed. **Every preset is
 * deliberately off-axis** — that is what separates the two images on screen. The one
 * near-frontal view, Print, exists to read the artwork itself rather than the overlay.
 *
 * Ordered so cycling sweeps one side at a time: the paired reflection views, then out
 * through the obliques and rakes, then the vertical pair, then the close pair, then the
 * three specials.
 */
export const CAMERA_PRESETS: CameraPreset[] = [
  { name: 'Reflection Right', position: [1.45, 1.3, 2.05], target: F, fov: 30 },
  { name: 'Reflection Left', position: [-1.45, 1.3, 2.05], target: F, fov: 30 },

  { name: 'Oblique Right', position: [2.05, 1.2, 1.45], target: F, fov: 28 },
  { name: 'Oblique Left', position: [-2.05, 1.2, 1.45], target: F, fov: 28 },

  // Low and wide to the side: the sheet is seen at a steep angle, so Fresnel drives its
  // reflectance up and the acrylic reads closest to a true mirror.
  { name: 'Raking Right', position: [2.45, 1.1, 0.8], target: F, fov: 26 },
  { name: 'Raking Left', position: [-2.45, 1.1, 0.8], target: F, fov: 26 },

  // Vertical pair. From above the reflection spills down the sheet; from below it rises.
  { name: 'Overlay High', position: [0.6, 2.05, 1.7], target: F, fov: 34 },
  { name: 'Overlay Low', position: [0.75, 0.8, 1.85], target: F, fov: 32 },

  { name: 'Close Right', position: [0.95, 1.2, 1.15], target: F, fov: 24 },
  { name: 'Close Left', position: [-0.95, 1.2, 1.15], target: F, fov: 24 },

  // Nearly square to the sheet — minimum Fresnel, so the print reads at full strength and
  // the reflection is at its faintest. The view for judging the artwork on its own.
  { name: 'Print', position: [0.3, 1.15, 2.75], target: [0, 1.05, 0], fov: 30 },

  { name: 'Wide', position: [1.6, 1.55, 3.1], target: [0, 1.0, 0.2], fov: 38 },

  // The extreme: almost in the plane of the sheet, where acrylic goes fully specular.
  { name: 'Grazing', position: [2.8, 1.15, 0.3], target: F, fov: 24 },
];

/**
 * The room. Unlike the baseline viewer this is not just a backdrop — the sheet reflects
 * it, so wall and floor colour show up twice and a bright room is a bright reflection
 * competing with the artwork.
 *
 * void      near-black on every surface. The reflection is the object and nothing else,
 *           floating on the print. The default, and the look the setup exists for.
 * gallery   dark warm grey with a readable floor, so the piece sits somewhere rather
 *           than nowhere. A little room shows in the sheet.
 * reveal    mid grey, lit enough to see the physical arrangement — sheet, pedestal,
 *           gap, mount height. For documentation and for rigging the shot, not display.
 */
export type StudioTheme = 'void' | 'gallery' | 'reveal';

/** Cycle order for B. void first: it is the display default. */
export const STUDIO_THEME_ORDER: StudioTheme[] = ['void', 'gallery', 'reveal'];

export const STUDIO_THEMES: Record<
  StudioTheme,
  {
    wall: string;
    floor: string;
    pedestal: string;
    background: string;
    envIntensity: number;
    /** Opacity of the grounding contact shadow, which needs to differ per background. */
    contactShadowOpacity: number;
  }
> = {
  void: {
    wall: '#050507',
    floor: '#050507',
    pedestal: '#08080a',
    background: '#030304',
    envIntensity: 0.03,
    contactShadowOpacity: 0.7,
  },
  gallery: {
    wall: '#14141a',
    floor: '#0d0d11',
    pedestal: '#101014',
    background: '#0a0a0e',
    envIntensity: 0.12,
    contactShadowOpacity: 0.6,
  },
  reveal: {
    wall: '#5a5d66',
    floor: '#3e4148',
    pedestal: '#2b2d33',
    background: '#484b53',
    envIntensity: 0.5,
    contactShadowOpacity: 0.45,
  },
};

/**
 * The acrylic sheet itself.
 *
 * Dimensions are in centimetres to match how a print is actually ordered. The height is
 * *derived*, not stored: with artwork loaded the sheet takes the image's aspect ratio,
 * because a sheet is cut to the piece printed on it. With no artwork it falls back to
 * FALLBACK_ASPECT so there is still a plausible sheet to look at.
 */
export const PANEL_DEFAULTS = {
  widthCm: 120,
  /** Height of the sheet's bottom edge above the floor. */
  bottomCm: 62,
  /** Distance from the sheet's face to the centre of the pedestal. */
  gapCm: 40,

  minWidthCm: 40,
  maxWidthCm: 240,
  minBottomCm: 0,
  maxBottomCm: 140,
  minGapCm: 8,
  maxGapCm: 120,
  stepCm: 5,

  /** width / height, used only when no artwork is loaded. */
  FALLBACK_ASPECT: 4 / 3,
};

/**
 * Optical properties of the sheet, and the defaults the three adjustment keys start from.
 *
 * `reflectance` is the Fresnel F0 — reflectance seen dead-on, before the grazing-angle
 * rise. Real polished acrylic is about 0.05 (n ≈ 1.49); the default sits above that
 * because these sheets are chosen and finished to act as display mirrors, and because a
 * physically exact 5% makes the overlay too faint to stage against. Z walks it across the
 * whole range, 0.04 being the honest value.
 */
export const ACRYLIC = {
  /** Base colour of the sheet where no artwork covers it. Near black, faintly cool. */
  color: '#04040a',

  /**
   * How much of the print survives the sheet — the single most important number here.
   *
   * The artwork is ink under a tinted substrate, not a poster on a wall, and dark cast
   * acrylic passes somewhere between 5% and 30% depending on how heavily it is smoked.
   * Without this term the print composites at full photographic brightness and the
   * reflection, which is only ever a fraction of an already dim object, is invisible
   * against it. That is the whole piece failing, so the value is set for the overlay to
   * read rather than for any particular sheet stock: X moves it either way from here.
   */
  transmission: 0.1,
  /** Tint applied to the reflection. Dark acrylic is close to neutral, barely cool. */
  reflectTint: '#eef1f8',
  /** Thin bright line along the cut edges, so the sheet reads as a physical object. */
  edgeGlow: 0.28,

  // Above the ~0.05 of honest polished acrylic. These sheets are chosen and finished to
  // act as display mirrors, and at the physical value the object's reflection does not
  // survive against the print. Z walks the whole range, 0.04 being the true value.
  reflectance: 0.28,
  minReflectance: 0.04,
  maxReflectance: 0.75,
  reflectanceStep: 0.02,

  /** 0 = mirror-sharp, 1 = strongly diffused. Polished acrylic is near the bottom. */
  polish: 0.18,
  minPolish: 0,
  maxPolish: 1,
  polishStep: 0.06,
  /** Blur radius in reflection-texture UV at polish = 1, once fully accumulated. */
  maxBlurUv: 0.024,

  /**
   * Metres of reflected path over which the sheet's scatter builds to its full radius.
   *
   * Reflection blur is not a property of the surface alone — it accumulates along the
   * distance the reflected ray travels, which is why an object pressed against acrylic
   * reads razor sharp and the far wall behind it is a smear. The sheet's finish sets how
   * hard it scatters; this sets how far that scattering takes to reach full strength.
   *
   * Sized against the object gap, which G walks from 8 cm to 120 cm: at the low end the
   * object is nearly at the sheet and its reflection is almost perfectly sharp, at the
   * high end it has picked up the full radius the finish allows. Shortening this makes
   * the object separate from its own reflection faster as it is pulled back.
   */
  blurDistanceM: 1.2,

  /** Multiplier on the printed artwork's brightness. */
  print: 1,
  minPrint: 0,
  maxPrint: 2.5,
  printStep: 0.1,

  /**
   * Resolution of the planar reflection pass, as a fraction of the canvas. The sheet is
   * re-rendering the whole scene every frame from a second camera, and the museum scans
   * run to millions of triangles — this is the dial that pays for that.
   *
   * At 1 the reflection is sampled at the same density as the canvas it is composited
   * into, which is what keeps a near-contact reflection genuinely sharp: below that the
   * sheet is magnifying a smaller image and no amount of narrowing the blur recovers the
   * detail. Drop it back toward 0.65 if a 5M-poly scan from `No Material/` drags.
   */
  reflectionScale: 1,
  maxReflectionPx: 2560,
};

/** BP_AdjustablePedestal defaults. PHASE 0: replace with the real cm values. */
export const PEDESTAL_DEFAULTS = {
  widthCm: 35,
  lengthCm: 35,
  heightCm: 95,
  minWidthCm: 20,
  maxWidthCm: 120,
  minLengthCm: 20,
  maxLengthCm: 120,
  minHeightCm: 40,
  maxHeightCm: 160,
  stepCm: 5,
};

export type LightPreset = {
  id: string;
  label: string;
  position: [number, number, number];
  /**
   * What the light points at. RectAreaLight emits along its local -Z, which is exactly
   * where Object3D.lookAt puts a target, so Lighting derives the rotation from this.
   * Aiming beats hand-written Euler angles here because the whole rig has to be re-aimed
   * whenever the sheet or the gap moves.
   */
  aimAt: [number, number, number];
  /** Overrides aimAt when the real Unreal rotation is known. Euler XYZ, radians. */
  rotation?: [number, number, number];
  /** metres */
  width: number;
  height: number;
  intensity: number;
  color: string;
  on: boolean;
};

/** Roughly where the object's mass sits, for aiming. */
const OBJ: [number, number, number] = [0, 1.12, 0.4];

/**
 * Mirrors the UE RectLight rig for the reflective level. RectAreaLight is the direct
 * analogue; RectAreaLightUniformsLib.init() must run once or these render black.
 *
 * The rig differs from the baseline viewer in one way that matters: what the camera sees
 * and what the sheet reflects are *different sides of the object*. The camera sees the
 * back; the reflection carries the front. So `reflect` exists purely to light the face
 * turned away from the viewer — without it the reflection is a silhouette.
 *
 * None of these light the print. The sheet runs a custom shader that composites the
 * artwork and the reflection and has no lighting model in it, so the print's brightness
 * is the X control and nothing else. See README, Known gaps.
 */
export const LIGHT_PRESETS: LightPreset[] = [
  {
    id: 'key',
    label: 'Key',
    position: [1.15, 2.0, 1.4],
    aimAt: OBJ,
    width: 0.7,
    height: 0.9,
    intensity: 20,
    color: '#fff4e8',
    on: true,
  },
  {
    id: 'fill',
    label: 'Fill',
    position: [-1.3, 1.4, 1.25],
    aimAt: OBJ,
    width: 0.7,
    height: 0.7,
    intensity: 5,
    color: '#eaf0ff',
    on: true,
  },
  {
    // The one this level adds. It sits high and slightly behind the object, angled down
    // at the side facing the sheet — the side the reflection is made of. Turning it off
    // is the fastest way to see what it is for: the overlay collapses to a dark shape.
    id: 'reflect',
    label: 'Reflection key',
    position: [-0.55, 1.95, -0.35],
    aimAt: [0, 1.05, 0.42],
    width: 0.6,
    height: 0.7,
    intensity: 15,
    color: '#fff0e0',
    on: true,
  },
  {
    // FrontLight / bFrontLightOn / SavedFrontIntensity from BP_PhotoViewerController —
    // defined there but bound to no key, and living in this level rather than the
    // baseline one. Off by default; F switches it on. It lights the object's camera-side
    // face, which flattens form but is what you want for reading surface detail.
    id: 'front',
    label: 'Front',
    position: [0, 1.4, 1.95],
    aimAt: OBJ,
    width: 0.8,
    height: 0.8,
    intensity: 9,
    color: '#fff6ec',
    on: false,
  },
  {
    // Stands in for the Lumen bounce off the pedestal top that three.js has no GI for.
    // Kept weak and close so it lifts the object's underside without lighting the
    // pedestal — which the sheet would then reflect.
    id: 'bounce',
    label: 'Bounce',
    position: [0, 1.0, 0.72],
    aimAt: [0, 1.35, 0.4],
    width: 0.5,
    height: 0.35,
    intensity: 2,
    color: '#ffe9d5',
    on: true,
  },
];

/**
 * The object is turned to face the sheet: its front goes into the reflection, its back to
 * the camera. That is the premise of the whole setup, so it is the resting orientation
 * rather than something the curator has to dial in. Six presses of R turns it around.
 */
export const FACE_PANEL_YAW_DEG = 180;

/**
 * R steps the object around a full turn in fixed increments rather than spinning it, so
 * any given angle is repeatable. Yaw only; the object stays upright.
 *
 * 12 steps = 30° each, matching the 0,30,0 rotation rate BP_RotatingObject used.
 */
export const ROTATION_STEPS = 12;
export const ROTATION_STEP_DEG = 360 / ROTATION_STEPS;
