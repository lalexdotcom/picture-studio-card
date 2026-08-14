import { describe, expect, it } from "@rstest/core";
import {
  elementFormHelper,
  elementFormLabel,
  fromFormData,
  stateIconSchema,
  stateIconSizeSchema,
  toFormData,
} from "../../editor/element-form";
import { DEFAULT_ICON_SIZE } from "../../element-size";

const base = { type: "state-icon" as const, size: DEFAULT_ICON_SIZE };
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

describe("stateIconSchema", () => {
  it("puts the name first, then colour, icon, and picture in one grid", () => {
    const content = find(stateIconSchema(), "content");
    const names = (
      (content?.schema ?? []) as { name: string; schema?: { name: string }[] }[]
    ).flatMap((entry) => (entry.schema ? entry.schema.map((s) => s.name) : [entry.name]));
    expect(names.slice(0, 4)).toEqual(["name", "color", "icon", "show_entity_picture"]);
  });

  it("does not contain the size fields (they live in stateIconSizeSchema)", () => {
    expect(find(stateIconSchema(), "size_min")).toBeUndefined();
    expect(find(stateIconSchema(), "size_ratio")).toBeUndefined();
    expect(find(stateIconSchema(), "size_max")).toBeUndefined();
    expect(find(stateIconSchema(), "size_mode")).toBeUndefined();
    expect(find(stateIconSchema(), "size_value")).toBeUndefined();
  });

  it("offers hold and double tap as optional actions", () => {
    expect(find(stateIconSchema(), "hold_action")).toBeDefined();
    expect(find(stateIconSchema(), "double_tap_action")).toBeDefined();
  });
});

describe("stateIconSizeSchema", () => {
  it("auto: contains only the size_mode radio field, no numeric fields", () => {
    const schema = stateIconSizeSchema("auto", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeUndefined();
    expect(find(schema, "size_min")).toBeUndefined();
    expect(find(schema, "size_max")).toBeUndefined();
    expect(find(schema, "size_value")).toBeUndefined();
  });

  it("adaptive: contains size_mode, size_ratio, size_min, size_max — no size_value", () => {
    const schema = stateIconSizeSchema("adaptive", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeDefined();
    expect(find(schema, "size_min")).toBeDefined();
    expect(find(schema, "size_max")).toBeDefined();
    expect(find(schema, "size_value")).toBeUndefined();
  });

  it("fixed: contains size_mode and size_value — no adaptive fields", () => {
    const schema = stateIconSizeSchema("fixed", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_value")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeUndefined();
    expect(find(schema, "size_min")).toBeUndefined();
    expect(find(schema, "size_max")).toBeUndefined();
  });

  it("every number field carries mode: box", () => {
    const adaptive = stateIconSizeSchema("adaptive", localize, undefined);
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "mode")).toBe("box");
    expect(get(find(adaptive, "size_min"), "selector", "number", "mode")).toBe("box");
    expect(get(find(adaptive, "size_max"), "selector", "number", "mode")).toBe("box");

    const fixed = stateIconSizeSchema("fixed", localize, undefined);
    expect(get(find(fixed, "size_value"), "selector", "number", "mode")).toBe("box");
  });

  it("size_mode field uses a select with mode: list and three options", () => {
    const schema = stateIconSizeSchema("auto", localize, undefined);
    const field = find(schema, "size_mode");
    expect(get(field, "selector", "select", "mode")).toBe("list");
    const options = get(field, "selector", "select", "options");
    const values = Array.isArray(options)
      ? (options as Record<string, unknown>[]).map((o) => o.value)
      : undefined;
    expect(values).toEqual(["auto", "adaptive", "fixed"]);
  });
});

describe("toFormData / fromFormData", () => {
  it("flattens the size into five fields", () => {
    expect(toFormData({ ...base, entity: "light.a" })).toEqual({
      type: "state-icon",
      entity: "light.a",
      size_mode: "auto",
      size_min: 40,
      size_ratio: 3.5,
      size_max: 70,
      size_value: 48,
    });
  });

  it("round-trips an adaptive size", () => {
    const config = {
      ...base,
      size: { mode: "adaptive" as const, min: 10, ratio: 1, max: 20, value: 48 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("round-trips a fixed size", () => {
    const config = {
      ...base,
      size: { mode: "fixed" as const, min: 40, ratio: 3.5, max: 70, value: 64 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("round-trips an auto size", () => {
    const config = {
      ...base,
      size: { mode: "auto" as const, min: 10, ratio: 1, max: 20, value: 32 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("switching back to auto keeps the numbers so unchecking restores them", () => {
    const config = {
      ...base,
      size: { mode: "adaptive" as const, min: 10, ratio: 1, max: 20, value: 48 },
    };
    const data = { ...toFormData(config), size_mode: "auto" };
    expect(fromFormData(config, data).size).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: 48,
    });
  });

  it("never lets a form field named type overwrite the kind", () => {
    expect(fromFormData(base, { ...toFormData(base), type: "nonsense" }).type).toBe("state-icon");
  });
});

describe("elementFormLabel", () => {
  it("uses Home Assistant's badge keys for colour and picture", () => {
    expect(elementFormLabel(localize, undefined, "color")).toBe(
      "L:ui.panel.lovelace.editor.badge.entity.color",
    );
  });

  it("uses the generic keys for everything Home Assistant knows", () => {
    expect(elementFormLabel(localize, undefined, "tap_action")).toBe(
      "L:ui.panel.lovelace.editor.card.generic.tap_action",
    );
  });

  it("uses ours only for the fields the catalogue has not got", () => {
    expect(elementFormLabel((() => "") as never, undefined, "size_ratio")).toBe("Ratio");
    expect(elementFormLabel((() => "") as never, undefined, "size_mode")).toBe("Size");
    expect(elementFormLabel((() => "") as never, undefined, "size_value")).toBe("Value");
  });
});

describe("elementFormHelper", () => {
  it("returns the HA colour helper text for the color field", () => {
    expect(elementFormHelper(localize, "color")).toBe(
      "L:ui.panel.lovelace.editor.badge.entity.color_helper",
    );
  });

  it("falls back to the English string when localize returns empty", () => {
    expect(elementFormHelper((() => "") as never, "color")).toBe(
      "Inactive state (for example, off or closed) will not be colored.",
    );
  });

  it("returns undefined for every other field", () => {
    expect(elementFormHelper(localize, "icon")).toBeUndefined();
    expect(elementFormHelper(localize, "name")).toBeUndefined();
    expect(elementFormHelper(localize, "tap_action")).toBeUndefined();
  });
});
