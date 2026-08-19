import { css, html, LitElement, nothing } from "lit";
import type { ElementConfig, StateLabelConfig } from "../config";
import { assertNever } from "../config";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc, VisibilityCondition } from "../types";
import "./visibility-section";
import { elementLabel } from "./element-catalog";
import { PLACEMENT_ICON } from "./icons";
import {
  iconChromeSchema,
  iconContentInnerSchema,
  iconEntitySchema,
  iconFromFormData,
  iconInteractionsSchema,
  iconSizeSchema,
  iconToFormData,
  themeModeLabel,
  themeModeTitle,
  themeSelectRow,
} from "./state-icon-form";
import {
  labelChromeSchema,
  labelContentInnerSchema,
  labelEntitySchema,
  labelFromFormData,
  labelInteractionsSchema,
  labelPillSchema,
  labelRadiusSchema,
  labelSizeSchema,
  labelToFormData,
} from "./state-label-form";

// Mirrors the entity-badge editor's isTimeSeries (Rf) function.
// The time-keyed state_content values come from HA's source; keeping the
// same list means time_format appears exactly when ha-state-display would
// render a clock rather than text.
//
// THIS IS A COPY OF A NON-EXPORTED HOME ASSISTANT FUNCTION. On a version bump,
// re-read `Rf` in the entity-badge editor's chunk (grep the shipped frontend
// for `time_format`) and reconcile the four tables below — HA adds domains and
// device classes without touching any public API, so this drifts silently.
// The drift is cosmetic and recoverable: when a table falls behind, the field
// merely stops being offered for that entity kind, and `time_format` written by
// hand still round-trips through the editor untouched. Decision 6 of the spec
// once cited this copy as the acceptable case against the state colour; it was
// reversed inside 1.4.0 once the state colour turned out to be a chain of CSS
// variable names rather than a computation, and `src/state-color.ts` now carries
// the same kind of copy under the same kind of guarantee.
const TIME_BASED_CONTENT = ["last_updated", "last_changed", "last_triggered"] as const;
// Domains whose default "state" attribute already is a datetime value.
const TIME_DOMAINS = new Set([
  "ai_task",
  "button",
  "conversation",
  "datetime",
  "event",
  "image",
  "input_button",
  "notify",
  "scene",
  "stt",
  "tag",
  "tts",
  "wake_word",
]);
// Sensor device classes that carry a unix timestamp as their state.
const TIME_DEVICE_CLASSES = ["timestamp", "uptime"] as const;
// Per-domain attributes that represent a point in time.
const DOMAIN_TIME_ATTRS: Record<string, string[]> = {
  calendar: ["start_time", "end_time"],
  input_datetime: ["timestamp"],
  sun: ["next_dawn", "next_dusk", "next_midnight", "next_noon", "next_rising", "next_setting"],
};

/**
 * Returns true when the label's current state_content will be rendered as a
 * time by ha-state-display — the condition that makes time_format meaningful.
 * Reproduces HA's entity-badge editor check without importing it.
 */
const stateLabelIsTimeBased = (
  element: StateLabelConfig | undefined,
  hass: HomeAssistant,
): boolean => {
  const entity = element?.entity;
  const stateContent = element?.state_content;
  const contentList = Array.isArray(stateContent)
    ? stateContent
    : stateContent
      ? [stateContent]
      : [];
  if (
    stateContent &&
    contentList.some((v) => (TIME_BASED_CONTENT as readonly string[]).includes(v))
  )
    return true;
  if (!entity) return false;
  const domain = entity.split(".")[0] ?? "";
  if (!stateContent || contentList.includes("state")) {
    if (TIME_DOMAINS.has(domain)) return true;
    const stateObj = hass.states[entity];
    if (stateObj) {
      const dc =
        domain === "sensor"
          ? (stateObj.attributes["device_class"] as string | undefined)
          : undefined;
      if (dc && (TIME_DEVICE_CLASSES as readonly string[]).includes(dc)) return true;
    }
  }
  const domainAttrs = DOMAIN_TIME_ATTRS[domain];
  return !!(domainAttrs && stateContent && contentList.some((v) => domainAttrs.includes(v)));
};

export const appearanceToggleSchema = (): unknown[] => [
  { name: "halo_enabled", selector: { boolean: {} } },
  { name: "chrome_enabled", selector: { boolean: {} } },
];

export const elementFormLabel = (
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
  name: string,
): string => {
  if (name === "size_mode") return localizeOwn(hass, "size_mode");
  if (name === "size_min")
    return localize("ui.panel.lovelace.editor.card.generic.minimum") || "Minimum";
  if (name === "size_max")
    return localize("ui.panel.lovelace.editor.card.generic.maximum") || "Maximum";
  if (name === "size_ratio") return localizeOwn(hass, "ratio");
  if (name === "size_value") return localizeOwn(hass, "size_value");
  if (name === "color" || name === "show_entity_picture") {
    return localize(`ui.panel.lovelace.editor.badge.entity.${name}`) || name;
  }
  if (name === "halo_enabled") return localizeOwn(hass, "halo_enabled");
  if (name === "chrome_enabled") return localizeOwn(hass, "chrome_enabled");
  if (name === "chrome_radius") return localizeOwn(hass, "chrome_radius");
  if (name === "chrome_opacity") return localizeOwn(hass, "chrome_opacity");
  if (name === "chrome_content_ratio") return localizeOwn(hass, "chrome_content_ratio");
  if (name === "chrome_pill") return localizeOwn(hass, "chrome_pill");
  if (name === "chrome_padding") return localizeOwn(hass, "chrome_padding");
  if (name === "chrome_theme") return themeModeTitle(localize);
  // Two fields whose ui.panel.lovelace.editor.card.generic.<name> key does not
  // exist, so the fallthrough put the raw key on screen. Home Assistant has both
  // under the entity badge, which is the editor this form mirrors.
  if (name === "displayed_elements" || name === "state_content") {
    return localize(`ui.panel.lovelace.editor.badge.entity.${name}`) || name;
  }
  return localize(`ui.panel.lovelace.editor.card.generic.${name}`) || name;
};

export const elementFormHelper = (
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
  name: string,
): string | undefined => {
  if (name === "color")
    return (
      localize("ui.panel.lovelace.editor.badge.entity.color_helper") ||
      "Inactive state (for example, off or closed) will not be colored."
    );
  // ha-form-boolean renders the helper as the checkbox's own hint, permanently
  // visible — which is what a tooltip icon could not be on a phone.
  if (name === "halo_enabled") return localizeOwn(hass, "halo_enabled_helper");
  return undefined;
};

export class PictureStudioElementForm extends LitElement {
  static properties = {
    hass: { attribute: false },
    element: { attribute: false },
    anchor: { attribute: false },
    visibility: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare element?: ElementConfig;
  declare anchor?: Anchor;
  declare visibility?: VisibilityCondition[];

  /** Merge `ev.detail.value` onto the complete flat record and dispatch. */
  private _valueChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    const element = this.element;
    if (!element) return;
    const data = { ...this._toData(element), ...ev.detail.value };
    this._dispatch(element, data);
  };

  /** Mode radio-group fires "change" on the group; we read the new value from it. */
  private _modeChanged = (ev: Event): void => {
    const element = this.element;
    if (!element) return;
    const value = (ev.currentTarget as { value?: string }).value;
    if (!value) return;
    const data = { ...this._toData(element), size_mode: value };
    this._dispatch(element, data);
  };

  /** Chrome-theme radio-group: selecting a theme also switches the chrome on. */
  private _chromeThemeChanged = (ev: Event): void => {
    const element = this.element;
    if (!element) return;
    const value = (ev.currentTarget as { value?: string }).value;
    if (!value) return;
    const data = { ...this._toData(element), chrome_theme: value, chrome_enabled: true };
    this._dispatch(element, data);
  };

  /** Pill ha-switch: read the checked state and merge onto the full record. */
  private _pillChanged = (ev: Event): void => {
    const element = this.element;
    if (!element) return;
    const checked = (ev.currentTarget as { checked?: boolean }).checked;
    if (checked === undefined) return;
    const data = { ...this._toData(element), chrome_pill: checked };
    this._dispatch(element, data);
  };

  private _toData = (element: ElementConfig): Record<string, unknown> => {
    if (element.type === "state-label") return labelToFormData(element);
    if (element.type === "state-icon") return iconToFormData(element);
    return assertNever(element, "element kind");
  };

  private _dispatch = (element: ElementConfig, data: Record<string, unknown>): void => {
    if (element.type === "state-label") {
      this.dispatchEvent(
        new CustomEvent("element-changed", {
          detail: { element: labelFromFormData(element, data) },
          bubbles: true,
          composed: true,
        }),
      );
    } else if (element.type === "state-icon") {
      this.dispatchEvent(
        new CustomEvent("element-changed", {
          detail: { element: iconFromFormData(element, data) },
          bubbles: true,
          composed: true,
        }),
      );
    }
    // No else. An unknown kind never reaches this form — normalizeElementConfig
    // raises first — and defaulting it to the icon would corrupt its config with
    // icon-only keys the day a third kind exists.
  };

  protected render() {
    const element = this.element;
    const hass = this.hass;
    if (!element || !hass) return nothing;

    // Check at render time whether ha-radio-group is available.
    // If it is not, size_mode falls back to a vertical ha-form select — correct
    // but not horizontal. The check is lazy (render time, not module load) so a
    // chunk that registers the element after ours is still found.
    const radioGroupAvailable = !!customElements.get("ha-radio-group");

    // ha-selector-boolean (the path labelPillSchema takes) mounts ha-switch
    // inside ha-formfield. We render ha-switch directly — our .pill-label span
    // is already the label, so ha-formfield's slot mechanism is redundant.
    // The check is lazy for the same reason as above. Falls back to ha-form if
    // the element is absent.
    const switchAvailable = !!customElements.get("ha-switch");

    const isLabel = element.type === "state-label";
    const data = this._toData(element);
    // Mirrors the entity-badge editor's Rf check: show time_format only when
    // the selected state_content carries a time value. The time-based keys are
    // the same three HA uses ("last_updated", "last_changed", "last_triggered"),
    // plus domain defaults (e.g. datetime, button) and sensor device classes
    // "timestamp" / "uptime", and domain-specific attributes (calendar, sun, …).
    const showTimeFormat =
      isLabel && stateLabelIsTimeBased(element.type === "state-label" ? element : undefined, hass);
    const sizeSchema = isLabel ? labelSizeSchema : iconSizeSchema;
    const label = (s: { name: string }) => elementFormLabel(hass.localize, hass, s.name);
    const helper = (s: { name: string }) => elementFormHelper(hass.localize, hass, s.name);

    // The warning marker: a state-label whose show list is empty displays nothing
    // at all — same condition that badge-list.ts uses for its row marker.
    const showEmptyWarning = isLabel && (element as StateLabelConfig).show.length === 0;

    return html`
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("go-back", { bubbles: true, composed: true }),
            )}><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <span class="title">${elementLabel(hass.localize, element.type)}</span>
      </div>
      <ha-form
        .hass=${hass}
        .data=${data}
        .schema=${isLabel ? labelEntitySchema() : iconEntitySchema()}
        .computeLabel=${label}
        .computeHelper=${helper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:text-short"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${label({ name: "content" })}
        </div>
        ${
          // The `event` slot, not `icons`: ha-expansion-panel renders its header
          // as leading-icon → header → event → chevron → icons, so anything in
          // `icons` lands after the chevron. The marker belongs beside the title.
          // Same glyph, colour and size as the item list's row marker in
          // badge-list.ts (.empty rule) so the two read as the same signal.
          showEmptyWarning
            ? html`<ha-icon
                slot="event"
                icon="mdi:alert-outline"
                title=${localizeOwn(hass, "label_empty_hint")}
              ></ha-icon>`
            : nothing
        }
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${
              isLabel
                ? labelContentInnerSchema(showTimeFormat, hass.localize)
                : iconContentInnerSchema()
            }
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${this._valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
      <ha-form
        .hass=${hass}
        .data=${data}
        .schema=${isLabel ? labelInteractionsSchema() : iconInteractionsSchema()}
        .computeLabel=${label}
        .computeHelper=${helper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" .icon=${PLACEMENT_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "size_and_position")}
        </div>
        <div class="content">
          ${
            radioGroupAvailable
              ? html`
                  <span class="section-label">${localizeOwn(hass, "size_mode")}</span>
                  <ha-radio-group
                    orientation="horizontal"
                    .value=${element.size.mode}
                    @change=${this._modeChanged}
                  >
                    <ha-radio-option .value=${"auto"}
                      >${hass.localize("ui.common.auto") || "Automatic"}</ha-radio-option
                    >
                    <ha-radio-option .value=${"adaptive"}
                      >${localizeOwn(hass, "size_mode_adaptive")}</ha-radio-option
                    >
                    <ha-radio-option .value=${"fixed"}
                      >${localizeOwn(hass, "size_mode_fixed")}</ha-radio-option
                    >
                  </ha-radio-group>
                `
              : nothing
          }
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${sizeSchema(element.size.mode, hass.localize, hass, radioGroupAvailable)}
            .computeLabel=${label}
            @value-changed=${this._valueChanged}
          ></ha-form>
          <div class="separator"></div>
          <span class="section-label">${localizeOwn(hass, "anchor")}</span>
          <picture-studio-anchor-picker
            .hass=${hass}
            .anchor=${this.anchor}
          ></picture-studio-anchor-picker>
        </div>
      </ha-expansion-panel>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:shape"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${hass.localize("ui.panel.lovelace.editor.card.map.appearance") || "Appearance"}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${appearanceToggleSchema()}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${this._valueChanged}
          ></ha-form>
          ${
            data.chrome_enabled
              ? html`
                  ${
                    radioGroupAvailable
                      ? html`
                          <span class="section-label">${themeModeTitle(hass.localize)}</span>
                          <ha-radio-group
                            orientation="horizontal"
                            .value=${(data.chrome_theme as string) ?? "auto"}
                            @change=${this._chromeThemeChanged}
                          >
                            ${(["auto", "light", "dark"] as const).map(
                              (value) => html`
                                <ha-radio-option .value=${value}
                                  >${themeModeLabel(hass.localize, value)}</ha-radio-option
                                >
                              `,
                            )}
                          </ha-radio-group>
                        `
                      : html`
                          <ha-form
                            .hass=${hass}
                            .data=${data}
                            .schema=${[themeSelectRow(hass.localize)]}
                            .computeLabel=${label}
                            @value-changed=${this._valueChanged}
                          ></ha-form>
                        `
                  }
                  ${
                    isLabel
                      ? html`
                          <div class="pill-row" ?data-pill=${data.chrome_pill === true}>
                            ${
                              switchAvailable
                                ? html`
                                    <div class="pill-control">
                                      <span class="pill-label"
                                        >${localizeOwn(hass, "chrome_pill")}</span
                                      >
                                      <ha-switch
                                        .checked=${data.chrome_pill === true}
                                        @change=${this._pillChanged}
                                      ></ha-switch>
                                    </div>
                                  `
                                : html`
                                    <ha-form
                                      .hass=${hass}
                                      .data=${data}
                                      .schema=${labelPillSchema()}
                                      .computeLabel=${label}
                                      @value-changed=${this._valueChanged}
                                    ></ha-form>
                                  `
                            }
                            <div class="pill-separator"></div>
                            <ha-form
                              .hass=${hass}
                              .data=${data}
                              .schema=${labelRadiusSchema()}
                              .computeLabel=${label}
                              @value-changed=${this._valueChanged}
                            ></ha-form>
                          </div>
                        `
                      : nothing
                  }
                  <ha-form
                    .hass=${hass}
                    .data=${data}
                    .schema=${
                      isLabel ? labelChromeSchema(hass.localize) : iconChromeSchema(hass.localize)
                    }
                    .computeLabel=${label}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                `
              : nothing
          }
        </div>
      </ha-expansion-panel>
      <picture-studio-visibility-section
        .hass=${hass}
        .visibility=${this.visibility}
      ></picture-studio-visibility-section>
    `;
  }

  static styles = css`
    .header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      margin-bottom: var(--ha-space-2);
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
    }
    ha-form {
      display: block;
      /* Every top-level section — ha-form or ha-expansion-panel — carries the
         same 24px bottom margin so the column keeps one rhythm regardless of
         the element type that follows. 24px matches ha-form's own root-child
         spacing, so it is the value the design already uses between fields. */
      margin-bottom: var(--ha-space-6, 24px);
    }
    /* Mirrors ha-form-expandable: the panel's own content padding is zeroed and
       the section supplies its own, so our sections sit exactly like Home
       Assistant's own expandable sections. */
    ha-expansion-panel {
      display: block;
      /* Same 24px bottom margin as ha-form above — uniform rule, every
         top-level block, so no pair needs its own adjacent-sibling selector. */
      margin-bottom: var(--ha-space-6, 24px);
      --expansion-panel-content-padding: 0;
      border-radius: var(--ha-border-radius-md);
      --ha-card-border-radius: var(--ha-border-radius-md);
    }
    .content {
      padding: 12px;
    }
    .content ha-form {
      margin-bottom: 0;
    }
    .separator {
      border-top: 1px solid var(--divider-color);
      margin: var(--ha-space-3, 12px) 0;
    }
    /* Both section headings (\"Taille\" above the mode control and \"Position\"
       above the anchor picker) share this class so they are identical by
       construction. The declarations resolve to the same values that Home
       Assistant's own wa-form-control labels use, so the pair follows HA's
       typography wherever it goes. */
    .section-label {
      color: var(--wa-form-control-label-color);
      font-weight: var(--wa-form-control-label-font-weight);
      line-height: var(--wa-form-control-label-line-height);
      margin-block-end: 0.5em;
      display: inline-flex;
    }
    ha-icon[slot="leading-icon"] {
      color: var(--secondary-text-color);
    }
    /* Same glyph, colour and size as the item list's row marker (.empty in
       badge-list.ts). The event slot sits immediately before the chevron —
       confirmed by visibility-section.ts which uses the same slot for its
       count pill and explains the slot order in a comment there. */
    ha-icon[slot="event"] {
      display: flex;
      color: var(--warning-color);
      --mdc-icon-size: 16px;
      margin-inline-start: var(--ha-space-2, 8px);
    }
    /* The switch takes its natural width, the separator takes its natural width,
       and the radius takes the rest — ha-form's own grid can only make equal
       columns, which is why this row is ours rather than a type:"grid" entry. */
    /* No gap: the separator carries the whole spacing, exactly as it does above
       the anchor picker, so the two places are spaced identically by
       construction rather than by two numbers someone has to keep equal. */
    .pill-row {
      display: grid;
      grid-template-columns: max-content max-content 1fr;
      align-items: center;
    }
    /* Label and switch sit inline; the gap is the space between them that
       ha-selector-boolean's shadow DOM does not expose as a token. */
    .pill-control {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4, 16px);
    }
    /* .section-label carries margin-block-end: 0.5em for its stacked role
       (above a radio group or anchor picker). Used beside a switch in a flex
       row, that margin shifts the text off the centre line. This class keeps
       the same typography without the positional margin. */
    .pill-label {
      color: var(--wa-form-control-label-color);
      font-weight: var(--wa-form-control-label-font-weight);
      line-height: var(--wa-form-control-label-line-height);
    }
    /* Vertical counterpart of .separator: same colour and thickness, 12px on
       each side (the transposition of .separator's 12px top/bottom margin).
       align-self: stretch gives it height — an empty div with only a side
       border has no intrinsic height, and align-items: center on the grid would
       leave it zero-height and invisible. */
    .pill-separator {
      border-inline-start: 1px solid var(--divider-color);
      margin: 0 var(--ha-space-3, 12px);
      align-self: stretch;
    }
    /* Hidden, not removed: ticking the switch must not reflow the row, so both
       the separator and the radius keep their boxes. visibility also takes them
       out of the tab order and screen reader, which opacity would not. */
    .pill-row[data-pill] > :nth-child(n+2) {
      visibility: hidden;
    }
    picture-studio-visibility-section {
      display: block;
    }
  `;
}
