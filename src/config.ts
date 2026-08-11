import { DEFAULT_POSITION, type Position } from "./position";
import type { BadgeConfig } from "./types";

export const CARD_TAG = "picture-badges";
export const EDITOR_TAG = "picture-badges-editor";
export const LIST_TAG = "picture-badges-list";
export const CARD_TYPE = "custom:picture-badges";

/** One placed badge: opaque content plus the position we own. */
export interface PictureBadgeItem {
  badge: BadgeConfig;
  position: Position;
}

export interface PictureBadgesConfig {
  type: string;
  /** hui-image passthrough, snake_case as it appears in YAML. */
  image?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  state_image?: Record<string, string>;
  dark_mode_image?: string;
  aspect_ratio?: string;
  filter?: string;
  fit_mode?: "cover" | "contain" | "fill";
  badges: PictureBadgeItem[];
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
  const rawBadges = raw.badges ?? [];
  if (!Array.isArray(rawBadges)) {
    throw new Error("picture-badges: `badges` must be a list");
  }

  const badges = rawBadges.map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.badge)) {
      throw new Error(`picture-badges: badges[${index}] must have a \`badge\` object`);
    }
    return {
      badge: entry.badge as BadgeConfig,
      position: normalisePosition(entry.position),
    };
  });

  return { ...(raw as Omit<PictureBadgesConfig, "badges">), badges };
};

export const stubConfig = (): PictureBadgesConfig => ({
  type: CARD_TYPE,
  image: STUB_IMAGE,
  badges: [],
});
