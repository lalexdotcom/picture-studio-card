/**
 * An icon's size, in the two halves of the contract: the card declares
 * `container-type: inline-size` on `.root`, the element derives this clamp.
 * `1cqw` is 1% of `.root`'s width, so the size follows the card — which `vw`,
 * following the window, cannot do in a sections view.
 */
export interface IconSize {
  /** "auto" uses the card's defaults; "adaptive" clamps own min/ratio/max; "fixed" is exact pixels. */
  mode: "auto" | "adaptive" | "fixed";
  /** adaptive only — % of the card's width */
  ratio: number;
  /** adaptive only — px */
  min: number;
  /** adaptive only — px */
  max: number;
  /** fixed only — px */
  value: number;
}

/** The production values this design starts from; tunable once measured. */
export const DEFAULT_ICON_SIZE: IconSize = {
  mode: "auto",
  ratio: 3.5,
  min: 40,
  max: 70,
  value: 48,
};

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Keeps what it was given: `auto` is an override at render, never an erasure. */
export const normalizeIconSize = (raw: unknown): IconSize => {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_ICON_SIZE };
  // Use string-keyed record so we can read both the new `mode` field and the
  // legacy `auto` field without TypeScript narrowing complaints.
  const size = raw as Partial<Record<string, unknown>>;

  // Read-compatibility path for configs written during development with
  // { auto: true, … } or { auto: false, … }:
  //   auto: true  → mode: "auto"
  //   auto: false → mode: "adaptive"
  // Never written back out; the normalised form always uses `mode`.
  let mode: "auto" | "adaptive" | "fixed";
  if ("auto" in size) {
    mode = size.auto !== false ? "auto" : "adaptive";
  } else {
    const m = size.mode;
    mode = m === "auto" || m === "adaptive" || m === "fixed" ? m : "auto";
  }

  return {
    mode,
    ratio: finite(size.ratio, DEFAULT_ICON_SIZE.ratio),
    min: finite(size.min, DEFAULT_ICON_SIZE.min),
    max: finite(size.max, DEFAULT_ICON_SIZE.max),
    value: finite(size.value, DEFAULT_ICON_SIZE.value),
  };
};

/**
 * All five fields, not just `mode`: a size can be automatic and still carry
 * numbers the user typed, and dropping it from the stored config would lose them.
 */
export const isDefaultIconSize = (size: IconSize): boolean =>
  size.mode === DEFAULT_ICON_SIZE.mode &&
  size.min === DEFAULT_ICON_SIZE.min &&
  size.ratio === DEFAULT_ICON_SIZE.ratio &&
  size.max === DEFAULT_ICON_SIZE.max &&
  size.value === DEFAULT_ICON_SIZE.value;

/**
 * The only reader of `auto`, and the whole of the override: under it the card's
 * defaults are substituted for this render, and the configured numbers wait
 * untouched for the switch to come off.
 *
 * `min > max` is left as written: CSS clamp() returns the minimum in that case,
 * and rejecting a value while the user is still typing it is worse than the
 * documented behaviour.
 */
export const iconSizeCss = (size: IconSize): string => {
  if (size.mode === "fixed") return `${size.value}px`;
  if (size.mode === "auto") {
    const { min, ratio, max } = DEFAULT_ICON_SIZE;
    return `clamp(${min}px, ${ratio}cqw, ${max}px)`;
  }
  // adaptive
  return `clamp(${size.min}px, ${size.ratio}cqw, ${size.max}px)`;
};
