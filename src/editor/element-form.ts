import { css, html, LitElement, nothing } from "lit";
import type { ElementConfig, StateIconConfig } from "../config";
import { normalizeIconSize } from "../element-size";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";

const BACK_PATH = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
/** mdiTextShort and mdiGestureTap, the icons Home Assistant puts on these sections. */
const CONTENT_PATH = "M4,9H20V11H4V9M4,13H14V15H4V13Z";
const ACTIONS_PATH =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";
/** mdiMoveResize */
const SIZE_POSITION_PATH =
  "M9,1V2H10V5H9V6H12V5H11V2H12V1M9,7C7.89,7 7,7.89 7,9V21C7,22.11 7.89,23 9,23H21C22.11,23 23,22.11 23,21V9C23,7.89 22.11,7 21,7M1,9V12H2V11H5V12H6V9H5V10H2V9M9,9H21V21H9M14,10V11H15V16H11V15H10V18H11V17H15V19H14V20H17V19H16V17H19V18H20V15H19V16H16V11H17V10";

export const stateIconSchema = (): unknown[] => [
  { name: "entity", selector: { entity: {} } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    iconPath: CONTENT_PATH,
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
    iconPath: ACTIONS_PATH,
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
  const { size, ...rest } = config;
  return {
    ...rest,
    auto_size: size.auto,
    size_min: size.min,
    size_ratio: size.ratio,
    size_max: size.max,
  };
};

export const fromFormData = (
  config: StateIconConfig,
  data: Record<string, unknown>,
): StateIconConfig => {
  const { auto_size, size_min, size_ratio, size_max, ...rest } = data;
  return {
    ...(rest as Omit<StateIconConfig, "type" | "size">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    size: normalizeIconSize({
      auto: auto_size !== false,
      min: size_min,
      ratio: size_ratio,
      max: size_max,
    }),
  };
};

/** Home Assistant's own mapping, plus the two keys its catalogue has not got. */
export const elementFormLabel = (
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
  name: string,
): string => {
  if (name === "auto_size") return localize("ui.common.auto") || "Automatic";
  if (name === "size_min")
    return localize("ui.panel.lovelace.editor.card.generic.minimum") || "Minimum";
  if (name === "size_max")
    return localize("ui.panel.lovelace.editor.card.generic.maximum") || "Maximum";
  if (name === "size_ratio") return localizeOwn(hass, "ratio");
  if (name === "color" || name === "show_entity_picture") {
    return localize(`ui.panel.lovelace.editor.badge.entity.${name}`) || name;
  }
  return localize(`ui.panel.lovelace.editor.card.generic.${name}`) || name;
};

export const stateIconSizeSchema = (auto: boolean): unknown[] => [
  { name: "auto_size", selector: { boolean: {} } },
  {
    name: "",
    type: "grid",
    schema: [
      {
        name: "size_min",
        selector: { number: { min: 8, max: 400, step: 1, unit_of_measurement: "px" } },
        disabled: auto,
      },
      {
        name: "size_ratio",
        selector: { number: { min: 0, max: 100, step: 0.1, unit_of_measurement: "%" } },
        disabled: auto,
      },
      {
        name: "size_max",
        selector: { number: { min: 8, max: 400, step: 1, unit_of_measurement: "px" } },
        disabled: auto,
      },
    ],
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
  };

  declare hass?: HomeAssistant;
  declare element?: ElementConfig;
  declare anchor?: Anchor;

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

  protected render() {
    const element = this.element;
    const hass = this.hass;
    if (!element || !hass) return nothing;

    return html`
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          .path=${BACK_PATH}
          @click=${() =>
            this.dispatchEvent(new CustomEvent("go-back", { bubbles: true, composed: true }))}
        ></ha-icon-button>
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
        <ha-svg-icon
          slot="leading-icon"
          .path=${SIZE_POSITION_PATH}
        ></ha-svg-icon>
        <span slot="header">${localizeOwn(hass, "size_and_position")}</span>
        <ha-form
          .hass=${hass}
          .data=${toFormData(element)}
          .schema=${stateIconSizeSchema(element.size.auto)}
          .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
          @value-changed=${this._valueChanged}
        ></ha-form>
        <picture-studio-anchor-picker
          .hass=${hass}
          .anchor=${this.anchor}
        ></picture-studio-anchor-picker>
      </ha-expansion-panel>
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
      margin-bottom: var(--ha-space-3);
    }
  `;
}
