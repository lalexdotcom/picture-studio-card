import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import { FORM_TAG } from "../../../config";
import { PictureStudioBadgeForm } from "../../../editor/badge-form";
import type { BadgeConfig, HomeAssistant } from "../../../types";

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: () => "",
} as unknown as HomeAssistant;

const mount = async (badge: BadgeConfig): Promise<PictureStudioBadgeForm> => {
  if (!customElements.get(FORM_TAG)) {
    customElements.define(FORM_TAG, PictureStudioBadgeForm);
  }
  const el = document.createElement(FORM_TAG) as PictureStudioBadgeForm;
  el.hass = hass;
  el.badge = badge;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("PictureStudioBadgeForm", () => {
  it("shows 'badge' in the header when the badge has no type", async () => {
    const el = await mount({});
    expect(el.renderRoot.querySelector(".title")?.textContent?.trim()).toBe("badge");
  });

  describe("header title for a custom badge", () => {
    let savedCustomBadges: typeof window.customBadges;
    beforeEach(() => {
      savedCustomBadges = window.customBadges;
    });
    afterEach(() => {
      window.customBadges = savedCustomBadges;
    });

    it("shows the registered name when the badge library is loaded", async () => {
      window.customBadges = [{ type: "custom:something", name: "Something Nice" }];
      const el = await mount({ type: "custom:something" });
      expect(el.renderRoot.querySelector(".title")?.textContent?.trim()).toBe("Something Nice");
    });

    it("shows the raw type when the badge library is not loaded", async () => {
      window.customBadges = undefined;
      const el = await mount({ type: "custom:something" });
      expect(el.renderRoot.querySelector(".title")?.textContent?.trim()).toBe("custom:something");
    });
  });
});

/**
 * The nested editor is Home Assistant's own, and `setConfig` is how it is told
 * what to show. `hass` is republished on every state change in the house, so
 * anything hanging off an unguarded `updated()` runs at that rate.
 */
describe("what reaches the nested editor, and how often", () => {
  class FakeBadgeEditor extends HTMLElement {
    configs: unknown[] = [];
    hass?: unknown;
    setConfig(config: unknown): void {
      this.configs.push(config);
    }
  }
  class FakeBadge extends HTMLElement {
    static getConfigElement(): HTMLElement {
      return new FakeBadgeEditor();
    }
  }
  if (!customElements.get("fake-badge-editor")) {
    customElements.define("fake-badge-editor", FakeBadgeEditor);
  }
  if (!customElements.get("fake-badge")) customElements.define("fake-badge", FakeBadge);

  /** The editor is mounted across two awaits, so a render alone is not enough. */
  const settle = async (el: PictureStudioBadgeForm): Promise<FakeBadgeEditor> => {
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
    return el.renderRoot.querySelector("fake-badge-editor") as FakeBadgeEditor;
  };

  it("configures the editor once when it is mounted", async () => {
    const el = await mount({ type: "custom:fake-badge" });
    const editor = await settle(el);
    expect(editor.configs).toHaveLength(1);
  });

  it("does not reconfigure it when only hass changed", async () => {
    const el = await mount({ type: "custom:fake-badge" });
    const editor = await settle(el);

    // Three ticks of an ordinary house: a light, a sensor, a door.
    el.hass = { ...hass } as never;
    await settle(el);
    el.hass = { ...hass } as never;
    await settle(el);
    el.hass = { ...hass } as never;
    await settle(el);

    expect(editor.configs).toHaveLength(1);
  });

  it("still reconfigures it when the badge itself changed", async () => {
    const el = await mount({ type: "custom:fake-badge" });
    const editor = await settle(el);

    el.badge = { type: "custom:fake-badge", entity: "light.a" };
    await settle(el);

    expect(editor.configs).toHaveLength(2);
    expect(editor.configs[1]).toEqual({ type: "custom:fake-badge", entity: "light.a" });
  });
});
