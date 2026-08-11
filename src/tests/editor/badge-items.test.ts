import { describe, expect, it } from "@rstest/core";
import type { PictureItem } from "../../config";
import { addItem, moveItem, removeItem, replaceBadge } from "../../editor/badge-items";

const item = (entity: string, top: number, left: number): PictureItem => ({
  type: "badge",
  config: { type: "entity", entity },
  position: { top, left },
});

describe("addItem", () => {
  it("appends the badge centred on the image", () => {
    const out = addItem([item("light.a", 10, 20)], { type: "entity", entity: "light.b" });
    expect(out).toHaveLength(2);
    expect(out[1]?.position).toEqual({ top: 50, left: 50 });
    expect(out[1]?.config).toEqual({ type: "entity", entity: "light.b" });
  });

  it("gives each added badge its own position object", () => {
    const out = addItem(addItem([], { type: "entity" }), { type: "entity" });
    expect(out[0]?.position).not.toBe(out[1]?.position);
  });

  it("passes a custom badge config through untouched", () => {
    const custom = { type: "custom:mushroom-template-badge", content: "{{ x }}", nested: { a: 1 } };
    expect(addItem([], custom)[0]?.config).toEqual(custom);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 20)];
    addItem(items, { type: "entity" });
    expect(items).toHaveLength(1);
  });
});

describe("replaceBadge", () => {
  it("swaps the badge and keeps the position", () => {
    const items = [item("light.a", 10, 20), item("light.b", 30, 40)];
    const out = replaceBadge(items, 1, { type: "entity", entity: "light.CHANGED" });
    expect(out[1]?.config).toEqual({ type: "entity", entity: "light.CHANGED" });
    expect(out[1]?.position).toEqual({ top: 30, left: 40 });
    expect(out[0]).toEqual(items[0]);
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const items = [item("light.a", 10, 20)];
    expect(replaceBadge(items, 5, { type: "entity" })).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 20)];
    replaceBadge(items, 0, { type: "entity", entity: "light.z" });
    expect(items[0]?.config).toEqual({ type: "entity", entity: "light.a" });
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
