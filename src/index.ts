import { css, html, LitElement } from "lit";
import type { HomeAssistant } from "./types";

const CARD_TAG = "picture-badges";

class PictureBadgesCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: { type: string };

  setConfig(config: { type: string }): void {
    this._config = config;
  }

  getCardSize(): number {
    return 4;
  }

  render() {
    return html`<ha-card><p>picture-badges loaded</p></ha-card>`;
  }

  static styles = css`
    p {
      padding: 16px;
      margin: 0;
    }
  `;
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureBadgesCard);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Badges",
  description: "An image with badges you position by drag and drop.",
  preview: true,
});
