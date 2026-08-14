import { afterEach, describe, expect, it } from "@rstest/core";
import { VISIBILITY_SECTION_TAG } from "../../config";
import { PictureStudioVisibilitySection } from "../../editor/visibility-section";
import type { HomeAssistant } from "../../types";

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: (key: string) => (key.endsWith("tab_visibility") ? "Visibility" : ""),
} as unknown as HomeAssistant;

const mount = async (
  visibility?: Record<string, unknown>[],
): Promise<PictureStudioVisibilitySection> => {
  if (!customElements.get(VISIBILITY_SECTION_TAG)) {
    customElements.define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
  }
  const el = document.createElement(VISIBILITY_SECTION_TAG) as PictureStudioVisibilitySection;
  el.hass = hass;
  el.visibility = visibility;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("the visibility section", () => {
  it("shows no count when there are no conditions", async () => {
    const el = await mount();
    expect(el.renderRoot.querySelector("ha-label")).toBeNull();
  });

  it("counts the top-level conditions in the header", async () => {
    const el = await mount([{ condition: "state" }, { condition: "screen" }]);
    expect(el.renderRoot.querySelector("ha-label")?.textContent?.trim()).toBe("2");
  });

  it("falls back when Home Assistant's editor is not defined", async () => {
    const el = await mount();
    expect(el.renderRoot.querySelector(".fallback")).not.toBeNull();
    expect(el.renderRoot.querySelector("hui-card-visibility-editor")).toBeNull();
  });

  it("relays a new list, bubbling and composed", async () => {
    const el = await mount();
    const seen: unknown[] = [];
    document.body.addEventListener("visibility-changed", (ev) =>
      seen.push((ev as CustomEvent).detail),
    );
    const conditions = [{ condition: "state", entity: "light.a" }];
    el.handleValueChanged(
      new CustomEvent("value-changed", { detail: { value: { visibility: conditions } } }),
    );
    expect(seen).toEqual([{ visibility: conditions }]);
  });

  it("relays an emptied list as no conditions at all", async () => {
    const el = await mount([{ condition: "state" }]);
    const seen: unknown[] = [];
    document.body.addEventListener("visibility-changed", (ev) =>
      seen.push((ev as CustomEvent).detail),
    );
    el.handleValueChanged(new CustomEvent("value-changed", { detail: { value: {} } }));
    expect(seen).toEqual([{ visibility: undefined }]);
  });

  it("hands Home Assistant's editor the same object while the list is unchanged", async () => {
    const el = await mount([{ condition: "state" }]);
    const first = el.editorConfig();
    await el.updateComplete;
    expect(el.editorConfig()).toBe(first);
  });
});
