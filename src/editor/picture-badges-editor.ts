import { html, LitElement, nothing } from "lit";
import { type EditorChannel, registerEditor } from "../broker";
import { CARD_TYPE, normaliseConfig, type PictureBadgesConfig } from "../config";
import type { Position } from "../position";
import type { BadgeConfig, HomeAssistant } from "../types";
import {
  BACKGROUND_SCHEMA,
  type BackgroundData,
  backgroundData,
  mergeBackground,
} from "./background-schema";
import { stubBadgeConfig } from "./badge-catalog";
import { addItem, moveItem, removeItem, replaceBadge } from "./badge-items";
import "./badge-form";
import "./badge-list";

export class PictureBadgesEditor extends LitElement implements EditorChannel {
  static properties = {
    hass: { attribute: false },
    lovelace: { attribute: false },
    _config: { state: true },
    _editingIndex: { state: true },
  };

  declare hass?: HomeAssistant;
  declare lovelace?: unknown;
  declare _config?: PictureBadgesConfig;
  declare _editingIndex: number | undefined;

  private _unregister?: () => void;
  /** Guards against a native child's config-changed echoing our own push. */
  private _applying = false;

  constructor() {
    super();
    this._editingIndex = undefined;
  }

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
    const items = config.items.map((item, i) => (i === index ? { ...item, position } : item));
    this._commit({ ...config, items });
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

  private _addBadge = async (ev: CustomEvent<{ type: string }>): Promise<void> => {
    const config = this._config;
    if (!config || !this.hass) return;
    const badge = await stubBadgeConfig(ev.detail.type, this.hass);
    this._commit({ ...config, items: addItem(config.items, badge) });
    // Open the new badge's form straight away: a stub config is rarely usable
    // as-is, and this is what the native picker does after a pick.
    this._editingIndex = config.items.length;
  };

  private _editBadge = (ev: CustomEvent<{ index: number }>): void => {
    this._editingIndex = ev.detail.index;
  };

  private _badgeChanged = (ev: CustomEvent<{ badge: BadgeConfig }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: replaceBadge(config.items, this._editingIndex, ev.detail.badge),
    });
  };

  private _moveBadge = (ev: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    const config = this._config;
    if (!config) return;
    this._commit({
      ...config,
      items: moveItem(config.items, ev.detail.oldIndex, ev.detail.newIndex),
    });
  };

  private _removeBadge = (ev: CustomEvent<{ index: number }>): void => {
    const config = this._config;
    if (!config) return;
    this._commit({ ...config, items: removeItem(config.items, ev.detail.index) });
    this._editingIndex = undefined;
  };

  protected render() {
    const config = this._config;
    if (!config || !this.hass) return nothing;

    const editing = this._editingIndex !== undefined ? config.items[this._editingIndex] : undefined;

    if (editing) {
      return html`
        <picture-badge-form
          .hass=${this.hass}
          .badge=${editing.config}
          @badge-changed=${this._badgeChanged}
          @go-back=${() => {
            this._editingIndex = undefined;
          }}
        ></picture-badge-form>
      `;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${backgroundData(config)}
        .schema=${BACKGROUND_SCHEMA}
        .computeLabel=${(s: { name: string }) => s.name.replace(/_/g, " ")}
        @value-changed=${this._backgroundChanged}
      ></ha-form>
      <picture-badges-list
        .hass=${this.hass}
        .items=${config.items}
        @item-add=${this._addBadge}
        @item-edit=${this._editBadge}
        @item-moved=${this._moveBadge}
        @item-removed=${this._removeBadge}
      ></picture-badges-list>
    `;
  }
}
