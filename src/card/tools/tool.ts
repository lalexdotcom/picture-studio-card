import type { ResizeHit } from "../resize-layer";

/** What a corner drag means. Move is not here: dragging the body always moves. */
export type ToolId = "resize" | "distort";

export const DEFAULT_TOOL: ToolId = "resize";

export interface ToolTarget {
  element: HTMLElement;
  index: number;
}

/**
 * A gesture tool: owns its handles, its hit test and its controller.
 *
 * `gestureIndex` is here because both the drag controller and the card ask
 * which item is under the live gesture on every event, to skip overwriting
 * its live pixels. A tool with no active gesture answers undefined.
 */
export interface Tool {
  readonly id: ToolId;
  /** Reconciles handles and state from fresh config. Inert during its own gesture. */
  render(target: ToolTarget | undefined): void;
  attach(root: HTMLElement): void;
  detach(): void;
  /** Single owner of the hit test for its own handles. */
  hit(target: EventTarget | null): ResizeHit | undefined;
  /** The index of the item under this tool's live gesture, or undefined when the tool is idle. */
  gestureIndex(): number | undefined;
}
