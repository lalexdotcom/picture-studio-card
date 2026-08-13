import { css, html, LitElement, nothing } from "lit";
import type { StateIconConfig } from "../config";
import { iconSizeCss } from "../element-size";
import type { HomeAssistant } from "../types";

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

  // No accessibility modifier, matching the rest of the codebase: TypeScript
  // requires it before `declare`, and the project writes neither.
  declare _config?: StateIconConfig;
  private _hass?: HomeAssistant;

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
    if (this._config) {
      this.style.setProperty("--psc-icon-size", iconSizeCss(this._config.size));
    }
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
