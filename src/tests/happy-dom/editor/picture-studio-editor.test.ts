import { afterEach, describe, expect, it, rstest } from "@rstest/core";
import { registerCard } from "../../../broker";
import {
  CARD_TYPE,
  EDITOR_TAG,
  HEADING_SECTION_TAG,
  LIST_TAG,
  type PictureStudioConfig,
  SECTION_TAG,
} from "../../../config";
import { probeBadgeType, resetBadgeVerdicts } from "../../../editor/badge-existence";
import { PictureStudioBadgeList } from "../../../editor/badge-list";
import { PictureStudioHeadingSection } from "../../../editor/heading-section";
import { PictureStudioEditor } from "../../../editor/picture-studio-editor";
import { PictureStudioSection } from "../../../editor/section-panel";
import { cssRules } from "../card/harness";

if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, PictureStudioEditor);
if (!customElements.get(SECTION_TAG)) customElements.define(SECTION_TAG, PictureStudioSection);
if (!customElements.get(HEADING_SECTION_TAG))
  customElements.define(HEADING_SECTION_TAG, PictureStudioHeadingSection);
if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

const CONFIG = {
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } },
    { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
  ],
} as unknown as PictureStudioConfig;

/** Counts the calls happy-dom would otherwise swallow: it has no layout. */
const mount = async () => {
  const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
  el.setConfig(CONFIG);
  el.hass = { localize: () => "", states: {} } as never;
  document.body.append(el);
  await el.updateComplete;
  let scrolls = 0;
  el.scrollIntoView = () => {
    scrolls++;
  };
  return { el, calls: () => scrolls };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("a form opens at its own top", () => {
  it("scrolls when an item's form opens", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    expect(calls()).toBe(1);
  });

  it("scrolls again when a second item's form replaces the first", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    el.select(1);
    await el.updateComplete;
    expect(calls()).toBe(2);
  });

  it("does not scroll on a re-render of the form already open", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    // What a keystroke or a hass tick produces: an update that leaves the
    // selection alone. Scrolling here would fight the user's own scrolling.
    el.hass = { localize: () => "", states: {} } as never;
    await el.updateComplete;
    expect(calls()).toBe(1);
  });

  it("does not scroll on the way back to the list", async () => {
    const { el, calls } = await mount();
    el.select(0);
    await el.updateComplete;
    el.select(undefined);
    await el.updateComplete;
    expect(calls()).toBe(1);
  });
});

/**
 * Blink keeps the scroll position when content above the viewport is replaced —
 * that is CSS scroll anchoring, and WebKit does not implement it. Home Assistant
 * rebuilds the card element on every config change (measured), so on an iPhone a
 * drag that commits a position drops the user back at the top of the dialog.
 * These tests pin the hand-rolled equivalent.
 *
 * happy-dom has no layout, so a scroll container cannot be laid out — it is
 * declared: the overflow comes from the inline style, and the two heights that
 * make it scrollable are defined by hand. What is guarded here is therefore the
 * mechanism, not the pixels; only a real WebKit can answer for those.
 */
describe("a position commit must not move the view", () => {
  const mountInScroller = async () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    let height = 2000;
    Object.defineProperty(scroller, "scrollHeight", { get: () => height, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    let top = 0;
    Object.defineProperty(scroller, "scrollTop", {
      get: () => top,
      set: (v: number) => {
        top = v;
      },
      configurable: true,
    });
    document.body.append(scroller);

    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    scroller.append(el);
    await el.updateComplete;
    el.scrollIntoView = () => {};

    // The anchor is measured, so geometry has to be declared as well: `above`
    // is how far into the scrolled content the editor starts — in other words
    // the height of the preview sitting on top of it, which a rebuild may
    // change.
    let above = 800;
    const rect = (t: number) =>
      ({
        top: t,
        bottom: t,
        left: 0,
        right: 0,
        x: 0,
        y: t,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    scroller.getBoundingClientRect = () => rect(0);
    el.getBoundingClientRect = () => rect(above - top);

    return {
      el,
      at: () => top,
      put: (v: number) => {
        top = v;
      },
      grow: (by: number) => {
        above += by;
      },
      setHeight: (v: number) => {
        height = v;
      },
    };
  };

  /**
   * Long enough for the hold to run its course: the rebuild has to be seen and
   * the container's height has to stay put for STABLE_FRAMES on top of that.
   */
  const settle = async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
  };

  it("puts the scroll position back after the card is rebuilt", async () => {
    const { el, at, put } = await mountInScroller();
    el.select(0);
    await el.updateComplete;

    put(300); // where the user was reading
    el.patchPosition(0, { left: 30, top: 30 });
    put(0); // what WebKit does when the element above is replaced
    await settle();

    expect(at()).toBe(300);
  });

  it("leaves the view where the rebuild put it when the selection changed", async () => {
    // A selection change is *meant* to move the view — that is the existing
    // scrollIntoView, and holding the old position would fight it.
    const { el, at, put } = await mountInScroller();
    el.select(0);
    await el.updateComplete;

    put(300);
    el.patchPosition(0, { left: 30, top: 30 });
    el.select(1);
    put(0);
    await settle();

    expect(at()).toBe(0);
  });

  // A test for anchoring — restoring the framing rather than the offset — lived
  // here and was removed on 2026-08-22, not because the idea is wrong but
  // because measurement on a real iPhone showed it doing harm: the rebuild is
  // detected on the first frame, while the old card is gone and the new one has
  // not laid out, so the drift is nonsense. The drift is still reported by the
  // temporary trace; restore this test the day it is worth applying.

  it("is still holding when the rebuilt image moves the document a second time", async () => {
    // The reason the exit condition is not registration alone. The card
    // registers within a frame; its image lays out several frames later and
    // moves the document again, and *that* is when WebKit re-clamps. A hold
    // that let go at registration is no longer there to answer for it.
    const { el, at, put, setHeight } = await mountInScroller();
    el.select(0);
    await el.updateComplete;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const releaseOld = registerCard({ reanchor: () => undefined });
    put(300);
    el.patchPosition(0, { left: 30, top: 30 });
    releaseOld();
    const releaseNew = registerCard({ reanchor: () => undefined });

    // The document keeps moving while the new preview lays out...
    await frame();
    setHeight(1900);
    await frame();
    setHeight(1800);
    await frame();
    setHeight(1700);
    // ...and only then does the clamp land.
    await frame();
    put(0);
    await settle();

    expect(at()).toBe(300);
    releaseNew();
  });

  it("lets go once the rebuild has landed and the height has settled", async () => {
    // Two signals, not one. The broker says the card was replaced — Home
    // Assistant destroys the old element and creates a new one, so a different
    // instance registering *is* the rebuild. But registering is not laying out:
    // on a real iPhone the card registered within a frame, then its image moved
    // the document again, and a hold that had already let go left the reader
    // somewhere else. So the height has to stop moving too. After that the
    // position belongs to the user again.
    const { el, at, put } = await mountInScroller();
    el.select(0);
    await el.updateComplete;

    const releaseOld = registerCard({ reanchor: () => undefined });
    put(300);
    el.patchPosition(0, { left: 30, top: 30 });
    put(0);
    releaseOld();
    const releaseNew = registerCard({ reanchor: () => undefined });
    await settle();
    expect(at()).toBe(300);

    // The user scrolls afterwards, and is left alone.
    put(120);
    await settle();
    expect(at()).toBe(120);
    releaseNew();
  });

  it("holds the page itself, which scrolls without declaring an overflow", async () => {
    // On a phone the dialog is the page: measured on a real iPhone, the only
    // thing that scrolls is `html`, whose computed overflow-y is `visible`.
    // Requiring auto|scroll found nothing and the hold never ran.
    const root = document.scrollingElement as HTMLElement;
    Object.defineProperty(root, "scrollHeight", { value: 2447, configurable: true });
    Object.defineProperty(root, "clientHeight", { value: 874, configurable: true });
    let top = 0;
    Object.defineProperty(root, "scrollTop", {
      get: () => top,
      set: (v: number) => {
        top = v;
      },
      configurable: true,
    });

    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;
    el.scrollIntoView = () => {};
    // Geometry has to be declared here too: happy-dom lays nothing out, and the
    // anchor is measured. The editor starts 1200px into the document.
    const above = 1200;
    el.getBoundingClientRect = () =>
      ({
        top: above - top,
        bottom: above - top,
        left: 0,
        right: 0,
        x: 0,
        y: above - top,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    el.select(0);
    await el.updateComplete;

    top = 412;
    el.patchPosition(0, { left: 30, top: 30 });
    top = 0;
    await settle();

    expect(top).toBe(412);
  });

  it("commits without a scrollable ancestor just the same", async () => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;
    el.scrollIntoView = () => {};

    expect(() => el.patchPosition(0, { left: 30, top: 30 })).not.toThrow();
  });
});

describe("a missing badge refuses the form and does not scroll the editor", () => {
  const probeHelpers = {
    createBadgeElement: (c: { type?: string }) =>
      document.createElement(c.type === "entity" ? "hui-entity-badge" : "hui-error-badge"),
  };

  // Config: item 0 has a missing type, item 1 is valid.
  const CONFIG_WITH_MISSING = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entty" } },
      { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
    ],
  } as unknown as import("../../../config").PictureStudioConfig;

  const mountMissing = async () => {
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG_WITH_MISSING);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    // Settle the verdict directly so the routing guard sees "missing" before any
    // select() call, without relying on the badge-list child's render tick.
    await new Promise<void>((resolve) => probeBadgeType("entty", resolve));
    await el.updateComplete;

    let scrolls = 0;
    el.scrollIntoView = () => {
      scrolls++;
    };
    return { el, calls: () => scrolls };
  };

  afterEach(() => {
    document.body.replaceChildren();
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
  });

  it("renders the list, not a badge-form, for a badge whose verdict is missing", async () => {
    const { el } = await mountMissing();
    el.select(0); // select the missing badge
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("picture-studio-badge-form")).toBeNull();
    expect(el.shadowRoot?.querySelector("picture-studio-badge-list")).not.toBeNull();
  });

  it("does not scroll the editor when the form is refused", async () => {
    const { el, calls } = await mountMissing();
    el.select(0); // missing badge — form refused
    await el.updateComplete;
    expect(calls()).toBe(0);
  });

  it("still scrolls when a valid item's form opens", async () => {
    const { el, calls } = await mountMissing();
    el.select(1); // valid badge — form opens
    await el.updateComplete;
    expect(calls()).toBe(1);
  });
});

describe("_moveBadge remaps the selection through the move", () => {
  // Four items: array [missing, B, C, D].
  // Display order (top-down): [D, C, B, missing] — display index 3 = array index 0.
  // Using four items so display and array indices never coincide for the
  // selected item, which would mask a missing or inverted remap.
  const probeHelpers = {
    createBadgeElement: (c: { type?: string }) =>
      document.createElement(c.type === "entity" ? "hui-entity-badge" : "hui-error-badge"),
  };

  const CONFIG_4 = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entty" } },
      { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
      { type: "badge", position: { top: "30%", left: "30%" }, config: { type: "entity" } },
      { type: "badge", position: { top: "40%", left: "40%" }, config: { type: "entity" } },
    ],
  } as unknown as PictureStudioConfig;

  // Missing at index 2 so a selection at 2 keeps the list visible, while
  // array index 2 maps to display index _flip(2) = 1 — never coincident.
  const CONFIG_4B = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } },
      { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
      { type: "badge", position: { top: "30%", left: "30%" }, config: { type: "entty" } },
      { type: "badge", position: { top: "40%", left: "40%" }, config: { type: "entity" } },
    ],
  } as unknown as PictureStudioConfig;

  /** Mount with CONFIG_4, settle the verdict, select item 0, return the editor. */
  const mountSelected = async (): Promise<PictureStudioEditor> => {
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG_4);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await new Promise<void>((resolve) => probeBadgeType("entty", resolve));
    await el.updateComplete;
    el.select(0); // broken item — form refused, list stays in DOM
    await el.updateComplete;
    return el;
  };

  /** Mount with CONFIG_4B (missing at index 2), select item 2. */
  const mountSelected2 = async (): Promise<PictureStudioEditor> => {
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG_4B);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await new Promise<void>((resolve) => probeBadgeType("entty", resolve));
    await el.updateComplete;
    el.select(2); // broken item at index 2 — form refused, list stays in DOM
    await el.updateComplete;
    return el;
  };

  /** Fire item-moved from the badge-list so _moveBadge is invoked. */
  const move = (el: PictureStudioEditor, from: number, to: number): void => {
    const list = el.shadowRoot?.querySelector("picture-studio-badge-list");
    list?.dispatchEvent(
      new CustomEvent("item-moved", {
        detail: { oldIndex: from, newIndex: to },
        bubbles: true,
        composed: true,
      }),
    );
  };

  afterEach(() => {
    document.body.replaceChildren();
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
  });

  it("the selected item follows when it is the moved one", async () => {
    // sel=0, move 0→2: selected item travels with it.
    const el = await mountSelected();
    move(el, 0, 2);
    expect(el.selectedIndex()).toBe(2);
  });

  it("shifts the selection down when the moved item passes over it from below", async () => {
    // sel=0, move 3→0: from < to does not apply here; to <= sel < from → sel+1.
    // Array [missing,B,C,D] → [D,missing,B,C]. missing shifts from index 0 to 1.
    const el = await mountSelected();
    move(el, 3, 0);
    expect(el.selectedIndex()).toBe(1);
  });

  it("leaves the selection unchanged when the moved item is outside its range", async () => {
    // sel=0, move 2→3: the moved item is entirely above the selected item.
    // Array [missing,B,C,D] → [missing,B,D,C]. missing stays at 0.
    const el = await mountSelected();
    move(el, 2, 3);
    expect(el.selectedIndex()).toBe(0);
  });

  it("shifts the selection up when the moved item passes over it from above", async () => {
    // Uses CONFIG_4B: array [A,B,missing,D], sel=2 (missing, display index 1).
    // Move from=0 to=3: from < sel && sel <= to → 0 < 2 && 2 <= 3 → sel-1=1.
    // Array becomes [B,missing,D,A]; missing lands at index 1 ✓.
    // Display index: sel=1 maps to _flip(1)=2, not equal to array index 1 —
    // fixture is discriminating even with sel at a middle position.
    const el = await mountSelected2();
    move(el, 0, 3);
    expect(el.selectedIndex()).toBe(1);
  });
});

const mountEditor = async (config: unknown): Promise<PictureStudioEditor> => {
  const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
  el.setConfig(config as PictureStudioConfig);
  el.hass = {
    localize: (key: string) =>
      key === "ui.panel.lovelace.editor.card.heading.name" ? "Heading" : "",
    states: {},
  } as never;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

describe("the five sections", () => {
  it("renders them in order, Background open", async () => {
    const el = await mountEditor({ type: CARD_TYPE, items: [] });
    const labels = [...(el.shadowRoot?.querySelectorAll("picture-studio-section") ?? [])].map(
      (s) => (s as unknown as { label: string }).label,
    );
    expect(labels).toEqual(["Background", "Items", "Heading", "Filters", "Entity"]);
    const first = el.shadowRoot?.querySelector("picture-studio-section") as unknown as {
      open: boolean;
    };
    expect(first.open).toBe(true);
  });

  it("gives each ha-form only its own section's data", async () => {
    const el = await mountEditor({
      type: CARD_TYPE,
      items: [],
      filter: "brightness(0.9)",
      entity: "light.salon",
    });
    const forms = [...(el.shadowRoot?.querySelectorAll("ha-form") ?? [])].map(
      (f) => (f as unknown as { data: Record<string, unknown> }).data,
    );
    expect(forms.some((d) => "filter" in d && !("entity" in d))).toBe(true);
    expect(forms.some((d) => "entity" in d && !("filter" in d))).toBe(true);
  });

  it("commits a heading change from the Heading section", async () => {
    const el = await mountEditor({ type: CARD_TYPE, items: [] });
    const emitted: Record<string, unknown>[] = [];
    el.addEventListener("config-changed", (ev) => emitted.push((ev as CustomEvent).detail.config));
    el.shadowRoot?.querySelector("picture-studio-heading-section")?.dispatchEvent(
      new CustomEvent("heading-changed", {
        detail: { heading: { title: "Office" } },
        bubbles: true,
        composed: true,
      }),
    );
    expect(emitted.at(-1)?.heading).toEqual({ title: "Office" });
  });

  it("shows the strongest severity in the Items header, and nothing when all is well", async () => {
    const ok = await mountEditor({
      type: CARD_TYPE,
      items: [{ type: "badge", config: { type: "entity", entity: "sensor.a" }, position: {} }],
    });
    expect(ok.shadowRoot?.querySelector(".severity")).toBeNull();

    const bad = await mountEditor({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: { type: "state-label", entity: "sensor.a", show: [] },
          position: {},
        },
        { type: "nope" },
      ],
    });
    const glyph = bad.shadowRoot?.querySelector(".severity");
    expect(glyph?.classList.contains("error")).toBe(true);
    expect(glyph?.getAttribute("slot")).toBe("event");
  });

  it("renders the severity glyph before the count pill in the Items header", async () => {
    // Both adornments present: 2 items with an error-severity config.
    const el = await mountEditor({
      type: CARD_TYPE,
      items: [
        {
          type: "element",
          config: { type: "state-label", entity: "sensor.a", show: [] },
          position: {},
        },
        { type: "nope" },
      ],
    });
    const slotted = [...(el.shadowRoot?.querySelectorAll('#items-section > [slot="event"]') ?? [])];
    expect(slotted).toHaveLength(2);
    // Glyph first: sits nearest the title.
    expect(slotted[0]?.tagName.toLowerCase()).toBe("ha-icon");
    // Count second: the pill follows at the wider gap.
    expect(slotted[1]?.classList.contains("count")).toBe(true);
  });

  it("does not write an empty heading back", async () => {
    const el = await mountEditor({ type: CARD_TYPE, heading: { title: "Office" }, items: [] });
    const emitted: Record<string, unknown>[] = [];
    el.addEventListener("config-changed", (ev) => emitted.push((ev as CustomEvent).detail.config));
    el.shadowRoot?.querySelector("picture-studio-heading-section")?.dispatchEvent(
      new CustomEvent("heading-changed", {
        detail: { heading: {} },
        bubbles: true,
        composed: true,
      }),
    );
    expect("heading" in (emitted.at(-1) ?? {})).toBe(false);
  });
});

describe("CSS rules", () => {
  it(":host is a flex column", () => {
    const rules = cssRules(PictureStudioEditor.styles);
    expect(rules.get(":host")).toContain("flex-direction: column");
  });

  it(":host has a gap between sections", () => {
    const rules = cssRules(PictureStudioEditor.styles);
    expect(rules.get(":host")).toContain("gap: var(--ha-space-4)");
  });

  it("count pill rule comes from the shared header-adornments module", () => {
    // styles is an array; cssRules must receive the whole array, not one entry.
    const rule = cssRules(PictureStudioEditor.styles).get(".count");
    expect(rule).toBeDefined();
    expect(rule).toContain("var(--ha-border-radius-pill");
    // Light pill mixed from the header's own colour; --primary-text-color keeps text
    // readable in both light and dark themes.
    expect(rule).toContain("var(--ha-color-fill-neutral-normal-resting)");
    expect(rule).toContain(
      "color-mix(in srgb, var(--input-fill-color) 88%, var(--primary-text-color) 12%)",
    );
    expect(rule).toContain("var(--primary-text-color)");
  });
});

describe("_showListAt scroll timing", () => {
  // EXPAND_MS = 300 — mirrors the module constant; kept in sync by the comment
  // on the constant itself (the scroll landing early or late would be visible).
  const EXPAND_MS = 300;

  afterEach(() => {
    document.body.replaceChildren();
    rstest.useRealTimers();
  });

  it("scrolls immediately when expand() returns false (section already open)", async () => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    const section = el.shadowRoot?.querySelector("#items-section") as PictureStudioSection;
    const list = el.shadowRoot?.querySelector(
      "picture-studio-badge-list",
    ) as PictureStudioBadgeList;
    rstest.spyOn(section, "expand").mockResolvedValue(false); // already open: nothing will animate
    const scrollSpy = rstest.spyOn(list, "scrollToItem");

    rstest.useFakeTimers();
    el.select(1);
    await el.updateComplete;
    el.select(undefined); // return from form → _showListAt(1), opened=false
    await el.updateComplete;

    // No timer advance needed — scroll must have happened immediately.
    expect(scrollSpy).toHaveBeenCalledWith(1);
  });

  it("waits EXPAND_MS before scrolling when a transition started and interpolate-size is supported", async () => {
    // CSS.supports("interpolate-size", "allow-keywords") returns true natively
    // in happy-dom — no mocking needed for the supported branch.
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    const section = el.shadowRoot?.querySelector("#items-section") as PictureStudioSection;
    const list = el.shadowRoot?.querySelector(
      "picture-studio-badge-list",
    ) as PictureStudioBadgeList;
    rstest.spyOn(section, "expand").mockResolvedValue(true); // transition started
    const scrollSpy = rstest.spyOn(list, "scrollToItem");

    rstest.useFakeTimers();
    el.select(1);
    await el.updateComplete;
    el.select(undefined); // return from form → _showListAt(1), opened=true
    await el.updateComplete;

    // Scroll must not have happened yet — the timer is still pending.
    expect(scrollSpy).not.toHaveBeenCalled();

    rstest.advanceTimersByTime(EXPAND_MS);
    await Promise.resolve(); // flush the microtask that resumes _showListAt after the timer

    expect(scrollSpy).toHaveBeenCalledWith(1);
  });

  it("scrolls immediately when interpolate-size is not supported, even though a transition started", async () => {
    // Replace CSS globally so the defensive feature test sees a browser without
    // the property. rstest.spyOn(CSS, "supports") does not intercept calls in
    // this environment — the spy's mockReturnValue is ignored and the native
    // implementation runs regardless. Replacing globalThis.CSS is the only
    // reliable way to drive this branch here.
    const cssGlobal = globalThis as Record<string, unknown>;
    const savedCSS = cssGlobal.CSS;
    cssGlobal.CSS = { supports: () => false };

    try {
      const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
      el.setConfig(CONFIG);
      el.hass = { localize: () => "", states: {} } as never;
      document.body.append(el);
      await el.updateComplete;

      const section = el.shadowRoot?.querySelector("#items-section") as PictureStudioSection;
      const list = el.shadowRoot?.querySelector(
        "picture-studio-badge-list",
      ) as PictureStudioBadgeList;
      rstest.spyOn(section, "expand").mockResolvedValue(true); // transition started
      const scrollSpy = rstest.spyOn(list, "scrollToItem");

      rstest.useFakeTimers();
      el.select(1);
      await el.updateComplete;
      el.select(undefined); // return from form → _showListAt(1), opened=true but no CSS support
      await el.updateComplete;

      // No timer advance needed — without interpolate-size support there is no
      // animation and the scroll must happen immediately.
      expect(scrollSpy).toHaveBeenCalledWith(1);
    } finally {
      cssGlobal.CSS = savedCSS;
    }
  });
});

describe("Items section follows the work", () => {
  // loadCardHelpers stub needed for badge probe machinery.
  const probeHelpers = {
    createBadgeElement: (c: { type?: string }) =>
      document.createElement(c.type === "entity" ? "hui-entity-badge" : "hui-error-badge"),
  };

  // Config with item 0 missing (bad type) so selecting it opens no form.
  const CONFIG_MISSING = {
    type: CARD_TYPE,
    image: "/local/plan.png",
    items: [
      { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entty" } },
      { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
    ],
  } as unknown as PictureStudioConfig;

  afterEach(() => {
    document.body.replaceChildren();
    resetBadgeVerdicts();
    rstest.useRealTimers();
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
  });

  it("expands the Items section and scrolls to the row when selecting an item that opens no form", async () => {
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG_MISSING);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    // Settle the verdict before selecting so _formTarget() sees "missing".
    await new Promise<void>((resolve) => probeBadgeType("entty", resolve));
    await el.updateComplete;

    const section = el.shadowRoot?.querySelector("#items-section") as PictureStudioSection;
    const list = el.shadowRoot?.querySelector(
      "picture-studio-badge-list",
    ) as PictureStudioBadgeList;
    const expandSpy = rstest.spyOn(section, "expand");
    const scrollSpy = rstest.spyOn(list, "scrollToItem");

    rstest.useFakeTimers();
    el.select(0); // missing badge — no form opens
    await el.updateComplete;

    expect(expandSpy).toHaveBeenCalledTimes(1);
    // expand() opened the section (returned true) and CSS.supports("interpolate-size",
    // "allow-keywords") is true in happy-dom, so _showListAt is waiting out the
    // 300 ms transition. Advance the fake clock and flush the microtask.
    rstest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(scrollSpy).toHaveBeenCalledWith(0);
  });

  // Failure text recorded against the defect (run before the fix):
  // "expected 'expand' to be called 1 times, but got 0 times"
  // _formTarget() was checking badgeVerdict === "missing" only. state-label is
  // statically refused (badgeIsBroken via !isSupportedBadgeType) and never
  // probed, so its verdict stays "unknown" and the guard missed it. The form
  // opened. Now badgeIsBroken() covers both conditions.
  it("refuses a form for an unsupported native badge type (state-label) without awaiting a probe", async () => {
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
      probeHelpers;
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
      ],
    } as unknown as PictureStudioConfig);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    const section = el.shadowRoot?.querySelector("#items-section") as PictureStudioSection;
    const list = el.shadowRoot?.querySelector(
      "picture-studio-badge-list",
    ) as PictureStudioBadgeList;
    const expandSpy = rstest.spyOn(section, "expand");
    const scrollSpy = rstest.spyOn(list, "scrollToItem");

    rstest.useFakeTimers();
    el.select(0); // state-label badge — should refuse form immediately (no probe needed)
    await el.updateComplete;

    expect(expandSpy).toHaveBeenCalledTimes(1);
    rstest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(scrollSpy).toHaveBeenCalledWith(0);
  });

  it("expands the Items section and scrolls to the previously-edited row when returning from a form", async () => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG); // two valid badges at indices 0 and 1
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    const section = el.shadowRoot?.querySelector("#items-section") as PictureStudioSection;
    const list = el.shadowRoot?.querySelector(
      "picture-studio-badge-list",
    ) as PictureStudioBadgeList;
    const expandSpy = rstest.spyOn(section, "expand");
    const scrollSpy = rstest.spyOn(list, "scrollToItem");

    el.select(1); // valid badge — form opens, sections cached
    await el.updateComplete;

    rstest.useFakeTimers();
    el.select(undefined); // go back — sections restored, _showListAt(1) fires
    await el.updateComplete;

    expect(expandSpy).toHaveBeenCalledTimes(1);
    // expand() opened the section (returned true) — advance the fake clock and flush.
    rstest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(scrollSpy).toHaveBeenCalledWith(1); // previous index was 1
  });
});

describe("folding the Items section clears the selection", () => {
  // An item of type "unknown" keeps _formTarget() falsy, so the list view
  // (sections) stays rendered and the items section is in the DOM throughout.
  const CONFIG_UNKNOWN_ITEM = {
    type: CARD_TYPE,
    image: "/local/plan.png",
    items: [{ type: "unknown", position: { top: "10%", left: "10%" } }],
  } as unknown as PictureStudioConfig;

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("clears the selection when the Items section is collapsed", async () => {
    const el = await mountEditor(CONFIG_UNKNOWN_ITEM);
    el.select(0);
    await el.updateComplete;
    expect(el.selectedIndex()).toBe(0);

    const section = el.shadowRoot?.querySelector("#items-section");
    section?.dispatchEvent(
      new CustomEvent("expanded-changed", {
        detail: { expanded: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el.selectedIndex()).toBeUndefined();
  });

  it("does not clear the selection when the Items section is opened", async () => {
    // Guard test: an implementation that deselects on every expanded-changed
    // would pass the test above but break the feature — our own expand() fires
    // this event, and deselecting on true would undo the selection that triggered
    // the expand.
    const el = await mountEditor(CONFIG_UNKNOWN_ITEM);
    el.select(0);
    await el.updateComplete;
    expect(el.selectedIndex()).toBe(0);

    const section = el.shadowRoot?.querySelector("#items-section");
    section?.dispatchEvent(
      new CustomEvent("expanded-changed", {
        detail: { expanded: true },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el.selectedIndex()).toBe(0);
  });

  it("does not clear the selection when a different section (Background) is collapsed", async () => {
    // Verifies the listener is scoped to the Items section, not the editor host.
    const el = await mountEditor(CONFIG_UNKNOWN_ITEM);
    el.select(0);
    await el.updateComplete;
    expect(el.selectedIndex()).toBe(0);

    // Background section — first picture-studio-section in the render, before the Items one.
    const section = el.shadowRoot?.querySelectorAll("picture-studio-section")[0];
    section?.dispatchEvent(
      new CustomEvent("expanded-changed", {
        detail: { expanded: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el.selectedIndex()).toBe(0);
  });
});

/**
 * Adding a badge suspends: its stub comes from the badge's own class, which for
 * a native type has to be loaded first. Anything the user does in that window —
 * a drag landing, a delete, a second Add — has already written a new config by
 * the time the stub arrives.
 */
describe("adding a badge does not undo what landed while its stub loaded", () => {
  afterEach(() => {
    document.body.replaceChildren();
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
  });

  /**
   * Holds `loadCardHelpers` open so the test decides when `_addItem` resumes.
   * The helpers answer with an error badge, which is what ends `resolveBadgeClass`
   * right there — one suspension point to control, not three.
   */
  const gateHelpers = (): (() => void) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    window.loadCardHelpers = (async () => {
      await gate;
      return { createBadgeElement: () => document.createElement("hui-error-badge") };
    }) as never;
    return release;
  };

  it("commits against the config current at resume, not the one captured before", async () => {
    const release = gateHelpers();
    const { el } = await mount();

    const commits: PictureStudioConfig[] = [];
    el.addEventListener("config-changed", (ev) => {
      commits.push((ev as CustomEvent<{ config: PictureStudioConfig }>).detail.config);
    });

    el.shadowRoot
      ?.querySelector(LIST_TAG)
      ?.dispatchEvent(new CustomEvent("item-add", { detail: { family: "badge", type: "entity" } }));

    // Home Assistant pushes a third item down while the stub is still loading:
    // the shape a drag commit or a second editor write leaves behind.
    el.setConfig({
      ...CONFIG,
      items: [
        ...CONFIG.items,
        { type: "badge", position: { top: "30%", left: "30%" }, config: { type: "entity" } },
      ],
    } as unknown as PictureStudioConfig);

    release();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Four, not three: the item added on top of what was there at resume. Three
    // would mean the pre-await snapshot won and the third item was dropped.
    expect(commits).toHaveLength(1);
    expect(commits[0]?.items).toHaveLength(4);
  });
});
