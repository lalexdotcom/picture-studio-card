import type { BadgeConfig, CustomBadgeEntry, HomeAssistant } from "../types";

export interface BadgeChoice {
  type: string;
  name?: string;
  description?: string;
  isCustom: boolean;
}

interface BadgeClass {
  getConfigElement?(): Promise<HTMLElement>;
  getStubConfig?(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[],
  ): BadgeConfig | Promise<BadgeConfig>;
}

/**
 * Mirrors `coreBadges` in home-assistant/frontend,
 * src/panels/lovelace/editor/lovelace-badges.ts — two entries as of 2026-08.
 * It is a module export we cannot reach from our bundle, so it is duplicated
 * here. If Home Assistant adds a native badge type, add it here too; until then
 * that type stays usable from YAML, since rendering does not filter on this list.
 */
const CUSTOM_PREFIX = "custom:";

export const CORE_BADGES: BadgeChoice[] = [
  { type: "entity", isCustom: false },
  { type: "shortcut", isCustom: false },
];

/**
 * What the native picker shows, minus fuzzy search and entity suggestions.
 *
 * `window.customBadges` holds tag names, not config types: Mushroom registers
 * `mushroom-template-badge`, while a Lovelace config must say
 * `custom:mushroom-template-badge`. Home Assistant's own picker keeps the bare
 * name in its list and prefixes it when it builds a config; we prefix here so
 * everything downstream — the stub, the class lookup, the stored config — deals
 * in one form. The guard is for a library that registers the prefix itself.
 */
export const badgeCatalog = (custom?: CustomBadgeEntry[]): BadgeChoice[] => [
  ...CORE_BADGES,
  ...(custom ?? []).map((entry) => ({
    type: entry.type.startsWith(CUSTOM_PREFIX) ? entry.type : `${CUSTOM_PREFIX}${entry.type}`,
    name: entry.name,
    description: entry.description,
    isCustom: true,
  })),
];

/**
 * The badge's own class, which is what knows how to build its config form.
 * This is the same route Home Assistant's HuiBadgeElementEditor takes
 * (getBadgeElementClass then elClass.getConfigElement); we reach the class
 * without private APIs by letting createBadgeElement force the load.
 *
 * Two branches for a reason:
 * - A custom: type's tag is already registered by the third-party library;
 *   there is nothing for us to load, we just look it up.
 * - A native type needs createBadgeElement to trigger its lazy module load
 *   before the tag is defined in the registry.
 * Do not collapse them.
 */
export const resolveBadgeClass = async (type: string): Promise<BadgeClass | undefined> => {
  if (type.startsWith(CUSTOM_PREFIX)) {
    // A third-party library registers its own tag; nothing to load on our side.
    return customElements.get(type.slice(CUSTOM_PREFIX.length)) as BadgeClass | undefined;
  }
  const helpers = await window.loadCardHelpers();
  helpers.createBadgeElement({ type }); // forces the lazy import of the badge module
  const tag = `hui-${type}-badge`;
  await customElements.whenDefined(tag);
  return customElements.get(tag) as BadgeClass | undefined;
};

/** Initial config for a freshly picked badge, from the class when it offers one. */
export const stubBadgeConfig = async (type: string, hass: HomeAssistant): Promise<BadgeConfig> => {
  const cls = await resolveBadgeClass(type);
  if (!cls?.getStubConfig) return { type };
  const entities = Object.keys(hass.states);
  // Re-stamp type after spreading: some getStubConfig implementations omit it.
  return { ...(await cls.getStubConfig(hass, entities, entities)), type };
};
