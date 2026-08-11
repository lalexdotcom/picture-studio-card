/**
 * Positions use proportional anchoring, the semantics of CSS background-position:
 * 0 is flush with the top-left corner, 50 is centred, 100 is flush with the
 * bottom-right corner. This makes overflow structurally impossible at any
 * container size, with no runtime clamping.
 */
export interface Position {
  top: number;
  left: number;
}

export const DEFAULT_POSITION: Position = { top: 50, left: 50 };

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
