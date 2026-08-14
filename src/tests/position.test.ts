import { describe, expect, it } from "@rstest/core";
import {
  ANCHOR_OFFSETS,
  advance,
  axisOffset,
  DEFAULT_ANCHOR,
  DEFAULT_POSITION,
  markerCorner,
  OPEN_BOUNDS,
  parseAnchor,
  parsePercent,
  percentString,
  positionStyle,
  reanchor,
  storedPosition,
  tighten,
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

  it("reads the legacy proportional value as auto (read-compat path for pre-1.2.0 configs)", () => {
    expect(parseAnchor("proportional")).toBe("auto");
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

  it("defaults to auto", () => {
    expect(DEFAULT_ANCHOR).toBe("auto");
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

  it("returns null for auto, whose offset is the coordinate itself", () => {
    expect(axisOffset("auto", "x")).toBeNull();
    expect(axisOffset("auto", "y")).toBeNull();
  });
});

describe("toPx", () => {
  it("spreads an auto coordinate over the free span", () => {
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

describe("markerCorner", () => {
  it("points left for an item in the right half", () => {
    expect(markerCorner({ top: 50, left: 80 })).toBe("top-left");
  });

  it("points right for an item in the left half", () => {
    expect(markerCorner({ top: 50, left: 20 })).toBe("top-right");
  });

  it("points right exactly at the middle", () => {
    expect(markerCorner({ top: 50, left: 49.99 })).toBe("top-right");
    expect(markerCorner({ top: 50, left: 50 })).toBe("top-left");
  });

  it("drops below for an item against the top edge", () => {
    expect(markerCorner({ top: 0, left: 20 })).toBe("bottom-right");
    expect(markerCorner({ top: 10, left: 80 })).toBe("bottom-left");
  });

  it("stays above just under the band", () => {
    expect(markerCorner({ top: 10.01, left: 20 })).toBe("top-right");
  });

  it("answers for an overflowing coordinate rather than throwing", () => {
    expect(markerCorner({ top: -30, left: 140 })).toBe("bottom-left");
  });
});

describe("toPercent", () => {
  it("inverts the auto map", () => {
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

  it("returns 0 when an auto item is as wide as its container", () => {
    expect(toPercent(0, 200, 200, null)).toBe(0);
  });

  it("returns 0 when the container has no width", () => {
    expect(toPercent(10, 0, 40, 50)).toBe(0);
  });
});

describe("toPx / toPercent round trip", () => {
  const anchors = [
    "auto",
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
    // auto 100/100 puts the item's leading edge at 300px.
    // Under top-left, 300px is 75%.
    expect(reanchor({ top: 100, left: 100 }, "auto", "top-left", container, element)).toEqual({
      top: 75,
      left: 75,
    });
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
    expect(reanchor({ top: 100, left: 100 }, "auto", "top-left", wide, item)).toEqual({
      top: 75,
      left: 75,
    });
  });
});

describe("positionStyle", () => {
  it("derives an auto translate from the coordinates themselves", () => {
    expect(positionStyle({ top: 30, left: 45 }, "auto")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-45%, -30%)",
    });
  });

  it("anchors flush to the bottom-right at 100, under auto", () => {
    expect(positionStyle({ top: 100, left: 100 }, "auto")).toEqual({
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

describe("tighten", () => {
  // container 200, element 40 -> span 160.
  it("closes open bounds onto the span when the item is inside", () => {
    expect(tighten(OPEN_BOUNDS, 80, 200, 40)).toEqual({ lo: 0, hi: 160 });
  });

  it("widens only on the side the item overflows", () => {
    expect(tighten(OPEN_BOUNDS, 220, 200, 40)).toEqual({ lo: 0, hi: 220 });
    expect(tighten(OPEN_BOUNDS, -30, 200, 40)).toEqual({ lo: -30, hi: 160 });
  });

  it("never widens bounds that are already closed", () => {
    expect(tighten({ lo: 0, hi: 160 }, 999, 200, 40)).toEqual({ lo: 0, hi: 160 });
    expect(tighten({ lo: 0, hi: 160 }, -999, 200, 40)).toEqual({ lo: 0, hi: 160 });
  });

  it("collapses to a point when the element fills the container", () => {
    expect(tighten(OPEN_BOUNDS, 0, 200, 200)).toEqual({ lo: 0, hi: 0 });
  });
});

describe("advance", () => {
  // container 200, element 40 -> span 160.
  it("behaves as a flat clamp from the first move, for an item that starts inside", () => {
    const first = advance(500, 80, OPEN_BOUNDS, 200, 40);
    expect(first.px).toBe(160);
    expect(first.bounds).toEqual({ lo: 0, hi: 160 });
    expect(advance(-10, first.px, first.bounds, 200, 40).px).toBe(0);
  });

  it("lets an item that starts outside travel inward but not further out", () => {
    // Starts at 220, which is 60px past the far edge.
    const out = advance(300, 220, OPEN_BOUNDS, 200, 40);
    expect(out.px).toBe(220); // the ask was further out; the ceiling holds it
    expect(out.bounds).toEqual({ lo: 0, hi: 220 });

    const inward = advance(190, out.px, out.bounds, 200, 40);
    expect(inward.px).toBe(190);
    expect(inward.bounds).toEqual({ lo: 0, hi: 220 });
  });

  it("ratchets the ceiling down to where the item now is", () => {
    let state = advance(300, 220, OPEN_BOUNDS, 200, 40); // hi 220
    state = advance(190, state.px, state.bounds, 200, 40); // now at 190
    state = advance(999, state.px, state.bounds, 200, 40); // asks to fly right
    expect(state.px).toBe(190);
    expect(state.bounds.hi).toBe(190);
  });

  it("latches at the span once the item is back inside, and cannot leave again", () => {
    let state = advance(300, 220, OPEN_BOUNDS, 200, 40);
    state = advance(100, state.px, state.bounds, 200, 40);
    // The bounds still describe where the item was at the start of that move —
    // tighten closes around `current`, not around where it landed. The ceiling
    // is never below the item, so it cannot be pushed further out meanwhile.
    expect(state.bounds).toEqual({ lo: 0, hi: 220 });
    state = advance(999, state.px, state.bounds, 200, 40);
    // Now that the previous position was inside, the ceiling latches at span.
    expect(state.px).toBe(160);
    expect(state.bounds).toEqual({ lo: 0, hi: 160 });
  });

  it("ratchets the floor the same way on the near side", () => {
    let state = advance(-100, -30, OPEN_BOUNDS, 200, 40);
    expect(state.px).toBe(-30);
    state = advance(-5, state.px, state.bounds, 200, 40);
    state = advance(-999, state.px, state.bounds, 200, 40);
    expect(state.px).toBe(-5);
  });
});

describe("DEFAULT_POSITION", () => {
  it("is the center", () => {
    expect(DEFAULT_POSITION).toEqual({ top: 50, left: 50 });
  });
});
