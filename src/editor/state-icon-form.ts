import { html, nothing } from "lit";
import { DEFAULT_ICON_CHROME, normalizeIconChrome } from "../chrome";
import type { StateIconConfig } from "../config";
import { defaultActionName, STATE_ICON_KIND } from "../element-kinds";
import { DEFAULT_ICON_SIZE } from "../element-size";
import { localizeOwn } from "../strings";
import type { LocalizeFunc } from "../types";
import type { KindForm, KindFormContext } from "./element-form";
import { sizeFromFormFields, sizeSchema, sizeToFormFields } from "./element-size-form";
import { PLACEMENT_ICON } from "./icons";

export const THEME_KEY = "ui.panel.lovelace.editor.card.map";
export const THEME_FALLBACK = { auto: "Auto", light: "Light", dark: "Dark" } as const;

export const themeModeLabel = (
  localize: LocalizeFunc,
  value: keyof typeof THEME_FALLBACK,
): string => localize(`${THEME_KEY}.theme_modes.${value}`) || THEME_FALLBACK[value];

export const themeModeTitle = (localize: LocalizeFunc): string =>
  localize(`${THEME_KEY}.theme_mode`) || "Theme mode";

/** The theme dropdown row shared by both chrome schemas. */
export const themeSelectRow = (localize: LocalizeFunc): unknown => ({
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
});

export const iconEntitySchema = (): unknown[] => [{ name: "entity", selector: { entity: {} } }];

export const iconContentInnerSchema = (): unknown[] => [
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
];

export const iconInteractionsSchema = (): unknown[] => [
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    icon: "mdi:gesture-tap",
    schema: [
      {
        name: "tap_action",
        selector: {
          ui_action: { default_action: defaultActionName(STATE_ICON_KIND, "tap_action") },
        },
      },
      {
        name: "",
        type: "optional_actions",
        flatten: true,
        schema: (["hold_action", "double_tap_action"] as const).map((name) => ({
          name,
          selector: { ui_action: { default_action: defaultActionName(STATE_ICON_KIND, name) } },
        })),
      },
    ],
  },
];

export const iconSchema = (): unknown[] => [
  ...iconEntitySchema(),
  {
    name: "content",
    type: "expandable",
    flatten: true,
    icon: "mdi:text-short",
    schema: iconContentInnerSchema(),
  },
  ...iconInteractionsSchema(),
];

/** Sizing is one idea for both kinds — see `element-size-form.ts`. */
export const iconSizeSchema = sizeSchema;

export const iconChromeSchema = (_localize: LocalizeFunc): unknown[] => [
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

export const iconToFormData = (config: StateIconConfig): Record<string, unknown> => {
  const { size, chrome, halo, ...rest } = config;
  const c = chrome ?? DEFAULT_ICON_CHROME;
  return {
    ...rest,
    ...sizeToFormFields(size),
    halo_enabled: halo === true,
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

export const iconFromFormData = (
  config: StateIconConfig,
  data: Record<string, unknown>,
): StateIconConfig => {
  // Invariant: `data` must be the complete flat record (all chrome and size
  // fields present, whether or not the active schema shows them). ha-form enforces
  // this: its value-changed handler merges the changed child onto the `.data` it
  // was given and re-emits the whole thing —
  //   this.data = { ...this.data, ...newValue };
  //   fireEvent(this, "value-changed", { value: this.data });
  // — so every field we pass to `.data` comes back regardless of which rows the
  // current mode's schema is showing. Passing `iconToFormData(element)` (all
  // fields) as `.data` is therefore what keeps the non-visible fields alive.
  const {
    size_mode,
    size_min,
    size_ratio,
    size_max,
    size_value,
    halo_enabled,
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
    ...(rest as Omit<StateIconConfig, "type" | "size" | "chrome" | "halo">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    halo: halo_enabled === true,
    size: sizeFromFormFields(data, DEFAULT_ICON_SIZE),
    ...chromeOut,
  };
};

/**
 * Both element kinds share these two toggles: halo and chrome on/off.
 * Lives here (rather than element-form.ts) so neither kind form needs a
 * circular import back into the shell module.
 */
export const appearanceToggleSchema = (): unknown[] => [
  { name: "halo_enabled", selector: { boolean: {} } },
  { name: "chrome_enabled", selector: { boolean: {} } },
];

/**
 * The `KindForm` implementation for state-icon elements.
 * `toFormData` and `fromFormData` delegate to the existing flat functions;
 * `render` produces every section from the entity row to the appearance panel
 * (the shell keeps only the header, go-back, and visibility section).
 */
export const iconForm: KindForm<StateIconConfig> = {
  toFormData: iconToFormData,
  fromFormData: iconFromFormData,
  render(ctx: KindFormContext<StateIconConfig>): unknown {
    const {
      element,
      hass,
      data,
      label,
      helper,
      valueChanged,
      modeChanged,
      chromeThemeChanged,
      radioGroupAvailable,
    } = ctx;
    return html`
      <ha-form
        .hass=${hass}
        .data=${data}
        .schema=${iconEntitySchema()}
        .computeLabel=${label}
        .computeHelper=${helper}
        @value-changed=${valueChanged}
      ></ha-form>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:text-short"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${label({ name: "content" })}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${iconContentInnerSchema()}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
      <ha-form
        .hass=${hass}
        .data=${data}
        .schema=${iconInteractionsSchema()}
        .computeLabel=${label}
        .computeHelper=${helper}
        @value-changed=${valueChanged}
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
                    @change=${modeChanged}
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
            .schema=${iconSizeSchema(element.size.mode, hass.localize, hass, radioGroupAvailable)}
            .computeLabel=${label}
            @value-changed=${valueChanged}
          ></ha-form>
          <div class="separator"></div>
          <span class="section-label">${localizeOwn(hass, "anchor")}</span>
          <picture-studio-anchor-picker
            .hass=${hass}
            .anchor=${ctx.anchor}
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
            @value-changed=${valueChanged}
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
                            @change=${chromeThemeChanged}
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
                            @value-changed=${valueChanged}
                          ></ha-form>
                        `
                  }
                  <ha-form
                    .hass=${hass}
                    .data=${data}
                    .schema=${iconChromeSchema(hass.localize)}
                    .computeLabel=${label}
                    @value-changed=${valueChanged}
                  ></ha-form>
                `
              : nothing
          }
        </div>
      </ha-expansion-panel>
    `;
  },
};
