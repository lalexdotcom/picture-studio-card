import { css, html, LitElement, nothing } from "lit";
import type { PictureItem } from "../config";
import type { HomeAssistant } from "../types";

/**
 * The editor's toolbar, docked between the card heading and the picture.
 *
 * Presentational on purpose: it receives a snapshot of the selected item and
 * emits events. The card owns the channel, exactly as it does for the drag and
 * the resize, so this element is testable without a broker.
 *
 * A snapshot is right here where it would be wrong in a tool: this renders on
 * every config change and never survives a gesture, so there is nothing to go
 * stale between a read and a write.
 */
export class PictureStudioToolbar extends LitElement {
  static properties = {
    hass: { attribute: false },
    item: { attribute: false },
    index: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare item?: PictureItem;
  declare index?: number;

  /** Tools apply to an image element and to nothing else, for now. */
  private get _hasTools(): boolean {
    const item = this.item;
    return item?.type === "element" && item.config.type === "image";
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: used by Tasks 3, 5, 8 when buttons get real logic
  private get _disabled(): boolean {
    return this.item === undefined || this.index === undefined || this.item.type === "unknown";
  }

  protected render() {
    return html`
      <div class="bar">
        <div class="anchor-group">${this._renderAnchorGroup()}</div>
        ${
          this._hasTools
            ? html`<hr class="sep" /><div class="tools">${this._renderTools()}</div>`
            : nothing
        }
      </div>
    `;
  }

  private _renderAnchorGroup() {
    return html`
      <button type="button" class="auto" ?disabled=${true}></button>
      <button type="button" class="anchored" ?disabled=${true}></button>
    `;
  }

  private _renderTools() {
    return html`<button type="button" class="keep-ratio" ?disabled=${true}></button>`;
  }

  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      /* --ha-space-1 is 4px on HA's 4px base scale; 4px vertical keeps the bar
         compact while still giving the buttons breathing room above and below.
         Horizontal padding borrows ha-card's own content padding so the bar
         aligns with whatever the heading and picture already use. */
      padding: var(--ha-space-1, 4px)
        var(--ha-card-content-padding, var(--card-content-padding, 16px));
      gap: var(--ha-space-2, 8px);
    }
    /* The separator is a full-height hairline ruled between the anchor group and
       the tools group. It uses the same token chain as the anchor-input grid
       border, so the two elements stay visually consistent across themes. */
    .sep {
      align-self: stretch;
      border: none;
      border-left: 1px solid
        var(--ha-switch-border-color, var(--ha-color-border-neutral-normal, var(--divider-color)));
      margin: 0;
    }
  `;
}
