/**
 * Where the editor scrolls, and in which of the two containers.
 *
 * Home Assistant's card-edit dialog has two of them, and which one actually
 * moves depends on the viewport — measured in
 * `src/panels/lovelace/editor/card-editor/hui-dialog-edit-card.ts` and
 * corroborated by a trace on a real iPhone:
 *
 * - **Below 1000px** `.content` is a column with no height cap, so
 *   `.element-editor` — which declares `overflow-y: auto` via `ha-scrollbar` —
 *   never overflows and never scrolls. The dialog carries the scroll of the
 *   whole thing, preview included.
 * - **At 1000px and above** `.content` is a row with `max-height`, flex
 *   stretches the children to it, and `.element-editor` becomes the form's own
 *   scroller with the preview beside it, unmoving.
 *
 * The general rule underneath: `overflow` says what to do *if* a box overflows;
 * a height constraint is what makes it overflow. An `overflow: auto` with
 * nothing bounding its height is inert.
 *
 * Hence the two containers are found by *different* criteria — declared for the
 * form, actually-overflowing-and-above-the-form's for the dialog. Were they
 * found the same way, above 1000px the same element would answer to both roles
 * and the two intentions would fight. There is no media query on our side,
 * ever: the layout decides, we only ask what it decided.
 */

/**
 * The flattened-tree ancestors, starting with `from` itself — which is what
 * layout, and therefore scrolling, actually follows.
 *
 * `parentNode` alone walks the *logical* tree: the editor is distributed into a
 * slot by Home Assistant's dialog, so its light-DOM parent is not the box that
 * contains it on screen. Following `assignedSlot` first crosses that hop; the
 * host jump then crosses the shadow boundary. Measured the hard way — a walk
 * without it found only `html`, which never moved while the view plainly did.
 */
export function* layoutAncestors(from: Node): Generator<HTMLElement> {
  let node: Node | null = from;
  while (node) {
    if (node instanceof HTMLElement) yield node;
    const slot: HTMLSlotElement | null = node instanceof Element ? node.assignedSlot : null;
    const parent: Node | null = slot ?? node.parentNode;
    node = parent instanceof ShadowRoot ? parent.host : parent;
  }
}

const declaresScroll = (node: HTMLElement): boolean =>
  /auto|scroll/.test(getComputedStyle(node).overflowY);

/**
 * The top edge of `container`'s own box, in viewport coordinates.
 *
 * Zero for the scrolling element: `documentElement.getBoundingClientRect().top`
 * is `-scrollY`, so using it would count the scroll twice.
 */
export const boxTop = (container: HTMLElement): number =>
  container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;

/**
 * The container the form scrolls in — the nearest ancestor that *declares* a
 * scroll, whether or not it overflows today. Below 1000px that container is
 * inert and writing to it is a no-op, which is exactly what makes it safe to
 * write to both containers on every trigger and never ask which mode we are in.
 *
 * The walk stops at `body`: past that point any match is the dialog's container,
 * not the form's.
 */
export function formScroller(from: Node): HTMLElement | undefined {
  for (const node of layoutAncestors(from)) {
    if (node === from) continue;
    if (node === document.body || node === document.documentElement) return undefined;
    if (declaresScroll(node)) return node;
  }
  return undefined;
}

/**
 * The container the dialog scrolls in — the nearest ancestor **above the form's**
 * that actually overflows. "Above the form's" is not a nicety: at 1000px and
 * over, `.element-editor` overflows, and without the exclusion it would be
 * returned here too.
 */
export function dialogScroller(from: Node): HTMLElement | undefined {
  const form = formScroller(from);
  let above = form === undefined;
  for (const node of layoutAncestors(from)) {
    if (!above) {
      if (node === form) above = true;
      continue;
    }
    if (node === from) continue;
    if (node.scrollHeight <= node.clientHeight) continue;
    // The page scrolls without declaring it: its computed `overflow-y` is
    // `visible`, and on a phone Home Assistant's dialog *is* the page —
    // measured, `html[visible;2447/874]`. Requiring auto|scroll here found
    // nothing at all and the hold never ran.
    if (node === document.scrollingElement) return node;
    // `body` is skipped on purpose: it reports the same overflow as the document
    // while its own `overflow: hidden` makes writing to its scrollTop a no-op.
    if (node !== document.body && declaresScroll(node)) return node;
  }
  return undefined;
}

/** Scroll `container` so that `target`'s top edge sits at the container's top. */
export function scrollToStart(container: HTMLElement, target: Element): void {
  const delta = target.getBoundingClientRect().top - boxTop(container);
  if (delta !== 0) container.scrollTop += delta;
}

/**
 * Scroll `container` by the least amount that brings `target` inside it, and by
 * nothing at all when it already is. The explicit equivalent of
 * `scrollIntoView({ block: "nearest" })` — with the difference that is the whole
 * point of this module: it touches this container and no other.
 */
export function scrollIntoNearest(container: HTMLElement, target: Element): void {
  const top = boxTop(container);
  const bottom = top + container.clientHeight;
  const rect = target.getBoundingClientRect();
  if (rect.top < top) {
    container.scrollTop += rect.top - top;
  } else if (rect.bottom > bottom) {
    container.scrollTop += rect.bottom - bottom;
  }
}
