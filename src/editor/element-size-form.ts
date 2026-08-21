import { type ElementSize, normalizeElementSize } from "../element-size";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";

/**
 * How an element's size is asked for, and how it travels between the config and
 * `ha-form`'s flat record.
 *
 * Both element kinds size themselves the same way — the same three modes, the
 * same bounds, the same rounding — and the two form modules had a byte-for-byte
 * copy of each. Sizing is one idea, so it is stated once, here, and the kinds
 * that differ keep only what actually differs: an icon's content ratio, a
 * label's pill and padding, which live with their own chrome.
 */

type SizeMode = "auto" | "adaptive" | "fixed";

/** Every size key `ha-form` carries, flat, as the form names them. */
export const SIZE_FIELDS = [
  "size_mode",
  "size_min",
  "size_ratio",
  "size_max",
  "size_value",
] as const;

/**
 * The rounding both directions owe the sliders.
 *
 * Each numeric size field declares `step: 1`, and this is what enforces it. A
 * hand-written value with finer precision is rounded the first time the editor
 * commits anything for that item — a deliberate trade, and the editor's alone:
 * the read path (`normalizeElementSize`) keeps any finite number as written.
 * Anything that is not a number is handed back untouched for the normalizer to
 * judge.
 */
const rounded = (value: unknown): unknown =>
  typeof value === "number" ? Math.round(value) : value;

/**
 * The size rows for the mode in play — and only those, so a mode never shows
 * another mode's numbers.
 *
 * `radioGroupAvailable` says the caller draws `ha-radio-group` itself, in which
 * case the mode is not repeated here. When it cannot, `size_mode` stays as an
 * `ha-form` select: vertical rather than horizontal, but guaranteed to render,
 * because `ha-selector` pulls its own sub-components and nothing proves a bare
 * `ha-radio-group` chunk is loaded in our dialog.
 */
export const sizeSchema = (
  mode: SizeMode,
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
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
        selector: {
          // A percentage of the card's width is a value you feel rather than
          // type, so size_ratio gets a slider (no mode: "box"). The two adaptive
          // pixel bounds keep "box" because exact pixel values are typed, not
          // dragged. The fixed size is also a slider — a value you feel.
          number: { min: 1, max: 100, step: 1, unit_of_measurement: "%" },
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

/**
 * The size, flattened into the keys `ha-form` reads.
 *
 * Every field is emitted whatever the mode, on purpose: `ha-form` merges the
 * changed child onto the `.data` it was handed and re-emits the whole record, so
 * a field absent from `.data` is a field the user loses by switching modes.
 */
export const sizeToFormFields = (size: ElementSize): Record<string, unknown> => ({
  size_mode: size.mode,
  size_min: rounded(size.min),
  size_ratio: rounded(size.ratio),
  size_max: rounded(size.max),
  size_value: rounded(size.value),
});

/**
 * The size read back out of that flat record.
 *
 * `fallback` is the kind's own default, which is where the two callers legitimately
 * differ — an icon and a label do not start at the same size. Validation is left
 * to `normalizeElementSize`, the same gate the YAML path goes through, so a form
 * cannot write a size the config would have refused.
 */
export const sizeFromFormFields = (
  data: Record<string, unknown>,
  fallback: ElementSize,
): ElementSize =>
  normalizeElementSize(
    {
      mode: data.size_mode,
      min: rounded(data.size_min),
      ratio: rounded(data.size_ratio),
      max: rounded(data.size_max),
      value: rounded(data.size_value),
    },
    fallback,
  );
