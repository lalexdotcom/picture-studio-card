import type { ElementConfig, PictureItem, UnknownReason } from "../config";
import { type Anchor, DEFAULT_ANCHOR, DEFAULT_POSITION, type Position } from "../position";
import { localizeOwn, type StringKey } from "../strings";
import type { BadgeConfig, HomeAssistant, VisibilityCondition } from "../types";
import { badgeIsBroken } from "./badge-existence";

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
    : items.map((item, i) => {
        if (i !== index) return item;
        // An unknown item has no `config` to replace — it kept the raw YAML and a
        // reason instead. Spreading one would produce `{ type: "unknown", raw,
        // reason, config }`, which matches no variant of PictureItem: the cast
        // below would wave it through, and every later read of that item would be
        // reading a shape the type system says cannot exist. Callers only pass a
        // known index today, so this is safe by convention; the guard makes it
        // safe by construction, as `setAnchor` and `setVisibility` already are.
        if (item.type === "unknown") return item;
        return { ...item, config } as PictureItem;
      });

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
    : items.map((item, i) => {
        if (i !== index) return item;
        // An unknown item has no anchor or position; leave it unchanged.
        if (item.type === "unknown") return item;
        return { ...item, anchor, position: position ?? item.position };
      });

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
    // An unknown item has no visibility property; leave it unchanged.
    if (item.type === "unknown") return item;
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
const UNKNOWN_REASON_KEYS: Record<UnknownReason, StringKey> = {
  "item-type": "unknown_item_type",
  "config-missing": "unknown_config_missing",
  "element-type": "unknown_element_type",
};

export const rowLabel = (item: PictureItem, hass?: HomeAssistant, badgeName?: string): RowLabel => {
  // First, because everything below reads `item.config`. The token is the raw
  // string a user will search their YAML for; the reason is why it is here.
  if (item.type === "unknown") {
    return {
      primary: item.token ?? localizeOwn(hass, "unknown_item"),
      secondary: localizeOwn(hass, UNKNOWN_REASON_KEYS[item.reason]),
    };
  }

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

/**
 * A label with an empty `show` draws nothing on the dashboard — say so here.
 *
 * Asked of the element config rather than of a list item, because the two
 * callers hold different things: the item list walks `PictureItem`s, the element
 * form has only the config it is editing. One rule, phrased where both can reach
 * it — the row marker and the form's warning must never disagree about what
 * "displays nothing" means.
 */
export const elementShowsNothing = (config: ElementConfig): boolean =>
  config.type === "state-label" &&
  Array.isArray((config as { show?: unknown[] }).show) &&
  (config as { show: unknown[] }).show.length === 0;

/** The same question, asked of a list item. */
export const showsNothing = (item: PictureItem): boolean =>
  item.type === "element" && elementShowsNothing(item.config);

/** An item whose `visibility` key is present but not a list — renders, but
    always shows, because the card cannot parse the conditions. Orange, not
    red: unlike an unreadable item it is still drawn and editable. Aligns
    with `hasVisibility` in config.ts, which is the "usable" gate: if
    `hasVisibility` is false but visibility is defined, this is true. */
export const hasUnreadableVisibility = (item: PictureItem): boolean =>
  item.type !== "unknown" && item.visibility !== undefined && !Array.isArray(item.visibility);

/**
 * The worst state among the items, for the section header's glyph — error beats
 * warning, and neither draws anything.
 *
 * Deliberately built from the very predicates the rows use. Two places deciding
 * "is this item broken" would drift, and the row is the one that has to stay
 * right.
 */
export const itemsSeverity = (items: readonly PictureItem[]): "error" | "warning" | undefined => {
  let warning = false;
  for (const item of items) {
    if (item.type === "unknown") return "error";
    if (item.type === "badge") {
      const type = String((item.config as Record<string, unknown>).type ?? "");
      if (type && badgeIsBroken(type)) return "error";
    }
    if (hasUnreadableVisibility(item) || showsNothing(item)) warning = true;
  }
  return warning ? "warning" : undefined;
};
