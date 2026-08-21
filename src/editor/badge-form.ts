import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { BadgeConfig, HomeAssistant, VisibilityCondition } from "../types";
import { badgeCatalog, CUSTOM_PREFIX, choiceLabel, resolveBadgeClass } from "./badge-catalog";
import { badgeVerdict } from "./badge-existence";
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

  protected updated(changed: PropertyValues): void {
    // `hass` is republished on every state change in the house, and this ran
    // unconditionally — so the badge's own editor took a setConfig per tick.
    // Only a badge change is a reason to push the config back down; the freshly
    // built case is handled inside, where it is known.
    void this._syncEditor(changed.has("badge"));
  }

  private async _syncEditor(badgeChanged: boolean): Promise<void> {
    const badge = this.badge;
    const host = this.renderRoot.querySelector(".form");
    if (!badge?.type || !host) return;

    // A newly mounted editor has never been given a config, so it needs one
    // whether or not `badge` is what changed this pass.
    let built = false;

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
      built = true;
    }

    if (!this._editor) return;
    if (this.hass) this._editor.hass = this.hass;
    if (built || badgeChanged) this._editor.setConfig(badge);
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
    if (!this.badge || !this.hass) return nothing;
    const _type = this.badge.type ?? "";
    const _found = badgeCatalog(window.customBadges).find((c) => c.type === _type);
    const _title =
      choiceLabel(
        this.hass.localize,
        _found ?? { type: _type, isCustom: _type.startsWith(CUSTOM_PREFIX) },
      ) || "badge";
    return html`
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          @click=${() =>
            this.dispatchEvent(new CustomEvent("go-back", { bubbles: true, composed: true }))}
          ><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <span class="title">${_title}</span>
      </div>
      <div class="form"></div>
      ${
        this._editorType && !this._editor
          ? badgeVerdict(_type) === "missing"
            ? html`<p class="fallback">${localizeOwn(this.hass, "badge_type_unavailable")}</p>`
            : html`<p class="fallback">
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
      /* var(--ha-space-2), not -1: the scale's step 2 is the 8px this rule was
         written with, and the file's neighbours already say so with the same
         fallback. Same pixels as before, themeable now. */
      gap: var(--ha-space-2, 8px);
    }
    .title {
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .fallback {
      color: var(--secondary-text-color);
    }
    /* Mirrors ha-form-expandable: the panel's own content padding is zeroed and
       the section supplies its own, so our sections sit exactly like Home
       Assistant's own expandable sections. */
    ha-expansion-panel {
      display: block;
      /* 24px, the spacing ha-form puts between its own root children. Every
         section of an item form — the badge's own fields, Position, Visibility —
         is separated by the same gap, so the column reads as one rhythm rather
         than as our sections tacked onto Home Assistant's. */
      margin-top: var(--ha-space-6, 24px);
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
      margin-top: var(--ha-space-6, 24px);
    }
  `;
}
