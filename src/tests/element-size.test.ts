import { describe, expect, it } from "@rstest/core";
import {
  DEFAULT_ICON_SIZE,
  DEFAULT_LABEL_SIZE,
  elementSizeCss,
  isDefaultElementSize,
  normalizeElementSize,
} from "../element-size";

describe("normalizeElementSize", () => {
  it("defaults a missing size to auto", () => {
    expect(normalizeElementSize(undefined, DEFAULT_ICON_SIZE)).toEqual(DEFAULT_ICON_SIZE);
  });

  it("reads a bare object with no mode key as auto", () => {
    expect(normalizeElementSize({ min: 10 }, DEFAULT_ICON_SIZE)).toEqual({
      ...DEFAULT_ICON_SIZE,
      min: 10,
    });
  });

  it("keeps all five fields when mode is auto", () => {
    expect(
      normalizeElementSize(
        { mode: "auto", min: 10, ratio: 1, max: 20, value: 32 },
        DEFAULT_ICON_SIZE,
      ),
    ).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: 32,
    });
  });

  it("keeps numbers when mode is adaptive", () => {
    expect(
      normalizeElementSize(
        { mode: "adaptive", min: 10, ratio: 1, max: 20, value: 32 },
        DEFAULT_ICON_SIZE,
      ),
    ).toEqual({
      mode: "adaptive",
      min: 10,
      ratio: 1,
      max: 20,
      value: 32,
    });
  });

  it("keeps all fields when mode is fixed", () => {
    expect(
      normalizeElementSize(
        { mode: "fixed", min: 10, ratio: 1, max: 20, value: 64 },
        DEFAULT_ICON_SIZE,
      ),
    ).toEqual({
      mode: "fixed",
      min: 10,
      ratio: 1,
      max: 20,
      value: 64,
    });
  });

  it("falls back per field on a non-finite number", () => {
    expect(
      normalizeElementSize({ mode: "adaptive", min: "x", ratio: Number.NaN }, DEFAULT_ICON_SIZE),
    ).toEqual({
      mode: "adaptive",
      min: DEFAULT_ICON_SIZE.min,
      ratio: DEFAULT_ICON_SIZE.ratio,
      max: DEFAULT_ICON_SIZE.max,
      value: DEFAULT_ICON_SIZE.value,
    });
  });

  // Read-compatibility path for configs written during development with
  // { auto: true/false, … } — auto:true → mode:"auto", auto:false → mode:"adaptive".
  it("reads legacy auto:true as mode:auto", () => {
    expect(
      normalizeElementSize({ auto: true, min: 10, ratio: 1, max: 20 }, DEFAULT_ICON_SIZE),
    ).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: DEFAULT_ICON_SIZE.value,
    });
  });

  it("reads legacy auto:false as mode:adaptive", () => {
    expect(
      normalizeElementSize({ auto: false, min: 10, ratio: 1, max: 20 }, DEFAULT_ICON_SIZE),
    ).toEqual({
      mode: "adaptive",
      min: 10,
      ratio: 1,
      max: 20,
      value: DEFAULT_ICON_SIZE.value,
    });
  });
});

describe("isDefaultElementSize", () => {
  it("is true only when all five fields are the defaults", () => {
    expect(isDefaultElementSize(DEFAULT_ICON_SIZE, DEFAULT_ICON_SIZE)).toBe(true);
    expect(isDefaultElementSize({ ...DEFAULT_ICON_SIZE, min: 10 }, DEFAULT_ICON_SIZE)).toBe(false);
    expect(
      isDefaultElementSize({ ...DEFAULT_ICON_SIZE, mode: "adaptive" }, DEFAULT_ICON_SIZE),
    ).toBe(false);
    expect(isDefaultElementSize({ ...DEFAULT_ICON_SIZE, value: 32 }, DEFAULT_ICON_SIZE)).toBe(
      false,
    );
  });
});

describe("elementSizeCss", () => {
  it("auto: writes the card's defaults as clamp in px and cqw", () => {
    expect(elementSizeCss(DEFAULT_ICON_SIZE, DEFAULT_ICON_SIZE)).toBe("clamp(24px, 8cqw, 48px)");
  });

  it("auto: ignores the stored numbers and always applies the card's defaults", () => {
    expect(
      elementSizeCss({ mode: "auto", min: 10, ratio: 1, max: 20, value: 64 }, DEFAULT_ICON_SIZE),
    ).toBe("clamp(24px, 8cqw, 48px)");
  });

  it("adaptive: writes clamp from the item's own numbers", () => {
    expect(
      elementSizeCss(
        { mode: "adaptive", min: 10, ratio: 1, max: 20, value: 48 },
        DEFAULT_ICON_SIZE,
      ),
    ).toBe("clamp(10px, 1cqw, 20px)");
  });

  it("adaptive: does not reorder min and max — clamp returns the minimum by CSS spec", () => {
    expect(
      elementSizeCss(
        { mode: "adaptive", min: 80, ratio: 3.5, max: 20, value: 48 },
        DEFAULT_ICON_SIZE,
      ),
    ).toBe("clamp(80px, 3.5cqw, 20px)");
  });

  it("fixed: emits plain px with no clamp and no cqw", () => {
    expect(
      elementSizeCss({ mode: "fixed", min: 40, ratio: 3.5, max: 70, value: 48 }, DEFAULT_ICON_SIZE),
    ).toBe("48px");
  });

  it("fixed: uses the value field, not min or max", () => {
    expect(
      elementSizeCss({ mode: "fixed", min: 10, ratio: 1, max: 20, value: 64 }, DEFAULT_ICON_SIZE),
    ).toBe("64px");
  });
});

describe("DEFAULT_LABEL_SIZE", () => {
  // The one test allowed to name the constant: it is what it guards.
  it("is a text body, roughly half an icon's ratio", () => {
    expect(DEFAULT_LABEL_SIZE).toEqual({
      mode: "auto",
      ratio: 4,
      min: 11,
      max: 20,
      value: 14,
    });
  });
});

describe("elementSizeCss with explicit defaults", () => {
  it("uses the given defaults in auto mode, not the icon's", () => {
    const size = { mode: "auto" as const, ratio: 99, min: 99, max: 99, value: 99 };
    expect(elementSizeCss(size, DEFAULT_LABEL_SIZE)).toBe("clamp(11px, 4cqw, 20px)");
    expect(elementSizeCss(size, DEFAULT_ICON_SIZE)).toBe("clamp(24px, 8cqw, 48px)");
  });

  it("ignores the defaults in adaptive and fixed modes", () => {
    expect(
      elementSizeCss(
        { mode: "adaptive", ratio: 5, min: 12, max: 30, value: 40 },
        DEFAULT_LABEL_SIZE,
      ),
    ).toBe("clamp(12px, 5cqw, 30px)");
    expect(
      elementSizeCss({ mode: "fixed", ratio: 5, min: 12, max: 30, value: 40 }, DEFAULT_LABEL_SIZE),
    ).toBe("40px");
  });
});

describe("normalizeElementSize with explicit defaults", () => {
  it("fills missing numbers from the defaults it is given", () => {
    expect(normalizeElementSize({}, DEFAULT_LABEL_SIZE)).toEqual(DEFAULT_LABEL_SIZE);
    expect(normalizeElementSize({}, DEFAULT_ICON_SIZE)).toEqual(DEFAULT_ICON_SIZE);
  });

  it("still reads the pre-1.2 { auto: boolean } shape", () => {
    expect(normalizeElementSize({ auto: false }, DEFAULT_LABEL_SIZE).mode).toBe("adaptive");
    expect(normalizeElementSize({ auto: true }, DEFAULT_LABEL_SIZE).mode).toBe("auto");
  });
});

describe("isDefaultElementSize with explicit defaults", () => {
  it("compares against the defaults it is given", () => {
    expect(isDefaultElementSize(DEFAULT_LABEL_SIZE, DEFAULT_LABEL_SIZE)).toBe(true);
    expect(isDefaultElementSize(DEFAULT_LABEL_SIZE, DEFAULT_ICON_SIZE)).toBe(false);
  });
});
