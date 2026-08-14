import { css, html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PictureItem } from "../config";
import { localizeOwn } from "../strings";
import type { CustomBadgeEntry, HomeAssistant, LocalizeFunc } from "../types";
import { badgeCatalog, choiceLabel } from "./badge-catalog";
import { elementCatalog, elementLabel } from "./element-catalog";
import { rowLabel } from "./items";

export interface AddChoice {
  value: string;
  label: string;
}

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
    ...badgeCatalog(custom).map((c) => ({
      value: `badge:${c.type}`,
      label: `${badges}: ${choiceLabel(localize, c)}`,
    })),
    ...elementCatalog().map((c) => ({
      value: `element:${c.type}`,
      label: `${elements}: ${elementLabel(localize, c.type)}`,
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
    // Resolved once per render rather than three times per row.
    const labels = this.items.map((item) => rowLabel(item, this.hass?.states));

    return html`
      <h3>${localize("ui.panel.lovelace.editor.badges.name") || "Badges"}</h3>
      <p class="hint">${localizeOwn(this.hass, "stacking_hint")}</p>
      <ha-sortable
        handle-selector=".handle"
        @item-moved=${(ev: CustomEvent<{ oldIndex: number; newIndex: number }>) => {
          ev.stopPropagation();
          this._fire("item-moved", ev.detail);
        }}
      >
        <div class="rows">
          ${repeat(
            this.items,
            (_item, index) => index,
            (_item, index) => html`
              <div class="row">
                <div class="handle"><ha-icon icon="mdi:drag"></ha-icon></div>
                <div class="label">
                  <span class="primary">${labels[index]?.primary}</span>
                  ${
                    labels[index]?.secondary
                      ? html`<span class="secondary">${labels[index]?.secondary}</span>`
                      : nothing
                  }
                </div>
                <ha-icon-button
                  .label=${localize("ui.panel.lovelace.editor.badges.edit") || "Edit badge"}
                  @click=${() => this._fire("item-edit", { index })}
                  ><ha-icon icon="mdi:pencil"></ha-icon></ha-icon-button>
                <ha-icon-button
                  .label=${localize("ui.panel.lovelace.editor.badges.remove") || "Remove badge"}
                  @click=${() => this._fire("item-removed", { index })}
                  ><ha-icon icon="mdi:delete"></ha-icon></ha-icon-button>
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
          (c) => html`<ha-dropdown-item .value=${c.value}>${c.label}</ha-dropdown-item>`,
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
    .rows {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .handle {
      cursor: grab;
      display: flex;
      color: var(--secondary-text-color);
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
    /* The trigger sizes itself; only the spacing is ours. */
    .add {
      display: block;
      margin-top: 12px;
    }
  `;
}
