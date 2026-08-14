import { css, html, LitElement, nothing } from "lit";
import { localizeOwn } from "../strings";
import type { HomeAssistant, VisibilityCondition } from "../types";

/** Home Assistant's whole visibility tab: the status banner and the list. */
const HA_EDITOR = "hui-card-visibility-editor";

const VISIBILITY_ICON = "mdi:eye";

/**
 * The "Visibility" section both item forms carry.
 *
 * It hosts Home Assistant's own editor rather than the conditions list alone,
 * which buys two things we would otherwise build or do without:
 * `ha-visibility-status`, the live verdict banner at the top of the section, and
 * the context provider the entity-less condition sub-editors consume.
 *
 * The count in the header answers "does this item have conditions" without
 * expanding. The verdict — visible, hidden, invalid — is the banner's job.
 */
export class PictureStudioVisibilitySection extends LitElement {
  static properties = {
    hass: { attribute: false },
    visibility: { attribute: false },
    _available: { state: true },
  };

  declare hass?: HomeAssistant;
  declare visibility?: VisibilityCondition[];
  declare _available: boolean;

  /**
   * `hass` is reassigned on every state change, so this component re-renders on
   * every tick. A fresh config object each time would look like a change to
   * Home Assistant's editor and push a new config into it per tick; caching it
   * against the list keeps the identity stable. Same idiom as the schema cache
   * in the editor hub.
   */
  private _configCache?: {
    visibility?: VisibilityCondition[];
    config: { visibility: VisibilityCondition[] };
  };

  constructor() {
    super();
    this._available = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Lazily, never at module load: a chunk that registers the element after
    // ours is still found. An undefined custom element renders nothing at all,
    // silently, so the fallback below is the difference between an explanation
    // and an empty section.
    this._available = !!customElements.get(HA_EDITOR);
    if (!this._available) {
      void customElements.whenDefined(HA_EDITOR).then(() => {
        this._available = true;
      });
    }
  }

  /** Stable while the list is unchanged. Public for the test. */
  editorConfig(): { visibility: VisibilityCondition[] } {
    if (!this._configCache || this._configCache.visibility !== this.visibility) {
      this._configCache = {
        visibility: this.visibility,
        config: { visibility: this.visibility ?? [] },
      };
    }
    return this._configCache.config;
  }

  /**
   * Home Assistant hands back the whole config it was given, with `visibility`
   * deleted when the list falls back to zero — so an absent key here means "no
   * conditions", not "unchanged", and it is relayed as such.
   *
   * Public for the test: the event comes from a component that does not exist
   * in the suite, so there is nothing to dispatch it from.
   */
  handleValueChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = (ev.detail as { value?: { visibility?: VisibilityCondition[] } } | undefined)
      ?.value;
    const visibility = value?.visibility;
    this.dispatchEvent(
      new CustomEvent("visibility-changed", {
        detail: { visibility: visibility?.length ? visibility : undefined },
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected render() {
    const hass = this.hass;
    if (!hass) return nothing;

    const count = this.visibility?.length ?? 0;
    const title =
      hass.localize("ui.panel.lovelace.editor.edit_card.tab_visibility") ||
      localizeOwn(hass, "visibility");

    return html`
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" .icon=${VISIBILITY_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">${title}</div>
        ${
          // The `event` slot, not `icons`: ha-expansion-panel renders its header
          // as leading-icon → header → event → chevron → icons, so anything in
          // `icons` lands after the chevron. The count belongs beside the title.
          count > 0 ? html`<ha-label slot="event" dense>${count}</ha-label>` : nothing
        }
        <div class="content">
          ${
            this._available
              ? html`<hui-card-visibility-editor
                  .hass=${hass}
                  .config=${this.editorConfig()}
                  @value-changed=${this.handleValueChanged}
                ></hui-card-visibility-editor>`
              : html`<p class="fallback">
                  This Home Assistant version does not expose the visibility editor here.
                  Edit the item's conditions in the YAML tab.
                </p>`
          }
        </div>
      </ha-expansion-panel>
    `;
  }

  static styles = css`
    /* Mirrors the placement sections of both forms: the panel's own content
       padding is zeroed and the section supplies its own, so every section of
       an item form sits exactly like Home Assistant's own expandable ones. */
    ha-expansion-panel {
      display: block;
      --expansion-panel-content-padding: 0;
      border-radius: var(--ha-border-radius-md);
      --ha-card-border-radius: var(--ha-border-radius-md);
    }
    .content {
      padding: 12px;
    }
    ha-icon[slot="leading-icon"] {
      color: var(--secondary-text-color);
    }
    .fallback {
      color: var(--secondary-text-color);
      margin: 0;
    }
    /* The count sits against the title rather than floating away from it, and
       leaves the chevron its own space. */
    ha-label[slot="event"] {
      margin-inline-start: var(--ha-space-2, 8px);
    }
  `;
}
