import { ratioIsForced } from "../../image-box";
import type { Grip } from "../../resize-box";
import { createResizeController, type ResizeHit, type ResizeOptions } from "../resize-layer";
import type { Tool, ToolTarget } from "./tool";

/** The four corners, in DOM order. */
const CORNER_GRIPS: Grip[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * The four edge midpoints, which resize one axis freely.
 *
 * Absent under a forced ratio: SHIFT is already inert there, so a side handle
 * would be a control that cannot act — a claim the item does not honour, and
 * a picture has nowhere to put the explanation the form's disabled checkbox
 * gets to carry.
 */
const SIDE_GRIPS: Grip[] = ["top", "right", "bottom", "left"];

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
  const grip = handle?.dataset.grip as Grip | undefined;
  const wrapper = handle?.closest(".item") as HTMLElement | null;
  const index = wrapper?.dataset.index;
  return handle && grip && wrapper && index !== undefined
    ? { element: wrapper, index: Number(index), grip }
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
  let mountedKey: string | undefined;

  const unmount = (): void => {
    mounted?.querySelectorAll(".handle").forEach((node) => {
      node.remove();
    });
    mounted = undefined;
    mountedKey = undefined;
  };

  return {
    id: "resize",

    render(target: ToolTarget | undefined): void {
      if (controller.resizingIndex() !== undefined) return;
      const config = target ? options.getConfig(target.index) : undefined;
      const grips =
        config && !ratioIsForced(config) ? [...CORNER_GRIPS, ...SIDE_GRIPS] : CORNER_GRIPS;
      const key = grips.join(" ");
      // The set of grips is part of what identifies what is mounted, not only
      // the element: an item that stops forcing its ratio keeps the same
      // wrapper, and comparing elements alone would never bring the sides back.
      if (mounted === target?.element && mountedKey === key) return;
      unmount();
      if (!target || !config) return;
      for (const grip of grips) {
        const handle = document.createElement("div");
        handle.className = `handle handle-${grip}`;
        handle.dataset.grip = grip;
        target.element.append(handle);
      }
      mounted = target.element;
      mountedKey = key;
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
