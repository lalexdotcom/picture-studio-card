import { html } from "lit";
import type { ImageElementConfig } from "../config";
import { localizeOwn } from "../strings";
import type { KindForm, KindFormContext } from "./element-form";
import {
  backgroundData,
  backgroundSchema,
  entitySchema,
  filtersSchema,
  mergeBackground,
} from "./form-schemas";
import { PLACEMENT_ICON } from "./icons";
import { iconInteractionsSchema } from "./state-icon-form";

/**
 * The checkbox is derived from `height === undefined` and is never stored: a
 * boolean beside a height would be two sources for one fact.
 *
 * It is also scaffolding. At sub-project 2 keep-ratio becomes the constrained
 * default of the corner handle and this field disappears — the config does not
 * change when it does, which is the argument that the config was right.
 */
export const KEEP_RATIO = "keep_ratio";

const NO_ASPECT_RATIO = { aspectRatio: false } as const;

/**
 * The height to write when the box is freed.
 *
 * A later task measures it off the preview so the box does not jump when
 * keep-ratio is cleared — the same route `reanchor` uses, and for the same
 * reason: only the card knows pixels. For now we fall back to the item's own
 * width, which gives a square box rather than a collapsed one.
 */
/**
 * The height to write when the box is freed, measured rather than invented.
 *
 * The measured value comes from the card preview via the editor; the fallback
 * to `config.width` gives a square box when no preview is available (tests,
 * a form opened before the card laid out).
 */
const freedHeight = (measured: number | undefined, config: ImageElementConfig): number =>
  typeof measured === "number" && measured > 0 ? measured : config.width;

export const imageForm: KindForm<ImageElementConfig> = {
  toFormData(config: ImageElementConfig): Record<string, unknown> {
    return {
      ...backgroundData(config),
      ...(config.entity !== undefined ? { entity: config.entity } : {}),
      ...(config.state_image !== undefined ? { state_image: config.state_image } : {}),
      ...(config.state_filter !== undefined ? { state_filter: config.state_filter } : {}),
      ...(config.filter !== undefined ? { filter: config.filter } : {}),
      ...(config.dark_mode_filter !== undefined
        ? { dark_mode_filter: config.dark_mode_filter }
        : {}),
      width: config.width,
      ...(config.height !== undefined ? { height: config.height } : {}),
      [KEEP_RATIO]: config.height === undefined,
      ...(config.tap_action !== undefined ? { tap_action: config.tap_action } : {}),
      ...(config.hold_action !== undefined ? { hold_action: config.hold_action } : {}),
      ...(config.double_tap_action !== undefined
        ? { double_tap_action: config.double_tap_action }
        : {}),
    };
  },

  fromFormData(config: ImageElementConfig, data: Record<string, unknown>): ImageElementConfig {
    const { [KEEP_RATIO]: keep, height, __measuredHeight, ...fields } = data;
    const next = mergeBackground(config, fields, NO_ASPECT_RATIO);
    const width =
      typeof fields.width === "number" && fields.width > 0 ? fields.width : config.width;
    if (keep === true) {
      const { height: _drop, ...kept } = { ...next, width };
      return kept as ImageElementConfig;
    }
    const chosen =
      typeof height === "number" && height > 0
        ? height
        : freedHeight(typeof __measuredHeight === "number" ? __measuredHeight : undefined, config);
    return { ...next, width, height: chosen };
  },

  render(ctx: KindFormContext<ImageElementConfig>): unknown {
    const { element, hass, data, label, helper, valueChanged, anchor } = ctx;
    const keepRatio = data[KEEP_RATIO] !== false;

    const boxSchema = [
      {
        name: "width",
        selector: { number: { min: 1, mode: "box", step: 0.5, unit_of_measurement: "%" } },
      },
      { name: KEEP_RATIO, selector: { boolean: {} } },
      ...(keepRatio
        ? []
        : [
            {
              name: "height",
              selector: { number: { min: 1, mode: "box", step: 0.5, unit_of_measurement: "%" } },
            },
          ]),
    ];

    return html`
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:image"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "section_image")}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${backgroundSchema(hass.localize, element, { aspectRatio: false })}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:image-auto-adjust"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "section_entity")}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${entitySchema(hass.localize)}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:image-filter-black-white"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "section_filters")}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${filtersSchema(hass.localize)}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" .icon=${PLACEMENT_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "size_and_position")}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${boxSchema}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${valueChanged}
          ></ha-form>
          <div class="separator"></div>
          <span class="section-label">${localizeOwn(hass, "anchor")}</span>
          <picture-studio-anchor-picker
            .hass=${hass}
            .anchor=${anchor}
          ></picture-studio-anchor-picker>
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
    `;
  },
};
