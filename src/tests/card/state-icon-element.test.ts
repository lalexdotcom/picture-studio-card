import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioStateIcon } from "../../card/state-icon-element";
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
