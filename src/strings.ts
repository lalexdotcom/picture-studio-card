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
    anchor: "Position",
    anchor_anchored: "Anchored",
    ratio: "Ratio",
    size_and_position: "Size and position",
    size_mode: "Size",
    size_mode_adaptive: "Adaptive",
    size_mode_fixed: "Fixed",
    size_value: "Value",
  },
  fr: {
    stacking_hint: "Les derniers badges de la liste sont au-dessus.",
    anchor: "Position",
    anchor_anchored: "Ancré",
    ratio: "Ratio",
    size_and_position: "Taille et position",
    size_mode: "Taille",
    size_mode_adaptive: "Adaptative",
    size_mode_fixed: "Fixe",
    size_value: "Valeur",
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
