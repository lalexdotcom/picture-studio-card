import { describe, expect, it } from "@rstest/core";
import {
  badgeCatalog,
  CORE_BADGES,
  choiceLabel,
  isSupportedBadgeType,
  resolveBadgeClass,
} from "../../editor/badge-catalog";
import type { LocalizeFunc } from "../../types";

const echo: LocalizeFunc = (key) => key;
const missing: LocalizeFunc = () => "";

describe("choiceLabel", () => {
  it("borrows HA's own name for a core badge", () => {
    expect(choiceLabel(echo, { type: "entity", isCustom: false })).toBe(
      "ui.panel.lovelace.editor.badge.entity.name",
    );
  });

  it("falls back to the type when HA has no such key", () => {
    expect(choiceLabel(missing, { type: "entity", isCustom: false })).toBe("entity");
  });

  it("keeps the name a custom badge registered, and never localizes its type", () => {
    expect(choiceLabel(echo, { type: "custom:mushroom", name: "Mushroom", isCustom: true })).toBe(
      "Mushroom",
    );
    expect(choiceLabel(echo, { type: "custom:mushroom", isCustom: true })).toBe("custom:mushroom");
  });
});

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

  /**
   * The registry holds tag names, not config types — verified against the real
   * Mushroom bundle, which pushes `{ type: "mushroom-template-badge" }`. An
   * earlier version of these tests fed pre-prefixed types, which is not what any
   * library actually registers, so they proved the assumption instead of the
   * behavior and missed a real bug.
   */
  it("prefixes registry entries so they are valid Lovelace config types", () => {
    const out = badgeCatalog([{ type: "mushroom-template-badge", name: "Mushroom Template" }]);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({
      type: "custom:mushroom-template-badge",
      name: "Mushroom Template",
      isCustom: true,
    });
  });

  it("carries the description through, which the picker shows", () => {
    const out = badgeCatalog([
      { type: "mushroom-template-badge", description: "Build your own badge using templates" },
    ]);
    expect(out[2]?.description).toBe("Build your own badge using templates");
  });

  it("does not double-prefix an entry that already carries one", () => {
    const out = badgeCatalog([{ type: "custom:already-prefixed-badge" }]);
    expect(out[2]?.type).toBe("custom:already-prefixed-badge");
  });

  it("keeps a custom badge with no name, so it stays selectable", () => {
    const out = badgeCatalog([{ type: "nameless-badge" }]);
    expect(out[2]?.type).toBe("custom:nameless-badge");
    expect(out[2]?.name).toBeUndefined();
  });

  it("does not mutate the registry it is given", () => {
    const registry = [{ type: "a-badge" }];
    badgeCatalog(registry);
    expect(registry).toEqual([{ type: "a-badge" }]);
  });
});

describe("isSupportedBadgeType", () => {
  it("accepts the two core badges", () => {
    expect(isSupportedBadgeType("entity")).toBe(true);
    expect(isSupportedBadgeType("shortcut")).toBe(true);
  });

  it("accepts any custom: type, known or not, because the runtime probe decides", () => {
    expect(isSupportedBadgeType("custom:mushroom-template-badge")).toBe(true);
    expect(isSupportedBadgeType("custom:does-not-exist")).toBe(true);
    expect(isSupportedBadgeType("custom:")).toBe(true);
  });

  it("rejects a native type outside CORE_BADGES, including state-label", () => {
    // state-label is the one that matters: it is also a picture-elements
    // element kind, so writing type: badge was a silent way to get the wrong
    // thing. The other five are rejected for the same structural reason.
    expect(isSupportedBadgeType("state-label")).toBe(false);
    expect(isSupportedBadgeType("entity-filter")).toBe(false);
    expect(isSupportedBadgeType("power-total")).toBe(false);
    expect(isSupportedBadgeType("gas-total")).toBe(false);
    expect(isSupportedBadgeType("water-total")).toBe(false);
  });

  it("rejects a nonsense native type", () => {
    expect(isSupportedBadgeType("entty")).toBe(false);
    expect(isSupportedBadgeType("")).toBe(false);
  });
});

describe("resolveBadgeClass", () => {
  it("gives up instead of hanging on a type that does not exist", async () => {
    // `await customElements.whenDefined(tag)` never resolves for a type nothing
    // will ever define, so the add flow would hang forever. Unreachable through
    // the menu, which offers only known types — but the file now has the verdict
    // to short-circuit on.
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers =
      async () => ({
        createBadgeElement: (c: { type?: string }) =>
          document.createElement(
            c.type === "entity" || c.type === "shortcut"
              ? `hui-${c.type}-badge`
              : "hui-error-badge",
          ),
      });
    await expect(
      Promise.race([
        resolveBadgeClass("entty"),
        new Promise((r) => setTimeout(() => r("HUNG"), 50)),
      ]),
    ).resolves.toBeUndefined();
  });
});
