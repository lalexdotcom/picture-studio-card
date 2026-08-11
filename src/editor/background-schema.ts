import type { ImageSource, PictureBadgesConfig } from "../config";
import type { LocalizeFunc } from "../types";

/** The media selector picture-elements uses for both of its image fields. */
const imageSelector = (localize: LocalizeFunc) => ({
  media: {
    accept: ["image/*"],
    clearable: true,
    image_upload: true,
    hide_content_type: true,
    content_id_helper: localize("ui.panel.lovelace.editor.card.picture.content_id_helper"),
  },
});

/**
 * Mirrors hui-picture-elements-card-editor's schema, minus `theme`: applyThemesOnElement
 * is internal, so a theme field would save cleanly and change nothing.
 * Field names are kept identical to theirs so HA's own translation keys resolve.
 * `entity`, `image_entity`, `state_image`, `aspect_ratio` and `filter` stay YAML-only,
 * as they do in picture-elements.
 */
export const backgroundSchema = (localize: LocalizeFunc) =>
  [
    {
      name: "",
      type: "expandable",
      title: localize("ui.panel.lovelace.editor.card.picture-elements.card_options"),
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "image", selector: imageSelector(localize) },
        { name: "dark_mode_image", selector: imageSelector(localize) },
        { name: "camera_image", selector: { entity: { domain: "camera" } } },
        {
          name: "camera_view",
          selector: {
            select: {
              options: ["auto", "live"].map((value) => ({
                value,
                label: localize(
                  `ui.panel.lovelace.editor.card.generic.camera_view_options.${value}`,
                ),
              })),
              mode: "dropdown",
            },
          },
        },
        { name: "state_filter", selector: { object: {} } },
        { name: "dark_mode_filter", selector: { object: {} } },
      ],
    },
  ] as const;

/** HA keys the labels on the field name; these three live in another namespace. */
const OWN_NAMESPACE = new Set(["dark_mode_image", "state_filter", "dark_mode_filter"]);

export const backgroundLabel = (localize: LocalizeFunc, name: string): string => {
  const namespace = OWN_NAMESPACE.has(name)
    ? "ui.panel.lovelace.editor.card.picture-elements"
    : "ui.panel.lovelace.editor.card.generic";
  // HA's own fallback: an unresolved key degrades to the raw field name, never to blank.
  return localize(`${namespace}.${name}`) || name;
};

export type BackgroundData = Pick<
  PictureBadgesConfig,
  | "title"
  | "image"
  | "dark_mode_image"
  | "camera_image"
  | "camera_view"
  | "state_filter"
  | "dark_mode_filter"
>;

const FORM_KEYS = [
  "title",
  "image",
  "dark_mode_image",
  "camera_image",
  "camera_view",
  "state_filter",
  "dark_mode_filter",
] as const satisfies ReadonlyArray<keyof BackgroundData>;

/**
 * ha-selector-media reads `value.media_content_id` and nothing else: handed the plain
 * path a YAML user wrote, it shows an empty picker and opens the browse dialog with no
 * `defaultId`, leaving "manual entry" blank. Wrapping the string is what picture-elements
 * does in its own `_processData`. The card unwraps again at render, via `imagePath`.
 */
const asMediaValue = (value: ImageSource | undefined): ImageSource | undefined =>
  typeof value === "string" ? { media_content_id: value } : value;

export const backgroundData = (config: PictureBadgesConfig): BackgroundData => ({
  title: config.title,
  image: asMediaValue(config.image),
  dark_mode_image: asMediaValue(config.dark_mode_image),
  camera_image: config.camera_image,
  camera_view: config.camera_view,
  state_filter: config.state_filter,
  dark_mode_filter: config.dark_mode_filter,
});

/** Keys the form leaves empty are dropped, so they do not linger in the YAML. */
export const mergeBackground = (
  config: PictureBadgesConfig,
  data: BackgroundData,
): PictureBadgesConfig => {
  const next: PictureBadgesConfig = { ...config, ...data };
  for (const key of FORM_KEYS) {
    if (next[key] === undefined || next[key] === "") delete next[key];
  }
  return next;
};
