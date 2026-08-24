import { describe, expect, it, test } from "@rstest/core";
import { DEFAULT_LABEL_CHROME, type LabelChrome } from "../../chrome";
import {
  type BadgeItem,
  CARD_TYPE,
  type ElementItem,
  hasHeading,
  hasVisibility,
  imagePath,
  isSupportedBadgeType,
  normalizeConfig,
  normalizeElementConfig,
  type StateIconConfig,
  type StateLabelConfig,
  storedConfig,
  stubConfig,
} from "../../config";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE, type ElementSize } from "../../element-size";
import { DEFAULT_IMAGE_WIDTH } from "../../image-box";

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
    expect((out.items[0] as BadgeItem | undefined)?.position).toEqual({ top: 50, left: 50 });
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
    expect(out.heading).toEqual({ title: "Front door" });
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

  it("holds as UnknownItem an item whose config is missing", () => {
    const { items } = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "badge", position: { top: 1, left: 2 } }],
    });
    expect(items[0]).toMatchObject({ type: "unknown", reason: "config-missing", token: "badge" });
  });

  it("two items with no position get distinct position objects", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [
        { type: "badge", config: { type: "entity", entity: "light.a" } },
        { type: "badge", config: { type: "entity", entity: "light.b" } },
      ],
    });
    expect((out.items[0] as BadgeItem | undefined)?.position).not.toBe(
      (out.items[1] as BadgeItem | undefined)?.position,
    );
  });

  it("holds as UnknownItem an element whose config has no type", () => {
    const { items } = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: {} }],
    });
    expect(items[0]).toMatchObject({ type: "unknown", reason: "element-type" });
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
        halo: false,
      },
    });
  });

  it("accepts an element with no entity — a freshly added icon has none yet", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: { type: "state-icon" } }],
    });
    expect(((out.items[0] as ElementItem).config as StateIconConfig).entity).toBeUndefined();
  });

  it("keeps keys it does not know inside an element config", () => {
    const out = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", config: { type: "state-icon", future_key: 1 } }],
    });
    expect(
      ((out.items[0] as ElementItem).config as unknown as Record<string, unknown>).future_key,
    ).toBe(1);
  });

  it("holds as UnknownItem an item with no type", () => {
    const { items } = normalizeConfig({
      type: CARD_TYPE,
      items: [{ config: { type: "entity" }, position: { top: 10, left: 20 } }],
    });
    expect(items[0]).toMatchObject({ type: "unknown", reason: "item-type" });
    expect((items[0] as { token?: string }).token).toBeUndefined();
  });

  it("holds as UnknownItem an unsupported item type, carrying the type as its token", () => {
    const { items } = normalizeConfig({
      type: CARD_TYPE,
      items: [
        { type: "badge", config: { type: "entity" } },
        { type: "widget", config: {} },
      ],
    });
    expect(items[1]).toMatchObject({ type: "unknown", reason: "item-type", token: "widget" });
  });

  it("holds as UnknownItem an item whose config is missing", () => {
    const { items } = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "badge", position: { top: 1, left: 2 } }],
    });
    expect(items[0]).toMatchObject({ type: "unknown", reason: "config-missing", token: "badge" });
  });

  it("holds as UnknownItem an unknown element kind rather than treating it as an icon", () => {
    const { items } = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "1%", left: "1%" },
          config: { type: "state-gauge", entity: "sensor.a" },
        },
      ],
    });
    expect(items[0]).toMatchObject({
      type: "unknown",
      reason: "element-type",
      token: "state-gauge",
    });
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
    expect((out.items[0] as BadgeItem | undefined)?.visibility).toEqual(conditions);
  });

  it("keeps a condition type it does not know", () => {
    const conditions = [{ condition: "future_condition", whatever: 1 }];
    const out = normalizeConfig(withVisibility(conditions));
    expect((out.items[0] as BadgeItem | undefined)?.visibility).toEqual(conditions);
  });

  it("leaves the key absent when the config has none", () => {
    const out = normalizeConfig({
      type: "custom:picture-studio",
      items: [{ type: "badge", config: { type: "entity" } }],
    });
    expect((out.items[0] as BadgeItem | undefined)?.visibility).toBeUndefined();
  });

  it("keeps a non-list visibility rather than refusing it", () => {
    const { items } = normalizeConfig(withVisibility({ condition: "state" }));
    expect((items[0] as BadgeItem | undefined)?.visibility).toEqual({ condition: "state" });
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
    expect((element.config as StateIconConfig).chrome).toEqual({
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
    expect((element.config as StateIconConfig).chrome).toEqual({
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

describe("element halo", () => {
  it("normalises `halo` to a strict boolean, absent meaning off", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/a.png",
      items: [
        { type: "element", position: { top: "1%", left: "1%" }, config: { type: "state-icon" } },
      ],
    });
    const item = config.items[0] as ElementItem | undefined;
    if (!item) throw new Error("expected an item");
    expect((item.config as StateIconConfig).halo).toBe(false);
  });

  it("reads `halo: true` and rejects a truthy non-boolean", () => {
    const on = normalizeElementConfig({ type: "state-icon", halo: true }, 0) as StateIconConfig;
    const off = normalizeElementConfig({ type: "state-icon", halo: "yes" }, 0) as StateIconConfig;
    expect(on.halo).toBe(true);
    expect(off.halo).toBe(false);
  });

  it("stores `halo` only when it is on", () => {
    const withHalo = storedConfig(
      normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/a.png",
        items: [
          {
            type: "element",
            position: { top: "1%", left: "1%" },
            config: { type: "state-icon", halo: true },
          },
          { type: "element", position: { top: "2%", left: "2%" }, config: { type: "state-icon" } },
        ],
      }),
    );
    const [first, second] = withHalo.items as [
      { config: Record<string, unknown> },
      { config: Record<string, unknown> },
    ];
    expect(first.config.halo).toBe(true);
    expect("halo" in second.config).toBe(false);
  });
});

describe("state-label config", () => {
  const label = (raw: Record<string, unknown>) =>
    normalizeElementConfig({ type: "state-label", ...raw }, 0) as StateLabelConfig;

  it("defaults size and chrome to the label's own records", () => {
    const config = label({});
    expect(config.size).toEqual(DEFAULT_LABEL_SIZE);
    expect(config.chrome).toEqual(DEFAULT_LABEL_CHROME);
    expect(config.halo).toBe(false);
  });

  it("keeps unknown keys, because storedConfig rewrites the whole config", () => {
    expect((label({ prefix: "~" }) as StateLabelConfig & Record<string, unknown>).prefix).toBe("~");
  });

  it("drops an unknown key inside its closed records", () => {
    expect(label({ chrome: { blur: 3 } }).chrome).toEqual(DEFAULT_LABEL_CHROME);
  });

  it("still raises on an absent or unknown kind", () => {
    expect(() => normalizeElementConfig({}, 2)).toThrow(/items\[2\]/);
    expect(() => normalizeElementConfig({ type: "state-gauge" }, 0)).toThrow();
  });

  it("round-trips through storedConfig without growing default keys", () => {
    const stored = storedConfig(
      normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/a.png",
        items: [
          {
            type: "element",
            position: { top: "1%", left: "1%" },
            config: { type: "state-label", entity: "sensor.a" },
          },
        ],
      }),
    );
    const [item0] = stored.items as [{ config: unknown }];
    expect(item0.config).toEqual({
      type: "state-label",
      entity: "sensor.a",
    });
  });

  it("stores a non-default label chrome and size", () => {
    const stored = storedConfig(
      normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/a.png",
        items: [
          {
            type: "element",
            position: { top: "1%", left: "1%" },
            config: {
              type: "state-label",
              chrome: { theme: "auto", pill: true },
              size: { mode: "fixed", value: 18 },
            },
          },
        ],
      }),
    );
    const [item0] = stored.items as [{ config: Record<string, unknown> }];
    const config = item0.config;
    expect((config.chrome as LabelChrome).pill).toBe(true);
    expect((config.size as ElementSize).mode).toBe("fixed");
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
    expect((config.items[0] as BadgeItem | undefined)?.anchor).toBe("auto");
  });

  it("reads a fixed anchor", () => {
    const config = normalizeConfig({
      ...base,
      items: [
        { type: "badge", position: { top: "30%", left: "45%" }, anchor: "center", config: badge },
      ],
    });
    expect((config.items[0] as BadgeItem | undefined)?.anchor).toBe("center");
  });

  it("falls back rather than trusting an unrecognised value", () => {
    const config = normalizeConfig({
      ...base,
      items: [
        { type: "badge", position: { top: "30%", left: "45%" }, anchor: "middle", config: badge },
      ],
    });
    expect((config.items[0] as BadgeItem | undefined)?.anchor).toBe("auto");
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
    expect((config.items[0] as BadgeItem | undefined)?.anchor).toBe("auto");
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
    expect((stored.items[0]?.position as Record<string, unknown>)?.anchor).toBe("center");
  });

  it("leaves a config that uses no anchor byte-identical across the round trip", () => {
    const raw = {
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    };
    expect(storedConfig(normalizeConfig(raw))).toEqual(raw);
  });

  it("keeps an out-of-range coordinate across the round trip", () => {
    // Since 1.4.0 the anchor lives inside `position`, so the canonical
    // round-trip form has it there — not beside the item.
    const raw = {
      ...base,
      items: [
        { type: "badge", position: { top: "-10%", left: "130%", anchor: "center" }, config: badge },
      ],
    };
    expect(storedConfig(normalizeConfig(raw))).toEqual(raw);
  });
});

describe("anchor lives inside position", () => {
  it("reads an anchor written inside position", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "20%", anchor: "center" },
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    expect((config.items[0] as ElementItem | undefined)?.anchor).toBe("center");
  });

  it("still reads an anchor left beside position, as 1.2.0 wrote it", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "20%" },
          anchor: "bottom-right",
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    expect((config.items[0] as ElementItem | undefined)?.anchor).toBe("bottom-right");
  });

  it("prefers the new place when a config carries both", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "20%", anchor: "center" },
          anchor: "top-left",
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    expect((config.items[0] as ElementItem | undefined)?.anchor).toBe("center");
  });

  it("writes the anchor inside position and never beside it", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "20%" },
          anchor: "center-right",
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    const item = (storedConfig(config).items as Record<string, unknown>[])[0];
    expect(item?.position).toEqual({ top: "10%", left: "20%", anchor: "center-right" });
    expect(item).not.toHaveProperty("anchor");
  });

  it("omits an auto anchor entirely, so an untouched config comes back as it went in", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "20%" },
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    const item = (storedConfig(config).items as Record<string, unknown>[])[0];
    expect(item?.position).toEqual({ top: "10%", left: "20%" });
    expect(item).not.toHaveProperty("anchor");
  });
});

describe("a label's show list", () => {
  const label = (config: Record<string, unknown>) =>
    (
      normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/p.png",
        items: [{ type: "element", position: { top: "1%", left: "1%" }, config }],
      }).items[0] as ElementItem | undefined
    )?.config as { show: string[] };

  it("shows the state when the config says nothing", () => {
    expect(label({ type: "state-label", entity: "sensor.a" }).show).toEqual(["state"]);
  });

  it("keeps what it is given, in the order the form produced", () => {
    expect(
      label({ type: "state-label", entity: "sensor.a", show: ["state", "name"] }).show,
    ).toEqual(["state", "name"]);
  });

  it("drops an entry it cannot honour, and a duplicate", () => {
    expect(
      label({ type: "state-label", entity: "sensor.a", show: ["name", "icon", "name"] }).show,
    ).toEqual(["name"]);
  });

  it("keeps an empty list rather than replacing it with the default", () => {
    expect(label({ type: "state-label", entity: "sensor.a", show: [] }).show).toEqual([]);
  });

  it("omits the list from storage when it is the default, and keeps it otherwise", () => {
    const stored = (config: Record<string, unknown>) => {
      const normalized = normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/p.png",
        items: [{ type: "element", position: { top: "1%", left: "1%" }, config }],
      });
      const item = (storedConfig(normalized).items as Record<string, unknown>[])[0];
      return item?.config as Record<string, unknown>;
    };
    expect(stored({ type: "state-label", entity: "sensor.a" })).not.toHaveProperty("show");
    expect(stored({ type: "state-label", entity: "sensor.a", show: [] }).show).toEqual([]);
    expect(stored({ type: "state-label", entity: "sensor.a", show: ["name"] }).show).toEqual([
      "name",
    ]);
  });
});

describe("an unreadable item is kept, not fatal", () => {
  const wrap = (item: unknown) => ({
    type: "custom:picture-studio",
    image: "/x.png",
    items: [item],
  });

  it("holds an unknown item `type` with the raw type as its token", () => {
    const { items } = normalizeConfig(wrap({ type: "badgee", position: { top: 30, left: 10 } }));
    expect(items[0]).toEqual({
      type: "unknown",
      reason: "item-type",
      token: "badgee",
      raw: { type: "badgee", position: { top: 30, left: 10 } },
    });
  });

  it("holds an absent `type` with no token", () => {
    const { items } = normalizeConfig(wrap({ config: { type: "entity" } }));
    expect(items[0]).toMatchObject({ type: "unknown", reason: "item-type" });
    expect((items[0] as { token?: string }).token).toBeUndefined();
  });

  it("holds a missing `config` with the family as its token", () => {
    const { items } = normalizeConfig(wrap({ type: "badge", position: { top: "1%", left: "2%" } }));
    expect(items[0]).toMatchObject({ type: "unknown", reason: "config-missing", token: "badge" });
  });

  it("holds an unknown element kind with the raw kind as its token", () => {
    const { items } = normalizeConfig(
      wrap({ type: "element", config: { type: "state-lable", entity: "light.a" } }),
    );
    expect(items[0]).toMatchObject({
      type: "unknown",
      reason: "element-type",
      token: "state-lable",
    });
  });

  it("still throws when the entry is not an object at all", () => {
    expect(() => normalizeConfig(wrap("not an object"))).toThrow(/items\[0\] must be an object/);
  });

  it("does not disturb the readable items beside it", () => {
    const { items } = normalizeConfig({
      type: "custom:picture-studio",
      image: "/x.png",
      items: [
        { type: "badgee" },
        {
          type: "element",
          position: { top: "5%", left: "6%" },
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    expect(items[0]?.type).toBe("unknown");
    expect(items[1]).toMatchObject({ type: "element", position: { top: 5, left: 6 } });
  });
});

describe("an unreadable item round-trips byte for byte", () => {
  it("re-emits the raw entry untouched, position included", () => {
    // `top: 30` is the point: a normalized position would come back "30%" on an
    // item we claim not to understand, and the anchor would move inside it.
    const raw = { type: "badgee", position: { top: 30, left: 10 }, anchor: "center", extra: 7 };
    const stored = storedConfig(
      normalizeConfig({ type: "custom:picture-studio", image: "/x.png", items: [raw] }),
    );
    expect((stored.items as unknown[])[0]).toEqual(raw);
  });

  it("leaves it alone when another item is committed", () => {
    const raw = {
      type: "element",
      config: { type: "state-lable", size: { mode: "fixed", value: 40 } },
    };
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/x.png",
      items: [
        raw,
        {
          type: "element",
          position: { top: "5%", left: "5%" },
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    const moved = {
      ...config,
      items: config.items.map((it, i) => (i === 1 ? { ...it, position: { top: 9, left: 9 } } : it)),
    };
    expect((storedConfig(moved).items as unknown[])[0]).toEqual(raw);
  });
});

describe("a malformed `visibility` is ignored, not fatal", () => {
  const item = {
    type: "badge",
    position: { top: "5%", left: "5%" },
    visibility: { condition: "state", entity: "light.a", state: "on" },
    config: { type: "entity", entity: "light.a" },
  };

  it("does not throw and keeps the raw value", () => {
    const { items } = normalizeConfig({
      type: "custom:picture-studio",
      image: "/x.png",
      items: [item],
    });
    expect(items[0]?.type).toBe("badge");
    expect((items[0] as BadgeItem | undefined)?.visibility).toEqual(item.visibility);
  });

  it("reports no conditions, so nothing hides the item", () => {
    const { items } = normalizeConfig({
      type: "custom:picture-studio",
      image: "/x.png",
      items: [item],
    });
    expect(hasVisibility(items[0] as never)).toBe(false);
  });

  it("writes the raw value back rather than dropping it", () => {
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/x.png",
      items: [item],
    });
    expect(
      ((storedConfig(config).items as Record<string, unknown>[])[0] as { visibility: unknown })
        .visibility,
    ).toEqual(item.visibility);
  });
});

describe("heading", () => {
  it("migrates a legacy top-level title into heading.title", () => {
    const config = normalizeConfig({ type: CARD_TYPE, title: "Office", items: [] });
    expect(config.heading).toEqual({ title: "Office" });
    expect((config as unknown as Record<string, unknown>).title).toBeUndefined();
  });

  it("lets an existing heading.title win over a legacy title", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      title: "old",
      heading: { title: "new" },
      items: [],
    });
    expect(config.heading).toEqual({ title: "new" });
  });

  it("drops the legacy key even when heading has no title", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      title: "Office",
      heading: { icon: "mdi:desk" },
      items: [],
    });
    expect(config.heading).toEqual({ icon: "mdi:desk", title: "Office" });
  });

  it("keeps a non-record heading out of the way", () => {
    const config = normalizeConfig({ type: CARD_TYPE, heading: "nope", items: [] });
    expect(config.heading).toBeUndefined();
  });

  it("does not write an empty heading back", () => {
    const stored = storedConfig(normalizeConfig({ type: CARD_TYPE, heading: {}, items: [] }));
    expect("heading" in stored).toBe(false);
  });

  it("writes a heading that carries something", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, heading: { title: "Office" }, items: [] }),
    );
    expect(stored.heading).toEqual({ title: "Office" });
  });

  it("never writes the legacy title back", () => {
    const stored = storedConfig(normalizeConfig({ type: CARD_TYPE, title: "Office", items: [] }));
    expect("title" in stored).toBe(false);
  });
});

describe("hasHeading", () => {
  it("is false for undefined and for an empty record", () => {
    expect(hasHeading(undefined)).toBe(false);
    expect(hasHeading({})).toBe(false);
  });

  it("is true when any of the three carries something", () => {
    expect(hasHeading({ title: "x" })).toBe(true);
    expect(hasHeading({ icon: "mdi:desk" })).toBe(true);
    expect(hasHeading({ badges: [{ type: "entity" }] })).toBe(true);
  });

  it("is false for an empty badge list", () => {
    expect(hasHeading({ badges: [] })).toBe(false);
  });
});

/**
 * The rule lives here, not with the editor's picker: the card gates its render on
 * it too, and must not reach into the editor layer to do so.
 */
describe("isSupportedBadgeType", () => {
  it("accepts the two core badges", () => {
    expect(isSupportedBadgeType("entity")).toBe(true);
    expect(isSupportedBadgeType("shortcut")).toBe(true);
  });

  it("accepts any custom: type, known or not, because the runtime probe decides", () => {
    expect(isSupportedBadgeType("custom:mushroom-template-badge")).toBe(true);
    expect(isSupportedBadgeType("custom:does-not-exist")).toBe(true);
    expect(isSupportedBadgeType("custom:")).toBe(true);
  });

  it("rejects a native type outside CORE_BADGES, including state-label", () => {
    // state-label is the one that matters: it is also a picture-elements
    // element kind, so writing type: badge was a silent way to get the wrong
    // thing. The other five are rejected for the same structural reason.
    expect(isSupportedBadgeType("state-label")).toBe(false);
    expect(isSupportedBadgeType("entity-filter")).toBe(false);
    expect(isSupportedBadgeType("power-total")).toBe(false);
    expect(isSupportedBadgeType("gas-total")).toBe(false);
    expect(isSupportedBadgeType("water-total")).toBe(false);
  });

  it("rejects a nonsense native type", () => {
    expect(isSupportedBadgeType("entty")).toBe(false);
    expect(isSupportedBadgeType("")).toBe(false);
  });
});

describe("image element", () => {
  const item = (config: Record<string, unknown>) => ({
    type: "element",
    position: { top: 10, left: 10 },
    config: { type: "image", ...config },
  });

  test("normalizes its box and keeps every passthrough key", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [item({ image: "/a.png", filter: "blur(2px)", state_image: { on: "/b.png" } })],
    });
    const element = config.items[0]!;
    expect(element.type).toBe("element");
    if (element.type !== "element" || element.config.type !== "image") throw new Error("shape");
    expect(element.config.width).toBe(DEFAULT_IMAGE_WIDTH);
    expect(element.config).not.toHaveProperty("height");
    expect(element.config.filter).toBe("blur(2px)");
    expect(element.config.state_image).toEqual({ on: "/b.png" });
  });

  test("an unreadable kind is still an unknown item, not an image", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", position: {}, config: { type: "picture" } }],
    });
    expect(config.items[0]!.type).toBe("unknown");
  });

  test("round trips: the default width is omitted, an absent height stays absent", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, items: [item({ image: "/a.png" })] }),
    );
    const config = (stored.items as Record<string, unknown>[])[0]!.config as Record<
      string,
      unknown
    >;
    expect(config).not.toHaveProperty("width");
    expect(config).not.toHaveProperty("height");
    expect(config.image).toBe("/a.png");
  });

  test("round trips: a chosen box is written back", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, items: [item({ width: 40, height: 25 })] }),
    );
    const config = (stored.items as Record<string, unknown>[])[0]!.config as Record<
      string,
      unknown
    >;
    expect(config.width).toBe(40);
    expect(config.height).toBe(25);
  });

  test("round trips: an unknown key survives the commit", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, items: [item({ future_key: "kept" })] }),
    );
    const config = (stored.items as Record<string, unknown>[])[0]!.config as Record<
      string,
      unknown
    >;
    expect(config.future_key).toBe("kept");
  });
});
