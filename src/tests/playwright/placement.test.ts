import { afterEach, describe, expect, it } from "@rstest/core";
import { ANCHOR_OFFSETS, type Anchor } from "../../position";
import {
  BADGE,
  cleanup,
  configWith,
  LAYER,
  layer,
  mountCard,
  rectInLayer,
  wrappers,
} from "./harness";

afterEach(cleanup);

/** The point of the item's own box that its coordinates are supposed to pin. */
const anchorPoint = (
  rect: { top: number; left: number; width: number; height: number },
  offsets: { x: number; y: number },
): { x: number; y: number } => ({
  x: rect.left + (offsets.x / 100) * rect.width,
  y: rect.top + (offsets.y / 100) * rect.height,
});

it("gives the layer the dimensions the rest of the lane assumes", async () => {
  const card = await mountCard(configWith({ top: "50%", left: "50%" }));
  const box = layer(card).getBoundingClientRect();
  expect(box.width).toBe(LAYER.width);
  expect(box.height).toBe(LAYER.height);

  const item = rectInLayer(card, wrappers(card)[0] as Element);
  expect(item.width).toBe(BADGE.width);
  expect(item.height).toBe(BADGE.height);
});

/**
 * The whole promise of a fixed anchor, in one law: whichever of the item's nine
 * points the anchor names, THAT point lands on the coordinate. `left: 50%` with
 * anchor `center` means the item's centre is at the middle of the image — and
 * nothing short of real layout can tell you whether the translate delivered it,
 * because the card only ever writes a percentage string.
 */
describe("fixed anchors", () => {
  for (const [name, offsets] of Object.entries(ANCHOR_OFFSETS)) {
    it(`puts the ${name} point of the badge on the coordinate`, async () => {
      const card = await mountCard(configWith({ top: "10%", left: "10%" }, name));
      const point = anchorPoint(rectInLayer(card, wrappers(card)[0] as Element), offsets);

      expect(point.x).toBeCloseTo(0.1 * LAYER.width, 3);
      expect(point.y).toBeCloseTo(0.1 * LAYER.height, 3);
    });
  }

  it("lets a fixed anchor express overflow, which is why it exists", async () => {
    const card = await mountCard(configWith({ top: "0%", left: "0%" }, "center"));
    const rect = rectInLayer(card, wrappers(card)[0] as Element);

    // Half the badge hangs off the top-left corner. `auto` cannot say this.
    expect(rect.left).toBeCloseTo(-BADGE.width / 2, 3);
    expect(rect.top).toBeCloseTo(-BADGE.height / 2, 3);
  });
});

/**
 * `auto` maps the coordinate onto the travel the item actually has, so 0 and
 * 100 sit flush with the edges instead of hanging half-off them. That is the
 * property that makes any coordinate in 0-100 safe at any container size.
 */
describe("the auto anchor", () => {
  it("sits flush at both extremes without overflowing", async () => {
    const topLeft = await mountCard(configWith({ top: "0%", left: "0%" }));
    expect(rectInLayer(topLeft, wrappers(topLeft)[0] as Element).left).toBeCloseTo(0, 3);
    expect(rectInLayer(topLeft, wrappers(topLeft)[0] as Element).top).toBeCloseTo(0, 3);

    const bottomRight = await mountCard(configWith({ top: "100%", left: "100%" }));
    const rect = rectInLayer(bottomRight, wrappers(bottomRight)[0] as Element);
    expect(rect.left + rect.width).toBeCloseTo(LAYER.width, 3);
    expect(rect.top + rect.height).toBeCloseTo(LAYER.height, 3);
  });

  it("spends the coordinate on the free span, not on the container", async () => {
    const card = await mountCard(configWith({ top: "25%", left: "25%" }));
    const rect = rectInLayer(card, wrappers(card)[0] as Element);

    // 25% of (400 - 40), not 25% of 400 — the difference is the badge's own size.
    expect(rect.left).toBeCloseTo(0.25 * (LAYER.width - BADGE.width), 3);
    expect(rect.top).toBeCloseTo(0.25 * (LAYER.height - BADGE.height), 3);
  });
});

/**
 * reanchor's entire reason to exist is that switching anchors must not move the
 * item on screen. It is fed two getBoundingClientRects, so happy-dom can only
 * check its arithmetic against numbers the test invented. Here the rects are
 * real, and the assertion is the one that matters: same pixels, before and
 * after. The remount mirrors Home Assistant, which rebuilds the card on every
 * config change — the old instance is gone by the time the anchor comes back.
 */
describe("reanchor", () => {
  const pairs: [Anchor, Anchor][] = [
    ["auto", "center"],
    ["center", "top-left"],
    ["bottom-right", "auto"],
    ["top-left", "bottom-right"],
  ];

  for (const [from, to] of pairs) {
    it(`leaves the badge where it was going from ${from} to ${to}`, async () => {
      const before = await mountCard(configWith({ top: "30%", left: "70%" }, from));
      const rectBefore = rectInLayer(before, wrappers(before)[0] as Element);

      const moved = before.reanchor(0, to);
      expect(moved).toBeDefined();

      const after = await mountCard(
        configWith({ top: `${moved?.top}%`, left: `${moved?.left}%` }, to),
      );
      const rectAfter = rectInLayer(after, wrappers(after)[0] as Element);

      expect(rectAfter.left).toBeCloseTo(rectBefore.left, 1);
      expect(rectAfter.top).toBeCloseTo(rectBefore.top, 1);
    });
  }

  it("declines to recompute when the anchor is already the one asked for", async () => {
    const card = await mountCard(configWith({ top: "30%", left: "70%" }, "center"));
    expect(card.reanchor(0, "center")).toBeUndefined();
  });
});
