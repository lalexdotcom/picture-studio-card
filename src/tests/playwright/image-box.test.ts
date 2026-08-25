import { afterEach, expect, it } from "@rstest/core";
import { cleanup, LAYER, mountCard, rectInLayer, wrappers } from "./harness";

afterEach(cleanup);

/**
 * Build a card config with a single image element.
 *
 * `image` is the path; a `-<w>x<h>` suffix (e.g. "/banner-1x10.png") tells
 * `HuiImageStub` which aspect ratio to apply — that is the harness convention
 * that makes keep-ratio assertions precise without touching production code.
 */
const imageCard = (image: string, width: number, height?: number): unknown => ({
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "element",
      position: { top: "0%", left: "0%" },
      config: {
        type: "image",
        image,
        width,
        ...(height !== undefined ? { height } : {}),
      },
    },
  ],
});

/**
 * Explicit-height mode: both `width` and `height` are percentages of the
 * background. The wrapper must be exactly those percentages of the layer.
 */
it("an image element in explicit-height mode measures at the declared percentages", async () => {
  // width: 20 % of layer (400 px) = 80 px; height: 30 % of layer (300 px) = 90 px
  const card = await mountCard(imageCard("/overlay.png", 20, 30));
  const rect = rectInLayer(card, wrappers(card)[0] as Element);

  expect(rect.width).toBeCloseTo(0.2 * LAYER.width, 3);
  expect(rect.height).toBeCloseTo(0.3 * LAYER.height, 3);
});

/**
 * Keep-ratio mode: `height` is absent, so the wrapper has `height: auto` and
 * `max-height: 100%`. A 1:10 banner's unclamped height would be ten times its
 * width; decision 5's `max-height: 100%` bounds it to the layer's height
 * instead of letting it grow five times past it.
 */
it("a 1:10 banner in keep-ratio mode is bounded to the layer height, not ten times the width", async () => {
  // width: 20 % of 400 px = 80 px; unclamped height = 80 × 10 = 800 px;
  // max-height: 100% of layer (300 px) clamps the wrapper to 300 px.
  const card = await mountCard(imageCard("/banner-1x10.png", 20));
  const rect = rectInLayer(card, wrappers(card)[0] as Element);

  expect(rect.width).toBeCloseTo(0.2 * LAYER.width, 3);
  expect(rect.height).toBeCloseTo(LAYER.height, 3);
});
