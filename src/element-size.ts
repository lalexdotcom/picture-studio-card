/**
 * An icon's size, in the two halves of the contract: the card declares
 * `container-type: inline-size` on `.root`, the element derives this clamp.
 * `1cqw` is 1% of `.root`'s width, so the size follows the card — which `vw`,
 * following the window, cannot do in a sections view.
 */
export interface ElementSize {
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

/**
 * Measured on the card itself rather than inherited: the picture-elements
 * workaround this design replaces used 40 / 3.5 / 70, but those were bounds
 * chosen against the viewport. Against the card, a steeper ratio between tighter
 * bounds holds the icon's proportion across column widths.
 */
export const DEFAULT_ICON_SIZE: ElementSize = {
  mode: "auto",
  ratio: 8,
  min: 24,
  max: 48,
  value: 48,
};

/**
 * A label's own defaults. Half the icon's ratio, so a label reads at roughly
 * half an icon's height standing beside it, with a floor that stays legible and
 * a ceiling that stops a wide card from turning a label into a headline.
 */
export const DEFAULT_LABEL_SIZE: ElementSize = {
  mode: "auto",
  ratio: 4,
  min: 11,
  max: 20,
  value: 14,
};

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Keeps what it was given: `auto` is an override at render, never an erasure. */
export const normalizeElementSize = (raw: unknown, defaults: ElementSize): ElementSize => {
  if (typeof raw !== "object" || raw === null) return { ...defaults };
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
    ratio: finite(size.ratio, defaults.ratio),
    min: finite(size.min, defaults.min),
    max: finite(size.max, defaults.max),
    value: finite(size.value, defaults.value),
  };
};

/**
 * All five fields, not just `mode`: a size can be automatic and still carry
 * numbers the user typed, and dropping it from the stored config would lose them.
 */
export const isDefaultElementSize = (size: ElementSize, defaults: ElementSize): boolean =>
  size.mode === defaults.mode &&
  size.min === defaults.min &&
  size.ratio === defaults.ratio &&
  size.max === defaults.max &&
  size.value === defaults.value;

/**
 * The only reader of `auto`, and the whole of the override: under it the card's
 * defaults are substituted for this render, and the configured numbers wait
 * untouched for the switch to come off.
 *
 * `min > max` is left as written: CSS clamp() returns the minimum in that case,
 * and rejecting a value while the user is still typing it is worse than the
 * documented behaviour.
 */
export const elementSizeCss = (size: ElementSize, defaults: ElementSize): string => {
  if (size.mode === "fixed") return `${size.value}px`;
  if (size.mode === "auto") {
    const { min, ratio, max } = defaults;
    return `clamp(${min}px, ${ratio}cqw, ${max}px)`;
  }
  // adaptive
  return `clamp(${size.min}px, ${size.ratio}cqw, ${size.max}px)`;
};
