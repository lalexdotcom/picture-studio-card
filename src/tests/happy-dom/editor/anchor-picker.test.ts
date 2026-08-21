import { afterEach, describe, expect, it } from "@rstest/core";
import { PICKER_TAG } from "../../../config";
import { PictureStudioAnchorPicker } from "../../../editor/anchor-picker";
import { ANCHOR_OFFSETS, type Anchor } from "../../../position";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(PICKER_TAG)) {
  customElements.define(PICKER_TAG, PictureStudioAnchorPicker);
}

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: (key: string) => (key === "ui.common.auto" ? "Automatic" : ""),
} as unknown as HomeAssistant;

const mount = async (anchor?: Anchor): Promise<PictureStudioAnchorPicker> => {
  const el = document.createElement(PICKER_TAG) as PictureStudioAnchorPicker;
  el.hass = hass;
  el.anchor = anchor;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const cells = (el: PictureStudioAnchorPicker): HTMLButtonElement[] =>
  Array.from(el.renderRoot.querySelectorAll("button.cell"));

const grid = (el: PictureStudioAnchorPicker): HTMLElement =>
  el.renderRoot.querySelector(".grid") as HTMLElement;

const switchEl = (el: PictureStudioAnchorPicker): HTMLElement & { checked?: boolean } =>
  el.renderRoot.querySelector("ha-switch") as HTMLElement & { checked?: boolean };

/** The picker's only output. Composed, so it crosses out of the shadow root. */
const emitted = async (
  el: PictureStudioAnchorPicker,
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

describe("the anchor picker", () => {
  it("lays out one cell per fixed anchor, in the order the grid reads", async () => {
    const el = await mount();
    const labels = cells(el).map((cell) => cell.getAttribute("aria-label"));

    expect(labels).toEqual(Object.keys(ANCHOR_OFFSETS));
    // Nine, and `auto` is not among them: it is not a point, which is the whole
    // reason it lives on the switch instead.
    expect(labels).toHaveLength(9);
    expect(labels).not.toContain("auto");
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

    expect(switchEl(el).checked).toBe(true);
    expect(grid(el).classList.contains("fixed")).toBe(false);
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

  it("falls back to center when the switch is turned off", async () => {
    const el = await mount();
    const control = switchEl(el);

    const seen = await emitted(el, () => {
      control.checked = false;
      control.dispatchEvent(new Event("change"));
    });

    expect(seen).toBe("center");
  });

  it("returns to auto when the switch is turned back on", async () => {
    const el = await mount("bottom-left");
    const control = switchEl(el);
    expect(control.checked).toBe(false);
    expect(grid(el).classList.contains("fixed")).toBe(true);

    const seen = await emitted(el, () => {
      control.checked = true;
      control.dispatchEvent(new Event("change"));
    });

    expect(seen).toBe("auto");
  });
});
