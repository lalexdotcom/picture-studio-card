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
