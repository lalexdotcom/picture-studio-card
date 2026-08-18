import { CUSTOM_PREFIX } from "./badge-catalog";

/**
 * Icon names shared by more than one editor component.
 *
 * Icons are named, not inlined: Home Assistant serves the whole Material Design
 * set and `ha-icon` resolves a name from it, with its own lazy loading and
 * cache. What lives here is only the handful of names that two components must
 * agree on — a name used in one place belongs at its call site.
 */

/**
 * The placement section of both item families: "Position" on a badge, "Size and
 * position" on an element. The two sections carry the same icon because they are
 * the same idea, and they carry the same constant so that stays true without
 * anyone remembering to keep two strings equal.
 */
export const PLACEMENT_ICON = "mdi:crop-free";

const BADGE_ICON = "mdi:label";
/** A third-party badge, whatever it turns out to be: outlined, so it reads as
    "not one of Home Assistant's own" at a glance. Every custom type shares it,
    because we have no way to know what any of them draws. */
const CUSTOM_BADGE_ICON = "mdi:label-outline";
const BADGE_ICONS: Record<string, string> = {
  shortcut: "mdi:label-variant",
};
/** Falls back to the family's own glyph for a kind we do not know by name. */
const ELEMENT_ICON = "mdi:shape-outline";
const ELEMENT_ICONS: Record<string, string> = {
  "state-icon": "mdi:brightness-7",
  "state-label": "mdi:card-text-outline",
};

/**
 * The glyph that tells one kind of item from another, in the list and in the
 * add menu.
 *
 * For badges, `BADGE_ICONS` maps known core kinds to their own glyph. A
 * `custom:` type that is not in that map gets `CUSTOM_BADGE_ICON` (outlined),
 * which reads as "not one of Home Assistant's own" at a glance. Any other core
 * badge falls back to `BADGE_ICON`. For elements, `ELEMENT_ICONS` maps the known
 * kinds; `ELEMENT_ICON` is the fallback.
 */
export const itemIcon = (family: "badge" | "element", type: string): string =>
  family === "badge"
    ? (BADGE_ICONS[type] ?? (type.startsWith(CUSTOM_PREFIX) ? CUSTOM_BADGE_ICON : BADGE_ICON))
    : (ELEMENT_ICONS[type] ?? ELEMENT_ICON);
