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

/**
 * The keys that decide whether a live camera is forcing the ratio. Structural,
 * because three very different readers ask the question — the card that writes
 * the box, the element that picks a fit mode, and the form that shows the
 * checkbox — and none of them should have to know the others' types.
 */
export interface LiveCameraKeys {
  camera_image?: string;
  camera_view?: "auto" | "live";
}

/**
 * A live camera keeps its own proportions, whatever height the config asks for.
 *
 * Not our choice: `hui-image` holds its `.ratio` container for a stream, because
 * no `<img>` ever loads to settle `_lastImageHeight`, and that container ignores
 * an imposed height. Measured on frontend 20260729.6 against a real camera — in
 * a box asked to be 196×49, the container came out 196×110.3 and
 * `ha-camera-stream` 196×0.
 *
 * **One predicate, four readers.** The card writes the box from it, the element
 * picks its fit mode from it, the form disables its checkbox from it, and
 * `applyLiveCameraRatio` gates its ratio correction on it. Four copies of this
 * condition would eventually disagree, and the disagreement would be invisible:
 * each of the four is correct on its own.
 */
export const ratioIsForced = (config: LiveCameraKeys): boolean =>
  config.camera_view === "live" && !!config.camera_image;

/**
 * The box as it will actually be drawn.
 *
 * A forced ratio drops the height for RENDERING only. The stored `height` is
 * left exactly where the user typed it, so switching the camera back to Auto
 * restores it — `storedConfig` rewrites the whole config on every commit, so
 * dropping the key here would delete it from the user's YAML, and a round trip
 * through the editor would silently cost them a value they set.
 */
export const effectiveBox = (config: ImageBox & LiveCameraKeys): ImageBox =>
  ratioIsForced(config) ? { width: config.width } : config;

/**
 * Whether an edit has to hold the item's top-left, because it changed the drawn
 * box **without anyone asking for that size**.
 *
 * The rule the card follows everywhere else is that a change to an item's box
 * holds its top-left, not its anchor point — the resize gesture's rule, since
 * without ALT a corner drag holds the corner opposite the grabbed one and
 * ignores the anchor. Two edits in the form break it today: switching a camera
 * in or out of Live, where `effectiveBox` starts or stops dropping the height
 * and nothing stored changes at all; and the keep-ratio checkbox, which deletes
 * the height and returns.
 *
 * **The width and height fields are deliberately NOT in that set.** Typing a
 * size grows the box around the anchor, which is the keyboard's equivalent of
 * holding ALT on a corner handle — and the only one there is, since a form has
 * no modifiers. Making them hold the top-left too would be one rule instead of
 * two, and would take that away.
 *
 * Telling the two apart needs nothing but the two configs, because the form
 * **hides** the height field while keep-ratio is ticked: a height key that
 * appears or disappears can only be the checkbox, and a height that moves from
 * one number to another can only be the field.
 */
export const mustHoldTopLeft = (
  prev: ImageBox & LiveCameraKeys,
  next: ImageBox & LiveCameraKeys,
): boolean => {
  if (next.width !== prev.width) return false;
  if (prev.height !== undefined && next.height !== undefined && next.height !== prev.height) {
    return false;
  }
  const before = effectiveBox(prev);
  const after = effectiveBox(next);
  return before.width !== after.width || before.height !== after.height;
};
