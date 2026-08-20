import { css, html, LitElement, nothing } from "lit";
import { activeCard, type EditorChannel, notifyEditors, registerEditor } from "../broker";
import {
  type BadgeItem,
  CARD_TYPE,
  type ElementConfig,
  type ElementItem,
  type HeadingConfig,
  hasHeading,
  normalizeConfig,
  type PictureStudioConfig,
  storedConfig,
} from "../config";
import type { Anchor, Position } from "../position";
import { localizeOwn } from "../strings";
import type { BadgeConfig, HomeAssistant, VisibilityCondition } from "../types";
import { stubBadgeConfig } from "./badge-catalog";
import { badgeVerdict } from "./badge-existence";
import { itemsSeverity } from "./badge-list";
import { stubElementConfig } from "./element-catalog";
import {
  backgroundData,
  backgroundSchema,
  entitySchema,
  filtersSchema,
  formHelper,
  mergeBackground,
  PICTURE_ENTITY,
} from "./form-schemas";
import { type FormSchema, formLabel, sectionData, sectionMerge } from "./form-section";
import { addItem, moveItem, removeItem, replaceConfig, setAnchor, setVisibility } from "./items";
import "./badge-form";
import "./badge-list";
import "./element-form";
import "./heading-section";
import "./section-panel";

export class PictureStudioEditor extends LitElement implements EditorChannel {
  static properties = {
    hass: { attribute: false },
    lovelace: { attribute: false },
    _config: { state: true },
    _editingIndex: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
    }
    .count {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      background: var(--ha-color-fill-neutral-quiet-resting, rgba(0, 0, 0, 0.06));
      border-radius: var(--ha-border-radius-pill, 9999px);
      padding: 0 var(--ha-space-2);
      line-height: var(--ha-space-5);
    }
    .severity {
      --mdc-icon-size: 20px;
    }
    .severity.error {
      color: var(--error-color);
    }
    .severity.warning {
      color: var(--warning-color);
    }
  `;

  declare hass?: HomeAssistant;
  declare lovelace?: unknown;
  declare _config?: PictureStudioConfig;
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

  /**
   * The item that should have a form open, or `undefined` when none should.
   * Two readers share this decision: render() (to choose list vs form) and
   * updated() (to know whether to scroll the editor to its top). Extracting it
   * here keeps both in sync automatically.
   */
  private _formTarget(): BadgeItem | ElementItem | undefined {
    if (this._editingIndex === undefined || !this._config) return undefined;
    const raw = this._config.items[this._editingIndex];
    if (!raw || raw.type === "unknown") return undefined;
    if (raw.type === "badge") {
      const type = String(raw.config.type ?? "");
      if (type && badgeVerdict(type) === "missing") return undefined;
    }
    return raw;
  }

  selectedIndex(): number | undefined {
    return this._editingIndex;
  }

  private _backgroundChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    this._commit(mergeBackground(this._config, ev.detail.value));
  };

  /**
   * One handler shape for the sections that are only fields. Bound per schema so
   * the merge touches exactly the keys that section rendered — a key another
   * section owns, or one this schema left out, is never written and never
   * dropped.
   */
  private _sectionChanged =
    (schema: FormSchema) =>
    (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
      ev.stopPropagation();
      if (!this._config || this._applying) return;
      this._commit(
        sectionMerge(
          schema,
          this._config as unknown as Record<string, unknown>,
          ev.detail.value,
        ) as unknown as PictureStudioConfig,
      );
    };

  private _headingChanged = (ev: CustomEvent<{ heading: HeadingConfig }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    const heading = ev.detail.heading;
    const { heading: _drop, ...rest } = this._config;
    // The empty heading is dropped rather than written, for the same reason
    // storedConfig never writes a default chrome: a key that holds nothing.
    this._commit({
      ...(rest as PictureStudioConfig),
      ...(hasHeading(heading) ? { heading } : {}),
    });
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
    const { oldIndex: from, newIndex: to } = ev.detail;
    this._commit({
      ...config,
      items: moveItem(config.items, from, to),
    });
    // Remap the selection through the same move so the mark follows the item.
    // Clearing it on a drag would remove the one visual that helps the user
    // find a broken item they just moved.
    const sel = this._editingIndex;
    if (sel === undefined) return;
    if (sel === from) {
      this.select(to);
    } else if (from < sel && sel <= to) {
      this.select(sel - 1); // the moved item shifted everything between down
    } else if (to <= sel && sel < from) {
      this.select(sel + 1); // the moved item shifted everything between up
    }
    // Otherwise the selected item is outside the moved range — unchanged.
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
    // Scroll the editor to its top only when a form actually opens.  When the
    // form is refused (broken badge) the list scrolls the selected row into
    // view instead — the two are mutually exclusive branches of one decision.
    if (!this._formTarget()) return;
    this.scrollIntoView({ block: "start" });
  }

  protected render() {
    const config = this._config;
    const hass = this.hass;
    if (!config || !hass) return nothing;

    const editing = this._formTarget();

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

    const localize = hass.localize;
    const background = backgroundSchema(localize, config);
    const filters = filtersSchema(localize);
    const entity = entitySchema(localize);
    const label = (s: { name: string }) =>
      s.name === PICTURE_ENTITY ? localizeOwn(hass, "picture_entity") : formLabel(localize, s.name);
    const helper = (s: { name: string }) => formHelper(hass, s.name);
    const flat = config as unknown as Record<string, unknown>;

    return html`
      <picture-studio-section open .label=${localizeOwn(hass, "section_background")} icon="mdi:image">
        <ha-form
          .hass=${hass}
          .data=${backgroundData(config)}
          .schema=${background}
          .computeLabel=${label}
          .computeHelper=${helper}
          @value-changed=${this._backgroundChanged}
        ></ha-form>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "items")} icon="mdi:format-list-bulleted">
        ${
          config.items.length
            ? html`<span class="count" slot="event">${config.items.length}</span>`
            : nothing
        }
        ${
          // The strongest state wins: one glyph, never two. Same vocabulary as
          // visibility-section.ts, and the same asymmetry — the normal case gets
          // no ink at all.
          (() => {
            const severity = itemsSeverity(config.items);
            if (!severity) return nothing;
            return html`<ha-icon
              slot="event"
              class="severity ${severity}"
              icon=${severity === "error" ? "mdi:alert-circle" : "mdi:alert-outline"}
              title=${localizeOwn(hass, severity === "error" ? "items_error" : "items_warning")}
            ></ha-icon>`;
          })()
        }
        <picture-studio-badge-list
          .hass=${hass}
          .items=${config.items}
          .selectedIndex=${this._editingIndex}
          @item-add=${this._addItem}
          @item-edit=${this._editBadge}
          @item-moved=${this._moveBadge}
          @item-removed=${this._removeBadge}
        ></picture-studio-badge-list>
      </picture-studio-section>

      <picture-studio-section
        .label=${hass.localize("ui.panel.lovelace.editor.card.heading.name")}
        icon="mdi:format-title"
      >
        <picture-studio-heading-section
          .hass=${hass}
          .heading=${config.heading}
          @heading-changed=${this._headingChanged}
        ></picture-studio-heading-section>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "section_filters")} icon="mdi:image-filter-black-white">
        <ha-form
          .hass=${hass}
          .data=${sectionData(filters, flat)}
          .schema=${filters}
          .computeLabel=${label}
          @value-changed=${this._sectionChanged(filters)}
        ></ha-form>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "section_entity")} icon="mdi:image-auto-adjust">
        <ha-form
          .hass=${hass}
          .data=${sectionData(entity, flat)}
          .schema=${entity}
          .computeLabel=${label}
          @value-changed=${this._sectionChanged(entity)}
        ></ha-form>
      </picture-studio-section>
    `;
  }
}
