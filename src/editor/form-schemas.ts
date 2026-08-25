import type { ImageSource } from "../config";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";
import type { FormSchema } from "./form-section";
import { sectionMerge } from "./form-section";

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
 * ha-selector-media reads `value.media_content_id` and nothing else: handed the
 * plain path a YAML user wrote, it shows an empty picker. Wrapping is what
 * picture-elements does in its own `_processData`; the card unwraps at render.
 */
const asMediaValue = (value: ImageSource | undefined): ImageSource | undefined =>
  typeof value === "string" ? { media_content_id: value } : value;

const domainOf = (entityId: string | undefined): string => entityId?.split(".")[0] ?? "";

/** The synthetic field. It exists in form data only and is never stored. */
export const PICTURE_ENTITY = "picture_entity";

/**
 * The slice of a config the background section reads — the card's, and now an
 * image element's. Structural rather than a union of the two: the section does
 * not care what else the record carries, and a union would have to grow every
 * time a third consumer appears.
 */
export interface BackgroundKeys {
  image?: ImageSource;
  dark_mode_image?: ImageSource;
  image_entity?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  aspect_ratio?: string;
}

const cameraViewField = (localize: LocalizeFunc) => ({
  name: "camera_view",
  selector: {
    select: {
      options: ["auto", "live"].map((value) => ({
        value,
        label: localize(`ui.panel.lovelace.editor.card.generic.camera_view_options.${value}`),
      })),
      mode: "dropdown",
    },
  },
});

/**
 * The ha-form schema for the background (image / entity / camera) section.
 *
 * `config` is used only to derive whether `camera_view` is shown — the values
 * are never read for the form; `backgroundData` builds those separately.
 *
 * `options.aspectRatio` guards a correctness trap: pass `{ aspectRatio: false }`
 * for an image *element*, where `hui-image` is size-managed by the card. Given
 * an `aspect_ratio`, `hui-image` builds its `.ratio` container (`height: 0` plus
 * a padding-trick box) that defeats the explicit height the card imposes on the
 * wrapper. The card's own background passes the option as `true` (the default).
 */
export const backgroundSchema = (
  localize: LocalizeFunc,
  config: BackgroundKeys,
  options: { aspectRatio?: boolean } = {},
): FormSchema => {
  const chosen = config.camera_image ?? config.image_entity;
  const isCamera = domainOf(chosen) === "camera";
  return [
    { name: "image", selector: imageSelector(localize) },
    { name: "dark_mode_image", selector: imageSelector(localize) },
    { name: PICTURE_ENTITY, selector: { entity: { domain: ["image", "camera"] } } },
    ...(isCamera ? [cameraViewField(localize)] : []),
    // The card's own background takes it; an image element must not. Given an
    // aspect_ratio, hui-image builds its `.ratio` container — height: 0 plus a
    // padding box — which defeats the height the card imposes on the wrapper.
    // Refused here rather than filtered by the caller, so the field cannot be
    // rendered by one path and dropped by another.
    ...(options.aspectRatio === false ? [] : [{ name: "aspect_ratio", selector: { text: {} } }]),
  ];
};

export const headingSchema = (_localize: LocalizeFunc): FormSchema => [
  { name: "title", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
];

/**
 * Both filters are strings, and both get an `object` selector on purpose: it
 * renders `ha-yaml-editor`, a code editor with colouring and copy-paste, and a
 * CSS filter chain is code. Home Assistant already does this for
 * `dark_mode_filter`; we extend it to `filter` rather than undo it.
 */
export const filtersSchema = (_localize: LocalizeFunc): FormSchema => [
  { name: "filter", selector: { object: {} } },
  { name: "dark_mode_filter", selector: { object: {} } },
];

/** Everything that depends on `entity`, under the field it depends on. */
export const entitySchema = (_localize: LocalizeFunc): FormSchema => [
  { name: "entity", selector: { entity: {} } },
  { name: "state_image", selector: { object: {} } },
  { name: "state_filter", selector: { object: {} } },
];

/** The camera first: it is what renders when both keys are set. */
export const backgroundData = <T extends BackgroundKeys>(config: T): Record<string, unknown> => {
  const chosen = config.camera_image ?? config.image_entity;
  return {
    ...(config.image !== undefined ? { image: asMediaValue(config.image) } : {}),
    ...(config.dark_mode_image !== undefined
      ? { dark_mode_image: asMediaValue(config.dark_mode_image) }
      : {}),
    ...(chosen !== undefined ? { [PICTURE_ENTITY]: chosen } : {}),
    ...(config.camera_view !== undefined ? { camera_view: config.camera_view } : {}),
    ...(config.aspect_ratio !== undefined ? { aspect_ratio: config.aspect_ratio } : {}),
  };
};

/**
 * The selector is authoritative: what it shows is what renders. Writing an
 * entity clears the sibling key — and `camera_view` too when leaving a camera —
 * and clearing the field clears all three. That is what makes the deliberate
 * absence of a conflict alert safe: a forgotten key cannot resurface through the
 * interface.
 */
export const mergeBackground = <T extends BackgroundKeys>(
  config: T,
  data: Record<string, unknown>,
  options: { aspectRatio?: boolean } = {},
): T => {
  const schema = backgroundSchema(() => "", config, options);

  // The picker's key belongs to the form, not to the config: it is the one field
  // whose value has to be split across two real keys. Reading it out of `data`
  // before the merge is what keeps `next` a genuine config record — so
  // every assignment below is checked, where the whole block used to run on an
  // untyped record between two casts.
  const { [PICTURE_ENTITY]: picked, ...fields } = data;
  const chosen = typeof picked === "string" && picked ? picked : undefined;

  const next = sectionMerge(schema, config as Record<string, unknown>, fields) as Record<
    string,
    unknown
  >;

  if (!chosen) {
    delete next.camera_image;
    delete next.image_entity;
    delete next.camera_view;
  } else if (domainOf(chosen) === "camera") {
    next.camera_image = chosen;
    delete next.image_entity;
  } else {
    next.image_entity = chosen;
    delete next.camera_image;
    delete next.camera_view;
  }
  return next as T;
};

/**
 * Nothing localises the ratio's decimal separator: the field is plain text, the
 * string reaches the config verbatim, and `parseAspectRatio` reads it with
 * `parseFloat`, which stops at a comma rather than rejecting it — so `1,78`
 * becomes `1` and renders a square. The hint carries the separator; normalising
 * the value would be the first place we rewrite what a user typed.
 */
export const formHelper = (hass: HomeAssistant, name: string): string | undefined =>
  name === "aspect_ratio" ? localizeOwn(hass, "aspect_ratio_hint") : undefined;
