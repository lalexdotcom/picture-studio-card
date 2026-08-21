import { describe, expect, it } from "@rstest/core";
import { interactionStyles } from "../../../card/item-styles";
import { cssRules } from "./harness";

const rules = cssRules(interactionStyles);

describe("the hover, with a chrome", () => {
  it("lays a transparent veil on the chrome, shaped by whatever the chrome is", () => {
    const veil = rules.get(":host([chrome]) .chrome::after");
    expect(veil).toContain("border-radius: inherit");
    expect(veil).toContain("background: var(--psc-item-color, var(--psc-inactive-color))");
    expect(veil).toContain("opacity: 0");
    // Only the opacity animates: there is nothing to re-rasterize, which is the
    // whole reason this treatment exists beside the grow.
    expect(veil).toContain("transition: opacity 120ms ease-out");
  });

  it("uses Home Assistant's own badge ripple figures, behind overridable tokens", () => {
    expect(rules.get(":host([chrome][clickable]:hover) .chrome::after")).toContain(
      "opacity: var(--psc-hover-opacity, 0.04)",
    );
    expect(rules.get(":host([chrome][clickable]:active) .chrome::after")).toContain(
      "opacity: var(--psc-pressed-opacity, 0.12)",
    );
  });

  it("never grows a chromed item", () => {
    expect(rules.get(":host([clickable]:not([chrome]):hover)")).toContain("transform: scale(1.08)");
    expect(rules.get(":host([clickable]:hover)")).toBeUndefined();
  });
});

describe("the hover, without a chrome", () => {
  it("promotes the layer, which is what killed the pixel jump under anchor auto", () => {
    const growing = rules.get(":host([clickable]:not([chrome]))");
    expect(growing).toContain("will-change: transform");
    expect(growing).toContain("transition: transform 120ms ease-out");
  });

  it("never veils a chromeless item: a 4% veil on a photograph is invisible", () => {
    expect(rules.get(":host(:not([chrome])) .chrome::after")).toBeUndefined();
  });
});

describe("the cursor", () => {
  it("is the one treatment that does not depend on the chrome", () => {
    expect(rules.get(":host([clickable])")).toContain("cursor: pointer");
  });
});
