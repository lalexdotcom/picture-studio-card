import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioToolbar } from "../../../card/toolbar";
import { TOOLBAR_TAG } from "../../../config";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(TOOLBAR_TAG)) {
  customElements.define(TOOLBAR_TAG, PictureStudioToolbar);
}

const hass = { states: {}, language: "en", localize: () => "" } as unknown as HomeAssistant;

const mount = async (item?: unknown, index?: number): Promise<PictureStudioToolbar> => {
  const el = document.createElement(TOOLBAR_TAG) as PictureStudioToolbar;
  el.hass = hass;
  // biome-ignore lint/suspicious/noExplicitAny: the fixtures are partial items on purpose
  el.item = item as any;
  el.index = index;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const imageItem = {
  type: "element",
  anchor: "auto",
  position: { x: 50, y: 50 },
  config: { type: "image", width: 20 },
};

const badgeItem = { type: "badge", anchor: "auto", position: { x: 50, y: 50 }, config: {} };

afterEach(() => {
  document.body.replaceChildren();
});

describe("the toolbar", () => {
  it("shows the anchor group with nothing selected, disabled", async () => {
    const el = await mount(undefined, undefined);
    expect(el.renderRoot.querySelector(".anchor-group")).not.toBeNull();
    const buttons = Array.from(el.renderRoot.querySelectorAll(".anchor-group button"));
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("draws no separator for an item that has no tools", async () => {
    const el = await mount(badgeItem, 0);
    expect(el.renderRoot.querySelector(".sep")).toBeNull();
  });

  it("draws the separator for an image", async () => {
    const el = await mount(imageItem, 0);
    expect(el.renderRoot.querySelector(".sep")).not.toBeNull();
  });

  it("emits auto when the wand is pressed", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    let seen: string | undefined;
    el.addEventListener("anchor-changed", (ev) => {
      seen = (ev as CustomEvent<{ anchor: string }>).detail.anchor;
    });
    (el.renderRoot.querySelector("button.auto") as HTMLButtonElement).click();
    expect(seen).toBe("auto");
  });

  it("lights the cell the item is anchored to, and only that one", async () => {
    const el = await mount({ ...imageItem, anchor: "top-right" }, 0);
    const lit = Array.from(el.renderRoot.querySelectorAll(".mini span.on"));
    expect(lit).toHaveLength(1);
    expect((lit[0] as HTMLElement).dataset.cell).toBe("top-right");
  });

  it("lights no cell under the automatic anchor", async () => {
    const el = await mount({ ...imageItem, anchor: "auto" }, 0);
    expect(el.renderRoot.querySelectorAll(".mini span.on")).toHaveLength(0);
  });

  it("writes nothing when the anchored button is pressed", async () => {
    const el = await mount({ ...imageItem, anchor: "auto" }, 0);
    let fired = false;
    el.addEventListener("anchor-changed", () => {
      fired = true;
    });
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    expect(fired).toBe(false);
  });

  it("disables everything for an unreadable item", async () => {
    const el = await mount({ type: "unknown" }, 0);
    const buttons = Array.from(el.renderRoot.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
