import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioStateLabel } from "../../../card/state-label-element";
import { LABEL_TAG, type StateLabelConfig } from "../../../config";
import { DEFAULT_LABEL_SIZE } from "../../../element-size";
import { cssRules } from "./harness";

if (!customElements.get(LABEL_TAG)) customElements.define(LABEL_TAG, PictureStudioStateLabel);

const mount = async (config: Partial<StateLabelConfig>) => {
  const el = document.createElement(LABEL_TAG) as PictureStudioStateLabel;
  el.setConfig({ type: "state-label", size: DEFAULT_LABEL_SIZE, show: ["state"], ...config });
  el.hass = {
    states: {
      "sensor.a": { entity_id: "sensor.a", state: "21.5", attributes: { friendly_name: "Salon" } },
      "light.a": { entity_id: "light.a", state: "on", attributes: { brightness: 128 } },
      "light.off": { entity_id: "light.off", state: "off", attributes: {} },
    },
    formatEntityName: () => "Salon",
    formatEntityState: () => "21,5 °C",
  } as never;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const text = (el: PictureStudioStateLabel) =>
  el.shadowRoot?.querySelector(".content")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

afterEach(() => {
  document.body.replaceChildren();
});

describe("displayed parts", () => {
  it("shows the state alone by default", async () => {
    const el = await mount({ entity: "sensor.a", show: ["state"] });
    expect(el.shadowRoot?.querySelector(".name")).toBeNull();
    expect(text(el)).toContain("21,5 °C");
  });

  it("shows the name above the state when both are asked for", async () => {
    const el = await mount({ entity: "sensor.a", show: ["name", "state"] });
    expect(el.shadowRoot?.querySelector(".name")?.textContent).toBe("Salon");
    expect(text(el)).toBe("Salon 21,5 °C");
  });

  it("renders nothing but an empty content box when neither is asked for", async () => {
    const el = await mount({ entity: "sensor.a", show: [] });
    expect(text(el)).toBe("");
  });

  it("shows the state when show says nothing, and honours a list", async () => {
    const stateOnly = await mount({ entity: "sensor.a", show: ["state"] });
    expect(stateOnly.shadowRoot?.querySelector(".name")).toBeNull();
    expect(text(stateOnly)).toContain("21,5 °C");

    const nameOnly = await mount({ entity: "sensor.a", show: ["name"] });
    expect(nameOnly.shadowRoot?.querySelector(".state")).toBeNull();
    expect(nameOnly.shadowRoot?.querySelector(".name")?.textContent).toBe("Salon");
  });
});

describe("state rendering", () => {
  // state-display is a custom element, and an undefined custom element renders
  // nothing at all, silently. happy-dom never defines it, so this suite always
  // walks the fallback — which is exactly the path that must not be a blank.
  it("falls back to formatEntityState when state-display is undefined", async () => {
    const el = await mount({ entity: "sensor.a", show: ["state"] });
    expect(el.shadowRoot?.querySelector("state-display")).toBeNull();
    expect(text(el)).toBe("21,5 °C");
  });
});

describe("size, halo and chrome", () => {
  it("drives the font size, not a box", async () => {
    const el = await mount({ entity: "sensor.a", show: ["state"] });
    expect(el.style.getPropertyValue("--psc-label-size")).toBe("clamp(11px, 3cqw, 20px)");
  });

  it("wears the halo attribute only when asked", async () => {
    expect((await mount({ entity: "sensor.a" })).hasAttribute("halo")).toBe(false);
    expect((await mount({ entity: "sensor.a", halo: true })).hasAttribute("halo")).toBe(true);
  });

  it("scales the halo on the body size, never on the box", () => {
    const rule = cssRules(PictureStudioStateLabel.styles).find(
      (r) => r.selector === ":host([halo]) .chrome",
    );
    expect(rule?.text).toContain("calc(var(--psc-label-size) * 0.06)");
  });

  it("wears the chrome attribute and its tokens only when a theme draws", async () => {
    const off = await mount({
      entity: "sensor.a",
      chrome: { theme: "none", radius: 4, pill: false, opacity: 1, padding: 6 },
    });
    expect(off.hasAttribute("chrome")).toBe(false);
    expect(off.style.getPropertyValue("--psc-chrome-fill")).toBe("");

    const on = await mount({
      entity: "sensor.a",
      chrome: { theme: "dark", radius: 4, pill: false, opacity: 0.8, padding: 8 },
    });
    expect(on.hasAttribute("chrome")).toBe(true);
    expect(on.style.getPropertyValue("--psc-chrome-radius")).toBe("4px");
    expect(on.style.getPropertyValue("--psc-chrome-padding")).toBe("8px");
    expect(on.style.getPropertyValue("--psc-chrome-opacity")).toBe("0.8");
  });

  it("gives a pill a radius no text length can outgrow", async () => {
    const el = await mount({
      entity: "sensor.a",
      chrome: { theme: "auto", radius: 4, pill: true, opacity: 1, padding: 6 },
    });
    expect(el.style.getPropertyValue("--psc-chrome-radius")).toBe("999px");
  });

  it("never wraps", () => {
    const rule = cssRules(PictureStudioStateLabel.styles).find((r) => r.selector === ".content");
    expect(rule?.text).toContain("white-space: nowrap");
  });

  it("gives the state the badge weight token, not the default 400", () => {
    const rule = cssRules(PictureStudioStateLabel.styles).find((r) => r.selector === ".state");
    expect(rule?.text).toContain("font-weight: var(--ha-font-weight-medium, 500)");
  });
});

describe("colour", () => {
  it("writes nothing for `none`, so the theme decides", async () => {
    const el = await mount({ entity: "sensor.a", color: "none", show: ["state"] });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe("");
  });

  it("maps a palette name onto Home Assistant's own variable", async () => {
    const el = await mount({ entity: "sensor.a", color: "red", show: ["state"] });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe("var(--red-color)");
  });

  it("passes an unknown value through as a plain CSS colour", async () => {
    const el = await mount({ entity: "sensor.a", color: "#abcdef", show: ["state"] });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe("#abcdef");
  });

  it("honours the state colour, which is the whole point of 1.4.0's reversal", async () => {
    const el = await mount({ entity: "light.a", color: "state", show: ["state"] });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe(
      "var(--state-light-on-color, var(--state-light-active-color, var(--state-active-color)))",
    );
  });

  it("dims the state line by the bulb's brightness, and only under `state`", async () => {
    const dimmed = await mount({ entity: "light.a", color: "state", show: ["state"] });
    expect(dimmed.style.getPropertyValue("--psc-label-brightness")).toBe("brightness(74.6%)");
    // A named colour is the user overruling the entity, so nothing dims it.
    const named = await mount({ entity: "light.a", color: "red", show: ["state"] });
    expect(named.style.getPropertyValue("--psc-label-brightness")).toBe("");
  });

  it("hands the same colour to the hover veil, and withdraws both together", async () => {
    const lit = await mount({ entity: "light.a", color: "red", show: ["state"] });
    expect(lit.style.getPropertyValue("--psc-item-color")).toBe("var(--red-color)");
    const off = await mount({ entity: "light.off", color: "red", show: ["state"] });
    expect(off.style.getPropertyValue("--psc-item-color")).toBe("");
    expect(off.style.getPropertyValue("--psc-label-color")).toBe("");
  });

  it("filters the state line from the brightness token, never the name", () => {
    const rules = cssRules(PictureStudioStateLabel.styles);
    expect(rules.get(".state")).toContain("filter: var(--psc-label-brightness, none)");
    expect(rules.get(".name")).not.toContain("filter");
  });
});

describe("actions", () => {
  it("is clickable unless all three actions are none", async () => {
    expect((await mount({ entity: "sensor.a" })).hasAttribute("clickable")).toBe(true);
    const silent = await mount({
      entity: "sensor.a",
      tap_action: { action: "none" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });
    expect(silent.hasAttribute("clickable")).toBe(false);
  });
});

describe("the shared interaction block", () => {
  it("is part of the label's styles, exactly as it is part of the icon's", () => {
    const rules = cssRules(PictureStudioStateLabel.styles);
    expect(rules.get(":host([clickable])")).toContain("cursor: pointer");
    expect(rules.get(":host([chrome]) .chrome::after")).toContain("var(--psc-item-color");
    expect(rules.get(":host([clickable]:not([chrome]):hover)")).toContain("scale(1.08)");
  });
});

describe("what a hass tick costs", () => {
  it("turns away a tick that moved another entity", async () => {
    const el = await mount({ entity: "light.a", color: "state", show: ["state"] });
    el.style.removeProperty("--psc-label-size");
    const states = (el.hass as { states: Record<string, unknown> }).states;
    el.hass = {
      ...(el.hass as object),
      states: { ...states, "light.off": { entity_id: "light.off", state: "on", attributes: {} } },
    } as never;
    await el.updateComplete;
    expect(el.style.getPropertyValue("--psc-label-size")).toBe("");
  });

  it("follows its own entity, and leaves the config-only tokens alone", async () => {
    const el = await mount({ entity: "light.a", color: "state", show: ["state"] });
    el.style.removeProperty("--psc-label-size");
    const states = (el.hass as { states: Record<string, unknown> }).states;
    el.hass = {
      ...(el.hass as object),
      states: { ...states, "light.a": { entity_id: "light.a", state: "off", attributes: {} } },
    } as never;
    await el.updateComplete;
    expect(el.style.getPropertyValue("--psc-label-color")).toContain("--state-light-off-color");
    expect(el.style.getPropertyValue("--psc-label-brightness")).toBe("");
    expect(el.style.getPropertyValue("--psc-label-size")).toBe("");
  });
});

describe("a label with nothing to show", () => {
  it("renders nothing at all on a dashboard, chrome or not", async () => {
    const el = await mount({
      entity: "sensor.a",
      show: [],
      chrome: { theme: "auto", radius: 8, pill: false, opacity: 1, padding: 6 },
    });
    expect(el.shadowRoot?.querySelector(".chrome")).toBeNull();
    expect(el.shadowRoot?.querySelector(".placeholder")).toBeNull();
  });

  it("draws a placeholder once the card says it is editing", async () => {
    const el = await mount({ entity: "sensor.a", show: [] });
    el.editing = true;
    await el.updateComplete;
    const placeholder = el.shadowRoot?.querySelector(".placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent?.trim()).toBe("Empty");
    // No chrome behind it: the placeholder is the whole item while it is empty.
    expect(el.shadowRoot?.querySelector(".chrome")).toBeNull();
  });

  it("goes back to its normal rendering as soon as something is shown", async () => {
    const el = await mount({ entity: "sensor.a", show: ["state"] });
    el.editing = true;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector(".placeholder")).toBeNull();
    expect(el.shadowRoot?.querySelector(".chrome")).not.toBeNull();
  });

  it("dresses the placeholder as a warning, in one colour at three strengths", () => {
    const rule = cssRules(PictureStudioStateLabel.styles).get(".placeholder");
    expect(rule).toContain("border: 1px dashed var(--warning-color)");
    expect(rule).toContain("color: var(--warning-color)");
    // A veil, not an opaque surface: the picture stays visible under the word.
    expect(rule).toContain("color-mix(in srgb, var(--warning-color) 15%, transparent)");
    expect(rule).toContain("border-radius: 5px");
    expect(rule).toContain("padding: 2px 4px");
    // Cased here rather than in the string catalogue, so every language gets it
    // without a second string.
    expect(rule).toContain("text-transform: lowercase");
    // Not the error colour: the config is valid, the outcome is merely invisible.
    expect(rule).not.toContain("--error-color");
  });
});
