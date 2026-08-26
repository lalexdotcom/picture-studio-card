import { afterEach, expect, it } from "@rstest/core";
import { cleanup, mountCard, rectInLayer, wrappers } from "./harness";

afterEach(cleanup);

/**
 * Creates a loadable image of the given pixel dimensions by drawing it onto an
 * off-screen canvas and exporting as a data URL. `new Image()` loading this URL
 * fires `onload` and returns the correct `naturalWidth` / `naturalHeight` without
 * a real server — the only way to supply entity_picture in a browser test.
 */
const cameraDataUrl = (w: number, h: number): string => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  // One pixel is enough; naturalWidth/Height come from the IHDR dimensions.
  canvas.getContext("2d")?.fillRect(0, 0, 1, 1);
  return canvas.toDataURL("image/png");
};

/**
 * A card with one live-camera element plus a fake hass whose camera entity
 * carries entity_picture as a loadable data URL of the given dimensions.
 */
const cameraCard = (cameraW: number, cameraH: number): { config: unknown; hass: unknown } => ({
  config: {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "element",
        position: { top: "0%", left: "0%" },
        config: {
          type: "image",
          camera_image: "camera.hall",
          camera_view: "live",
          width: 20,
        },
      },
    ],
  },
  hass: {
    states: {
      "camera.hall": {
        entity_id: "camera.hall",
        state: "idle",
        attributes: { entity_picture: cameraDataUrl(cameraW, cameraH) },
      },
    },
    themes: { darkMode: false },
    language: "en",
    localize: () => "",
  },
});

/**
 * The layout claim happy-dom cannot make: a live-camera item's wrapper matches
 * the camera's real ratio, not the 16:9 hui-image guesses while waiting.
 *
 * Without `applyLiveCameraRatio` this fails: `HuiImageStub`'s container sits
 * at `padding-bottom: 56.25 %` (16:9), and for a 600 × 410 camera the wrapper
 * is 56.25 % of its width tall — off by 12 pp from the real 68.33 %.
 *
 * RED evidence (without the async fix): hass is passed to mountCard so the
 * very first render of PictureStudioImage — when hui-image's shadow DOM is not
 * yet settled — is the one applyLiveCameraRatio must handle. HuiImageStub
 * mirrors this timing: its shadow DOM is built in a microtask (updateComplete),
 * not in the constructor. Without `await hui-image.updateComplete` the
 * synchronous check in updated() finds no container and the ratio is never
 * applied: rect.height / rect.width ≈ 0.5625 ≠ 0.6833.
 */
it("a live-camera item's wrapper ends up at the camera's real ratio, not 16:9", async () => {
  const CAMERA_W = 600;
  const CAMERA_H = 410;
  const { config, hass } = cameraCard(CAMERA_W, CAMERA_H);

  // hass is passed so the first render sees it and applyLiveCameraRatio runs
  // while hui-image's shadow DOM is still settling (updateComplete pending).
  // That is the timing path the fix addresses.
  const card = await mountCard(config, hass);
  // mountCard's flush() includes setTimeout(0), but that macrotask was
  // registered before img.src was set (during applyLiveCameraRatio's async
  // continuation). Give the browser one more turn to fire Image.onload.
  await new Promise<void>((r) => setTimeout(r, 50));

  const rect = rectInLayer(card, wrappers(card)[0] as Element);
  const actualRatio = rect.height / rect.width;
  const expectedRatio = CAMERA_H / CAMERA_W; // ≈ 0.6833

  // 16:9 (0.5625) and the real ratio (0.6833) differ by 0.12 — well outside
  // the tolerance — so ±0.005 is enough to distinguish them unambiguously.
  expect(actualRatio).toBeCloseTo(expectedRatio, 2);
});
