import { describe, expect, it } from "@rstest/core";
import { addChoices, splitChoiceValue } from "../../editor/badge-list";

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
    expect(choices[0]).toEqual({ value: "badge:entity", label: "Badges: Entité" });
    expect(choices.at(-1)).toEqual({
      value: "element:state-icon",
      label: "Éléments: Icône d'état",
    });
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
