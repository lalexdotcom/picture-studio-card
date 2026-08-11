import type { HassEntity } from "home-assistant-js-websocket";

/** Only the slice of hass we actually touch. */
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  themes: { darkMode: boolean };
  language: string;
  locale: unknown;
  [key: string]: unknown;
}

/** A Lovelace badge config. Opaque: we never read or rewrite its contents. */
export interface BadgeConfig {
  type?: string;
  [key: string]: unknown;
}

export interface LovelaceBadgeElement extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: BadgeConfig): void;
}

export interface CardHelpers {
  createBadgeElement(config: BadgeConfig): LovelaceBadgeElement;
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
    }[];
    customBadges?: CustomBadgeEntry[];
  }
}
