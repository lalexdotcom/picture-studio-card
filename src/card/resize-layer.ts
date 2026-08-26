import { type ImageBox, imageBoxStyle, type LiveCameraKeys, ratioIsForced } from "../image-box";
import {
  type Anchor,
  type AxisBounds,
  axisOffset,
  OPEN_BOUNDS,
  type Position,
  positionStyle,
  tighten,
  toPercent,
} from "../position";
import {
  type Corner,
  cornerGrabs,
  edgeAt,
  edgeSlopes,
  fixedPoint,
  intersect,
  lockedScale,
  percentOfContainer,
  RESIZE_FLOOR_PX,
  requestedSize,
  sizeRange,
} from "../resize-box";

export interface ResizeHit {
  element: HTMLElement;
  index: number;
  corner: Corner;
}

export interface ResizeOptions {
  getHandle(target: EventTarget | null): ResizeHit | undefined;
  getSurface(): HTMLElement | null;
  getAnchor(index: number): Anchor;
  getPosition(index: number): Position;
  getConfig(index: number): (ImageBox & LiveCameraKeys) | undefined;
  onCommit(index: number, box: ImageBox, position?: Position): void;
  onStretch?(index: number, stretched: boolean | undefined): void;
}

/** One axis of the gesture, kept in pixels for its whole length. */
interface AxisState {
  /** Where the box's leading edge sat at pointerdown, in surface pixels. */
  origin: number;
  /** The size at pointerdown, which every scale is measured against. */
  size0: number;
  /** The surface's extent. */
  container: number;
  /** True when the grabbed corner is this axis' trailing edge. */
  trailing: boolean;
  /** The anchor's share of the box, for the ALT mode. */
  anchorFraction: number;
  /** The ratcheted interval each edge may sit in; closed in on every move. */
  leadingBounds: AxisBounds;
  trailingBounds: AxisBounds;
  /** The current size, which the ratchet tightens around. */
  size: number;
  /**
   * Where the leading edge currently sits.
   *
   * Kept rather than recomputed at the release, and that is not tidiness: the
   * edge's formula depends on the mode, so recomputing it at the commit would
   * need to know whether ALT was held on the last frame — reintroducing exactly
   * the modifier-history dependency decision 7 removes. `apply` is the only
   * writer, so what is stored here is what is on screen.
   */
  lead: number;
}

interface ResizeState {
  hit: ResizeHit;
  pointerId: number;
  x: AxisState;
  y: AxisState;
  anchor: Anchor;
  /** `"height" in config` at pointerdown — the STORED key, not the drawn box. */
  hadHeight: boolean;
  /** The stored height, which a forced ratio keeps dormant. */
  storedHeight: number | undefined;
  storedWidth: number;
  forced: boolean;
  /** The stored coordinates, to tell a real change from none. */
  position0: Position;
  /** Last pointer position, so the keyboard can replay the same computation. */
  clientX: number;
  clientY: number;
  /** What `onStretch` last announced, so it is only raised on a change. */
  stretched: boolean;
  /**
   * Whether the last `apply()` frame was in free (SHIFT-held) mode.
   *
   * Needed at the commit to distinguish "height was present and carried through
   * the keep-ratio path" from "height was drawn explicitly by the user". In the
   * keep-ratio path the committed height must be `storedHeight × scale`, not the
   * pixel computation — they agree in a real browser (where `y.size0` equals the
   * rendered height), but diverge when the stored percentage and the actual pixel
   * height are out of sync, which the test suite deliberately provokes.
   */
  lastFree: boolean;
  /**
   * The six declarations pointerdown overwrites, kept verbatim. A gesture that
   * commits nothing has to put back exactly what was there: recomputing them
   * would land a hundredth of a percent off for no reason.
   */
  originStyle: {
    left: string;
    top: string;
    transform: string;
    width: string;
    height: string;
    maxHeight: string;
  };
}

export const createResizeController = (options: ResizeOptions) => {
  let root: HTMLElement | undefined;
  let state: ResizeState | undefined;

  const axis = (
    origin: number,
    size: number,
    container: number,
    trailing: boolean,
    fraction: number,
  ): AxisState => ({
    origin,
    size0: size,
    container,
    trailing,
    anchorFraction: fraction,
    leadingBounds: OPEN_BOUNDS,
    trailingBounds: OPEN_BOUNDS,
    size,
    lead: origin,
  });

  /**
   * The anchor's share of the box on one axis.
   *
   * `positionStyle` translates the wrapper by exactly this fraction of its own
   * size, so holding it still is what "resize from the anchor" means. Under
   * `auto` the fraction IS the coordinate — which is also why `toPercent` with a
   * null offset is the right inverse at the commit, and why nothing here has to
   * solve the self-reference by hand.
   */
  const fractionOf = (anchor: Anchor, position: Position, ax: "x" | "y"): number =>
    (axisOffset(anchor, ax) ?? (ax === "x" ? position.left : position.top)) / 100;

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    if (state) return; // ignore a second pointer while a gesture is in progress
    const hit = options.getHandle(ev.target);
    if (!hit) return;
    const surface = options.getSurface();
    const config = options.getConfig(hit.index);
    if (!surface || !config) return;

    const surfaceBox = surface.getBoundingClientRect();
    const box = hit.element.getBoundingClientRect();
    const grabs = cornerGrabs(hit.corner);
    const anchor = options.getAnchor(hit.index);
    const position = options.getPosition(hit.index);

    state = {
      hit,
      pointerId: ev.pointerId,
      x: axis(
        box.left - surfaceBox.left,
        box.width,
        surfaceBox.width,
        grabs.x,
        fractionOf(anchor, position, "x"),
      ),
      y: axis(
        box.top - surfaceBox.top,
        box.height,
        surfaceBox.height,
        grabs.y,
        fractionOf(anchor, position, "y"),
      ),
      anchor,
      hadHeight: "height" in config,
      storedHeight: config.height,
      storedWidth: config.width,
      forced: ratioIsForced(config),
      position0: position,
      clientX: ev.clientX,
      clientY: ev.clientY,
      stretched: "height" in config,
      lastFree: false,
      originStyle: {
        left: hit.element.style.left,
        top: hit.element.style.top,
        transform: hit.element.style.transform,
        width: hit.element.style.width,
        height: hit.element.style.height,
        maxHeight: hit.element.style.maxHeight,
      },
    };

    hit.element.setPointerCapture(ev.pointerId);
    hit.element.classList.add("resizing");

    // Switch to plain pixels, position and transform together, exactly as the
    // drag does and for the same reason: dropping the anchoring translate while
    // left/top are still percentages would shift the item by a fraction of its
    // own size.
    hit.element.style.left = `${state.x.origin}px`;
    hit.element.style.top = `${state.y.origin}px`;
    hit.element.style.transform = "none";
    hit.element.style.width = `${state.x.size0}px`;
    if (state.hadHeight && !state.forced) {
      hit.element.style.height = `${state.y.size0}px`;
    } else {
      hit.element.style.height = "";
    }
    // Dropped for the length of the gesture. `max-height: 100%` guards the
    // image file's own ratio — image spec decision 5's channel 3 — and would
    // otherwise cap the drag against the background's height with nothing on
    // screen to explain the ceiling. `imageBoxStyle` puts it back at the commit.
    hit.element.style.maxHeight = "";

    ev.preventDefault();
    ev.stopPropagation();
  };

  /** The admissible sizes on one axis, given the mode and the ratchet. */
  const sizeBounds = (a: AxisState, fraction: number | null): AxisBounds => {
    const fixed = fixedPoint(a.origin, a.size0, a.trailing, fraction);
    const slopes = edgeSlopes(a.trailing, fraction);
    return intersect(
      intersect(
        sizeRange(fixed, slopes.leading, a.leadingBounds),
        sizeRange(fixed, slopes.trailing, a.trailingBounds),
      ),
      { lo: RESIZE_FLOOR_PX, hi: Number.POSITIVE_INFINITY },
    );
  };

  /** Close the ratchet around where each edge is *now*, per the drag's rule. */
  const ratchet = (a: AxisState, fraction: number | null): void => {
    const fixed = fixedPoint(a.origin, a.size0, a.trailing, fraction);
    const now = edgeAt(fixed, a.size, a.trailing, fraction);
    // `element = 0` bounds an EDGE rather than a leading corner of fixed size:
    // span(container, 0) === container, so the interval is [0, container],
    // ratcheted around where the edge sits. It also keeps the interval constant
    // for the whole gesture, which a ratchet computed against a moving box size
    // would not be.
    a.leadingBounds = tighten(a.leadingBounds, now.leading, a.container, 0);
    a.trailingBounds = tighten(a.trailingBounds, now.trailing, a.container, 0);
  };

  /**
   * One frame of the gesture, from a pointer position and the live modifiers.
   *
   * Called from `pointermove` and from the keyboard listener with the last known
   * position — the same function, never a second implementation.
   */
  const apply = (clientX: number, clientY: number, shift: boolean, alt: boolean): void => {
    if (!state) return;
    const surface = options.getSurface();
    if (!surface) return;
    const surfaceBox = surface.getBoundingClientRect();
    state.clientX = clientX;
    state.clientY = clientY;

    const free = shift && !state.forced;
    state.lastFree = free;
    const fx = alt ? state.x.anchorFraction : null;
    const fy = alt ? state.y.anchorFraction : null;

    ratchet(state.x, fx);
    ratchet(state.y, fy);

    const fixedX = fixedPoint(state.x.origin, state.x.size0, state.x.trailing, fx);
    const fixedY = fixedPoint(state.y.origin, state.y.size0, state.y.trailing, fy);
    const px = clientX - surfaceBox.left;
    const py = clientY - surfaceBox.top;

    const wanted = {
      x: requestedSize(px, fixedX, state.x.trailing, fx),
      y: requestedSize(py, fixedY, state.y.trailing, fy),
    };
    const boundsX = sizeBounds(state.x, fx);
    const boundsY = sizeBounds(state.y, fy);
    const clamp = (v: number, b: AxisBounds): number => Math.min(Math.max(v, b.lo), b.hi);

    if (free) {
      // Two degrees of freedom, two independent clamps — exactly the drag.
      state.x.size = clamp(wanted.x ?? state.x.size, boundsX);
      state.y.size = clamp(wanted.y ?? state.y.size, boundsY);
    } else {
      // One degree of freedom, so both axes' bounds become bounds on the SAME
      // scale factor before anything is applied. Clamping them separately is
      // what distorts the image against the borders.
      const k = lockedScale(wanted, { width: state.x.size0, height: state.y.size0 });
      if (k !== undefined) {
        const kBounds = intersect(
          {
            lo: state.x.size0 === 0 ? Number.NEGATIVE_INFINITY : boundsX.lo / state.x.size0,
            hi: state.x.size0 === 0 ? Number.POSITIVE_INFINITY : boundsX.hi / state.x.size0,
          },
          {
            lo: state.y.size0 === 0 ? Number.NEGATIVE_INFINITY : boundsY.lo / state.y.size0,
            hi: state.y.size0 === 0 ? Number.POSITIVE_INFINITY : boundsY.hi / state.y.size0,
          },
        );
        const scale = clamp(k, kBounds);
        state.x.size = state.x.size0 * scale;
        state.y.size = state.y.size0 * scale;
      }
    }

    const el = state.hit.element;
    el.style.width = `${state.x.size}px`;

    // The keep-ratio mode writes NO height: the image holds the ratio itself,
    // exactly, and the committed config will hold it the same way. Re-locking
    // must therefore CLEAR the height, not merely recompute it — leaving it
    // behind breaks nothing visible and commits a height on an item the user
    // left in keep-ratio.
    const stretched = state.forced ? false : state.hadHeight || free;
    el.style.height = stretched ? `${state.y.size}px` : "";

    // Read the resolved height back for the three corners whose fixed point is
    // not the top-left: their position depends on a size the browser decided.
    const live = el.getBoundingClientRect();
    state.y.size = stretched ? state.y.size : live.height;

    state.x.lead = edgeAt(fixedX, state.x.size, state.x.trailing, fx).leading;
    state.y.lead = edgeAt(fixedY, state.y.size, state.y.trailing, fy).leading;
    el.style.left = `${state.x.lead}px`;
    el.style.top = `${state.y.lead}px`;

    if (stretched !== state.stretched) {
      state.stretched = stretched;
      options.onStretch?.(state.hit.index, stretched);
    }
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    apply(ev.clientX, ev.clientY, ev.shiftKey, ev.altKey);
    ev.preventDefault();
  };

  /**
   * A modifier pressed or released while the pointer is still.
   *
   * On `window`, because under `setPointerCapture` the element has no keyboard
   * focus and the keys go to the dialog's focused node. The pointer event's own
   * `shiftKey` stays authoritative — an alt-tab mid-gesture takes the `keyup`
   * with it, and the next move resynchronises with nothing to repair. Auto-
   * repeat needs no guard: the computation is idempotent in its inputs.
   *
   * A modifier toggled with no movement at all since pointerdown is a no-op by
   * construction: the constraint only acts on a displacement, and there is none.
   */
  const onKey = (ev: KeyboardEvent): void => {
    if (!state) return;
    if (ev.key !== "Shift" && ev.key !== "Alt") return;
    apply(state.clientX, state.clientY, ev.shiftKey, ev.altKey);
  };

  const endGesture = (ev: PointerEvent, cancelled: boolean): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    const s = state;
    state = undefined;

    s.hit.element.releasePointerCapture(ev.pointerId);
    s.hit.element.classList.remove("resizing");

    const surface = options.getSurface();
    const surfaceBox = surface?.getBoundingClientRect();

    const restore = (): void => {
      options.onStretch?.(s.hit.index, undefined);
      s.hit.element.style.left = s.originStyle.left;
      s.hit.element.style.top = s.originStyle.top;
      s.hit.element.style.transform = s.originStyle.transform;
      s.hit.element.style.width = s.originStyle.width;
      s.hit.element.style.height = s.originStyle.height;
      s.hit.element.style.maxHeight = s.originStyle.maxHeight;
    };

    if (cancelled || !surfaceBox) {
      restore();
      return;
    }

    const stretched = s.forced ? false : s.hadHeight || s.stretched;
    const width = percentOfContainer(s.x.size, surfaceBox.width);
    const scale = s.x.size / s.x.size0;
    const height = stretched
      ? s.hadHeight && !s.lastFree && s.storedHeight !== undefined
        ? // The user resized in keep-ratio mode with a pre-existing height.
          // "Scaling both numbers" means both STORED PERCENTAGES multiply by the
          // same factor k = x.size/x.size0. Pixel computation (percentOfContainer)
          // would give the right answer in a real browser — where y.size0 is the
          // rendered height — but diverges when the stored height and the actual
          // pixel height disagree, so this formula is the canonical one.
          Math.round(s.storedHeight * scale * 100) / 100
        : percentOfContainer(s.y.size, surfaceBox.height)
      : s.forced && s.storedHeight !== undefined
        ? // A forced ratio keeps the stored height dormant, so the DOM cannot
          // carry it. Scaled by the width's own factor, so the box the user
          // gets back when they leave Live has the shape it had before.
          Math.round(s.storedHeight * scale * 100) / 100
        : undefined;

    const box: ImageBox = height === undefined ? { width } : { width, height };

    // Read off the state rather than recomputed: `apply` wrote it under the mode
    // that was live on the last frame, and asking again here would mean asking
    // whether ALT was held — the modifier history decision 7 keeps out.
    //
    // `toPercent` with a null offset is the exact inverse of the `auto` anchor's
    // self-reference: the stored coordinate IS the translate fraction, so
    // `100·px / (W − w)` is the closed form the spec names, already written.
    const position: Position = {
      left: toPercent(s.x.lead, surfaceBox.width, s.x.size, axisOffset(s.anchor, "x")),
      top: toPercent(s.y.lead, surfaceBox.height, s.y.size, axisOffset(s.anchor, "y")),
    };

    const boxChanged = box.width !== s.storedWidth || box.height !== s.storedHeight;
    const moved = position.left !== s.position0.left || position.top !== s.position0.top;

    if (!boxChanged && !moved) {
      restore();
      return;
    }

    // Put the derived style back here and not only on the next setConfig: the
    // geometry is identical, so there is no flash, and a commit that Home
    // Assistant coalesces would otherwise leave raw pixels on screen.
    const style = positionStyle(position, s.anchor);
    const drawn = imageBoxStyle(box);
    s.hit.element.style.left = style.left;
    s.hit.element.style.top = style.top;
    s.hit.element.style.transform = style.transform;
    s.hit.element.style.width = drawn.width;
    s.hit.element.style.height = drawn.height;
    s.hit.element.style.maxHeight = drawn.maxHeight;

    // Not dropped to `undefined` here: Home Assistant's config round trip takes
    // frames, and an element that read its old config in the meantime would
    // render `contain` against a box that already has a height — one frame of
    // letterbox, at the moment the eye is on it. Set to what the committed
    // config says instead, so the two agree; `_syncItems` clears it when that
    // config actually lands.
    options.onStretch?.(s.hit.index, box.height !== undefined);
    options.onCommit(s.hit.index, box, moved ? position : undefined);
  };

  const onPointerUp = (ev: PointerEvent): void => endGesture(ev, false);
  const onPointerCancel = (ev: PointerEvent): void => endGesture(ev, true);

  /** Holds the gesture on iOS; see `drag-layer.ts` for why this is not optional. */
  const onTouchMove = (ev: TouchEvent): void => {
    if (!state) return;
    if (!ev.cancelable) return;
    ev.preventDefault();
  };

  return {
    attach(element: HTMLElement): void {
      if (root) return;
      root = element;
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerup", onPointerUp);
      root.addEventListener("pointercancel", onPointerCancel);
      root.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKey);
    },
    detach(): void {
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("pointermove", onPointerMove);
      root?.removeEventListener("pointerup", onPointerUp);
      root?.removeEventListener("pointercancel", onPointerCancel);
      root?.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      root = undefined;
      state = undefined;
    },
    resizingIndex(): number | undefined {
      return state?.hit.index;
    },
  };
};
