import { css, html, LitElement, nothing } from "lit";
import { chromeFill } from "../chrome";
import type { StateLabelConfig } from "../config";
import { DEFAULT_LABEL_SIZE, elementSizeCss } from "../element-size";
import type { HassEntity, HomeAssistant } from "../types";
import { chromeFillStyles, haloStyles } from "./item-styles";
import { hasAction } from "./state-icon-element";

interface ActionHandlerElement extends HTMLElement {
  bind?: (element: HTMLElement, options: { hasHold: boolean; hasDoubleClick: boolean }) => void;
}

const actionHandler = (): ActionHandlerElement | undefined => {
  const existing = document.body.querySelector<ActionHandlerElement>("action-handler");
  if (existing) return existing;
  if (!customElements.get("action-handler")) return undefined;
  return document.body.appendChild(document.createElement("action-handler"));
};

/**
 * Home Assistant's own mapping from a ui_color name to a CSS value. Copied
 * because computeCssColor is not exported: the palette names and the three
 * text-ish names resolve to `--<name>-color`, anything else is handed through
 * as a plain CSS colour. "none" is ours to intercept — `color: none` is not
 * valid CSS, and the point of "none" is that we name nothing at all.
 */
const NAMED_COLORS = new Set([
  "primary",
  "accent",
  "disabled",
  "red",
  "pink",
  "purple",
  "deep-purple",
  "indigo",
  "blue",
  "light-blue",
  "cyan",
  "teal",
  "green",
  "light-green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "deep-orange",
  "brown",
  "light-grey",
  "grey",
  "dark-grey",
  "blue-grey",
  "black",
  "white",
  "primary-text",
  "secondary-text",
]);

const labelColor = (color?: string): string | undefined => {
  if (!color || color === "none") return undefined;
  return NAMED_COLORS.has(color) ? `var(--${color}-color)` : color;
};

/**
 * A text-only item. Renders an entity's name, its state, or both, on top of
 * the photograph. Uses Home Assistant's own `state-display` when it is
 * registered; falls back to `formatEntityState` so the label is never blank.
 */
export class PictureStudioStateLabel extends LitElement {
  static properties = {
    _config: { state: true },
  };

  // No accessibility modifier — just declare, matching the rest of the codebase.
  declare _config?: StateLabelConfig;
  private _hass?: HomeAssistant;
  private _clickFallback = false;

  constructor() {
    super();
    this.addEventListener("action", (ev: Event) => {
      const action = (ev as CustomEvent<{ action?: string }>).detail?.action;
      if (!action || !this._config) return;
      // hass-action is the event the root <home-assistant> hands to Home
      // Assistant's own handleAction — more-info, toggle, navigate, url,
      // perform-action, with the confirmation dialogs. Nothing in the frontend
      // fires it; it exists for third-party cards, which is what we are.
      this.dispatchEvent(
        new CustomEvent("hass-action", {
          detail: { config: this._config, action },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }

  setConfig(config: StateLabelConfig): void {
    this._config = config;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // Unlike the card, this element renders from hass on every tick: the state
    // it displays needs to follow the entity.
    this.requestUpdate("_config");
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;
    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;

    return html`
      <div class="chrome">
        <div class="content">
          ${
            config.show_name && stateObj
              ? html`<span class="name"
                >${this._hass?.formatEntityName?.(stateObj, config.name) ?? ""}</span
              >`
              : nothing
          }
          ${config.show_state ? this._renderState(stateObj) : nothing}
        </div>
      </div>
    `;
  }

  /**
   * state-display is Home Assistant's own renderer for `state_content` — the one
   * the entity badge, the tile card and heading badges all use. It is a custom
   * element, and an undefined custom element renders nothing at all, silently,
   * so its absence must degrade to something rather than to a blank label.
   * formatEntityState is a function on hass, always there, and it renders
   * exactly what the default state_content produces.
   */
  private _renderState(stateObj?: HassEntity) {
    if (!stateObj) return nothing;
    if (customElements.get("state-display")) {
      return html`<state-display
        class="state"
        .hass=${this._hass}
        .stateObj=${stateObj}
        .content=${this._config?.state_content}
        .timeFormat=${this._config?.time_format}
      ></state-display>`;
    }
    return html`<span class="state">${this._hass?.formatEntityState?.(stateObj) ?? ""}</span>`;
  }

  /** The host's own custom properties, written after render rather than during it. */
  protected updated(): void {
    const config = this._config;
    if (!config) return;
    this.style.setProperty("--psc-label-size", elementSizeCss(config.size, DEFAULT_LABEL_SIZE));

    const color = labelColor(config.color);
    if (color) this.style.setProperty("--psc-label-color", color);
    else this.style.removeProperty("--psc-label-color");

    const chrome = config.chrome;
    const on = !!chrome && chrome.theme !== "none";
    this.toggleAttribute("chrome", on);
    if (on && chrome) {
      this.style.setProperty("--psc-chrome-fill", chromeFill(chrome.theme));
      // A pill has to survive any text length, so it is a length large enough to
      // saturate rather than a percentage, which would draw an ellipse on a wide
      // box.
      this.style.setProperty("--psc-chrome-radius", chrome.pill ? "999px" : `${chrome.radius}px`);
      this.style.setProperty("--psc-chrome-opacity", `${chrome.opacity}`);
      this.style.setProperty("--psc-chrome-padding", `${chrome.padding}px`);
    } else {
      for (const name of [
        "--psc-chrome-fill",
        "--psc-chrome-radius",
        "--psc-chrome-opacity",
        "--psc-chrome-padding",
      ]) {
        this.style.removeProperty(name);
      }
    }

    this.toggleAttribute("halo", config.halo === true);

    // Absent tap_action means clickable (the default action is more-info).
    // Mirrors Home Assistant's own badge.hasAction getter exactly: the cursor
    // disappears only when all three actions are explicitly set to "none".
    const clickable =
      !config.tap_action ||
      hasAction(config.tap_action) ||
      hasAction(config.hold_action) ||
      hasAction(config.double_tap_action);
    this.toggleAttribute("clickable", clickable);

    const handler = actionHandler();
    if (handler?.bind) {
      handler.bind(this, {
        hasHold: hasAction(config.hold_action),
        hasDoubleClick: hasAction(config.double_tap_action),
      });
      return;
    }
    // Honest degradation: without the handler we lose hold and double-tap, not
    // the card. Bound once, hence the flag.
    if (this._clickFallback) return;
    this._clickFallback = true;
    this.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    });
  }

  static styles = [
    chromeFillStyles,
    haloStyles("--psc-label-size"),
    css`
      :host {
        display: block;
        transition: transform 120ms ease-out;
      }
      :host([clickable]) {
        cursor: pointer;
      }
      :host([clickable]:hover) {
        transform: scale(1.04);
      }
      /* The chrome. Always present, styled only when the config asks for it, so
         the DOM shape never depends on the config. Unlike the icon's, this box is
         not a square we chose: its width belongs to the text, so a chrome widens
         the item. Positioning and drag bounds read the rendered box, so they
         follow. */
      .chrome {
        position: relative;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      /* The shape, the clipping and the gutter belong to the chrome: an unshaped,
         unpadded wrapper is exactly what "no chrome" means. Keeping the halo out
         of this rule is deliberate — conflating the two is what once clipped every
         chromeless icon into a circle. */
      :host([chrome]) .chrome {
        border-radius: var(--psc-chrome-radius, 0);
        padding: var(--psc-chrome-padding, 0) calc(var(--psc-chrome-padding, 0) * 1.6);
        overflow: hidden;
      }
      .content {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        /* The size value is a body, not a box: everything below is a share of it,
           so one number moves the whole label. */
        font-size: var(--psc-label-size);
        line-height: 1.2;
        /* Decided in the design: a label never wraps, whatever it holds. */
        white-space: nowrap;
        color: var(--psc-label-color, var(--primary-text-color));
      }
      /* The hierarchy the eye expects from a name/value pair, and the same one
         Home Assistant gives its badges and tiles. Derived, never a setting. */
      .name {
        font-size: 0.75em;
        color: var(--secondary-text-color);
      }
    `,
  ];
}
