import { DEFAULT_POSITION, type Position } from "./position";
import type { BadgeConfig } from "./types";

export const CARD_TAG = "picture-badges";
export const EDITOR_TAG = "picture-badges-editor";
export const LIST_TAG = "picture-badges-list";
export const FORM_TAG = "picture-badge-form";
export const CARD_TYPE = "custom:picture-badges";

/**
 * One placed item. The `type` discriminant is "badge" today; a second variant
 * (e.g. "element") can be added later without restructuring.
 */
export interface PictureItem {
  type: "badge";
  position: Position;
  config: BadgeConfig;
}

export interface PictureBadgesConfig {
  type: string;
  /**
   * hui-image-element passthrough keys, snake_case as they appear in YAML.
   * The element handles the camelCase binding internally.
   */
  entity?: string;
  image_entity?: string;
  image?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  state_image?: Record<string, string>;
  state_filter?: Record<string, string>;
  dark_mode_image?: string;
  dark_mode_filter?: string;
  aspect_ratio?: string;
  filter?: string;
  title?: string;
  /** Typed as unknown: we never read these, only forward them to the element. */
  tap_action?: unknown;
  hold_action?: unknown;
  double_tap_action?: unknown;
  items: PictureItem[];
}

const STUB_IMAGE = "https://demo.home-assistant.io/stub_config/floorplan.png";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalisePosition = (raw: unknown): Position => {
  if (!isRecord(raw)) return { ...DEFAULT_POSITION };
  const top = typeof raw.top === "number" ? raw.top : DEFAULT_POSITION.top;
  const left = typeof raw.left === "number" ? raw.left : DEFAULT_POSITION.left;
  return { top, left };
};

/**
 * Validate and fill in defaults. Returns a fresh object: the config handed to
 * setConfig is frozen by Home Assistant and must never be mutated.
 */
export const normaliseConfig = (raw: unknown): PictureBadgesConfig => {
  if (!isRecord(raw)) {
    throw new Error("picture-badges: config must be an object");
  }

  const rawItems = raw.items ?? [];
  if (!Array.isArray(rawItems)) {
    throw new Error("picture-badges: `items` must be a list");
  }

  const items = rawItems.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`picture-badges: items[${index}] must be an object`);
    }

    // Default a missing `type` to "badge"; any other value is an error.
    const type = entry.type ?? "badge";
    if (type !== "badge") {
      throw new Error(`picture-badges: items[${index}] has unsupported type "${String(type)}"`);
    }

    if (!isRecord(entry.config)) {
      throw new Error(`picture-badges: items[${index}] must have a \`config\` object`);
    }

    return {
      type: "badge" as const,
      config: entry.config as BadgeConfig,
      position: normalisePosition(entry.position),
    };
  });

  return { ...(raw as Record<string, unknown>), items } as PictureBadgesConfig;
};

/**
 * Keys forwarded verbatim from the card config to the hui-image-element config.
 * Excludes `type` (overridden to "image") and `items` (badge list, not an element key).
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
  "title",
  "tap_action",
  "hold_action",
  "double_tap_action",
] as const satisfies ReadonlyArray<keyof PictureBadgesConfig>;

export const stubConfig = (): PictureBadgesConfig => ({
  type: CARD_TYPE,
  image: STUB_IMAGE,
  items: [],
});
