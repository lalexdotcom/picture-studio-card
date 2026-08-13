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

  it("keeps the numbers under auto — the switch overrides, it does not erase", () => {
    expect(normalizeIconSize({ auto: true, min: 10, ratio: 1, max: 20 })).toEqual({
      auto: true,
      min: 10,
      ratio: 1,
      max: 20,
    });
  });

  it("keeps the numbers when auto is off", () => {
    expect(normalizeIconSize({ auto: false, min: 10, ratio: 1, max: 20 })).toEqual({
      auto: false,
      min: 10,
      ratio: 1,
      max: 20,
    });
  });

  it("falls back per field on a non-finite number", () => {
    expect(normalizeIconSize({ auto: false, min: "x", ratio: Number.NaN })).toEqual({
      auto: false,
      min: DEFAULT_ICON_SIZE.min,
      ratio: DEFAULT_ICON_SIZE.ratio,
      max: DEFAULT_ICON_SIZE.max,
    });
  });

  it("reads a bare object with no auto key as auto", () => {
    expect(normalizeIconSize({ min: 10 })).toEqual({ ...DEFAULT_ICON_SIZE, auto: true, min: 10 });
  });
});

describe("isDefaultIconSize", () => {
  it("is true only when all four fields are the defaults", () => {
    expect(isDefaultIconSize(DEFAULT_ICON_SIZE)).toBe(true);
    expect(isDefaultIconSize({ ...DEFAULT_ICON_SIZE, min: 10 })).toBe(false);
    expect(isDefaultIconSize({ ...DEFAULT_ICON_SIZE, auto: false })).toBe(false);
  });
});

describe("iconSizeCss", () => {
  it("writes the clamp in px and cqw", () => {
    expect(iconSizeCss(DEFAULT_ICON_SIZE)).toBe("clamp(40px, 3.5cqw, 70px)");
  });

  it("substitutes the card's defaults under auto, leaving the numbers untouched", () => {
    expect(iconSizeCss({ auto: true, min: 10, ratio: 1, max: 20 })).toBe(
      "clamp(40px, 3.5cqw, 70px)",
    );
  });

  it("writes a fixed size when min equals max", () => {
    expect(iconSizeCss({ auto: false, min: 48, ratio: 3.5, max: 48 })).toBe(
      "clamp(48px, 3.5cqw, 48px)",
    );
  });

  it("does not reorder min and max — clamp returns the minimum by CSS spec", () => {
    expect(iconSizeCss({ auto: false, min: 80, ratio: 3.5, max: 20 })).toBe(
      "clamp(80px, 3.5cqw, 20px)",
    );
  });
});
