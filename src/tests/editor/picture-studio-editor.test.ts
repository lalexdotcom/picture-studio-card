import { afterEach, describe, expect, it } from "@rstest/core";
import { EDITOR_TAG, type PictureStudioConfig } from "../../config";
import { probeBadgeType, resetBadgeVerdicts } from "../../editor/badge-existence";
import { PictureStudioEditor } from "../../editor/picture-studio-editor";

if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, PictureStudioEditor);

const CONFIG = {
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } },
    { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
  ],
} as unknown as PictureStudioConfig;

/** Counts the calls happy-dom would otherwise swallow: it has no layout. */
const mount = async () => {
  const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
  el.setConfig(CONFIG);
  el.hass = { localize: () => "", states: {} } as never;
  document.body.append(el);
  await el.updateComplete;
  let scrolls = 0;
  el.scrollIntoView = () => {
    scrolls++;
  };
  return { el, calls: () => scrolls };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("a form opens at its own top", () => {
  it("scrolls when an item's form opens", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    expect(calls()).toBe(1);
  });

  it("scrolls again when a second item's form replaces the first", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    el.select(1);
    await el.updateComplete;
    expect(calls()).toBe(2);
  });

  it("does not scroll on a re-render of the form already open", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    // What a keystroke or a hass tick produces: an update that leaves the
    // selection alone. Scrolling here would fight the user's own scrolling.
    el.hass = { localize: () => "", states: {} } as never;
    await el.updateComplete;
    expect(calls()).toBe(1);
  });

  it("does not scroll on the way back to the list", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    el.select(undefined);
    await el.updateComplete;
    expect(calls()).toBe(1);
  });
});

describe("a missing badge refuses the form and does not scroll the editor", () => {
  const probeHelpers = {
    createBadgeElement: (c: { type?: string }) =>
      document.createElement(
        c.type === "entity" ? "hui-entity-badge" : "hui-error-badge",
      ),
  };

  // Config: item 0 has a missing type, item 1 is valid.
  const CONFIG_WITH_MISSING = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entty" } },
      { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
    ],
  } as unknown as import("../../config").PictureStudioConfig;

  const mountMissing = async () => {
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers =
      async () => probeHelpers;
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG_WITH_MISSING);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    // First microtask tick — Lit renders but probe hasn't resolved yet.
    await Promise.resolve();
    // Drain the probe — same pattern as badge-list.test.ts "a badge whose type does not exist".
    await (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers();
    await el.updateComplete;

    let scrolls = 0;
    el.scrollIntoView = () => { scrolls++; };
    return { el, calls: () => scrolls };
  };

  afterEach(() => {
    document.body.replaceChildren();
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
  });

  it("renders the list, not a badge-form, for a badge whose verdict is missing", async () => {
    const { el } = await mountMissing();
    el.select(0); // select the missing badge
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("picture-studio-badge-form")).toBeNull();
    expect(el.shadowRoot?.querySelector("picture-studio-badge-list")).not.toBeNull();
  });

  it("does not scroll the editor when the form is refused", async () => {
    const { el, calls } = await mountMissing();
    el.select(0); // missing badge — form refused
    await el.updateComplete;
    expect(calls()).toBe(0);
  });

  it("still scrolls when a valid item's form opens", async () => {
    const { el, calls } = await mountMissing();
    el.select(1); // valid badge — form opens
    await el.updateComplete;
    expect(calls()).toBe(1);
  });
});
