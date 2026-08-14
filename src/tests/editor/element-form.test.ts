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
  });

  it("offers hold and double tap as optional actions", () => {
    expect(find(stateIconSchema(), "hold_action")).toBeDefined();
    expect(find(stateIconSchema(), "double_tap_action")).toBeDefined();
  });
});

describe("stateIconSizeSchema", () => {
  it("disables the three size fields while auto is on", () => {
    expect(find(stateIconSizeSchema(true), "size_min")?.disabled).toBe(true);
    expect(find(stateIconSizeSchema(true), "size_ratio")?.disabled).toBe(true);
    expect(find(stateIconSizeSchema(true), "size_max")?.disabled).toBe(true);
    expect(find(stateIconSizeSchema(false), "size_min")?.disabled).toBe(false);
    expect(find(stateIconSizeSchema(false), "size_ratio")?.disabled).toBe(false);
    expect(find(stateIconSizeSchema(false), "size_max")?.disabled).toBe(false);
  });
});

describe("toFormData / fromFormData", () => {
  it("flattens the size into four fields", () => {
    expect(toFormData({ ...base, entity: "light.a" })).toEqual({
      type: "state-icon",
      entity: "light.a",
      auto_size: true,
      size_min: 40,
      size_ratio: 3.5,
      size_max: 70,
    });
  });

  it("round-trips a manual size", () => {
    const config = { ...base, size: { auto: false, min: 10, ratio: 1, max: 20 } };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("keeps the numbers when auto is checked again, so unchecking restores them", () => {
    const config = { ...base, size: { auto: false, min: 10, ratio: 1, max: 20 } };
    const data = { ...toFormData(config), auto_size: true };
    expect(fromFormData(config, data).size).toEqual({ auto: true, min: 10, ratio: 1, max: 20 });
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

  it("uses ours only for the two the catalogue has not got", () => {
    expect(elementFormLabel((() => "") as never, undefined, "size_ratio")).toBe("Ratio");
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
