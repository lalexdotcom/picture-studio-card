import { html, LitElement, nothing } from "lit";
import { type EditorChannel, notifyEditors, registerEditor } from "../broker";
import { CARD_TYPE, normalizeConfig, type PictureStudioConfig, storedConfig } from "../config";
import type { Anchor, Position } from "../position";
import type { BadgeConfig, HomeAssistant, LocalizeFunc } from "../types";
import {
  type BackgroundData,
  backgroundData,
  backgroundLabel,
  backgroundSchema,
  mergeBackground,
} from "./background-schema";
import { stubBadgeConfig } from "./badge-catalog";
import { addItem, moveItem, removeItem, replaceBadge } from "./badge-items";
import "./badge-form";
import "./badge-list";

export class PictureStudioEditor extends LitElement implements EditorChannel {
  static properties = {
    hass: { attribute: false },
    lovelace: { attribute: false },
    _config: { state: true },
    _editingIndex: { state: true },
  };

  declare hass?: HomeAssistant;
  declare lovelace?: unknown;
  declare _config?: PictureStudioConfig;
  declare _editingIndex: number | undefined;

  private _unregister?: () => void;
  /** Guards against a native child's config-changed echoing our own push. */
  private _applying = false;
  /**
   * The schema now depends on `localize`, so it can no longer be a module constant.
   * Rebuilding it on every render would hand ha-form a new object each time; cache it
   * against the localize function, which HA replaces when the language changes.
   */
  private _schemaCache?: { localize: LocalizeFunc; schema: ReturnType<typeof backgroundSchema> };

  private _schema(localize: LocalizeFunc): ReturnType<typeof backgroundSchema> {
    if (this._schemaCache?.localize !== localize) {
      this._schemaCache = { localize, schema: backgroundSchema(localize) };
    }
    return this._schemaCache.schema;
  }

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
    this._config = normalizeConfig(config);
  }

  /** The single card → editor entry point. */
  patchPosition(index: number, position: Position): void {
    const config = this._config;
    if (!config) return;
    const items = config.items.map((item, i) => (i === index ? { ...item, position } : item));
    this._commit({ ...config, items });
  }

  patchAnchor(index: number, anchor: Anchor): void {
    const config = this._config;
    if (!config) return;
    const items = config.items.map((item, i) => (i === index ? { ...item, anchor } : item));
    this._commit({ ...config, items });
  }

  /** Convergence point: drag, dialogs and forms all end here. */
  protected _commit(next: PictureStudioConfig): void {
    this._config = next;
    this._reemit(next);
  }

  /** Sole exit toward Home Assistant. */
  private _reemit(config: PictureStudioConfig): void {
    if (this._applying) return;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        // The one exit to HA, so the one place that serializes positions.
        detail: { config: { ...storedConfig(config), type: CARD_TYPE } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The only writer of `_editingIndex`. Cards mirror the selection to mark the
   * badge and have no other way to learn it, since it never reaches the config —
   * so every change has to be announced, and routing them all through here is
   * what keeps that true.
   */
  select(index: number | undefined): void {
    if (this._editingIndex === index) return;
    this._editingIndex = index;
    notifyEditors();
  }

  selectedIndex(): number | undefined {
    return this._editingIndex;
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
    this.select(config.items.length);
  };

  private _editBadge = (ev: CustomEvent<{ index: number }>): void => {
    this.select(ev.detail.index);
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

  private _anchorChanged = (ev: CustomEvent<{ anchor: Anchor }>): void => {
    ev.stopPropagation();
    if (this._editingIndex === undefined) return;
    this.patchAnchor(this._editingIndex, ev.detail.anchor);
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
    this.select(undefined);
  };

  protected render() {
    const config = this._config;
    const hass = this.hass;
    if (!config || !hass) return nothing;

    const editing = this._editingIndex !== undefined ? config.items[this._editingIndex] : undefined;

    if (editing) {
      return html`
        <picture-studio-badge-form
          .hass=${hass}
          .badge=${editing.config}
          .anchor=${editing.anchor}
          @badge-changed=${this._badgeChanged}
          @anchor-changed=${this._anchorChanged}
          @go-back=${() => this.select(undefined)}
        ></picture-studio-badge-form>
      `;
    }

    return html`
      <ha-form
        .hass=${hass}
        .data=${backgroundData(config)}
        .schema=${this._schema(hass.localize)}
        .computeLabel=${(s: { name: string }) => backgroundLabel(hass.localize, s.name)}
        @value-changed=${this._backgroundChanged}
      ></ha-form>
      <picture-studio-badge-list
        .hass=${hass}
        .items=${config.items}
        @item-add=${this._addBadge}
        @item-edit=${this._editBadge}
        @item-moved=${this._moveBadge}
        @item-removed=${this._removeBadge}
      ></picture-studio-badge-list>
    `;
  }
}
