import { css, html, LitElement } from "lit";

/**
 * The one panel shape every section of the editor uses.
 *
 * Home Assistant's `ha-form` can draw expandables of its own, and we do not use
 * them: two sections hold components rather than fields, one needs a custom
 * header for its count, and an `ha-form` renders its schema as a single
 * contiguous block, so an item list could never sit inside one. Drawing all five
 * ourselves makes them identical by construction rather than by matching
 * `ha-form-expandable`'s padding and `.content` wrapper by eye.
 *
 * The adornment goes to `event`, never to `icons`: `ha-expansion-panel` renders
 * its header as leading-icon → header → event → chevron → icons, so `icons`
 * lands *after* the chevron.
 */
export class PictureStudioSection extends LitElement {
  static properties = {
    label: { type: String },
    icon: { type: String },
    open: { type: Boolean },
  };

  declare label: string;
  declare icon: string;
  declare open: boolean;

  constructor() {
    super();
    this.label = "";
    this.icon = "";
    this.open = false;
  }

  /**
   * Open this section from code.
   *
   * Deliberately NOT done by driving the `open` property: `ha-expansion-panel`
   * owns its own `expanded`, and a header click sets it internally. Going through
   * the Lit binding, a force-open stops being idempotent — with `open` already
   * true and the panel folded by hand, Lit writes nothing and the section stays
   * shut. Setting `expanded` on the panel directly always lands.
   *
   * This path does not animate: the transition lives in Home Assistant's click
   * handler, which measures `scrollHeight` and sets an explicit pixel height,
   * because CSS cannot interpolate `height: 0px` to `height: auto`. The section
   * snaps open — accepted, and it means a scroll that follows is not aiming at a
   * growing target.
   */
  public async expand(): Promise<boolean> {
    const panel = this.shadowRoot?.querySelector("ha-expansion-panel") as
      | (HTMLElement & { expanded?: boolean; updateComplete?: Promise<unknown> })
      | null;
    // Reading whether the panel is already open rather than mirroring the
    // section's open state in the editor: a mirror can be wrong the moment the
    // user folds a panel by hand, and the failure only shows up later.
    // Lit's ?expanded binding sets the attribute; HA's own click handler folds
    // by setting the property. Both must be checked.
    if (!panel || panel.hasAttribute("expanded") || panel.expanded) return false;
    panel.expanded = true;
    if (panel.updateComplete instanceof Promise) await panel.updateComplete;
    return true;
  }

  protected render() {
    return html`
      <ha-expansion-panel outlined ?expanded=${this.open}>
        <ha-icon slot="leading-icon" .icon=${this.icon}></ha-icon>
        <div slot="header" role="heading" aria-level="3">${this.label}</div>
        <slot name="event" slot="event"></slot>
        <div class="content"><slot></slot></div>
      </ha-expansion-panel>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    /* ha-expansion-panel's default content padding is "var(--expansion-panel-content-padding, 0 8px)"
       — 8px horizontal, zero vertical. HA's own ha-form-expandable does the same two things we do
       here: it sets the variable to 0 and pads its own .content instead. Do not remove either. */
    ha-expansion-panel {
      --expansion-panel-content-padding: 0;
      border-radius: var(--ha-border-radius-md);
      /* Their .container transitions height, but a programmatic open goes from 0px
         to auto and auto cannot be interpolated — which is why their own click
         handler measures scrollHeight and sets an explicit pixel height instead.
         interpolate-size is an INHERITED property, so setting it on the panel
         reaches the container inside its shadow tree and makes their transition work
         for us too, without touching their internals. Where a browser does not know
         the property the declaration is dropped and the section snaps, exactly as it
         did before. */
      interpolate-size: allow-keywords;
    }
    /* ha-form spaces its own root children by 24px; a section's body carries the
       same rhythm so a panel of fields and a panel of components read alike. */
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-6);
      padding: var(--ha-space-3);
    }
  `;
}
