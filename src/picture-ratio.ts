import { type ImageSource, imagePath } from "./config";

/**
 * A picture's shape, remembered across card rebuilds.
 *
 * Home Assistant rebuilds the card element on every config change — `hui-card`
 * calls `createCardElement`, not `setConfig` — so every `hui-image` on the card
 * is built from nothing, and a fresh one has not measured its picture yet. It
 * therefore renders its hard-coded **16:9 placeholder** for a frame: a 468 px
 * wide box comes out 263 px tall instead of 549, and since every item's position
 * is a percentage of the layer, one wrong layer height moves all of them at once.
 *
 * Measured on this line: 15 rebuilds out of 15 showed that frame on the image
 * items, and 0 out of 15 on the background once it was given a known ratio.
 *
 * **This memory is what a rebuilt element has instead of a measurement.** It is
 * a memo rather than a cache with a policy: the shape of a picture does not
 * change, so there is nothing to invalidate. A remembered ratio that turns out
 * wrong costs one frame at the wrong shape instead of one frame at 16:9 —
 * strictly better than what it replaces — and the next measurement overwrites it.
 *
 * **What this does NOT fix, and must not be credited with:** the picture is also
 * absent for a frame or two because Chromium re-decodes a brand-new `<img>`
 * even when its bytes are cached. That is a rasterisation defect, not a
 * geometric one; the DOM is entirely correct while it happens. See
 * `mem:picture-studio/1.6.0-handoff`.
 */
const ratios = new Map<string, string>();

/**
 * What identifies a picture across rebuilds.
 *
 * **Not the URL.** `entity_picture` carries an access token that rotates while
 * the ratio does not — the lesson `liveCameraRatioCache` already learned. So an
 * entity is named by its id and a file by its path.
 *
 * `state_image` is deliberately not part of the key. A state table swaps the
 * picture as an entity moves, so the remembered shape may be another state's;
 * that is one frame at the wrong shape rather than one frame at 16:9, which is
 * the trade this whole memo makes.
 */
export const pictureKey = (config: {
  camera_image?: string;
  image_entity?: string;
  image?: ImageSource;
}): string | undefined => {
  if (config.camera_image) return `camera:${config.camera_image}`;
  if (config.image_entity) return `entity:${config.image_entity}`;
  const path = imagePath(config.image);
  return path ? `file:${path}` : undefined;
};

/** The remembered shape as `hui-image`'s `aspectRatio` spells it, or nothing. */
export const recallRatio = (key: string | undefined): string | undefined =>
  key === undefined ? undefined : ratios.get(key);

/**
 * Remember what a settled `hui-image` is showing.
 *
 * Read off the `<img>`'s natural size rather than the rendered container: the
 * container is a padding box whenever a ratio was imposed, so measuring it would
 * hand back the value we supplied and the memo could never correct itself.
 *
 * The shadow root is open — the same reach-in `applyLiveCameraRatio` already
 * makes, and the same internal with no deprecation cycle. Every failure path
 * degrades to remembering nothing.
 */
export const captureRatio = (key: string | undefined, huiImage: Element | null): void => {
  if (key === undefined || !huiImage) return;
  const img = huiImage.shadowRoot?.querySelector("img");
  if (!img) return;
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w > 0 && h > 0) ratios.set(key, `${w}x${h}`);
};

/**
 * Forgets everything. **Tests only** — the memo outlives an element by design,
 * so without this one test's picture would answer the next one's question.
 */
export const resetRatioMemory = (): void => {
  ratios.clear();
};
