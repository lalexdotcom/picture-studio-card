import { describe, expect, it } from "@rstest/core";
import {
  CARD_TYPE,
  imagePath,
  normalizeConfig,
  type StateIconConfig,
  storedConfig,
  stubConfig,
} from "../config";
import { DEFAULT_ICON_SIZE } from "../element-size";

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
          position: { top: 30, left: 45 },
          anchor: "proportional",
          config: { type: "entity", entity: "light.a" },
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

  it("rejects an element whose config has no type", () => {
    expect(() =>
      normalizeConfig({ type: CARD_TYPE, items: [{ type: "element", config: {} }] }),
    ).toThrow(/items\[0\]\.config.*"state-icon"/s);
  });

  it("normalizes a state-icon element, defaulting anchor and size", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: { type: "state-icon", entity: "light.a" } }],
    });
    expect(out.items[0]).toEqual({
      type: "element",
      position: { top: 50, left: 50 },
      anchor: "proportional",
      config: { type: "state-icon", entity: "light.a", size: DEFAULT_ICON_SIZE },
    });
  });

  it("accepts an element with no entity — a freshly added icon has none yet", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: { type: "state-icon" } }],
    });
    expect((out.items[0]!.config as StateIconConfig).entity).toBeUndefined();
  });

  it("keeps keys it does not know inside an element config", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: { type: "state-icon", future_key: 1 } }],
    });
    expect((out.items[0]!.config as Record<string, unknown>).future_key).toBe(1);
  });

  it("rejects an item with no type, naming the index and the accepted values", () => {
    expect(() =>
      normalizeConfig({
        type: CARD_TYPE,
        items: [{ config: { type: "entity" }, position: { top: 10, left: 20 } }],
      }),
    ).toThrow(/items\[0\].*"badge".*"element"/s);
  });

  it("rejects an unsupported item type, naming the index", () => {
    expect(() =>
      normalizeConfig({
        type: CARD_TYPE,
        items: [
          { type: "badge", config: { type: "entity" } },
          { type: "widget", config: {} },
        ],
      }),
    ).toThrow(/items\[1\]/);
  });

  it("rejects an item whose config is missing", () => {
    expect(() =>
      normalizeConfig({
        type: CARD_TYPE,
        items: [{ type: "badge", position: { top: 1, left: 2 } }],
      }),
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

  it("omits a size that is entirely the default", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: { type: "state-icon", entity: "light.a" } }],
    });
    const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
    expect(stored.items[0]?.config).toEqual({ type: "state-icon", entity: "light.a" });
  });

  it("writes an automatic size that carries the user's numbers", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: { type: "state-icon", size: { auto: true, min: 10, ratio: 1, max: 20 } },
        },
      ],
    });
    const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
    expect(stored.items[0]?.config.size).toEqual({ auto: true, min: 10, ratio: 1, max: 20 });
  });

  it("writes a manual size on the way out", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: { type: "state-icon", size: { auto: false, min: 10, ratio: 1, max: 20 } },
        },
      ],
    });
    const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
    expect(stored.items[0]?.config.size).toEqual({ auto: false, min: 10, ratio: 1, max: 20 });
  });

  it("returns a badge item byte-identical, leaving its config payload untouched", () => {
    // The spec requires that an existing badge config survives a round trip
    // unchanged. If storedConfig ever starts rewriting badge payloads, this
    // test will catch it: the assertion covers entity, name, and actions.
    const item = {
      type: "badge" as const,
      position: { top: "30%", left: "45%" },
      config: {
        type: "entity",
        entity: "light.living_room",
        name: "Living Room",
        tap_action: { action: "more-info" },
      },
    };
    const stored = storedConfig(normalizeConfig({ type: CARD_TYPE, items: [item] })) as {
      items: unknown[];
    };
    expect(stored.items[0]).toEqual(item);
  });
});

describe("anchor", () => {
  const base = { type: "custom:picture-studio", image: "/local/a.png" };
  const badge = { type: "entity", entity: "light.salon" };

  it("defaults a missing anchor to proportional", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    });
    expect(config.items[0]?.anchor).toBe("proportional");
  });

  it("reads a fixed anchor", () => {
    const config = normalizeConfig({
      ...base,
      items: [
        { type: "badge", position: { top: "30%", left: "45%" }, anchor: "center", config: badge },
      ],
    });
    expect(config.items[0]?.anchor).toBe("center");
  });

  it("falls back rather than trusting an unrecognised value", () => {
    const config = normalizeConfig({
      ...base,
      items: [
        { type: "badge", position: { top: "30%", left: "45%" }, anchor: "middle", config: badge },
      ],
    });
    expect(config.items[0]?.anchor).toBe("proportional");
  });

  it("omits the key on the way out when it is the default", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    });
    const stored = storedConfig(config) as { items: Record<string, unknown>[] };
    expect(Object.hasOwn(stored.items[0] ?? {}, "anchor")).toBe(false);
  });

  it("writes the key on the way out when it is not", () => {
    const config = normalizeConfig({
      ...base,
      items: [
        { type: "badge", position: { top: "30%", left: "45%" }, anchor: "center", config: badge },
      ],
    });
    const stored = storedConfig(config) as { items: Record<string, unknown>[] };
    expect(stored.items[0]?.anchor).toBe("center");
  });

  it("leaves a config that uses no anchor byte-identical across the round trip", () => {
    const raw = {
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    };
    expect(storedConfig(normalizeConfig(raw))).toEqual(raw);
  });

  it("keeps an out-of-range coordinate across the round trip", () => {
    const raw = {
      ...base,
      items: [
        { type: "badge", position: { top: "-10%", left: "130%" }, anchor: "center", config: badge },
      ],
    };
    expect(storedConfig(normalizeConfig(raw))).toEqual(raw);
  });
});
