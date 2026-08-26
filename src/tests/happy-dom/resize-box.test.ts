import { describe, expect, it } from "@rstest/core";
import { OPEN_BOUNDS } from "../../position";
import {
  cornerGrabs,
  edgeAt,
  edgeSlopes,
  fixedPoint,
  intersect,
  lockedScale,
  percentOfContainer,
  RESIZE_FLOOR_PX,
  requestedSize,
  sizeRange,
} from "../../resize-box";

describe("cornerGrabs", () => {
  it("reads each corner as a pair of per-axis edges", () => {
    expect(cornerGrabs("bottom-right")).toEqual({ x: true, y: true });
    expect(cornerGrabs("top-left")).toEqual({ x: false, y: false });
    expect(cornerGrabs("top-right")).toEqual({ x: true, y: false });
    expect(cornerGrabs("bottom-left")).toEqual({ x: false, y: true });
  });
});

describe("fixedPoint", () => {
  // Box [100, 140] on this axis: origin 100, size 40.
  it("holds the opposite edge by default", () => {
    expect(fixedPoint(100, 40, true, null)).toBe(100); // grabbed the trailing edge
    expect(fixedPoint(100, 40, false, null)).toBe(140); // grabbed the leading edge
  });

  it("holds the anchor when a fraction is given, whichever edge is grabbed", () => {
    expect(fixedPoint(100, 40, true, 0.5)).toBe(120); // centre
    expect(fixedPoint(100, 40, false, 0.5)).toBe(120);
    expect(fixedPoint(100, 40, true, 0)).toBe(100);
    expect(fixedPoint(100, 40, true, 1)).toBe(140);
  });
});

describe("requestedSize", () => {
  it("puts the grabbed edge under the pointer in the default mode", () => {
    // Fixed leading edge at 100, pointer at 180 -> the box wants to be 80 wide.
    expect(requestedSize(180, 100, true, null)).toBe(80);
    // Fixed trailing edge at 140, pointer at 60 -> 80 wide.
    expect(requestedSize(60, 140, false, null)).toBe(80);
  });

  it("scales by the anchor's share when the anchor is held", () => {
    // Anchor at the centre: the grabbed edge covers half the growth, so a
    // pointer 40 past the anchor asks for a box of 80.
    expect(requestedSize(160, 120, true, 0.5)).toBe(80);
    expect(requestedSize(80, 120, false, 0.5)).toBe(80);
    // Anchor a quarter in: the trailing edge covers three quarters.
    expect(requestedSize(180, 120, true, 0.25)).toBe(80);
  });

  it("has no answer when the grabbed edge is the fixed point itself", () => {
    // Anchor on the trailing edge, and the trailing edge is what was grabbed:
    // the pointer cannot say anything about the size on this axis.
    expect(requestedSize(180, 140, true, 1)).toBeUndefined();
    expect(requestedSize(80, 100, false, 0)).toBeUndefined();
  });
});

describe("edgeAt and edgeSlopes", () => {
  it("places both edges from the fixed point and the size", () => {
    // Default mode, trailing grab: the leading edge is the fixed one and stays.
    expect(edgeAt(100, 60, true, null)).toEqual({ leading: 100, trailing: 160 });
    // Default mode, leading grab: the trailing edge is fixed.
    expect(edgeAt(140, 60, false, null)).toEqual({ leading: 80, trailing: 140 });
    // Anchor held at 120, a quarter into the box: 15 left of it, 45 right.
    expect(edgeAt(120, 60, true, 0.25)).toEqual({ leading: 105, trailing: 165 });
  });

  it("reports the slope of each edge against the size", () => {
    expect(edgeSlopes(true, null)).toEqual({ leading: 0, trailing: 1 });
    expect(edgeSlopes(false, null)).toEqual({ leading: -1, trailing: 0 });
    expect(edgeSlopes(true, 0.25)).toEqual({ leading: -0.25, trailing: 0.75 });
  });

  it("agrees with edgeAt: base plus slope times size", () => {
    const size = 60;
    const at = edgeAt(120, size, true, 0.25);
    const slopes = edgeSlopes(true, 0.25);
    expect(120 + slopes.leading * size).toBeCloseTo(at.leading, 10);
    expect(120 + slopes.trailing * size).toBeCloseTo(at.trailing, 10);
  });
});

describe("sizeRange", () => {
  it("inverts a rising edge", () => {
    // trailing = 100 + s, allowed to sit in [100, 300] -> s in [0, 200].
    expect(sizeRange(100, 1, { lo: 100, hi: 300 })).toEqual({ lo: 0, hi: 200 });
  });

  it("inverts a falling edge, swapping the ends", () => {
    // leading = 140 - s, allowed to sit in [0, 140] -> s in [0, 140].
    expect(sizeRange(140, -1, { lo: 0, hi: 140 })).toEqual({ lo: 0, hi: 140 });
    // leading = 140 - s, allowed in [40, 100] -> s in [40, 100].
    expect(sizeRange(140, -1, { lo: 40, hi: 100 })).toEqual({ lo: 40, hi: 100 });
  });

  it("constrains nothing when the edge does not move", () => {
    expect(sizeRange(100, 0, { lo: 100, hi: 300 })).toEqual(OPEN_BOUNDS);
  });
});

describe("intersect", () => {
  it("keeps the tighter end on each side", () => {
    expect(intersect({ lo: 0, hi: 200 }, { lo: 30, hi: 150 })).toEqual({ lo: 30, hi: 150 });
    expect(intersect({ lo: 40, hi: 200 }, { lo: 30, hi: 150 })).toEqual({ lo: 40, hi: 150 });
  });
});

describe("lockedScale", () => {
  /**
   * The single degree of freedom of a ratio-locked resize: the least-squares
   * projection of the two axes' requests onto the box's own diagonal. Clamping
   * the two axes separately, as the drag rightly does, would leave w/h off the
   * locked ratio — the distortion that grows as a corner is pushed into a
   * border.
   */
  it("agrees with both axes when they agree with each other", () => {
    expect(lockedScale({ x: 80, y: 40 }, { width: 40, height: 20 })).toBeCloseTo(2, 10);
  });

  it("projects onto the diagonal when they disagree", () => {
    // w=40, h=20 -> kx=2, ky=1. k = (2*1600 + 1*400) / 2000 = 1.8
    expect(lockedScale({ x: 80, y: 20 }, { width: 40, height: 20 })).toBeCloseTo(1.8, 10);
  });

  it("weighs the longer axis more, which is what makes the drag feel steady", () => {
    // The same disagreement on a box whose width dominates: k leans to kx.
    // w=90, h=30 -> kx=2, ky=1. k = (2*8100 + 1*900) / 9000 = 1.9
    expect(lockedScale({ x: 180, y: 30 }, { width: 90, height: 30 })).toBeCloseTo(1.9, 10);
  });

  it("falls back to the axis that has an answer", () => {
    expect(lockedScale({ x: undefined, y: 40 }, { width: 40, height: 20 })).toBeCloseTo(2, 10);
    expect(lockedScale({ x: 80, y: undefined }, { width: 40, height: 20 })).toBeCloseTo(2, 10);
  });

  it("has no answer when neither axis does", () => {
    expect(lockedScale({}, { width: 40, height: 20 })).toBeUndefined();
  });

  it("has no answer for a degenerate box", () => {
    expect(lockedScale({ x: 80, y: 40 }, { width: 0, height: 0 })).toBeUndefined();
  });
});

describe("percentOfContainer", () => {
  it("rounds to two decimals, like every stored number", () => {
    expect(percentOfContainer(80, 400)).toBe(20);
    expect(percentOfContainer(81, 400)).toBe(20.25);
    expect(percentOfContainer(1, 3)).toBe(33.33);
  });

  it("answers zero for a container with no extent", () => {
    expect(percentOfContainer(80, 0)).toBe(0);
  });
});

describe("RESIZE_FLOOR_PX", () => {
  it("is large enough that four handles do not overlap", () => {
    expect(RESIZE_FLOOR_PX).toBeGreaterThanOrEqual(16);
  });
});
