import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioToolbar } from "../../../card/toolbar";
import { ANCHOR_INPUT_TAG, TOOLBAR_TAG } from "../../../config";
import { PictureStudioAnchorInput } from "../../../editor/anchor-input";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(TOOLBAR_TAG)) {
  customElements.define(TOOLBAR_TAG, PictureStudioToolbar);
}

if (!customElements.get(ANCHOR_INPUT_TAG)) {
  customElements.define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);
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

  it("opens the picker when the anchored button is pressed", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    await el.updateComplete;
    const dialog = el.renderRoot.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("picture-studio-anchor-input")).not.toBeNull();
  });

  it("mounts the input with no label, so the modal carries no form chrome", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    await el.updateComplete;
    const input = el.renderRoot.querySelector("picture-studio-anchor-input") as HTMLElement & {
      label?: string;
    };
    expect(input.label).toBeUndefined();
  });

  it("closes on a choice, and the choice leaves the toolbar", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    await el.updateComplete;
    let seen: string | undefined;
    el.addEventListener("anchor-changed", (ev) => {
      seen = (ev as CustomEvent<{ anchor: string }>).detail.anchor;
    });
    const input = el.renderRoot.querySelector(
      "picture-studio-anchor-input",
    ) as PictureStudioAnchorInput;
    await input.updateComplete;
    // Click a real cell so the test drives the production path: the anchor-input
    // dispatches the event itself with the flags the picker depends on, rather
    // than the test supplying them and effectively asserting its own dispatch.
    (
      input.renderRoot.querySelector('button[aria-label="bottom-left"]') as HTMLButtonElement
    ).click();
    await el.updateComplete;
    expect(seen).toBe("bottom-left");
    expect((el.renderRoot.querySelector("dialog") as HTMLDialogElement).open).toBe(false);
  });
});
