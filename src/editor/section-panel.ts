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
