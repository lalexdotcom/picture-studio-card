import { clampPx, type Position, positionStyle, toPercent } from "../position";

interface Hit {
  element: HTMLElement;
  index: number;
}

/**
 * How far the pointer must travel before the gesture counts as a drag rather
 * than a click. A click is never perfectly still — a couple of pixels of tremor
 * is normal, and more from a finger — so without a threshold every click would
 * commit a position, and no click could ever open a form.
 */
export const DRAG_THRESHOLD_PX = 4;

/** Squared distance, to compare against the threshold without a square root. */
export const hasMoved = (dx: number, dy: number): boolean =>
  dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;

interface DragOptions {
  /** Resolve a pointer target to the wrapper it belongs to, with its index. */
  getIndexedWrapper(target: EventTarget | null): Hit | undefined;
  /** The element whose box defines 100%: the same box hui-image fills. */
  getSurface(): HTMLElement | null;
  onCommit(index: number, position: Position): void;
  /**
   * Raised on pointerdown: with an index when a badge was hit, so grabbing one
   * selects it as surely as clicking it, and with undefined when the press
   * landed on the image, which clears the selection.
   */
  onSelect(index: number | undefined): void;
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
  /** Where the gesture started, in client coordinates, to measure the travel. */
  startX: number;
  startY: number;
  /** True once the travel passed the threshold; never goes back to false. */
  moved: boolean;
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
    // The listener sits on the whole surface, not just the badges, so a press on
    // the image itself lands here with no hit — that is the deselect.
    if (!hit) {
      options.onSelect(undefined);
      return;
    }
    const surface = options.getSurface();
    if (!surface) return;

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
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
    };

    // Survive the cursor leaving the surface.
    hit.element.setPointerCapture(ev.pointerId);
    // Holds the ring for the whole gesture; :hover alone drops out for a frame
    // under pointer capture and again when the config round trip rebuilds it.
    hit.element.classList.add("dragging");
    // Grabbing selects too, so the badge being moved is also the one whose form
    // is open — one notion of "current badge" rather than two.
    options.onSelect(hit.index);

    // Switch to plain pixels for the gesture. Position and transform must move
    // together: dropping translate(-L%, -T%) while left/top are still
    // percentages shifts the badge down-right by a fraction of its own size —
    // its full size at 100/100 — until the first pointermove writes pixels.
    // These are the values the element already renders at, so nothing moves.
    hit.element.style.left = `${state.x}px`;
    hit.element.style.top = `${state.y}px`;
    hit.element.style.transform = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;

    state.moved ||= hasMoved(ev.clientX - state.startX, ev.clientY - state.startY);

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
    const { hit, x, y, surface, width, height, moved } = state;
    state = undefined;

    hit.element.releasePointerCapture(ev.pointerId);
    hit.element.classList.remove("dragging");

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

    // The style above is restored either way — pointerdown switched the element
    // to raw pixels, so leaving it there would shift the badge by its own
    // anchoring translate. Only the commit is conditional: a click selected the
    // badge and moved nothing, and an unchanged position is not worth a config
    // round trip.
    if (moved) options.onCommit(hit.index, position);
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
