import { describe, expect, it } from "@rstest/core";
import { localiseOwn } from "../strings";
import type { HomeAssistant } from "../types";

const hass = (over: Partial<HomeAssistant>): HomeAssistant =>
  ({ language: "en", localize: () => "", ...over }) as HomeAssistant;

describe("localiseOwn", () => {
  it("prefers the stored locale over the resolved language", () => {
    const out = localiseOwn(hass({ language: "en", locale: { language: "fr" } }), "stacking_hint");
    expect(out).toBe("Les derniers badges de la liste sont au-dessus.");
  });

  it("falls back to the resolved language when no locale is stored", () => {
    expect(localiseOwn(hass({ language: "fr" }), "stacking_hint")).toContain("Les derniers badges");
  });

  it("degrades a regional variant to its base language", () => {
    expect(localiseOwn(hass({ language: "fr-CA" }), "stacking_hint")).toContain(
      "Les derniers badges",
    );
  });

  it("falls back to English for an untranslated language", () => {
    expect(localiseOwn(hass({ language: "de" }), "stacking_hint")).toBe(
      "The last badges in the list are drawn on top.",
    );
  });

  it("survives a missing hass", () => {
    expect(localiseOwn(undefined, "stacking_hint")).toBe(
      "The last badges in the list are drawn on top.",
    );
  });
});
