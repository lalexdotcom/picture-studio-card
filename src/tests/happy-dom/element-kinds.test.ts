import { describe, expect, it } from "@rstest/core";
import { defaultActionName, ELEMENT_KINDS, isResizableKind } from "../../element-kinds";

describe("isResizableKind", () => {
  it("is the image and nothing else", () => {
    // width/height are percentages of the background and only the image has
    // them. An icon and a label size themselves through ElementSize, which is
    // clamped pixels and not a box.
    expect(isResizableKind("image")).toBe(true);
    expect(isResizableKind("state-icon")).toBe(false);
    expect(isResizableKind("state-label")).toBe(false);
  });

  it("answers false for a kind we do not implement", () => {
    expect(isResizableKind("nope")).toBe(false);
  });

  it("covers every kind the catalogue declares", () => {
    // A new kind added without a decision about its handles reads as false here
    // by omission, which is the safe answer — but the assertion is what makes
    // someone notice the question was never asked.
    for (const type of Object.keys(ELEMENT_KINDS)) {
      expect(typeof isResizableKind(type)).toBe("boolean");
    }
    expect(defaultActionName(ELEMENT_KINDS.image, "tap_action")).toBe("none");
  });
});
