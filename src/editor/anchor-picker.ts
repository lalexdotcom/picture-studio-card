import { css, html, LitElement } from "lit";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

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
          <picture-studio-anchor-input
            .hass=${this.hass}
            .anchor=${this.anchor}
            .label=${localizeOwn(this.hass, "anchor_anchored")}
          ></picture-studio-anchor-input>
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
  `;
}
