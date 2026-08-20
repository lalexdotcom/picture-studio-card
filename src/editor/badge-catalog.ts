import type { BadgeConfig, CustomBadgeEntry, HomeAssistant, LocalizeFunc } from "../types";

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
 * here.
 *
 * **This list is the acceptance list for native badge types.** A native type
 * absent from it is an error — both the editor row and the card's render gate
 * on `isSupportedBadgeType`. If Home Assistant introduces a new native badge
 * type, add it here and release: that is the price of knowing the list, and a
 * reader must not discover it by surprise.
 */
export const CUSTOM_PREFIX = "custom:";

export const CORE_BADGES: BadgeChoice[] = [
  { type: "entity", isCustom: false },
  { type: "shortcut", isCustom: false },
];

/**
 * Whether a badge type is accepted by this card.
 *
 * For `custom:` types we cannot know the list, so the runtime probe decides.
 * For native types `CORE_BADGES` decides, and one outside it is an error —
 * the same rule the card's render and the editor row both enforce.
 */
export const isSupportedBadgeType = (type: string): boolean =>
  type.startsWith(CUSTOM_PREFIX) || CORE_BADGES.some((b) => b.type === type);

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
 * A custom badge carries the name its library registered. A core one has none, so
 * we borrow HA's own — `ui.panel.lovelace.editor.badge.entity.name` is "Entity" in
 * every language HA ships — and fall back to the raw type if the key ever moves.
 */
export const choiceLabel = (localize: LocalizeFunc, choice: BadgeChoice): string => {
  if (choice.name) return choice.name;
  if (choice.isCustom) return choice.type;
  return localize(`ui.panel.lovelace.editor.badge.${choice.type}.name`) || choice.type;
};

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
  const probe = helpers.createBadgeElement({ type } as never) as HTMLElement;
  // The wrapper catches and returns hui-error-badge rather than throwing, so
  // this is the only synchronous signal that the type does not exist. Without
  // it, the whenDefined below never resolves.
  if (probe.tagName.toLowerCase() === "hui-error-badge") return undefined;
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
