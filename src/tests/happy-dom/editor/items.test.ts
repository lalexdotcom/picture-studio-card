import { describe, expect, it } from "@rstest/core";
import type { BadgeItem, PictureItem } from "../../../config";
import {
  addItem,
  elementShowsNothing,
  itemsSeverity,
  moveItem,
  removeItem,
  replaceConfig,
  rowLabel,
  setAnchor,
  setVisibility,
} from "../../../editor/items";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "../../../element-size";
import { DEFAULT_ANCHOR, DEFAULT_POSITION } from "../../../position";

const item = (entity: string, top: number, left: number): PictureItem => ({
  type: "badge",
  position: { top, left },
  anchor: "auto",
  config: { type: "entity", entity },
});

describe("addItem", () => {
  it("appends the badge centered on the image", () => {
    const out = addItem([item("light.a", 10, 20)], {
      type: "badge",
      config: { type: "entity", entity: "light.b" },
    });
    expect(out).toHaveLength(2);
    const added = out[1] as BadgeItem;
    expect(added?.position).toEqual({ top: 50, left: 50 });
    expect(added?.anchor).toBe("auto");
    expect(added?.config).toEqual({ type: "entity", entity: "light.b" });
  });

  it("gives each added badge its own position object", () => {
    const out = addItem(addItem([], { type: "badge", config: { type: "entity" } }), {
      type: "badge",
      config: { type: "entity" },
    });
    expect((out[0] as BadgeItem)?.position).not.toBe((out[1] as BadgeItem)?.position);
  });

  it("passes a custom badge config through untouched", () => {
    const custom = { type: "custom:mushroom-template-badge", content: "{{ x }}", nested: { a: 1 } };
    expect((addItem([], { type: "badge", config: custom })[0] as BadgeItem)?.config).toEqual(
      custom,
    );
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 20)];
    addItem(items, { type: "badge", config: { type: "entity" } });
    expect(items).toHaveLength(1);
  });

  it("adds an element with the default position and anchor", () => {
    const out = addItem([], {
      type: "element",
      config: { type: "state-icon", size: DEFAULT_ICON_SIZE },
    });
    expect(out[0]).toEqual({
      type: "element",
      position: DEFAULT_POSITION,
      anchor: DEFAULT_ANCHOR,
      config: { type: "state-icon", size: DEFAULT_ICON_SIZE },
    });
  });
});

describe("replaceConfig", () => {
  it("swaps the badge and keeps the position", () => {
    const items = [item("light.a", 10, 20), item("light.b", 30, 40)];
    const out = replaceConfig(items, 1, { type: "entity", entity: "light.CHANGED" });
    const changed = out[1] as BadgeItem;
    expect(changed?.config).toEqual({ type: "entity", entity: "light.CHANGED" });
    expect(changed?.position).toEqual({ top: 30, left: 40 });
    expect(out[0]).toEqual(items[0]);
  });

  it("leaves an unknown item alone rather than growing it a config", () => {
    // An unknown item kept the raw YAML and a reason instead of a config.
    // Spreading one would produce { type: "unknown", raw, reason, config } —
    // no variant of PictureItem has all four, and the cast would wave it past
    // the compiler.
    const unknown = { type: "unknown", raw: {}, reason: "item-type" } as never;
    const items = [item("light.a", 10, 20), unknown];
    const out = replaceConfig(items, 1, { type: "entity", entity: "light.b" });
    expect(out[1]).toEqual(unknown);
    expect(out[1]).not.toHaveProperty("config");
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const items = [item("light.a", 10, 20)];
    expect(replaceConfig(items, 5, { type: "entity" })).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 20)];
    replaceConfig(items, 0, { type: "entity", entity: "light.z" });
    expect((items[0] as BadgeItem)?.config).toEqual({ type: "entity", entity: "light.a" });
  });
});

describe("setAnchor", () => {
  const items = [item("light.a", 10, 20), item("light.b", 30, 40)];

  it("writes the anchor and the coordinates that keep the item still, together", () => {
    const out = setAnchor(items, 1, "center", { top: 33, left: 44 });
    expect((out[1] as BadgeItem)?.anchor).toBe("center");
    expect((out[1] as BadgeItem)?.position).toEqual({ top: 33, left: 44 });
  });

  it("keeps the coordinates when the caller could not work out new ones", () => {
    const out = setAnchor(items, 1, "center");
    expect((out[1] as BadgeItem)?.anchor).toBe("center");
    expect((out[1] as BadgeItem)?.position).toEqual({ top: 30, left: 40 });
  });

  it("leaves every other item untouched", () => {
    const out = setAnchor(items, 1, "center", { top: 33, left: 44 });
    expect(out[0]).toEqual(items[0]);
  });

  it("does not mutate its input, which Home Assistant freezes", () => {
    setAnchor(items, 1, "center", { top: 33, left: 44 });
    expect((items[1] as BadgeItem)?.anchor).toBe("auto");
    expect((items[1] as BadgeItem)?.position).toEqual({ top: 30, left: 40 });
  });

  it("returns the list unchanged for an index that is not there", () => {
    expect(setAnchor(items, -1, "center")).toBe(items);
    expect(setAnchor(items, 2, "center")).toBe(items);
  });
});

describe("moveItem", () => {
  it("moves a pair as a unit, so reordering never disturbs positions", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20), item("light.c", 30, 30)];
    const out = moveItem(items, 0, 2);
    expect(out.map((i) => (i as BadgeItem).config.entity)).toEqual([
      "light.b",
      "light.c",
      "light.a",
    ]);
    expect(out[2]).toEqual(items[0]);
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const items = [item("light.a", 10, 10)];
    expect(moveItem(items, 0, 5)).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20)];
    moveItem(items, 0, 1);
    expect(items.map((i) => (i as BadgeItem).config.entity)).toEqual(["light.a", "light.b"]);
  });
});

describe("removeItem", () => {
  it("drops the pair at the index", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20)];
    expect(removeItem(items, 0)).toEqual([items[1]]);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 10)];
    removeItem(items, 0);
    expect(items).toHaveLength(1);
  });
});

describe("rowLabel", () => {
  const badge = (config: Record<string, unknown>): PictureItem => ({
    type: "badge",
    position: { top: 50, left: 50 },
    anchor: "auto",
    config: config as never,
  });
  // formatEntityName composes from the registry: one `{ type }` part for the
  // name, a list of them for the "Area ▸ Device" breadcrumb.
  const registry =
    (names: Record<string, string>) =>
    (_s: unknown, part?: unknown): string =>
      names[(part as { type?: string } | undefined)?.type ?? ""] ?? "";

  const hass = {
    states: { "light.ceiling_lights": { attributes: {} } },
    formatEntityName: registry({ entity: "Open space", area: "Bureau", device: "Plafonnier" }),
  } as never;

  it("shows the entity's name over its place, as Home Assistant's own lists do", () => {
    expect(rowLabel(badge({ type: "entity", entity: "light.ceiling_lights" }), hass)).toEqual({
      primary: "Open space",
      secondary: "Bureau ▸ Plafonnier",
    });
  });

  it("drops the second line for an entity attached to neither an area nor a device", () => {
    const placeless = {
      states: { "light.ceiling_lights": { attributes: {} } },
      formatEntityName: registry({ entity: "Open space" }),
    } as never;
    expect(rowLabel(badge({ type: "entity", entity: "light.ceiling_lights" }), placeless)).toEqual({
      primary: "Open space",
    });
  });

  it("drops the device from the second line when it is already the first", () => {
    // What Home Assistant reaches through a registry heuristic: the main entity
    // of a device composes to the device's own name, and repeating it under
    // itself says nothing.
    const mainEntity = {
      states: { "light.ceiling_lights": { attributes: {} } },
      formatEntityName: registry({
        entity: "Plafonnier",
        area: "Bureau",
        device: "Plafonnier",
      }),
    } as never;
    expect(rowLabel(badge({ type: "entity", entity: "light.ceiling_lights" }), mainEntity)).toEqual(
      {
        primary: "Plafonnier",
        secondary: "Bureau",
      },
    );
  });

  it("lets a name written into the badge win over the registry's", () => {
    const item = badge({ type: "entity", entity: "light.ceiling_lights", name: "Desks" });
    expect(rowLabel(item, hass).primary).toBe("Desks");
  });

  it("falls back to the id for an entity it cannot resolve", () => {
    expect(rowLabel(badge({ type: "entity", entity: "light.gone" }), hass)).toEqual({
      primary: "light.gone",
      secondary: "entity",
    });
  });

  it("falls back to the badge type when there is no entity at all", () => {
    expect(rowLabel(badge({ type: "custom:mushroom-template-badge" }))).toEqual({
      primary: "custom:mushroom-template-badge",
    });
  });

  it("never repeats itself across the two lines", () => {
    const label = rowLabel(badge({ type: "entity", entity: "light.gone" }));
    expect(label.primary).not.toBe(label.secondary);
  });

  it("shows a shortcut badge's text as the primary label", () => {
    expect(rowLabel(badge({ type: "shortcut", text: "Open office" }))).toEqual({
      primary: "Open office",
      secondary: "shortcut",
    });
  });

  it("falls back for a shortcut badge with no text rather than showing an empty label", () => {
    expect(rowLabel(badge({ type: "shortcut" }))).toEqual({ primary: "shortcut" });
    expect(rowLabel(badge({ type: "shortcut", text: "" }))).toEqual({ primary: "shortcut" });
  });

  it("uses the catalogue name when badgeName is supplied", () => {
    expect(
      rowLabel(badge({ type: "custom:mushroom-template-badge" }), undefined, "Template"),
    ).toEqual({ primary: "Template", secondary: "custom:mushroom-template-badge" });
  });

  it("falls back to the raw type when no badgeName is supplied", () => {
    expect(rowLabel(badge({ type: "custom:mushroom-template-badge" }))).toEqual({
      primary: "custom:mushroom-template-badge",
    });
  });
});

describe("rowLabel for an element", () => {
  const icon = (config: Record<string, unknown>): PictureItem => ({
    type: "element",
    position: DEFAULT_POSITION,
    anchor: DEFAULT_ANCHOR,
    config: { type: "state-icon", size: DEFAULT_ICON_SIZE, ...config } as never,
  });

  it("shows the entity's name over its place, like a badge row", () => {
    const hass = {
      states: { "light.a": { attributes: {} } },
      formatEntityName: (_s: unknown, part?: unknown): string =>
        ({ entity: "Lampe", area: "Salon", device: "Lampadaire" })[
          (part as { type?: string } | undefined)?.type ?? ""
        ] ?? "",
    } as never;
    expect(rowLabel(icon({ entity: "light.a" }), hass)).toEqual({
      primary: "Lampe",
      secondary: "Salon ▸ Lampadaire",
    });
  });

  it("falls back to the kind when there is no entity yet", () => {
    expect(rowLabel(icon({}))).toEqual({ primary: "state-icon" });
  });

  it("ignores `name`, which may hold composed sentinels", () => {
    expect(rowLabel(icon({ name: "___device_name___", entity: "light.a" })).primary).toBe(
      "light.a",
    );
  });

  it("labels a row from the entity, so an item that draws nothing is still named", () => {
    const item = {
      type: "element",
      position: { top: 1, left: 1 },
      anchor: "auto",
      config: { type: "state-label", entity: "sensor.a", show: [] },
    } as unknown as PictureItem;
    expect(rowLabel(item).primary).toBe("sensor.a");
  });
});

/**
 * An image carries three entity keys and only two of them are its subject.
 * `image_entity` and `camera_image` ARE the picture; `entity` merely selects an
 * entry from `state_image`, so a row headed by it would name the switch rather
 * than the thing shown. Where no entity draws the picture, the row says what the
 * form's own selector says.
 */
describe("rowLabel for an image", () => {
  const image = (config: Record<string, unknown>): PictureItem =>
    ({
      type: "element",
      position: DEFAULT_POSITION,
      anchor: DEFAULT_ANCHOR,
      config: { type: "image", width: 30, ...config },
    }) as unknown as PictureItem;

  const hass = {
    states: { "camera.hall": { attributes: {} }, "image.door": { attributes: {} } },
    formatEntityName: (_s: unknown, part?: unknown): string =>
      ({ entity: "Hall", area: "Rez", device: "Caméra" })[
        (part as { type?: string } | undefined)?.type ?? ""
      ] ?? "",
  } as never;

  it("names a camera picture as any entity row is named", () => {
    expect(rowLabel(image({ camera_image: "camera.hall" }), hass)).toEqual({
      primary: "Hall",
      secondary: "Rez ▸ Caméra",
    });
  });

  it("reads image_entity as the subject too", () => {
    expect(rowLabel(image({ image_entity: "image.door" }), hass).primary).toBe("Hall");
  });

  /**
   * `camera.hall`, not some absent id: an entity the registry can name is the
   * only version of this test that proves anything. With an unknown one it
   * passes whatever the precedence is, because the entity path needs a state
   * object to fire at all — which is exactly how its first version hid an
   * inverted precedence through a review.
   */
  it("never lets `entity` outrank the picture, even when it is a real entity", () => {
    expect(rowLabel(image({ image: "/local/plan.png", entity: "camera.hall" }), hass).primary).toBe(
      "/local/plan.png",
    );
    expect(
      rowLabel(image({ image_entity: "image.door", entity: "camera.hall" }), hass).primary,
    ).toBe("Hall");
  });

  it("never names the row after `entity`, not even with nothing else to show", () => {
    expect(rowLabel(image({ entity: "camera.hall" }), hass).primary).toBe("image");
  });

  it("shows the picker's own title for a file chosen through it", () => {
    expect(
      rowLabel(
        image({
          image: {
            media_content_id: "media-source://media_source/local/plan.png",
            metadata: { title: "plan.png" },
          },
        }),
      ).primary,
    ).toBe("plan.png");
  });

  it("shows the path when a hand-written config has no metadata to show", () => {
    expect(rowLabel(image({ image: { media_content_id: "/local/plan.png" } })).primary).toBe(
      "/local/plan.png",
    );
  });

  it("still says what kind it is when nothing has been chosen", () => {
    expect(rowLabel(image({})).primary).toBe("image");
  });

  it("names that kind with the catalogue's own label, so the row and the picker agree", () => {
    const translated = {
      ...(hass as unknown as Record<string, unknown>),
      localize: (key: string) =>
        key === "ui.panel.lovelace.editor.card.picture-elements.element_types.image" ? "Image" : "",
    } as never;
    expect(rowLabel(image({ entity: "camera.hall" }), translated).primary).toBe("Image");
  });
});

describe("setVisibility", () => {
  const items = [
    {
      type: "badge" as const,
      position: { top: 10, left: 10 },
      anchor: "auto" as const,
      config: {},
    },
    {
      type: "badge" as const,
      position: { top: 20, left: 20 },
      anchor: "auto" as const,
      config: {},
    },
  ];

  it("sets a list on the addressed item only", () => {
    const conditions = [{ condition: "state" }];
    const out = setVisibility(items, 1, conditions);
    expect((out[1] as BadgeItem)?.visibility).toEqual(conditions);
    expect((out[0] as BadgeItem)?.visibility).toBeUndefined();
  });

  it("clears the key rather than storing an empty list", () => {
    const withOne = setVisibility(items, 0, [{ condition: "state" }]);
    const cleared = setVisibility(withOne, 0, []);
    expect(cleared[0]).not.toHaveProperty("visibility");
  });

  it("clears the key when handed nothing", () => {
    const withOne = setVisibility(items, 0, [{ condition: "state" }]);
    expect(setVisibility(withOne, 0, undefined)[0]).not.toHaveProperty("visibility");
  });

  it("does not mutate its input", () => {
    setVisibility(items, 0, [{ condition: "state" }]);
    expect(items[0]).not.toHaveProperty("visibility");
  });

  it("returns the list untouched for an index out of range", () => {
    expect(setVisibility(items, 5, [{ condition: "state" }])).toBe(items);
  });
});

describe("rowLabel for an unreadable item", () => {
  const hass = { language: "en" } as never;

  it("shows the raw type over the reason", () => {
    expect(
      rowLabel({ type: "unknown", raw: {}, reason: "item-type", token: "badgee" }, hass),
    ).toEqual({ primary: "badgee", secondary: "Unknown item type" });
  });

  it("shows the family over the reason when the config is missing", () => {
    expect(
      rowLabel({ type: "unknown", raw: {}, reason: "config-missing", token: "badge" }, hass),
    ).toEqual({ primary: "badge", secondary: "Missing config" });
  });

  it("shows the raw element kind over the reason", () => {
    expect(
      rowLabel({ type: "unknown", raw: {}, reason: "element-type", token: "state-lable" }, hass),
    ).toEqual({ primary: "state-lable", secondary: "Unknown element type" });
  });

  it("never renders a blank first line when there is no token", () => {
    expect(rowLabel({ type: "unknown", raw: {}, reason: "item-type" }, hass)).toEqual({
      primary: "Unreadable item",
      secondary: "Unknown item type",
    });
  });
});

/**
 * One rule, two callers: the item list marks a row with it, the element form
 * marks its Content panel with it. Tested here rather than through either, so a
 * change to the rule is caught where the rule lives.
 */
describe("elementShowsNothing", () => {
  it("is true for a label whose show list is empty", () => {
    expect(elementShowsNothing({ type: "state-label", size: DEFAULT_LABEL_SIZE, show: [] })).toBe(
      true,
    );
  });

  it("is false as soon as the label shows one part", () => {
    expect(
      elementShowsNothing({ type: "state-label", size: DEFAULT_LABEL_SIZE, show: ["state"] }),
    ).toBe(false);
  });

  it("is false for a state-icon, which has no show list at all", () => {
    expect(elementShowsNothing({ type: "state-icon", size: DEFAULT_ICON_SIZE })).toBe(false);
  });

  it("is false when show is present but not a list — unreadable is not empty", () => {
    // An unreadable key is somebody else's warning; claiming "shows nothing"
    // here would put the wrong marker on the row.
    expect(
      elementShowsNothing({
        type: "state-label",
        size: DEFAULT_LABEL_SIZE,
        show: "state",
      } as never),
    ).toBe(false);
  });
});

describe("itemsSeverity", () => {
  const badge = (config: Record<string, unknown>) =>
    ({ type: "badge", config, position: { top: 0, left: 0 }, anchor: "auto" }) as never;
  const label = (show: string[]) =>
    ({
      type: "element",
      config: { type: "state-label", entity: "sensor.a", show },
      position: { top: 0, left: 0 },
      anchor: "auto",
    }) as never;

  it("is undefined when no badge type has been probed", () => {
    expect(itemsSeverity([badge({ type: "entity", entity: "sensor.a" })])).toBeUndefined();
  });

  it("is undefined for an empty list", () => {
    expect(itemsSeverity([])).toBeUndefined();
  });

  it("reports an error for an unreadable item", () => {
    expect(itemsSeverity([{ type: "unknown", raw: {}, reason: "item-type" } as never])).toBe(
      "error",
    );
  });

  it("reports a warning for unreadable visibility", () => {
    const item = { ...(badge({ type: "entity" }) as object), visibility: "nope" } as never;
    expect(itemsSeverity([item])).toBe("warning");
  });

  it("reports a warning for a label that shows nothing", () => {
    expect(itemsSeverity([label([])])).toBe("warning");
  });

  it("lets the error win over the warning, whatever the order", () => {
    const broken = { type: "unknown", raw: {}, reason: "item-type" } as never;
    const warned = label([]);
    expect(itemsSeverity([warned, broken])).toBe("error");
    expect(itemsSeverity([broken, warned])).toBe("error");
  });

  it("reports an error for a non-existent native badge type, without a probe", () => {
    // entty is not in CORE_BADGES and has no custom: prefix — badgeIsBroken
    // returns true immediately via !isSupportedBadgeType, no probe needed.
    expect(itemsSeverity([badge({ type: "entty" })])).toBe("error");
  });

  it("reports an error for a native badge type outside CORE_BADGES, without a probe", () => {
    // state-label is statically known to be unsupported — no component, no
    // probe, no timer. badgeIsBroken decides synchronously via !isSupportedBadgeType,
    // and itemsSeverity mirrors the same check so the two stay in sync.
    expect(itemsSeverity([badge({ type: "state-label" })])).toBe("error");
  });
});
