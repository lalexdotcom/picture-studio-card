import { css, html, LitElement, nothing } from "lit";
import type { PictureItem } from "../config";
import { ANCHOR_OFFSETS, type Anchor } from "../position";
import { localizeOwn } from "../strings";
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
      <dialog
        @click=${this._backdropClick}
        @anchor-changed=${this._closePicker}
      >
        <picture-studio-anchor-input
          .hass=${this.hass}
          .anchor=${this.item?.type === "unknown" ? undefined : this.item?.anchor}
        ></picture-studio-anchor-input>
      </dialog>
    `;
  }

  private _renderAnchorGroup() {
    const anchor = this.item?.type === "unknown" ? undefined : this.item?.anchor;
    const disabled = this._disabled;
    // ANCHOR_OFFSETS is the single declaration of the nine valid fixed points and
    // their row-major order. Reading the keys here keeps the miniature in lockstep
    // with the anchor-input's grid without importing anything from the editor layer.
    const cells = Object.keys(ANCHOR_OFFSETS) as Array<Exclude<Anchor, "auto">>;
    return html`
      <button
        type="button"
        class=${anchor === "auto" ? "auto on" : "auto"}
        ?disabled=${disabled}
        title=${localizeOwn(this.hass, "anchor_auto")}
        @click=${() => this._emitAnchor("auto")}
      >
        <ha-icon icon="mdi:auto-fix"></ha-icon>
      </button>
      <button
        type="button"
        class=${anchor !== undefined && anchor !== "auto" ? "anchored on" : "anchored"}
        ?disabled=${disabled}
        title=${localizeOwn(this.hass, "anchor_anchored")}
        @click=${this._openPicker}
      >
        <span class="mini">
          ${cells.map(
            (cell) => html`<span class=${cell === anchor ? "on" : ""} data-cell=${cell}></span>`,
          )}
        </span>
      </button>
    `;
  }

  /** Emits the anchor-changed event. Deliberately the same event the
   *  anchor-input emits so the card can wire a single listener for both. */
  private _emitAnchor(anchor: Anchor) {
    this.dispatchEvent(
      new CustomEvent("anchor-changed", {
        detail: { anchor },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Placeholder — Task 4 will open the anchor picker popover. */
  /**
   * A modal <dialog>, not a popover.
   *
   * The requirement is that a click outside dismisses the picker and reaches
   * nothing. The native popover light-dismiss does not do that: the outside
   * pointerdown closes it AND still lands on what is beneath. showModal() gives
   * the whole requirement — the editor behind is inert, ::backdrop swallows the
   * click, and Escape closes.
   *
   * It is in the top layer, so it is above Home Assistant's own dialog and is
   * never clipped by ha-card's overflow — the same constraint that refused a
   * floating toolbar.
   */
  private _openPicker = (ev: Event): void => {
    const dialog = this.renderRoot.querySelector("dialog");
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    // Placed against the button rather than centred, which is what a modal
    // dialog does by default. Read before showModal(): the call is what makes
    // the dialog take layout, and the button's rect does not move.
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${rect.left}px`;
    dialog.showModal();
  };

  private _backdropClick = (ev: MouseEvent): void => {
    if (ev.target === ev.currentTarget) {
      (ev.currentTarget as HTMLDialogElement).close();
    }
  };

  private _closePicker = (ev: Event): void => {
    (ev.currentTarget as HTMLDialogElement).close();
    // Do not stopPropagation — the anchor-changed event must reach the card listener.
  };

  private _renderTools() {
    return html`<button type="button" class="keep-ratio" ?disabled=${this._disabled}></button>`;
  }

  static styles = css`
    :host {
      display: block;
    }
    /* --psc-toolbar-height is provisional — it will be measured against real
       button content in a browser in Task 10. What matters here is that the bar
       declares its own height rather than deriving it from whichever group
       happens to be tallest at render time: a badge selection (anchor group
       only) and an image selection (anchor group + tools) would otherwise
       produce different heights, shifting the picture vertically at the exact
       moment the user is aiming at something. --ha-space-8 is 32px on HA's 4px
       base scale; 32px comfortably clears the buttons that Tasks 3, 5 and 8
       will fill in. */
    .bar {
      display: flex;
      align-items: center;
      min-height: var(--psc-toolbar-height, var(--ha-space-8, 32px));
      /* --ha-space-1 is 4px on HA's 4px base scale; 4px vertical keeps the bar
         compact while still giving the buttons breathing room above and below.
         Horizontal padding borrows ha-card's own content padding so the bar
         aligns with whatever the heading and picture already use. */
      padding: var(--ha-space-1, 4px)
        var(--ha-card-content-padding, var(--card-content-padding, 16px));
      gap: var(--ha-space-2, 8px);
    }
    /* Fixed box for every button, so a taller glyph added by a later task
       cannot outgrow its sibling group and break the bar's declared height.
       --psc-toolbar-button-size matches --psc-toolbar-height minus the vertical
       padding so the buttons sit flush without overflow. */
    button {
      box-sizing: border-box;
      width: var(--psc-toolbar-button-size, var(--ha-space-6, 24px));
      height: var(--psc-toolbar-button-size, var(--ha-space-6, 24px));
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
    button:disabled {
      cursor: not-allowed;
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
    /* The miniature is a 3×3 grid that must fit inside the button's declared box.
       It is display-only: the nine spans visualise the current fixed anchor point
       but carry no interaction of their own — the button is the click target. */
    .mini {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      width: 100%;
      height: 100%;
      gap: 1px;
    }
    .mini span {
      background: var(--ha-color-text-disabled, var(--disabled-text-color, currentColor));
      opacity: 0.3;
      border-radius: 1px;
    }
    .mini span.on {
      background: var(--primary-color);
      opacity: 1;
    }
    /* position: fixed keeps the dialog against the button regardless of scroll;
       margin: 0 overrides the browser's auto-centering that modal dialogs get
       by default — we position it ourselves in _openPicker. */
    dialog {
      position: fixed;
      margin: 0;
      padding: var(--ha-space-2, 8px);
      border: 1px solid
        var(--ha-switch-border-color, var(--ha-color-border-neutral-normal, var(--divider-color)));
      border-radius: var(--ha-card-border-radius, 4px);
      background: var(--card-background-color, var(--primary-background-color));
      color: var(--primary-text-color);
    }
    /* Transparent backdrop: the modality (inert editor, Escape key) is what is
       wanted, not a visual dimming that would read as a second dialog. */
    dialog::backdrop {
      background: transparent;
    }
  `;
}
