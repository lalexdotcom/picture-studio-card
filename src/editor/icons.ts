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
const ELEMENT_ICON = "mdi:shape-outline";

/**
 * The glyph that tells one kind of item from another, in the list and in the
 * add menu.
 *
 * One per entry, and deliberately the same one twice where two entries share a
 * family: what it has to carry is "which sort of thing is this", not "which
 * exact type". The add menu keeps its "Badges: …" / "Elements: …" prefixes, and
 * those are what teach the pairing — the icon alone would have to be learned
 * from nothing.
 *
 * `type` is unused today and stays in the signature on purpose: the day one
 * badge kind deserves its own glyph, this function is the only thing to open.
 */
export const itemIcon = (family: "badge" | "element", _type: string): string =>
  family === "badge" ? BADGE_ICON : ELEMENT_ICON;
