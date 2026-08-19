import { css, html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { hasVisibility, type PictureItem } from "../config";
import { localizeOwn } from "../strings";
import type { CustomBadgeEntry, HomeAssistant, LocalizeFunc } from "../types";
import { type BadgeChoice, badgeCatalog, choiceLabel } from "./badge-catalog";
import { elementCatalog, elementLabel } from "./element-catalog";
import { itemIcon } from "./icons";
import { rowLabel } from "./items";

export interface AddChoice {
  value: string;
  label: string;
  icon: string;
}

/**
 * The human name of an item's kind, for the tooltip on its row icon. The add
 * menu shows the same name behind a family prefix, which is where the pairing
 * between glyph and kind is learned; here the prefix would only repeat what the
 * icon beside it already says.
 */
export const kindLabel = (
  item: PictureItem,
  localize: LocalizeFunc,
  // Required, not defaulted: the caller builds it once per render, and a
  // default would advertise "you may omit this" while quietly rebuilding the
  // whole catalogue on every call — once per row, on every hass tick.
  catalog: BadgeChoice[],
): string => {
  if (item.type === "unknown") return item.token ?? "";
  const type = String(item.config.type ?? "");
  if (item.type === "element") return elementLabel(localize, type);
  const choice = catalog.find((c) => c.type === type);
  return choice ? choiceLabel(localize, choice) : type;
};

/**
 * One list, two families. The plural labels are Home Assistant's own, which is
 * why the prefix costs no string of ours; the separator is ": " in every
 * language, since the thin space French typography wants before a colon would
 * need a per-locale format string — the string this choice avoids.
 */
export const addChoices = (localize: LocalizeFunc, custom?: CustomBadgeEntry[]): AddChoice[] => {
  const badges = localize("ui.panel.lovelace.editor.badges.name") || "Badges";
  const elements =
    localize("ui.panel.lovelace.editor.card.picture-elements.elements") || "Elements";
  return [
    ...elementCatalog().map((c) => ({
      value: `element:${c.type}`,
      label: `${elements}: ${elementLabel(localize, c.type)}`,
      icon: itemIcon("element", c.type),
    })),
    ...badgeCatalog(custom).map((c) => ({
      value: `badge:${c.type}`,
      label: `${badges}: ${choiceLabel(localize, c)}`,
      icon: itemIcon("badge", c.type),
    })),
  ];
};

/** Split on the FIRST colon: a badge type may hold one, as `custom:` does. */
export const splitChoiceValue = (
  value: string,
): { family: "badge" | "element"; type: string } | undefined => {
  const at = value.indexOf(":");
  if (at < 0) return undefined;
  const family = value.slice(0, at);
  if (family !== "badge" && family !== "element") return undefined;
  return { family, type: value.slice(at + 1) };
};

/** A label with an empty `show` draws nothing on the dashboard — say so here. */
const showsNothing = (item: PictureItem): boolean =>
  item.type === "element" &&
  item.config.type === "state-label" &&
  Array.isArray((item.config as { show?: unknown[] }).show) &&
  (item.config as { show: unknown[] }).show.length === 0;

export class PictureStudioBadgeList extends LitElement {
  static properties = {
    hass: { attribute: false },
    items: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare items: PictureItem[];

  constructor() {
    super();
    this.items = [];
  }

  /**
   * The list reads top-down, the array stores bottom-up — so the first row is
   * the item painted last, the one the eye sees on top of the picture. Layer
   * lists have worked this way since Photoshop, and the array keeps the meaning
   * it has always had: the last item wins, which is what `z-index`-free DOM
   * order gives us and what every config already written says.
   *
   * The flip is its own inverse, so one function serves both directions. It
   * stops here, at the component boundary: every event this element fires
   * carries an array index, so the editor, `items.ts` and the card never learn
   * that a display order exists. That matters most for `item-edit`, whose index
   * becomes `_editingIndex` and travels all the way to the card to mark the
   * selected item — a display index escaping through there would highlight the
   * wrong item on the picture.
   */
  private _flip(index: number): number {
    return this.items.length - 1 - index;
  }

  private _fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** ha-dropdown reports the chosen entry on wa-select, not on the trigger. */
  private _add(ev: CustomEvent<{ item?: { value?: string } }>): void {
    const value = ev.detail?.item?.value;
    const choice = value ? splitChoiceValue(value) : undefined;
    if (choice) this._fire("item-add", choice);
  }

  /**
   * The add menu. `placement="bottom-end"` is how Home Assistant opens its own
   * dropdowns from a right-hand trigger — the menu hangs under the button and
   * aligns on its right edge rather than running off the dialog. An unsupported
   * placement would only fall back to the default position, so the guard the
   * project asks for elsewhere is not needed: nothing disappears.
   */
  private _addMenu(localize: LocalizeFunc) {
    return html`
      <ha-dropdown class="add" placement="bottom-end" @wa-select=${this._add}>
        <ha-button slot="trigger" appearance="filled" size="s">
          <ha-icon icon="mdi:plus" slot="start"></ha-icon>
          ${localize("ui.common.add") || "Add"}
        </ha-button>
        ${addChoices(localize, window.customBadges).map(
          (c) => html`<ha-dropdown-item .value=${c.value}
            ><ha-icon slot="icon" .icon=${c.icon}></ha-icon>${c.label}</ha-dropdown-item
          >`,
        )}
      </ha-dropdown>
    `;
  }

  protected render() {
    // Rendered before hass lands on the first paint; degrade to the raw key, as HA does.
    const localize: LocalizeFunc = this.hass?.localize ?? (() => "");
    // Built once per render: the whole badge catalogue would otherwise be rebuilt
    // once per row, on every hass tick.
    const catalog = badgeCatalog(window.customBadges);
    // Top-down: the first row is the item drawn last, hence on top. A copy —
    // reverse() mutates, and `items` belongs to the editor. Everything below is
    // built from `rows`, so a row's index is a display index throughout, and
    // _flip is applied exactly where one leaves this element.
    const rows = [...this.items].reverse();
    // Resolved once per render rather than once per row.
    const labels = rows.map((item) => {
      if (item.type !== "badge") return rowLabel(item, this.hass);
      const type = String(item.config.type ?? "");
      const choice = catalog.find((c) => c.type === type);
      return rowLabel(item, this.hass, choice ? choiceLabel(localize, choice) : undefined);
    });
    const kinds = rows.map((item) => kindLabel(item, localize, catalog));
    const unknown = rows.map((item) => item.type === "unknown");

    return html`
      <div class="header">
        <div class="titles">
          <!-- Our own string, not Home Assistant's "Badges": the list has carried
               two families since 1.2.0, and naming it after one of them was true
               for exactly one release. -->
          <h3>${localizeOwn(this.hass, "items")}</h3>
          <p class="hint">${localizeOwn(this.hass, "stacking_hint")}</p>
        </div>
        ${this._addMenu(localize)}
      </div>
      <ha-sortable
        handle-selector=".handle"
        draggable-selector=".item"
        @item-moved=${(ev: CustomEvent<{ oldIndex: number; newIndex: number }>) => {
          ev.stopPropagation();
          // ha-sortable reports the positions of the rows it can see, which are
          // display positions. Flipping both is equivalent to reversing the
          // array, moving, and reversing back — the splice is symmetric under
          // reversal — and it keeps one mechanism in the file rather than two.
          this._fire("item-moved", {
            oldIndex: this._flip(ev.detail.oldIndex),
            newIndex: this._flip(ev.detail.newIndex),
          });
        }}
      >
        <div class="rows">
          ${repeat(
            rows,
            // Keyed by the ARRAY index, not the row's own. `repeat` reuses a row
            // whose key did not move, and an item is added to the end of the
            // array — which is the top of the list. Keyed by display position,
            // every row's key would shift on every insertion, so every row would
            // be re-rendered and, worse, each DOM row would come to serve a
            // different item: the focus a keyboard user is holding stays on the
            // node and follows the position, not the item it was on.
            (_item, index) => this._flip(index),
            (item, index) => html`
              <div class="item">
                <ha-icon class="handle" icon="mdi:drag-horizontal-variant"></ha-icon>
                <ha-icon
                  class="kind ${unknown[index] ? "error" : ""}"
                  .icon=${
                    unknown[index]
                      ? "mdi:alert-circle"
                      : itemIcon(
                          item.type as "badge" | "element",
                          String((item as { config?: { type?: unknown } }).config?.type ?? ""),
                        )
                  }
                  title=${kinds[index]}
                ></ha-icon>
                <div class="label">
                  <span class="primary">${labels[index]?.primary}</span>
                  ${
                    labels[index]?.secondary
                      ? html`<span class="secondary ${unknown[index] ? "error" : ""}">${labels[index]?.secondary}</span>`
                      : nothing
                  }
                </div>
                ${
                  // A bare icon rather than a pill: .conditional wears one
                  // because it borrows ha-label's geometry, and a warning is not
                  // a label. Before the eye, so the row reads left to right from
                  // the most surprising fact.
                  !unknown[index] && showsNothing(item)
                    ? html`<ha-icon
                        class="empty"
                        icon="mdi:alert-outline"
                        title=${localizeOwn(this.hass, "label_empty_hint")}
                      ></ha-icon>`
                    : nothing
                }
                ${
                  // States that the row carries visibility conditions. Not a
                  // control: no target, no ripple, no hover — and the same eye
                  // the form's own section is headed by, so the two read as one
                  // idea rather than two.
                  !unknown[index] && hasVisibility(item)
                    ? html`<span
                        class="conditional"
                        title=${
                          localize("ui.panel.lovelace.editor.edit_card.tab_visibility") ||
                          localizeOwn(this.hass, "visibility")
                        }
                      ><ha-icon icon="mdi:eye"></ha-icon></span>`
                    : nothing
                }
                <ha-icon-button
                  .label=${localize("ui.common.edit") || "Edit"}
                  .disabled=${unknown[index]}
                  @click=${() => this._fire("item-edit", { index: this._flip(index) })}
                  ><ha-icon icon="mdi:pencil"></ha-icon></ha-icon-button>
                <ha-icon-button
                  .label=${localize("ui.common.delete") || "Delete"}
                  @click=${() => this._fire("item-removed", { index: this._flip(index) })}
                  ><ha-icon icon="mdi:close"></ha-icon></ha-icon-button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
    `;
  }

  static styles = css`
    /* The title, its caption and the add button on one line. The button is
       aligned on the block's last line rather than centred on the pair: beside a
       two-line title, centring floats it between the heading and the caption and
       reads as belonging to neither. */
    .header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--ha-space-2, 8px);
      /* The gap the rows keep between themselves, so the header reads as the
         first thing in the same rhythm rather than as a block glued to the list.
         It sits on the row rather than on the caption: the button is taller than
         the text beside it, and a margin under the text alone would leave the
         button nearly touching the first item. */
      margin-bottom: var(--ha-space-2, 8px);
    }
    /* The heading and its caption move as one block, so the flex row has two
       children rather than three. */
    .titles {
      min-width: 0;
    }
    .add {
      flex: none;
    }
    /* Otherwise unstyled, as picture-elements' "Elements" heading is: only the
       gap below is dropped, so the hint reads as its caption. */
    h3 {
      margin-top: 0;
      margin-bottom: var(--ha-space-1);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      /* No margin of its own: the header row below carries the whole gap, and a
         second one here would also push the button off the caption's baseline. */
      margin: 0;
    }
    /* The geometry of Home Assistant's own entity list — the one the Entities,
       Distribution and History Graph editors all draw through hui-entity-editor:
       bordered rows of 48px, 8px apart, 12px of leading space and 4px of
       trailing, and no gap at all between the two actions.
       Rebuilt here rather than mounted as ha-md-list / ha-md-list-item: those
       ship in chunks this dialog is not guaranteed to load, and an undefined
       custom element renders nothing at all, silently — the whole list would
       vanish rather than degrade. */
    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2, 8px);
    }
    .rows:has(> *) {
      margin-bottom: var(--ha-space-2, 8px);
    }
    .item {
      display: flex;
      align-items: center;
      min-height: 48px;
      box-sizing: border-box;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-md, 8px);
      padding-inline-start: 12px;
      padding-inline-end: 4px;
    }
    .handle {
      cursor: move; /* fallback where grab is unsupported */
      cursor: grab;
      display: flex;
      flex: none;
      color: var(--secondary-text-color);
      margin-inline-end: 12px;
    }
    /* Says which family the row belongs to. Secondary colour and no target: it
       is a legend, not a control, and the tooltip carries the name. */
    .kind {
      display: flex;
      flex: none;
      color: var(--secondary-text-color);
      margin-inline-end: 12px;
    }
    /* The glyph replaces the kind rather than joining it: there is no kind to
       show. Home Assistant's own error vocabulary — the same "error" state that
       ha-alert and ha-visibility-status use — so the list and the form's
       Visibility header read as one language. No row tint: one bad item among
       twelve, and a full-width band buries the list. */
    .kind.error {
      color: var(--error-color);
    }
    .item .label .secondary.error {
      color: var(--error-color);
    }
    .label {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .label > * {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .secondary {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    /* The same pill as the count in an item form's Visibility header:
       ha-label's dense geometry and its background formula. Drawn here rather
       than mounted, because ha-label pads its container to 12px a side — right
       beside a number, far too wide around a lone icon. */
    .conditional {
      display: inline-flex;
      align-items: center;
      flex: none;
      height: 20px;
      padding: 0 6px;
      border-radius: var(--ha-border-radius-md, 8px);
      background-color: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.15);
      color: var(--secondary-text-color);
      margin-inline-end: var(--ha-space-2, 8px);
    }
    .conditional ha-icon {
      display: flex;
      --mdc-icon-size: 14px;
    }
    /* 16px, not the eye's 14: the eye can afford 14 because its pill gives it
       body, and a bare glyph has only its stroke. mdi:alert-outline rather than
       an eye-off, because two eyes side by side — one "has conditions", one
       "shows nothing" — would contradict each other half a centimetre apart. */
    .empty {
      display: flex;
      flex: none;
      color: var(--warning-color);
      --mdc-icon-size: 16px;
      margin-inline-end: var(--ha-space-2, 8px);
    }
    /* ha-icon-button pads itself out to a 48px touch target, which leaves a
       wide band of nothing between the two actions and before them. 36px is
       still a comfortable pointer target in a dialog and gives the row back its
       horizontal space — the label is what the eye should land on. */
    /* --ha-icon-button-size is the token ha-icon-button actually reads; the
       36px is the value every Home Assistant row editor sets, which is what
       closes the empty band between the two actions. */
    ha-icon-button {
      --ha-icon-button-size: 36px;
      color: var(--secondary-text-color);
      flex: none;
    }
    /* The trigger sizes itself; only the spacing is ours. */
    .add {
      display: block;
      margin-top: 12px;
    }
  `;
}
