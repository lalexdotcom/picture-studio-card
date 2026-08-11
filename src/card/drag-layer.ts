import { clampPx, type Position, positionStyle, toPercent } from "../position";

interface Hit {
  element: HTMLElement;
  index: number;
}

interface DragOptions {
  /** Resolve a pointer target to the wrapper it belongs to, with its index. */
  getIndexedWrapper(target: EventTarget | null): Hit | undefined;
  /** The element whose box defines 100%: the same box hui-image fills. */
  getSurface(): HTMLElement | null;
  onCommit(index: number, position: Position): void;
}

interface DragState {
  hit: Hit;
  pointerId: number;
  /** Offset of the pointer inside the badge, so it does not jump on grab. */
  grabX: number;
  grabY: number;
  surface: DOMRect;
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Pixel-precise while dragging, percentages only on release.
 *
 * During pointermove we mutate the node's own style directly: no config
 * round-trip, no latency, and a setConfig arriving mid-gesture cannot corrupt
 * it. One commit per drag, not per frame.
 */
export const createDragController = (options: DragOptions) => {
  let root: HTMLElement | undefined;
  let state: DragState | undefined;

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    if (state) return; // ignore a second pointer while a drag is in progress
    const hit = options.getIndexedWrapper(ev.target);
    const surface = options.getSurface();
    if (!hit || !surface) return;

    const box = hit.element.getBoundingClientRect();
    const surfaceBox = surface.getBoundingClientRect();

    state = {
      hit,
      pointerId: ev.pointerId,
      grabX: ev.clientX - box.left,
      grabY: ev.clientY - box.top,
      surface: surfaceBox,
      width: box.width,
      height: box.height,
      x: box.left - surfaceBox.left,
      y: box.top - surfaceBox.top,
    };

    // Survive the cursor leaving the surface.
    hit.element.setPointerCapture(ev.pointerId);
    hit.element.style.cursor = "grabbing";
    // Neutralise the stored transform so left/top are plain pixels while dragging.
    hit.element.style.transform = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;

    state.x = clampPx(
      ev.clientX - state.surface.left - state.grabX,
      state.surface.width,
      state.width,
    );
    state.y = clampPx(
      ev.clientY - state.surface.top - state.grabY,
      state.surface.height,
      state.height,
    );

    state.hit.element.style.left = `${state.x}px`;
    state.hit.element.style.top = `${state.y}px`;
    ev.preventDefault();
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    const { hit, x, y, surface, width, height } = state;
    state = undefined;

    hit.element.releasePointerCapture(ev.pointerId);
    hit.element.style.cursor = "";

    const position: Position = {
      left: toPercent(x, surface.width, width),
      top: toPercent(y, surface.height, height),
    };

    // Restore the derived style here and not only on the next setConfig: a drag
    // that ends where it started produces no config change, so no setConfig
    // would come back, and the badge would stay in raw pixels with no transform.
    // Same geometry either way, so there is no flash.
    const style = positionStyle(position);
    hit.element.style.left = style.left;
    hit.element.style.top = style.top;
    hit.element.style.transform = style.transform;

    options.onCommit(hit.index, position);
  };

  return {
    attach(element: HTMLElement): void {
      if (root) return;
      root = element;
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerup", onPointerUp);
      root.addEventListener("pointercancel", onPointerUp);
    },
    detach(): void {
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("pointermove", onPointerMove);
      root?.removeEventListener("pointerup", onPointerUp);
      root?.removeEventListener("pointercancel", onPointerUp);
      root = undefined;
      state = undefined;
    },
    /** The index of the badge currently being dragged, or undefined if idle. */
    draggingIndex(): number | undefined {
      return state?.hit.index;
    },
  };
};
