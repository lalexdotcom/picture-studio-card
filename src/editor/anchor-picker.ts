import { css, html, LitElement } from "lit";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

/**
 * The form row that pairs the `auto` switch with the anchor input. Turning the
 * switch off leaves the user on `center`; clicking a cell in the input selects a
 * specific point and implicitly exits `auto`.
 *
 * The two halves sit side-by-side rather than stacked because both controls are
 * compact enough that the row reads at a glance — the switch says "is this
 * automatic?" and the grid says "if not, where?".
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
