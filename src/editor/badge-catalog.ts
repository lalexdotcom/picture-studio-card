import { CORE_BADGE_TYPES, CUSTOM_PREFIX, isSupportedBadgeType } from "../config";
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
 * Re-exported so the editor's own modules keep reading in their local
 * vocabulary. The rule itself lives in `../config`, because the card enforces it
 * on every render and must not import from the editor layer to do so.
 */
export { CUSTOM_PREFIX, isSupportedBadgeType };

/**
 * The acceptance list, wearing the shape the picker needs. Derived rather than
 * restated: `CORE_BADGE_TYPES` is the single list, and a second literal here
 * would be free to disagree with the one the card gates on.
 */
export const CORE_BADGES: BadgeChoice[] = CORE_BADGE_TYPES.map((type) => ({
  type,
  isCustom: false,
}));

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
