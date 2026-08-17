import { describe, expect, it } from "@rstest/core";
import {
  type IconChrome,
  chromeFill,
  DEFAULT_ICON_CHROME,
  DEFAULT_LABEL_CHROME,
  isDefaultIconChrome,
  isDefaultLabelChrome,
  normalizeIconChrome,
  normalizeLabelChrome,
} from "../chrome";

describe("DEFAULT_CHROME", () => {
  // The one test allowed to name the constant: it is what it guards.
  it("is a disc, fully opaque, drawing nothing, with Home Assistant's 24/40 ratio", () => {
    expect(DEFAULT_ICON_CHROME).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });
});

describe("normalizeChrome", () => {
  it("defaults a missing chrome to the default record", () => {
    expect(normalizeIconChrome(undefined)).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("reads a full record back unchanged", () => {
    expect(
      normalizeIconChrome({ theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 }),
    ).toEqual({ theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 });
  });

  it("keeps the numbers when the theme is none — a chrome switched off is not erased", () => {
    expect(normalizeIconChrome({ theme: "none", radius: 8, opacity: 0.5, content_ratio: 1 })).toEqual({
      theme: "none",
      radius: 8,
      opacity: 0.5,
      content_ratio: 1,
    });
  });

  it("falls back to none on an unknown theme", () => {
    expect(normalizeIconChrome({ theme: "rainbow" }).theme).toBe("none");
  });

  it("keeps out-of-range finite numbers exactly as written", () => {
    expect(normalizeIconChrome({ radius: 90, opacity: 4, content_ratio: -1 })).toEqual({
      theme: "none",
      radius: 90,
      opacity: 4,
      content_ratio: -1,
    });
  });

  it("falls back on values that are not finite numbers", () => {
    expect(normalizeIconChrome({ radius: "12%", opacity: null, content_ratio: Number.NaN })).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("drops unknown keys — chrome is a closed record, like size", () => {
    expect(normalizeIconChrome({ theme: "auto", border: "1px" })).toEqual({
      theme: "auto",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("survives a non-object", () => {
    expect(normalizeIconChrome("dark").theme).toBe("none");
    expect(normalizeIconChrome(null).theme).toBe("none");
  });
});

describe("DEFAULT_LABEL_CHROME", () => {
  // The one test allowed to name the constant: it is what it guards.
  it("draws nothing, square-cornered, opaque, with a 6px gutter", () => {
    expect(DEFAULT_LABEL_CHROME).toEqual({
      theme: "none",
      radius: 0,
      pill: false,
      opacity: 1,
      padding: 6,
    });
  });
});

describe("normalizeLabelChrome", () => {
  it("returns the defaults for anything that is not an object", () => {
    expect(normalizeLabelChrome(undefined)).toEqual(DEFAULT_LABEL_CHROME);
    expect(normalizeLabelChrome("pill")).toEqual(DEFAULT_LABEL_CHROME);
    expect(normalizeLabelChrome(null)).toEqual(DEFAULT_LABEL_CHROME);
  });

  it("keeps any finite number exactly as written — the model never clamps", () => {
    const chrome = normalizeLabelChrome({ radius: 12.5, padding: 40, opacity: 1.4 });
    expect(chrome.radius).toBe(12.5);
    expect(chrome.padding).toBe(40);
    expect(chrome.opacity).toBe(1.4);
  });

  it("falls back to the default for a non-finite or missing number", () => {
    const chrome = normalizeLabelChrome({ radius: "8", padding: Number.NaN });
    expect(chrome.radius).toBe(0);
    expect(chrome.padding).toBe(6);
  });

  it("accepts the four themes and rejects anything else", () => {
    expect(normalizeLabelChrome({ theme: "dark" }).theme).toBe("dark");
    expect(normalizeLabelChrome({ theme: "glass" }).theme).toBe("none");
  });

  it("reads `pill` as a strict boolean and drops unknown keys", () => {
    expect(normalizeLabelChrome({ pill: true }).pill).toBe(true);
    expect(normalizeLabelChrome({ pill: "yes" }).pill).toBe(false);
    expect(normalizeLabelChrome({ blur: 3 })).toEqual(DEFAULT_LABEL_CHROME);
  });
});

describe("isDefaultLabelChrome", () => {
  it("is true only when every field is the default", () => {
    expect(isDefaultLabelChrome(DEFAULT_LABEL_CHROME)).toBe(true);
    expect(isDefaultLabelChrome({ ...DEFAULT_LABEL_CHROME, pill: true })).toBe(false);
    expect(isDefaultLabelChrome({ ...DEFAULT_LABEL_CHROME, padding: 7 })).toBe(false);
  });
});

describe("isDefaultChrome", () => {
  const base: IconChrome = { theme: "none", radius: 50, opacity: 1, content_ratio: 0.6 };

  it("is true only for the untouched record", () => {
    expect(isDefaultIconChrome(base)).toBe(true);
  });

  it("is false as soon as any one field differs", () => {
    expect(isDefaultIconChrome({ ...base, theme: "auto" })).toBe(false);
    expect(isDefaultIconChrome({ ...base, radius: 8 })).toBe(false);
    expect(isDefaultIconChrome({ ...base, opacity: 0.9 })).toBe(false);
    expect(isDefaultIconChrome({ ...base, content_ratio: 1 })).toBe(false);
  });
});

describe("chromeFill", () => {
  it("copies ha-badge's own chain for auto", () => {
    expect(chromeFill("auto")).toBe(
      "var(--ha-card-background, var(--card-background-color, #fff))",
    );
  });

  it("names the core palette directly for the forced modes", () => {
    expect(chromeFill("light")).toBe("var(--ha-color-white, #fff)");
    expect(chromeFill("dark")).toBe("var(--ha-color-neutral-10, #202020)");
  });
});
