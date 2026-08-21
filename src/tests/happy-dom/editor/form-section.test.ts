import { describe, expect, it } from "@rstest/core";
import { formLabel, sectionData, sectionMerge } from "../../../editor/form-section";
import type { LocalizeFunc } from "../../../types";

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
    const data = sectionData(schema, { filter: "a" });
    // toEqual alone cannot catch this — it ignores own keys whose value is undefined.
    // Assert the key is genuinely absent from the returned object.
    expect("dark_mode_filter" in data).toBe(false);
  });

  it("omits a null value, same as undefined — both mean the user left it empty", () => {
    const data = sectionData(schema, { filter: "a", dark_mode_filter: null });
    expect("dark_mode_filter" in data).toBe(false);
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
    // Documents intent: camera_view is outside both schema and the form data,
    // so it must survive untouched.
    const next = sectionMerge(schema, { filter: "a", camera_view: "live" }, { filter: "z" });
    expect(next).toEqual({ filter: "z", camera_view: "live" });
  });

  it("leaves a key the schema did NOT render alone — sub-schema guard", () => {
    // This is the load-bearing guard. A sub-schema of only [{name:"filter"}] is
    // passed while config also holds dark_mode_filter. A schema-driven
    // implementation never visits dark_mode_filter and leaves it intact. A
    // hardcoded ["filter","dark_mode_filter"] implementation would visit it,
    // find nothing in the form data, and delete it.
    const subSchema = [{ name: "filter" }] as const;
    const next = sectionMerge(
      subSchema,
      { filter: "a", dark_mode_filter: "keep", camera_view: "live" },
      { filter: "z" },
    );
    expect(next).toEqual({ filter: "z", dark_mode_filter: "keep", camera_view: "live" });
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

  it("picture-elements wins over elements when both define the same key", () => {
    // HA really does have state_filter in both namespaces. This test
    // distinguishes positions 2 and 3 in NAMESPACES — swapping them flips
    // which label wins.
    const localize = (key: string): string => {
      if (key === "ui.panel.lovelace.editor.card.picture-elements.state_filter")
        return "from-picture-elements";
      if (key === "ui.panel.lovelace.editor.elements.state_filter") return "from-elements";
      return "";
    };
    expect(formLabel(localize, "state_filter")).toBe("from-picture-elements");
  });

  it("degrades to the raw field name, never to blank", () => {
    expect(formLabel(() => "", "picture_entity")).toBe("picture_entity");
  });
});
