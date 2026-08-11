import type { PictureBadgesConfig } from "../config";

/** Rewritten by hand: picture-entity's schema is a private constant, not retrievable. */
export const BACKGROUND_SCHEMA = [
  { name: "image", selector: { text: {} } },
  { name: "camera_image", selector: { entity: { filter: { domain: "camera" } } } },
  {
    name: "camera_view",
    selector: { select: { options: ["auto", "live"], mode: "dropdown" } },
  },
  { name: "aspect_ratio", selector: { text: {} } },
  {
    name: "fit_mode",
    selector: { select: { options: ["cover", "contain", "fill"], mode: "dropdown" } },
  },
] as const;

export type BackgroundData = Pick<
  PictureBadgesConfig,
  "image" | "camera_image" | "camera_view" | "aspect_ratio" | "fit_mode"
>;

export const backgroundData = (config: PictureBadgesConfig): BackgroundData => ({
  image: config.image,
  camera_image: config.camera_image,
  camera_view: config.camera_view,
  aspect_ratio: config.aspect_ratio,
  fit_mode: config.fit_mode,
});

/** Keys the form leaves empty are dropped, so they do not linger in the YAML. */
export const mergeBackground = (
  config: PictureBadgesConfig,
  data: BackgroundData,
): PictureBadgesConfig => {
  const next: PictureBadgesConfig = { ...config, ...data };
  for (const key of ["image", "camera_image", "camera_view", "aspect_ratio", "fit_mode"] as const) {
    if (next[key] === undefined || next[key] === "") delete next[key];
  }
  return next;
};
