import type { HomeAssistant } from "./types";

/**
 * Home Assistant has no way for a custom card to register a translation catalog:
 * `localize` only serves the frontend's own keys, `loadBackendTranslation` needs an
 * integration behind it, and `loadFragmentTranslation` is reserved for HA's panels.
 * So anything HA has no key for ships here. Everything HA does have a key for goes
 * through `hass.localize` instead — see background-schema and badge-list.
 */
const STRINGS = {
  en: {
    stacking_hint: "The last badges in the list are drawn on top.",
    anchor: "Positioning",
    anchor_proportional: "Proportional",
    anchor_anchored: "Anchored",
  },
  fr: {
    stacking_hint: "Les derniers badges de la liste sont au-dessus.",
    anchor: "Positionnement",
    anchor_proportional: "Proportionnel",
    anchor_anchored: "Ancré",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

/** The user's stored preference wins; `language` is HA's already-resolved fallback. */
const languageOf = (hass?: HomeAssistant): string =>
  (hass?.locale?.language ?? hass?.language ?? "en").toLowerCase();

/**
 * `fr-CA` and the like fall back to the base language, then to English — the same
 * degradation HA applies, so a missing translation is never a missing string.
 */
export const localizeOwn = (hass: HomeAssistant | undefined, key: StringKey): string => {
  const language = languageOf(hass);
  const table: Partial<Record<StringKey, string>> =
    STRINGS[language as keyof typeof STRINGS] ??
    STRINGS[language.split("-")[0] as keyof typeof STRINGS] ??
    STRINGS.en;
  return table[key] ?? STRINGS.en[key];
};
