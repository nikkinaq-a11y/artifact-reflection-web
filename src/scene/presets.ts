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
 * Ordered as one sweep around the piece, so C never throws the camera from one side to
 * the other: out along the right (Reflection → Close → Oblique → Raking → Grazing), back
 * in through the centre views (Wide, the vertical pair, Print), then out along the left.
 * Angles from the subject: right +39° … +89°, centre +29° … +6°, left −39° … −77°. The
 * only long move is the wrap from Raking Left back to the start, and CameraRig blends
 * along an arc round the subject, never through it.
 */
export const CAMERA_PRESETS: CameraPreset[] = [
  // ── Right side, outward ──
  { name: 'Reflection Right', position: [1.45, 1.3, 2.05], target: F, fov: 30 },
  { name: 'Close Right', position: [0.95, 1.2, 1.15], target: F, fov: 24 },
  { name: 'Oblique Right', position: [2.05, 1.2, 1.45], target: F, fov: 28 },
  // Low and wide to the side: the sheet is seen at a steep angle, so Fresnel drives its
  // reflectance up and the acrylic reads closest to a true mirror.
  { name: 'Raking Right', position: [2.45, 1.1, 0.8], target: F, fov: 26 },
  // The extreme: almost in the plane of the sheet, where acrylic goes fully specular.
  { name: 'Grazing', position: [2.8, 1.15, 0.3], target: F, fov: 24 },

  // ── Centre, coming back round ──
  { name: 'Wide', position: [1.6, 1.55, 3.1], target: [0, 1.0, 0.2], fov: 38 },
  // Vertical pair. From above the reflection spills down the sheet; from below it rises.
  { name: 'Overlay High', position: [0.6, 2.05, 1.7], target: F, fov: 34 },
  { name: 'Overlay Low', position: [0.75, 0.8, 1.85], target: F, fov: 32 },
  // Nearly square to the sheet — minimum Fresnel, so the print reads at full strength and
  // the reflection is at its faintest. The view for judging the artwork on its own.
  { name: 'Print', position: [0.3, 1.15, 2.75], target: [0, 1.05, 0], fov: 30 },

  // ── Left side, outward ──
  { name: 'Reflection Left', position: [-1.45, 1.3, 2.05], target: F, fov: 30 },
  { name: 'Close Left', position: [-0.95, 1.2, 1.15], target: F, fov: 24 },
  { name: 'Oblique Left', position: [-2.05, 1.2, 1.45], target: F, fov: 28 },
  { name: 'Raking Left', position: [-2.45, 1.1, 0.8], target: F, fov: 26 },
];

/**
 * The room. Unlike the baseline viewer this is not just a backdrop — the sheet reflects
 * it, so wall and floor colour show up twice.
 *
 * There is one room, by decision (Nikki, 2026-10-25): the real install — white walls, a
 * grey concrete floor, white pedestals, a light grey plinth, as in the BM38–49 elevation
 * drawings. The sheet reflects all of it, which is what a visitor actually sees. Lit like a
 * gallery rather than a lightbox, because it is used for marketing: warm off-white paint,
 * little flat fill, and track-light wall washes that pool around the piece and fall off
 * toward the room's edges. The earlier void / gallery / reveal rooms and the B key that
 * cycled them are gone.
 */
export type StudioTheme = 'white';

export const STUDIO_THEMES: Record<
  StudioTheme,
  {
    wall: string;
    floor: string;
    pedestal: string;
    /** The riser on top of the pedestal — FCME bases are drawn grey, FJM white. */
    base: string;
    /** The floor platform the station stands on. */
    plinth: string;
    background: string;
    envIntensity: number;
    /** Opacity of the grounding contact shadow. */
    contactShadowOpacity: number;
    /** Tone-mapping exposure — a touch under 1 keeps the paint off pure white. */
    exposure: number;
    /** A concrete floor carries a faint sheen. */
    floorRoughness: number;
    /** Intensity of the overhead wall-wash lights. See WALL_WASH. */
    wallWash: number;
  }
> = {
  white: {
    // Gallery white is a warm off-white, never #fff — a painted wall reads as paint only
    // when it holds some tone, and the light pooling on it carries the realism.
    wall: '#dbd7cf',
    // Polished concrete, the usual museum floor: mid grey, so pedestals sit on something.
    floor: '#8a857c',
    // A step down from the wall, as painted MDF plinths are, so they never merge into it.
    pedestal: '#dcd8d0',
    base: '#aeacb1',
    plinth: '#bdb9b1',
    background: '#bfbbb3',
    envIntensity: 0.2,
    contactShadowOpacity: 0.6,
    exposure: 0.95,
    floorRoughness: 0.55,
    wallWash: 24,
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
  /**
   * Explicit sheet height, or null to derive it from the artwork's aspect ratio. A
   * station sets both, because the install plan gives the glass as H × W and some
   * sheets are a detail cut from a larger painting.
   */
  heightCm: null as number | null,
  /** Height of the sheet's bottom edge above the floor — or above the plinth, when on. */
  bottomCm: 62,

  minWidthCm: 20,
  maxWidthCm: 260,
  minHeightCm: 20,
  maxHeightCm: 260,
  minBottomCm: 0,
  maxBottomCm: 160,
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
  minWidthCm: 10,
  maxWidthCm: 150,
  minLengthCm: 10,
  maxLengthCm: 150,
  minHeightCm: 10,
  maxHeightCm: 160,
  stepCm: 5,
};

/**
 * The riser that sits on top of a pedestal — "Base FCME" / "Base FJM" in the install
 * plan, 10×20×20 to 25×35×30 cm. Off by default; the object stands on it when on.
 */
export const BASE_DEFAULTS = {
  widthCm: 20,
  lengthCm: 20,
  heightCm: 10,
  min: 2,
  max: 80,
  stepCm: 1,
};

/**
 * The floor platform under a station — the grey band along the bottom of every page of
 * the install plan. Pedestals and the sheet's mount height both measure from its top. A
 * rectangle sized to what stands on it (Nikki, 2026-10-25): the pedestals and the sheet
 * plus a side margin along the wall, and from the wall out to just past the frontmost
 * pedestal, so nothing ever overhangs its edge. It still meets the wall, so a sheet hung
 * at 0 cm (BM38) sits on it.
 */
export const PLINTH_DEFAULTS = {
  on: false,
  heightCm: 10,
  minHeightCm: 1,
  maxHeightCm: 60,
  stepCm: 1,
  /** How far the plinth runs past the front of the frontmost pedestal. */
  frontMarginCm: 20,
  /** How far the plinth runs past the outermost pedestal or sheet edge, each side. */
  sideMarginCm: 15,
  minDepthCm: 40,
};

/**
 * Where each object stands, and how far it can be moved. x is along the wall (0 is the
 * sheet's centre line), gap is out from the sheet's face to the pedestal's centre.
 */
export const PLACEMENT = {
  maxXCm: 300,
  maxGapCm: 200,
  /** Keeps the pedestal's back face this far off the sheet — it never touches the glass. */
  sheetClearanceCm: 1,
  /** Arrow keys move the active object this far; Shift moves it ten times as far. */
  nudgeCm: 1,
  /** G / Shift+G step the gap, as before. */
  gapStepCm: 5,
  /** Space left between two pedestals when the second object first appears. */
  pairSpacingCm: 20,
};

/** Shift-drag on an object turns it at this rate. Gentle: for correcting, not spinning. */
export const DRAG_DEG_PER_PX = 0.35;

/**
 * Track lights washing the wall, white room only: two warm rect lights high up and out
 * from the wall, angled down onto it either side of the sheet. They give the wall the
 * pool of light around a hung work, and the falloff into the corners, that a real
 * gallery has and an evenly lit room does not. Fixed to the wall, not the objects.
 */
export const WALL_WASH = {
  color: '#ffeedd',
  lights: [
    { position: [-1.1, 3.4, 1.6], aimAt: [-0.5, 1.2, -0.08] },
    { position: [1.1, 3.4, 1.6], aimAt: [0.5, 1.2, -0.08] },
  ] as { position: [number, number, number]; aimAt: [number, number, number] }[],
  width: 0.5,
  height: 0.5,
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
 * The lights and the camera presets above are authored around one object at OBJ — the
 * default pedestal, 40 cm out from the sheet. When the objects move, or a station puts
 * them on a 50 cm pedestal instead of a 95, the whole rig is carried along by the
 * difference between OBJ and where the objects actually are, so every preset keeps its
 * framing. In the default scene that difference is zero and nothing moves.
 */
export const RIG_ORIGIN = OBJ;
/** OBJ sits this far above the default pedestal's top — "where the mass is". */
export const SUBJECT_LIFT_M = 0.17;

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
 * Brightness: the baseline viewer's five-step slider, with the same logic — one multiplier
 * on the whole rig (rect lights, shadow spot, and the white room's wall washes; not the
 * environment). Steps rather than a free dial so a staged look can be named and repeated.
 *
 * Retuned with Nikki 2026-10-21: the top step is 0.8 of the rig's authored values (the
 * old step 4), everything below it dimmer, and step 1 very low for a near-dark look. The
 * default stays in the middle.
 */
export const LIGHT_LEVELS = [0.12, 0.3, 0.45, 0.6, 0.8];
export const DEFAULT_LIGHT_LEVEL = 2;

/**
 * R steps the object around a full turn in fixed increments rather than spinning it, so
 * any given angle is repeatable. Yaw only; the object stays upright.
 *
 * 12 steps = 30° each, matching the 0,30,0 rotation rate BP_RotatingObject used.
 */
export const ROTATION_STEPS = 12;
export const ROTATION_STEP_DEG = 360 / ROTATION_STEPS;
