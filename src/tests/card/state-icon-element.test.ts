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

  it("forces the icon with an empty overrideImage when the picture is off", async () => {
    expect(badge(await mount({ entity: "light.a" }))?.overrideImage).toBe("");
    expect(
      badge(await mount({ entity: "light.a", show_entity_picture: true }))?.overrideImage,
    ).toBeUndefined();
  });

  it("passes the icon override through", async () => {
    expect(badge(await mount({ icon: "mdi:lamp" }))?.overrideIcon).toBe("mdi:lamp");
  });

  it("writes the size as a custom property on the host", async () => {
    const el = await mount({
      entity: "light.a",
      size: { auto: false, min: 10, ratio: 1, max: 20 },
    });
    expect(el.style.getPropertyValue("--psc-icon-size")).toBe("clamp(10px, 1cqw, 20px)");
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
