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
    size_mode: size.mode,
    size_min: size.min,
    size_ratio: size.ratio,
    size_max: size.max,
    size_value: size.value,
  };
};

export const fromFormData = (
  config: StateIconConfig,
  data: Record<string, unknown>,
): StateIconConfig => {
  // Invariant: `data` must be the complete flat record (all five size fields
  // present, whether or not the active schema shows them). ha-form enforces this:
  // its value-changed handler merges the changed child onto the `.data` it was
  // given and re-emits the whole thing —
  //   this.data = { ...this.data, ...newValue };
  //   fireEvent(this, "value-changed", { value: this.data });
  // — so every field we pass to `.data` comes back regardless of which rows the
  // current mode's schema is showing. Passing `toFormData(element)` (all five
  // fields) as `.data` is therefore what keeps the non-visible fields alive.
  const { size_mode, size_min, size_ratio, size_max, size_value, ...rest } = data;
  return {
    ...(rest as Omit<StateIconConfig, "type" | "size">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    size: normalizeIconSize({
      mode: size_mode,
      min: size_min,
      ratio: size_ratio,
      max: size_max,
      value: size_value,
    }),
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
  return localize(`ui.panel.lovelace.editor.card.generic.${name}`) || name;
};

export const stateIconSizeSchema = (
  mode: "auto" | "adaptive" | "fixed",
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
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
  if (mode === "adaptive") {
    return [
      modeField,
      {
        name: "size_ratio",
        selector: {
          number: { min: 0, max: 100, step: 0.1, unit_of_measurement: "%", mode: "box" },
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
      modeField,
      {
        name: "size_value",
        selector: { number: { min: 8, max: 400, step: 1, unit_of_measurement: "px", mode: "box" } },
      },
    ];
  }
  // auto — no numeric fields
  return [modeField];
};

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
            .schema=${stateIconSizeSchema(element.size.mode, hass.localize, hass)}
            .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
            @value-changed=${this._valueChanged}
          ></ha-form>
          <div class="separator"></div>
          <div class="anchor-heading">${localizeOwn(hass, "anchor")}</div>
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
      /* Matches ha-form's own root-child spacing (24px) so the four sections
         sit evenly — the main form, content, interactions, and this panel. */
      margin-bottom: var(--ha-space-6, 24px);
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
    .separator {
      border-top: 1px solid var(--divider-color);
      margin: var(--ha-space-3, 12px) 0;
    }
    .anchor-heading {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      margin-bottom: var(--ha-space-2, 8px);
    }
    ha-icon[slot="leading-icon"] {
      color: var(--secondary-text-color);
    }
  `;
}
