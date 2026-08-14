import { afterEach, describe, expect, it } from "@rstest/core";
import { hasAction, PictureStudioStateIcon } from "../../card/state-icon-element";
import { ICON_TAG, type StateIconConfig } from "../../config";
import { DEFAULT_ICON_SIZE } from "../../element-size";

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
