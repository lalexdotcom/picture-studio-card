import { css, html, LitElement } from "lit";
import { ANCHOR_OFFSETS, type Anchor } from "../position";
import type { HomeAssistant } from "../types";

/** Row-major, so the grid reads the way it looks. */
const CELLS = Object.keys(ANCHOR_OFFSETS) as Exclude<Anchor, "auto">[];

/**
 * The nine fixed anchors as a 3x3 grid. Extracted from the form's picker so the
 * toolbar's modal can mount it without the switch, the separator and the label
 * that only make sense in a form row.
 *
 * `label` is optional because the two consumers differ on exactly that: the form
 * row needs HA's own label styling, which is what `ha-formfield` gives by
 * construction rather than by copying values out of HA's CSS; the modal is
 * opened by a button that already says what it is.
 */
export class PictureStudioAnchorInput extends LitElement {
  static properties = {
    hass: { attribute: false },
    anchor: { attribute: false },
    label: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare anchor?: Anchor;
  declare label?: string;

  private _emit(anchor: Anchor): void {
    this.dispatchEvent(
      new CustomEvent("anchor-changed", { detail: { anchor }, bubbles: true, composed: true }),
    );
  }

  protected render() {
    const anchor = this.anchor ?? "auto";
    // The grid is always clickable — clicking a cell is how the user leaves the
    // automatic mode. The .anchored class is a visual state, not a disabled one;
    // do not add a disabled attribute to match.
    const grid = html`
      <div class=${anchor === "auto" ? "grid" : "grid anchored"}>
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
    `;
    return this.label === undefined
      ? grid
      : html`<div class="labelled"><ha-formfield .label=${this.label}>${grid}</ha-formfield></div>`;
  }

  static styles = css`
    :host {
      display: block;
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
    /* ha-formfield only spaces the controls it knows about — its rule is
       ::slotted(ha-switch) { margin-inline-end: 10px }. Ours is a plain div in
       that slot, so it has to claim the same gap itself. Scoped to the labelled
       case: with no formfield around it there is nothing to sit beside. */
    .labelled .grid {
      margin-inline-end: 10px;
    }
    /* When a fixed anchor is chosen the frame mirrors the switch's checked
       state — the same token chain the switch uses for its checked track, so a
       theme that restyles the switch moves this one with it. --primary-color
       closes both chains because the --ha-color-* tokens are absent from the
       theme at our minimum Home Assistant version, where this then keeps exactly
       its previous appearance. */
    .grid.anchored {
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
    .grid.anchored .cell:not(.selected) {
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
