import type { HassEntity } from "home-assistant-js-websocket";

export type { HassEntity };

/** Only the slice of hass we actually touch. */
/**
 * HA's translation lookup. It returns "" for an unknown key, never throws, so every
 * call site pairs it with a fallback.
 */
export type LocalizeFunc = (key: string, values?: Record<string, unknown>) => string;

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  themes: { darkMode: boolean };
  /** The effective UI language. `locale.language` is the user's stored preference. */
  language: string;
  locale?: { language?: string };
  localize: LocalizeFunc;
  /** Optional: hand-declared because our type file must not claim more than we rely on. */
  formatEntityName?: (stateObj: HassEntity, name?: string) => string;
  [key: string]: unknown;
}

/** A Lovelace badge config. Opaque: we never read or rewrite its contents. */
export interface BadgeConfig {
  type?: string;
  [key: string]: unknown;
}

/**
 * One entry of Home Assistant's `visibility` list. Opaque on purpose: the schema
 * is theirs, it already covers nine condition types, and `hui-card` is what
 * reads it. Declaring their union here would only be a copy to maintain, and a
 * copy that goes stale the next time they add a type.
 */
export type VisibilityCondition = Record<string, unknown>;

export interface ActionConfig {
  action: string;
  [key: string]: unknown;
}

/**
 * Sizing defaults a card hands to the sections grid. `columns` counts twelfths of a
 * section, or "full" to span it whole; `rows` is a fixed height in grid rows, or
 * "auto" to follow the content. The min/max pairs bound the layout tab's sliders.
 */
export interface LovelaceGridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

/**
 * A card configuration the picker offers for a chosen entity. `label` only matters
 * when a provider returns several, to tell them apart.
 */
export interface CardSuggestion {
  label?: string;
  config: { type: string };
}

export interface LovelaceBadgeElement extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: BadgeConfig): void;
}

/** A Lovelace picture-elements element (hui-image-element, etc.). */
export interface LovelaceElementElement extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: Record<string, unknown>): void;
}

export interface CardHelpers {
  createBadgeElement(config: BadgeConfig): LovelaceBadgeElement;
  createHuiElement(config: Record<string, unknown>): LovelaceElementElement;
}

export interface CustomBadgeEntry {
  type: string;
  name?: string;
  description?: string;
}

declare global {
  interface Window {
    loadCardHelpers(): Promise<CardHelpers>;
    customCards?: {
      type: string;
      name: string;
      description?: string;
      preview?: boolean;
      documentationURL?: string;
      /**
       * Consulted by the card picker's entity-first flow. Returning null means
       * "not for this entity", which is how HA's own providers decline.
       */
      getEntitySuggestion?: (
        hass: HomeAssistant,
        entityId: string,
      ) => CardSuggestion | CardSuggestion[] | null;
    }[];
    customBadges?: CustomBadgeEntry[];
  }
}
