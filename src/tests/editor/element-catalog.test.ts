import { describe, expect, it } from "@rstest/core";
import { elementCatalog, elementLabel, stubElementConfig } from "../../editor/element-catalog";
import { DEFAULT_ICON_SIZE } from "../../element-size";

describe("elementCatalog", () => {
  it("offers the kinds we implement", () => {
    expect(elementCatalog()).toEqual([{ type: "state-icon" }]);
  });
});

describe("elementLabel", () => {
  it("reads Home Assistant's own element type label", () => {
    const localize = ((key: string) =>
      key === "ui.panel.lovelace.editor.card.picture-elements.element_types.state-icon"
        ? "Icône d'état"
        : "") as never;
    expect(elementLabel(localize, "state-icon")).toBe("Icône d'état");
  });

  it("falls back to the raw type when the catalogue is silent", () => {
    expect(elementLabel(((): string => "") as never, "state-icon")).toBe("state-icon");
  });
});

describe("stubElementConfig", () => {
  it("picks no entity — the form opens on the entity selector instead", () => {
    expect(stubElementConfig("state-icon")).toEqual({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
    });
  });
});
