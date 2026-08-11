import type { PictureBadgeItem } from "../config";
import { DEFAULT_POSITION } from "../position";
import type { BadgeConfig } from "../types";

/**
 * Every operation moves a {badge, position} pair as a unit, which is what makes
 * reordering change stacking order without disturbing any position. None of
 * them mutates its input: Home Assistant freezes the config we are handed.
 */

/** A new badge lands centred, ready to be dragged. Its own position object. */
export const addItem = (items: PictureBadgeItem[], badge: BadgeConfig): PictureBadgeItem[] => [
  ...items,
  { badge, position: { ...DEFAULT_POSITION } },
];

export const replaceBadge = (
  items: PictureBadgeItem[],
  index: number,
  badge: BadgeConfig,
): PictureBadgeItem[] =>
  index < 0 || index >= items.length
    ? items
    : items.map((item, i) => (i === index ? { ...item, badge } : item));

export const moveItem = (
  items: PictureBadgeItem[],
  from: number,
  to: number,
): PictureBadgeItem[] => {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const out = [...items];
  const [moved] = out.splice(from, 1);
  if (moved) out.splice(to, 0, moved);
  return out;
};

export const removeItem = (items: PictureBadgeItem[], index: number): PictureBadgeItem[] =>
  items.filter((_, i) => i !== index);
