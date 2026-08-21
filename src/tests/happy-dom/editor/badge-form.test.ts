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
