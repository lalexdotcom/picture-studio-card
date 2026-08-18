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
    items: "Items",
    stacking_hint: "The last items in the list are drawn on top.",
    anchor: "Position",
    anchor_anchored: "Anchored",
    ratio: "Ratio",
    size_and_position: "Size and position",
    size_mode: "Size",
    size_mode_adaptive: "Adaptive",
    size_mode_fixed: "Fixed",
    size_value: "Value",
    visibility: "Visibility",
    chrome: "Chrome",
    chrome_enabled: "Draw a chrome",
    chrome_radius: "Radius",
    chrome_opacity: "Opacity",
    chrome_content_ratio: "Content",
    halo_enabled: "Stand out",
    halo_enabled_helper:
      "Adds a shadow and a light rim so the element stays readable on any picture.",
    chrome_pill: "Pill",
    chrome_padding: "Padding",
  },
  fr: {
    items: "Items",
    stacking_hint: "Les derniers items de la liste sont au-dessus.",
    anchor: "Position",
    anchor_anchored: "Ancré",
    ratio: "Ratio",
    size_and_position: "Taille et position",
    size_mode: "Taille",
    size_mode_adaptive: "Adaptative",
    size_mode_fixed: "Fixe",
    size_value: "Valeur",
    visibility: "Visibilité",
    chrome: "Habillage",
    chrome_enabled: "Dessiner un habillage",
    chrome_radius: "Rayon",
    chrome_opacity: "Opacité",
    chrome_content_ratio: "Contenu",
    halo_enabled: "Détacher",
    halo_enabled_helper:
      "Ajoute une ombre et un liseré clair pour rester lisible sur n'importe quelle image.",
    chrome_pill: "Pilule",
    chrome_padding: "Marge",
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
