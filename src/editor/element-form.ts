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
  "M9,9H11V7.5A2.5,2.5 0 0,1 13.5,5A2.5,2.5 0 0,1 16,7.5V9H18A2,2 0 0,1 20,11V15H18.5A2.5,2.5 0 0,0 16,17.5A2.5,2.5 0 0,0 18.5,20H20V22H4V11A2,2 0 0,1 6,9H9Z";

export const stateIconSchema = (_localize: LocalizeFunc, auto: boolean): unknown[] => [
  { name: "entity", selector: { entity: {} } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    iconPath: CONTENT_PATH,
    schema: [
      {
        name: "",
        type: "grid",
        schema: [
          { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
          {
            name: "color",
            selector: { ui_color: { default_color: "state", include_state: true } },
          },
        ],
      },
      { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
      { name: "show_entity_picture", selector: { boolean: {} } },
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
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: fromFormData(this.element, ev.detail.value) },
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
        .schema=${stateIconSchema(hass.localize, element.size.auto)}
        .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <picture-studio-anchor-picker
        .hass=${hass}
        .anchor=${this.anchor}
      ></picture-studio-anchor-picker>
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
