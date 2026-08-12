import { describe, expect, it } from "@rstest/core";
import {
  clampPercent,
  clampPx,
  DEFAULT_POSITION,
  parsePercent,
  percentString,
  positionStyle,
  storedPosition,
  toPercent,
} from "../position";

describe("parsePercent", () => {
  it("takes a plain number", () => {
    expect(parsePercent(30, 50)).toBe(30);
  });

  it("takes the percent notation, quoted or not — YAML gives us a string either way", () => {
    expect(parsePercent("30%", 50)).toBe(30);
    expect(parsePercent("60.5%", 50)).toBe(60.5);
    expect(parsePercent("30", 50)).toBe(30);
  });

  it("clamps out-of-range values instead of letting a badge overflow", () => {
    expect(parsePercent(150, 50)).toBe(100);
    expect(parsePercent("-20%", 50)).toBe(0);
  });

  it("falls back on anything it cannot read", () => {
    expect(parsePercent(undefined, 50)).toBe(50);
    expect(parsePercent("left", 50)).toBe(50);
    expect(parsePercent({}, 50)).toBe(50);
    expect(parsePercent(Number.NaN, 50)).toBe(50);
  });
});

describe("percentString", () => {
  it("drops trailing zeros", () => {
    expect(percentString(30)).toBe("30%");
    expect(percentString(30.5)).toBe("30.5%");
  });

  it("keeps the two decimals a drag produces, and no more", () => {
    expect(percentString(30.42)).toBe("30.42%");
    expect(percentString(30.4567)).toBe("30.46%");
  });

  it("clamps before formatting", () => {
    expect(percentString(150)).toBe("100%");
    expect(percentString(-1)).toBe("0%");
  });
});

describe("clampPercent", () => {
  it("bounds a coordinate to the image", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(42)).toBe(42);
    expect(clampPercent(101)).toBe(100);
  });
});

describe("storedPosition", () => {
  it("writes both coordinates as percentages", () => {
    expect(storedPosition({ top: 30, left: 60.5 })).toEqual({ top: "30%", left: "60.5%" });
  });
});

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
  it("is the center", () => {
    expect(DEFAULT_POSITION).toEqual({ top: 50, left: 50 });
  });
});
