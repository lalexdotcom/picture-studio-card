import { describe, expect, it } from "@rstest/core";
import {
  ANCHOR_OFFSETS,
  axisOffset,
  clampPx,
  DEFAULT_ANCHOR,
  DEFAULT_POSITION,
  parseAnchor,
  parsePercent,
  percentString,
  positionStyle,
  reanchor,
  storedPosition,
  toPercent,
  toPx,
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

  it("keeps an out-of-range value, which a fixed anchor makes meaningful", () => {
    expect(parsePercent(150, 50)).toBe(150);
    expect(parsePercent("-20%", 50)).toBe(-20);
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

  it("writes an out-of-range value through — a bound here would put the item back", () => {
    expect(percentString(150)).toBe("150%");
    expect(percentString(-1)).toBe("-1%");
  });
});

describe("storedPosition", () => {
  it("writes both coordinates as percentages", () => {
    expect(storedPosition({ top: 30, left: 60.5 })).toEqual({ top: "30%", left: "60.5%" });
  });
});

describe("parseAnchor", () => {
  it("takes any of the nine fixed names", () => {
    expect(parseAnchor("top-left")).toBe("top-left");
    expect(parseAnchor("center")).toBe("center");
    expect(parseAnchor("bottom-right")).toBe("bottom-right");
  });

  it("takes the proportional keyword", () => {
    expect(parseAnchor("proportional")).toBe("proportional");
  });

  it("falls back to the default on anything else", () => {
    expect(parseAnchor(undefined)).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor("middle")).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor(42)).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor({})).toBe(DEFAULT_ANCHOR);
  });

  it("does not mistake an inherited property for an anchor", () => {
    expect(parseAnchor("toString")).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor("constructor")).toBe(DEFAULT_ANCHOR);
  });

  it("defaults to proportional, so no existing config moves", () => {
    expect(DEFAULT_ANCHOR).toBe("proportional");
  });
});

describe("ANCHOR_OFFSETS", () => {
  it("holds the nine fixed anchors and nothing else", () => {
    expect(Object.keys(ANCHOR_OFFSETS).sort()).toEqual([
      "bottom-center",
      "bottom-left",
      "bottom-right",
      "center",
      "center-left",
      "center-right",
      "top-center",
      "top-left",
      "top-right",
    ]);
  });

  it("reads the corners and the middle off the name", () => {
    expect(ANCHOR_OFFSETS["top-left"]).toEqual({ x: 0, y: 0 });
    expect(ANCHOR_OFFSETS.center).toEqual({ x: 50, y: 50 });
    expect(ANCHOR_OFFSETS["bottom-right"]).toEqual({ x: 100, y: 100 });
    expect(ANCHOR_OFFSETS["top-right"]).toEqual({ x: 100, y: 0 });
    expect(ANCHOR_OFFSETS["center-left"]).toEqual({ x: 0, y: 50 });
  });
});

describe("axisOffset", () => {
  it("splits a fixed anchor into its two components", () => {
    expect(axisOffset("bottom-left", "x")).toBe(0);
    expect(axisOffset("bottom-left", "y")).toBe(100);
  });

  it("returns null for proportional, whose offset is the coordinate itself", () => {
    expect(axisOffset("proportional", "x")).toBeNull();
    expect(axisOffset("proportional", "y")).toBeNull();
  });
});

describe("toPx", () => {
  it("spreads a proportional coordinate over the free span", () => {
    expect(toPx(0, 200, 40, null)).toBe(0);
    expect(toPx(50, 200, 40, null)).toBe(80);
    expect(toPx(100, 200, 40, null)).toBe(160);
  });

  it("offsets a fixed anchor by a fraction of the item's own size", () => {
    // top-left: the coordinate is the leading edge.
    expect(toPx(50, 200, 40, 0)).toBe(100);
    // center: pulled back by half the item.
    expect(toPx(50, 200, 40, 50)).toBe(80);
    // right: pulled back by the whole item.
    expect(toPx(50, 200, 40, 100)).toBe(60);
  });

  it("lets a fixed anchor overflow, which is the whole point", () => {
    expect(toPx(100, 200, 40, 0)).toBe(200);
  });
});

describe("toPercent", () => {
  it("inverts the proportional map", () => {
    expect(toPercent(0, 200, 40, null)).toBe(0);
    expect(toPercent(80, 200, 40, null)).toBe(50);
    expect(toPercent(160, 200, 40, null)).toBe(100);
  });

  it("inverts the fixed map", () => {
    expect(toPercent(100, 200, 40, 0)).toBe(50);
    expect(toPercent(80, 200, 40, 50)).toBe(50);
    expect(toPercent(60, 200, 40, 100)).toBe(50);
  });

  it("rounds to two decimals", () => {
    expect(toPercent(37, 200, 40, null)).toBe(23.13);
  });

  it("no longer bounds its result, so an overflow survives the round trip", () => {
    expect(toPercent(200, 200, 40, 0)).toBe(100);
    expect(toPercent(220, 200, 40, 0)).toBe(110);
    expect(toPercent(-20, 200, 40, 0)).toBe(-10);
  });

  it("returns 0 when a proportional item is as wide as its container", () => {
    expect(toPercent(0, 200, 200, null)).toBe(0);
  });

  it("returns 0 when the container has no width", () => {
    expect(toPercent(10, 0, 40, 50)).toBe(0);
  });
});

describe("toPx / toPercent round trip", () => {
  const anchors = [
    "proportional",
    "top-left",
    "top-center",
    "top-right",
    "center-left",
    "center",
    "center-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ] as const;

  it("returns the coordinate it was given, for every anchor", () => {
    for (const anchor of anchors) {
      const offset = axisOffset(anchor, "x");
      expect(toPercent(toPx(42.5, 400, 100, offset), 400, 100, offset)).toBe(42.5);
    }
  });

  it("survives an out-of-range coordinate under a fixed anchor", () => {
    expect(toPercent(toPx(130, 400, 100, 50), 400, 100, 50)).toBe(130);
  });
});

describe("reanchor", () => {
  // 400 x 400 container, 100 x 100 item.
  const container = { width: 400, height: 400 };
  const element = { width: 100, height: 100 };

  it("leaves the item exactly where it is", () => {
    // proportional 100/100 puts the item's leading edge at 300px.
    // Under top-left, 300px is 75%.
    expect(
      reanchor({ top: 100, left: 100 }, "proportional", "top-left", container, element),
    ).toEqual({ top: 75, left: 75 });
  });

  it("is exact for an item that already overflows", () => {
    // top-left 100% puts the leading edge at 400px, 100px past the edge.
    // Under center that is 112.5%, and the item does not move.
    expect(reanchor({ top: 100, left: 100 }, "top-left", "center", container, element)).toEqual({
      top: 112.5,
      left: 112.5,
    });
  });

  it("is a no-op when the anchor does not change", () => {
    expect(reanchor({ top: 30, left: 45 }, "center", "center", container, element)).toEqual({
      top: 30,
      left: 45,
    });
  });

  it("treats the two axes independently", () => {
    const wide = { width: 400, height: 200 };
    const item = { width: 100, height: 50 };
    // x: 300px under top-left is 75%. y: 150px under top-left is 75%.
    expect(reanchor({ top: 100, left: 100 }, "proportional", "top-left", wide, item)).toEqual({
      top: 75,
      left: 75,
    });
  });
});

describe("positionStyle", () => {
  it("derives a proportional translate from the coordinates themselves", () => {
    expect(positionStyle({ top: 30, left: 45 }, "proportional")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-45%, -30%)",
    });
  });

  it("anchors flush to the bottom-right at 100, under proportional", () => {
    expect(positionStyle({ top: 100, left: 100 }, "proportional")).toEqual({
      top: "100%",
      left: "100%",
      transform: "translate(-100%, -100%)",
    });
  });

  it("pins the translate under a fixed anchor, whatever the coordinates", () => {
    expect(positionStyle({ top: 30, left: 45 }, "center")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-50%, -50%)",
    });
    expect(positionStyle({ top: 90, left: 10 }, "center")).toEqual({
      top: "90%",
      left: "10%",
      transform: "translate(-50%, -50%)",
    });
  });

  it("emits no translate at all for top-left", () => {
    expect(positionStyle({ top: 30, left: 45 }, "top-left")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-0%, -0%)",
    });
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

describe("DEFAULT_POSITION", () => {
  it("is the center", () => {
    expect(DEFAULT_POSITION).toEqual({ top: 50, left: 50 });
  });
});
