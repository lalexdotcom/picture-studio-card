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
 * RED verification: each of the five tests below was run against a targeted
 * break to confirm it would fail without the mechanism it guards. The first
 * four were done 2026-08-26; the fifth (east/west height freeze) was verified
 * 2026-08-31 by removing `|| free` from the `stretched` calculation in
 * `apply()` inside resize-layer.ts — see task-6-report.md for the output.
 */

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

/**
 * The one claim happy-dom cannot make: it has no layout, so the frozen height
 * there is the stub's stored number rather than the image's own. Only a real
 * engine can prove that an east/west drag leaves the *drawn* height where it
 * was while the width moves — which is the whole reason a side handle exists.
 *
 * Targeted break: removing `|| free` from `const stretched = state.forced ?
 * false : state.hadHeight || free` in `apply()` clears the height for side
 * handles with no stored height (stretched → false → height=""), letting the
 * browser let it track the ratio as the width grows. Measured RED: height went
 * from 80px to 110px (the 2:1 ratio applied to the new width). 2026-08-31.
 */
it("an east/west drag keeps the drawn height while the width changes", async () => {
  // 40% of 400px = 160px wide; 2:1 ratio -> 80px tall; no stored height (keep-ratio).
  const { card, wrapper } = await armed(imageCard("/wide-2x1.png", 40));
  const before = rectInLayer(card, wrapper);

  const handle = wrapper.querySelector(".handle-right") as HTMLElement;
  // Press at the right edge, vertically centred.
  await press(card, handle, { x: before.left + before.width, y: before.top + before.height / 2 });
  // Move 60px further right — well past the ">50px wider" threshold.
  await move(card, handle, {
    x: before.left + before.width + 60,
    y: before.top + before.height / 2,
  });

  const during = rectInLayer(card, wrapper);
  expect(during.width).toBeGreaterThan(before.width + 50);
  expect(during.height).toBeCloseTo(before.height, 1);

  await release(card, handle, {
    x: before.left + before.width + 60,
    y: before.top + before.height / 2,
  });
});
