import { html } from "lit";
import type { ImageElementConfig } from "../config";
import { defaultActionName, IMAGE_KIND } from "../element-kinds";
import { ratioIsForced } from "../image-box";
import { localizeOwn } from "../strings";
import type { KindForm, KindFormContext } from "./element-form";
import {
  backgroundData,
  backgroundSchema,
  entitySchema,
  filtersSchema,
  mergeBackground,
  PICTURE_ENTITY,
} from "./form-schemas";
import { PLACEMENT_ICON } from "./icons";

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
 * The image kind's own interactions, differing from the icon's in one value:
 * `tap_action` defaults to **none**, not more-info.
 *
 * `default_action` is what the selector DISPLAYS when the config carries
 * nothing. The icon can show more-info honestly, because an absent action there
 * really does behave as more-info. An image with no action does nothing at all,
 * so showing more-info would promise a behaviour that never happens — which is
 * exactly what it did, and what someone reported after clicking an image and
 * watching nothing occur.
 */
const imageInteractionsSchema = (): unknown[] => [
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    icon: "mdi:gesture-tap",
    schema: [
      {
        name: "tap_action",
        selector: { ui_action: { default_action: defaultActionName(IMAGE_KIND, "tap_action") } },
      },
      {
        name: "",
        type: "optional_actions",
        flatten: true,
        schema: (["hold_action", "double_tap_action"] as const).map((name) => ({
          name,
          selector: { ui_action: { default_action: defaultActionName(IMAGE_KIND, name) } },
        })),
      },
    ],
  },
];

/**
 * The height to write when the box is freed, measured rather than invented.
 *
 * The measured value comes from the card preview via the editor; the fallback
 * to `config.width` gives a square box when no preview is available — no
 * preview to measure means we hand the user a value they can already see and
 * change, and a square box is the least surprising starting point.
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

    // mergeBackground / sectionMerge writes only the keys the background schema
    // rendered. Every other field the form collected — entity, filter,
    // state_image, tap_action, etc. — passes through `fields` without being
    // applied, silently. Apply them here so edits to the Entity, Filters, and
    // Interactions sections reach the config.
    const bgOwned = new Set(["image", "dark_mode_image", PICTURE_ENTITY, "camera_view", "width"]);
    const out = next as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) {
      if (bgOwned.has(k)) continue;
      if (v === undefined || v === null || v === "") delete out[k];
      else out[k] = v;
    }

    // A forced ratio must not be persisted. The checkbox reads as ticked and is
    // disabled while a live camera is chosen, so every other field in that same
    // ha-form emits `keep_ratio: true` alongside itself — and acting on it would
    // delete a height the user typed the moment they nudged the width. The
    // height stays exactly as it is until the camera view leaves Live.
    if (ratioIsForced(next)) return { ...out, width } as ImageElementConfig;

    if (keep === true) {
      delete out.height;
      return { ...out, width } as ImageElementConfig;
    }
    const chosen =
      typeof height === "number" && height > 0
        ? height
        : freedHeight(typeof __measuredHeight === "number" ? __measuredHeight : undefined, config);
    return { ...out, width, height: chosen } as ImageElementConfig;
  },

  render(ctx: KindFormContext<ImageElementConfig>): unknown {
    const { element, hass, data, label, helper, valueChanged, anchor } = ctx;
    // A live camera keeps its own proportions whatever the config asks for, so
    // the checkbox reads as ticked and is disabled: a control that cannot act
    // says so before the click, not after it. The height itself is untouched —
    // `fromFormData` refuses to write it while this holds — so leaving Live
    // gives the user their value back.
    const forced = ratioIsForced(element);
    const keepRatio = forced || data[KEEP_RATIO] !== false;

    const boxSchema = [
      {
        name: "width",
        selector: { number: { min: 1, mode: "box", step: 0.5, unit_of_measurement: "%" } },
      },
      { name: KEEP_RATIO, selector: { boolean: {} }, ...(forced ? { disabled: true } : {}) },
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
      <!-- Open by default: an image element with no picture draws nothing at
           all, so the section that sets one is what a freshly added item always
           needs. The card's own Background section is opened for the same
           reason.

           The property is \`expanded\`, not \`open\` — read out of
           ha-expansion-panel in frontend build 20260729.6, whose render is
           driven by \`this.expanded\` throughout. A first attempt used \`open\`,
           which the component never reads: the panel stayed shut and the test
           passed anyway, because it asserted our own markup instead of the
           property Home Assistant acts on. Bound as a property, not an
           attribute, so nothing depends on attribute reflection. -->
      <ha-expansion-panel outlined .expanded=${true}>
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
            .warning=${
              // ha-form's own per-field channel: it renders an ha-alert at the
              // field, in Home Assistant's styling and margins. Keyed by field
              // name, like `error`. Verified against frontend build 20260729.6,
              // where _computeWarning returns the raw value when no
              // computeWarning is supplied — so the text can be passed directly.
              forced ? { camera_view: localizeOwn(hass, "live_camera_ratio") } : undefined
            }
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
            .data=${forced ? { ...data, [KEEP_RATIO]: true } : data}
            .schema=${boxSchema}
            .computeLabel=${label}
            .computeHelper=${(field: { name: string }) =>
              // The checkbox's legend, on the checkbox: it is disabled and
              // ticked, and this is what says why without the reader having to
              // connect it to the warning three sections above.
              forced && field.name === KEEP_RATIO
                ? localizeOwn(hass, "keep_ratio_forced")
                : helper(field)}
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
        .schema=${imageInteractionsSchema()}
        .computeLabel=${label}
        .computeHelper=${helper}
        @value-changed=${valueChanged}
      ></ha-form>
    `;
  },
};
