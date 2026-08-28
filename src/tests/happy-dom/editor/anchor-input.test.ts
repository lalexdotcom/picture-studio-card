import { afterEach, describe, expect, it } from "@rstest/core";
import { ANCHOR_INPUT_TAG } from "../../../config";
import { PictureStudioAnchorInput } from "../../../editor/anchor-input";
import { ANCHOR_OFFSETS, type Anchor } from "../../../position";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(ANCHOR_INPUT_TAG)) {
  customElements.define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);
}

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: () => "",
} as unknown as HomeAssistant;

const mount = async (anchor?: Anchor, label?: string): Promise<PictureStudioAnchorInput> => {
  const el = document.createElement(ANCHOR_INPUT_TAG) as PictureStudioAnchorInput;
  el.hass = hass;
  el.anchor = anchor;
  el.label = label;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const cells = (el: PictureStudioAnchorInput): HTMLButtonElement[] =>
  Array.from(el.renderRoot.querySelectorAll("button.cell"));

const grid = (el: PictureStudioAnchorInput): HTMLElement =>
  el.renderRoot.querySelector(".grid") as HTMLElement;

/** The input's only output. Composed, so it crosses out of the shadow root. */
const emitted = async (
  el: PictureStudioAnchorInput,
  act: () => void,
): Promise<Anchor | undefined> => {
  let seen: Anchor | undefined;
  el.addEventListener("anchor-changed", (ev) => {
    seen = (ev as CustomEvent<{ anchor: Anchor }>).detail.anchor;
  });
  act();
  await el.updateComplete;
  return seen;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("the anchor input", () => {
  it("lays out one cell per fixed anchor, in the order the grid reads", async () => {
    const el = await mount();
    expect(cells(el).map((c) => c.getAttribute("aria-label"))).toEqual(Object.keys(ANCHOR_OFFSETS));
  });

  it("emits the anchor of whichever cell is clicked", async () => {
    for (const [index, name] of Object.keys(ANCHOR_OFFSETS).entries()) {
      const el = await mount();
      const seen = await emitted(el, () => cells(el)[index]?.click());
      expect(seen).toBe(name);
      el.remove();
    }
  });

  it("marks the chosen cell, and only that one", async () => {
    const el = await mount("center-right");
    const selected = cells(el).filter((cell) => cell.classList.contains("selected"));

    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("aria-label")).toBe("center-right");
    expect(selected[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders bare when it is given no label", async () => {
    const el = await mount("center");
    expect(el.renderRoot.querySelector("ha-formfield")).toBeNull();
    expect(el.renderRoot.querySelector(".grid")).not.toBeNull();
  });

  it("wraps itself in a formfield when it is given one", async () => {
    const el = await mount("center", "Anchored");
    const field = el.renderRoot.querySelector("ha-formfield") as HTMLElement & { label?: string };
    expect(field).not.toBeNull();
    expect(field.label).toBe("Anchored");
  });
});

/**
 * `auto` is a mode, not a point, so the grid has nothing to mark while it is on.
 * The cells stay live all the same: clicking one is how you leave the mode, and
 * disabling them would make the switch the only way out of a state the grid is
 * meant to replace.
 */
describe("the automatic mode", () => {
  it("is where an unset anchor starts, with nothing marked on the grid", async () => {
    const el = await mount();

    expect(grid(el).classList.contains("anchored")).toBe(false);
    expect(cells(el).some((cell) => cell.classList.contains("selected"))).toBe(false);
    expect(cells(el).every((cell) => cell.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("leaves every cell clickable while it is on", async () => {
    const el = await mount();

    expect(cells(el).some((cell) => cell.hasAttribute("disabled"))).toBe(false);
    // And a click really does leave the mode, rather than being swallowed.
    const seen = await emitted(el, () => cells(el)[4]?.click());
    expect(seen).toBe("center");
  });
});
