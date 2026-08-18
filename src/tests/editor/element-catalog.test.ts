import { describe, expect, it } from "@rstest/core";
import { elementCatalog, elementLabel, stubElementConfig } from "../../editor/element-catalog";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "../../element-size";

describe("elementCatalog", () => {
  it("offers both kinds, the icon first", () => {
    expect(elementCatalog()).toEqual([{ type: "state-icon" }, { type: "state-label" }]);
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

  it("stubs a label showing its state, at the label's own default size", () => {
    expect(stubElementConfig("state-label")).toEqual({
      type: "state-label",
      show: ["state"],
      size: DEFAULT_LABEL_SIZE,
    });
  });

  it("still raises on an unknown kind", () => {
    expect(() => stubElementConfig("state-gauge")).toThrow();
  });
});
