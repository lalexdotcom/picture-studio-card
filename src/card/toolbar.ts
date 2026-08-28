import { css, html, LitElement, nothing } from "lit";
import { assertNever, type PictureItem } from "../config";
import { ratioIsForced } from "../image-box";
import { ANCHOR_OFFSETS, type Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";
import { DEFAULT_TOOL, type ToolId } from "./tools/tool";

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
    tool: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare item?: PictureItem;
  declare index?: number;
  declare tool?: ToolId;

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
        aria-pressed=${anchor === "auto"}
        ?disabled=${disabled}
        title=${localizeOwn(this.hass, "anchor_auto")}
        @click=${() => this._emitAnchor("auto")}
      >
        <ha-icon icon="mdi:auto-fix"></ha-icon>
      </button>
      <button
        type="button"
        class=${anchor !== undefined && anchor !== "auto" ? "anchored on" : "anchored"}
        aria-pressed=${anchor !== undefined && anchor !== "auto"}
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
    // Two things, not one row of three. The picker is a segmented control whose
    // members are alternatives — exactly one is active — while restoring the
    // ratio is an action that happens and is over. Soldering them into one group
    // would say they are the same kind of control.
    return html`
      <div class="tool-picker">
        <button
        type="button"
        class=${`tool resize${!this.tool || this.tool === "resize" ? " on" : ""}`}
        aria-pressed=${!this.tool || this.tool === "resize"}
        title=${localizeOwn(this.hass, "tool_resize")}
        @click=${() => this._emitTool("resize")}
      >
        <ha-icon icon="mdi:resize"></ha-icon>
      </button>
      <button
        type="button"
        class=${`tool distort${this.tool === "distort" ? " on" : ""}`}
        aria-pressed=${this.tool === "distort"}
        title=${localizeOwn(this.hass, "tool_distort")}
        @click=${() => this._emitTool("distort")}
      >
        <ha-icon icon="mdi:vector-square-edit"></ha-icon>
        </button>
      </div>
      ${this._renderSubTools()}
    `;
  }

  /**
   * The controls a tool owns, shown after a separator when that tool is active.
   *
   * Restoring the ratio is not a companion of the picker, it is a control *of*
   * the resize tool — it undoes what a corner drag wrote. Saying so in the
   * structure is what makes the rule general: a tool with no sub-tools shows
   * neither the separator nor anything after it, so the bar stays as short as
   * the current tool needs and no rule has to name the empty case.
   *
   * A switch rather than a lookup, on the `assertNever` precedent config.ts
   * already sets: the day a third tool lands, this fails to compile until
   * someone decides what it owns. A default branch would silently give it none.
   */
  private _renderSubTools() {
    const tool = this.tool ?? DEFAULT_TOOL;
    switch (tool) {
      case "resize":
        return html`
          <hr class="sep" />
          <div class="sub-tools">
            <button
              type="button"
              class="keep-ratio"
              ?disabled=${!this._canRestoreRatio}
              title=${localizeOwn(this.hass, "keep_ratio_restore")}
              @click=${this._emitRestore}
            >
              <ha-icon icon="mdi:lock-reset"></ha-icon>
            </button>
          </div>
        `;
      case "distort":
        return nothing;
    }
    return assertNever(tool, "tool");
  }

  private _emitTool(tool: ToolId): void {
    this.dispatchEvent(
      new CustomEvent("tool-changed", {
        detail: { tool },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * A stored height is what keep-ratio is not, so it is what there is to undo.
   * Under a forced ratio there is nothing to restore: the height is already
   * dormant, and the item is in keep-ratio whatever the config says.
   */
  private get _canRestoreRatio(): boolean {
    const item = this.item;
    if (item?.type !== "element" || item.config.type !== "image") return false;
    return "height" in item.config && !ratioIsForced(item.config);
  }

  private _emitRestore = (): void => {
    const index = this.index;
    if (index === undefined) return;
    this.dispatchEvent(
      new CustomEvent("keep-ratio-restore", {
        detail: { index },
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = css`
    :host {
      display: block;
    }
    /* The bar's height is derived, not declared twice.
       Every size below is one arithmetic chain from the icon:
         button = icon + 2×button-padding + 2×border
         bar    = button + 2×bar-padding
       Written as calc() rather than as a comment, because the previous version
       stated the algebra in prose and asked the next reader to preserve it by
       hand. A bar whose height is derived cannot drift from its buttons, and
       that is what stops the picture jumping vertically when a badge selection
       (anchor group alone) becomes an image selection (separator + tools) at
       the exact moment the user is aiming at something.
       At the defaults: 18 + 2 + 2 = 22px buttons, 22 + 8 = 30px bar.
       Touch target: far below HA's 48px guideline, deliberately. This is editor
       chrome in the dialog preview, where the gesture that matters is dragging
       on the picture; every pixel the bar takes is a pixel of subject lost.
       A tablet that needs more sets --psc-toolbar-icon-size. */
    .bar {
      display: flex;
      align-items: center;
      padding: var(--psc-toolbar-padding-block, 4px) var(--psc-toolbar-padding-inline, 10px);
      gap: var(--ha-space-2, 8px);
      min-height: calc(
        var(--psc-toolbar-icon-size, 18px) + 2 * var(--psc-toolbar-button-padding, 1px) + 2 *
          var(--psc-toolbar-border-width, 1px) + 2 * var(--psc-toolbar-padding-block, 4px)
      );
    }
    /* Buttons read as buttons: they borrow Home Assistant's badge surface — the
       card background over a hairline border — which is the same recipe a badge
       uses to stay legible on a photograph. Without it they were bare glyphs,
       and nothing said which one was active. */
    button {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: calc(
        var(--psc-toolbar-icon-size, 18px) + 2 * var(--psc-toolbar-button-padding, 1px) + 2 *
          var(--psc-toolbar-border-width, 1px)
      );
      height: calc(
        var(--psc-toolbar-icon-size, 18px) + 2 * var(--psc-toolbar-button-padding, 1px) + 2 *
          var(--psc-toolbar-border-width, 1px)
      );
      padding: var(--psc-toolbar-button-padding, 1px);
      border: var(--psc-toolbar-border-width, 1px) solid
        var(--ha-card-border-color, var(--ha-color-border-neutral-normal, var(--divider-color)));
      border-radius: var(--psc-toolbar-radius, 2px);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      cursor: pointer;
    }
    /* The groups are flex, and that is load-bearing rather than cosmetic: as
       block containers their buttons were inline-level, so they sat on a text
       baseline — misaligned against each other — and the newline between two
       button tags in the template rendered as a space, which pushed the
       segments apart and defeated the shared-hairline rule below. */
    .anchor-group,
    .tools,
    .tool-picker,
    .sub-tools {
      display: flex;
      align-items: center;
    }
    /* The tools row holds two things, not three: the picker, which is one
       segmented control, and the restore button, which is an action of its own.
       The gap is what says so. */
    .tools {
      gap: var(--ha-space-2, 8px);
    }
    /* Adjacent segments share one hairline instead of drawing two side by side. */
    .anchor-group button + button,
    .tool-picker button + button {
      margin-inline-start: calc(-1 * var(--psc-toolbar-border-width, 1px));
    }
    /* Every button is rounded; a segment then gives back the corners that face
       its neighbours, so a group is rounded only at its two ends and a button
       standing alone — the restore one — keeps all four. */
    .anchor-group button:not(:first-child),
    .tool-picker button:not(:first-child) {
      border-start-start-radius: 0;
      border-end-start-radius: 0;
    }
    .anchor-group button:not(:last-child),
    .tool-picker button:not(:last-child) {
      border-start-end-radius: 0;
      border-end-end-radius: 0;
    }
    /* The pressed state, which the bar had no way of showing before: the active
       segment takes the accent as its fill and inverts its content. It is
       lifted above its neighbours so the shared hairline does not cut across
       the coloured edge. */
    button.on {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
      position: relative;
      z-index: 1;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
    /* The box is pinned as well as the glyph. ha-icon sizes its own svg from
       --mdc-icon-size but keeps a 24px box of its own, so setting the variable
       alone left a 24px element inside an 18px content box — the icon drew
       off-centre and the button looked misaligned against the miniature, which
       is sized exactly. (No backticks in here: this is a css template literal,
       and one would end it.) */
    ha-icon {
      display: flex;
      width: var(--psc-toolbar-icon-size, 18px);
      height: var(--psc-toolbar-icon-size, 18px);
      --mdc-icon-size: var(--psc-toolbar-icon-size, 18px);
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
    /* The miniature is a 3×3 grid occupying exactly the box an icon would, so
       the two buttons of the anchor group are the same size whatever is in them.
       The cells are not given a size: three columns of 1fr with a 1px gap divide
       the icon's own box, so cell = (icon − 2) ÷ 3 — 5.33px at 18, 4.67px at 16 —
       and the sum is exact at any icon size without arithmetic of ours.
       Display-only: the nine spans visualise the current fixed anchor and carry
       no interaction; the button is the click target. */
    .mini {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      width: var(--psc-toolbar-icon-size, 18px);
      height: var(--psc-toolbar-icon-size, 18px);
      gap: 1px;
    }
    /* currentColor, so the miniature inverts with the button: on the accent fill
       the button's colour is already the contrasting one, and the lit cell stays
       legible without a second rule naming a second pair of colours. */
    .mini span {
      background: currentColor;
      opacity: 0.3;
      border-radius: 1px;
    }
    .mini span.on {
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
