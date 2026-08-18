import { DEFAULT_ICON_CHROME, normalizeIconChrome } from "../chrome";
import type { StateIconConfig } from "../config";
import { DEFAULT_ICON_SIZE, normalizeElementSize } from "../element-size";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";

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

export const iconSchema = (): unknown[] => [
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

export const iconSizeSchema = (
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
    size_mode: size.mode,
    // Math.round enforces each slider's step:1 contract (same trade as the chrome
    // numbers below). size_mode is a string; the read path (normalizeIconSize)
    // keeps any finite number as written — rounding belongs to the editor only.
    size_min: typeof size.min === "number" ? Math.round(size.min) : size.min,
    size_ratio: typeof size.ratio === "number" ? Math.round(size.ratio) : size.ratio,
    size_max: typeof size.max === "number" ? Math.round(size.max) : size.max,
    size_value: typeof size.value === "number" ? Math.round(size.value) : size.value,
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
    size: normalizeElementSize(
      {
        mode: size_mode,
        // Math.round on the way back enforces each slider's step:1 contract.
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
