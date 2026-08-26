import { type AxisBounds, OPEN_BOUNDS } from "./position";

/**
 * The arithmetic of a corner resize, with no DOM in it.
 *
 * On one axis the box is an interval `[leading, trailing]` of size `s`. A
 * gesture holds one point fixed and lets `s` vary, and **both edges are affine
 * in `s`** — which is the whole reason the default mode and the ALT mode are one
 * piece of code rather than two.
 *
 * Two parameters carry the mode, everywhere below:
 *
 * - `trailing` — whether the grabbed corner is this axis' trailing edge.
 * - `fraction` — the fixed point as a share of the box. `null` is the default
 *   mode, "hold the edge opposite the grabbed one". A number is the anchor's own
 *   share, which is ALT: `positionStyle` already translates the wrapper by that
 *   fraction of its own size, so holding it is what "resize from the anchor"
 *   means.
 */

/** Which corner the pointer grabbed. */
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * The smallest box a gesture may produce, in pixels.
 *
 * Not an arbitrary guard: below roughly twice the handle's own size the four
 * handles overlap and there is nothing left to grab. The drag needs no
 * equivalent — it cannot make an item disappear.
 */
export const RESIZE_FLOOR_PX = 24;

/** Guards a division by a gain that has collapsed; see `requestedSize`. */
const EPSILON = 1e-6;

/** A corner read as a pair of per-axis edges. */
export const cornerGrabs = (corner: Corner): { x: boolean; y: boolean } => ({
  x: corner === "top-right" || corner === "bottom-right",
  y: corner === "bottom-left" || corner === "bottom-right",
});

/** The point this axis holds still for the whole gesture. */
export const fixedPoint = (
  origin: number,
  size: number,
  trailing: boolean,
  fraction: number | null,
): number => (fraction === null ? (trailing ? origin : origin + size) : origin + fraction * size);

/**
 * The size the pointer is asking for on one axis.
 *
 * `gain` is how much of a size change the grabbed edge actually travels: all of
 * it when the opposite edge is held, and only its share of the box when the
 * anchor is. **Undefined when that gain collapses** — anchor on the trailing
 * edge with the trailing edge grabbed, and its mirror. The grabbed edge is then
 * the fixed point, it cannot move, and this axis has nothing to say about the
 * size. Callers drop the axis rather than divide by zero.
 */
export const requestedSize = (
  pointer: number,
  fixed: number,
  trailing: boolean,
  fraction: number | null,
): number | undefined => {
  const gain = fraction === null ? 1 : trailing ? 1 - fraction : fraction;
  if (Math.abs(gain) < EPSILON) return undefined;
  return (trailing ? pointer - fixed : fixed - pointer) / gain;
};

/** Where both edges sit for a given size. */
export const edgeAt = (
  fixed: number,
  size: number,
  trailing: boolean,
  fraction: number | null,
): { leading: number; trailing: number } => {
  const slopes = edgeSlopes(trailing, fraction);
  return {
    leading: fixed + slopes.leading * size,
    trailing: fixed + slopes.trailing * size,
  };
};

/**
 * Each edge's rate of travel against the size. The pair is the affine form the
 * clamp inverts, and `edgeAt` is the same two lines evaluated.
 */
export const edgeSlopes = (
  trailing: boolean,
  fraction: number | null,
): { leading: number; trailing: number } =>
  fraction === null
    ? trailing
      ? { leading: 0, trailing: 1 }
      : { leading: -1, trailing: 0 }
    : { leading: -fraction, trailing: 1 - fraction };

/**
 * The sizes for which an affine edge stays inside its bounds.
 *
 * A falling edge swaps the ends: the largest size puts it lowest. An edge that
 * does not move constrains nothing — which is the ALT case where the anchor
 * sits exactly on it, and the default case for the edge being held.
 */
export const sizeRange = (base: number, slope: number, bounds: AxisBounds): AxisBounds => {
  if (Math.abs(slope) < EPSILON) return OPEN_BOUNDS;
  const a = (bounds.lo - base) / slope || 0;
  const b = (bounds.hi - base) / slope || 0;
  return slope > 0 ? { lo: a, hi: b } : { lo: b, hi: a };
};

export const intersect = (a: AxisBounds, b: AxisBounds): AxisBounds => ({
  lo: Math.max(a.lo, b.lo),
  hi: Math.min(a.hi, b.hi),
});

/**
 * The single scale factor a ratio-locked gesture ends up with.
 *
 * **A ratio-locked resize has one degree of freedom**, so the two axes' requests
 * have to be reduced to one number before anything is applied. This is the
 * least-squares projection of `(sx, sy)` onto the ray through `(w₀, h₀)`:
 * minimising `‖k·(w₀,h₀) − (sx,sy)‖²` gives `k = (w₀·sx + h₀·sy) / (w₀² + h₀²)`,
 * which is the expression below written in terms of each axis' own scale.
 *
 * Clamping the two axes independently instead — the shape the drag rightly uses
 * for its two independent axes — leaves `w/h` off the locked ratio, and the
 * symptom reads as a rendering bug: the image stays proportioned toward the
 * middle of the picture and distorts progressively as a corner is pushed into a
 * border.
 *
 * An axis with no request is dropped rather than treated as zero; see
 * `requestedSize`.
 */
export const lockedScale = (
  requested: { x?: number; y?: number },
  box: { width: number; height: number },
): number | undefined => {
  const { width: w, height: h } = box;
  const kx = requested.x === undefined || w === 0 ? undefined : requested.x / w;
  const ky = requested.y === undefined || h === 0 ? undefined : requested.y / h;
  if (kx === undefined) return ky;
  if (ky === undefined) return kx;
  const denominator = w * w + h * h;
  return denominator === 0 ? undefined : (kx * w * w + ky * h * h) / denominator;
};

/**
 * A size as a percentage of the surface, rounded the way every stored number is.
 *
 * Not `toPercent`, which converts a *coordinate* and takes the anchor into
 * account. A size has no anchor.
 */
export const percentOfContainer = (px: number, container: number): number =>
  container === 0 ? 0 : Math.round((10000 * px) / container) / 100;
