import { page } from "@rstest/browser";
import { afterEach, expect, it } from "@rstest/core";
import type { PictureStudioCard } from "../../card/picture-studio-card";
import { PictureStudioToolbar } from "../../card/toolbar";
import { ANCHOR_INPUT_TAG, TOOLBAR_TAG } from "../../config";
import { PictureStudioAnchorInput } from "../../editor/anchor-input";
import {
  cleanup,
  enterEditing,
  flush,
  installHaTokens,
  mountCard,
  root,
  wrappers,
} from "./harness";

// The toolbar and anchor input are registered in index.ts, but the harness
// only registers the elements that the card itself needs to lay out. These two
// are rendered inside the card's shadow DOM and must be defined before any test
// mounts the card in editing mode.
const define = (tag: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
};
define(TOOLBAR_TAG, PictureStudioToolbar);
define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);

afterEach(cleanup);

/**
 * One image element at 50%/50% — enough for the drag controller to call
 * onSelect(0) when its wrapper is pressed and released.
 *
 * The image type is deliberate: selecting it switches the toolbar from the
 * anchor group alone to anchor group + separator + tools. That is the one
 * transition that could produce a vertical jump if the bar's height were
 * derived from whichever group is tallest rather than declared.
 */
const ONE_IMAGE = (): unknown => ({
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "element",
      position: { top: "50%", left: "50%" },
      config: { type: "image", image: "/wide-2x1.png", width: 20 },
    },
  ],
});

/**
 * One state-icon element at 20%/20%.
 *
 * The icon's size is `clamp(24px, 8cqw, 48px)`, which resolves against
 * `.root`'s inline size. At the harness's LAYER.width of 400 px, 8 cqw = 32 px.
 * Any change to `.root`'s effective inline size would shift this measurement —
 * which is exactly what the container-left-alone claim protects against.
 */
const ONE_ICON = (): unknown => ({
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "element",
      position: { top: "20%", left: "20%" },
      config: {
        type: "state-icon",
        entity: "light.a",
        size: { mode: "adaptive", ratio: 8, min: 24, max: 48 },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The card element's total rendered height in pixels. */
const cardHeight = (card: PictureStudioCard): number => card.getBoundingClientRect().height;

/**
 * Selects the item at `index` by pressing and releasing its wrapper, the same
 * pointer-event pair the drag controller's onSelect path requires.
 *
 * The drag controller listens on `.root` and resolves the hit via
 * `event.target.closest('.item')`, so the events must bubble. pointerId 1
 * matches the harness constant; pointerId 9 is used by resize.test.ts — any
 * unique positive integer would do.
 */
const selectItem = async (card: PictureStudioCard, index: number): Promise<void> => {
  const wrapper = wrappers(card)[index];
  if (!wrapper) throw new Error(`wrapper ${index} not found`);
  wrapper.dispatchEvent(
    new PointerEvent("pointerdown", { pointerId: 1, button: 0, bubbles: true }),
  );
  wrapper.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, button: 0, bubbles: true }));
  await card.updateComplete;
  await flush();
};

/**
 * Returns the computed pixel width of item `index`'s wrapper.
 *
 * For a state-icon whose size CSS is `clamp(min, ratio·cqw, max)`, the wrapper
 * (width: max-content) stretches to exactly the icon's cqw-resolved width.
 * The number changes if and only if the container's inline size changes.
 */
const clampedWidth = (card: PictureStudioCard, index: number): number =>
  (wrappers(card)[index] as HTMLElement).getBoundingClientRect().width;

/** Enters editing mode, making the toolbar visible. */
const showToolbar = async (card: PictureStudioCard): Promise<void> => {
  await enterEditing(card);
};

/**
 * Opens the anchor picker by clicking the toolbar's "anchored" button
 * programmatically.
 *
 * The button is inside the toolbar's shadow root. The item must already be
 * selected (and be a non-unknown type) before calling, otherwise the button is
 * disabled and `_openPicker` is never invoked.
 */
const openAnchorPicker = async (card: PictureStudioCard): Promise<void> => {
  const toolbar = root(card).querySelector("picture-studio-toolbar") as HTMLElement;
  const button = toolbar?.shadowRoot?.querySelector("button.anchored") as HTMLButtonElement | null;
  if (!button) throw new Error("anchor button not found in toolbar shadow root");
  if (button.disabled) throw new Error("anchor button is disabled — select an item first");
  button.click();
  await card.updateComplete;
  await flush();
};

/** Click counter, keyed weakly on DOM elements so cleanup GCs the entries. */
const clickRegistry = new WeakMap<Element, number>();

/**
 * Returns the number of click events that have reached the element matching
 * `selector` inside the card's render root, installing the counter on first
 * call. Clicks that bubble through from a child also increment the counter.
 *
 * `.root` is the target for the dialog-dismiss test: a click that bypasses the
 * modal ends up on `.root` (the background and the layer are both
 * pointer-events:none when editing), and it never arrives via the toolbar
 * subtree (a sibling), so the counter is a clean signal.
 */
const countClicksOn = (card: PictureStudioCard, selector: string): number => {
  const el = root(card).querySelector(selector);
  if (!el) return 0;
  if (!clickRegistry.has(el)) {
    clickRegistry.set(el, 0);
    el.addEventListener("click", () => {
      clickRegistry.set(el, (clickRegistry.get(el) ?? 0) + 1);
    });
  }
  return clickRegistry.get(el) ?? 0;
};

/** Returns whether the toolbar's `<dialog>` anchor picker is currently open. */
const pickerOpen = (card: PictureStudioCard): boolean => {
  const toolbar = root(card).querySelector("picture-studio-toolbar") as HTMLElement;
  const dialog = toolbar?.shadowRoot?.querySelector("dialog") as HTMLDialogElement | null;
  return dialog?.open ?? false;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * RED verification: each test below was run against a targeted break to confirm
 * it fails without the mechanism it guards. Done 2026-08-28; see
 * task-9-report.md for the exact failure output of each.
 */

it("keeps the card the same height whether or not something is selected", async () => {
  // Decision 3's claim. happy-dom has no layout, so this is the only lane
  // that can see a jump at the exact moment the user is aiming at an item.
  installHaTokens();
  const card = await mountCard(ONE_IMAGE());
  await enterEditing(card);

  // Without a selection the toolbar renders the anchor group only.
  const idle = cardHeight(card);

  // Selecting the image item adds the separator + tools group to the bar.
  // The bar's declared min-height and the buttons' declared height are what
  // keeps the two states the same height.
  await selectItem(card, 0);

  expect(cardHeight(card)).toBe(idle);
});

it("leaves the size container alone", async () => {
  // The toolbar is a sibling of .root. If it ever became a child, the
  // container's effective inline size could change — every cqw-resolved width
  // would silently mean something different.
  installHaTokens();
  const card = await mountCard(ONE_ICON());

  // Measure before editing: the icon's cqw-resolved width at LAYER.width = 400 px
  // (8 cqw = 32 px, clamped to [24, 48]).
  const before = clampedWidth(card, 0);

  // Entering editing mode inserts the toolbar as a sibling of .root.
  await showToolbar(card);

  // The container's inline size must be unchanged.
  expect(clampedWidth(card, 0)).toBe(before);
});

it("dismisses the anchor picker without letting the click through", async () => {
  // The picker is a <dialog> opened with showModal(), not a popover.
  // popover's light-dismiss closes it AND lets the outside click land on
  // whatever is beneath — exactly the behaviour that loses a user's intent.
  // showModal() puts the dialog in the top layer: its ::backdrop absorbs the
  // click so nothing behind it receives it.
  installHaTokens();
  const card = await mountCard(ONE_IMAGE());
  await enterEditing(card);
  // Select the item so the toolbar's anchor button becomes enabled.
  await selectItem(card, 0);

  await openAnchorPicker(card);

  // .root is the element a bypassed click would reach. The background and
  // the layer are both pointer-events:none while editing; the click falls
  // through both to .root itself. The toolbar subtree is a sibling of .root,
  // not an ancestor, so a click that stays inside the toolbar (the dialog's
  // normal dismiss path) never bubbles through .root.
  const clicksBefore = countClicksOn(card, ".root");

  // Click well inside .root's area but far from the dialog's content
  // (the dialog sits near the top-left, anchored to its button). The html
  // element spans the full viewport, and position is relative to its top-left
  // corner, which is (0, 0) — the same frame getBoundingClientRect() uses.
  // force:true bypasses Playwright's "is the element actionable?" check,
  // which would otherwise time out because the card is behind the inert
  // backdrop; the browser's own top-layer hit-test still runs, so the modal
  // protection is not bypassed, only the accessibility guard.
  const rootEl = root(card).querySelector(".root") as HTMLElement;
  const rootRect = rootEl.getBoundingClientRect();
  await page.locator("html").click({
    position: {
      // Far right of the card, well outside the dialog that sits near
      // the toolbar buttons on the left.
      x: rootRect.right - 10,
      // Centre of the .root area vertically.
      y: rootRect.top + rootRect.height / 2,
    },
    force: true,
  });
  await flush();

  expect(pickerOpen(card)).toBe(false);
  expect(countClicksOn(card, ".root")).toBe(clicksBefore);
});
