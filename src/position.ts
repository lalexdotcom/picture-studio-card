/**
 * Positions are percentages, and the anchor decides what they are a percentage
 * *of*. Under `proportional` — the default, and the only behaviour there used to
 * be — the anchor follows the coordinate: 0 is flush with the top-left corner,
 * 50 centered, 100 flush with the bottom-right, so a coordinate inside 0-100
 * cannot overflow at any container size. Every fixed anchor pins the translate
 * instead, which is what makes `left: 50%` mean "this item's centre sits at the
 * middle of the image" — and makes overflow expressible.
 */
export interface Position {
  top: number;
  left: number;
}

export const DEFAULT_POSITION: Position = { top: 50, left: 50 };

/** How a position is written back to YAML: "30%" reads better than 30. */
export interface StoredPosition {
  top: string;
  left: string;
}

/** Where the item's own box is pinned to its coordinates. */
export type Anchor =
  | "proportional"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const DEFAULT_ANCHOR: Anchor = "proportional";

/** Each fixed anchor as a percentage of the item's own size, per axis. */
export const ANCHOR_OFFSETS: Record<Exclude<Anchor, "proportional">, { x: number; y: number }> = {
  "top-left": { x: 0, y: 0 },
  "top-center": { x: 50, y: 0 },
  "top-right": { x: 100, y: 0 },
  "center-left": { x: 0, y: 50 },
  center: { x: 50, y: 50 },
  "center-right": { x: 100, y: 50 },
  "bottom-left": { x: 0, y: 100 },
  "bottom-center": { x: 50, y: 100 },
  "bottom-right": { x: 100, y: 100 },
};

/**
 * Read a stored anchor. `Object.hasOwn` and not `in`: every object literal
 * inherits `toString`, and `"toString" in ANCHOR_OFFSETS` is true.
 */
export const parseAnchor = (raw: unknown): Anchor => {
  if (raw === "proportional") return "proportional";
  return typeof raw === "string" && Object.hasOwn(ANCHOR_OFFSETS, raw)
    ? (raw as Anchor)
    : DEFAULT_ANCHOR;
};

/** One component of an anchor. `null` is proportional: the offset is the coordinate. */
export const axisOffset = (anchor: Anchor, axis: "x" | "y"): number | null =>
  anchor === "proportional" ? null : ANCHOR_OFFSETS[anchor][axis];

/**
 * Read a stored coordinate. A hand-written config may say 30, "30" or "30%";
 * anything else — a missing key, a typo, an object — falls back rather than
 * placing the badge somewhere arbitrary.
 *
 * Out-of-range values pass through. A fixed anchor makes them meaningful, and
 * clamping here would silently rewrite what someone typed — the same reason we
 * serialise percent strings back instead of normalising them away.
 */
export const parsePercent = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;
  if (typeof raw !== "string") return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
};

/** Two decimals is the precision the drag produces; trailing zeros never appear. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Keeping the drag's precision means a gesture survives the round trip
 * untouched. No bound here either: it would put an overflowing item back on the
 * way out, undoing what parsePercent just let through.
 */
export const percentString = (value: number): string => `${round2(value)}%`;

export const storedPosition = (position: Position): StoredPosition => ({
  top: percentString(position.top),
  left: percentString(position.left),
});

/** The travel available to the element inside the container, never negative. */
const span = (container: number, element: number): number => Math.max(0, container - element);

/** The pixel interval a drag may move within, on one axis. */
export interface AxisBounds {
  lo: number;
  hi: number;
}

/** A gesture starts unbounded; the first pointermove closes these in. */
export const OPEN_BOUNDS: AxisBounds = {
  lo: Number.NEGATIVE_INFINITY,
  hi: Number.POSITIVE_INFINITY,
};

/**
 * Close the bounds around where the item currently is. The interval only ever
 * shrinks toward [0, span]: an item that already overflows can be pulled back
 * but never pushed further out, and once it is inside it cannot leave again.
 */
export const tighten = (
  bounds: AxisBounds,
  current: number,
  container: number,
  element: number,
): AxisBounds => ({
  lo: Math.max(bounds.lo, Math.min(0, current)),
  hi: Math.min(bounds.hi, Math.max(span(container, element), current)),
});

/**
 * One pointermove. Tightening around `current` rather than around the position
 * the pointer is asking for is what makes the ceiling stick to where the item
 * *is* instead of following the cursor out of the image.
 */
export const advance = (
  raw: number,
  current: number,
  bounds: AxisBounds,
  container: number,
  element: number,
): { px: number; bounds: AxisBounds } => {
  const next = tighten(bounds, current, container, element);
  return { px: Math.min(Math.max(raw, next.lo), next.hi), bounds: next };
};

/** Coordinate to the pixel offset of the item's leading edge. */
export const toPx = (
  percent: number,
  container: number,
  element: number,
  offset: number | null,
): number =>
  offset === null
    ? (span(container, element) * percent) / 100
    : (container * percent) / 100 - (element * offset) / 100;

/**
 * The inverse of toPx. Both degenerate cases answer 0: a proportional item as
 * large as its container has nowhere to go, and a container of zero has no
 * scale to express anything against.
 */
export const toPercent = (
  px: number,
  container: number,
  element: number,
  offset: number | null,
): number => {
  if (offset === null) {
    const free = span(container, element);
    return free === 0 ? 0 : round2((100 * px) / free);
  }
  return container === 0 ? 0 : round2((100 * (px + (element * offset) / 100)) / container);
};

/**
 * Re-express a position under a different anchor without moving the item.
 * Exact in every case, including an item that already overflows, because
 * percentages are unbounded.
 */
export const reanchor = (
  position: Position,
  from: Anchor,
  to: Anchor,
  container: { width: number; height: number },
  element: { width: number; height: number },
): Position => ({
  left: toPercent(
    toPx(position.left, container.width, element.width, axisOffset(from, "x")),
    container.width,
    element.width,
    axisOffset(to, "x"),
  ),
  top: toPercent(
    toPx(position.top, container.height, element.height, axisOffset(from, "y")),
    container.height,
    element.height,
    axisOffset(to, "y"),
  ),
});

/** Derive the CSS. Never stored — always computed from the stored numbers. */
export const positionStyle = (
  p: Position,
  anchor: Anchor,
): { top: string; left: string; transform: string } => ({
  top: `${p.top}%`,
  left: `${p.left}%`,
  transform: `translate(-${axisOffset(anchor, "x") ?? p.left}%, -${axisOffset(anchor, "y") ?? p.top}%)`,
});
