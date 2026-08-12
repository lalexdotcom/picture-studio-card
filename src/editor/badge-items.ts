import type { PictureItem } from "../config";
import { DEFAULT_POSITION } from "../position";
import type { BadgeConfig } from "../types";

/**
 * Every operation moves a {type, config, position} triple as a unit, which is
 * what makes reordering change stacking order without disturbing any position.
 * None of them mutates its input: Home Assistant freezes the config we are handed.
 */

/** A new badge lands centered, ready to be dragged. Its own position object. */
export const addItem = (items: PictureItem[], badge: BadgeConfig): PictureItem[] => [
  ...items,
  { type: "badge", config: badge, position: { ...DEFAULT_POSITION } },
];

export const replaceBadge = (
  items: PictureItem[],
  index: number,
  badge: BadgeConfig,
): PictureItem[] =>
  index < 0 || index >= items.length
    ? items
    : items.map((item, i) => (i === index ? { ...item, config: badge } : item));

export const moveItem = (items: PictureItem[], from: number, to: number): PictureItem[] => {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const out = [...items];
  const [moved] = out.splice(from, 1);
  if (moved) out.splice(to, 0, moved);
  return out;
};

export const removeItem = (items: PictureItem[], index: number): PictureItem[] =>
  items.filter((_, i) => i !== index);
