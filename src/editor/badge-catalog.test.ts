import { describe, expect, it } from "@rstest/core";
import { badgeCatalog, CORE_BADGES } from "./badge-catalog";

describe("CORE_BADGES", () => {
  it("mirrors Home Assistant's coreBadges: entity and shortcut", () => {
    expect(CORE_BADGES.map((b) => b.type)).toEqual(["entity", "shortcut"]);
    expect(CORE_BADGES.every((b) => b.isCustom === false)).toBe(true);
  });
});

describe("badgeCatalog", () => {
  it("returns only the core badges when no custom badges are registered", () => {
    expect(badgeCatalog(undefined).map((b) => b.type)).toEqual(["entity", "shortcut"]);
    expect(badgeCatalog([]).map((b) => b.type)).toEqual(["entity", "shortcut"]);
  });

  it("appends custom badges after the core ones, flagged as custom", () => {
    const out = badgeCatalog([
      { type: "custom:mushroom-template-badge", name: "Mushroom Template" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({
      type: "custom:mushroom-template-badge",
      name: "Mushroom Template",
      isCustom: true,
    });
  });

  it("keeps a custom badge with no name, so it stays selectable", () => {
    const out = badgeCatalog([{ type: "custom:nameless-badge" }]);
    expect(out[2]?.type).toBe("custom:nameless-badge");
  });

  it("does not mutate the registry it is given", () => {
    const registry = [{ type: "custom:a" }];
    badgeCatalog(registry);
    expect(registry).toEqual([{ type: "custom:a" }]);
  });
});
