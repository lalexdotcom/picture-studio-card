import { parsePercent } from "./position";

/**
 * An image element's box, both numbers a percentage of the background: `width`
 * of its width, `height` of its height.
 *
 * **`height` absent IS the keep-ratio mode**, rendered as `height: auto` so the
 * browser holds the image's natural ratio exactly, for free, whatever the
 * background is. There is deliberately no boolean beside it: a checkbox *and* a
 * height would be two sources for one fact, and a hand-written YAML would
 * eventually make them contradict each other.
 *
 * The editor's checkbox is therefore derived, never stored — and it survives its
 * own removal: at sub-project 2 keep-ratio becomes the constrained default of the
 * corner handle, and nothing here changes.
 */
export interface ImageBox {
  width: number;
  height?: number;
}

/**
 * A fifth of the background: large enough to see and to grab, small enough not
 * to cover what is already placed.
 */
export const DEFAULT_IMAGE_WIDTH = 20;

/**
 * Neither number is bounded above, and that is the rule positions already
 * follow: `parsePercent` does not clamp, because clamping on the way out would
 * put an overflowing item back and rewrite the user's YAML.
 *
 * The one guard is `> 0`. A zero or negative box is not a value the user meant,
 * it is an element that cannot be drawn or grabbed.
 */
const positivePercent = (raw: unknown): number | undefined => {
  const value = parsePercent(raw, Number.NaN);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

export const normalizeImageBox = (raw: Record<string, unknown>): ImageBox => {
  const width = positivePercent(raw.width) ?? DEFAULT_IMAGE_WIDTH;
  const height = positivePercent(raw.height);
  // The key is omitted rather than set to undefined: `"height" in config` is the
  // predicate the form's checkbox and the card's fit mode both read.
  return height === undefined ? { width } : { width, height };
};

/**
 * The three declarations the card writes on the item wrapper.
 *
 * `max-height: 100%` applies in keep-ratio mode only, and it guards exactly one
 * thing: the image file's own ratio, which is the single input channel neither a
 * gesture's clamp nor the config's deliberate non-clamping can reach. A 1:10
 * banner at `width: 50` would otherwise make the card scroll five times its own
 * height from a value nobody typed wrong.
 *
 * It bounds the render, never the config — it stores nothing and undoes itself
 * the moment the width changes.
 */
export const imageBoxStyle = (
  box: ImageBox,
): { width: string; height: string; maxHeight: string } =>
  box.height === undefined
    ? { width: `${box.width}%`, height: "", maxHeight: "100%" }
    : { width: `${box.width}%`, height: `${box.height}%`, maxHeight: "" };
