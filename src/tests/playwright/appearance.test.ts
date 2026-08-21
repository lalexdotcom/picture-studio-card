import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioStateIcon } from "../../card/state-icon-element";
import { EDITOR_TAG, ICON_TAG, type StateIconConfig, VISIBILITY_SECTION_TAG } from "../../config";
import { PictureStudioEditor } from "../../editor/picture-studio-editor";
import { PictureStudioVisibilitySection } from "../../editor/visibility-section";
import type { HomeAssistant } from "../../types";
import { attach, cleanup } from "./harness";

afterEach(cleanup);

const define = (tag: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
};

/** Fixed, not auto: `cqw` outside a size container resolves against the viewport. */
const FIXED_48 = { mode: "fixed" as const, ratio: 8, min: 24, max: 48, value: 48 };

const hass = {
  states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } },
  themes: { darkMode: false },
  language: "en",
  localize: () => "",
} as unknown as HomeAssistant;

const mountIcon = async (config: Partial<StateIconConfig>): Promise<PictureStudioStateIcon> => {
  define(ICON_TAG, PictureStudioStateIcon);
  const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
  el.setConfig({ type: "state-icon", size: FIXED_48, entity: "light.a", ...config });
  el.hass = hass as never;
  return attach(el);
};

const chromeBox = (el: PictureStudioStateIcon): HTMLElement =>
  el.renderRoot.querySelector(".chrome") as HTMLElement;

/**
 * The regression this whole lane was built for. 1.3.0 shipped with the shape
 * rule drifted out of `:host([chrome])`, so every chromeless icon was clipped
 * into a circle — and reading the stylesheet, which is all happy-dom can do,
 * did not catch it. Here the browser resolves the cascade and answers with the
 * shape that was actually painted.
 */
describe("chrome decides the shape, and nothing else does", () => {
  it("leaves a chromeless icon square and unclipped", async () => {
    const el = await mountIcon({});
    const style = getComputedStyle(chromeBox(el));

    expect(el.hasAttribute("chrome")).toBe(false);
    expect(style.borderRadius).toBe("0px");
    expect(style.overflow).toBe("visible");
  });

  it("treats a chrome themed none as no chrome at all", async () => {
    const el = await mountIcon({ chrome: { theme: "none" } as never });
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(getComputedStyle(chromeBox(el)).borderRadius).toBe("0px");
  });

  it("shapes and clips only when a chrome asks for it", async () => {
    const el = await mountIcon({
      chrome: { theme: "card", radius: 50, opacity: 1, content_ratio: 1 } as never,
    });
    const style = getComputedStyle(chromeBox(el));

    expect(el.hasAttribute("chrome")).toBe(true);
    expect(style.borderRadius).toBe("50%");
    expect(style.overflow).toBe("hidden");
  });

  it("carries the chrome's own radius rather than a hardcoded disc", async () => {
    const el = await mountIcon({
      chrome: { theme: "card", radius: 20, opacity: 1, content_ratio: 1 } as never,
    });
    expect(getComputedStyle(chromeBox(el)).borderRadius).toBe("20%");
  });
});

/**
 * The chrome box must stay exactly the icon size whatever is drawn on its edge:
 * the drag bounds, the anchoring and the stored percentages are all measured
 * from it, so a box that grows with its border moves every badge on the card.
 */
describe("the icon's footprint", () => {
  it("keeps the outer box at the configured size, chrome or not", async () => {
    const bare = await mountIcon({});
    const dressed = await mountIcon({
      chrome: { theme: "card", radius: 50, opacity: 1, content_ratio: 1 } as never,
    });

    for (const el of [bare, dressed]) {
      const box = chromeBox(el).getBoundingClientRect();
      expect(box.width).toBeCloseTo(48, 1);
      expect(box.height).toBeCloseTo(48, 1);
    }
  });

  it("scales the content inside that box, without changing the box", async () => {
    const el = await mountIcon({
      chrome: { theme: "card", radius: 50, opacity: 1, content_ratio: 0.5 } as never,
    });
    const badge = el.renderRoot.querySelector("state-badge") as HTMLElement;

    expect(getComputedStyle(badge).width).toBe("24px");
    expect(chromeBox(el).getBoundingClientRect().width).toBeCloseTo(48, 1);
  });
});

/**
 * `headerAdornments` is one block included by two components whose shadow roots
 * are separate — there is no common ancestor to inherit from, so the sharing is
 * by copy. The failure mode is silent divergence: someone tunes the pill in one
 * consumer and the other keeps the old look. Comparing what the browser
 * computed in each root is the only check that actually notices.
 */
/** Named rather than a Record, so reading one key back is not `string | undefined`. */
interface Pill {
  fontSize: string;
  fontWeight: string;
  color: string;
  background: string;
  borderRadius: string;
  padding: string;
  lineHeight: string;
  marginInlineStart: string;
}

describe("the count pill, in both shadow roots", () => {
  const mountVisibility = async (): Promise<PictureStudioVisibilitySection> => {
    define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
    const el = document.createElement(VISIBILITY_SECTION_TAG) as PictureStudioVisibilitySection;
    el.hass = hass;
    el.visibility = [{ condition: "state" }, { condition: "screen" }];
    return attach(el);
  };

  const mountEditor = async (): Promise<PictureStudioEditor> => {
    define(EDITOR_TAG, PictureStudioEditor);
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.hass = hass;
    el.setConfig({
      type: "custom:picture-studio",
      image: "/local/plan.png",
      items: [{ type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } }],
    } as never);
    return attach(el);
  };

  /** The declarations the shared block owns, as the browser resolved them. */
  const pill = (root: ParentNode): Pill => {
    const el = root.querySelector(".count");
    if (!el) throw new Error("no .count rendered");
    const style = getComputedStyle(el);
    return {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      padding: style.padding,
      lineHeight: style.lineHeight,
      marginInlineStart: style.marginInlineStart,
    };
  };

  it("computes to the same pill in the editor and in the visibility section", async () => {
    const fromVisibility = pill((await mountVisibility()).renderRoot);
    const fromEditor = pill((await mountEditor()).renderRoot);

    expect(fromEditor).toEqual(fromVisibility);
  });

  it("resolves its tokens instead of falling back to initial values", async () => {
    // A pill that silently lost its tokens would still match the one above,
    // since both would be equally empty. These are the values the tokens carry.
    const style = pill((await mountVisibility()).renderRoot);

    expect(style.fontSize).toBe("12px");
    expect(style.fontWeight).toBe("700");
    expect(style.padding).toBe("0px 8px");
    expect(style.lineHeight).toBe("20px");
    expect(style.marginInlineStart).toBe("12px");
    expect(style.borderRadius).toBe("9999px");
  });

  /** First channel, 0-1, from either `rgb(r, g, b)` or `color(srgb r g b)`. */
  const firstChannel = (colour: string): number => {
    const numbers = [...colour.matchAll(/[\d.]+/g)].map((m) => Number(m[0]));
    const first = numbers[0] ?? Number.NaN;
    return colour.startsWith("rgb") ? first / 255 : first;
  };

  it("prefers the colour mix over the flat fallback", async () => {
    // The block declares background twice: a flat token, then a color-mix that
    // overrides it wherever it is understood. The assertion is the mechanism,
    // not the ratio — the 12% is called out in the source as an eye value meant
    // to be turned, and a test that broke when it was turned would be friction.
    const mixed = firstChannel(pill((await mountVisibility()).renderRoot).background);

    const inputFill = firstChannel("rgb(245, 245, 245)"); // --input-fill-color
    const textColour = firstChannel("rgb(33, 33, 33)"); // --primary-text-color
    const flatFallback = firstChannel("rgb(224, 224, 224)");

    // Strictly between the two mixed colours: the mix ran.
    expect(mixed).toBeLessThan(inputFill);
    expect(mixed).toBeGreaterThan(textColour);
    // And it is not the flat declaration the mix is supposed to override.
    expect(Math.abs(mixed - flatFallback)).toBeGreaterThan(0.005);
  });
});
