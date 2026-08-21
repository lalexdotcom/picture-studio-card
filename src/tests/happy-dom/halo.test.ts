import { describe, expect, it } from "@rstest/core";
import { haloFilter } from "../../halo";

describe("haloFilter", () => {
  // Literals, not a restatement of the constants: this test is what guards the
  // recipe. The rim is a fixed hairline at every size; the glow is a share of
  // the element's own size value, so it follows an icon's box and a label's
  // body alike.
  it("pairs a fixed white rim with a glow proportional to the given token", () => {
    expect(haloFilter("--psc-icon-size")).toBe(
      "drop-shadow(var(--psc-icon-outline, 0 0 1px rgba(255, 255, 255, 0.4))) " +
        "drop-shadow(var(--psc-icon-glow, 0 0 calc(var(--psc-icon-size) * 0.06) rgba(0, 0, 0, 0.2)))",
    );
  });

  it("derives the override token names from the size token", () => {
    expect(haloFilter("--psc-label-size")).toContain("var(--psc-label-outline,");
    expect(haloFilter("--psc-label-size")).toContain("var(--psc-label-glow,");
    expect(haloFilter("--psc-label-size")).toContain("calc(var(--psc-label-size) * 0.06)");
  });
});
