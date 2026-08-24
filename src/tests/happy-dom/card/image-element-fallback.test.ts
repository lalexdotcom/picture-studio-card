/**
 * Covers the paths that require `hui-image` to be absent from the registry.
 *
 * NO hui-image stub is defined here — that is the point. If rstest gives each
 * test file its own custom-element registry (as it does at 0.11.9 with
 * happy-dom), this file sees a clean registry even when image-element.test.ts
 * runs alongside it and defines a stub there. The first assertion in the
 * "hui-image missing" test confirms that guarantee at runtime.
 */
import { afterEach, describe, expect, test } from "@rstest/core";
import { PictureStudioImage } from "../../../card/image-element";
import { IMAGE_TAG, type ImageElementConfig } from "../../../config";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(IMAGE_TAG)) customElements.define(IMAGE_TAG, PictureStudioImage);

// Deliberately no hui-image definition.

const hass = (states: Record<string, unknown> = {}): HomeAssistant =>
  ({ states, themes: { darkMode: false }, language: "en", localize: () => "" }) as HomeAssistant;

const mount = async (config: ImageElementConfig, h = hass(), editing = false) => {
  const el = document.createElement(IMAGE_TAG) as PictureStudioImage;
  el.editing = editing;
  el.setConfig(config);
  el.hass = h;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("rendering — fallback paths (no hui-image in registry)", () => {
  test("sourceless: a placeholder while editing, nothing at all otherwise", async () => {
    const editing = await mount({ type: "image", width: 40 }, hass(), true);
    expect(editing.renderRoot.querySelector(".placeholder")).toBeTruthy();

    const viewing = await mount({ type: "image", width: 40 }, hass(), false);
    expect(viewing.renderRoot.querySelector(".placeholder")).toBeNull();
    expect(viewing.renderRoot.querySelector("hui-image")).toBeNull();
  });

  test("hui-image missing degrades to the placeholder, never to a blank item", async () => {
    // This assertion is the registry-isolation guarantee: the stub defined in
    // image-element.test.ts must not bleed into this file's registry.
    expect(customElements.get("hui-image")).toBeUndefined();
    const el = await mount({ type: "image", width: 40, image: "/a.png" }, hass(), true);
    expect(el.renderRoot.querySelector(".placeholder")).toBeTruthy();
  });
});
