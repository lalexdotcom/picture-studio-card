import { afterEach, beforeAll, describe, expect, it } from "@rstest/core";
import { VISIBILITY_SECTION_TAG } from "../../config";
import { PictureStudioVisibilitySection } from "../../editor/visibility-section";
import type { HomeAssistant } from "../../types";
import { cssRules } from "../card/harness";

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

  it("builds a config on cold start with no conditions", async () => {
    const el = await mount(); // visibility = undefined
    expect(el.editorConfig()).toEqual({ visibility: [] });
  });
});

// ── Guard: ha-visibility-status is not yet registered at this point in the
//    file. The stub class below is only registered in the next describe's
//    beforeAll, which runs after these tests. ──
describe("status-icon guard (ha-visibility-status not registered)", () => {
  it("renders no icon even when conditions are present", async () => {
    const el = await mount([{ condition: "state" }]);
    expect(el.renderRoot.querySelector(".status-icon")).toBeNull();
  });
});

// ── Stub registered in the oracle describe's beforeAll ──
class HaVisibilityStatusStub extends HTMLElement {
  /** Tests set this before mounting to control what state the oracle reports. */
  static _state: "visible" | "hidden" | "invalid" = "visible";

  hass: unknown;
  conditions: unknown;

  get state(): "visible" | "hidden" | "invalid" {
    return HaVisibilityStatusStub._state;
  }

  /** Resolves immediately — the stub does no async evaluation. */
  get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe("status icon with ha-visibility-status available", () => {
  beforeAll(() => {
    if (!customElements.get("ha-visibility-status")) {
      customElements.define("ha-visibility-status", HaVisibilityStatusStub);
    }
  });

  /**
   * Mounts with a given oracle state and waits for the two-render cycle:
   *   render 1 → updated() creates oracle + schedules .then()
   *   microtask → _oracleState set → re-render queued
   *   render 2 → icon visible
   */
  const mountWithStatus = async (
    state: "visible" | "hidden" | "invalid",
    conditions: Record<string, unknown>[],
  ): Promise<PictureStudioVisibilitySection> => {
    HaVisibilityStatusStub._state = state;
    const el = await mount(conditions);
    await Promise.resolve(); // oracle .then() microtask fires → _oracleState set
    await el.updateComplete; // second render with the icon
    return el;
  };

  it("shows neither pill nor icon when there are no conditions", async () => {
    const el = await mount();
    expect(el.renderRoot.querySelector("ha-label")).toBeNull();
    expect(el.renderRoot.querySelector(".status-icon")).toBeNull();
  });

  it("renders pill then status icon in DOM order when conditions are hidden", async () => {
    const el = await mountWithStatus("hidden", [{ condition: "state" }]);
    const slotted = Array.from(el.renderRoot.querySelectorAll("[slot='event']"));
    expect(slotted).toHaveLength(2);
    expect(slotted[0]?.tagName.toLowerCase()).toBe("ha-label");
    expect(slotted[1]?.tagName.toLowerCase()).toBe("ha-icon");
  });

  it("colours the hidden icon with the warning token", async () => {
    const el = await mountWithStatus("hidden", [{ condition: "state" }]);
    const icon = el.renderRoot.querySelector(".status-icon") as HTMLElement;
    expect(icon.getAttribute("style")).toContain("var(--warning-color)");
  });

  it("renders the eye glyph and success token when visible", async () => {
    const el = await mountWithStatus("visible", [{ condition: "state" }]);
    const icon = el.renderRoot.querySelector(".status-icon") as HTMLElement & { icon?: string };
    expect(icon.icon).toBe("mdi:eye");
    expect(icon.getAttribute("style")).toContain("var(--success-color)");
  });

  it("renders the alert-circle glyph and error token when invalid", async () => {
    const el = await mountWithStatus("invalid", [{ condition: "state" }]);
    const icon = el.renderRoot.querySelector(".status-icon") as HTMLElement & { icon?: string };
    expect(icon.icon).toBe("mdi:alert-circle");
    expect(icon.getAttribute("style")).toContain("var(--error-color)");
  });

  it("is a bare icon — has --mdc-icon-size but no background, border-radius, or padding", () => {
    const rule = cssRules(PictureStudioVisibilitySection.styles).get(".status-icon");
    expect(rule).toContain("--mdc-icon-size: 16px");
    expect(rule).not.toContain("background");
    expect(rule).not.toContain("border-radius");
    expect(rule).not.toContain("padding");
  });
});
