import { describe, expect, it } from "@rstest/core";
import { DRAG_THRESHOLD_PX, hasMoved } from "../card/drag-layer";

describe("hasMoved", () => {
  it("treats a still pointer as a click", () => {
    expect(hasMoved(0, 0)).toBe(false);
  });

  it("absorbs the tremor of a click", () => {
    expect(hasMoved(2, 2)).toBe(false);
    expect(hasMoved(-3, 1)).toBe(false);
  });

  it("counts travel past the threshold as a drag, in any direction", () => {
    expect(hasMoved(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(hasMoved(0, -(DRAG_THRESHOLD_PX + 1))).toBe(true);
    expect(hasMoved(-4, -4)).toBe(true);
  });

  it("measures the diagonal, not each axis on its own", () => {
    // 3-4-5: neither axis passes 4, the distance does.
    expect(hasMoved(3, 4)).toBe(true);
  });
});
