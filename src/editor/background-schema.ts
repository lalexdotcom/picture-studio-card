import type { PictureBadgesConfig } from "../config";

/** Rewritten by hand: picture-entity's schema is a private constant, not retrievable. */
export const BACKGROUND_SCHEMA = [
  { name: "entity", selector: { entity: {} } },
  { name: "image", selector: { text: {} } },
  { name: "camera_image", selector: { entity: { filter: { domain: "camera" } } } },
  {
    name: "camera_view",
    selector: { select: { options: ["auto", "live"], mode: "dropdown" } },
  },
  { name: "aspect_ratio", selector: { text: {} } },
  { name: "tap_action", selector: { ui_action: {} } },
  { name: "hold_action", selector: { ui_action: {} } },
  { name: "double_tap_action", selector: { ui_action: {} } },
] as const;

export type BackgroundData = Pick<
  PictureBadgesConfig,
  | "entity"
  | "image"
  | "camera_image"
  | "camera_view"
  | "aspect_ratio"
  | "tap_action"
  | "hold_action"
  | "double_tap_action"
>;

export const backgroundData = (config: PictureBadgesConfig): BackgroundData => ({
  entity: config.entity,
  image: config.image,
  camera_image: config.camera_image,
  camera_view: config.camera_view,
  aspect_ratio: config.aspect_ratio,
  tap_action: config.tap_action,
  hold_action: config.hold_action,
  double_tap_action: config.double_tap_action,
});

/** Keys the form leaves empty are dropped, so they do not linger in the YAML. */
export const mergeBackground = (
  config: PictureBadgesConfig,
  data: BackgroundData,
): PictureBadgesConfig => {
  const next: PictureBadgesConfig = { ...config, ...data };
  for (const key of [
    "entity",
    "image",
    "camera_image",
    "camera_view",
    "aspect_ratio",
    "tap_action",
    "hold_action",
    "double_tap_action",
  ] as const) {
    if (next[key] === undefined || next[key] === "") delete next[key];
  }
  return next;
};
