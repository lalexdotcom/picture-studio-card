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
 * The cells stay live while `proportional` is on, with none of them marked:
 * clicking one is how you leave that mode, so disabling them would make the
 * switch the only way out of a state the grid is meant to replace.
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
      <div class="row">
        <div class="half">
          <ha-formfield .label=${localizeOwn(this.hass, "anchor_proportional")}>
            <ha-switch
              .checked=${proportional}
              @change=${(ev: Event) =>
                this._emit((ev.target as HTMLInputElement).checked ? "proportional" : "center")}
            ></ha-switch>
          </ha-formfield>
        </div>
        <hr class="sep" />
        <div class="half">
          <!-- The grid goes inside an ha-formfield for the same reason the
               switch does: it is the only way its label is styled identically,
               by construction rather than by copying values out of HA's CSS. -->
          <ha-formfield .label=${localizeOwn(this.hass, "anchor_anchored")}>
            <div class="grid">
              ${CELLS.map(
                (cell) => html`
                  <button
                    type="button"
                    class=${cell === anchor ? "cell selected" : "cell"}
                    aria-label=${cell}
                    aria-pressed=${cell === anchor}
                    @click=${() => this._emit(cell)}
                  ></button>
                `,
              )}
            </div>
          </ha-formfield>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4, 16px);
    }
    .half {
      flex: 1;
      display: flex;
      align-items: center;
    }
    /* align-self overrides the row's center alignment, so the rule spans the
       taller of the two halves rather than being sized to its own content. */
    .sep {
      flex: 0 0 auto;
      align-self: stretch;
      width: 0;
      margin: 0;
      border: none;
      border-left: 1px solid var(--divider-color);
    }
    .grid {
      --cell-radius: 2px;
      /* Not an --ha-space-* token: HA's scale starts at 4px, and at this size
         the frame reads as a border rather than as spacing. */
      --grid-padding: 2px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      /* Same value as the padding, so the gutter between cells matches the one
         between a cell and the frame. */
      gap: var(--grid-padding);
      width: max-content;
      padding: var(--grid-padding);
      /* ha-formfield only spaces the controls it knows about — its rule is
         ::slotted(ha-switch) { margin-inline-end: 10px }. Ours is a plain div in
         that slot, so it has to claim the same gap itself, or the two halves
         sit unevenly against their labels. */
      margin-inline-end: 10px;
      border: 1px solid var(--divider-color);
      /* Concentric with the cells it frames: a corner offset by the padding
         keeps the same gap all the way round only if the outer radius grows
         by that padding too. */
      border-radius: calc(var(--cell-radius) + var(--grid-padding));
    }
    .cell {
      width: 10px;
      height: 10px;
      padding: 0;
      border: none;
      border-radius: var(--cell-radius);
      background: var(--secondary-background-color);
      cursor: pointer;
    }
    .cell.selected {
      background: var(--primary-color);
    }
  `;
}
