import { describe, expect, it } from "@rstest/core";
import type { PictureItem } from "../../config";
import {
  addItem,
  moveItem,
  removeItem,
  replaceConfig,
  rowLabel,
  setAnchor,
  setVisibility,
} from "../../editor/items";
import { DEFAULT_ICON_SIZE } from "../../element-size";
import { DEFAULT_ANCHOR, DEFAULT_POSITION } from "../../position";

const item = (entity: string, top: number, left: number): PictureItem => ({
  type: "badge",
  position: { top, left },
  anchor: "auto",
  config: { type: "entity", entity },
});

describe("addItem", () => {
  it("appends the badge centered on the image", () => {
    const out = addItem([item("light.a", 10, 20)], {
      type: "badge",
      config: { type: "entity", entity: "light.b" },
    });
    expect(out).toHaveLength(2);
    expect(out[1]?.position).toEqual({ top: 50, left: 50 });
    expect(out[1]?.anchor).toBe("auto");
    expect(out[1]?.config).toEqual({ type: "entity", entity: "light.b" });
  });

  it("gives each added badge its own position object", () => {
    const out = addItem(addItem([], { type: "badge", config: { type: "entity" } }), {
      type: "badge",
      config: { type: "entity" },
    });
    expect(out[0]?.position).not.toBe(out[1]?.position);
  });

  it("passes a custom badge config through untouched", () => {
    const custom = { type: "custom:mushroom-template-badge", content: "{{ x }}", nested: { a: 1 } };
    expect(addItem([], { type: "badge", config: custom })[0]?.config).toEqual(custom);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 20)];
    addItem(items, { type: "badge", config: { type: "entity" } });
    expect(items).toHaveLength(1);
  });

  it("adds an element with the default position and anchor", () => {
    const out = addItem([], {
      type: "element",
      config: { type: "state-icon", size: DEFAULT_ICON_SIZE },
    });
    expect(out[0]).toEqual({
      type: "element",
      position: DEFAULT_POSITION,
      anchor: DEFAULT_ANCHOR,
      config: { type: "state-icon", size: DEFAULT_ICON_SIZE },
    });
  });
});

describe("replaceConfig", () => {
  it("swaps the badge and keeps the position", () => {
    const items = [item("light.a", 10, 20), item("light.b", 30, 40)];
    const out = replaceConfig(items, 1, { type: "entity", entity: "light.CHANGED" });
    expect(out[1]?.config).toEqual({ type: "entity", entity: "light.CHANGED" });
    expect(out[1]?.position).toEqual({ top: 30, left: 40 });
    expect(out[0]).toEqual(items[0]);
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const items = [item("light.a", 10, 20)];
    expect(replaceConfig(items, 5, { type: "entity" })).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 20)];
    replaceConfig(items, 0, { type: "entity", entity: "light.z" });
    expect(items[0]?.config).toEqual({ type: "entity", entity: "light.a" });
  });
});

describe("setAnchor", () => {
  const items = [item("light.a", 10, 20), item("light.b", 30, 40)];

  it("writes the anchor and the coordinates that keep the item still, together", () => {
    const out = setAnchor(items, 1, "center", { top: 33, left: 44 });
    expect(out[1]?.anchor).toBe("center");
    expect(out[1]?.position).toEqual({ top: 33, left: 44 });
  });

  it("keeps the coordinates when the caller could not work out new ones", () => {
    const out = setAnchor(items, 1, "center");
    expect(out[1]?.anchor).toBe("center");
    expect(out[1]?.position).toEqual({ top: 30, left: 40 });
  });

  it("leaves every other item untouched", () => {
    const out = setAnchor(items, 1, "center", { top: 33, left: 44 });
    expect(out[0]).toEqual(items[0]);
  });

  it("does not mutate its input, which Home Assistant freezes", () => {
    setAnchor(items, 1, "center", { top: 33, left: 44 });
    expect(items[1]?.anchor).toBe("auto");
    expect(items[1]?.position).toEqual({ top: 30, left: 40 });
  });

  it("returns the list unchanged for an index that is not there", () => {
    expect(setAnchor(items, -1, "center")).toBe(items);
    expect(setAnchor(items, 2, "center")).toBe(items);
  });
});

describe("moveItem", () => {
  it("moves a pair as a unit, so reordering never disturbs positions", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20), item("light.c", 30, 30)];
    const out = moveItem(items, 0, 2);
    expect(out.map((i) => i.config.entity)).toEqual(["light.b", "light.c", "light.a"]);
    expect(out[2]).toEqual(items[0]);
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const items = [item("light.a", 10, 10)];
    expect(moveItem(items, 0, 5)).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20)];
    moveItem(items, 0, 1);
    expect(items.map((i) => i.config.entity)).toEqual(["light.a", "light.b"]);
  });
});

describe("removeItem", () => {
  it("drops the pair at the index", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20)];
    expect(removeItem(items, 0)).toEqual([items[1]]);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 10)];
    removeItem(items, 0);
    expect(items).toHaveLength(1);
  });
});

describe("rowLabel", () => {
  const badge = (config: Record<string, unknown>): PictureItem => ({
    type: "badge",
    position: { top: 50, left: 50 },
    anchor: "auto",
    config: config as never,
  });
  const states = {
    "light.ceiling_lights": { attributes: { friendly_name: "Open space" } },
  } as never;

  it("prefers the entity's name over its id", () => {
    expect(rowLabel(badge({ type: "entity", entity: "light.ceiling_lights" }), states)).toEqual({
      primary: "Open space",
      secondary: "light.ceiling_lights",
    });
  });

  it("lets a name written into the badge win over the entity's", () => {
    const item = badge({ type: "entity", entity: "light.ceiling_lights", name: "Desks" });
    expect(rowLabel(item, states).primary).toBe("Desks");
  });

  it("falls back to the id for an entity it cannot resolve", () => {
    expect(rowLabel(badge({ type: "entity", entity: "light.gone" }), states)).toEqual({
      primary: "light.gone",
      secondary: "entity",
    });
  });

  it("falls back to the badge type when there is no entity at all", () => {
    expect(rowLabel(badge({ type: "custom:mushroom-template-badge" }))).toEqual({
      primary: "custom:mushroom-template-badge",
    });
  });

  it("never repeats itself across the two lines", () => {
    const label = rowLabel(badge({ type: "entity", entity: "light.gone" }));
    expect(label.primary).not.toBe(label.secondary);
  });
});

describe("rowLabel for an element", () => {
  const icon = (config: Record<string, unknown>): PictureItem => ({
    type: "element",
    position: DEFAULT_POSITION,
    anchor: DEFAULT_ANCHOR,
    config: { type: "state-icon", size: DEFAULT_ICON_SIZE, ...config } as never,
  });

  it("prefers the entity's friendly name, keeping the id as the caption", () => {
    const states = { "light.a": { attributes: { friendly_name: "Lampe" } } } as never;
    expect(rowLabel(icon({ entity: "light.a" }), states)).toEqual({
      primary: "Lampe",
      secondary: "light.a",
    });
  });

  it("falls back to the kind when there is no entity yet", () => {
    expect(rowLabel(icon({}))).toEqual({ primary: "state-icon" });
  });

  it("ignores `name`, which may hold composed sentinels", () => {
    expect(rowLabel(icon({ name: "___device_name___", entity: "light.a" })).primary).toBe(
      "light.a",
    );
  });
});

describe("setVisibility", () => {
  const items = [
    {
      type: "badge" as const,
      position: { top: 10, left: 10 },
      anchor: "auto" as const,
      config: {},
    },
    {
      type: "badge" as const,
      position: { top: 20, left: 20 },
      anchor: "auto" as const,
      config: {},
    },
  ];

  it("sets a list on the addressed item only", () => {
    const conditions = [{ condition: "state" }];
    const out = setVisibility(items, 1, conditions);
    expect(out[1]?.visibility).toEqual(conditions);
    expect(out[0]?.visibility).toBeUndefined();
  });

  it("clears the key rather than storing an empty list", () => {
    const withOne = setVisibility(items, 0, [{ condition: "state" }]);
    const cleared = setVisibility(withOne, 0, []);
    expect(cleared[0]).not.toHaveProperty("visibility");
  });

  it("clears the key when handed nothing", () => {
    const withOne = setVisibility(items, 0, [{ condition: "state" }]);
    expect(setVisibility(withOne, 0, undefined)[0]).not.toHaveProperty("visibility");
  });

  it("does not mutate its input", () => {
    setVisibility(items, 0, [{ condition: "state" }]);
    expect(items[0]).not.toHaveProperty("visibility");
  });

  it("returns the list untouched for an index out of range", () => {
    expect(setVisibility(items, 5, [{ condition: "state" }])).toBe(items);
  });
});
