import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE, imagePath, normalizeConfig, storedConfig, stubConfig } from "../config";

describe("imagePath", () => {
  it("keeps a hand-written path as-is", () => {
    expect(imagePath("/local/plan.png")).toBe("/local/plan.png");
  });

  it("unwraps the object the media selector writes", () => {
    expect(
      imagePath({ media_content_id: "media-source://x", media_content_type: "image/png" }),
    ).toBe("media-source://x");
  });

  it("returns undefined for an absent or empty value", () => {
    expect(imagePath(undefined)).toBeUndefined();
    expect(imagePath({})).toBeUndefined();
  });
});

describe("normalizeConfig", () => {
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
    expect(normalizeConfig(raw)).toEqual(raw);
  });

  it("defaults a missing items list to empty", () => {
    expect(normalizeConfig({ type: CARD_TYPE, image: "/local/plan.png" }).items).toEqual([]);
  });

  it("centers an item with no position", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "badge", config: { type: "entity", entity: "light.a" } }],
    });
    expect(out.items[0]?.position).toEqual({ top: 50, left: 50 });
  });

  it("passes image-element keys through untouched", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      entity: "light.living",
      image_entity: "image.front",
      camera_image: "camera.front",
      camera_view: "live",
      aspect_ratio: "16:9",
      filter: "blur(2px)",
      state_filter: { on: "brightness(1.2)" },
      dark_mode_image: "/local/night.png",
      dark_mode_filter: "brightness(0.5)",
      state_image: { on: "/local/on.png" },
      title: "Front door",
      items: [],
    });
    expect(out.entity).toBe("light.living");
    expect(out.image_entity).toBe("image.front");
    expect(out.camera_image).toBe("camera.front");
    expect(out.camera_view).toBe("live");
    expect(out.aspect_ratio).toBe("16:9");
    expect(out.filter).toBe("blur(2px)");
    expect(out.state_filter).toEqual({ on: "brightness(1.2)" });
    expect(out.dark_mode_image).toBe("/local/night.png");
    expect(out.dark_mode_filter).toBe("brightness(0.5)");
    expect(out.state_image).toEqual({ on: "/local/on.png" });
    expect(out.title).toBe("Front door");
  });

  it("never mutates the input", () => {
    const raw = { type: CARD_TYPE, items: [{ type: "badge", config: { type: "entity" } }] };
    const snapshot = JSON.parse(JSON.stringify(raw));
    normalizeConfig(raw);
    expect(raw).toEqual(snapshot);
  });

  it("rejects a non-object config", () => {
    expect(() => normalizeConfig(null)).toThrow();
    expect(() => normalizeConfig("nope")).toThrow();
  });

  it("rejects an items value that is not an array", () => {
    expect(() => normalizeConfig({ type: CARD_TYPE, items: {} })).toThrow();
  });

  it("rejects an item whose config is missing", () => {
    expect(() =>
      normalizeConfig({
        type: CARD_TYPE,
        items: [{ type: "badge", position: { top: 1, left: 2 } }],
      }),
    ).toThrow();
  });

  it("two items with no position get distinct position objects", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [
        { type: "badge", config: { type: "entity", entity: "light.a" } },
        { type: "badge", config: { type: "entity", entity: "light.b" } },
      ],
    });
    expect(out.items[0]?.position).not.toBe(out.items[1]?.position);
  });

  it("defaults a missing item type to badge", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ config: { type: "entity" }, position: { top: 10, left: 20 } }],
    });
    expect(out.items[0]?.type).toBe("badge");
  });

  it("rejects an unsupported item type, naming the index", () => {
    expect(() =>
      normalizeConfig({
        type: CARD_TYPE,
        items: [{ config: {} }, { type: "element", config: {} }],
      }),
    ).toThrow(/items\[1\]/);
  });

  it("rejects an item whose config is missing", () => {
    expect(() =>
      normalizeConfig({ type: CARD_TYPE, items: [{ position: { top: 1, left: 2 } }] }),
    ).toThrow(/items\[0\]/);
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

describe("storedConfig", () => {
  it("writes positions as percentages", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "badge", config: { type: "entity" }, position: { top: 30, left: 60.5 } }],
    });
    const out = storedConfig(config) as { items: { position: unknown }[] };
    expect(out.items[0]?.position).toEqual({ top: "30%", left: "60.5%" });
  });

  it("survives a round trip unchanged, so the editor never rewrites what it read", () => {
    const raw = {
      type: CARD_TYPE,
      items: [
        { type: "badge", config: { type: "entity" }, position: { top: "30%", left: "60.5%" } },
      ],
    };
    const once = storedConfig(normalizeConfig(raw));
    const twice = storedConfig(normalizeConfig(once));
    expect(twice).toEqual(once);
    expect((once as { items: { position: unknown }[] }).items[0]?.position).toEqual({
      top: "30%",
      left: "60.5%",
    });
  });

  it("leaves the rest of the config alone", () => {
    const config = normalizeConfig({ type: CARD_TYPE, image: "/local/plan.png", items: [] });
    expect(storedConfig(config)).toEqual({ type: CARD_TYPE, image: "/local/plan.png", items: [] });
  });
});
