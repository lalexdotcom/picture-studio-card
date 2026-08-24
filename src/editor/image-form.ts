import { nothing } from "lit";
import type { ImageElementConfig } from "../config";
import type { KindForm } from "./element-form";
import { backgroundData, mergeBackground } from "./form-schemas";

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
const freedHeight = (config: ImageElementConfig): number => config.width;

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
    const { [KEEP_RATIO]: keep, height, ...fields } = data;
    const next = mergeBackground(config, fields, NO_ASPECT_RATIO);
    const width =
      typeof fields.width === "number" && fields.width > 0 ? fields.width : config.width;
    if (keep === true) {
      const { height: _drop, ...kept } = { ...next, width };
      return kept as ImageElementConfig;
    }
    const chosen = typeof height === "number" && height > 0 ? height : freedHeight(config);
    return { ...next, width, height: chosen };
  },

  render(/* ctx */) {
    // Render is a later task's. The kind is not offered by the editor's catalogue
    // yet, so no user can reach this form.
    return nothing;
  },
};
