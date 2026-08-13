import { css, html, LitElement, nothing } from "lit";
import type { StateIconConfig } from "../config";
import { iconSizeCss } from "../element-size";
import type { ActionConfig, HomeAssistant } from "../types";

/** Home Assistant's own one-liner: an action counts when set and not "none". */
export const hasAction = (action?: ActionConfig): boolean =>
  action !== undefined && action.action !== "none";

interface ActionHandlerElement extends HTMLElement {
  bind?: (element: HTMLElement, options: { hasHold: boolean; hasDoubleClick: boolean }) => void;
}

/**
 * The singleton Home Assistant's internal actionHandler directive uses. The
 * directive is nothing but these three lines, so reproducing them borrows the
 * gesture detection — thresholds, finger travel, double-click window — instead
 * of reimplementing it.
 */
const actionHandler = (): ActionHandlerElement | undefined => {
  const existing = document.body.querySelector<ActionHandlerElement>("action-handler");
  if (existing) return existing;
  if (!customElements.get("action-handler")) return undefined;
  return document.body.appendChild(document.createElement("action-handler"));
};

/**
 * An icon-only item. Home Assistant's `state-badge` — the disc at the left of an
 * entity row, not the Lovelace badge — already draws the state icon, colours it
 * by state including a light's real rgb_color and brightness, and shows the
 * entity picture. All this element adds is its size and, in Task 4, the action
 * relay.
 */
export class PictureStudioStateIcon extends LitElement {
  static properties = {
    _config: { state: true },
  };

  // No accessibility modifier — just declare, matching the rest of the codebase.
  declare _config?: StateIconConfig;
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

  setConfig(config: StateIconConfig): void {
    this._config = config;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // Unlike the card, this element renders from hass on every tick: the state
    // object it hands to state-badge is what makes the icon follow the entity.
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
      <state-badge
        .hass=${this._hass}
        .stateObj=${stateObj}
        .overrideIcon=${config.icon}
        .color=${config.color ?? "state"}
        .overrideImage=${config.show_entity_picture ? undefined : ""}
      ></state-badge>
    `;
  }

  /** The host's own custom property, written after render rather than during it. */
  protected updated(): void {
    const config = this._config;
    if (!config) return;
    this.style.setProperty("--psc-icon-size", iconSizeCss(config.size));

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

  static styles = css`
    :host {
      display: block;
      line-height: 0;
    }
    /* state-badge ships :host { width: 40px }, so the size has to drive the box
       as well as the glyph. One value, one visual footprint: a glyph and an
       entity picture occupy the same square. */
    state-badge {
      width: var(--psc-icon-size);
      height: var(--psc-icon-size);
      --mdc-icon-size: var(--psc-icon-size);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;
}
