import { html, LitElement, nothing } from "lit";
import { activeCard, type EditorChannel, notifyEditors, registerEditor } from "../broker";
import {
  CARD_TYPE,
  type ElementConfig,
  normalizeConfig,
  type PictureStudioConfig,
  storedConfig,
} from "../config";
import type { Anchor, Position } from "../position";
import type { BadgeConfig, HomeAssistant, LocalizeFunc, VisibilityCondition } from "../types";
import {
  type BackgroundData,
  backgroundData,
  backgroundLabel,
  backgroundSchema,
  mergeBackground,
} from "./background-schema";
import { stubBadgeConfig } from "./badge-catalog";
import { stubElementConfig } from "./element-catalog";
import { addItem, moveItem, removeItem, replaceConfig, setAnchor, setVisibility } from "./items";
import "./badge-form";
import "./badge-list";
import "./element-form";

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
    const items = config.items.map((item, i) => {
      if (i !== index) return item;
      // Unreachable today: an unknown item has no layer in the card, so a drag
      // can never produce its index. Guard for consistency with setAnchor and
      // setVisibility, and to keep storedConfig's raw-passthrough the only path
      // for unknown items regardless of future callers.
      if (item.type === "unknown") return item;
      return { ...item, position };
    });
    this._commit({ ...config, items });
  }

  patchAnchor(index: number, anchor: Anchor): void {
    const config = this._config;
    if (!config) return;
    // Ask the preview *before* writing. Only the card knows pixels, and only it
    // can still see where the item sits under its current anchor — Home
    // Assistant rebuilds the card element on every config change, so after the
    // commit there is no "before" left anywhere to measure against.
    // Anchor and position then travel in one write: two commits would render the
    // new anchor against the old coordinates for a frame, which is the jump this
    // whole exchange exists to avoid.
    const position = activeCard()?.reanchor(index, anchor);
    this._commit({ ...config, items: setAnchor(config.items, index, anchor, position) });
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

  private _addItem = async (
    ev: CustomEvent<{ family: "badge" | "element"; type: string }>,
  ): Promise<void> => {
    const config = this._config;
    if (!config || !this.hass) return;
    const item =
      ev.detail.family === "badge"
        ? ({ type: "badge", config: await stubBadgeConfig(ev.detail.type, this.hass) } as const)
        : ({ type: "element", config: stubElementConfig(ev.detail.type) } as const);
    this._commit({ ...config, items: addItem(config.items, item) });
    // Open the new item's form straight away: a stub is rarely usable as-is —
    // an element's has no entity at all — and this is what the native picker does.
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
      items: replaceConfig(config.items, this._editingIndex, ev.detail.badge),
    });
  };

  private _elementChanged = (ev: CustomEvent<{ element: ElementConfig }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: replaceConfig(config.items, this._editingIndex, ev.detail.element),
    });
  };

  private _anchorChanged = (ev: CustomEvent<{ anchor: Anchor }>): void => {
    ev.stopPropagation();
    if (this._editingIndex === undefined) return;
    this.patchAnchor(this._editingIndex, ev.detail.anchor);
  };

  private _visibilityChanged = (ev: CustomEvent<{ visibility?: VisibilityCondition[] }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: setVisibility(config.items, this._editingIndex, ev.detail.visibility),
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
    this.select(undefined);
  };

  /**
   * A form opens at the top of itself, not at the scroll position of whatever
   * was showing before — the list, or the previous item's form. The dialog owns
   * the scroll container, several shadow roots above us, so nothing of ours can
   * address it: `scrollIntoView` is the one call that reaches it, because the
   * browser scrolls every ancestor container whatever tree it lives in.
   *
   * Guarded on the transition rather than on the value: an item's form re-renders
   * on every keystroke and every hass tick, and scrolling on each of them would
   * fight the user's own scrolling.
   */
  protected updated(changed: Map<string, unknown>): void {
    if (!changed.has("_editingIndex") || this._editingIndex === undefined) return;
    this.scrollIntoView({ block: "start" });
  }

  protected render() {
    const config = this._config;
    const hass = this.hass;
    if (!config || !hass) return nothing;

    const rawEditing =
      this._editingIndex !== undefined ? config.items[this._editingIndex] : undefined;
    // Unreachable through the interface — the row's Edit button is disabled —
    // but a stale index after a removal must fall back to the list rather than
    // pick a form at random.
    const editing = rawEditing?.type === "unknown" ? undefined : rawEditing;

    if (editing) {
      return editing.type === "badge"
        ? html`
            <picture-studio-badge-form
              .hass=${hass}
              .badge=${editing.config}
              .anchor=${editing.anchor}
              .visibility=${editing.visibility}
              @badge-changed=${this._badgeChanged}
              @anchor-changed=${this._anchorChanged}
              @visibility-changed=${this._visibilityChanged}
              @go-back=${() => this.select(undefined)}
            ></picture-studio-badge-form>
          `
        : html`
            <picture-studio-element-form
              .hass=${hass}
              .element=${editing.config}
              .anchor=${editing.anchor}
              .visibility=${editing.visibility}
              @element-changed=${this._elementChanged}
              @anchor-changed=${this._anchorChanged}
              @visibility-changed=${this._visibilityChanged}
              @go-back=${() => this.select(undefined)}
            ></picture-studio-element-form>
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
        @item-add=${this._addItem}
        @item-edit=${this._editBadge}
        @item-moved=${this._moveBadge}
        @item-removed=${this._removeBadge}
      ></picture-studio-badge-list>
    `;
  }
}
