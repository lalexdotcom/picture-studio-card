/**
 * Positions use proportional anchoring, the semantics of CSS background-position:
 * 0 is flush with the top-left corner, 50 is centered, 100 is flush with the
 * bottom-right corner. This makes overflow structurally impossible at any
 * container size, with no runtime clamping.
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

export const clampPercent = (value: number): number => Math.min(Math.max(value, 0), 100);

/**
 * Read a stored coordinate. A hand-written config may say 30, "30" or "30%";
 * anything else — a missing key, a typo, an object — falls back rather than
 * placing the badge somewhere arbitrary.
 */
export const parsePercent = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number") return Number.isFinite(raw) ? clampPercent(raw) : fallback;
  if (typeof raw !== "string") return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? clampPercent(value) : fallback;
};

/**
 * Two decimals is the precision the drag itself produces; keeping it means a
 * gesture survives the round trip untouched, and trailing zeros never appear.
 */
export const percentString = (value: number): string =>
  `${Math.round(clampPercent(value) * 100) / 100}%`;

export const storedPosition = (position: Position): StoredPosition => ({
  top: percentString(position.top),
  left: percentString(position.left),
});

/** The travel available to the element inside the container, never negative. */
const span = (container: number, element: number): number => Math.max(0, container - element);

/** Clamp a pixel offset to the free span. */
export const clampPx = (px: number, container: number, element: number): number =>
  Math.min(Math.max(px, 0), span(container, element));

/**
 * Convert a pixel offset to a proportional percentage.
 * Degenerate case: an element as large as its container has nowhere to go.
 */
export const toPercent = (px: number, container: number, element: number): number => {
  const free = span(container, element);
  if (free === 0) return 0;
  const ratio = (100 * px) / free;
  return Math.round(Math.min(Math.max(ratio, 0), 100) * 100) / 100;
};

/** Derive the CSS. Never stored — always computed from the stored numbers. */
export const positionStyle = (p: Position): { top: string; left: string; transform: string } => ({
  top: `${p.top}%`,
  left: `${p.left}%`,
  transform: `translate(-${p.left}%, -${p.top}%)`,
});
