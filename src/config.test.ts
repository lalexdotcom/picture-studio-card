import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE, normaliseConfig, stubConfig } from "./config";

describe("normaliseConfig", () => {
  it("keeps a well-formed config intact", () => {
    const raw = {
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        {
          type: "badge",
          config: { type: "entity", entity: "light.a" },
          position: { top: 30, left: 45 },
        },
      ],
    };
    expect(normaliseConfig(raw)).toEqual(raw);
  });

  it("defaults a missing items list to empty", () => {
    expect(normaliseConfig({ type: CARD_TYPE, image: "/local/plan.png" }).items).toEqual([]);
  });

  it("centres an item with no position", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      items: [{ type: "badge", config: { type: "entity", entity: "light.a" } }],
    });
    expect(out.items[0]?.position).toEqual({ top: 50, left: 50 });
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
      items: [],
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
    const raw = { type: CARD_TYPE, items: [{ type: "badge", config: { type: "entity" } }] };
    const snapshot = JSON.parse(JSON.stringify(raw));
    normaliseConfig(raw);
    expect(raw).toEqual(snapshot);
  });

  it("rejects a non-object config", () => {
    expect(() => normaliseConfig(null)).toThrow();
    expect(() => normaliseConfig("nope")).toThrow();
  });

  it("rejects an items value that is not an array", () => {
    expect(() => normaliseConfig({ type: CARD_TYPE, items: {} })).toThrow();
  });

  it("rejects an item whose config is missing", () => {
    expect(() =>
      normaliseConfig({
        type: CARD_TYPE,
        items: [{ type: "badge", position: { top: 1, left: 2 } }],
      }),
    ).toThrow();
  });

  it("two items with no position get distinct position objects", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      items: [
        { type: "badge", config: { type: "entity", entity: "light.a" } },
        { type: "badge", config: { type: "entity", entity: "light.b" } },
      ],
    });
    expect(out.items[0]?.position).not.toBe(out.items[1]?.position);
  });

  it("migrates a badges[] config to items[]", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      badges: [{ badge: { type: "entity", entity: "light.a" }, position: { top: 30, left: 45 } }],
    });
    expect(out.items).toEqual([
      {
        type: "badge",
        position: { top: 30, left: 45 },
        config: { type: "entity", entity: "light.a" },
      },
    ]);
    expect("badges" in out).toBe(false);
  });

  it("defaults a missing item type to badge", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      items: [{ config: { type: "entity" }, position: { top: 10, left: 20 } }],
    });
    expect(out.items[0]?.type).toBe("badge");
  });

  it("rejects an unsupported item type, naming the index", () => {
    expect(() =>
      normaliseConfig({
        type: CARD_TYPE,
        items: [{ config: {} }, { type: "element", config: {} }],
      }),
    ).toThrow(/items\[1\]/);
  });

  it("prefers items over badges when both are present", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      items: [
        {
          type: "badge",
          config: { type: "entity", entity: "kept" },
          position: { top: 1, left: 2 },
        },
      ],
      badges: [{ badge: { type: "entity", entity: "dropped" }, position: { top: 3, left: 4 } }],
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.config).toEqual({ type: "entity", entity: "kept" });
    expect("badges" in out).toBe(false);
  });
});

describe("stubConfig", () => {
  it("has the card type and an empty item list", () => {
    const stub = stubConfig();
    expect(stub.type).toBe(CARD_TYPE);
    expect(stub.items).toEqual([]);
  });

  it("has an image so the gallery preview is not an empty frame", () => {
    expect(stubConfig().image).toBeTruthy();
  });
});
