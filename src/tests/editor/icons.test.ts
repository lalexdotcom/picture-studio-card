import { describe, expect, it } from "@rstest/core";
import { itemIcon } from "../../editor/icons";

describe("itemIcon", () => {
  it("gives each element kind its own glyph", () => {
    expect(itemIcon("element", "state-icon")).toBe("mdi:brightness-7");
    expect(itemIcon("element", "state-label")).toBe("mdi:card-text-outline");
  });

  it("falls back to the family glyph for an unknown element kind", () => {
    expect(itemIcon("element", "state-gauge")).toBe("mdi:shape-outline");
  });

  it("gives the shortcut badge its own glyph", () => {
    expect(itemIcon("badge", "shortcut")).toBe("mdi:label-variant");
  });

  it("falls back to the family glyph for an unknown badge type", () => {
    expect(itemIcon("badge", "entity")).toBe("mdi:label");
    expect(itemIcon("badge", "custom:mushroom-template-badge")).toBe("mdi:label");
  });
});
