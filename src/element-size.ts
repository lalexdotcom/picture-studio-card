/**
 * An icon's size, in the two halves of the contract: the card declares
 * `container-type: inline-size` on `.root`, the element derives this clamp.
 * `1cqw` is 1% of `.root`'s width, so the size follows the card — which `vw`,
 * following the window, cannot do in a sections view.
 */
export interface IconSize {
  auto: boolean;
  /** px */
  min: number;
  /** % of the card's width */
  ratio: number;
  /** px */
  max: number;
}

/** The production values this design starts from; tunable once measured. */
export const DEFAULT_ICON_SIZE: IconSize = { auto: true, min: 40, ratio: 3.5, max: 70 };

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Keeps what it was given: `auto` is an override at render, never an erasure. */
export const normalizeIconSize = (raw: unknown): IconSize => {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_ICON_SIZE };
  const size = raw as Partial<Record<keyof IconSize, unknown>>;
  return {
    auto: size.auto !== false,
    min: finite(size.min, DEFAULT_ICON_SIZE.min),
    ratio: finite(size.ratio, DEFAULT_ICON_SIZE.ratio),
    max: finite(size.max, DEFAULT_ICON_SIZE.max),
  };
};

/**
 * All four fields, not just `auto`: a size can be automatic and still carry
 * numbers the user typed, and dropping it from the stored config would lose them.
 */
export const isDefaultIconSize = (size: IconSize): boolean =>
  size.auto === DEFAULT_ICON_SIZE.auto &&
  size.min === DEFAULT_ICON_SIZE.min &&
  size.ratio === DEFAULT_ICON_SIZE.ratio &&
  size.max === DEFAULT_ICON_SIZE.max;

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
  const { min, ratio, max } = size.auto ? DEFAULT_ICON_SIZE : size;
  return `clamp(${min}px, ${ratio}cqw, ${max}px)`;
};
