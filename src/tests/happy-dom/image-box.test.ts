import { describe, expect, test } from "@rstest/core";
import { DEFAULT_IMAGE_WIDTH, imageBoxStyle, normalizeImageBox } from "../../image-box";

describe("normalizeImageBox", () => {
  test("a bare config takes the default width and keeps its ratio", () => {
    expect(normalizeImageBox({})).toEqual({ width: DEFAULT_IMAGE_WIDTH });
  });

  test("reads a number and a percent string alike", () => {
    expect(normalizeImageBox({ width: 40 })).toEqual({ width: 40 });
    expect(normalizeImageBox({ width: "40%" })).toEqual({ width: 40 });
  });

  test("an absent height IS the keep-ratio mode, and stays absent", () => {
    expect(normalizeImageBox({ width: 40 })).not.toHaveProperty("height");
    expect(normalizeImageBox({ width: 40, height: null })).not.toHaveProperty("height");
  });

  test("a height is kept when it parses", () => {
    expect(normalizeImageBox({ width: 40, height: 25 })).toEqual({ width: 40, height: 25 });
  });

  test("zero, negative and unreadable are not values — width falls back, height vanishes", () => {
    expect(normalizeImageBox({ width: 0 })).toEqual({ width: DEFAULT_IMAGE_WIDTH });
    expect(normalizeImageBox({ width: -5 })).toEqual({ width: DEFAULT_IMAGE_WIDTH });
    expect(normalizeImageBox({ width: "nonsense" })).toEqual({ width: DEFAULT_IMAGE_WIDTH });
    expect(normalizeImageBox({ width: 40, height: 0 })).toEqual({ width: 40 });
    expect(normalizeImageBox({ width: 40, height: -1 })).toEqual({ width: 40 });
  });

  test("above 100 is let through — the same rule positions follow", () => {
    expect(normalizeImageBox({ width: 250, height: 300 })).toEqual({ width: 250, height: 300 });
  });
});

describe("imageBoxStyle", () => {
  test("keep-ratio leaves the height to the browser and bounds it", () => {
    expect(imageBoxStyle({ width: 40 })).toEqual({
      width: "40%",
      height: "",
      maxHeight: "100%",
    });
  });

  test("an explicit height is written, and the clamp is released", () => {
    expect(imageBoxStyle({ width: 40, height: 25 })).toEqual({
      width: "40%",
      height: "25%",
      maxHeight: "",
    });
  });
});
