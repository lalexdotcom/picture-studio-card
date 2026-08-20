import { afterEach, beforeAll, describe, expect, it } from "@rstest/core";
import { HEADING_SECTION_TAG } from "../../config";
import { PictureStudioHeadingSection } from "../../editor/heading-section";
import type { HomeAssistant } from "../../types";

const hass = {
  states: {},
  language: "en",
  localize: (key: string) => (key.endsWith("heading.badges") ? "Badges" : ""),
} as unknown as HomeAssistant;

const mount = async (heading: Record<string, unknown> = {}) => {
  if (!customElements.get(HEADING_SECTION_TAG)) {
    customElements.define(HEADING_SECTION_TAG, PictureStudioHeadingSection);
  }
  const el = document.createElement(HEADING_SECTION_TAG) as PictureStudioHeadingSection;
  el.hass = hass;
  el.heading = heading;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

beforeAll(() => {
  if (!customElements.get("hui-heading-badges-editor")) {
    customElements.define("hui-heading-badges-editor", class extends HTMLElement {});
  }
});

describe("picture-studio-heading-section", () => {
  it("hands ha-form a flat record, not the nested heading", async () => {
    const el = await mount({ title: "Office", icon: "mdi:desk", badges: [] });
    const form = el.shadowRoot?.querySelector("ha-form") as { data?: Record<string, unknown> };
    expect(form.data).toEqual({ title: "Office", icon: "mdi:desk" });
  });

  it("folds the flat record back into a heading", async () => {
    const el = await mount({ title: "Office", badges: [{ type: "entity" }] });
    let received: unknown;
    el.addEventListener("heading-changed", (ev) => {
      received = (ev as CustomEvent).detail.heading;
    });
    el.shadowRoot
      ?.querySelector("ha-form")
      ?.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { title: "Salon" } } }));
    expect(received).toEqual({ title: "Salon", badges: [{ type: "entity" }] });
  });

  it("separates the badges with a rule and a caption", async () => {
    const el = await mount();
    expect(el.shadowRoot?.querySelector("hr")).not.toBeNull();
    expect(el.shadowRoot?.querySelector(".badges-title")?.textContent?.trim()).toBe("Badges");
  });

  it("passes the badge list to HA's own editor", async () => {
    const badges = [{ type: "entity", entity: "sensor.a" }];
    const el = await mount({ badges });
    const editor = el.shadowRoot?.querySelector("hui-heading-badges-editor") as {
      badges?: unknown;
    } | null;
    expect(editor?.badges).toEqual(badges);
  });

  it("re-emits HA's badge list changes as a heading change", async () => {
    const el = await mount({ title: "Office", badges: [] });
    let received: unknown;
    el.addEventListener("heading-changed", (ev) => {
      received = (ev as CustomEvent).detail.heading;
    });
    el.shadowRoot?.querySelector("hui-heading-badges-editor")?.dispatchEvent(
      new CustomEvent("heading-badges-changed", {
        detail: { badges: [{ type: "entity" }] },
        bubbles: true,
        composed: true,
      }),
    );
    expect(received).toEqual({ title: "Office", badges: [{ type: "entity" }] });
  });

  it("asks HA to open its own sub-element editor for a badge", async () => {
    const badges = [{ type: "entity", entity: "sensor.a" }];
    const el = await mount({ badges });
    let detail: Record<string, unknown> | undefined;
    el.addEventListener("edit-sub-element", (ev) => {
      detail = (ev as CustomEvent).detail;
    });
    el.shadowRoot?.querySelector("hui-heading-badges-editor")?.dispatchEvent(
      new CustomEvent("edit-heading-badge", {
        detail: { index: 0 },
        bubbles: true,
        composed: true,
      }),
    );
    expect(detail?.type).toBe("heading-badge");
    expect(detail?.config).toEqual(badges[0]);
    expect(typeof detail?.saveConfig).toBe("function");
  });

  it("saves an edited badge back into the list", async () => {
    const el = await mount({ badges: [{ type: "entity", entity: "sensor.a" }] });
    let detail: { saveConfig: (config: unknown) => void } | undefined;
    let received: unknown;
    el.addEventListener("edit-sub-element", (ev) => {
      detail = (ev as CustomEvent).detail;
    });
    el.addEventListener("heading-changed", (ev) => {
      received = (ev as CustomEvent).detail.heading;
    });
    el.shadowRoot?.querySelector("hui-heading-badges-editor")?.dispatchEvent(
      new CustomEvent("edit-heading-badge", {
        detail: { index: 0 },
        bubbles: true,
        composed: true,
      }),
    );
    detail?.saveConfig({ type: "entity", entity: "sensor.b" });
    expect(received).toEqual({ badges: [{ type: "entity", entity: "sensor.b" }] });
  });
});
