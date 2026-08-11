import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE, normaliseConfig, stubConfig } from "./config";

describe("normaliseConfig", () => {
  it("keeps a well-formed config intact", () => {
    const raw = {
      type: CARD_TYPE,
      image: "/local/plan.png",
      badges: [{ badge: { type: "entity", entity: "light.a" }, position: { top: 30, left: 45 } }],
    };
    expect(normaliseConfig(raw)).toEqual(raw);
  });

  it("defaults a missing badges list to empty", () => {
    expect(normaliseConfig({ type: CARD_TYPE, image: "/local/plan.png" }).badges).toEqual([]);
  });

  it("centres an item with no position", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      badges: [{ badge: { type: "entity", entity: "light.a" } }],
    });
    expect(out.badges[0]?.position).toEqual({ top: 50, left: 50 });
  });

  it("passes hui-image keys through untouched", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      camera_image: "camera.front",
      camera_view: "live",
      aspect_ratio: "16:9",
      fit_mode: "contain",
      filter: "blur(2px)",
      dark_mode_image: "/local/night.png",
      state_image: { on: "/local/on.png" },
      badges: [],
    });
    expect(out.camera_image).toBe("camera.front");
    expect(out.camera_view).toBe("live");
    expect(out.aspect_ratio).toBe("16:9");
    expect(out.fit_mode).toBe("contain");
    expect(out.filter).toBe("blur(2px)");
    expect(out.dark_mode_image).toBe("/local/night.png");
    expect(out.state_image).toEqual({ on: "/local/on.png" });
  });

  it("never mutates the input", () => {
    const raw = { type: CARD_TYPE, badges: [{ badge: { type: "entity" } }] };
    const snapshot = JSON.parse(JSON.stringify(raw));
    normaliseConfig(raw);
    expect(raw).toEqual(snapshot);
  });

  it("rejects a non-object config", () => {
    expect(() => normaliseConfig(null)).toThrow();
    expect(() => normaliseConfig("nope")).toThrow();
  });

  it("rejects a badges value that is not an array", () => {
    expect(() => normaliseConfig({ type: CARD_TYPE, badges: {} })).toThrow();
  });

  it("rejects an item whose badge is missing", () => {
    expect(() =>
      normaliseConfig({ type: CARD_TYPE, badges: [{ position: { top: 1, left: 2 } }] }),
    ).toThrow();
  });

  it("two items with no position get distinct position objects", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      badges: [
        { badge: { type: "entity", entity: "light.a" } },
        { badge: { type: "entity", entity: "light.b" } },
      ],
    });
    expect(out.badges[0]?.position).not.toBe(out.badges[1]?.position);
  });
});

describe("stubConfig", () => {
  it("has the card type and an empty badge list", () => {
    const stub = stubConfig();
    expect(stub.type).toBe(CARD_TYPE);
    expect(stub.badges).toEqual([]);
  });

  it("has an image so the gallery preview is not an empty frame", () => {
    expect(stubConfig().image).toBeTruthy();
  });
});
