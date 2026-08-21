import { afterEach, describe, expect, it } from "@rstest/core";
import { DRAG_HOLD_MS, DRAG_THRESHOLD_PX } from "../../card/drag-layer";
import {
  BADGE,
  cleanup,
  configWith,
  drag,
  enterEditing,
  LAYER,
  mountCard,
  move,
  press,
  rectInLayer,
  release,
  wrappers,
} from "./harness";

afterEach(cleanup);

/** Mid-layer, so a gesture has room in every direction. */
const MIDDLE = { x: LAYER.width / 2, y: LAYER.height / 2 };

const armed = async (
  position = { top: "50%", left: "50%" },
  anchor?: string,
  extra?: Record<string, unknown>,
) => {
  const card = await mountCard(configWith(position, anchor, extra));
  const spy = await enterEditing(card);
  const wrapper = wrappers(card)[0] as HTMLElement;
  return { card, spy, wrapper };
};

describe("the threshold", () => {
  it("treats a press that barely trembles as a click, and commits nothing", async () => {
    const { card, spy, wrapper } = await armed();

    // Inside the threshold circle: a couple of pixels of tremor, which every
    // real click has.
    await drag(card, wrapper, [MIDDLE, { x: MIDDLE.x + 2, y: MIDDLE.y + 1 }]);

    expect(spy.commits).toHaveLength(0);
    // It still selected: grabbing a badge is how you open its form.
    expect(spy.selections).toContain(0);
  });

  it("puts the badge back where it was when the gesture commits nothing", async () => {
    // Nothing is coming to correct it: no commit means no setConfig, so a badge
    // left on the pixels the pointer wandered to would simply stay a couple off
    // from the coordinates the config still holds.
    const { card, spy, wrapper } = await armed();
    const before = rectInLayer(card, wrapper);

    await drag(card, wrapper, [MIDDLE, { x: MIDDLE.x + 2, y: MIDDLE.y + 1 }]);

    const after = rectInLayer(card, wrapper);
    expect(after.left).toBeCloseTo(before.left, 2);
    expect(after.top).toBeCloseTo(before.top, 2);
    expect(spy.commits).toHaveLength(0);
  });

  /**
   * The threshold protects a click from its own tremor, and for a long time it
   * threw away the opposite intent with it: a one-pixel adjustment is smaller
   * than any tremor, and someone making it means it. Holding is what says so.
   */
  it("commits a one-pixel adjustment that was held", async () => {
    const { card, spy, wrapper } = await armed();
    const before = rectInLayer(card, wrapper);

    await press(card, wrapper, MIDDLE);
    await move(card, wrapper, { x: MIDDLE.x + 1, y: MIDDLE.y });
    // Real time, deliberately: this is the one claim the injected clock cannot
    // make, since the card builds its own controller. The exact boundary is
    // pinned in the happy-dom lane, on isDrag.
    await new Promise((resolve) => setTimeout(resolve, DRAG_HOLD_MS + 50));
    await release(card, wrapper, { x: MIDDLE.x + 1, y: MIDDLE.y });

    expect(spy.commits).toHaveLength(1);
    expect(rectInLayer(card, wrapper).left).toBeCloseTo(before.left + 1, 1);
  });

  it("commits nothing for a long hold that moved the badge nowhere", async () => {
    const { card, spy, wrapper } = await armed();

    await press(card, wrapper, MIDDLE);
    await new Promise((resolve) => setTimeout(resolve, DRAG_HOLD_MS + 50));
    await release(card, wrapper, MIDDLE);

    expect(spy.commits).toHaveLength(0);
  });

  it("commits once the travel clears the threshold", async () => {
    const { card, spy, wrapper } = await armed();

    await drag(card, wrapper, [MIDDLE, { x: MIDDLE.x + DRAG_THRESHOLD_PX + 2, y: MIDDLE.y }]);

    expect(spy.commits).toHaveLength(1);
  });
});

/**
 * The gesture's whole contract: what you dropped is what gets stored. The card
 * commits percentages, Home Assistant rebuilds the element from them, and the
 * badge must come back under the pointer. Only real layout can close that loop,
 * because the two ends are pixels and the middle is a percentage.
 */
describe("what the drag commits", () => {
  it("stores coordinates that put the badge back exactly where it was dropped", async () => {
    const { card, spy, wrapper } = await armed();

    await drag(card, wrapper, [MIDDLE, { x: 120, y: 90 }]);
    const dropped = rectInLayer(card, wrapper);
    const committed = spy.commits[0]?.position;
    expect(committed).toBeDefined();

    const rebuilt = await mountCard(
      configWith({ top: `${committed?.top}%`, left: `${committed?.left}%` }),
    );
    const back = rectInLayer(rebuilt, wrappers(rebuilt)[0] as Element);

    expect(back.left).toBeCloseTo(dropped.left, 1);
    expect(back.top).toBeCloseTo(dropped.top, 1);
  });

  it("does not shift the badge when the pointer is released", async () => {
    const { card, wrapper } = await armed();

    await press(card, wrapper, MIDDLE);
    await move(card, wrapper, { x: 120, y: 90 });
    const duringGesture = rectInLayer(card, wrapper);

    await release(card, wrapper, { x: 120, y: 90 });
    const afterRelease = rectInLayer(card, wrapper);

    // pointerup swaps raw pixels back for percentages plus a translate. Same
    // geometry, so there must be no flash — and no permanent shift either.
    expect(afterRelease.left).toBeCloseTo(duringGesture.left, 1);
    expect(afterRelease.top).toBeCloseTo(duringGesture.top, 1);
  });
});

/**
 * The clamp is written in pixels against rects measured at pointerdown, so it
 * is exactly the kind of arithmetic that looks right and lands wrong. An
 * escaped badge is also not merely ugly: `ha-card` scrolls vertically, so an
 * overhang raises a scrollbar under the pointer mid-gesture.
 */
describe("the clamp", () => {
  const corners: [string, { x: number; y: number }, (r: { top: number; left: number }) => void][] =
    [
      [
        "past the right edge",
        { x: LAYER.width + 200, y: MIDDLE.y },
        (r) => expect(r.left).toBeCloseTo(LAYER.width - BADGE.width, 1),
      ],
      ["past the left edge", { x: -200, y: MIDDLE.y }, (r) => expect(r.left).toBeCloseTo(0, 1)],
      [
        "past the bottom edge",
        { x: MIDDLE.x, y: LAYER.height + 200 },
        (r) => expect(r.top).toBeCloseTo(LAYER.height - BADGE.height, 1),
      ],
      ["past the top edge", { x: MIDDLE.x, y: -200 }, (r) => expect(r.top).toBeCloseTo(0, 1)],
    ];

  for (const [name, to, assert] of corners) {
    it(`holds the badge inside the layer when dragged ${name}`, async () => {
      const { card, wrapper } = await armed();

      await drag(card, wrapper, [MIDDLE, to]);
      const rect = rectInLayer(card, wrapper);

      assert(rect);
      expect(rect.left).toBeGreaterThanOrEqual(-0.5);
      expect(rect.top).toBeGreaterThanOrEqual(-0.5);
      expect(rect.left + rect.width).toBeLessThanOrEqual(LAYER.width + 0.5);
      expect(rect.top + rect.height).toBeLessThanOrEqual(LAYER.height + 0.5);
    });
  }

  it("never commits coordinates that would place the badge outside", async () => {
    const { card, spy, wrapper } = await armed();

    await drag(card, wrapper, [MIDDLE, { x: LAYER.width + 500, y: LAYER.height + 500 }]);
    const committed = spy.commits[0]?.position;

    // Under `auto` the coordinate is a fraction of the free span, so flush with
    // the bottom-right corner is exactly 100 — never more.
    expect(committed?.left).toBeCloseTo(100, 1);
    expect(committed?.top).toBeCloseTo(100, 1);
  });
});

/**
 * Pixel-precise while dragging, percentages only on release. Reading the inline
 * style is the only way to tell the two regimes apart — the rendered geometry is
 * identical by design, which is the point.
 */
describe("the two regimes", () => {
  it("switches the badge to raw pixels with no transform while the pointer is down", async () => {
    const { card, wrapper } = await armed();

    await press(card, wrapper, MIDDLE);
    expect(wrapper.style.left.endsWith("px")).toBe(true);
    expect(wrapper.style.top.endsWith("px")).toBe(true);
    expect(wrapper.style.transform).toBe("none");
  });

  it("puts percentages and the anchoring translate back on release", async () => {
    const { card, wrapper } = await armed();

    await drag(card, wrapper, [MIDDLE, { x: 120, y: 90 }]);

    expect(wrapper.style.left.endsWith("%")).toBe(true);
    expect(wrapper.style.top.endsWith("%")).toBe(true);
    expect(wrapper.style.transform).toContain("translate");
  });

  it("restores the derived style even when the gesture committed nothing", async () => {
    // A click moves nothing, so no setConfig comes back to undo pointerdown's
    // switch to raw pixels. Without the unconditional restore the badge would
    // sit shifted by its own anchoring translate.
    const { card, wrapper } = await armed({ top: "100%", left: "100%" });
    const before = rectInLayer(card, wrapper);

    await drag(card, wrapper, [MIDDLE, { x: MIDDLE.x + 1, y: MIDDLE.y }]);

    const after = rectInLayer(card, wrapper);
    expect(after.left).toBeCloseTo(before.left, 1);
    expect(after.top).toBeCloseTo(before.top, 1);
  });
});

/**
 * The marker overhangs the wrapper, and it has to point inward for the WHOLE
 * gesture — a corner left on the side the badge is travelling towards raises a
 * scrollbar under the pointer, mid-drag.
 */
describe("the condition marker", () => {
  const conditional = { visibility: [{ condition: "state", entity: "light.a", state: "on" }] };

  it("flips the corner during the gesture, not after it", async () => {
    const { card, wrapper } = await armed({ top: "50%", left: "20%" }, undefined, conditional);
    expect(wrapper.classList.contains("conditional")).toBe(true);
    expect(wrapper.classList.contains("marker-top-right")).toBe(true);

    await press(card, wrapper, { x: 80, y: 150 });
    await move(card, wrapper, { x: 320, y: 150 });

    // Still mid-gesture: the pointer is down and nothing has been committed.
    expect(wrapper.classList.contains("marker-top-left")).toBe(true);
    expect(wrapper.classList.contains("marker-top-right")).toBe(false);

    await release(card, wrapper, { x: 320, y: 150 });
  });
});
