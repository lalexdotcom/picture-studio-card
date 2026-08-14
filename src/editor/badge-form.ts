import { css, html, LitElement, nothing } from "lit";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { BadgeConfig, HomeAssistant, VisibilityCondition } from "../types";
import { resolveBadgeClass } from "./badge-catalog";
import { PLACEMENT_ICON } from "./icons";
import "./visibility-section";

type BadgeEditorElement = HTMLElement & {
  hass?: HomeAssistant;
  setConfig(config: BadgeConfig): void;
};

/**
 * Hosts the badge's own native config form, obtained from the badge class via
 * getConfigElement(). Home Assistant's badge dialogs are unreachable from a
 * custom card (see the task header), so the form lives here instead, in place
 * of the list, with a back button — the shape hui-sub-element-editor uses.
 *
 * The anchor picker sits below that form and outside it: the anchor is our
 * wrapper's key, not the badge's, and a badge's config is opaque to us.
 */
export class PictureStudioBadgeForm extends LitElement {
  static properties = {
    hass: { attribute: false },
    badge: { attribute: false },
    anchor: { attribute: false },
    visibility: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare badge?: BadgeConfig;
  declare anchor?: Anchor;
  declare visibility?: VisibilityCondition[];

  private _editor?: BadgeEditorElement;
  /** The type the mounted editor was built for; a type change needs a new one. */
  private _editorType?: string;
  /** Monotonic counter; incremented on each rebuild so that stale async
   * resumptions — including an A→B→A sequence where two "A" invocations both
   * pass a type-string comparison — are detected and discarded. */
  private _editorGen = 0;

  protected updated(): void {
    void this._syncEditor();
  }

  private async _syncEditor(): Promise<void> {
    const badge = this.badge;
    const host = this.renderRoot.querySelector(".form");
    if (!badge?.type || !host) return;

    if (this._editorType !== badge.type) {
      host.replaceChildren();
      this._editor = undefined;
      this._editorType = badge.type;

      // Increment the generation counter at the start of the async rebuild.
      // Capturing it locally and comparing after each await closes the A→B→A
      // race: two "A" invocations both pass a type-string comparison, but only
      // the second one sees the current generation value — the first bails out.
      const gen = ++this._editorGen;

      const cls = await resolveBadgeClass(badge.type);
      if (this._editorGen !== gen) return; // stale

      if (!cls?.getConfigElement) {
        // _editorType is a plain private field (non-reactive), so the assignment
        // above did not schedule a render. Request one now so the fallback
        // message becomes visible. The second pass sees _editorType === badge.type
        // and exits before any await, so there is no loop.
        this.requestUpdate();
        return;
      }

      const editor = (await cls.getConfigElement()) as BadgeEditorElement;
      if (this._editorGen !== gen) return; // stale

      editor.addEventListener("config-changed", this._onChange);
      this._editor = editor;
      host.append(editor);
    }

    if (!this._editor) return;
    if (this.hass) this._editor.hass = this.hass;
    this._editor.setConfig(badge);
  }

  private _onChange = (ev: Event): void => {
    ev.stopPropagation();
    const config = (ev as CustomEvent<{ config: BadgeConfig }>).detail?.config;
    if (!config) return;
    this.dispatchEvent(
      new CustomEvent("badge-changed", {
        detail: { badge: config },
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected render() {
    if (!this.badge) return nothing;
    return html`
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          @click=${() =>
            this.dispatchEvent(new CustomEvent("go-back", { bubbles: true, composed: true }))}
          ><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <span class="title">${this.badge.type}</span>
      </div>
      <div class="form"></div>
      ${
        this._editorType && !this._editor
          ? html`<p class="fallback">
            This badge does not provide a visual editor. Edit it in the YAML tab.
          </p>`
          : nothing
      }
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" .icon=${PLACEMENT_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(this.hass, "anchor")}
        </div>
        <div class="content">
          <picture-studio-anchor-picker
            .hass=${this.hass}
            .anchor=${this.anchor}
          ></picture-studio-anchor-picker>
        </div>
      </ha-expansion-panel>
      <picture-studio-visibility-section
        .hass=${this.hass}
        .visibility=${this.visibility}
      ></picture-studio-visibility-section>
    `;
  }

  static styles = css`
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .title {
      font-weight: 500;
    }
    .fallback {
      color: var(--secondary-text-color);
    }
    /* Mirrors ha-form-expandable: the panel's own content padding is zeroed and
       the section supplies its own, so our sections sit exactly like Home
       Assistant's own expandable sections. */
    ha-expansion-panel {
      display: block;
      margin-top: var(--ha-space-3, 12px);
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
    picture-studio-visibility-section {
      display: block;
      margin-top: var(--ha-space-3, 12px);
    }
  `;
}
