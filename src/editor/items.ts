import type { ElementConfig, PictureItem } from "../config";
import { type Anchor, DEFAULT_ANCHOR, DEFAULT_POSITION, type Position } from "../position";
import type { BadgeConfig, HomeAssistant, VisibilityCondition } from "../types";

/**
 * Every operation moves a {type, position, anchor, config} item as a unit, which
 * is what makes reordering change stacking order without disturbing any
 * position. None of them mutates its input: Home Assistant freezes the config
 * we are handed.
 */

export type NewItem =
  | { type: "badge"; config: BadgeConfig }
  | { type: "element"; config: ElementConfig };

/** A new item lands centered with the automatic anchor, ready to be dragged. */
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

/**
 * Set or clear an item's conditions. An empty list is cleared rather than
 * stored: Home Assistant's own visibility editor deletes the key when its list
 * falls back to zero, and a `visibility: []` in YAML says nothing while looking
 * like it says something.
 */
export const setVisibility = (
  items: PictureItem[],
  index: number,
  visibility: VisibilityCondition[] | undefined,
): PictureItem[] => {
  if (index < 0 || index >= items.length) return items;
  return items.map((item, i) => {
    if (i !== index) return item;
    const { visibility: _dropped, ...rest } = item;
    return (visibility?.length ? { ...rest, visibility } : rest) as PictureItem;
  });
};

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
 * What a list row shows for a placed item.
 *
 * Home Assistant's own entity lists — Entities, Distribution and History Graph,
 * all three drawn by `hui-entity-editor` — read as a name over a place: the
 * entity's name on the first line, then "Area ▸ Device" on the second. Both
 * strings are composed by `hass.formatEntityName` against the registry, so they
 * are asked for rather than assembled out of `friendly_name` and an entity id —
 * an id under a name is precisely what a built-in card never shows.
 *
 * Everything after the first branch is the degradation, and a blank row is
 * never one of the outcomes: an item with no entity, an entity absent from the
 * registry, or a Home Assistant too old to compose names all still say
 * something. The id says more than nothing.
 */
export const rowLabel = (item: PictureItem, hass?: HomeAssistant, badgeName?: string): RowLabel => {
  const entityId = typeof item.config.entity === "string" ? item.config.entity : undefined;
  const stateObj = entityId ? hass?.states?.[entityId] : undefined;

  // A `name` written into a badge outranks the registry: it is an explicit
  // choice by whoever configured that badge, and Home Assistant's own lists
  // only skip this because they have no such field to read. Never read for an
  // element, where `name` may hold composed sentinels.
  // A Shortcut badge has no `name`: what it displays is `text`, and that is the
  // only thing on it a user would recognise. Read for the row's label only —
  // a badge's payload is still never validated and never rewritten.
  const named =
    item.type === "badge"
      ? ((item.config as { name?: string; text?: string }).name ??
        (item.config.type === "shortcut"
          ? (item.config as { text?: string }).text || undefined
          : undefined))
      : undefined;

  if (entityId && stateObj && hass?.formatEntityName) {
    const format = hass.formatEntityName;
    const primary = named || format(stateObj, { type: "entity" }) || entityId;
    // Asked for part by part rather than as one list, so that a part which
    // merely repeats the first line can be dropped. An entity that is its
    // device's main one composes to the device's own name, and Home Assistant
    // resolves that with a registry heuristic we would have to copy; comparing
    // the two strings we already hold arrives at the same place — device on
    // top, place underneath — without copying anything.
    // The result is empty for an entity attached to neither, which is common
    // enough that it has to mean "no second line" rather than a blank one.
    const secondary = [format(stateObj, { type: "area" }), format(stateObj, { type: "device" })]
      .filter((part) => part && part !== primary)
      // A device and the area it sits in can carry the same name, and
      // "Bureau ▸ Bureau" says less than "Bureau".
      .filter((part, i, parts) => parts.indexOf(part) === i)
      .join(" ▸ ");
    return secondary ? { primary, secondary } : { primary };
  }

  if (item.type === "element") {
    // `name` is deliberately not read: in composed mode it holds sentinels like
    // ___device_name___, which belong in a tooltip, not in a list row.
    return { primary: entityId ?? item.config.type };
  }

  const config = item.config as { entity?: string; type?: string };
  const primary = named ?? entityId ?? badgeName ?? config.type ?? "badge";
  if (config.type && config.type !== primary) return { primary, secondary: config.type };
  return { primary };
};
