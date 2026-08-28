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
  layer,
  mountCard,
  rectInLayer,
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

/**
 * Returns whether the toolbar's anchor picker is currently open.
 *
 * `showModal()` sets `dialog.open`; `showPopover()` instead sets the
 * `:popover-open` state without touching `dialog.open`. Checking both makes
 * the helper sensitive to either API so the popover deliberate-break
 * (assertion 2 of test 3) reports as "picker visually open → dismissed by
 * click → click went through" rather than "picker was never open at all".
 */
const pickerOpen = (card: PictureStudioCard): boolean => {
  const toolbar = root(card).querySelector("picture-studio-toolbar") as HTMLElement;
  const dialog = toolbar?.shadowRoot?.querySelector("dialog") as HTMLDialogElement | null;
  if (!dialog) return false;
  return dialog.open || dialog.matches(":popover-open");
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * RED verification: each test below was run against a targeted break to confirm
 * it fails without the mechanism it guards. Done 2026-08-28 (fix round 1);
 * see task-9-report.md for the exact failure output of each.
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

/**
 * The toolbar is a sibling of `.root`, not a child. `.layer` is
 * `position: absolute; inset: 0` inside `.root`, so its height matches
 * `.root`'s, which the background image alone determines. Were the toolbar a
 * child of `.root` instead, `.root` would grow by the toolbar's height,
 * `.layer` would stretch to fill that taller box, and every item's `top`
 * percentage would resolve against the wrong denominator — an item at
 * `top: 50%` would land below the mid-point of the picture.
 */
it("the toolbar sits outside .root, keeping .layer flush with the background", async () => {
  const card = await mountCard(ONE_IMAGE());
  // Entering editing mode renders the toolbar; without it there is nothing to
  // misplace and the break has no effect.
  await enterEditing(card);
  const layerH = layer(card).getBoundingClientRect().height;
  const bgH = (root(card).querySelector(".background") as HTMLElement).getBoundingClientRect()
    .height;
  expect(layerH).toBe(bgH);
});

it("dismisses the anchor picker without letting the click through", async () => {
  // The picker is a <dialog> opened with showModal(). A popover would also
  // dismiss on an outside click (light-dismiss), but that click goes through
  // to whatever is beneath — exactly the behaviour that loses a user's intent.
  // showModal() places the dialog in the top layer: its ::backdrop absorbs the
  // outside click, so nothing behind it receives it.
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

/**
 * _refit's promise: restoring proportions keeps the image's top-left corner
 * where it was. A center anchor is deliberate: with a top-left anchor the
 * position coordinate is unchanged by any height shift (offset is zero on
 * both axes), so a broken _refit that skips the recomputation would still
 * pass. Center forces _refit to produce a new top coordinate — and that
 * coordinate will be wrong under a broken implementation.
 *
 * Both halves of the assertion matter: without the height check the test
 * would pass against a restore-button that did nothing at all.
 */
it("restoring proportions holds the top-left corner of the wrapper", async () => {
  installHaTokens();
  // Stretched image: width 20 % (80 px on a 400-wide layer), height 20 %
  // (60 px on a 300-tall layer). A 2:1 image at 80 px wide sits naturally at
  // 40 px tall; the explicit height stretches it to 60 px.
  // With center anchor the top-left corner is at layer pixel (160, 120).
  const card = await mountCard({
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "element",
        position: { top: "50%", left: "50%" },
        anchor: "center",
        config: { type: "image", image: "/wide-2x1.png", width: 20, height: 20 },
      },
    ],
  });
  const spy = await enterEditing(card);
  await selectItem(card, 0);

  const before = rectInLayer(card, wrappers(card)[0] as Element);

  // button.keep-ratio lives in the toolbar shadow root and is only rendered
  // while the resize tool is active, which is the default after selection.
  const toolbar = root(card).querySelector("picture-studio-toolbar") as HTMLElement;
  const button = toolbar?.shadowRoot?.querySelector(
    "button.keep-ratio",
  ) as HTMLButtonElement | null;
  if (!button) throw new Error("keep-ratio button not found in toolbar shadow root");
  button.click();
  await card.updateComplete;
  await flush();

  // patchBox carries the new box (width only, no height key) and the position
  // _refit computed to keep the top-left corner at the same pixel.
  expect(spy.boxes).toHaveLength(1);
  const commit = spy.boxes[0];
  if (!commit) throw new Error("patchBox was not called");

  // Simulate the editor applying the committed box and position — the card
  // re-renders and the wrapper takes its new natural height from the ratio.
  (card as unknown as { setConfig(c: unknown): void }).setConfig({
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "element",
        position: commit.position ?? { top: "50%", left: "50%" },
        anchor: "center",
        config: { type: "image", image: "/wide-2x1.png", ...commit.box },
      },
    ],
  });
  await card.updateComplete;
  await flush();

  const after = rectInLayer(card, wrappers(card)[0] as Element);

  // The top-left corner must stay where it was.
  expect(after.top).toBeCloseTo(before.top, 1);
  expect(after.left).toBeCloseTo(before.left, 1);
  // The height must change: the explicit height was dropped.
  expect(after.height).not.toBeCloseTo(before.height, 1);
});
