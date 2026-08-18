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

  private _fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** ha-dropdown reports the chosen entry on wa-select, not on the trigger. */
  private _add(ev: CustomEvent<{ item?: { value?: string } }>): void {
    const value = ev.detail?.item?.value;
    const choice = value ? splitChoiceValue(value) : undefined;
    if (choice) this._fire("item-add", choice);
  }

  protected render() {
    // Rendered before hass lands on the first paint; degrade to the raw key, as HA does.
    const localize: LocalizeFunc = this.hass?.localize ?? (() => "");
    // Built once per render: the whole badge catalogue would otherwise be rebuilt
    // once per row, on every hass tick.
    const catalog = badgeCatalog(window.customBadges);
    // Resolved once per render rather than once per row.
    const labels = this.items.map((item) => {
      if (item.type !== "badge") return rowLabel(item, this.hass);
      const type = String(item.config.type ?? "");
      const choice = catalog.find((c) => c.type === type);
      return rowLabel(item, this.hass, choice ? choiceLabel(localize, choice) : undefined);
    });
    const kinds = this.items.map((item) => kindLabel(item, localize, catalog));

    return html`
      <!-- Our own string, not Home Assistant's "Badges": the list has carried
           two families since 1.2.0, and naming it after one of them was true
           for exactly one release. -->
      <h3>${localizeOwn(this.hass, "items")}</h3>
      <p class="hint">${localizeOwn(this.hass, "stacking_hint")}</p>
      <ha-sortable
        handle-selector=".handle"
        draggable-selector=".item"
        @item-moved=${(ev: CustomEvent<{ oldIndex: number; newIndex: number }>) => {
          ev.stopPropagation();
          this._fire("item-moved", ev.detail);
        }}
      >
        <div class="rows">
          ${repeat(
            this.items,
            (_item, index) => index,
            (item, index) => html`
              <div class="item">
                <ha-icon class="handle" icon="mdi:drag-horizontal-variant"></ha-icon>
                <ha-icon
                  class="kind"
                  .icon=${itemIcon(item.type, String(item.config.type ?? ""))}
                  title=${kinds[index]}
                ></ha-icon>
                <div class="label">
                  <span class="primary">${labels[index]?.primary}</span>
                  ${
                    labels[index]?.secondary
                      ? html`<span class="secondary">${labels[index]?.secondary}</span>`
                      : nothing
                  }
                </div>
                ${
                  // States that the row carries visibility conditions. Not a
                  // control: no target, no ripple, no hover — and the same eye
                  // the form's own section is headed by, so the two read as one
                  // idea rather than two.
                  hasVisibility(item)
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
                  @click=${() => this._fire("item-edit", { index })}
                  ><ha-icon icon="mdi:pencil"></ha-icon></ha-icon-button>
                <ha-icon-button
                  .label=${localize("ui.common.delete") || "Delete"}
                  @click=${() => this._fire("item-removed", { index })}
                  ><ha-icon icon="mdi:close"></ha-icon></ha-icon-button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
      <ha-dropdown class="add" @wa-select=${this._add}>
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

  static styles = css`
    /* Otherwise unstyled, as picture-elements' "Elements" heading is: only the
       gap below is dropped, so the hint reads as its caption. */
    h3 {
      margin-bottom: var(--ha-space-1);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      margin: 0 0 var(--ha-space-2);
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
