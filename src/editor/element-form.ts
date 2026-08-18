import { css, html, LitElement, nothing } from "lit";
import type { ElementConfig } from "../config";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc, VisibilityCondition } from "../types";
import "./visibility-section";
import { elementLabel } from "./element-catalog";
import { PLACEMENT_ICON } from "./icons";
import {
  iconChromeSchema,
  iconFromFormData,
  iconSchema,
  iconSizeSchema,
  iconToFormData,
  themeModeLabel,
  themeModeTitle,
  themeSelectRow,
} from "./state-icon-form";
import {
  labelChromeSchema,
  labelFromFormData,
  labelPillSchema,
  labelRadiusSchema,
  labelSchema,
  labelSizeSchema,
  labelToFormData,
} from "./state-label-form";

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

  private _toData = (element: ElementConfig): Record<string, unknown> =>
    element.type === "state-label" ? labelToFormData(element) : iconToFormData(element);

  private _dispatch = (element: ElementConfig, data: Record<string, unknown>): void => {
    const updated: ElementConfig =
      element.type === "state-label"
        ? labelFromFormData(element, data)
        : iconFromFormData(element, data);
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: updated },
        bubbles: true,
        composed: true,
      }),
    );
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
    const data =
      element.type === "state-label" ? labelToFormData(element) : iconToFormData(element);
    const schema = isLabel ? labelSchema() : iconSchema();
    const sizeSchema = isLabel ? labelSizeSchema : iconSizeSchema;
    const label = (s: { name: string }) => elementFormLabel(hass.localize, hass, s.name);
    const helper = (s: { name: string }) => elementFormHelper(hass.localize, hass, s.name);

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
        .schema=${schema}
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
