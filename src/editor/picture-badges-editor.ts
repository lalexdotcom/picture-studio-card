import { html, LitElement, nothing } from "lit";
import { type EditorChannel, registerEditor } from "../broker";
import { CARD_TYPE, normaliseConfig, type PictureBadgesConfig } from "../config";
import type { Position } from "../position";
import type { HomeAssistant } from "../types";
import {
  BACKGROUND_SCHEMA,
  type BackgroundData,
  backgroundData,
  mergeBackground,
} from "./background-schema";

export class PictureBadgesEditor extends LitElement implements EditorChannel {
  static properties = {
    hass: { attribute: false },
    lovelace: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare lovelace?: unknown;
  declare _config?: PictureBadgesConfig;

  private _unregister?: () => void;
  /** Guards against a native child's config-changed echoing our own push. */
  private _applying = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._unregister = registerEditor(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unregister?.();
    this._unregister = undefined;
  }

  setConfig(config: unknown): void {
    this._config = normaliseConfig(config);
  }

  /** The single card → editor entry point. */
  patchPosition(index: number, position: Position): void {
    const config = this._config;
    if (!config) return;
    const badges = config.badges.map((item, i) => (i === index ? { ...item, position } : item));
    this._commit({ ...config, badges });
  }

  /** Convergence point: drag, dialogs and forms all end here. */
  protected _commit(next: PictureBadgesConfig): void {
    this._config = next;
    this._reemit(next);
  }

  /** Sole exit toward Home Assistant. */
  private _reemit(config: PictureBadgesConfig): void {
    if (this._applying) return;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: { ...config, type: CARD_TYPE } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _backgroundChanged = (ev: CustomEvent<{ value: BackgroundData }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    this._commit(mergeBackground(this._config, ev.detail.value));
  };

  protected render() {
    const config = this._config;
    if (!config || !this.hass) return nothing;

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${backgroundData(config)}
        .schema=${BACKGROUND_SCHEMA}
        .computeLabel=${(s: { name: string }) => s.name.replace(/_/g, " ")}
        @value-changed=${this._backgroundChanged}
      ></ha-form>
    `;
  }
}
