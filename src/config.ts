import { type IconSize, isDefaultIconSize, normalizeIconSize } from "./element-size";
import {
  type Anchor,
  DEFAULT_POSITION,
  type Position,
  parseAnchor,
  parsePercent,
  storedPosition,
} from "./position";
import type { ActionConfig, BadgeConfig } from "./types";

export const CARD_TAG = "picture-studio";
export const EDITOR_TAG = "picture-studio-editor";
export const LIST_TAG = "picture-studio-badge-list";
export const FORM_TAG = "picture-studio-badge-form";
export const PICKER_TAG = "picture-studio-anchor-picker";
export const ICON_TAG = "picture-studio-state-icon";
export const ELEMENT_FORM_TAG = "picture-studio-element-form";
export const CARD_TYPE = "custom:picture-studio";

/**
 * One placed item. The `type` discriminant is "badge" today; a second variant
 * (e.g. "element") can be added later without restructuring.
 */
interface ItemBase {
  position: Position;
  /**
   * What the coordinates are anchored to. Always set in memory; omitted from
   * the stored config at its default, so an existing YAML never gains a key it
   * did not have.
   */
  anchor: Anchor;
}

export interface BadgeItem extends ItemBase {
  type: "badge";
  /** A third party's payload: never read, validated, reordered or rewritten. */
  config: BadgeConfig;
}

export interface ElementItem extends ItemBase {
  type: "element";
  /** Ours: read, validated, defaulted. */
  config: ElementConfig;
}

export type PictureItem = BadgeItem | ElementItem;

export type ElementConfig = StateIconConfig;

export interface StateIconConfig {
  type: "state-icon";
  /** Optional: a freshly added icon has no entity until one is picked. */
  entity?: string;
  icon?: string;
  color?: string;
  name?: string;
  show_entity_picture?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  size: IconSize;
}

/**
 * An image path written by hand in YAML, or the object the `media` selector
 * produces once the user picks a media source in the editor.
 */
export type ImageSource =
  | string
  /** `metadata` is the thumbnail and title the picker stores to redraw itself. */
  | { media_content_id?: string; media_content_type?: string; metadata?: unknown };

/** Unwrap a media selector value down to the path hui-image understands. */
export const imagePath = (value: ImageSource | undefined): string | undefined =>
  typeof value === "object" ? value.media_content_id : value;

export interface PictureStudioConfig {
  type: string;
  /**
   * hui-image-element passthrough keys, snake_case as they appear in YAML.
   * The element handles the camelCase binding internally.
   */
  entity?: string;
  image_entity?: string;
  image?: ImageSource;
  camera_image?: string;
  camera_view?: "auto" | "live";
  state_image?: Record<string, string>;
  state_filter?: Record<string, string>;
  dark_mode_image?: ImageSource;
  dark_mode_filter?: string;
  aspect_ratio?: string;
  filter?: string;
  /** Rendered as the ha-card header, like picture-elements. Not forwarded. */
  title?: string;
  items: PictureItem[];
}

const STUB_IMAGE = "https://demo.home-assistant.io/stub_config/floorplan.png";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePosition = (raw: unknown): Position => {
  if (!isRecord(raw)) return { ...DEFAULT_POSITION };
  return {
    top: parsePercent(raw.top, DEFAULT_POSITION.top),
    left: parsePercent(raw.left, DEFAULT_POSITION.left),
  };
};

const normalizeElementConfig = (raw: Record<string, unknown>, index: number): ElementConfig => {
  if (raw.type !== "state-icon") {
    throw new Error(`picture-studio: items[${index}].config must have a \`type\` — "state-icon"`);
  }
  // Unknown keys are kept, for the same reason an unreadable item raises instead
  // of vanishing: storedConfig rewrites the whole config on every editor commit,
  // so anything dropped here would be dropped from the user's YAML on the first
  // drag.
  return { ...raw, type: "state-icon", size: normalizeIconSize(raw.size) } as StateIconConfig;
};

/**
 * Validate and fill in defaults. Returns a fresh object: the config handed to
 * setConfig is frozen by Home Assistant and must never be mutated.
 */
export const normalizeConfig = (raw: unknown): PictureStudioConfig => {
  if (!isRecord(raw)) {
    throw new Error("picture-studio: config must be an object");
  }

  const rawItems = raw.items ?? [];
  if (!Array.isArray(rawItems)) {
    throw new Error("picture-studio: `items` must be a list");
  }

  const items = rawItems.map((entry, index): PictureItem => {
    if (!isRecord(entry)) {
      throw new Error(`picture-studio: items[${index}] must be an object`);
    }

    const type = entry.type;
    if (type !== "badge" && type !== "element") {
      throw new Error(
        `picture-studio: items[${index}] must have a \`type\` — "badge" or "element"`,
      );
    }

    if (!isRecord(entry.config)) {
      throw new Error(`picture-studio: items[${index}] must have a \`config\` object`);
    }

    const position = normalizePosition(entry.position);
    const anchor = parseAnchor(entry.anchor);

    return type === "badge"
      ? { type, position, anchor, config: entry.config as BadgeConfig }
      : { type, position, anchor, config: normalizeElementConfig(entry.config, index) };
  });

  return { ...(raw as Record<string, unknown>), items } as PictureStudioConfig;
};

/**
 * The shape written back to Home Assistant. Positions leave as "30%" strings:
 * unquoted in YAML they stay strings, they say what the number means, and
 * `normalizeConfig` reads them back to the same numbers — so a round trip
 * through the editor changes nothing.
 */
export const storedConfig = (config: PictureStudioConfig): Record<string, unknown> => ({
  ...config,
  items: config.items.map((item) => {
    const stored: Record<string, unknown> = {
      ...item,
      position: storedPosition(item.position),
    };
    // The default is the absence of the key, so a config that never used an
    // anchor comes back exactly as it went in.
    if (item.anchor === "proportional") delete stored.anchor;
    if (item.type === "element" && isDefaultIconSize(item.config.size)) {
      // Only when all four fields are the defaults: an automatic size may carry
      // numbers the user typed, and dropping the key would lose them. A config
      // that never touched the size does not grow a `size:`.
      const { size: _size, ...rest } = item.config;
      stored.config = rest;
    }
    return stored;
  }),
});

/**
 * Keys forwarded verbatim from the card config to the hui-image-element config.
 * Excludes `type` (overridden to "image"), `items` (badge list, not an element key)
 * and `title`, which picture-elements renders as the ha-card header — forwarding it
 * would instead feed computeTooltip and surface as a hover tooltip on the image.
 */
export const BACKGROUND_KEYS = [
  "entity",
  "image_entity",
  "image",
  "camera_image",
  "camera_view",
  "state_image",
  "state_filter",
  "dark_mode_image",
  "dark_mode_filter",
  "aspect_ratio",
  "filter",
] as const satisfies ReadonlyArray<keyof PictureStudioConfig>;

export const stubConfig = (): PictureStudioConfig => ({
  type: CARD_TYPE,
  image: STUB_IMAGE,
  items: [],
});
