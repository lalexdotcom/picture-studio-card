import { css, html, LitElement, nothing } from "lit";
import type { ElementConfig, StateIconConfig } from "../config";
import { normalizeIconSize } from "../element-size";
import type { Anchor } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";
import { PLACEMENT_ICON } from "./icons";

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
          @click=${() =>
            this.dispatchEvent(new CustomEvent("go-back", { bubbles: true, composed: true }))}
          ><ha-icon icon="mdi:arrow-left"></ha-icon></ha-icon-button>
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
        <ha-icon slot="leading-icon" .icon=${PLACEMENT_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "size_and_position")}
        </div>
        <div class="content">
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
        </div>
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
    /* Mirrors ha-form-expandable: the panel's own content padding is zeroed and
       the section supplies its own, so our sections sit exactly like Home
       Assistant's own expandable sections. */
    ha-expansion-panel {
      display: block;
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
    ha-icon[slot="leading-icon"] {
      color: var(--secondary-text-color);
    }
  `;
}
