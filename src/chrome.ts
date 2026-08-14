/**
 * The surface a state-icon can stand on. `size` gives the box; this record says
 * what is drawn in that box and how much of it the content takes.
 *
 * An icon on a photograph has no theme background behind it, so it competes
 * with whatever the picture happens to show. A Lovelace badge solves exactly
 * this by standing on its own surface, and the recipe copied here is theirs:
 * the fill comes from the theme, the glyph keeps its state colour.
 */
export type ChromeTheme = "none" | "auto" | "light" | "dark";

export interface Chrome {
  /** "none" draws nothing at all; the other three name what the fill is made of. */
  theme: ChromeTheme;
  /** border-radius as a percentage of the box — 50 is a disc, 0 a square. */
  radius: number;
  /** the fill's opacity, 0-1. The content is never faded, only the surface. */
  opacity: number;
  /** the share of the box taken by the glyph — or by an entity picture, which
      state-badge paints on the same host, so one number scales both. 0-1. */
  content_ratio: number;
}

/**
 * Off by default, so no existing dashboard changes on upgrade. The numbers are
 * the ones a chrome would want the day it is switched on: a disc, opaque, and
 * Home Assistant's own 24/40 glyph-to-box ratio.
 */
export const DEFAULT_CHROME: Chrome = {
  theme: "none",
  radius: 50,
  opacity: 1,
  content_ratio: 0.6,
};

const THEMES: readonly ChromeTheme[] = ["none", "auto", "light", "dark"];

const finiteOrDefault = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Unknown keys are dropped: `chrome` is a closed record of ours, exactly like
 * `size`. The rule that nothing may vanish applies one level up, to the
 * element's `config`, which `normalizeElementConfig` spreads.
 */
// The editor's sliders guide users to sensible values; a number written in
// YAML by hand is trusted exactly as written. This mirrors the rule already
// followed for positions: coordinates outside 0-100 are kept as written,
// because under a fixed anchor they place an item deliberately over the edge.
// Clamping here would be the one place the card second-guesses a hand-written
// config.
export const normalizeChrome = (raw: unknown): Chrome => {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CHROME };
  const chrome = raw as Partial<Record<string, unknown>>;
  const theme = chrome.theme as ChromeTheme;
  return {
    theme: THEMES.includes(theme) ? theme : DEFAULT_CHROME.theme,
    radius: finiteOrDefault(chrome.radius, DEFAULT_CHROME.radius),
    opacity: finiteOrDefault(chrome.opacity, DEFAULT_CHROME.opacity),
    content_ratio: finiteOrDefault(chrome.content_ratio, DEFAULT_CHROME.content_ratio),
  };
};

/**
 * All four fields, because `storedConfig` rewrites the whole config on every
 * editor commit: a partial comparison would either write a `chrome:` block into
 * everyone's YAML on the first drag, or drop numbers someone had tuned.
 */
export const isDefaultChrome = (chrome: Chrome): boolean =>
  chrome.theme === DEFAULT_CHROME.theme &&
  chrome.radius === DEFAULT_CHROME.radius &&
  chrome.opacity === DEFAULT_CHROME.opacity &&
  chrome.content_ratio === DEFAULT_CHROME.content_ratio;

/**
 * Every mode is a chain of Home Assistant's tokens; the literal at the end is a
 * last resort, not a choice.
 *
 * `auto` is what ha-badge itself uses, so the surface matches the dashboard's
 * cards. The two forced modes name the *core palette* — that layer is emitted
 * once, globally, with no dark counterpart, so both entries are readable
 * whichever mode is active. The semantic layer above it (--ha-color-surface-*)
 * is the one that comes in two copies, only one of which is ever in the
 * document: applyThemesOnElement picks a set in JavaScript and writes just that
 * one. Which is why "the theme's other mode" is not something we can ask for.
 */
export const chromeFill = (theme: ChromeTheme): string => {
  if (theme === "light") return "var(--ha-color-white, #fff)";
  if (theme === "dark") return "var(--ha-color-neutral-10, #202020)";
  return "var(--ha-card-background, var(--card-background-color, #fff))";
};
