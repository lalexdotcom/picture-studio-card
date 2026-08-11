import { css, html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PictureBadgeItem } from "../config";
import type { HomeAssistant } from "../types";
import { type BadgeChoice, badgeCatalog } from "./badge-catalog";

const HANDLE_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
const PLUS_PATH = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
const PENCIL_PATH =
  "M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z";
const TRASH_PATH =
  "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";

const label = (item: PictureBadgeItem): string => {
  const badge = item.badge as { entity?: string; type?: string; name?: string };
  return badge.name ?? badge.entity ?? badge.type ?? "badge";
};

const choiceLabel = (choice: BadgeChoice): string => choice.name ?? choice.type;

export class PictureBadgesList extends LitElement {
  static properties = {
    hass: { attribute: false },
    items: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare items: PictureBadgeItem[];

  constructor() {
    super();
    this.items = [];
  }

  private _fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** ha-dropdown reports the chosen entry on wa-select, not on the trigger. */
  private _add(ev: CustomEvent<{ item?: { value?: string } }>): void {
    const type = ev.detail?.item?.value;
    if (type) this._fire("item-add", { type });
  }

  protected render() {
    const choices = badgeCatalog(window.customBadges);

    return html`
      <p class="hint">Lower in the list is drawn on top.</p>
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
            (item, index) => html`
              <div class="row">
                <div class="handle"><ha-svg-icon .path=${HANDLE_PATH}></ha-svg-icon></div>
                <span class="label">${label(item)}</span>
                <ha-icon-button
                  .label=${"Edit"}
                  .path=${PENCIL_PATH}
                  @click=${() => this._fire("item-edit", { index })}
                ></ha-icon-button>
                <ha-icon-button
                  .label=${"Delete"}
                  .path=${TRASH_PATH}
                  @click=${() => this._fire("item-removed", { index })}
                ></ha-icon-button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
      <ha-dropdown class="add" @wa-select=${this._add}>
        <ha-button slot="trigger" appearance="filled" size="s">
          <ha-svg-icon .path=${PLUS_PATH} slot="start"></ha-svg-icon>
          Add badge
        </ha-button>
        ${choices.map(
          (c) => html`<ha-dropdown-item .value=${c.type}>${choiceLabel(c)}</ha-dropdown-item>`,
        )}
      </ha-dropdown>
    `;
  }

  static styles = css`
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin: 8px 0;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* The trigger sizes itself; only the spacing is ours. */
    .add {
      display: block;
      margin-top: 12px;
    }
  `;
}
