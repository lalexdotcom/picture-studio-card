import { describe, expect, it } from "@rstest/core";
import { DRAG_HOLD_MS, DRAG_THRESHOLD_PX, hasMoved, isDrag } from "../../card/drag-layer";

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

/**
 * Distance answers "was this obviously a drag". It cannot answer the opposite
 * question — someone nudging a badge by one pixel means it, and the threshold
 * that protects a click from its own tremor was throwing that away. Time is
 * what tells the two apart: a tap is quick, a deliberate adjustment is not.
 */
describe("isDrag", () => {
  const QUICK = DRAG_HOLD_MS - 1;
  const HELD = DRAG_HOLD_MS;

  // The first argument is the gesture's own sticky verdict on distance: once
  // the travel passed the threshold it stays passed, so a drag that wanders far
  // and comes back near its start is still a drag.
  it("commits a frank drag immediately, without waiting out the hold", () => {
    expect(isDrag(true, 10, true)).toBe(true);
  });

  it("still commits a frank drag that ended where it began", () => {
    // The clamp can absorb the whole travel against an edge, and a long
    // round trip can land back on its start — the gesture was unambiguous
    // either way, and committing an unchanged position is harmless.
    expect(isDrag(true, 10, false)).toBe(true);
  });

  it("keeps a quick nudge inside the threshold a click", () => {
    expect(isDrag(false, QUICK, true)).toBe(false);
  });

  it("commits that same nudge once it was held", () => {
    expect(isDrag(false, HELD, true)).toBe(true);
  });

  it("commits nothing when a long hold moved the badge nowhere", () => {
    // A press-and-think, or a nudge the clamp swallowed at the edge: held long
    // enough, but there is no new position to store.
    expect(isDrag(false, HELD * 4, false)).toBe(false);
  });

  it("treats the hold as reached, not merely passed", () => {
    expect(isDrag(false, DRAG_HOLD_MS - 1, true)).toBe(false);
    expect(isDrag(false, DRAG_HOLD_MS, true)).toBe(true);
  });
});
