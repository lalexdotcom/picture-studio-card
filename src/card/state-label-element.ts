import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { chromeFill } from "../chrome";
import type { StateLabelConfig } from "../config";
import { DEFAULT_LABEL_SIZE, elementSizeCss } from "../element-size";
import { hassRenderChanged } from "../has-changed";
import { itemColorCss, stateColorBrightness } from "../state-color";
import { localizeOwn } from "../strings";
import type { HassEntity, HomeAssistant } from "../types";
import { chromeFillStyles, haloStyles, interactionStyles } from "./item-styles";
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
 * A text-only item. Renders an entity's name, its state, or both, on top of
 * the photograph. Uses Home Assistant's own `state-display` when it is
 * registered; falls back to `formatEntityState` so the label is never blank.
 */
export class PictureStudioStateLabel extends LitElement {
  static properties = {
    _config: { state: true },
    _hass: { state: true },
    editing: { type: Boolean },
  };

  // No accessibility modifier — just declare, matching the rest of the codebase.
  declare _config?: StateLabelConfig;
  // Reactive, not a plain field: shouldUpdate below reads the previous value out
  // of changedProperties, which only a declared property records.
  declare _hass?: HomeAssistant;
  declare editing: boolean;
  /** The degraded tap listener while one is bound, so it can be taken back off. */
  private _clickFallback?: () => void;

  constructor() {
    super();
    this.editing = false;
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
    // Reactive assignment, not requestUpdate("_config") — see the icon's setter:
    // claiming a config change on every tick is what made the guard below
    // unwritable.
    this._hass = hass;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Same guard as the icon's, for the same reason. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("_config") || !changed.has("_hass")) return true;
    return hassRenderChanged(
      changed.get("_hass") as HomeAssistant | undefined,
      this._hass,
      this._config?.entity,
    );
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;

    // Nothing to show. On a dashboard that means nothing at all — not even the
    // chrome: under `anchor: auto` the translate is a percentage of the item's
    // own box, so drawing a box here and none there would place the item in one
    // spot and render it in another. With no box there is no offset, and the
    // stored position simply waits for something to be ticked.
    if (config.show.length === 0) {
      if (!this.editing) return nothing;
      // In the editor it still has to be selectable and draggable, so it gets a
      // marker instead. A warning, not an error: the config is valid, its result
      // is merely invisible.
      return html`<div class="placeholder">${localizeOwn(this._hass, "label_empty")}</div>`;
    }

    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;

    return html`
      <div class="chrome">
        <div class="content">
          ${
            config.show.includes("name") && stateObj
              ? html`<span class="name"
                  >${this._hass?.formatEntityName?.(stateObj, config.name) ?? ""}</span
                >`
              : nothing
          }
          ${config.show.includes("state") ? this._renderState(stateObj) : nothing}
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

  /**
   * The host's own custom properties, written after render rather than during it.
   *
   * Split the same way the icon's is, for the same reason: the colour and the
   * brightness follow the entity, everything below follows the config alone.
   */
  protected updated(changed: PropertyValues): void {
    const config = this._config;
    if (!config) return;

    // The entity is read here as well as in render(): the colour is a host
    // property, and a host property is written after the render, not during it.
    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;
    const color = itemColorCss(stateObj, config.color);
    if (color) {
      this.style.setProperty("--psc-label-color", color);
      // The same value under the name the shared hover reads, so the veil is
      // tinted by whatever the item is showing.
      this.style.setProperty("--psc-item-color", color);
    } else {
      this.style.removeProperty("--psc-label-color");
      this.style.removeProperty("--psc-item-color");
    }

    // A dimmed bulb dims its label exactly as it dims an icon — the symmetry is
    // the point, and a config that does not want it names a colour outright,
    // which takes the branch above and never reaches this one.
    const brightness = stateObj && config.color === "state" ? stateColorBrightness(stateObj) : "";
    if (brightness) this.style.setProperty("--psc-label-brightness", brightness);
    else this.style.removeProperty("--psc-label-brightness");

    if (!changed.has("_config")) return;

    this.style.setProperty("--psc-label-size", elementSizeCss(config.size, DEFAULT_LABEL_SIZE));

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
      // The handler can arrive after we have already degraded — its element is
      // injected by Home Assistant, and the first render can precede it. Take
      // the fallback back off before binding, or one tap dispatches twice: once
      // through the handler's pointer machinery, once through our click.
      if (this._clickFallback) {
        this.removeEventListener("click", this._clickFallback);
        this._clickFallback = undefined;
      }
      handler.bind(this, {
        hasHold: hasAction(config.hold_action),
        hasDoubleClick: hasAction(config.double_tap_action),
      });
      return;
    }
    // Honest degradation: without the handler we lose hold and double-tap, not
    // the card. Bound once, hence the field.
    if (this._clickFallback) return;
    this._clickFallback = (): void => {
      this.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    };
    this.addEventListener("click", this._clickFallback);
  }

  static styles = [
    chromeFillStyles,
    haloStyles("--psc-label-size"),
    interactionStyles,
    css`
      :host {
        display: block;
        /* Captured from the page, where the theme defines it, so the hover veil
           has a colour to fall back on when the item names none. */
        --psc-inactive-color: var(--state-inactive-color);
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
      /* The weight Home Assistant gives a badge's own state — 500, not bold. Our
         text stands beside badges on the same picture, and at the default 400 it
         read lighter than them. The token rather than the number, so a theme that
         redefines its scale carries the label with it. */
      .state {
        font-weight: var(--ha-font-weight-medium, 500);
        /* The dimming a lit bulb applies to its own colour. On .state alone: it
           is the line that carries the state colour, so it is the exact
           counterpart of the glyph state-badge dims. A name is not a state and
           keeps its own. */
        filter: var(--psc-label-brightness, none);
      }
      /* One colour at three strengths, so it reads on any photograph: a
         saturated dashed border and text, over a fill that lets the picture
         through. color-mix rather than a frozen rgba, so a theme that redefines
         --warning-color carries the fill with it. */
      .placeholder {
        display: inline-block;
        box-sizing: border-box;
        font-size: var(--psc-label-size);
        line-height: 1.2;
        white-space: nowrap;
        font-weight: var(--ha-font-weight-bold, 700);
        /* Lower-cased in CSS, not in the catalogue: "Empty" and "Vide" stay
           ordinary words a translator can read, and every language gets the
           same treatment without a second string. */
        text-transform: lowercase;
        color: var(--warning-color);
        /* One colour at three strengths, so it reads on any photograph: a
           saturated dashed border and text over a fill that lets the picture
           through. Settled by eye against an opaque fill, which detached the
           word too hard from the image it sits on. color-mix rather than a
           frozen rgba, so a theme redefining --warning-color carries the fill
           with it. */
        background: color-mix(in srgb, var(--warning-color) 15%, transparent);
        border: 1px dashed var(--warning-color);
        border-radius: 5px;
        padding: 2px 4px;
      }
    `,
  ];
}
