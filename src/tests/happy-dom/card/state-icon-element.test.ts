import { afterEach, describe, expect, it } from "@rstest/core";
import { hasAction, PictureStudioStateIcon } from "../../../card/state-icon-element";
import { ICON_TAG, type StateIconConfig } from "../../../config";
import { DEFAULT_ICON_SIZE } from "../../../element-size";
import { cssRules } from "./harness";

if (!customElements.get(ICON_TAG)) customElements.define(ICON_TAG, PictureStudioStateIcon);

const mount = async (config: Partial<StateIconConfig>) => {
  const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
  el.setConfig({ type: "state-icon", size: DEFAULT_ICON_SIZE, ...config });
  el.hass = {
    states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } },
  } as never;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const badge = (el: PictureStudioStateIcon) =>
  el.shadowRoot?.querySelector("state-badge") as (HTMLElement & Record<string, unknown>) | null;

const chromeEl = (el: PictureStudioStateIcon) =>
  el.shadowRoot?.querySelector(".chrome") as HTMLElement | null;

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-state-icon", () => {
  it("hands the entity's state object to state-badge", async () => {
    const el = await mount({ entity: "light.a" });
    const stateObj = badge(el)?.stateObj;
    expect((stateObj as { entity_id: string } | undefined)?.entity_id).toBe("light.a");
  });

  it("renders with no entity — the state-badge draws its own missing marker", async () => {
    const el = await mount({});
    expect(badge(el)?.stateObj).toBeUndefined();
  });

  it("colours by state unless told otherwise", async () => {
    expect(badge(await mount({ entity: "light.a" }))?.color).toBe("state");
    expect(badge(await mount({ entity: "light.a", color: "red" }))?.color).toBe("red");
  });

  describe("overrideImage", () => {
    it("is undefined when the entity has no picture — the bug was ''", async () => {
      // light.a has attributes: {} — no entity_picture. Passing "" unconditionally
      // blocked state-badge's colour computation; the fix makes it undefined here.
      expect(badge(await mount({ entity: "light.a" }))?.overrideImage).toBeUndefined();
    });

    it("is '' when the entity has a picture and show_entity_picture is off", async () => {
      const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
      el.setConfig({ type: "state-icon", size: DEFAULT_ICON_SIZE, entity: "light.p" });
      el.hass = {
        states: {
          "light.p": {
            entity_id: "light.p",
            state: "on",
            attributes: { entity_picture: "/cam.jpg" },
          },
        },
      } as never;
      document.body.append(el);
      await el.updateComplete;
      expect(badge(el)?.overrideImage).toBe("");
    });

    it("is undefined even with a picture when an icon override is set", async () => {
      const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
      el.setConfig({
        type: "state-icon",
        size: DEFAULT_ICON_SIZE,
        entity: "light.p",
        icon: "mdi:lamp",
      });
      el.hass = {
        states: {
          "light.p": {
            entity_id: "light.p",
            state: "on",
            attributes: { entity_picture: "/cam.jpg" },
          },
        },
      } as never;
      document.body.append(el);
      await el.updateComplete;
      expect(badge(el)?.overrideImage).toBeUndefined();
    });

    it("is undefined when show_entity_picture is true", async () => {
      expect(
        badge(await mount({ entity: "light.a", show_entity_picture: true }))?.overrideImage,
      ).toBeUndefined();
    });
  });

  it("passes the icon override through", async () => {
    expect(badge(await mount({ icon: "mdi:lamp" }))?.overrideIcon).toBe("mdi:lamp");
  });

  it("writes the size as a custom property on the host", async () => {
    const el = await mount({
      entity: "light.a",
      size: { mode: "adaptive" as const, min: 10, ratio: 1, max: 20, value: 48 },
    });
    expect(el.style.getPropertyValue("--psc-icon-size")).toBe("clamp(10px, 1cqw, 20px)");
  });
});

describe("title", () => {
  it("uses formatEntityName with the configured name", async () => {
    const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
    el.setConfig({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      entity: "light.a",
      name: "My lamp",
    });
    el.hass = {
      states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } },
      formatEntityName: (_s: unknown, name?: string) => name ?? "Default Name",
    } as never;
    document.body.append(el);
    await el.updateComplete;
    expect(badge(el)?.getAttribute("title")).toBe("My lamp");
  });

  it("calls formatEntityName with undefined when no name is configured", async () => {
    const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
    el.setConfig({ type: "state-icon", size: DEFAULT_ICON_SIZE, entity: "light.a" });
    el.hass = {
      states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } },
      formatEntityName: (_s: unknown, name?: string) => name ?? "Default Name",
    } as never;
    document.body.append(el);
    await el.updateComplete;
    expect(badge(el)?.getAttribute("title")).toBe("Default Name");
  });

  it("emits no title attribute when there is no entity", async () => {
    const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
    el.setConfig({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    el.hass = {
      states: {},
      formatEntityName: () => "should not be used",
    } as never;
    document.body.append(el);
    await el.updateComplete;
    expect(badge(el)?.hasAttribute("title")).toBe(false);
  });
});

describe("clickable attribute", () => {
  it("is present when no action keys are set — default is more-info", async () => {
    const el = await mount({ entity: "light.a" });
    expect(el.hasAttribute("clickable")).toBe(true);
  });

  it("is absent when tap_action is none and the others are unset", async () => {
    const el = await mount({ entity: "light.a", tap_action: { action: "none" } });
    expect(el.hasAttribute("clickable")).toBe(false);
  });

  it("is present when tap_action is none but hold_action is active", async () => {
    const el = await mount({
      entity: "light.a",
      tap_action: { action: "none" },
      hold_action: { action: "toggle" },
    });
    expect(el.hasAttribute("clickable")).toBe(true);
  });
});

class FakeActionHandler extends HTMLElement {
  binds: { element: HTMLElement; options: unknown }[] = [];
  bind(element: HTMLElement, options: unknown): void {
    this.binds.push({ element, options });
  }
}
if (!customElements.get("action-handler")) {
  customElements.define("action-handler", FakeActionHandler);
}

describe("hasAction", () => {
  it("counts an action that is set and is not none", () => {
    expect(hasAction(undefined)).toBe(false);
    expect(hasAction({ action: "none" })).toBe(false);
    expect(hasAction({ action: "toggle" })).toBe(true);
  });
});

describe("chrome", () => {
  it("always wraps the badge, so the DOM shape never depends on the config", async () => {
    const el = await mount({ entity: "light.a" });
    expect(chromeEl(el)).not.toBeNull();
    expect(chromeEl(el)?.querySelector("state-badge")).not.toBeNull();
  });

  it("marks nothing and writes nothing when there is no chrome", async () => {
    const el = await mount({ entity: "light.a" });
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(el.style.getPropertyValue("--psc-chrome-fill")).toBe("");
    expect(el.style.getPropertyValue("--psc-content-ratio")).toBe("");
  });

  it("treats an explicit theme of none as no chrome", async () => {
    const el = await mount({
      entity: "light.a",
      chrome: { theme: "none", radius: 10, opacity: 0.5, content_ratio: 0.4 },
    });
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(el.style.getPropertyValue("--psc-chrome-radius")).toBe("");
  });

  it("writes the four properties when a chrome is on", async () => {
    const el = await mount({
      entity: "light.a",
      chrome: { theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 },
    });
    expect(el.hasAttribute("chrome")).toBe(true);
    expect(el.style.getPropertyValue("--psc-chrome-fill")).toBe(
      "var(--ha-color-neutral-10, #202020)",
    );
    expect(el.style.getPropertyValue("--psc-chrome-radius")).toBe("12%");
    expect(el.style.getPropertyValue("--psc-chrome-opacity")).toBe("0.8");
    expect(el.style.getPropertyValue("--psc-content-ratio")).toBe("0.5");
  });

  it("clears the properties when a chrome is switched off in place", async () => {
    const el = await mount({
      entity: "light.a",
      chrome: { theme: "auto", radius: 50, opacity: 1, content_ratio: 0.6 },
    });
    el.setConfig({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      entity: "light.a",
      chrome: { theme: "none", radius: 50, opacity: 1, content_ratio: 0.6 },
    });
    await el.updateComplete;
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(el.style.getPropertyValue("--psc-chrome-fill")).toBe("");
  });
});

describe("the halo", () => {
  it("wears the halo attribute only when the config asks for it", async () => {
    expect((await mount({ entity: "light.a" })).hasAttribute("halo")).toBe(false);
    expect((await mount({ entity: "light.a", halo: true })).hasAttribute("halo")).toBe(true);
  });

  it("draws the halo behind :host([halo]) and nowhere else", () => {
    const rules = cssRules(PictureStudioStateIcon.styles);
    const unconditional = rules.find((r) => r.selector === ".chrome");
    expect(unconditional?.text).not.toContain("drop-shadow");
    const gated = rules.find((r) => r.selector === ":host([halo]) .chrome");
    expect(gated?.text).toContain("drop-shadow");
  });

  it("keeps the shape and the clipping under the chrome, away from the halo", () => {
    const shaped = cssRules(PictureStudioStateIcon.styles).get(":host([chrome]) .chrome");
    expect(shaped).toContain("border-radius");
    expect(shaped).toContain("overflow: hidden");
    // The halo lives in its own rule. These two conflated once, and every icon
    // without a chrome came out a circle.
    expect(shaped).not.toContain("filter");
  });
});

describe("the action relay", () => {
  it("binds itself to the singleton action-handler, declaring its gestures", async () => {
    const el = await mount({
      entity: "light.a",
      hold_action: { action: "more-info" },
      double_tap_action: { action: "none" },
    });
    const handler = document.body.querySelector("action-handler") as FakeActionHandler;
    const bound = handler.binds.find((b) => b.element === el);
    expect(bound?.options).toEqual({ hasHold: true, hasDoubleClick: false });
  });

  it("relays an action event as hass-action carrying the item's config", async () => {
    const el = await mount({ entity: "light.a", tap_action: { action: "toggle" } });
    const seen: CustomEvent[] = [];
    document.body.addEventListener("hass-action", (ev) => seen.push(ev as CustomEvent));

    el.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.detail).toEqual({
      config: {
        type: "state-icon",
        size: DEFAULT_ICON_SIZE,
        entity: "light.a",
        tap_action: { action: "toggle" },
      },
      action: "tap",
    });
    expect(seen[0]?.composed).toBe(true);
  });

  it("stays silent when it has no config yet", async () => {
    const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
    document.body.append(el);
    const seen: Event[] = [];
    document.body.addEventListener("hass-action", (ev) => seen.push(ev));
    el.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    expect(seen).toHaveLength(0);
  });
});

describe("the shared interaction block", () => {
  it("is part of the icon's styles, veil and grow together", () => {
    const rules = cssRules(PictureStudioStateIcon.styles);
    expect(rules.get(":host([clickable])")).toContain("cursor: pointer");
    expect(rules.get(":host([chrome]) .chrome::after")).toContain("var(--psc-item-color");
    expect(rules.get(":host([clickable]:not([chrome]):hover)")).toContain("scale(1.08)");
  });

  it("writes the veil's colour from the same recipe state-badge paints with", async () => {
    const el = await mount({ entity: "light.a" });
    expect(el.style.getPropertyValue("--psc-item-color")).toBe(
      "var(--state-light-on-color, var(--state-light-active-color, var(--state-active-color)))",
    );
    // `color: none` names nothing, so the veil falls back to the inactive grey.
    const plain = await mount({ entity: "light.a", color: "none" });
    expect(plain.style.getPropertyValue("--psc-item-color")).toBe("");
  });
});

describe("what a hass tick costs", () => {
  const tick = (el: PictureStudioStateIcon, states: Record<string, unknown>) => {
    el.hass = { ...(el.hass as object), states } as never;
    return el.updateComplete;
  };

  it("does not touch the host again when another entity moved", async () => {
    const el = await mount({ entity: "light.a" });
    // Cleared by hand: only a re-render would put it back, so its absence after
    // the tick is the proof that nothing ran.
    el.style.removeProperty("--psc-icon-size");
    await tick(el, {
      "light.a": (el.hass as { states: Record<string, unknown> }).states["light.a"],
      "light.b": { entity_id: "light.b", state: "on", attributes: {} },
    });
    expect(el.style.getPropertyValue("--psc-icon-size")).toBe("");
  });

  it("rewrites the colour, and only the colour, when its own entity moves", async () => {
    const el = await mount({ entity: "light.a" });
    el.style.removeProperty("--psc-icon-size");
    await tick(el, { "light.a": { entity_id: "light.a", state: "off", attributes: {} } });
    expect(el.style.getPropertyValue("--psc-item-color")).toContain("--state-light-off-color");
    // The size follows the config, which did not change.
    expect(el.style.getPropertyValue("--psc-icon-size")).toBe("");
  });

  it("rewrites everything when the config changes", async () => {
    const el = await mount({ entity: "light.a" });
    el.style.removeProperty("--psc-icon-size");
    el.setConfig({ type: "state-icon", size: DEFAULT_ICON_SIZE, entity: "light.a" });
    await el.updateComplete;
    expect(el.style.getPropertyValue("--psc-icon-size")).not.toBe("");
  });
});
