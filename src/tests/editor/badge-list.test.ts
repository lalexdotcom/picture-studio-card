import { describe, expect, it } from "@rstest/core";
import type { PictureItem } from "../../config";
import { badgeCatalog } from "../../editor/badge-catalog";
import { addChoices, kindLabel, splitChoiceValue } from "../../editor/badge-list";

const localize = ((key: string) =>
  ({
    "ui.panel.lovelace.editor.badges.name": "Badges",
    "ui.panel.lovelace.editor.card.picture-elements.elements": "Éléments",
    "ui.panel.lovelace.editor.badge.entity.name": "Entité",
    "ui.panel.lovelace.editor.card.picture-elements.element_types.state-icon": "Icône d'état",
  })[key] ?? "") as never;

describe("addChoices", () => {
  it("prefixes every entry with its family, badges first", () => {
    const choices = addChoices(localize, undefined);
    expect(choices[0]).toEqual({
      value: "badge:entity",
      label: "Badges: Entité",
      icon: "mdi:label",
    });
    expect(choices.at(-1)).toEqual({
      value: "element:state-icon",
      label: "Éléments: Icône d'état",
      icon: "mdi:shape-outline",
    });
  });
});

describe("kindLabel", () => {
  const catalog = badgeCatalog(undefined);
  const badge = (type: string): PictureItem =>
    ({ type: "badge", config: { type } }) as unknown as PictureItem;

  it("names a core badge through Home Assistant's own label", () => {
    expect(kindLabel(badge("entity"), localize, catalog)).toBe("Entité");
  });

  it("names an element kind", () => {
    const item = { type: "element", config: { type: "state-icon" } } as unknown as PictureItem;
    expect(kindLabel(item, localize, catalog)).toBe("Icône d'état");
  });

  it("falls back to the raw type for a badge the catalogue does not know", () => {
    expect(kindLabel(badge("custom:mushroom-template-badge"), localize, catalog)).toBe(
      "custom:mushroom-template-badge",
    );
  });
});

describe("splitChoiceValue", () => {
  it("splits on the first colon only, so a custom badge type survives", () => {
    expect(splitChoiceValue("badge:custom:mushroom-template-badge")).toEqual({
      family: "badge",
      type: "custom:mushroom-template-badge",
    });
  });

  it("rejects a value with no family", () => {
    expect(splitChoiceValue("entity")).toBeUndefined();
  });
});
