import { afterEach, beforeEach, describe, expect, it, rstest } from "@rstest/core";
import { LIST_TAG, type PictureItem } from "../../config";
import { badgeCatalog } from "../../editor/badge-catalog";
import { resetBadgeVerdicts } from "../../editor/badge-existence";
import {
  addChoices,
  itemsSeverity,
  kindLabel,
  PictureStudioBadgeList,
  splitChoiceValue,
} from "../../editor/badge-list";
import { DEFAULT_LABEL_SIZE } from "../../element-size";
import { cssRules } from "../card/harness";

// Provides a minimal loadCardHelpers stub for tests that render badge rows but
// do not need probe control. Without it, probeBadgeType throws when it calls
// window.loadCardHelpers() for badge items now that render() wires the probe.
const defaultHelpers = {
  createBadgeElement: (c: { type?: string }) =>
    document.createElement(
      c.type === "entity" || c.type === "shortcut" ? `hui-${c.type}-badge` : "hui-error-badge",
    ),
};
beforeEach(() => {
  (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
    defaultHelpers;
});
afterEach(() => {
  resetBadgeVerdicts();
});

const localize = ((key: string) =>
  ({
    "ui.panel.lovelace.editor.badges.name": "Badges",
    "ui.panel.lovelace.editor.card.picture-elements.elements": "Éléments",
    "ui.panel.lovelace.editor.badge.entity.name": "Entité",
    "ui.panel.lovelace.editor.card.picture-elements.element_types.state-icon": "Icône d'état",
    "ui.panel.lovelace.editor.card.picture-elements.element_types.state-label": "Libellé d'état",
  })[key] ?? "") as never;

describe("addChoices", () => {
  it("formats the first and last entries with the right value, label, and icon", () => {
    const choices = addChoices(localize, undefined);
    expect(choices[0]).toEqual({
      value: "element:state-icon",
      label: "Éléments: Icône d'état",
      icon: "mdi:brightness-7",
    });
    expect(choices.at(-1)).toEqual({
      value: "badge:shortcut",
      label: "Badges: shortcut",
      icon: "mdi:label-variant",
    });
    // Compound "Family: Name" format — would fail if the separator or the
    // localize prefix path broke for any entry.
    expect(
      choices.every((c) =>
        c.value.startsWith("badge:")
          ? c.label.startsWith("Badges: ")
          : c.label.startsWith("Éléments: "),
      ),
    ).toBe(true);
  });

  it("offers the elements before the badges", () => {
    const values = addChoices(localize).map((c) => c.value);
    expect(values[0]).toBe("element:state-icon");
    expect(values[1]).toBe("element:state-label");
    expect(values.slice(2).every((v) => v.startsWith("badge:"))).toBe(true);
  });
});

describe("kindLabel", () => {
  const catalog = badgeCatalog(undefined);
  const badge = (type: string): PictureItem =>
    ({ type: "badge", config: { type } }) as unknown as PictureItem;

  it("names a core badge through Home Assistant's own label", () => {
    expect(kindLabel(badge("entity"), localize, catalog)).toBe("Entité");
  });

  it("names an element kind", () => {
    const item = { type: "element", config: { type: "state-icon" } } as unknown as PictureItem;
    expect(kindLabel(item, localize, catalog)).toBe("Icône d'état");
  });

  it("falls back to the raw type for a badge the catalogue does not know", () => {
    expect(kindLabel(badge("custom:mushroom-template-badge"), localize, catalog)).toBe(
      "custom:mushroom-template-badge",
    );
  });

  it("names a custom badge through its registered name when the library is loaded", () => {
    const withCustom = badgeCatalog([{ type: "mushroom-template-badge", name: "Template" }]);
    expect(kindLabel(badge("custom:mushroom-template-badge"), localize, withCustom)).toBe(
      "Template",
    );
  });
});

describe("splitChoiceValue", () => {
  it("splits on the first colon only, so a custom badge type survives", () => {
    expect(splitChoiceValue("badge:custom:mushroom-template-badge")).toEqual({
      family: "badge",
      type: "custom:mushroom-template-badge",
    });
  });

  it("rejects a value with no family", () => {
    expect(splitChoiceValue("entity")).toBeUndefined();
  });
});

describe("the list reads top-down while the array stores bottom-up", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const item = (entity: string): PictureItem =>
    ({
      type: "badge",
      position: { top: "0%", left: "0%" },
      config: { type: "entity", entity },
    }) as unknown as PictureItem;

  const mount = async (count: number) => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = Array.from({ length: count }, (_, i) => item(`light.${i}`));
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  const rows = (el: PictureStudioBadgeList) => [
    ...(el.shadowRoot?.querySelectorAll(".item") ?? []),
  ];

  /** 0 is the pencil, 1 the cross — the row's two ha-icon-buttons, in order. */
  const press = (el: PictureStudioBadgeList, row: number, button: number): void => {
    const target = rows(el)[row]?.querySelectorAll("ha-icon-button")[button];
    (target as HTMLElement | undefined)?.click();
  };

  const caught = <T>(el: HTMLElement, type: string): { detail?: T } => {
    const seen: { detail?: T } = {};
    el.addEventListener(type, (ev) => {
      seen.detail = (ev as CustomEvent<T>).detail;
    });
    return seen;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("puts the last item of the array in the first row", async () => {
    const el = await mount(3);
    const primaries = rows(el).map((row) => row.querySelector(".primary")?.textContent);
    // Array order is light.0, light.1, light.2; light.2 is painted on top.
    expect(primaries[0]).toContain("light.2");
    expect(primaries.at(-1)).toContain("light.0");
  });

  it("flips an edit back to an array index before it can reach the card", async () => {
    const el = await mount(3);
    const seen = caught<{ index: number }>(el, "item-edit");
    press(el, 0, 0);
    // First row, so the last item of the array — not index 0.
    expect(seen.detail?.index).toBe(2);
  });

  it("flips a removal the same way", async () => {
    const el = await mount(3);
    const seen = caught<{ index: number }>(el, "item-removed");
    press(el, 2, 1);
    expect(seen.detail?.index).toBe(0);
  });

  it("flips both ends of a drag, which is what reversing the array would do", async () => {
    const el = await mount(4);
    const seen = caught<{ oldIndex: number; newIndex: number }>(el, "item-moved");
    el.shadowRoot
      ?.querySelector("ha-sortable")
      ?.dispatchEvent(new CustomEvent("item-moved", { detail: { oldIndex: 0, newIndex: 2 } }));
    // Dragging the top row down two places moves array index 3 to index 1.
    expect(seen.detail).toEqual({ oldIndex: 3, newIndex: 1 });
  });

  it("keeps a row's DOM on the item it belongs to when another is added", async () => {
    const el = await mount(2);
    // Display is light.1, light.0. Hold the node showing light.0, at the bottom.
    const bottom = rows(el)[1];
    el.items = [...el.items, item("light.2")];
    await el.updateComplete;
    // light.2 lands on top, so light.0's row moved down one — and it is the very
    // same node, moved rather than re-rendered. Keyed by display position it
    // would be a different node serving a different item.
    expect(rows(el)[2]).toBe(bottom);
    expect(rows(el)[0]?.querySelector(".primary")?.textContent).toContain("light.2");
  });

  it("keeps the editor's own array untouched: the reversal is a copy", async () => {
    const el = await mount(3);
    expect(el.items.map((i) => (i as { config: { entity: string } }).config.entity)).toEqual([
      "light.0",
      "light.1",
      "light.2",
    ]);
  });

  it("marks a label that shows nothing, and leaves the others alone", async () => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [
      {
        type: "element",
        position: { top: 1, left: 1 },
        anchor: "auto",
        config: { type: "state-label", entity: "sensor.a", show: [], size: DEFAULT_LABEL_SIZE },
      },
      {
        type: "element",
        position: { top: 2, left: 2 },
        anchor: "auto",
        config: {
          type: "state-label",
          entity: "sensor.b",
          show: ["state"],
          size: DEFAULT_LABEL_SIZE,
        },
      },
    ] as unknown as PictureItem[];
    document.body.append(el);
    await el.updateComplete;
    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])];
    // Display is reversed: sensor.b on top, sensor.a below.
    expect(rows[0]?.querySelector(".empty")).toBeNull();
    expect(rows[1]?.querySelector(".empty")).not.toBeNull();
  });

  it("wears a bare warning icon, not the visibility pill's dress", () => {
    const rules = cssRules(PictureStudioBadgeList.styles);
    expect(rules.get(".empty")).toContain("color: var(--warning-color)");
    expect(rules.get(".empty")).toContain("--mdc-icon-size: 16px");
    // No pill: no background, no radius. That belongs to .conditional alone.
    expect(rules.get(".empty")).not.toContain("background");
    expect(rules.get(".empty")).not.toContain("border-radius");
  });
});

describe("the add menu", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const mount = async () => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [];
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("sits on the title's line rather than under the rows", async () => {
    const el = await mount();
    const header = el.shadowRoot?.querySelector(".header");
    // h3 is gone — the panel (Task 8) carries the title now. The header keeps
    // the hint and the add button; that is what "on one line" means here.
    expect(header?.querySelector(".hint")).not.toBeNull();
    expect(header?.querySelector("ha-dropdown.add")).not.toBeNull();
  });

  it("opens under its trigger and aligned on its right edge", async () => {
    const el = await mount();
    expect(el.shadowRoot?.querySelector("ha-dropdown.add")?.getAttribute("placement")).toBe(
      "bottom-end",
    );
  });
});

describe("a badge whose type does not exist", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const probeHelpers = {
    createBadgeElement: (c: { type?: string }) =>
      document.createElement(
        c.type === "entity" || c.type === "shortcut" || c.type === "state-label"
          ? `hui-${c.type}-badge`
          : "hui-error-badge",
      ),
  };

  beforeEach(() => {
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
  });

  // `await Promise.resolve()` lets Lit's render microtask run (first-paint DOM)
  // but returns before the probe's loadCardHelpers .then() fires — so the first
  // assertion sees broken = false without needing to suppress the probe.
  const mountList = async (its: PictureItem[]) => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = its;
    document.body.append(el);
    await Promise.resolve();
    return el;
  };

  // Awaiting loadCardHelpers() drains the probe's async hop (its .then() runs
  // just before our continuation, since both were registered on the same
  // already-resolved promise). Then updateComplete waits for the re-render that
  // requestUpdate() scheduled.
  const flushProbe = async (list: PictureStudioBadgeList) => {
    await (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers();
    await list.updateComplete;
  };

  afterEach(() => {
    resetBadgeVerdicts();
    document.body.replaceChildren();
  });

  it("renders unmarked on the first paint", async () => {
    const list = await mountList([
      { type: "badge", position: { top: 5, left: 5 }, anchor: "auto", config: { type: "entty" } },
    ] as PictureItem[]);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".kind")?.classList.contains("error")).toBe(false);
  });

  it("marks the row once the verdict lands, and disables Edit", async () => {
    const list = await mountList([
      { type: "badge", position: { top: 5, left: 5 }, anchor: "auto", config: { type: "entty" } },
    ] as PictureItem[]);
    await flushProbe(list);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    // Badge family → alert-box, not alert-circle.
    expect((row.querySelector(".kind") as { icon?: string } | null)?.icon).toBe("mdi:alert-box");
    expect((row.querySelectorAll("ha-icon-button")[0] as { disabled?: boolean }).disabled).toBe(
      true,
    );
  });

  it("leaves a native type outside our catalogue alone", async () => {
    // `state-label` is a real badge type — it is in Home Assistant's lazy map
    // and simply absent from the picker's list, which is what CORE_BADGES
    // mirrors. It must not be flagged.
    const list = await mountList([
      {
        type: "badge",
        position: { top: 5, left: 5 },
        anchor: "auto",
        config: { type: "state-label" },
      },
    ] as PictureItem[]);
    await flushProbe(list);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".kind")?.classList.contains("error")).toBe(false);
  });
});

describe("the row of an unreadable item", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const items = [
    {
      type: "element",
      position: { top: 5, left: 5 },
      anchor: "auto",
      config: { type: "state-icon", entity: "light.a" },
    },
    { type: "unknown", raw: {}, reason: "element-type", token: "state-lable" },
  ] as PictureItem[];

  const mountList = async (its: PictureItem[]) => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = its;
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("marks it with the error glyph in the kind slot", async () => {
    const list = await mountList(items);
    // Top-down: the unknown item is last in the array, so it is the first row.
    const itemRows = [...(list.shadowRoot?.querySelectorAll(".item") ?? [])];
    const row = itemRows[0];
    expect((row?.querySelector(".kind") as { icon?: string } | null)?.icon).toBe(
      "mdi:alert-circle",
    );
    expect(row?.querySelector(".kind")?.classList.contains("error")).toBe(true);
  });

  it("disables Edit and leaves Delete working", async () => {
    const list = await mountList(items);
    const itemRows = [...(list.shadowRoot?.querySelectorAll(".item") ?? [])];
    const row = itemRows[0];
    const [edit, remove] = [...(row?.querySelectorAll("ha-icon-button") ?? [])];
    expect((edit as { disabled?: boolean }).disabled).toBe(true);

    let removed: number | undefined;
    list.addEventListener("item-removed", (ev) => {
      removed = (ev as CustomEvent<{ index: number }>).detail.index;
    });
    (remove as HTMLElement).click();
    // The flip: display row 0 is array index 1.
    expect(removed).toBe(1);
  });

  it("carries neither the eye nor the empty warning", async () => {
    const list = await mountList(items);
    const itemRows = [...(list.shadowRoot?.querySelectorAll(".item") ?? [])];
    const row = itemRows[0];
    expect(row?.querySelector(".conditional")).toBeNull();
    expect(row?.querySelector(".empty")).toBeNull();
  });
});

describe("the row of an item whose visibility is not a list", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const mountWith = async (visibility: unknown) => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [
      {
        type: "element",
        position: { top: 0, left: 0 },
        anchor: "auto",
        visibility,
        config: { type: "state-icon", entity: "light.a" },
      },
    ] as unknown as PictureItem[];
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the orange marker when visibility is a mapping", async () => {
    const el = await mountWith({ condition: "state" });
    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])];
    const row = rows[0];
    expect(row?.querySelector(".empty")).not.toBeNull();
    expect(row?.querySelector(".empty")?.getAttribute("icon")).toBe("mdi:alert-outline");
  });

  it("renders the eye but not the orange marker for a well-formed visibility list", async () => {
    const el = await mountWith([{ condition: "state", entity: "light.a" }]);
    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])];
    const row = rows[0];
    expect(row?.querySelector(".conditional")).not.toBeNull();
    expect(row?.querySelector(".empty")).toBeNull();
  });

  it("an unknown (red) row renders neither the eye nor the orange marker", async () => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [
      {
        type: "unknown",
        raw: { visibility: { condition: "state" } },
        reason: "element-type",
        token: "bad-type",
      },
    ] as unknown as PictureItem[];
    document.body.append(el);
    await el.updateComplete;
    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])];
    const row = rows[0];
    expect(row?.querySelector(".empty")).toBeNull();
    expect(row?.querySelector(".conditional")).toBeNull();
  });
});

describe("error glyph is alert-box for badge family, alert-circle for others", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const mount = async (item: PictureItem) => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [item];
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  const glyph = (el: PictureStudioBadgeList) =>
    (el.shadowRoot!.querySelector(".item .kind") as { icon?: string } | null)?.icon;

  afterEach(() => document.body.replaceChildren());

  it("config-missing with token 'badge' gets alert-box (badge family)", async () => {
    const el = await mount({
      type: "unknown",
      raw: {},
      reason: "config-missing",
      token: "badge",
    } as unknown as PictureItem);
    expect(glyph(el)).toBe("mdi:alert-box");
  });

  it("config-missing with token 'element' gets alert-circle (element family)", async () => {
    const el = await mount({
      type: "unknown",
      raw: {},
      reason: "config-missing",
      token: "element",
    } as unknown as PictureItem);
    expect(glyph(el)).toBe("mdi:alert-circle");
  });

  it("element-type gets alert-circle (element family)", async () => {
    const el = await mount({
      type: "unknown",
      raw: {},
      reason: "element-type",
      token: "bad-el-type",
    } as unknown as PictureItem);
    expect(glyph(el)).toBe("mdi:alert-circle");
  });

  it("item-type gets alert-circle (family unreadable)", async () => {
    const el = await mount({
      type: "unknown",
      raw: {},
      reason: "item-type",
    } as unknown as PictureItem);
    expect(glyph(el)).toBe("mdi:alert-circle");
  });
});

describe("the secondary line of a probe-missing badge carries the type", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const probeHelpers = {
    createBadgeElement: (c: { type?: string }) =>
      document.createElement(c.type === "entity" ? "hui-entity-badge" : "hui-error-badge"),
  };

  beforeEach(() => {
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
  });

  afterEach(() => {
    resetBadgeVerdicts();
    document.body.replaceChildren();
  });

  it("appends the type after the translated prefix once the verdict lands", async () => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [
      {
        type: "badge",
        position: { top: 5, left: 5 },
        anchor: "auto",
        config: { type: "entty" },
      },
    ] as PictureItem[];
    document.body.append(el);
    await Promise.resolve();
    // Flush probe — same pattern as "a badge whose type does not exist".
    await (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers();
    await el.updateComplete;
    const secondary = el.shadowRoot!.querySelector(".secondary");
    expect(secondary?.textContent).toBe("Unknown badge type: entty");
  });
});

describe("selectedIndex scrolls the row at the flipped display position", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const item = (entity: string): PictureItem =>
    ({
      type: "badge",
      position: { top: 0, left: 0 },
      anchor: "auto",
      config: { type: "entity", entity },
    }) as unknown as PictureItem;

  afterEach(() => document.body.replaceChildren());

  it("scrolls the row at the flipped position, not the raw index position", async () => {
    // Three items: array [light.0, light.1, light.2], displayed [light.2, light.1, light.0].
    // selectedIndex = 0 (array) → display position _flip(0) = 2.
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [item("light.0"), item("light.1"), item("light.2")];
    document.body.append(el);
    await el.updateComplete;

    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])] as HTMLElement[];
    // Spy on the row that SHOULD be scrolled (display 2 = array index 0).
    const expected = rows[2] as HTMLElement;
    const spyExpected = rstest.spyOn(expected, "scrollIntoView");
    // Spy on the row that should NOT be scrolled (display 0 = array index 2).
    const unexpected = rows[0] as HTMLElement;
    const spyUnexpected = rstest.spyOn(unexpected, "scrollIntoView");

    el.selectedIndex = 0;
    await el.updateComplete;
    expect(spyExpected).toHaveBeenCalledTimes(1);
    expect(spyUnexpected).toHaveBeenCalledTimes(0);
  });

  it("does not scroll on deselection", async () => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [item("light.0"), item("light.1"), item("light.2")];
    document.body.append(el);
    await el.updateComplete;

    el.selectedIndex = 1;
    await el.updateComplete;

    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])] as HTMLElement[];
    const spies = rows.map((r) => rstest.spyOn(r, "scrollIntoView"));

    el.selectedIndex = undefined;
    await el.updateComplete;
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe("the Items section", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const badgeItem = (): PictureItem =>
    ({
      type: "badge",
      config: { type: "entity", entity: "sensor.a" },
      position: { top: 0, left: 0 },
      anchor: "auto",
    }) as unknown as PictureItem;

  const mountList = async (its: PictureItem[]) => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = its;
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("no longer draws a heading of its own — the panel carries the title", async () => {
    const el = await mountList([]);
    expect(el.shadowRoot?.querySelector("h3")).toBeNull();
  });

  it("keeps the caption and the add button on one line", async () => {
    const el = await mountList([]);
    const header = el.shadowRoot?.querySelector(".header");
    expect(header?.querySelector(".hint")).not.toBeNull();
    expect(header?.querySelector("ha-button, ha-dropdown")).not.toBeNull();
  });

  it("keeps the sortable's container inside the scrolling wrapper", async () => {
    const el = await mountList([badgeItem()]);
    const wrapper = el.shadowRoot?.querySelector(".scroll");
    // ha-sortable takes children[0] as its container, so the scrolling wrapper
    // must sit ABOVE it, never between it and the rows.
    expect(wrapper?.firstElementChild?.tagName.toLowerCase()).toBe("ha-sortable");
  });

  it("caps the list's height", async () => {
    const rules = cssRules(PictureStudioBadgeList.styles);
    expect(rules[".scroll"]?.["max-height"]).toBe("var(--psc-items-max-height, 320px)");
    expect(rules[".scroll"]?.["overflow-y"]).toBe("auto");
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

  it("is undefined when every item is fine", () => {
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
});
