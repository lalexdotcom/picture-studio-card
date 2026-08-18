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
    "ui.panel.lovelace.editor.card.picture-elements.element_types.state-label": "Libellé d'état",
  })[key] ?? "") as never;

describe("addChoices", () => {
  it("formats the first and last entries with the right value, label, and icon", () => {
    const choices = addChoices(localize, undefined);
    expect(choices[0]).toEqual({
      value: "element:state-icon",
      label: "Éléments: Icône d'état",
      icon: "mdi:brightness-7",
    });
    expect(choices.at(-1)).toEqual({
      value: "badge:shortcut",
      label: "Badges: shortcut",
      icon: "mdi:label-variant",
    });
    // Compound "Family: Name" format — would fail if the separator or the
    // localize prefix path broke for any entry.
    expect(
      choices.every((c) =>
        c.value.startsWith("badge:")
          ? c.label.startsWith("Badges: ")
          : c.label.startsWith("Éléments: "),
      ),
    ).toBe(true);
  });

  it("offers the elements before the badges", () => {
    const values = addChoices(localize).map((c) => c.value);
    expect(values[0]).toBe("element:state-icon");
    expect(values[1]).toBe("element:state-label");
    expect(values.slice(2).every((v) => v.startsWith("badge:"))).toBe(true);
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

  it("names a custom badge through its registered name when the library is loaded", () => {
    const withCustom = badgeCatalog([{ type: "mushroom-template-badge", name: "Template" }]);
    expect(kindLabel(badge("custom:mushroom-template-badge"), localize, withCustom)).toBe(
      "Template",
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
