import type { ElementConfig, PictureItem } from "../config";
import { type Anchor, DEFAULT_ANCHOR, DEFAULT_POSITION, type Position } from "../position";
import type { BadgeConfig, HassEntity } from "../types";

/**
 * Every operation moves a {type, position, anchor, config} item as a unit, which
 * is what makes reordering change stacking order without disturbing any
 * position. None of them mutates its input: Home Assistant freezes the config
 * we are handed.
 */

export type NewItem =
  | { type: "badge"; config: BadgeConfig }
  | { type: "element"; config: ElementConfig };

/** A new item lands centered and proportional, ready to be dragged. */
export const addItem = (items: PictureItem[], item: NewItem): PictureItem[] => [
  ...items,
  { ...item, position: { ...DEFAULT_POSITION }, anchor: DEFAULT_ANCHOR } as PictureItem,
];

export const replaceConfig = (
  items: PictureItem[],
  index: number,
  config: BadgeConfig | ElementConfig,
): PictureItem[] =>
  index < 0 || index >= items.length
    ? items
    : items.map((item, i) => (i === index ? ({ ...item, config } as PictureItem) : item));

/**
 * Set an item's anchor, and its coordinates with it when the caller could work
 * out where the item has to sit to stay put. The two travel together in one
 * write: an anchor without its matching coordinates is a badge that jumped, and
 * a config the user never asked for.
 */
export const setAnchor = (
  items: PictureItem[],
  index: number,
  anchor: Anchor,
  position?: Position,
): PictureItem[] =>
  index < 0 || index >= items.length
    ? items
    : items.map((item, i) =>
        i === index ? { ...item, anchor, position: position ?? item.position } : item,
      );

export const moveItem = (items: PictureItem[], from: number, to: number): PictureItem[] => {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const out = [...items];
  const [moved] = out.splice(from, 1);
  if (moved) out.splice(to, 0, moved);
  return out;
};

export const removeItem = (items: PictureItem[], index: number): PictureItem[] =>
  items.filter((_, i) => i !== index);

/** What a list row shows for a placed badge. */
export interface RowLabel {
  primary: string;
  secondary?: string;
}

/**
 * An entity id is what the config carries, but not what anyone recognises: the
 * row shows the entity's own name and keeps the id underneath, the way Home
 * Assistant's own element list does.
 *
 * A `name` written into the badge wins over the entity's, being an explicit
 * choice by whoever configured it. An entity missing from `states` — deleted, or
 * not loaded yet — falls back to its id, which still says more than a blank row.
 *
 * Only `name`, `entity` and `type` are read: labelling is the one exception to
 * treating a badge config as opaque.
 */
export const rowLabel = (item: PictureItem, states?: Record<string, HassEntity>): RowLabel => {
  const friendly = item.config.entity
    ? states?.[item.config.entity as string]?.attributes?.friendly_name
    : undefined;

  if (item.type === "element") {
    // `name` is deliberately not read: in composed mode it holds sentinels like
    // ___device_name___, which belong in a tooltip, not in a list row.
    const primary = friendly ?? item.config.entity ?? item.config.type;
    return item.config.entity && item.config.entity !== primary
      ? { primary, secondary: item.config.entity }
      : { primary };
  }

  const config = item.config as { entity?: string; type?: string; name?: string };
  const primary = config.name ?? friendly ?? config.entity ?? config.type ?? "badge";
  if (config.entity && config.entity !== primary) return { primary, secondary: config.entity };
  if (config.type && config.type !== primary) return { primary, secondary: config.type };
  return { primary };
};
