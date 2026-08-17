import { css, html, LitElement, nothing } from "lit";
import { DEFAULT_ICON_CHROME, normalizeIconChrome } from "../chrome";
import type { ElementConfig, StateIconConfig } from "../config";
import { DEFAULT_ICON_SIZE, normalizeElementSize } from "../element-size";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc, VisibilityCondition } from "../types";
import "./visibility-section";
import { PLACEMENT_ICON } from "./icons";

const THEME_KEY = "ui.panel.lovelace.editor.card.map";
const THEME_FALLBACK = { auto: "Auto", light: "Light", dark: "Dark" } as const;

const themeModeLabel = (localize: LocalizeFunc, value: keyof typeof THEME_FALLBACK): string =>
  localize(`${THEME_KEY}.theme_modes.${value}`) || THEME_FALLBACK[value];

export const themeModeTitle = (localize: LocalizeFunc): string =>
  localize(`${THEME_KEY}.theme_mode`) || "Theme mode";

export const stateIconSchema = (): unknown[] => [
  { name: "entity", selector: { entity: {} } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    icon: "mdi:text-short",
    schema: [
      { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
      {
        name: "",
        type: "grid",
        schema: [
          {
            name: "color",
            selector: { ui_color: { default_color: "state", include_state: true } },
          },
          { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
          { name: "show_entity_picture", selector: { boolean: {} } },
        ],
      },
    ],
  },
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    icon: "mdi:gesture-tap",
    schema: [
      { name: "tap_action", selector: { ui_action: { default_action: "more-info" } } },
      {
        name: "",
        type: "optional_actions",
        flatten: true,
        schema: ["hold_action", "double_tap_action"].map((name) => ({
          name,
          selector: { ui_action: { default_action: "none" } },
        })),
      },
    ],
  },
];

export const toFormData = (config: StateIconConfig): Record<string, unknown> => {
  const { size, chrome, ...rest } = config;
  const c = chrome ?? DEFAULT_ICON_CHROME;
  return {
    ...rest,
    size_mode: size.mode,
    // Math.round enforces each slider's step:1 contract (same trade as the chrome
    // numbers below). size_mode is a string; the read path (normalizeIconSize)
    // keeps any finite number as written — rounding belongs to the editor only.
    size_min: typeof size.min === "number" ? Math.round(size.min) : size.min,
    size_ratio: typeof size.ratio === "number" ? Math.round(size.ratio) : size.ratio,
    size_max: typeof size.max === "number" ? Math.round(size.max) : size.max,
    size_value: typeof size.value === "number" ? Math.round(size.value) : size.value,
    chrome_enabled: c.theme !== "none",
    // The control never offers "none", so an off chrome pre-selects the theme
    // that checking the box will give it.
    chrome_theme: c.theme === "none" ? "auto" : c.theme,
    // Math.round enforces the slider's step:1 contract. A hand-written value
    // with finer precision (e.g. 12.5) is rounded the first time the editor
    // commits anything for that item — including a drag. This is a deliberate
    // trade: the slider guides, and hand-authored precision outside the slider's
    // step is not a use-case the editor supports.
    chrome_radius: Math.round(c.radius),
    // opacity and content_ratio are 0-1 in config; the form shows them as
    // 0-100 percent. Math.round avoids floating-point display drift
    // (e.g. 0.6 * 100 = 60.00000000000001 without it).
    chrome_opacity: Math.round(c.opacity * 100),
    chrome_content_ratio: Math.round(c.content_ratio * 100),
  };
};

export const fromFormData = (
  config: StateIconConfig,
  data: Record<string, unknown>,
): StateIconConfig => {
  // Invariant: `data` must be the complete flat record (all ten chrome and size
  // fields present, whether or not the active schema shows them). ha-form enforces
  // this: its value-changed handler merges the changed child onto the `.data` it
  // was given and re-emits the whole thing —
  //   this.data = { ...this.data, ...newValue };
  //   fireEvent(this, "value-changed", { value: this.data });
  // — so every field we pass to `.data` comes back regardless of which rows the
  // current mode's schema is showing. Passing `toFormData(element)` (all ten
  // fields) as `.data` is therefore what keeps the non-visible fields alive.
  const {
    size_mode,
    size_min,
    size_ratio,
    size_max,
    size_value,
    chrome_enabled,
    chrome_theme,
    chrome_radius,
    chrome_opacity,
    chrome_content_ratio,
    ...rest
  } = data;
  // Chrome is written when it was present before (numbers must survive unchecking)
  // or when the user explicitly enables it. When the original had no chrome and
  // the box is off, the key is omitted entirely so an absent chrome still round-trips.
  const chromeOut =
    chrome_enabled || config.chrome !== undefined
      ? {
          chrome: normalizeIconChrome({
            // The checkbox is the switch; the theme control only ever names a surface
            // that draws. Unchecking stores "none" and every number survives it.
            theme: chrome_enabled ? (chrome_theme ?? "auto") : "none",
            // Math.round on the way back enforces the slider's step:1 contract.
            // A typed decimal (e.g. 12.5 for radius, 61 for an opacity dragged
            // to 0.61 by hand) is rounded the first time the editor commits for
            // that item. Deliberate: hand-authored sub-step precision is not a
            // use-case the editor supports.
            radius: typeof chrome_radius === "number" ? Math.round(chrome_radius) : chrome_radius,
            // The form speaks percent (0-100); config stores 0-1. Divide back;
            // normalizeChrome validates if the field is missing or non-numeric.
            opacity:
              typeof chrome_opacity === "number"
                ? Math.round(chrome_opacity) / 100
                : chrome_opacity,
            content_ratio:
              typeof chrome_content_ratio === "number"
                ? Math.round(chrome_content_ratio) / 100
                : chrome_content_ratio,
          }),
        }
      : {};
  return {
    ...(rest as Omit<StateIconConfig, "type" | "size" | "chrome">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    size: normalizeElementSize(
      {
        mode: size_mode,
        // Math.round on the way back enforces each slider's step:1 contract.
        // Same deliberate trade as the chrome numbers: a hand-written sub-step
        // value is rounded the first time the editor commits for that item.
        min: typeof size_min === "number" ? Math.round(size_min) : size_min,
        ratio: typeof size_ratio === "number" ? Math.round(size_ratio) : size_ratio,
        max: typeof size_max === "number" ? Math.round(size_max) : size_max,
        value: typeof size_value === "number" ? Math.round(size_value) : size_value,
      },
      DEFAULT_ICON_SIZE,
    ),
    ...chromeOut,
  };
};

/** Home Assistant's own mapping, plus the two keys its catalogue has not got. */
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
  if (name === "chrome_enabled") return localizeOwn(hass, "chrome_enabled");
  if (name === "chrome_radius") return localizeOwn(hass, "chrome_radius");
  if (name === "chrome_opacity") return localizeOwn(hass, "chrome_opacity");
  if (name === "chrome_content_ratio") return localizeOwn(hass, "chrome_content_ratio");
  if (name === "chrome_theme") return themeModeTitle(localize);
  return localize(`ui.panel.lovelace.editor.card.generic.${name}`) || name;
};

export const stateIconSizeSchema = (
  mode: "auto" | "adaptive" | "fixed",
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
  // When true, the caller renders ha-radio-group for mode selection and the
  // schema omits size_mode. When false (the default), size_mode is included as
  // a vertical ha-form select — correct but not horizontal — guaranteed to
  // load because ha-selector pulls its own sub-components.
  radioGroupAvailable = false,
): unknown[] => {
  const modeField = {
    name: "size_mode",
    selector: {
      select: {
        mode: "list",
        options: [
          { value: "auto", label: localize("ui.common.auto") || "Automatic" },
          { value: "adaptive", label: localizeOwn(hass, "size_mode_adaptive") },
          { value: "fixed", label: localizeOwn(hass, "size_mode_fixed") },
        ],
      },
    },
  };
  // When the radio group handles mode selection, it is not repeated in the
  // form. In the fallback path the select stays so the user can still change
  // the mode — ha-form is the guarantee that it renders.
  const preamble = radioGroupAvailable ? [] : [modeField];
  if (mode === "adaptive") {
    return [
      ...preamble,
      {
        name: "size_ratio",
        selector: {
          // A percentage of the card's width is a value you feel rather than
          // type, so size_ratio gets a slider (no mode: "box"). The two adaptive
          // pixel bounds keep "box" because exact pixel values are typed, not
          // dragged. The fixed size is also a slider — a value you feel.
          number: { min: 1, max: 100, step: 1, unit_of_measurement: "%" },
        },
      },
      {
        name: "",
        type: "grid",
        schema: [
          {
            name: "size_min",
            selector: {
              number: { min: 8, max: 400, step: 1, unit_of_measurement: "px", mode: "box" },
            },
          },
          {
            name: "size_max",
            selector: {
              number: { min: 8, max: 400, step: 1, unit_of_measurement: "px", mode: "box" },
            },
          },
        ],
      },
    ];
  }
  if (mode === "fixed") {
    return [
      ...preamble,
      {
        name: "size_value",
        selector: { number: { min: 8, max: 128, step: 1, unit_of_measurement: "px" } },
      },
    ];
  }
  // auto — no numeric fields
  return preamble;
};

/** The checkbox, alone, so the theme control can be rendered between it and the numbers. */
export const chromeToggleSchema = (): unknown[] => [
  { name: "chrome_enabled", selector: { boolean: {} } },
];

export const chromeSchema = (
  localize: LocalizeFunc,
  // When true, the caller renders ha-radio-group for the theme and the schema
  // omits chrome_theme. When false, the select stays so the theme is still
  // changeable — ha-form is the guarantee that it renders.
  radioGroupAvailable = false,
): unknown[] => [
  ...(radioGroupAvailable
    ? []
    : [
        {
          name: "chrome_theme",
          selector: {
            select: {
              mode: "dropdown",
              options: (["auto", "light", "dark"] as const).map((value) => ({
                value,
                label: themeModeLabel(localize, value),
              })),
            },
          },
        },
      ]),
  {
    name: "chrome_radius",
    selector: { number: { min: 0, max: 50, step: 1, unit_of_measurement: "%" } },
  },
  {
    name: "chrome_opacity",
    selector: { number: { min: 0, max: 100, step: 1, unit_of_measurement: "%" } },
  },
  {
    name: "chrome_content_ratio",
    // The model keeps any finite number as written — no clamping. Hand-written
    // YAML is trusted exactly as written, consistent with how coordinates are
    // treated. The form starts at 10 because a ratio of zero renders an
    // invisible icon and nothing in the editor would explain why: the form
    // guides, the model tolerates.
    // The form shows 0-100 percent; fromFormData converts back to 0-1.
    selector: { number: { min: 10, max: 100, step: 1, unit_of_measurement: "%" } },
  },
];

export const elementFormHelper = (localize: LocalizeFunc, name: string): string | undefined => {
  if (name === "color")
    return (
      localize("ui.panel.lovelace.editor.badge.entity.color_helper") ||
      "Inactive state (for example, off or closed) will not be colored."
    );
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

  private _valueChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    if (!this.element) return;
    const data = { ...toFormData(this.element), ...ev.detail.value };
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: fromFormData(this.element, data) },
        bubbles: true,
        composed: true,
      }),
    );
  };

  // Handles a change event from ha-radio-group (the horizontal mode control).
  // Emits element-changed through the same path as _valueChanged so there is
  // exactly one way a config change leaves this component.
  private _modeChanged = (ev: Event): void => {
    if (!this.element) return;
    const value = (ev.currentTarget as { value?: string }).value;
    if (!value) return;
    const data = { ...toFormData(this.element), size_mode: value };
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: fromFormData(this.element, data) },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _chromeThemeChanged = (ev: Event): void => {
    if (!this.element) return;
    const value = (ev.currentTarget as { value?: string }).value;
    if (!value) return;
    const data = { ...toFormData(this.element), chrome_theme: value, chrome_enabled: true };
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: fromFormData(this.element, data) },
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

    return html`
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("go-back", { bubbles: true, composed: true }),
            )}><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
        <span class="title">${element.type}</span>
      </div>
      <ha-form
        .hass=${hass}
        .data=${toFormData(element)}
        .schema=${stateIconSchema()}
        .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
        .computeHelper=${(s: { name: string }) => elementFormHelper(hass.localize, s.name)}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:shape"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "chrome")}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${toFormData(element)}
            .schema=${chromeToggleSchema()}
            .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
            @value-changed=${this._valueChanged}
          ></ha-form>
          ${
            toFormData(element).chrome_enabled
              ? html`
                  ${
                    radioGroupAvailable
                      ? html`
                          <span class="section-label">${themeModeTitle(hass.localize)}</span>
                          <ha-radio-group
                            orientation="horizontal"
                            .value=${(toFormData(element).chrome_theme as string) ?? "auto"}
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
                      : nothing
                  }
                  <ha-form
                    .hass=${hass}
                    .data=${toFormData(element)}
                    .schema=${chromeSchema(hass.localize, radioGroupAvailable)}
                    .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                `
              : nothing
          }
        </div>
      </ha-expansion-panel>
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
            .data=${toFormData(element)}
            .schema=${stateIconSizeSchema(element.size.mode, hass.localize, hass, radioGroupAvailable)}
            .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
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
    /* Both section headings ("Taille" above the mode control and "Position"
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
    picture-studio-visibility-section {
      display: block;
    }
  `;
}
