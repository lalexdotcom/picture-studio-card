import { describe, expect, it } from "@rstest/core";
import { clampPx, DEFAULT_POSITION, positionStyle, toPercent } from "../position";

describe("clampPx", () => {
  it("keeps a value inside the free span", () => {
    expect(clampPx(30, 200, 40)).toBe(30);
  });

  it("clamps below zero to zero", () => {
    expect(clampPx(-10, 200, 40)).toBe(0);
  });

  it("clamps to the far edge, which is container minus element", () => {
    expect(clampPx(500, 200, 40)).toBe(160);
  });

  it("collapses to zero when the element fills the container", () => {
    expect(clampPx(50, 200, 200)).toBe(0);
  });
});

describe("toPercent", () => {
  it("maps the left edge to 0", () => {
    expect(toPercent(0, 200, 40)).toBe(0);
  });

  it("maps the far edge to 100", () => {
    expect(toPercent(160, 200, 40)).toBe(100);
  });

  it("maps the midpoint of the free span to 50", () => {
    expect(toPercent(80, 200, 40)).toBe(50);
  });

  it("rounds to two decimals", () => {
    expect(toPercent(37, 200, 40)).toBe(23.13);
  });

  it("returns 0 when the element is as wide as the container", () => {
    expect(toPercent(0, 200, 200)).toBe(0);
  });

  it("never leaves the 0-100 range even for out-of-bounds input", () => {
    expect(toPercent(-50, 200, 40)).toBe(0);
    expect(toPercent(9999, 200, 40)).toBe(100);
  });
});

describe("positionStyle", () => {
  it("derives percentages and a proportional translate", () => {
    expect(positionStyle({ top: 30, left: 45 })).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-45%, -30%)",
    });
  });

  it("anchors flush to the bottom-right at 100", () => {
    expect(positionStyle({ top: 100, left: 100 })).toEqual({
      top: "100%",
      left: "100%",
      transform: "translate(-100%, -100%)",
    });
  });
});

describe("DEFAULT_POSITION", () => {
  it("is the centre", () => {
    expect(DEFAULT_POSITION).toEqual({ top: 50, left: 50 });
  });
});
