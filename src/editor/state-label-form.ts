import { DEFAULT_LABEL_CHROME, normalizeLabelChrome } from "../chrome";
import { normalizeLabelShow, type StateLabelConfig } from "../config";
import { DEFAULT_LABEL_SIZE } from "../element-size";
import type { LocalizeFunc } from "../types";
import { sizeFromFormFields, sizeSchema, sizeToFormFields } from "./element-size-form";
export const labelEntitySchema = (): unknown[] => [{ name: "entity", selector: { entity: {} } }];

export const labelContentInnerSchema = (
  showTimeFormat: boolean,
  localize: LocalizeFunc,
): unknown[] => [
  { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
  {
    name: "color",
    // Second, right after the name, which is where every other form in this
    // editor and Home Assistant's own entity badge put it. It used to sit last;
    // the order is the only thing that changed.
    // include_state since 1.4.0: src/state-color.ts rebuilds Home Assistant's
    // own recipe, so a label honours "state" exactly as an icon does. The
    // default stays "none" — a label is text first, and text that changes
    // colour on its own is a choice, not a default. See the spec, decision 6.
    selector: {
      ui_color: { default_color: "none", include_none: true, include_state: true },
    },
  },
  {
    name: "displayed_elements",
    selector: {
      select: {
        mode: "list",
        multiple: true,
        options: ["name", "state"].map((value) => ({
          value,
          label:
            localize(`ui.panel.lovelace.editor.badge.entity.displayed_elements_options.${value}`) ||
            value,
        })),
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
];

export const labelInteractionsSchema = (): unknown[] => [
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

export const labelSchema = (showTimeFormat: boolean, localize: LocalizeFunc): unknown[] => [
  ...labelEntitySchema(),
  {
    name: "content",
    type: "expandable",
    flatten: true,
    icon: "mdi:text-short",
    schema: labelContentInnerSchema(showTimeFormat, localize),
  },
  ...labelInteractionsSchema(),
];

/** Sizing is one idea for both kinds — see `element-size-form.ts`. */
export const labelSizeSchema = sizeSchema;

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
  const { size, chrome, halo, show, ...rest } = config;
  const c = chrome ?? DEFAULT_LABEL_CHROME;
  return {
    ...rest,
    displayed_elements: [...show],
    ...sizeToFormFields(size),
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
    // The control's own value, normalized rather than trusted: ha-form hands
    // back whatever was in `.data`, and the model owns the shape.
    show: normalizeLabelShow(shown),
    halo: halo_enabled === true,
    size: sizeFromFormFields(data, DEFAULT_LABEL_SIZE),
    ...chromeOut,
  };
};
