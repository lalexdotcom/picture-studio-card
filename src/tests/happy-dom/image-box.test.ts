import { describe, expect, test } from "@rstest/core";
import {
  DEFAULT_IMAGE_WIDTH,
  effectiveBox,
  imageBoxStyle,
  mustHoldTopLeft,
  normalizeImageBox,
  ratioIsForced,
} from "../../image-box";

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

describe("a live camera forces the ratio", () => {
  test("only a live view on a camera counts", () => {
    expect(ratioIsForced({ camera_image: "camera.hall", camera_view: "live" })).toBe(true);
    expect(ratioIsForced({ camera_image: "camera.hall", camera_view: "auto" })).toBe(false);
    // A live view with no camera is a config that draws from `image`; nothing
    // forces anything there.
    expect(ratioIsForced({ camera_view: "live" })).toBe(false);
    expect(ratioIsForced({})).toBe(false);
  });

  test("the drawn box drops the height, and the stored one keeps it", () => {
    const config = {
      width: 40,
      height: 20,
      camera_image: "camera.hall",
      camera_view: "live" as const,
    };
    expect(effectiveBox(config)).toEqual({ width: 40 });
    // The input is untouched: `storedConfig` rewrites the whole config on every
    // commit, so mutating here would delete a value from the user's YAML that
    // leaving Live is supposed to give back.
    expect(config.height).toBe(20);
  });

  test("anything else is its own box", () => {
    const config = { width: 40, height: 20 };
    expect(effectiveBox(config)).toEqual(config);
  });
});

describe("mustHoldTopLeft", () => {
  const live = { camera_image: "camera.front", camera_view: "live" } as const;

  test("a camera leaving Live gives back a dormant height, and the box moves under the item", () => {
    // Nothing stored changes — the height was never written while Live forced
    // the ratio — but `effectiveBox` stops dropping it, so the rendered box
    // grows and a centred item slides.
    expect(
      mustHoldTopLeft(
        { ...live, width: 40, height: 40 },
        { ...live, camera_view: "auto", width: 40, height: 40 },
      ),
    ).toBe(true);
    expect(
      mustHoldTopLeft(
        { ...live, camera_view: "auto", width: 40, height: 40 },
        { ...live, width: 40, height: 40 },
      ),
    ).toBe(true);
  });

  test("the keep-ratio checkbox adds or removes the height, and that counts", () => {
    // The height FIELD is hidden while keep-ratio is ticked, so a key that
    // appears or disappears can only be the checkbox.
    expect(mustHoldTopLeft({ width: 40, height: 25 }, { width: 40 })).toBe(true);
    expect(mustHoldTopLeft({ width: 40 }, { width: 40, height: 25 })).toBe(true);
  });

  test("a size the user typed is a size the user asked for", () => {
    // The width and height fields keep growing the box around the anchor, which
    // is the keyboard's equivalent of ALT on a corner handle and the only one.
    expect(mustHoldTopLeft({ width: 40 }, { width: 60 })).toBe(false);
    expect(mustHoldTopLeft({ width: 40, height: 25 }, { width: 40, height: 30 })).toBe(false);
    expect(mustHoldTopLeft({ width: 40, height: 25 }, { width: 60, height: 30 })).toBe(false);
  });

  test("an edit that leaves the drawn box alone holds nothing", () => {
    // Editing a tap action, a filter or an entity must not rewrite a coordinate.
    expect(mustHoldTopLeft({ width: 40, height: 25 }, { width: 40, height: 25 })).toBe(false);
    // And a camera switching view with no stored height draws the same box
    // either way, so there is nothing to hold.
    expect(
      mustHoldTopLeft({ ...live, width: 40 }, { ...live, camera_view: "auto", width: 40 }),
    ).toBe(false);
  });
});
