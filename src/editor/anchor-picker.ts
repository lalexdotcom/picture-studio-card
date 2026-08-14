import { css, html, LitElement } from "lit";
import { ANCHOR_OFFSETS, type Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

/** Row-major, so the grid reads the way it looks. */
const CELLS = Object.keys(ANCHOR_OFFSETS) as Exclude<Anchor, "auto">[];

/**
 * Picks the anchor: a 3x3 grid for the nine fixed values, and a switch for
 * `auto`, which has no place on the grid because it is not a point.
 *
 * The cells stay live while `auto` is on, with none of them marked:
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
    const anchor = this.anchor ?? "auto";
    const isAuto = anchor === "auto";
    return html`
      <div class="row">
        <div class="half">
          <ha-formfield .label=${this.hass?.localize("ui.common.auto") || "Automatic"}>
            <ha-switch
              .checked=${isAuto}
              @change=${(ev: Event) =>
                this._emit((ev.target as HTMLInputElement).checked ? "auto" : "center")}
            ></ha-switch>
          </ha-formfield>
        </div>
        <hr class="sep" />
        <div class="half">
          <!-- The grid goes inside an ha-formfield for the same reason the
               switch does: it is the only way its label is styled identically,
               by construction rather than by copying values out of HA's CSS. -->
          <ha-formfield .label=${localizeOwn(this.hass, "anchor_anchored")}>
            <!-- The grid is always clickable — clicking a cell is how the user
                 leaves the automatic mode. The .fixed class is a visual state,
                 not a disabled one; do not add a disabled attribute to match. -->
            <div class=${isAuto ? "grid" : "grid fixed"}>
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
      /* The switch beside it draws its unchecked track with
         var(--ha-switch-border-color, var(--ha-color-border-neutral-normal)), so
         the frame borrows the same chain: a theme that restyles switch borders
         moves this one with it. --divider-color closes the chain because the
         neutral token is absent from the theme at our minimum Home Assistant
         version, where this then keeps exactly its previous appearance. */
      border: 1px solid
        var(--ha-switch-border-color, var(--ha-color-border-neutral-normal, var(--divider-color)));
      /* Concentric with the cells it frames: a corner offset by the padding
         keeps the same gap all the way round only if the outer radius grows
         by that padding too. */
      border-radius: calc(var(--cell-radius) + var(--grid-padding));
    }
    /* When a fixed anchor is chosen the frame mirrors the switch's checked
       state — the same token chain the switch uses for its checked track, so a
       theme that restyles the switch moves this one with it. --primary-color
       closes both chains because the --ha-color-* tokens are absent from the
       theme at our minimum Home Assistant version, where this then keeps exactly
       its previous appearance. */
    .grid.fixed {
      background-color: var(
        --ha-switch-checked-background-color,
        var(--ha-color-fill-primary-normal-resting, var(--primary-color))
      );
      border-color: var(
        --ha-switch-checked-border-color,
        var(--ha-color-border-primary-loud, var(--primary-color))
      );
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
    /* On the checked frame the default cell grey muddies into the fill, so the
       unpicked cells take what the switch fills its thumb with when it is off —
       the same control's own light grey, and it moves with any theme that
       restyles switches. --secondary-background-color closes the chain: it is
       what these cells used before the --ha-color-* tokens existed, so below our
       minimum Home Assistant version nothing changes.
       :not(.selected) rather than a second rule for the selected cell: the picked
       one keeps --primary-color in both states, and scoping the change to its
       siblings is what says so. */
    .grid.fixed .cell:not(.selected) {
      background: var(
        --ha-switch-thumb-background-color,
        var(--ha-color-on-neutral-normal, var(--secondary-background-color))
      );
      /* At full strength the grey and the primary of the picked cell read as two
         shades of the same thing. Letting the fill show through pushes the eight
         unpicked cells back a plane, so the picked one is the only solid mark —
         and it stays a translucency of the switch's own grey rather than a
         hand-mixed colour that would drift from it. */
      opacity: 0.35;
    }
  `;
}
