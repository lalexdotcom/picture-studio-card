import { afterEach, describe, expect, it } from "@rstest/core";
import { ANCHOR_INPUT_TAG, PICKER_TAG } from "../../../config";
import { PictureStudioAnchorInput } from "../../../editor/anchor-input";
import { PictureStudioAnchorPicker } from "../../../editor/anchor-picker";
import type { Anchor } from "../../../position";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(PICKER_TAG)) {
  customElements.define(PICKER_TAG, PictureStudioAnchorPicker);
}

if (!customElements.get(ANCHOR_INPUT_TAG)) {
  customElements.define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);
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

/**
 * The switch is the picker's own control — it owns the `auto` mode; the anchor
 * input handles specific points. These two tests cover the switch's two
 * transitions: off (falls back to `center`) and back on (returns to `auto`).
 */
describe("the automatic mode", () => {
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

    const seen = await emitted(el, () => {
      control.checked = true;
      control.dispatchEvent(new Event("change"));
    });

    expect(seen).toBe("auto");
  });
});

describe("the anchor picker", () => {
  it("lets the input's event cross out of the picker, exactly once", async () => {
    const el = await mount("center");
    const input = el.renderRoot.querySelector("picture-studio-anchor-input") as HTMLElement & {
      renderRoot: ShadowRoot;
    };
    const seen: Anchor[] = [];
    el.addEventListener("anchor-changed", (ev) => {
      seen.push((ev as CustomEvent<{ anchor: Anchor }>).detail.anchor);
    });
    (input.renderRoot.querySelector('button[aria-label="top-left"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(seen).toEqual(["top-left"]);
  });
});
