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
 * Badges all share one glyph — what counts there is "this is a badge", not
 * which badge. For elements, each kind carries its own icon so a reader can
 * tell a state icon from a state label at a glance. `ELEMENT_ICONS` maps the
 * known kinds; `ELEMENT_ICON` is the fallback for any kind we do not yet name.
 */
export const itemIcon = (family: "badge" | "element", type: string): string =>
  family === "badge" ? BADGE_ICON : (ELEMENT_ICONS[type] ?? ELEMENT_ICON);
