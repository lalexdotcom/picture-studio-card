import {
  type Anchor,
  type AxisBounds,
  advance,
  axisOffset,
  OPEN_BOUNDS,
  type Position,
  positionStyle,
  toPercent,
} from "../position";

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

/**
 * How long the pointer must stay down before a gesture too small to clear
 * DRAG_THRESHOLD_PX is taken at its word.
 *
 * The threshold alone could only answer "was this obviously a drag", and it
 * answered the opposite question by default: someone nudging a badge one pixel
 * into place means it, and their adjustment was being discarded as tremor.
 * Duration separates the two intents that distance cannot — a tap is quick, a
 * deliberate adjustment is not.
 */
export const DRAG_HOLD_MS = 300;

/**
 * Whether a finished gesture is worth a config round trip.
 *
 * `travelled` is the gesture's own sticky verdict on distance: once the travel
 * passed the threshold it stays passed, so a drag that wanders far and returns
 * near its start still commits. `displaced` is the only question the hold path
 * asks — a press-and-think, or a nudge the clamp swallowed against an edge, has
 * no new position to store however long it lasted.
 */
export const isDrag = (travelled: boolean, heldMs: number, displaced: boolean): boolean =>
  travelled || (heldMs >= DRAG_HOLD_MS && displaced);

interface DragOptions {
  /** Resolve a pointer target to the wrapper it belongs to, with its index. */
  getIndexedWrapper(target: EventTarget | null): Hit | undefined;
  /** The element whose box defines 100%: the same box hui-image fills. */
  getSurface(): HTMLElement | null;
  /**
   * The anchor the item at this index is stored with. Read at pointerup rather
   * than captured at pointerdown: it is the only thing that decides how the
   * pixels the gesture produced turn back into coordinates, and reading it late
   * keeps the controller free of any copy of the config.
   */
  getAnchor(index: number): Anchor;
  onCommit(index: number, position: Position): void;
  /**
   * Every pointermove, with the coordinates the gesture would commit if it
   * ended now — the same conversion onPointerUp performs, so nothing the caller
   * derives from them can jump at release.
   *
   * It exists for decorations that hang off the item and must not overhang the
   * card: the marker's corner has to follow the item during the gesture, not
   * after it, because an overhang raises a scrollbar under the pointer.
   */
  onMove?(index: number, position: Position): void;
  /**
   * Raised on pointerdown: with an index when a badge was hit, so grabbing one
   * selects it as surely as clicking it, and with undefined when the press
   * landed on the image, which clears the selection.
   */
  onSelect(index: number | undefined): void;
  /**
   * The clock the hold is measured against. Injected so the boundary can be
   * tested exactly rather than by sleeping through it; `performance.now` in
   * production, because it is monotonic and a clock change mid-gesture must not
   * turn a click into a drag.
   */
  now?(): number;
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
  /** Per-axis travel limits, closed in on the first pointermove. */
  boundsX: AxisBounds;
  boundsY: AxisBounds;
  /** Where the gesture started, in client coordinates, to measure the travel. */
  startX: number;
  startY: number;
  /** True once the travel passed the threshold; never goes back to false. */
  moved: boolean;
  /** When the pointer went down, on the injected clock. */
  downAt: number;
  /** Where the item sat at pointerdown, to tell a real displacement from none. */
  originX: number;
  originY: number;
  /**
   * The three declarations pointerdown is about to overwrite, kept verbatim.
   * A gesture that commits nothing has to put back exactly what was there —
   * recomputing them through toPercent and round2 would land a hundredth of a
   * percent off for no reason, and the exact strings are already in hand.
   */
  originStyle: { left: string; top: string; transform: string };
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
  const now = (): number => (options.now ?? performance.now.bind(performance))();

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
      boundsX: OPEN_BOUNDS,
      boundsY: OPEN_BOUNDS,
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      downAt: now(),
      originX: box.left - surfaceBox.left,
      originY: box.top - surfaceBox.top,
      originStyle: {
        left: hit.element.style.left,
        top: hit.element.style.top,
        transform: hit.element.style.transform,
      },
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

    const nextX = advance(
      ev.clientX - state.surface.left - state.grabX,
      state.x,
      state.boundsX,
      state.surface.width,
      state.width,
    );
    const nextY = advance(
      ev.clientY - state.surface.top - state.grabY,
      state.y,
      state.boundsY,
      state.surface.height,
      state.height,
    );
    state.x = nextX.px;
    state.boundsX = nextX.bounds;
    state.y = nextY.px;
    state.boundsY = nextY.bounds;

    state.hit.element.style.left = `${state.x}px`;
    state.hit.element.style.top = `${state.y}px`;

    if (options.onMove) {
      // Deliberately the same conversion as onPointerUp, anchor included: a
      // caller that decides something from these coordinates decides it from
      // exactly what the release will store, so the decision never flips at
      // the end of the gesture.
      const anchor = options.getAnchor(state.hit.index);
      options.onMove(state.hit.index, {
        left: toPercent(state.x, state.surface.width, state.width, axisOffset(anchor, "x")),
        top: toPercent(state.y, state.surface.height, state.height, axisOffset(anchor, "y")),
      });
    }
    ev.preventDefault();
  };

  /**
   * Ends the gesture. `cancelled` marks the pointercancel path — a scroll
   * takeover, palm rejection or a browser intervention — where the user never
   * released, so whatever the badge had reached is not a decision to store.
   */
  const endGesture = (ev: PointerEvent, cancelled: boolean): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    const { hit, x, y, surface, width, height, moved, downAt, originX, originY, originStyle } =
      state;
    state = undefined;

    hit.element.releasePointerCapture(ev.pointerId);
    hit.element.classList.remove("dragging");

    // Not the pointer's travel: against an edge the clamp absorbs the whole
    // gesture, so the only question worth asking is whether the badge itself
    // ended somewhere else.
    const displaced = x !== originX || y !== originY;

    // pointerdown switched the element to raw pixels, so a derived style has to
    // come back either way — left in pixels the badge would shift by its own
    // anchoring translate. A gesture that commits nothing goes back to the exact
    // strings it replaced: no setConfig is coming to correct it, so the pixels
    // the pointer wandered to would otherwise stay on screen, a few off from the
    // coordinates the config still holds.
    // `cancelled` short-circuits the whole question: the system took the
    // gesture away, so the answer is always "put it back", however far the
    // badge had travelled. Committing here would write a position the user
    // never chose — and, having gone through onCommit, one they would have to
    // undo by hand.
    if (cancelled || !isDrag(moved, now() - downAt, displaced)) {
      hit.element.style.left = originStyle.left;
      hit.element.style.top = originStyle.top;
      hit.element.style.transform = originStyle.transform;
      return;
    }

    const anchor = options.getAnchor(hit.index);
    const position: Position = {
      left: toPercent(x, surface.width, width, axisOffset(anchor, "x")),
      top: toPercent(y, surface.height, height, axisOffset(anchor, "y")),
    };

    // Restored here and not only on the next setConfig: a drag that ends where
    // it started produces no config change, so no setConfig would come back, and
    // the badge would stay in raw pixels with no transform. Same geometry, so
    // there is no flash.
    const style = positionStyle(position, anchor);
    hit.element.style.left = style.left;
    hit.element.style.top = style.top;
    hit.element.style.transform = style.transform;

    options.onCommit(hit.index, position);
  };

  const onPointerUp = (ev: PointerEvent): void => endGesture(ev, false);
  const onPointerCancel = (ev: PointerEvent): void => endGesture(ev, true);

  return {
    attach(element: HTMLElement): void {
      if (root) return;
      root = element;
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerup", onPointerUp);
      root.addEventListener("pointercancel", onPointerCancel);
    },
    detach(): void {
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("pointermove", onPointerMove);
      root?.removeEventListener("pointerup", onPointerUp);
      root?.removeEventListener("pointercancel", onPointerCancel);
      root = undefined;
      state = undefined;
    },
    /** The index of the badge currently being dragged, or undefined if idle. */
    draggingIndex(): number | undefined {
      return state?.hit.index;
    },
  };
};
