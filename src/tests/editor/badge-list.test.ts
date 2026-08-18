import { afterEach, describe, expect, it } from "@rstest/core";
import { LIST_TAG, type PictureItem } from "../../config";
import { badgeCatalog } from "../../editor/badge-catalog";
import {
  addChoices,
  kindLabel,
  PictureStudioBadgeList,
  splitChoiceValue,
} from "../../editor/badge-list";

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
    expect(el.items.map((i) => (i.config as { entity: string }).entity)).toEqual([
      "light.0",
      "light.1",
      "light.2",
    ]);
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
    expect(header?.querySelector("h3")).not.toBeNull();
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
