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
    stacking_hint: "The first items in the list are drawn on top.",
    anchor: "Position",
    anchor_anchored: "Anchored",
    ratio: "Ratio",
    size_and_position: "Size and position",
    size_mode: "Size",
    size_mode_adaptive: "Adaptive",
    size_mode_fixed: "Fixed",
    size_value: "Value",
    visibility: "Visibility",
    chrome_enabled: "Draw a chrome",
    chrome_radius: "Radius",
    chrome_opacity: "Opacity",
    chrome_content_ratio: "Content",
    halo_enabled: "Stand out",
    halo_enabled_helper:
      "Adds a shadow and a light rim so the element stays readable on any picture.",
    chrome_pill: "Pill",
    chrome_padding: "Padding",
    label_empty: "Empty",
    label_empty_hint: "This item shows nothing",
    visibility_visible: "Visible",
    visibility_hidden: "Hidden",
    visibility_invalid: "Invalid conditions",
    unknown_item: "Unreadable item",
    unknown_item_type: "Unknown item type",
    unknown_config_missing: "Missing config",
    unknown_element_type: "Unknown element type",
    unknown_badge_type: "Unknown badge type",
    badge_type_unavailable: "This badge type is not available on this Home Assistant.",
    visibility_unreadable: "Unreadable conditions",
    visibility_unreadable_body:
      "This item's conditions are not a list. They are ignored, and the item always shows.",
    visibility_reset: "Reset",
    section_background: "Background",
    section_filters: "Filters",
    section_entity: "Entity",
    picture_entity: "Image or camera entity",
    aspect_ratio_hint: "16:9, 16x9, 1.78 or 56.25% — decimals use a point.",
  },
  fr: {
    items: "Items",
    stacking_hint: "Les premiers items de la liste sont au-dessus.",
    anchor: "Position",
    anchor_anchored: "Ancré",
    ratio: "Ratio",
    size_and_position: "Taille et position",
    size_mode: "Taille",
    size_mode_adaptive: "Adaptative",
    size_mode_fixed: "Fixe",
    size_value: "Valeur",
    visibility: "Visibilité",
    chrome_enabled: "Dessiner un habillage",
    chrome_radius: "Rayon",
    chrome_opacity: "Opacité",
    chrome_content_ratio: "Contenu",
    halo_enabled: "Détacher",
    halo_enabled_helper:
      "Ajoute une ombre et un liseré clair pour rester lisible sur n'importe quelle image.",
    chrome_pill: "Pilule",
    chrome_padding: "Marge",
    label_empty: "Vide",
    label_empty_hint: "Cet item n'affiche rien",
    visibility_visible: "Visible",
    visibility_hidden: "Caché",
    visibility_invalid: "Conditions invalides",
    unknown_item: "Item illisible",
    unknown_item_type: "Type d'item inconnu",
    unknown_config_missing: "Config manquante",
    unknown_element_type: "Type d'élément inconnu",
    unknown_badge_type: "Type de badge inconnu",
    badge_type_unavailable: "Ce type de badge n'est pas disponible sur ce Home Assistant.",
    visibility_unreadable: "Conditions illisibles",
    visibility_unreadable_body:
      "Les conditions de cet item ne forment pas une liste. Elles sont ignorées, et l'item reste toujours visible.",
    visibility_reset: "Réinitialiser",
    section_background: "Fond",
    section_filters: "Filtres",
    section_entity: "Entité",
    picture_entity: "Entité image ou caméra",
    aspect_ratio_hint: "16:9, 16x9, 1.78 ou 56.25% — les décimales s'écrivent avec un point.",
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
