import { DEFAULT_LABEL_CHROME, normalizeLabelChrome } from "../chrome";
import type { StateLabelConfig } from "../config";
import { DEFAULT_LABEL_SIZE, normalizeElementSize } from "../element-size";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";
export const labelSchema = (showTimeFormat: boolean): unknown[] => [
  { name: "entity", selector: { entity: {} } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    icon: "mdi:text-short",
    schema: [
      { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
      {
        name: "displayed_elements",
        selector: {
          select: {
            mode: "list",
            multiple: true,
            options: ["name", "state"].map((value) => ({ value, label: value })),
          },
        },
      },
      {
        name: "state_content",
        selector: { ui_state_content: { allow_name: true } },
        context: { filter_entity: "entity" },
      },
      // Mirrors the entity-badge editor: shown only when the selected
      // state_content carries a time value that ha-state-display renders as a
      // clock — same condition, same selector.
      ...(showTimeFormat ? [{ name: "time_format", selector: { ui_time_format: {} } }] : []),
      {
        name: "color",
        // No include_state: a label cannot honour it. state-badge computes the
        // state colour inline and exposes nothing, and copying that computation
        // would drift from Home Assistant version to version. See the spec,
        // decision 6.
        selector: { ui_color: { default_color: "none", include_none: true } },
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

export const labelSizeSchema = (
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
  const preamble = radioGroupAvailable ? [] : [modeField];
  if (mode === "adaptive") {
    return [
      ...preamble,
      {
        name: "size_ratio",
        selector: { number: { min: 1, max: 100, step: 1, unit_of_measurement: "%" } },
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

export const labelPillSchema = (): unknown[] => [
  { name: "chrome_pill", selector: { boolean: {} } },
];

export const labelRadiusSchema = (): unknown[] => [
  {
    name: "chrome_radius",
    selector: { number: { min: 0, max: 24, step: 1, unit_of_measurement: "px" } },
  },
];

export const labelChromeSchema = (_localize: LocalizeFunc): unknown[] => [
  {
    name: "chrome_opacity",
    selector: { number: { min: 0, max: 100, step: 1, unit_of_measurement: "%" } },
  },
  {
    name: "chrome_padding",
    selector: { number: { min: 0, max: 24, step: 1, unit_of_measurement: "px" } },
  },
];

export const labelToFormData = (config: StateLabelConfig): Record<string, unknown> => {
  const { size, chrome, halo, show_name, show_state, ...rest } = config;
  const c = chrome ?? DEFAULT_LABEL_CHROME;
  const displayed: string[] = [];
  if (show_name) displayed.push("name");
  if (show_state) displayed.push("state");
  return {
    ...rest,
    displayed_elements: displayed,
    size_mode: size.mode,
    size_min: typeof size.min === "number" ? Math.round(size.min) : size.min,
    size_ratio: typeof size.ratio === "number" ? Math.round(size.ratio) : size.ratio,
    size_max: typeof size.max === "number" ? Math.round(size.max) : size.max,
    size_value: typeof size.value === "number" ? Math.round(size.value) : size.value,
    halo_enabled: halo === true,
    chrome_enabled: c.theme !== "none",
    // The control never offers "none", so an off chrome pre-selects the theme
    // that checking the box will give it.
    chrome_theme: c.theme === "none" ? "auto" : c.theme,
    chrome_pill: c.pill,
    // Math.round enforces each slider's step:1 contract. The model keeps any
    // finite number as written; rounding belongs to the editor only.
    chrome_radius: Math.round(c.radius),
    chrome_padding: Math.round(c.padding),
    // opacity is 0-1 in config and 0-100 in the form. Math.round avoids
    // floating-point display drift.
    chrome_opacity: Math.round(c.opacity * 100),
  };
};

export const labelFromFormData = (
  config: StateLabelConfig,
  data: Record<string, unknown>,
): StateLabelConfig => {
  // Invariant: `data` is the complete flat record. ha-form merges the changed
  // field onto the `.data` it was given and re-emits the whole thing, so every
  // field passed to `.data` comes back regardless of which rows the active
  // schema shows. That is what keeps a hidden field alive.
  const {
    displayed_elements,
    size_mode,
    size_min,
    size_ratio,
    size_max,
    size_value,
    halo_enabled,
    chrome_enabled,
    chrome_theme,
    chrome_pill,
    chrome_radius,
    chrome_opacity,
    chrome_padding,
    ...rest
  } = data;
  const shown = Array.isArray(displayed_elements) ? (displayed_elements as string[]) : [];
  const chromeOut =
    chrome_enabled || config.chrome !== undefined
      ? {
          chrome: normalizeLabelChrome({
            // The checkbox is the switch; the theme control only ever names a
            // surface that draws. Unchecking stores "none" and every number
            // survives it.
            theme: chrome_enabled ? (chrome_theme ?? "auto") : "none",
            pill: chrome_pill === true,
            radius: typeof chrome_radius === "number" ? Math.round(chrome_radius) : chrome_radius,
            padding:
              typeof chrome_padding === "number" ? Math.round(chrome_padding) : chrome_padding,
            opacity:
              typeof chrome_opacity === "number"
                ? Math.round(chrome_opacity) / 100
                : chrome_opacity,
          }),
        }
      : {};
  return {
    ...(rest as Omit<StateLabelConfig, "type" | "size" | "chrome" | "halo">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    show_name: shown.includes("name"),
    show_state: shown.includes("state"),
    halo: halo_enabled === true,
    size: normalizeElementSize(
      {
        mode: size_mode,
        min: typeof size_min === "number" ? Math.round(size_min) : size_min,
        ratio: typeof size_ratio === "number" ? Math.round(size_ratio) : size_ratio,
        max: typeof size_max === "number" ? Math.round(size_max) : size_max,
        value: typeof size_value === "number" ? Math.round(size_value) : size_value,
      },
      DEFAULT_LABEL_SIZE,
    ),
    ...chromeOut,
  };
};
