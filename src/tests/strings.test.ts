import { describe, expect, it } from "@rstest/core";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

const hass = (over: Partial<HomeAssistant>): HomeAssistant =>
  ({ language: "en", localize: () => "", ...over }) as HomeAssistant;

describe("localizeOwn", () => {
  it("prefers the stored locale over the resolved language", () => {
    const out = localizeOwn(hass({ language: "en", locale: { language: "fr" } }), "stacking_hint");
    expect(out).toBe("Les premiers items de la liste sont au-dessus.");
  });

  it("falls back to the resolved language when no locale is stored", () => {
    expect(localizeOwn(hass({ language: "fr" }), "stacking_hint")).toContain("Les premiers items");
  });

  it("degrades a regional variant to its base language", () => {
    expect(localizeOwn(hass({ language: "fr-CA" }), "stacking_hint")).toContain(
      "Les premiers items",
    );
  });

  it("falls back to English for an untranslated language", () => {
    expect(localizeOwn(hass({ language: "de" }), "stacking_hint")).toBe(
      "The first items in the list are drawn on top.",
    );
  });

  it("survives a missing hass", () => {
    expect(localizeOwn(undefined, "stacking_hint")).toBe(
      "The first items in the list are drawn on top.",
    );
  });
});

describe("anchor strings", () => {
  it("serves the anchor labels in English", () => {
    expect(localizeOwn(undefined, "anchor")).toBe("Position");
    expect(localizeOwn(undefined, "anchor_anchored")).toBe("Anchored");
  });

  it("serves them in French", () => {
    expect(localizeOwn(hass({ language: "fr" }), "anchor")).toBe("Position");
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

describe("appearance strings", () => {
  const KEYS = [
    "halo_enabled",
    "halo_enabled_helper",
    "chrome_enabled",
    "chrome_radius",
    "chrome_opacity",
    "chrome_content_ratio",
    "chrome_pill",
    "chrome_padding",
    "label_empty",
    "label_empty_hint",
  ] as const;

  it("serves the section's own fields in English", () => {
    expect(KEYS.map((key) => localizeOwn(undefined, key))).toEqual([
      "Stand out",
      "Adds a shadow and a light rim so the element stays readable on any picture.",
      "Draw a chrome",
      "Radius",
      "Opacity",
      "Content",
      "Pill",
      "Padding",
      "Empty",
      "This item shows nothing",
    ]);
  });

  it("serves the same ten in French", () => {
    const fr = hass({ language: "fr" });
    expect(KEYS.map((key) => localizeOwn(fr, key))).toEqual([
      "Détacher",
      "Ajoute une ombre et un liseré clair pour rester lisible sur n'importe quelle image.",
      "Dessiner un habillage",
      "Rayon",
      "Opacité",
      "Contenu",
      "Pilule",
      "Marge",
      "Vide",
      "Cet item n'affiche rien",
    ]);
  });
});
