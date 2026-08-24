import { html, nothing } from "lit";
import { DEFAULT_LABEL_CHROME, normalizeLabelChrome } from "../chrome";
import { normalizeLabelShow, type StateLabelConfig } from "../config";
import { DEFAULT_LABEL_SIZE } from "../element-size";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";
import type { KindForm, KindFormContext } from "./element-form";
import { sizeFromFormFields, sizeSchema, sizeToFormFields } from "./element-size-form";
import { PLACEMENT_ICON } from "./icons";
import { elementShowsNothing } from "./items";
import {
  appearanceToggleSchema,
  themeModeLabel,
  themeModeTitle,
  themeSelectRow,
} from "./state-icon-form";
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

// ---------------------------------------------------------------------------
// Time-based detection (mirrors HA's entity-badge editor; label-only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// KindForm implementation for state-label
// ---------------------------------------------------------------------------

/**
 * The `KindForm` implementation for state-label elements.
 * `toFormData` and `fromFormData` delegate to the existing flat functions;
 * `render` produces every section from the entity row to the appearance panel
 * (the shell keeps only the header, go-back, and visibility section).
 */
export const labelForm: KindForm<StateLabelConfig> = {
  toFormData: labelToFormData,
  fromFormData: labelFromFormData,
  render(ctx: KindFormContext<StateLabelConfig>): unknown {
    const {
      element,
      hass,
      data,
      label,
      helper,
      valueChanged,
      modeChanged,
      chromeThemeChanged,
      pillChanged,
      radioGroupAvailable,
      switchAvailable,
    } = ctx;
    // Mirrors the entity-badge editor's Rf check: show time_format only when
    // the selected state_content carries a time value.
    const showTimeFormat = stateLabelIsTimeBased(element, hass);
    // The warning marker: a state-label whose show list is empty displays
    // nothing at all. The very predicate the item list marks its row with, so
    // the two cannot come to disagree about what that means.
    const showEmptyWarning = elementShowsNothing(element);
    return html`
      <ha-form
        .hass=${hass}
        .data=${data}
        .schema=${labelEntitySchema()}
        .computeLabel=${label}
        .computeHelper=${helper}
        @value-changed=${valueChanged}
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
            .schema=${labelContentInnerSchema(showTimeFormat, hass.localize)}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
      <ha-form
        .hass=${hass}
        .data=${data}
        .schema=${labelInteractionsSchema()}
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
            .schema=${labelSizeSchema(element.size.mode, hass.localize, hass, radioGroupAvailable)}
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
                                @change=${pillChanged}
                              ></ha-switch>
                            </div>
                          `
                        : html`
                            <ha-form
                              .hass=${hass}
                              .data=${data}
                              .schema=${labelPillSchema()}
                              .computeLabel=${label}
                              @value-changed=${valueChanged}
                            ></ha-form>
                          `
                    }
                    <div class="pill-separator"></div>
                    <ha-form
                      .hass=${hass}
                      .data=${data}
                      .schema=${labelRadiusSchema()}
                      .computeLabel=${label}
                      @value-changed=${valueChanged}
                    ></ha-form>
                  </div>
                  <ha-form
                    .hass=${hass}
                    .data=${data}
                    .schema=${labelChromeSchema(hass.localize)}
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
