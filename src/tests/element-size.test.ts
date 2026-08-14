import { describe, expect, it } from "@rstest/core";
import {
  DEFAULT_ICON_SIZE,
  iconSizeCss,
  isDefaultIconSize,
  normalizeIconSize,
} from "../element-size";

describe("normalizeIconSize", () => {
  it("defaults a missing size to auto", () => {
    expect(normalizeIconSize(undefined)).toEqual(DEFAULT_ICON_SIZE);
  });

  it("reads a bare object with no mode key as auto", () => {
    expect(normalizeIconSize({ min: 10 })).toEqual({ ...DEFAULT_ICON_SIZE, min: 10 });
  });

  it("keeps all five fields when mode is auto", () => {
    expect(normalizeIconSize({ mode: "auto", min: 10, ratio: 1, max: 20, value: 32 })).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: 32,
    });
  });

  it("keeps numbers when mode is adaptive", () => {
    expect(normalizeIconSize({ mode: "adaptive", min: 10, ratio: 1, max: 20, value: 32 })).toEqual({
      mode: "adaptive",
      min: 10,
      ratio: 1,
      max: 20,
      value: 32,
    });
  });

  it("keeps all fields when mode is fixed", () => {
    expect(normalizeIconSize({ mode: "fixed", min: 10, ratio: 1, max: 20, value: 64 })).toEqual({
      mode: "fixed",
      min: 10,
      ratio: 1,
      max: 20,
      value: 64,
    });
  });

  it("falls back per field on a non-finite number", () => {
    expect(normalizeIconSize({ mode: "adaptive", min: "x", ratio: Number.NaN })).toEqual({
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
    expect(normalizeIconSize({ auto: true, min: 10, ratio: 1, max: 20 })).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: DEFAULT_ICON_SIZE.value,
    });
  });

  it("reads legacy auto:false as mode:adaptive", () => {
    expect(normalizeIconSize({ auto: false, min: 10, ratio: 1, max: 20 })).toEqual({
      mode: "adaptive",
      min: 10,
      ratio: 1,
      max: 20,
      value: DEFAULT_ICON_SIZE.value,
    });
  });
});

describe("isDefaultIconSize", () => {
  it("is true only when all five fields are the defaults", () => {
    expect(isDefaultIconSize(DEFAULT_ICON_SIZE)).toBe(true);
    expect(isDefaultIconSize({ ...DEFAULT_ICON_SIZE, min: 10 })).toBe(false);
    expect(isDefaultIconSize({ ...DEFAULT_ICON_SIZE, mode: "adaptive" })).toBe(false);
    expect(isDefaultIconSize({ ...DEFAULT_ICON_SIZE, value: 32 })).toBe(false);
  });
});

describe("iconSizeCss", () => {
  it("auto: writes the card's defaults as clamp in px and cqw", () => {
    expect(iconSizeCss(DEFAULT_ICON_SIZE)).toBe("clamp(24px, 8cqw, 48px)");
  });

  it("auto: ignores the stored numbers and always applies the card's defaults", () => {
    expect(iconSizeCss({ mode: "auto", min: 10, ratio: 1, max: 20, value: 64 })).toBe(
      "clamp(24px, 8cqw, 48px)",
    );
  });

  it("adaptive: writes clamp from the item's own numbers", () => {
    expect(iconSizeCss({ mode: "adaptive", min: 10, ratio: 1, max: 20, value: 48 })).toBe(
      "clamp(10px, 1cqw, 20px)",
    );
  });

  it("adaptive: does not reorder min and max — clamp returns the minimum by CSS spec", () => {
    expect(iconSizeCss({ mode: "adaptive", min: 80, ratio: 3.5, max: 20, value: 48 })).toBe(
      "clamp(80px, 3.5cqw, 20px)",
    );
  });

  it("fixed: emits plain px with no clamp and no cqw", () => {
    expect(iconSizeCss({ mode: "fixed", min: 40, ratio: 3.5, max: 70, value: 48 })).toBe("48px");
  });

  it("fixed: uses the value field, not min or max", () => {
    expect(iconSizeCss({ mode: "fixed", min: 10, ratio: 1, max: 20, value: 64 })).toBe("64px");
  });
});
