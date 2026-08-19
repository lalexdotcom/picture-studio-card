import { css, html, LitElement, nothing } from "lit";
import type { StringKey } from "../strings";
import { localizeOwn } from "../strings";
import type { HomeAssistant, VisibilityCondition } from "../types";

/** Home Assistant's whole visibility tab: the status banner and the list. */
const HA_EDITOR = "hui-card-visibility-editor";
/** The oracle element that evaluates conditions and exposes the verdict. */
const HA_STATUS = "ha-visibility-status";

const VISIBILITY_ICON = "mdi:eye";

type OracleState = "visible" | "hidden" | "invalid";

/** Wraps the elements we create from HA_STATUS with its known public surface. */
interface OracleEl extends HTMLElement {
  hass: HomeAssistant;
  conditions: VisibilityCondition[];
  readonly state: OracleState;
  readonly updateComplete: Promise<boolean>;
}

/** Mirrors ha-visibility-status' state → icon mapping exactly. */
const VERDICT_ICONS: Record<OracleState, string> = {
  visible: "mdi:eye",
  hidden: "mdi:eye-off",
  invalid: "mdi:alert-circle",
};

/** Same three states mapped to HA's semantic colour tokens. */
const VERDICT_COLORS: Record<OracleState, string> = {
  visible: "var(--success-color)",
  hidden: "var(--warning-color)",
  invalid: "var(--error-color)",
};

/** Localisation keys for the hover title on the status icon. */
const VERDICT_KEYS: Record<OracleState, StringKey> = {
  visible: "visibility_visible",
  hidden: "visibility_hidden",
  invalid: "visibility_invalid",
};

/** The conditions, or undefined when the key holds something that is not a list.
    `.length` on a string is a character count, not a condition count. */
const conditionsOf = (value: unknown): VisibilityCondition[] | undefined =>
  Array.isArray(value) ? (value as VisibilityCondition[]) : undefined;

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
    _oracleState: { state: true },
  };

  declare hass?: HomeAssistant;
  declare visibility?: unknown;
  declare _available: boolean;
  declare _oracleState: OracleState | undefined;

  /**
   * `hass` is reassigned on every state change, so this component re-renders on
   * every tick. A fresh config object each time would look like a change to
   * Home Assistant's editor and push a new config into it per tick; caching it
   * against the list keeps the identity stable. Same idiom as the schema cache
   * in the editor hub.
   */
  private _configCache?: {
    visibility?: unknown;
    config: { visibility: VisibilityCondition[] };
  };

  /** The hidden oracle element, kept alive so its ConditionListenersController
   *  re-evaluates when referenced entities change. */
  private _oracle?: OracleEl;

  constructor() {
    super();
    this._available = false;
    this._oracleState = undefined;
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
        config: { visibility: conditionsOf(this.visibility) ?? [] },
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

  /**
   * Manages the hidden oracle element that evaluates visibility conditions.
   * The oracle is created lazily — only when there are conditions and the
   * ha-visibility-status element is available. It stays mounted so its
   * ConditionListenersController re-evaluates when referenced entities change;
   * we re-read its state on every update and re-render if it changed.
   */
  protected updated(): void {
    if (!customElements.get(HA_STATUS)) return;

    const conditions = conditionsOf(this.visibility);
    const count = conditions?.length ?? 0;

    if (count === 0) {
      // Idle the oracle when conditions are cleared: setup([]) in
      // ConditionListenersController clears every subscription and returns
      // early, so handing the oracle an empty list is the designed release
      // path — not a workaround. Reset _oracleState so no stale verdict
      // leaks into the next set of conditions.
      if (this._oracle) {
        this._oracle.conditions = [];
        if (this._oracleState !== undefined) this._oracleState = undefined;
      }
      return;
    }

    if (!this.hass) return;

    if (!this._oracle) {
      const el = document.createElement(HA_STATUS) as OracleEl;
      // Hidden: purely an oracle — never shown to the user.
      el.style.display = "none";
      this.renderRoot.append(el);
      this._oracle = el;
    }

    const oracle = this._oracle;
    oracle.hass = this.hass;
    oracle.conditions = conditions ?? [];

    void oracle.updateComplete.then(() => {
      const s = oracle.state;
      if (s !== this._oracleState) {
        this._oracleState = s;
      }
    });
  }

  protected render() {
    const hass = this.hass;
    if (!hass) return nothing;

    const conditions = conditionsOf(this.visibility);
    const malformed = this.visibility !== undefined && conditions === undefined;
    const count = conditions?.length ?? 0;
    const title =
      hass.localize("ui.panel.lovelace.editor.edit_card.tab_visibility") ||
      localizeOwn(hass, "visibility");

    const statusAvailable = !!customElements.get(HA_STATUS);

    return html`
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" .icon=${VISIBILITY_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">${title}</div>
        ${
          // The `event` slot, not `icons`: ha-expansion-panel renders its header
          // as leading-icon → header → event → chevron → icons, so anything in
          // `icons` lands after the chevron. The count belongs beside the title.
          // The status icon follows the count pill in the same slot so the two
          // read as a unit: "3 conditions, currently hidden".
          malformed
            ? html`
                <ha-icon
                  slot="event"
                  class="warning-icon"
                  icon="mdi:alert-outline"
                  title=${localizeOwn(hass, "visibility_unreadable")}
                ></ha-icon>
                <!-- Rendered, not measured: no condition applies, so the item is
                     visible. The oracle would be the wrong instrument — updated()
                     treats an empty list as its release path, and setup() returns
                     early on one. This also renders where ha-visibility-status is
                     absent, which the oracle route cannot. -->
                <ha-icon
                  slot="event"
                  class="status-icon"
                  icon=${VERDICT_ICONS.visible}
                  style="color: ${VERDICT_COLORS.visible}"
                  title=${localizeOwn(hass, VERDICT_KEYS.visible)}
                ></ha-icon>
              `
            : count > 0
              ? html`
                  <ha-label slot="event" dense>${count}</ha-label>
                  ${
                    statusAvailable && this._oracleState
                      ? html`<ha-icon
                        slot="event"
                        class="status-icon"
                        .icon=${VERDICT_ICONS[this._oracleState]}
                        style="color: ${VERDICT_COLORS[this._oracleState]}"
                        title=${localizeOwn(hass, VERDICT_KEYS[this._oracleState])}
                      ></ha-icon>`
                      : nothing
                  }
                `
              : nothing
        }
        <div class="content">
          ${
            malformed
              ? this._renderMalformed(hass)
              : this._available
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

  /**
   * The alert replaces Home Assistant's editor rather than sitting above it. One
   * decision, made explicitly, and then the section is ordinary again — an empty
   * editor ready for conditions.
   */
  private _renderMalformed(hass: HomeAssistant) {
    const body = localizeOwn(hass, "visibility_unreadable_body");
    const reset = localizeOwn(hass, "visibility_reset");
    const onReset = () => {
      // The existing path: an empty list, which storedConfig already turns into
      // an absent key. No dedicated removal to write.
      this.dispatchEvent(
        new CustomEvent("visibility-changed", {
          detail: { visibility: undefined },
          bubbles: true,
          composed: true,
        }),
      );
    };
    // Guarded like every other borrowed component: an undefined custom element
    // renders nothing at all, silently, and here that is the whole warning.
    if (!customElements.get("ha-alert")) {
      return html`<p class="warning">
        ${body}
        <button type="button" @click=${onReset}>${reset}</button>
      </p>`;
    }
    // No title: ha-alert centres its icon only when there is no title; without
    // one the icon stays top-aligned via its own shadow DOM's .icon.no-title rule,
    // so dropping the title is the only clean route to a centred icon. It also
    // removes a title that restated the body.
    return html`<ha-alert alert-type="warning">
      ${body}
      <ha-button size="s" slot="action" variant="warning" appearance="filled" @click=${onReset}
        >${reset}</ha-button
      >
    </ha-alert>`;
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
    /* Bare icon — no background, no border-radius, no padding — matching the
       .empty marker in the item list. 16px rather than the list's 14px: the
       pill gives the eye its body; a bare glyph has only its stroke. Color is
       set inline per verdict so the theme's own tokens carry through. */
    .status-icon {
      display: flex;
      flex: none;
      --mdc-icon-size: 16px;
      margin-inline-start: var(--ha-space-3, 12px);
    }
    .warning-icon {
      color: var(--warning-color);
      --mdc-icon-size: 16px;
    }
    /* The ha-alert fallback, never seen on a frontend that has ha-alert. */
    p.warning {
      color: var(--warning-color);
      margin: 0;
    }
  `;
}
