import { afterEach, describe, expect, test } from "@rstest/core";
import {
  applyLiveCameraRatio,
  imageSource,
  liveCameraRatioCache,
  PictureStudioImage,
} from "../../../card/image-element";
import { IMAGE_TAG, type ImageElementConfig } from "../../../config";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(IMAGE_TAG)) customElements.define(IMAGE_TAG, PictureStudioImage);

/**
 * Minimal hui-image stub: accepts Lit property assignments and exposes a
 * shadow root with `.container` so `applyLiveCameraRatio`'s guard can read
 * `padding-bottom`. In happy-dom there is no layout, so getComputedStyle
 * returns the inline style value directly ("56.25%"), and the guard handles
 * that form explicitly. The assertions below query the container to verify
 * the ratio was applied.
 *
 * Modelled from the real hui-image's shadow-root layout on HA frontend
 * 20260729.6 — only as much as the guard and the assertions need.
 */
class HuiImageStub extends HTMLElement {
  #container: HTMLElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    this.#container = document.createElement("div");
    this.#container.className = "container";
    // 16:9 fallback: hui-image's hard-coded default before any ratio is derived.
    this.#container.style.paddingBottom = "56.25%";
    shadow.appendChild(this.#container);
  }

  set aspectRatio(value: string | undefined) {
    if (!value) {
      this.#container.style.paddingBottom = "56.25%";
      return;
    }
    const parts = value.split("x");
    const wStr = parts[0];
    const hStr = parts[1];
    const w = wStr !== undefined ? parseFloat(wStr) : 0;
    const h = hStr !== undefined ? parseFloat(hStr) : 0;
    if (w > 0 && h > 0) {
      this.#container.style.paddingBottom = `${(100 * h) / w}%`;
    }
  }
}
if (!customElements.get("hui-image")) customElements.define("hui-image", HuiImageStub);

/**
 * Image mock: fires `onload` as a microtask with controllable dimensions so
 * the ratio tests do not perform real network requests. The load count is
 * reset in `afterEach` together with the cache so each test is independent.
 */
let imageLoadCount = 0;
const mockImageDimensions = { width: 600, height: 410 };

(globalThis as unknown as { Image: unknown }).Image = class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  get naturalWidth(): number {
    return mockImageDimensions.width;
  }
  get naturalHeight(): number {
    return mockImageDimensions.height;
  }

  set src(_value: string) {
    imageLoadCount++;
    queueMicrotask(() => {
      this.onload?.();
    });
  }
};

const hass = (states: Record<string, unknown> = {}): HomeAssistant =>
  ({ states, themes: { darkMode: false }, language: "en", localize: () => "" }) as HomeAssistant;

const mount = async (config: ImageElementConfig, h = hass(), editing = false) => {
  const el = document.createElement(IMAGE_TAG) as PictureStudioImage;
  el.editing = editing;
  el.setConfig(config);
  el.hass = h;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
  liveCameraRatioCache.clear();
  imageLoadCount = 0;
});

describe("imageSource", () => {
  test("a plain path passes through", () => {
    expect(imageSource({ type: "image", width: 20, image: "/a.png" }, hass())).toBe("/a.png");
  });

  test("a media selector object is unwrapped, like the background's", () => {
    expect(
      imageSource({ type: "image", width: 20, image: { media_content_id: "/b.png" } }, hass()),
    ).toBe("/b.png");
  });

  test("image_entity becomes the proxy URL, state included as its cache-buster", () => {
    const h = hass({
      "image.door": {
        entity_id: "image.door",
        state: "2026-08-24",
        attributes: { access_token: "T" },
      },
    });
    expect(imageSource({ type: "image", width: 20, image_entity: "image.door" }, h)).toBe(
      "/api/image_proxy/image.door?token=T&state=2026-08-24",
    );
  });

  test("no token, no image — Home Assistant's own answer, mirrored", () => {
    const h = hass({ "image.door": { entity_id: "image.door", state: "x", attributes: {} } });
    expect(
      imageSource({ type: "image", width: 20, image_entity: "image.door" }, h),
    ).toBeUndefined();
  });

  test("image_entity wins over image, as hui-image-element resolves it", () => {
    const h = hass({
      "image.door": {
        entity_id: "image.door",
        state: "s",
        attributes: { access_token: "T" },
      },
    });
    expect(
      imageSource({ type: "image", width: 20, image: "/a.png", image_entity: "image.door" }, h),
    ).toBe("/api/image_proxy/image.door?token=T&state=s");
  });
});

describe("rendering", () => {
  test("keep-ratio asks hui-image to contain; an explicit height asks it to fill", async () => {
    const kept = await mount({ type: "image", width: 40, image: "/a.png" });
    expect(kept.renderRoot.querySelector("hui-image")).toBeTruthy();
    expect(
      (kept.renderRoot.querySelector("hui-image") as unknown as { fitMode?: string }).fitMode,
    ).toBe("contain");

    const sized = await mount({ type: "image", width: 40, height: 25, image: "/a.png" });
    expect(
      (sized.renderRoot.querySelector("hui-image") as unknown as { fitMode?: string }).fitMode,
    ).toBe("fill");
  });

  test("every hui-image key is forwarded", async () => {
    const el = await mount({
      type: "image",
      width: 40,
      image: "/a.png",
      dark_mode_image: "/dark.png",
      camera_image: "camera.front",
      camera_view: "live",
      entity: "binary_sensor.door",
      state_image: { on: "/on.png" },
      state_filter: { off: "grayscale(1)" },
      filter: "blur(1px)",
      dark_mode_filter: "brightness(.7)",
    });
    const image = el.renderRoot.querySelector("hui-image") as unknown as Record<string, unknown>;
    // .image is the primary source binding — a regression in the template
    // binding would make the image go blank without being caught elsewhere.
    expect(image.image).toBe("/a.png");
    expect(image.darkModeImage).toBe("/dark.png");
    expect(image.cameraImage).toBe("camera.front");
    expect(image.cameraView).toBe("live");
    expect(image.entity).toBe("binary_sensor.door");
    expect(image.stateImage).toEqual({ on: "/on.png" });
    expect(image.stateFilter).toEqual({ off: "grayscale(1)" });
    expect(image.filter).toBe("blur(1px)");
    expect(image.darkModeFilter).toBe("brightness(.7)");
  });

  test("the clickable attribute follows the config", async () => {
    const inert = await mount({ type: "image", width: 40, image: "/a.png" });
    expect(inert.hasAttribute("clickable")).toBe(false);

    const live = await mount({
      type: "image",
      width: 40,
      image: "/a.png",
      tap_action: { action: "more-info" },
    });
    expect(live.hasAttribute("clickable")).toBe(true);
  });

  // I1 regression: with both entity and image_entity set, the old shouldUpdate
  // used `entity ?? image_entity`, which evaluated to `entity` when both were
  // present. hassRenderChanged was then called with only entity — so a state
  // change on image_entity (new photo token, cache-buster moved) returned false
  // and suppressed the render. The fix watches both, joined with ||.
  test("a state change on image_entity re-renders even when entity is also set", async () => {
    const h1 = hass({
      "image.door": {
        entity_id: "image.door",
        state: "t1",
        attributes: { access_token: "A" },
      },
      "sensor.temp": { entity_id: "sensor.temp", state: "25", attributes: {} },
    });
    const el = await mount(
      { type: "image", width: 40, image_entity: "image.door", entity: "sensor.temp" },
      h1,
    );
    const img = el.renderRoot.querySelector("hui-image") as unknown as Record<string, unknown>;
    expect(String(img.image)).toContain("state=t1");

    const h2 = hass({
      "image.door": {
        entity_id: "image.door",
        state: "t2",
        attributes: { access_token: "A" },
      },
      "sensor.temp": { entity_id: "sensor.temp", state: "25", attributes: {} },
    });
    el.hass = h2;
    await el.updateComplete;
    expect(String(img.image)).toContain("state=t2");
  });

  test("an action event is relayed as hass-action carrying the config", async () => {
    const config: ImageElementConfig = {
      type: "image",
      width: 40,
      image: "/a.png",
      tap_action: { action: "more-info" },
    };
    const el = await mount(config);
    let received: CustomEvent | undefined;
    el.addEventListener(
      "hass-action",
      (e: Event) => {
        received = e as CustomEvent;
      },
      { once: true },
    );
    el.dispatchEvent(
      new CustomEvent("action", { detail: { action: "tap" }, bubbles: true, composed: true }),
    );
    expect(received).toBeTruthy();
    expect(received?.detail?.config).toEqual(config);
    expect(received?.detail?.action).toBe("tap");
  });
});

describe("a live camera forces the fit", () => {
  test("contain, even with a height in the config", async () => {
    // The card draws such an item in keep-ratio; the element has to agree, or
    // the two would disagree about the same fact. Both read `effectiveBox`.
    const el = await mount({
      type: "image",
      camera_image: "camera.hall",
      camera_view: "live",
      width: 40,
      height: 20,
    });
    expect((el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe(
      "contain",
    );
  });
});

/**
 * Decision 8, settled 2026-08-25. The cursor follows Home Assistant's own
 * decision — whether an action is declared — and never a forecast of what that
 * action will produce; a misconfigured action does nothing, and Home Assistant
 * says so in its own way.
 *
 * What separates an image from an icon is therefore not the rule but the
 * default: the image kind declares `tap_action: none` in `element-kinds.ts`, so
 * silence means inert here while it still means more-info there. That is also
 * what the form has always displayed.
 *
 * Asserted through `setConfig`, not on the predicate: the merge of the kind's
 * defaults is half of what is being tested.
 */
const clickable = async (config: ImageElementConfig): Promise<boolean> =>
  (await mount(config)).hasAttribute("clickable");

describe("the cursor follows the declared action", () => {
  test("a picture nobody gave an action to is inert", async () => {
    expect(await clickable({ type: "image", width: 20, image: "/a.png" })).toBe(false);
    expect(await clickable({ type: "image", width: 20 })).toBe(false);
  });

  test("a subject is not an action — a camera picture waits to be asked", async () => {
    expect(await clickable({ type: "image", width: 20, entity: "light.a" })).toBe(false);
    expect(await clickable({ type: "image", width: 20, camera_image: "camera.a" })).toBe(false);
    expect(await clickable({ type: "image", width: 20, image_entity: "image.a" })).toBe(false);
  });

  test("an explicit action makes it clickable, subject or none", async () => {
    expect(await clickable({ type: "image", width: 20, tap_action: { action: "more-info" } })).toBe(
      true,
    );
    expect(await clickable({ type: "image", width: 20, hold_action: { action: "toggle" } })).toBe(
      true,
    );
    expect(
      await clickable({
        type: "image",
        width: 20,
        image: "/a.png",
        tap_action: { action: "navigate", navigation_path: "/lovelace" },
      }),
    ).toBe(true);
  });

  test("an explicit none is inert, like the default it repeats", async () => {
    expect(await clickable({ type: "image", width: 20, tap_action: { action: "none" } })).toBe(
      false,
    );
  });
});

test("the gesture's stretch overrides the fit mode the config implies", async () => {
  // During a resize no setConfig fires, so an element whose box has just gained
  // a pixel height would still render `contain` and letterbox inside the
  // selection ring until the release.
  const el = await mount({ type: "image", width: 40, image: "/a.png" });
  const fit = () => (el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode;
  expect(fit()).toBe("contain");

  el.stretch = true;
  await el.updateComplete;
  expect(fit()).toBe("fill");

  el.stretch = undefined;
  await el.updateComplete;
  expect(fit()).toBe("contain");
});

test("a false stretch overrides a config that would fill", async () => {
  // `?? ` and not `||`: false is a value here, not an absence.
  const el = await mount({ type: "image", width: 40, height: 25, image: "/a.png" });
  expect((el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe("fill");

  el.stretch = false;
  await el.updateComplete;
  expect((el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe(
    "contain",
  );
});

describe("the kind's default action", () => {
  test("is merged into the stored config, so Home Assistant reads it too", async () => {
    const el = await mount({ type: "image", width: 20, image: "/a.png" });
    expect(el._config?.tap_action).toEqual({ action: "none" });
  });

  test("never overrides what the user wrote", async () => {
    const el = await mount({
      type: "image",
      width: 20,
      tap_action: { action: "more-info" },
    });
    expect(el._config?.tap_action).toEqual({ action: "more-info" });
  });
});

/**
 * Tests for applyLiveCameraRatio. happy-dom performs no layout, so the
 * contract under test is the decision logic, not the geometry. The stub's
 * shadow-root container reports padding-bottom as an inline percentage string
 * ("56.25%"), which the production code handles explicitly alongside the pixel
 * form real browsers return.
 */
describe("live camera ratio correction", () => {
  test("a live camera at 16:9 gets aspectRatio set from entity_picture", async () => {
    mockImageDimensions.width = 600;
    mockImageDimensions.height = 410;
    const h = hass({
      "camera.hallA": {
        entity_id: "camera.hallA",
        state: "idle",
        attributes: { entity_picture: "/api/camera_proxy/camera.hallA?token=t" },
      },
    });
    const el = await mount(
      {
        type: "image",
        camera_image: "camera.hallA",
        camera_view: "live",
        width: 20,
      },
      h,
    );
    // Let the async Image onload (microtask) fire.
    await new Promise<void>((r) => queueMicrotask(r));

    const hui = el.renderRoot.querySelector("hui-image") as Element;
    const container = hui.shadowRoot?.querySelector(".container") as HTMLElement;
    // Container now shows the real ratio, not 16:9.
    expect(container.style.paddingBottom).toBe(`${(100 * 410) / 600}%`);
  });

  test("the guard: container not at 16:9 gets nothing on re-render", async () => {
    // First mount establishes the cache and applies the ratio.
    const h = hass({
      "camera.hallB": {
        entity_id: "camera.hallB",
        state: "idle",
        attributes: { entity_picture: "/api/camera_proxy/camera.hallB?token=t" },
      },
    });
    const el = await mount(
      {
        type: "image",
        camera_image: "camera.hallB",
        camera_view: "live",
        width: 20,
      },
      h,
    );
    await new Promise<void>((r) => queueMicrotask(r));
    imageLoadCount = 0; // reset after first load

    // Directly move the container away from 16:9, simulating hui-image having
    // derived its own ratio (so our fix should not act again).
    const hui = el.renderRoot.querySelector("hui-image") as Element;
    const container = hui.shadowRoot?.querySelector(".container") as HTMLElement;
    container.style.paddingBottom = "75%";

    // Trigger another call to updated() via a reactive property change.
    el.stretch = true;
    await el.updateComplete;
    await new Promise<void>((r) => queueMicrotask(r));

    // Guard blocked the fix — no new image was loaded.
    expect(imageLoadCount).toBe(0);
  });

  test("a non-live camera (camera_view: auto) gets nothing", async () => {
    const h = hass({
      "camera.hallC": {
        entity_id: "camera.hallC",
        state: "idle",
        attributes: { entity_picture: "/api/camera_proxy/camera.hallC?token=t" },
      },
    });
    await mount({ type: "image", camera_image: "camera.hallC", camera_view: "auto", width: 20 }, h);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(imageLoadCount).toBe(0);
  });

  test("an ordinary image (no camera_view) gets nothing", async () => {
    await mount({ type: "image", image: "/a.png", width: 20 });
    await new Promise<void>((r) => queueMicrotask(r));
    expect(imageLoadCount).toBe(0);
  });

  test("no entity_picture gets nothing and does not throw", async () => {
    const h = hass({
      "camera.hallD": {
        entity_id: "camera.hallD",
        state: "idle",
        attributes: {},
      },
    });
    // Should complete without throwing; the early-return on missing entity_picture
    // is the only guarantee needed here.
    await mount(
      {
        type: "image",
        camera_image: "camera.hallD",
        camera_view: "live",
        width: 20,
      },
      h,
    );
    await new Promise<void>((r) => queueMicrotask(r));
    expect(imageLoadCount).toBe(0);
  });

  test("null shadowRoot does not throw", () => {
    // applyLiveCameraRatio is exported so this path can be exercised directly.
    // A plain div has no shadow root; the guard returns early without throwing.
    const fake = document.createElement("div");
    const h = hass({
      "camera.hallE": {
        entity_id: "camera.hallE",
        state: "idle",
        attributes: { entity_picture: "/a.jpg" },
      },
    });
    expect(() =>
      applyLiveCameraRatio(
        { type: "image", camera_image: "camera.hallE", camera_view: "live", width: 20 },
        h,
        fake,
      ),
    ).not.toThrow();
    expect(imageLoadCount).toBe(0);
  });

  test("the picture is loaded once for two elements on the same camera — the cache", async () => {
    mockImageDimensions.width = 600;
    mockImageDimensions.height = 410;
    const h = hass({
      "camera.shared": {
        entity_id: "camera.shared",
        state: "idle",
        attributes: { entity_picture: "/api/camera_proxy/camera.shared?token=t" },
      },
    });
    const config: ImageElementConfig = {
      type: "image",
      camera_image: "camera.shared",
      camera_view: "live",
      width: 20,
    };
    await mount(config, h);
    await new Promise<void>((r) => queueMicrotask(r));
    // First element populated the cache.
    imageLoadCount = 0;

    await mount(config, h);
    await new Promise<void>((r) => queueMicrotask(r));
    // Second element hit the cache — no new Image() was created.
    expect(imageLoadCount).toBe(0);
  });
});
