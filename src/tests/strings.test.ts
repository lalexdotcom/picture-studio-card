import { describe, expect, it } from "@rstest/core";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

const hass = (over: Partial<HomeAssistant>): HomeAssistant =>
  ({ language: "en", localize: () => "", ...over }) as HomeAssistant;

describe("localizeOwn", () => {
  it("prefers the stored locale over the resolved language", () => {
    const out = localizeOwn(hass({ language: "en", locale: { language: "fr" } }), "stacking_hint");
    expect(out).toBe("Les derniers badges de la liste sont au-dessus.");
  });

  it("falls back to the resolved language when no locale is stored", () => {
    expect(localizeOwn(hass({ language: "fr" }), "stacking_hint")).toContain("Les derniers badges");
  });

  it("degrades a regional variant to its base language", () => {
    expect(localizeOwn(hass({ language: "fr-CA" }), "stacking_hint")).toContain(
      "Les derniers badges",
    );
  });

  it("falls back to English for an untranslated language", () => {
    expect(localizeOwn(hass({ language: "de" }), "stacking_hint")).toBe(
      "The last badges in the list are drawn on top.",
    );
  });

  it("survives a missing hass", () => {
    expect(localizeOwn(undefined, "stacking_hint")).toBe(
      "The last badges in the list are drawn on top.",
    );
  });
});

describe("anchor strings", () => {
  it("serves the anchor labels in English", () => {
    expect(localizeOwn(undefined, "anchor")).toBe("Position");
    expect(localizeOwn(undefined, "anchor_proportional")).toBe("Proportional");
    expect(localizeOwn(undefined, "anchor_anchored")).toBe("Anchored");
  });

  it("serves them in French", () => {
    expect(localizeOwn(hass({ language: "fr" }), "anchor")).toBe("Position");
    expect(localizeOwn(hass({ language: "fr" }), "anchor_proportional")).toBe("Proportionnel");
    expect(localizeOwn(hass({ language: "fr" }), "anchor_anchored")).toBe("Ancré");
  });
});

describe("size_and_position string", () => {
  it("serves the section header in English", () => {
    expect(localizeOwn(undefined, "size_and_position")).toBe("Size and position");
  });

  it("serves it in French", () => {
    expect(localizeOwn(hass({ language: "fr" }), "size_and_position")).toBe("Taille et position");
  });
});
