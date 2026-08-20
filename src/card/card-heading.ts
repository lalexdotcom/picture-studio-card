import { css, html, LitElement, nothing } from "lit";
import type { HeadingConfig } from "../config";
import type { HomeAssistant } from "../types";

/**
 * Home Assistant's heading badge. Defined by the Lovelace panel's own chunk
 * group — `app.*.js` requests chunk 79381 in the same Promise.all as the panel —
 * so it is available before our card runs, through this static chain:
 * custom-card-helpers → create-card-element (`heading` is ALWAYS_LOADED and
 * statically imported) → hui-heading-card → hui-heading-badge. Guarded anyway:
 * an undefined custom element renders nothing at all, silently.
 */
const HEADING_BADGE = "hui-heading-badge";

/**
 * The card's header: title and icon on the left, heading badges on the right.
 *
 * The layout is copied from `hui-heading-card`'s `static styles`, reconciled
 * against frontend build 20260729.6 and identical at our 20260527.4 floor.
 * Upstream: src/panels/lovelace/cards/hui-heading-card.ts. What is copied is the
 * horizontal split — a title box that yields to the badges rather than pushing
 * them off — and nothing else: we carry no tap action, so their `[role=button]`,
 * `ha-icon-next` and hover transform are gone, and the drag-to-scroll and
 * overflow mask are deliberately not taken (see the spec). If upstream changes
 * its flex figures ours will simply keep the old behaviour; nothing breaks.
 *
 * The padding is `ha-card`'s `.card-header`, not the heading card's `0 4px`:
 * this header replaces the title in the card's own chrome, where the heading
 * card *is* the card.
 */
export class PictureStudioHeading extends LitElement {
  static properties = {
    hass: { attribute: false },
    heading: { attribute: false },
    preview: { type: Boolean },
  };

  declare hass?: HomeAssistant;
  declare heading?: HeadingConfig;
  declare preview: boolean;

  constructor() {
    super();
    this.preview = false;
  }

  protected render() {
    const heading = this.heading;
    if (!heading) return nothing;
    const badges = heading.badges?.length ? heading.badges : undefined;
    const available = !!customElements.get(HEADING_BADGE);

    return html`
      <div class="container">
        <div class="content">
          ${heading.icon ? html`<ha-icon .icon=${heading.icon}></ha-icon>` : nothing}
          ${heading.title ? html`<p>${heading.title}</p>` : nothing}
        </div>
        ${
          badges && available
            ? html`
                <div class="badges">
                  <div class="badges-row">
                    ${badges.map(
                      (config) => html`
                        <hui-heading-badge
                          .config=${config}
                          .hass=${this.hass}
                          .preview=${this.preview}
                        ></hui-heading-badge>
                      `,
                    )}
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .container {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      flex-wrap: nowrap;
      align-items: center;
      overflow: visible;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-4);
    }
    /* The title yields to the badges rather than pushing them off: it is
       max-content while alone, and a shrinkable 150px floor once it has a
       neighbour. This pair is the whole reason the block is copied. */
    .content {
      flex: 0 1 max-content;
      min-width: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--psc-heading-title-color, var(--primary-text-color));
      font-size: var(--psc-heading-title-font-size, var(--ha-font-size-xl));
      font-weight: var(--psc-heading-title-font-weight, var(--ha-font-weight-normal));
      line-height: var(--psc-heading-title-line-height, var(--ha-line-height-normal));
      letter-spacing: 0.1px;
      --mdc-icon-size: 22px;
    }
    .content:not(:only-child) {
      flex: 1 0 var(--psc-heading-title-min-width, 150px);
      max-width: max-content;
      min-width: 0;
    }
    .content ha-icon {
      display: flex;
      flex: none;
    }
    .content p {
      margin: 0;
      font-style: normal;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
      min-width: 0;
    }
    .badges {
      position: relative;
      display: flex;
      flex: 0 1 auto;
      min-width: 0;
      overflow: auto;
      max-width: 100%;
      scrollbar-width: none;
    }
    .badges-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      flex-wrap: nowrap;
      justify-content: flex-start;
      gap: var(--ha-space-2);
      margin: 0;
    }
    .badges-row > * {
      min-width: fit-content;
    }
  `;
}
