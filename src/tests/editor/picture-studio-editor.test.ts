import { afterEach, describe, expect, it, rstest } from "@rstest/core";
import {
  CARD_TYPE,
  EDITOR_TAG,
  HEADING_SECTION_TAG,
  LIST_TAG,
  type PictureStudioConfig,
  SECTION_TAG,
} from "../../config";
import { probeBadgeType, resetBadgeVerdicts } from "../../editor/badge-existence";
import { PictureStudioBadgeList } from "../../editor/badge-list";
import { PictureStudioHeadingSection } from "../../editor/heading-section";
import { PictureStudioEditor } from "../../editor/picture-studio-editor";
import { PictureStudioSection } from "../../editor/section-panel";
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
  } as unknown as import("../../config").PictureStudioConfig;

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
