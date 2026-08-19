import {
  type IconChrome,
  isDefaultIconChrome,
  isDefaultLabelChrome,
  type LabelChrome,
  normalizeIconChrome,
  normalizeLabelChrome,
} from "./chrome";
import {
  DEFAULT_ICON_SIZE,
  DEFAULT_LABEL_SIZE,
  type ElementSize,
  isDefaultElementSize,
  normalizeElementSize,
} from "./element-size";
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
export const LABEL_TAG = "picture-studio-state-label";
export const ELEMENT_FORM_TAG = "picture-studio-element-form";
export const PROBE_TAG = "picture-studio-visibility-probe";
export const VISIBILITY_SECTION_TAG = "picture-studio-visibility-section";
export const PROBE_TYPE = `custom:${PROBE_TAG}` as const;
export const CARD_TYPE = "custom:picture-studio";

/**
 * The envelope both item families share: where the item sits (position and
 * anchor). The family is named by `type`; the payload lives in `config`.
 */
interface ItemBase {
  position: Position;
  /**
   * What the coordinates are anchored to. Always set in memory; omitted from
   * the stored config at its default, so an existing YAML never gains a key it
   * did not have.
   */
  anchor: Anchor;
  /**
   * Home Assistant's condition list, and theirs alone: never read, validated or
   * rewritten here. Typed `unknown` because it genuinely is — only its
   * array-ness was ever checked, and a malformed value is now kept rather than
   * refused. `hasVisibility` is the single gate every reader passes through.
   */
  visibility?: unknown;
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

/** Why an item could not be read. Decided once, at normalization. */
export type UnknownReason = "item-type" | "config-missing" | "element-type";

/**
 * An item we cannot read. It is ignored everywhere — the card draws nothing, the
 * editor offers no form — but `raw` is written back to the YAML untouched, so
 * ignoring costs nothing. That is the whole safety argument: `storedConfig`
 * rewrites the entire config on every editor commit, so anything dropped here
 * would vanish from the user's YAML on the first drag.
 *
 * It deliberately does not extend `ItemBase` and carries no `config`: the
 * compiler is then what finds every consumer that has to learn about it.
 */
export interface UnknownItem {
  type: "unknown";
  /** The original entry, never normalized — not its position, not its anchor. */
  raw: unknown;
  reason: UnknownReason;
  /** The rawest identifying token we hold; the row's first line. */
  token?: string;
}

export type PictureItem = BadgeItem | ElementItem | UnknownItem;

export type ElementConfig = StateIconConfig | StateLabelConfig;

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
  size: ElementSize;
  /** Optional: absent means no chrome, which is also what DEFAULT_CHROME says. */
  chrome?: IconChrome;
  /** Optional: absent means no halo. Opt-in since 1.4.0. */
  halo?: boolean;
}

/** What a label draws. One idea, not two switches — see the 1.4.0 spec. */
export type LabelPart = "state" | "name";

/** A label that says nothing shows its state: that is what a label is for. */
export const DEFAULT_LABEL_SHOW: LabelPart[] = ["state"];

const LABEL_PARTS: readonly string[] = ["state", "name"];

/**
 * An absent list is the default; a present one is taken as written, including
 * empty. Unknown entries are dropped, like every other key inside one of our own
 * closed records, and a repeat is dropped with them — the list is a set with an
 * order, not a bag.
 */
export const normalizeLabelShow = (raw: unknown): LabelPart[] => {
  if (!Array.isArray(raw)) return [...DEFAULT_LABEL_SHOW];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry === "string" && LABEL_PARTS.includes(entry)) seen.add(entry);
  }
  return [...seen] as LabelPart[];
};

/**
 * An entity's text on the picture. The mirror image of the state-icon: it keeps
 * the half of Home Assistant's entity-badge form the icon left behind — the
 * name, the displayed parts and the composed state content — and renders it
 * through HA's own `state-display`.
 */
export interface StateLabelConfig {
  type: "state-label";
  /** Optional: a freshly added label has no entity until one is picked. */
  entity?: string;
  /** May hold the composed sentinels the entity_name selector stores. */
  name?: string;
  /** "none" or a theme colour. Never "state" — see the spec, decision 6. */
  color?: string;
  show: LabelPart[];
  /** What `state-display` composes; a list joins its parts. */
  state_content?: string | string[];
  time_format?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  /** Drives font-size rather than a box. */
  size: ElementSize;
  /** Optional: absent means no halo. */
  halo?: boolean;
  /** Optional: absent means no chrome, which is also what DEFAULT_LABEL_CHROME says. */
  chrome?: LabelChrome;
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

export const normalizeElementConfig = (
  raw: Record<string, unknown>,
  index: number,
): ElementConfig => {
  // Unknown keys are kept, for the same reason an unreadable item raises instead
  // of vanishing: storedConfig rewrites the whole config on every editor commit,
  // so anything dropped here would be dropped from the user's YAML on the first
  // drag.
  if (raw.type === "state-icon") {
    return {
      ...raw,
      type: "state-icon",
      size: normalizeElementSize(raw.size, DEFAULT_ICON_SIZE),
      chrome: normalizeIconChrome(raw.chrome),
      halo: raw.halo === true,
    } as StateIconConfig;
  }
  if (raw.type === "state-label") {
    return {
      ...raw,
      type: "state-label",
      size: normalizeElementSize(raw.size, DEFAULT_LABEL_SIZE),
      chrome: normalizeLabelChrome(raw.chrome),
      halo: raw.halo === true,
      show: normalizeLabelShow(raw.show),
    } as StateLabelConfig;
  }
  // Unreachable: normalizeConfig checks the kind before calling, because only it
  // can turn an unknown one into an UnknownItem. Kept as a type-level floor.
  throw new Error(`picture-studio: items[${index}].config has an unreadable type`);
};

/**
 * Validate and fill in defaults. Returns a fresh object: the config handed to
 * setConfig is frozen by Home Assistant and must never be mutated.
 */
/** True when the item carries at least one condition. */
export const hasVisibility = (item: PictureItem): boolean =>
  item.type !== "unknown" && Array.isArray(item.visibility) && item.visibility.length > 0;

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
      // The one case still fatal: no family, no position, not even a key to name
      // in a row. Home Assistant's error card, which prints the offending config,
      // says more than a row that could only read "?".
      throw new Error(`picture-studio: items[${index}] must be an object`);
    }

    const unknown = (reason: UnknownReason, token?: string): UnknownItem => ({
      type: "unknown",
      raw: entry,
      reason,
      ...(token ? { token } : {}),
    });

    const type = entry.type;
    if (type !== "badge" && type !== "element") {
      return unknown("item-type", typeof type === "string" ? type : undefined);
    }
    if (!isRecord(entry.config)) return unknown("config-missing", type);
    if (type === "element") {
      const kind = entry.config.type;
      if (kind !== "state-icon" && kind !== "state-label") {
        return unknown("element-type", typeof kind === "string" ? kind : undefined);
      }
    }

    const position = normalizePosition(entry.position);
    // Since 1.4.0 the anchor lives inside `position`: it says which point of the
    // item the coordinates refer to, so it belongs with them. Read from beside
    // `position` too — that is where 1.2.0 through 1.3.x wrote it, and a config
    // is never rewritten in the old place. The new place wins when a config
    // somehow carries both, so there is one answer rather than a merge.
    const anchor = parseAnchor(
      (isRecord(entry.position) ? entry.position.anchor : undefined) ?? entry.anchor,
    );
    // Kept exactly as written, whatever it is. Only its array-ness ever mattered,
    // and `hasVisibility` is what asks.
    const visibility = entry.visibility;
    const base = { position, anchor, ...(visibility !== undefined ? { visibility } : {}) };

    return type === "badge"
      ? { ...base, type, config: entry.config as BadgeConfig }
      : { ...base, type, config: normalizeElementConfig(entry.config, index) };
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
    // Verbatim, and nothing else: no spread, no key deletion, no position
    // rewrite. This is the whole safety argument of the design.
    if (item.type === "unknown") return item.raw as Record<string, unknown>;
    const stored: Record<string, unknown> = {
      ...item,
      // The anchor qualifies the coordinates, so it is written with them. The
      // default is the absence of the key, so a config that never used an anchor
      // comes back exactly as it went in.
      position: {
        ...storedPosition(item.position),
        ...(item.anchor === "auto" ? {} : { anchor: item.anchor }),
      },
    };
    // Always: `...item` copies the in-memory field, and item level is the one
    // place the anchor must never be written back to.
    delete stored.anchor;
    // Delete when absent (no intent) or empty list (explicit "show always", but
    // indistinguishable from no intent). Keep when it has conditions — or when
    // it is malformed, because dropping an unreadable value on commit would be
    // destructive: the next save would silently erase the user's intent.
    if (
      item.visibility === undefined ||
      (Array.isArray(item.visibility) && item.visibility.length === 0)
    ) {
      delete stored.visibility;
    }
    if (item.type === "element") {
      // Only when every field is a default: a mode may be off and still carry
      // numbers the user typed, and dropping the key would lose them. A config
      // that never touched either key does not grow one.
      const { size, chrome, halo, show, ...rest } = item.config as ElementConfig & {
        show?: LabelPart[];
      };
      const config: Record<string, unknown> = { ...rest };
      const isLabel = item.config.type === "state-label";
      const sizeDefaults = isLabel ? DEFAULT_LABEL_SIZE : DEFAULT_ICON_SIZE;
      if (!isDefaultElementSize(size, sizeDefaults)) config.size = size;
      // The guard is what narrows the optional type, not a redundancy — two
      // reviewers have flagged it, and it is correct.
      if (chrome) {
        const isDefault = isLabel
          ? isDefaultLabelChrome(chrome as LabelChrome)
          : isDefaultIconChrome(chrome as IconChrome);
        if (!isDefault) config.chrome = chrome;
      }
      if (halo) config.halo = true;
      // The default is the absence of the key. An empty list is not the default:
      // it is a deliberate "show nothing", and it has to survive the round trip.
      if (!(isLabel && show?.length === 1 && show[0] === "state")) {
        if (show) config.show = show;
      }
      stored.config = config;
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
