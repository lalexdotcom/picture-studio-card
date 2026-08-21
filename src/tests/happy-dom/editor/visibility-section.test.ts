import { afterEach, beforeAll, describe, expect, it } from "@rstest/core";
import { VISIBILITY_SECTION_TAG } from "../../../config";
import { PictureStudioVisibilitySection } from "../../../editor/visibility-section";
import type { HomeAssistant } from "../../../types";
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
    expect(el.renderRoot.querySelector(".count")).toBeNull();
  });

  it("counts the top-level conditions in the header", async () => {
    const el = await mount([{ condition: "state" }, { condition: "screen" }]);
    expect(el.renderRoot.querySelector(".count")?.textContent?.trim()).toBe("2");
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

// ── Guard: ha-visibility-status not yet registered — the static verdict path ──
// A malformed visibility must render the warning + visible-verdict icons without
// consulting the oracle component (which is absent and would silently render nothing).
describe("malformed visibility — ha-visibility-status not registered", () => {
  it("renders warning icon and static visible-verdict without the oracle component", async () => {
    if (!customElements.get(VISIBILITY_SECTION_TAG)) {
      customElements.define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
    }
    const el = document.createElement(VISIBILITY_SECTION_TAG) as PictureStudioVisibilitySection;
    el.hass = hass;
    el.visibility = "on" as never; // YAML scalar stored as visibility: malformed, not a list
    document.body.append(el);
    await el.updateComplete;
    const icons = [...el.renderRoot.querySelectorAll('[slot="event"]')];
    expect(icons.map((i) => i.getAttribute("icon"))).toEqual(["mdi:alert-outline", "mdi:eye"]);
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
    expect(el.renderRoot.querySelector(".count")).toBeNull();
    expect(el.renderRoot.querySelector(".status-icon")).toBeNull();
  });

  it("renders status icon then count pill in DOM order when conditions are hidden", async () => {
    const el = await mountWithStatus("hidden", [{ condition: "state" }]);
    const slotted = Array.from(el.renderRoot.querySelectorAll("[slot='event']"));
    expect(slotted).toHaveLength(2);
    // Glyph first: status icon sits nearest the title.
    expect(slotted[0]?.tagName.toLowerCase()).toBe("ha-icon");
    // Count second: the pill follows at the wider gap.
    expect(slotted[1]?.classList.contains("count")).toBe(true);
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

  it("is a bare icon — has --mdc-icon-size and a start gap but no background, border-radius, or padding", () => {
    const rule = cssRules(PictureStudioVisibilitySection.styles).get(".status-icon");
    expect(rule).toContain("--mdc-icon-size: 16px");
    expect(rule).toContain("margin-inline-start");
    expect(rule).not.toContain("background");
    expect(rule).not.toContain("border-radius");
    expect(rule).not.toContain("padding");
  });

  it("count pill rule comes from the shared header-adornments module", () => {
    // styles is an array; cssRules must receive the whole array, not one entry.
    const rule = cssRules(PictureStudioVisibilitySection.styles).get(".count");
    expect(rule).toBeDefined();
    expect(rule).toContain("var(--ha-border-radius-pill");
    // Light pill mixed from the header's own colour; --primary-text-color keeps text
    // readable in both light and dark themes.
    expect(rule).toContain("var(--ha-color-fill-neutral-normal-resting)");
    expect(rule).toContain(
      "color-mix(in srgb, var(--input-fill-color) 88%, var(--primary-text-color) 12%)",
    );
    expect(rule).toContain("var(--primary-text-color)");
  });

  it("idles the oracle when conditions are cleared — resets verdict and empties the condition list", async () => {
    // Start: conditions present, oracle created, icon shown.
    const el = await mountWithStatus("hidden", [{ condition: "state" }]);
    expect(el.renderRoot.querySelector(".status-icon")).not.toBeNull();

    // Clear conditions — visibility goes to undefined.
    el.visibility = undefined;
    // First updateComplete: count=0 → updated() idles the oracle (_oracleState
    // → undefined) which schedules a second render.
    await el.updateComplete;
    // Second updateComplete: settles with _oracleState still undefined.
    await el.updateComplete;

    // Neither pill nor icon in the header.
    expect(el.renderRoot.querySelector(".count")).toBeNull();
    expect(el.renderRoot.querySelector(".status-icon")).toBeNull();

    // Oracle handed an empty list — ConditionListenersController released all
    // subscriptions when setup([]) was called.
    const oracle = el.renderRoot.querySelector("ha-visibility-status") as HaVisibilityStatusStub;
    expect(oracle.conditions).toEqual([]);
  });
});

// ── ha-alert stub, registered in the malformed describe's beforeAll ──
class HaAlertStub extends HTMLElement {}

/**
 * Mounts a visibility section with an arbitrary (possibly malformed) visibility
 * value. Pass `haAlert: false` to withhold the ha-alert stub registration —
 * use this to test the p.warning fallback before ha-alert is ever defined.
 * Default (`haAlert` omitted or true) registers the stub lazily on first call.
 */
const mountSection = async (
  item: { visibility?: unknown },
  opts: { haAlert?: boolean } = {},
): Promise<PictureStudioVisibilitySection> => {
  if ((opts.haAlert ?? true) && !customElements.get("ha-alert")) {
    customElements.define("ha-alert", HaAlertStub);
  }
  if (!customElements.get(VISIBILITY_SECTION_TAG)) {
    customElements.define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
  }
  const el = document.createElement(VISIBILITY_SECTION_TAG) as PictureStudioVisibilitySection;
  el.hass = hass;
  el.visibility = item.visibility;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

// ── Guard: ha-alert not yet registered at this point in the file ──
describe("malformed visibility — ha-alert not registered", () => {
  it("falls back to a paragraph when ha-alert is not defined", async () => {
    const malformed = { condition: "state", entity: "light.a", state: "on" } as never;
    const section = await mountSection({ visibility: malformed }, { haAlert: false });
    expect(section.shadowRoot!.querySelector("p.warning")?.textContent).toContain("not a list");
  });
});

describe("a malformed visibility", () => {
  const malformed = { condition: "state", entity: "light.a", state: "on" } as never;

  // ha-alert stub is registered lazily by mountSection's default on first call.

  it("shows no count pill — a string's `.length` is a character count, not a condition count", async () => {
    // "on" is a YAML boolean that becomes a string; "on".length === 2 on
    // the unpatched path, making the section render a pill reading "2".
    const section = await mountSection({ visibility: "on" as never });
    expect(section.shadowRoot!.querySelector(".count")).toBeNull();
  });

  it("mounts no oracle — a string is not a condition list", async () => {
    // ha-visibility-status is registered at this point. On the unpatched path
    // count = "on".length = 2, so updated() creates and appends the oracle.
    const section = await mountSection({ visibility: "on" as never });
    expect(section.shadowRoot!.querySelector("ha-visibility-status")).toBeNull();
  });

  it("puts the warning and a visible verdict in the header", async () => {
    const section = await mountSection({ visibility: malformed });
    const icons = [...section.shadowRoot!.querySelectorAll('[slot="event"]')];
    expect(icons.map((i) => i.getAttribute("icon"))).toEqual(["mdi:alert-outline", "mdi:eye"]);
  });

  it("renders the alert instead of Home Assistant's editor", async () => {
    const section = await mountSection({ visibility: malformed });
    expect(section.shadowRoot!.querySelector("ha-alert")).not.toBeNull();
    expect(section.shadowRoot!.querySelector("hui-card-visibility-editor")).toBeNull();
  });

  it("clears the raw value when Reset is pressed", async () => {
    const section = await mountSection({ visibility: malformed });
    let detail: { visibility?: unknown } | undefined;
    section.addEventListener("visibility-changed", (ev) => {
      detail = (ev as CustomEvent).detail;
    });
    (section.shadowRoot!.querySelector('[slot="action"]') as HTMLElement).click();
    expect(detail).toEqual({ visibility: undefined });
  });
});

describe("a well-formed visibility is unchanged", () => {
  it("still shows the count pill and no warning", async () => {
    const section = await mountSection({ visibility: [{ condition: "user", users: [] }] });
    expect(section.shadowRoot!.querySelector(".count")?.textContent?.trim()).toBe("1");
    expect(section.shadowRoot!.querySelector("ha-alert")).toBeNull();
  });
});

describe("the malformed-visibility alert has no title and a filled warning button", () => {
  const malformed = { condition: "state", entity: "light.a", state: "on" } as never;

  it("renders ha-alert with no title attribute", async () => {
    const section = await mountSection({ visibility: malformed });
    const alert = section.shadowRoot!.querySelector("ha-alert");
    expect(alert).not.toBeNull();
    // ha-alert centres its icon only when there is no title; no title also
    // removes a heading that restated the body.
    expect(alert?.hasAttribute("title")).toBe(false);
    expect((alert as { title?: string } | null)?.title).toBeFalsy();
  });

  it("the action button carries variant=warning and appearance=filled", async () => {
    const section = await mountSection({ visibility: malformed });
    const button = section.shadowRoot!.querySelector('[slot="action"]');
    expect(button?.getAttribute("variant")).toBe("warning");
    expect(button?.getAttribute("appearance")).toBe("filled");
  });
});
