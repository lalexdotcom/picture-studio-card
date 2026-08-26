import { afterEach, expect, it } from "@rstest/core";
import {
  cleanup,
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

/**
 * One image element, at a known box. `image` carries the `-<w>x<h>` suffix the
 * harness's `HuiImageStub` reads to apply an aspect ratio — which is what makes
 * a keep-ratio assertion precise without touching production code.
 */
const imageCard = (image: string, width: number, height?: number): unknown => ({
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "element",
      position: { top: "0%", left: "0%" },
      anchor: "top-left",
      config: { type: "image", image, width, ...(height !== undefined ? { height } : {}) },
    },
  ],
});

const armed = async (config: unknown) => {
  const card = await mountCard(config);
  const spy = await enterEditing(card);
  const wrapper = wrappers(card)[0] as HTMLElement;
  wrapper.dispatchEvent(
    new PointerEvent("pointerdown", { pointerId: 9, button: 0, bubbles: true }),
  );
  wrapper.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9, button: 0, bubbles: true }));
  await card.updateComplete;
  const handle = wrapper.querySelector(".handle-bottom-right") as HTMLElement;
  return { card, spy, wrapper, handle };
};

/**
 * The claim happy-dom structurally cannot make: in keep-ratio mode the gesture
 * writes a width and the BROWSER resolves the height. A 2:1 image dragged to
 * 200px wide must be 100px tall, with nothing of ours computing that.
 */
it("keeps the image's own ratio, resolved by layout and not by arithmetic", async () => {
  // width 20 % of 400 = 80px, 2:1 -> 40px tall.
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: 200, y: 40 });

  const rect = rectInLayer(card, wrapper);
  expect(rect.height).toBeCloseTo(rect.width / 2, 1);
});

/**
 * Decision 5's WYSIWYG promise: the box the release commits renders exactly
 * where the gesture drew it.
 */
it("renders the committed box where the gesture drew it", async () => {
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: 160, y: 80 });
  const during = rectInLayer(card, wrapper);
  await release(card, handle, { x: 160, y: 80 });

  const after = rectInLayer(card, wrapper);
  expect(after.width).toBeCloseTo(during.width, 1);
  expect(after.height).toBeCloseTo(during.height, 1);
});

/**
 * The transient fit mode. A free resize gives the box a pixel height while the
 * config still has none, so without the override the image would sit
 * letterboxed inside the ring and snap to fill at the release.
 */
it("fills the box during a free resize, not only after the commit", async () => {
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: 200, y: 160 }, { shiftKey: true });

  const image = wrapper.querySelector("picture-studio-image") as HTMLElement & {
    shadowRoot: ShadowRoot | null;
  };
  const hui = image.shadowRoot?.querySelector("hui-image") as
    | (HTMLElement & { fitMode?: string })
    | null;
  expect(hui?.fitMode).toBe("fill");
});

/**
 * The clamp: a corner pushed past the background stops at it, and the ratio is
 * exact all the way to the stop. Per-axis clamping would distort here.
 */
it("stops at the background without distorting on the way", async () => {
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: LAYER.width * 3, y: 40 });

  const rect = rectInLayer(card, wrapper);
  expect(rect.width).toBeLessThanOrEqual(LAYER.width + 0.5);
  expect(rect.height).toBeCloseTo(rect.width / 2, 1);
});
