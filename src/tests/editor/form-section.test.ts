import { describe, expect, it } from "@rstest/core";
import { formLabel, sectionData, sectionMerge } from "../../editor/form-section";
import type { LocalizeFunc } from "../../types";

const echo: LocalizeFunc = (key) => key;
const only =
  (...known: string[]): LocalizeFunc =>
  (key) =>
    known.includes(key) ? key : "";

const schema = [{ name: "filter" }, { name: "dark_mode_filter" }] as const;

describe("sectionData", () => {
  it("takes exactly the keys the schema renders", () => {
    const data = sectionData(schema, { filter: "a", dark_mode_filter: "b", image: "c" });
    expect(data).toEqual({ filter: "a", dark_mode_filter: "b" });
  });

  it("keeps a rendered key absent rather than undefined-filled", () => {
    expect(sectionData(schema, { filter: "a" })).toEqual({ filter: "a" });
  });
});

describe("sectionMerge", () => {
  it("writes back the keys the schema rendered", () => {
    const next = sectionMerge(schema, { filter: "a", image: "keep" }, { filter: "z" });
    expect(next).toEqual({ filter: "z", image: "keep" });
  });

  it("drops a rendered key the form left empty", () => {
    const next = sectionMerge(schema, { filter: "a", image: "keep" }, { filter: "" });
    expect(next).toEqual({ image: "keep" });
  });

  it("leaves a key the schema did NOT render completely alone", () => {
    // The whole point: camera_view is not in this schema, so editing `filter`
    // must not delete it. A fixed key list would.
    const next = sectionMerge(schema, { filter: "a", camera_view: "live" }, { filter: "z" });
    expect(next).toEqual({ filter: "z", camera_view: "live" });
  });

  it("does not resurrect a key the form omitted entirely", () => {
    const next = sectionMerge(schema, { filter: "a" }, {});
    expect("filter" in next).toBe(false);
  });
});

describe("formLabel", () => {
  it("prefers the generic namespace", () => {
    expect(formLabel(echo, "entity")).toBe("ui.panel.lovelace.editor.card.generic.entity");
  });

  it("falls back to picture-elements for the dark-mode keys", () => {
    const localize = only("ui.panel.lovelace.editor.card.picture-elements.dark_mode_image");
    expect(formLabel(localize, "dark_mode_image")).toBe(
      "ui.panel.lovelace.editor.card.picture-elements.dark_mode_image",
    );
  });

  it("falls back to the elements namespace, where filter and state_image live", () => {
    const localize = only("ui.panel.lovelace.editor.elements.state_image");
    expect(formLabel(localize, "state_image")).toBe(
      "ui.panel.lovelace.editor.elements.state_image",
    );
  });

  it("degrades to the raw field name, never to blank", () => {
    expect(formLabel(() => "", "picture_entity")).toBe("picture_entity");
  });
});
