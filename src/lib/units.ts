/**
 * The Unreal project works in centimetres (BP_AdjustablePedestal exposes WidthCm,
 * HeightCm, LengthCm). three.js lighting math behaves better in metres, so state is
 * stored in cm to stay comparable with the Blueprint and converted at the boundary.
 */
export const CM = 0.01;

/** Centimetres -> three.js world units (metres). */
export const cm = (v: number) => v * CM;