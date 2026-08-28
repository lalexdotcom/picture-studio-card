import type { Corner } from "../../resize-box";
import { createResizeController, type ResizeHit, type ResizeOptions } from "../resize-layer";
import type { Tool, ToolTarget } from "./tool";

/** The four corners a handle sits on, in DOM order. */
const HANDLE_CORNERS: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * `getHandle` is NOT part of what the card hands over: the tool owns the hit
 * test now, and supplies its own to the controller. Passing one in would leave
 * two answers to one question, which is the shape `_hitHandle`'s comment warned
 * about — "two copies of this is the shape that eventually disagrees".
 */
export type ResizeToolOptions = Omit<ResizeOptions, "getHandle">;

/**
 * What a pointer landed on: one of this tool's handles, or nothing.
 *
 * One owner, consulted by this tool's controller AND by the drag, which asks it
 * in order to know that a press is not a move. Two copies of this is the shape
 * that eventually disagrees, and the disagreement would be invisible because
 * each is correct on its own.
 */
const hit = (target: EventTarget | null): ResizeHit | undefined => {
  const handle = (target as HTMLElement | null)?.closest?.(".handle") as HTMLElement | null;
  const corner = handle?.dataset.corner as Corner | undefined;
  const wrapper = handle?.closest(".item") as HTMLElement | null;
  const index = wrapper?.dataset.index;
  return handle && corner && wrapper && index !== undefined
    ? { element: wrapper, index: Number(index), corner }
    : undefined;
};

/**
 * The corner-resize tool: it owns its handle nodes, its hit test and its
 * gesture.
 *
 * The handles used to be built once per resizable item in `_createChild` and
 * shown by CSS on the selected one, guarding against two hazards named in a
 * comment there: the wrapper's box, and DOM churn under the pointer. Neither
 * reaches this code, and both facts are structural rather than circumstantial.
 * The handles are `position: absolute`, so mounting one cannot move the
 * `getBoundingClientRect()` both controllers read; and pointer capture is taken
 * on the WRAPPER — `hit.element` is `handle.closest(".item")` — so removing a
 * handle never touches the node holding it, and the hit is resolved once at
 * `pointerdown` and kept in the gesture's state.
 *
 * The gesture guard below is a belt, not the argument: it covers the one case
 * the structure does not, a selection changing mid-gesture from two fingers —
 * one dragging on the picture, one tapping a row in the editor's list.
 */
export const createResizeTool = (options: ResizeToolOptions): Tool => {
  const controller = createResizeController({ ...options, getHandle: (t) => hit(t) });
  let mounted: HTMLElement | undefined;

  const unmount = (): void => {
    mounted?.querySelectorAll(".handle").forEach((node) => {
      node.remove();
    });
    mounted = undefined;
  };

  return {
    id: "resize",

    render(target: ToolTarget | undefined): void {
      if (controller.resizingIndex() !== undefined) return;
      if (mounted === target?.element) return;
      unmount();
      if (!target || !options.getConfig(target.index)) return;
      for (const corner of HANDLE_CORNERS) {
        const handle = document.createElement("div");
        handle.className = `handle handle-${corner}`;
        handle.dataset.corner = corner;
        target.element.append(handle);
      }
      mounted = target.element;
    },

    attach: controller.attach,

    detach() {
      controller.detach();
      unmount();
    },

    hit,

    gestureIndex: controller.resizingIndex,
  };
};
