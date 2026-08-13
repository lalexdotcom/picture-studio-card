import { css, html, LitElement } from "lit";
import { ANCHOR_OFFSETS, type Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

/** Row-major, so the grid reads the way it looks. */
const CELLS = Object.keys(ANCHOR_OFFSETS) as Exclude<Anchor, "proportional">[];

/**
 * Picks the anchor: a 3x3 grid for the nine fixed values, and a switch for
 * `proportional`, which has no place on the grid because it is not a point.
 *
 * The grid is hand-built rather than an ha-control-select: that component lives
 * in a lazily loaded chunk of the frontend, so a custom card cannot rely on the
 * tag being defined. The tokens below are HA's, so it still follows the theme.
 *
 * Nine cells and no nine labels — which is the reason this is a grid and not a
 * select, since Home Assistant has no translation key for an anchor name and
 * every string we invent is one we have to maintain in every language.
 */
export class PictureStudioAnchorPicker extends LitElement {
  static properties = {
    hass: { attribute: false },
    anchor: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare anchor?: Anchor;

  private _emit(anchor: Anchor): void {
    this.dispatchEvent(
      new CustomEvent("anchor-changed", {
        detail: { anchor },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected render() {
    const anchor = this.anchor ?? "proportional";
    const proportional = anchor === "proportional";
    return html`
      <div class="label">${localizeOwn(this.hass, "anchor")}</div>
      <div class="grid" ?disabled=${proportional}>
        ${CELLS.map(
          (cell) => html`
            <button
              type="button"
              class=${cell === anchor ? "cell selected" : "cell"}
              .disabled=${proportional}
              aria-label=${cell}
              aria-pressed=${cell === anchor}
              @click=${() => this._emit(cell)}
            ></button>
          `,
        )}
      </div>
      <ha-formfield .label=${localizeOwn(this.hass, "anchor_proportional")}>
        <ha-switch
          .checked=${proportional}
          @change=${(ev: Event) =>
            this._emit((ev.target as HTMLInputElement).checked ? "proportional" : "center")}
        ></ha-switch>
      </ha-formfield>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .label {
      color: var(--secondary-text-color);
      font-size: 0.85rem;
      margin-bottom: var(--ha-space-2, 8px);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--ha-space-1, 4px);
      width: max-content;
      padding: var(--ha-space-1, 4px);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 12px);
    }
    .grid[disabled] {
      opacity: 0.5;
    }
    .cell {
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: var(--secondary-background-color);
      cursor: pointer;
    }
    .cell:disabled {
      cursor: default;
    }
    .cell.selected {
      background: var(--primary-color);
    }
  `;
}
