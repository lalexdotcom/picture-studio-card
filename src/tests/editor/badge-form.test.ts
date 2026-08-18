import { afterEach, describe, expect, it } from "@rstest/core";
import { FORM_TAG } from "../../config";
import { PictureStudioBadgeForm } from "../../editor/badge-form";
import type { BadgeConfig, HomeAssistant } from "../../types";

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
});
