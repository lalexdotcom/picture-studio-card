import { describe, expect, it } from "@rstest/core";
import {
  sizeFromFormFields,
  sizeSchema,
  sizeToFormFields,
} from "../../../editor/element-size-form";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "../../../element-size";

const localize = ((key: string) => `L:${key}`) as never;

/** Navigate a chain of keys through unknown values without using `any`. */
const get = (obj: unknown, ...keys: string[]): unknown => {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
};

const find = (schema: unknown[], name: string): Record<string, unknown> | undefined => {
  for (const entry of schema as Record<string, unknown>[]) {
    if (entry.name === name) return entry;
    const nested = entry.schema as unknown[] | undefined;
    const hit = nested && find(nested, name);
    if (hit) return hit;
  }
  return undefined;
};

describe("sizeSchema", () => {
  // --- Fallback path (radioGroupAvailable = false, the default) ---
  it("auto: contains size_mode and no numeric fields (fallback path)", () => {
    const schema = sizeSchema("auto", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeUndefined();
    expect(find(schema, "size_min")).toBeUndefined();
    expect(find(schema, "size_max")).toBeUndefined();
    expect(find(schema, "size_value")).toBeUndefined();
  });

  it("adaptive: contains size_mode, size_ratio, size_min, size_max — no size_value (fallback path)", () => {
    const schema = sizeSchema("adaptive", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeDefined();
    expect(find(schema, "size_min")).toBeDefined();
    expect(find(schema, "size_max")).toBeDefined();
    expect(find(schema, "size_value")).toBeUndefined();
  });

  it("fixed: contains size_mode and size_value — no adaptive fields (fallback path)", () => {
    const schema = sizeSchema("fixed", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_value")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeUndefined();
    expect(find(schema, "size_min")).toBeUndefined();
    expect(find(schema, "size_max")).toBeUndefined();
  });

  it("size_mode field uses a select with mode: list and three options", () => {
    const schema = sizeSchema("auto", localize, undefined);
    const field = find(schema, "size_mode");
    expect(get(field, "selector", "select", "mode")).toBe("list");
    const options = get(field, "selector", "select", "options");
    const values = Array.isArray(options)
      ? (options as Record<string, unknown>[]).map((o) => o.value)
      : undefined;
    expect(values).toEqual(["auto", "adaptive", "fixed"]);
  });

  // --- Radio-group path (radioGroupAvailable = true) ---
  it("omits size_mode when radioGroupAvailable is true (radio group path)", () => {
    expect(find(sizeSchema("auto", localize, undefined, true), "size_mode")).toBeUndefined();
    expect(find(sizeSchema("adaptive", localize, undefined, true), "size_mode")).toBeUndefined();
    expect(find(sizeSchema("fixed", localize, undefined, true), "size_mode")).toBeUndefined();
  });

  it("includes size_mode when radioGroupAvailable is false (fallback path)", () => {
    expect(find(sizeSchema("auto", localize, undefined, false), "size_mode")).toBeDefined();
    expect(find(sizeSchema("adaptive", localize, undefined, false), "size_mode")).toBeDefined();
    expect(find(sizeSchema("fixed", localize, undefined, false), "size_mode")).toBeDefined();
  });

  it("numeric rows per mode are unchanged regardless of radioGroupAvailable", () => {
    for (const rga of [true, false] as const) {
      const adaptive = sizeSchema("adaptive", localize, undefined, rga);
      expect(find(adaptive, "size_ratio")).toBeDefined();
      expect(find(adaptive, "size_min")).toBeDefined();
      expect(find(adaptive, "size_max")).toBeDefined();
      expect(find(adaptive, "size_value")).toBeUndefined();

      const fixed = sizeSchema("fixed", localize, undefined, rga);
      expect(find(fixed, "size_value")).toBeDefined();
      expect(find(fixed, "size_ratio")).toBeUndefined();

      const auto = sizeSchema("auto", localize, undefined, rga);
      expect(find(auto, "size_ratio")).toBeUndefined();
      expect(find(auto, "size_value")).toBeUndefined();
    }
  });

  it("size_ratio has no mode: box and spans 1 to 100", () => {
    const adaptive = sizeSchema("adaptive", localize, undefined);
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "mode")).toBeUndefined();
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "min")).toBe(1);
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "max")).toBe(100);
  });

  it("adaptive pixel bounds (size_min, size_max) keep mode: box", () => {
    const adaptive = sizeSchema("adaptive", localize, undefined);
    expect(get(find(adaptive, "size_min"), "selector", "number", "mode")).toBe("box");
    expect(get(find(adaptive, "size_max"), "selector", "number", "mode")).toBe("box");
  });

  it("fixed size_value is a slider from 8 to 128", () => {
    const fixed = sizeSchema("fixed", localize, undefined);
    expect(get(find(fixed, "size_value"), "selector", "number", "mode")).toBeUndefined();
    expect(get(find(fixed, "size_value"), "selector", "number", "min")).toBe(8);
    expect(get(find(fixed, "size_value"), "selector", "number", "max")).toBe(128);
  });
});

/**
 * The rounding both directions owe the sliders, and the reason this module
 * exists: it used to be written once per element kind, over the same
 * `ElementSize` type — so nothing would have reported the two drifting apart.
 */
describe("sizeToFormFields", () => {
  it("emits every size key whatever the mode, so switching modes loses nothing", () => {
    const flat = sizeToFormFields({ mode: "auto", min: 20, ratio: 8, max: 60, value: 40 });
    expect(Object.keys(flat).sort()).toEqual([
      "size_max",
      "size_min",
      "size_mode",
      "size_ratio",
      "size_value",
    ]);
  });

  it("rounds each number to the step:1 the sliders declare", () => {
    const flat = sizeToFormFields({
      mode: "adaptive",
      min: 20.4,
      ratio: 8.6,
      max: 59.5,
      value: 40.49,
    });
    expect(flat).toMatchObject({
      size_mode: "adaptive",
      size_min: 20,
      size_ratio: 9,
      size_max: 60,
      size_value: 40,
    });
  });

  it("leaves a non-number alone rather than coercing it", () => {
    // Whatever the config held travels on to the normalizer, which is the one
    // place allowed to judge it.
    const flat = sizeToFormFields({ mode: "auto" } as never);
    expect(flat.size_min).toBeUndefined();
    expect(flat.size_ratio).toBeUndefined();
  });
});

describe("sizeFromFormFields", () => {
  it("rounds on the way back too", () => {
    const size = sizeFromFormFields(
      { size_mode: "adaptive", size_min: 20.4, size_ratio: 8.6, size_max: 59.5, size_value: 40 },
      DEFAULT_ICON_SIZE,
    );
    expect(size).toMatchObject({ mode: "adaptive", min: 20, ratio: 9, max: 60 });
  });

  it("falls back to the kind's own default, which is where the two callers differ", () => {
    const asIcon = sizeFromFormFields({}, DEFAULT_ICON_SIZE);
    const asLabel = sizeFromFormFields({}, DEFAULT_LABEL_SIZE);
    expect(asIcon).toEqual(DEFAULT_ICON_SIZE);
    expect(asLabel).toEqual(DEFAULT_LABEL_SIZE);
  });

  it("hands an unreadable mode to the normalizer rather than trusting it", () => {
    const size = sizeFromFormFields({ size_mode: "sideways" }, DEFAULT_ICON_SIZE);
    expect(size.mode).toBe(DEFAULT_ICON_SIZE.mode);
  });

  it("round-trips a size through the form and back unchanged", () => {
    const original = DEFAULT_LABEL_SIZE;
    expect(sizeFromFormFields(sizeToFormFields(original), DEFAULT_LABEL_SIZE)).toEqual(original);
  });
});
