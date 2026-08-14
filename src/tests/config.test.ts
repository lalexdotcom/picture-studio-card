import { describe, expect, it } from "@rstest/core";
import {
  CARD_TYPE,
  hasVisibility,
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
          anchor: "auto",
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
      anchor: "auto",
      config: {
        type: "state-icon",
        entity: "light.a",
        size: DEFAULT_ICON_SIZE,
        chrome: { theme: "none", radius: 50, opacity: 1, content_ratio: 0.6 },
      },
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

  it("writes an auto size that carries the user's numbers", () => {
    // mode:auto but non-default numbers — size must be kept so unchecking mode restores them
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: {
            type: "state-icon",
            size: { mode: "auto", min: 10, ratio: 1, max: 20, value: 48 },
          },
        },
      ],
    });
    const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
    expect(stored.items[0]?.config.size).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: 48,
    });
  });

  it("writes an adaptive size on the way out", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: {
            type: "state-icon",
            size: { mode: "adaptive", min: 10, ratio: 1, max: 20, value: 48 },
          },
        },
      ],
    });
    const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
    expect(stored.items[0]?.config.size).toEqual({
      mode: "adaptive",
      min: 10,
      ratio: 1,
      max: 20,
      value: 48,
    });
  });

  it("writes a fixed size on the way out", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: {
            type: "state-icon",
            size: { mode: "fixed", min: 40, ratio: 3.5, max: 70, value: 64 },
          },
        },
      ],
    });
    const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
    expect(stored.items[0]?.config.size).toEqual({
      mode: "fixed",
      min: 40,
      ratio: 3.5,
      max: 70,
      value: 64,
    });
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

describe("item visibility", () => {
  const withVisibility = (visibility: unknown) => ({
    type: "custom:picture-studio",
    items: [
      {
        type: "badge",
        position: { top: "10%", left: "10%" },
        visibility,
        config: { type: "entity", entity: "light.a" },
      },
    ],
  });

  it("carries a condition list through untouched", () => {
    const conditions = [{ condition: "state", entity: "binary_sensor.night", state: "on" }];
    const out = normalizeConfig(withVisibility(conditions));
    expect(out.items[0]?.visibility).toEqual(conditions);
  });

  it("keeps a condition type it does not know", () => {
    const conditions = [{ condition: "future_condition", whatever: 1 }];
    const out = normalizeConfig(withVisibility(conditions));
    expect(out.items[0]?.visibility).toEqual(conditions);
  });

  it("leaves the key absent when the config has none", () => {
    const out = normalizeConfig({
      type: "custom:picture-studio",
      items: [{ type: "badge", config: { type: "entity" } }],
    });
    expect(out.items[0]?.visibility).toBeUndefined();
  });

  it("raises when visibility is not a list", () => {
    expect(() => normalizeConfig(withVisibility({ condition: "state" }))).toThrow(
      /items\[0\]\.visibility must be a list/,
    );
  });

  it("stores the key when it holds conditions", () => {
    const conditions = [{ condition: "state", entity: "light.a", state: "on" }];
    const stored = storedConfig(normalizeConfig(withVisibility(conditions)));
    expect((stored.items as Record<string, unknown>[])[0]?.visibility).toEqual(conditions);
  });

  it("omits the key when the list is empty", () => {
    const stored = storedConfig(normalizeConfig(withVisibility([])));
    expect((stored.items as Record<string, unknown>[])[0]).not.toHaveProperty("visibility");
  });

  it("omits the key when there is none, so an untouched config round-trips", () => {
    const raw = {
      type: "custom:picture-studio",
      items: [{ type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } }],
    };
    const stored = storedConfig(normalizeConfig(raw));
    expect((stored.items as Record<string, unknown>[])[0]).not.toHaveProperty("visibility");
  });
});

describe("element chrome", () => {
  const withChrome = (chrome: unknown) => ({
    type: "custom:picture-studio",
    image: "/a.png",
    items: [
      {
        type: "element",
        position: { top: "10%", left: "10%" },
        config: { type: "state-icon", entity: "light.a", chrome },
      },
    ],
  });

  it("normalizes a chrome the config carries", () => {
    const config = normalizeConfig(withChrome({ theme: "dark", radius: 8 }));
    const element = config.items[0];
    if (!element || element.type !== "element") throw new Error("expected an element");
    expect(element.config.chrome).toEqual({
      theme: "dark",
      radius: 8,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("gives an element with no chrome key the default record", () => {
    const config = normalizeConfig(withChrome(undefined));
    const element = config.items[0];
    if (!element || element.type !== "element") throw new Error("expected an element");
    expect(element.config.chrome).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("does not write a chrome key back when it is untouched", () => {
    const stored = storedConfig(normalizeConfig(withChrome(undefined)));
    const item = (stored.items as Record<string, unknown>[])[0];
    if (!item) throw new Error("expected an item");
    expect(item.config).not.toHaveProperty("chrome");
  });

  it("writes the chrome back when any field was touched", () => {
    const stored = storedConfig(normalizeConfig(withChrome({ theme: "auto" })));
    const item = (stored.items as Record<string, unknown>[])[0];
    if (!item) throw new Error("expected an item");
    expect((item.config as Record<string, unknown>).chrome).toEqual({
      theme: "auto",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("keeps a chrome whose theme is none but whose numbers were tuned", () => {
    const stored = storedConfig(normalizeConfig(withChrome({ theme: "none", radius: 10 })));
    const item = (stored.items as Record<string, unknown>[])[0];
    if (!item) throw new Error("expected an item");
    expect((item.config as Record<string, unknown>).chrome).toEqual({
      theme: "none",
      radius: 10,
      opacity: 1,
      content_ratio: 0.6,
    });
  });
});

describe("hasVisibility", () => {
  const item = (visibility?: unknown) =>
    normalizeConfig({
      type: "custom:picture-studio",
      items: [{ type: "badge", visibility, config: { type: "entity" } }],
    }).items[0]!;

  it("is false with no key", () => {
    expect(hasVisibility(item())).toBe(false);
  });

  it("is false with an empty list", () => {
    expect(hasVisibility(item([]))).toBe(false);
  });

  it("is true with one condition", () => {
    expect(hasVisibility(item([{ condition: "state" }]))).toBe(true);
  });
});

describe("anchor", () => {
  const base = { type: "custom:picture-studio", image: "/local/a.png" };
  const badge = { type: "entity", entity: "light.salon" };

  it("defaults a missing anchor to auto", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    });
    expect(config.items[0]?.anchor).toBe("auto");
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
    expect(config.items[0]?.anchor).toBe("auto");
  });

  it("reads the legacy proportional value as auto (read-compat path for pre-1.2.0 configs)", () => {
    const config = normalizeConfig({
      ...base,
      items: [
        {
          type: "badge",
          position: { top: "30%", left: "45%" },
          anchor: "proportional",
          config: badge,
        },
      ],
    });
    expect(config.items[0]?.anchor).toBe("auto");
    // auto is the default, so storedConfig omits the key rather than writing it back out.
    const stored = storedConfig(config) as { items: Record<string, unknown>[] };
    expect(Object.hasOwn(stored.items[0] ?? {}, "anchor")).toBe(false);
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
