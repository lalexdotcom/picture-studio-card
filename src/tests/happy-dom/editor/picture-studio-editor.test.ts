import { afterEach, describe, expect, it, rstest } from "@rstest/core";
import { registerCard } from "../../../broker";
import {
  CARD_TYPE,
  EDITOR_TAG,
  type ElementItem,
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

const mount = async () => {
  const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
  el.setConfig(CONFIG);
  el.hass = { localize: () => "", states: {} } as never;
  document.body.append(el);
  await el.updateComplete;
  return { el };
};

afterEach(() => {
  document.body.replaceChildren();
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
  const rect = (top: number, height: number): DOMRect =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 0,
      x: 0,
      y: top,
      width: 0,
      height,
      toJSON: () => ({}),
    }) as DOMRect;

  /**
   * The phone: an inert `.element-editor` inside a dialog box that scrolls.
   * `previewTop` is where the preview sits in the scrolled content — the anchor
   * the hold preserves. `present` is what the rebuild takes away: while Home
   * Assistant destroys the card and builds another, no preview is registered
   * and there is nothing to measure. That absence *is* the signal.
   */
  const mountInScroller = async () => {
    const dialog = document.createElement("div");
    dialog.style.overflowY = "auto";
    let height = 2000;
    Object.defineProperty(dialog, "scrollHeight", { get: () => height, configurable: true });
    Object.defineProperty(dialog, "clientHeight", { value: 400, configurable: true });
    let top = 0;
    Object.defineProperty(dialog, "scrollTop", {
      get: () => top,
      set: (v: number) => {
        top = v;
      },
      configurable: true,
    });
    dialog.getBoundingClientRect = () => rect(0, 400);

    const form = document.createElement("div");
    form.style.overflowY = "auto";
    Object.defineProperty(form, "scrollHeight", { value: 549, configurable: true });
    Object.defineProperty(form, "clientHeight", { value: 549, configurable: true });
    Object.defineProperty(form, "scrollTop", {
      get: () => 0,
      set: () => {},
      configurable: true,
    });
    form.getBoundingClientRect = () => rect(0, 549);
    dialog.append(form);
    document.body.append(dialog);

    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    form.append(el);
    await el.updateComplete;
    el.getBoundingClientRect = () => rect(0, 600);

    // The preview sits 1400px into the scrolled content, below the editor.
    let previewTop = 1400;
    let present = true;
    const channel = {
      reanchor: () => undefined,
      viewportTop: () => (present ? previewTop - top : undefined),
      measureImageHeight: () => undefined,
    };
    let release = registerCard(channel);

    return {
      el,
      at: () => top,
      put: (v: number) => {
        top = v;
      },
      grow: (by: number) => {
        previewTop += by;
      },
      setHeight: (v: number) => {
        height = v;
      },
      /** What Home Assistant does on every commit: destroy, then rebuild. */
      rebuild: () => {
        release();
        present = false;
        return () => {
          present = true;
          release = registerCard({ ...channel });
        };
      },
      cleanup: () => release(),
    };
  };

  const settle = async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
  };

  afterEach(() => document.body.replaceChildren());

  it("puts the scroll position back after the card is rebuilt", async () => {
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300); // where the user was reading
    h.el.patchPosition(0, { left: 30, top: 30 });
    const done = h.rebuild();
    h.put(0); // what WebKit does when the element above is replaced
    done();
    await settle();

    expect(h.at()).toBe(300);
    h.cleanup();
  });

  it("holds the absolute position while the preview cannot be measured", async () => {
    // The anchor is the preview, and it does not exist during the rebuild. An
    // earlier attempt anchored on the *editor*, which still exists then, so it
    // yielded a number — a wrong one, +838px, landing the reader at 995 instead
    // of 157. While the anchor cannot be measured, hold the absolute value.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.patchPosition(0, { left: 30, top: 30 });
    h.rebuild(); // and never finish it
    h.put(0);
    await settle();

    expect(h.at()).toBe(300);
    h.cleanup();
  });

  it("corrects by the delta once the preview can be measured again", async () => {
    // A drag is the zero-delta case of one mechanism, not a case of its own.
    // Here the content above the preview genuinely grew, so keeping the same
    // scrollTop would NOT keep the same framing: the preview would be pushed
    // 200px down the screen. What is preserved is the preview's position on
    // screen, so scrollTop has to move to compensate.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.patchPosition(0, { left: 30, top: 30 });
    const done = h.rebuild();
    h.put(0);
    h.grow(200); // the form above the preview came back 200px taller
    done();
    await settle();

    expect(h.at()).toBe(500);
    h.cleanup();
  });

  it("holds the picture in place when an item is selected on it", async () => {
    // No commit, no rebuild — the form is simply replaced by a taller one. The
    // termination condition cannot wait for a rebuild that never comes.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.select(1, "picture");
    h.grow(160); // the incoming form is 160px taller than the outgoing one
    await h.el.updateComplete;
    await settle();

    expect(h.at()).toBe(460);
    h.cleanup();
  });

  it("keeps holding when a deletion clears the selection under it", async () => {
    // Deleting an item commits *and* clears the selection, both from the list.
    // The origin is therefore `list` — but no form opens, so this is not the
    // trigger the hold stands aside for. Letting go here would abandon it in the
    // middle of the rebuild it exists to survive. And the list loses a row, so
    // an unchanged scrollTop would let the picture ride up by that row's
    // height: held, not merely untouched.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.patchPosition(0, { left: 30, top: 30 }); // stands in for the removal's commit
    const done = h.rebuild();
    h.el.select(undefined, "list");
    h.put(0);
    h.grow(-48); // one list row gone: the picture would ride up by 48
    done();
    await settle();

    expect(h.at()).toBe(252);
    h.cleanup();
  });

  it("keeps holding when a drag selects the item it just moved", async () => {
    // `drag-layer` fires `onCommit` and then `onSelect(hit.index)`, so dragging
    // an item that was NOT already selected changes the selection right after
    // the commit. On a picture origin, and no form the reader asked for — so the
    // hold started by the commit sees the gesture through, and the second one
    // `select` would otherwise start never happens.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.patchPosition(1, { left: 30, top: 30 }); // onCommit
    const done = h.rebuild();
    h.el.select(1, "picture"); // onSelect, same gesture
    h.put(0);
    done();
    await settle();

    expect(h.at()).toBe(300);
    h.cleanup();
  });

  it("stands aside for a form the reader asked for", async () => {
    // The other half of the same rule, and the one that was already true: a row
    // clicked in the list is *meant* to move the view, and `updated` is about to
    // take it to the form's top. Holding would fight it.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.patchPosition(0, { left: 30, top: 30 });
    h.el.select(1, "list"); // a second item's form opens
    h.put(0);
    await settle();

    expect(h.at()).toBe(0);
    h.cleanup();
  });

  it("is still holding when the rebuilt image moves the document a second time", async () => {
    // The reason the exit condition is not registration alone. The card
    // registers within a frame; its image lays out several frames later and
    // moves the document again, and *that* is when WebKit re-clamps.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    h.put(300);
    h.el.patchPosition(0, { left: 30, top: 30 });
    const done = h.rebuild();
    done();

    await frame();
    h.setHeight(1900);
    await frame();
    h.setHeight(1800);
    await frame();
    h.setHeight(1700);
    await frame();
    h.put(0);
    await settle();

    expect(h.at()).toBe(300);
    h.cleanup();
  });

  it("lets go once the rebuild has landed and the height has settled", async () => {
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    h.put(300);
    h.el.patchPosition(0, { left: 30, top: 30 });
    const done = h.rebuild();
    h.put(0);
    done();
    await settle();
    expect(h.at()).toBe(300);

    // The user scrolls afterwards, and is left alone.
    h.put(120);
    await settle();
    expect(h.at()).toBe(120);
    h.cleanup();
  });

  it("commits without a scrollable ancestor just the same", async () => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    expect(() => el.patchPosition(0, { left: 30, top: 30 })).not.toThrow();
  });

  it("reserves the outgoing form's height while the next one renders", async () => {
    // Without it the browser clamps the scroll before anything can be corrected
    // and the correction then has nothing left to restore. Symmetric with the
    // card's own reservation of the outgoing preview's height.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;
    // Outer box, margins included: `offsetHeight` counts padding and borders and
    // NOT margins, and reserving that much left the successor short by exactly
    // the missing gap — measured, 26px, which the layout reclaimed a frame later.
    h.el.getBoundingClientRect = () => rect(0, 600);
    const realComputed = window.getComputedStyle;
    window.getComputedStyle = ((node: Element) =>
      node === h.el
        ? ({ marginTop: "13px", marginBottom: "13px", overflowY: "visible" } as CSSStyleDeclaration)
        : realComputed(node)) as typeof window.getComputedStyle;

    try {
      h.el.select(1, "picture");
      expect(h.el.style.minHeight).toBe("626px");

      await settle();
      // And it lets go: pinning a genuinely different height would be visible.
      expect(h.el.style.minHeight).toBe("");
    } finally {
      window.getComputedStyle = realComputed;
      h.cleanup();
    }
  });

  it("a second hold's reservation is not released when the first ends", async () => {
    // `_commit` fires on every field change, so two commits within HOLD_MAX_FRAMES
    // is ordinary. When hold B starts while hold A is still running, B overwrites
    // `_holdRelease`. Without the identity check, A's release sets `_holdRelease`
    // to undefined — unregistering B — and strips the min-height B still needs.
    const h = await mountInScroller();
    h.el.select(0, "list");
    await h.el.updateComplete;

    const realComputed = window.getComputedStyle;
    window.getComputedStyle = ((node: Element) =>
      node === h.el
        ? ({ marginTop: "0px", marginBottom: "0px", overflowY: "visible" } as CSSStyleDeclaration)
        : realComputed(node)) as typeof window.getComputedStyle;

    try {
      // Hold A starts. mountInScroller already sets getBoundingClientRect to rect(0, 600).
      h.el.patchPosition(0, { left: 10, top: 10 });
      type Internal = { _holdRelease: (() => void) | undefined };
      const releaseA = (h.el as unknown as Internal)._holdRelease;
      if (!releaseA) throw new Error("hold A must have started");

      // Hold B starts over A — _holdRelease is now B's.
      h.el.patchPosition(0, { left: 20, top: 20 });
      expect(h.el.style.minHeight).toBe("600px");

      // A ends. Without the fix: _holdRelease is undefined and min-height is cleared.
      releaseA();
      expect(h.el.style.minHeight).toBe("600px"); // B's reservation survives
      expect((h.el as unknown as Internal)._holdRelease).toBeDefined(); // B still registered
    } finally {
      window.getComputedStyle = realComputed;
      await settle();
      h.cleanup();
    }
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

    return { el };
  };

  afterEach(() => {
    document.body.replaceChildren();
    resetBadgeVerdicts();
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
  });

  it("renders the list, not a badge-form, for a badge whose verdict is missing", async () => {
    const { el } = await mountMissing();
    el.select(0, "list"); // select the missing badge
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("picture-studio-badge-form")).toBeNull();
    expect(el.shadowRoot?.querySelector("picture-studio-badge-list")).not.toBeNull();
  });

  it("does not move either container when the form is refused", async () => {
    const { el } = await mountMissing();
    // The editor has no scrollable ancestor here, so the only thing to prove is
    // that the refused form takes the list path rather than the form path.
    el.select(0, "list");
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("picture-studio-badge-form")).toBeNull();
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
    el.select(0, "list"); // broken item — form refused, list stays in DOM
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
    el.select(2, "list"); // broken item at index 2 — form refused, list stays in DOM
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

describe("the active tool", () => {
  it("round-trips through setTool / tool()", async () => {
    const editor = await mountEditor(CONFIG);
    editor.select(0, "list");
    expect(editor.tool()).toBe("resize");
    editor.setTool("distort");
    expect(editor.tool()).toBe("distort");
  });

  it("resets to resize when the selection moves to a different index", async () => {
    const editor = await mountEditor(CONFIG);
    editor.select(0, "list");
    editor.setTool("distort");
    editor.select(1, "list");
    expect(editor.tool()).toBe("resize");
  });

  it("does not reset when select() is called with the already-selected index", async () => {
    // drag-layer calls onSelect(hit.index) at the end of every gesture,
    // including one that merely moved the already-selected item. The reset
    // must sit after the early-return guard, or every drag silently clears
    // the active tool.
    const editor = await mountEditor(CONFIG);
    editor.select(0, "list");
    editor.setTool("distort");
    editor.select(0, "picture");
    expect(editor.tool()).toBe("distort");
  });
});

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
    const scrollSpy = rstest.spyOn(list, "rowFor");

    rstest.useFakeTimers();
    el.select(1, "list");
    await el.updateComplete;
    el.select(undefined, "list"); // return from form → _showListAt(1), opened=false
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
    const scrollSpy = rstest.spyOn(list, "rowFor");

    rstest.useFakeTimers();
    el.select(1, "list");
    await el.updateComplete;
    el.select(undefined, "list"); // return from form → _showListAt(1), opened=true
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
      const scrollSpy = rstest.spyOn(list, "rowFor");

      rstest.useFakeTimers();
      el.select(1, "list");
      await el.updateComplete;
      el.select(undefined, "list"); // return from form → _showListAt(1), opened=true but no CSS support
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
    const scrollSpy = rstest.spyOn(list, "rowFor");

    rstest.useFakeTimers();
    el.select(0, "list"); // missing badge — no form opens
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
    const scrollSpy = rstest.spyOn(list, "rowFor");

    rstest.useFakeTimers();
    el.select(0, "list"); // state-label badge — should refuse form immediately (no probe needed)
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
    const scrollSpy = rstest.spyOn(list, "rowFor");

    el.select(1, "list"); // valid badge — form opens, sections cached
    await el.updateComplete;

    rstest.useFakeTimers();
    el.select(undefined, "list"); // go back — sections restored, _showListAt(1) fires
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
    el.select(0, "list");
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
    el.select(0, "list");
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
    el.select(0, "list");
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

describe("the selection carries its origin", () => {
  it("records the origin the caller declared", async () => {
    // The distinction is already material at the source: the card reaches the
    // editor through the broker, the list through a DOM event. Declaring it
    // beats inferring it, and Task 4 turns it into two different scrolls.
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    el.select(0, "picture");
    expect((el as unknown as { _selectOrigin: string })._selectOrigin).toBe("picture");
    el.select(1, "list");
    expect((el as unknown as { _selectOrigin: string })._selectOrigin).toBe("list");
  });

  it("leaves the origin alone when the selection did not change", async () => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    document.body.append(el);
    await el.updateComplete;

    el.select(0, "picture");
    el.select(0, "list"); // same index — an early return, nothing to re-decide
    expect((el as unknown as { _selectOrigin: string })._selectOrigin).toBe("picture");
  });
});

describe("which container moves, and on which trigger", () => {
  /**
   * The real dialog below 1000px: an inert `.element-editor` (declares
   * overflow-y:auto, never overflows) inside a dialog box that actually
   * scrolls. Above 1000px the inner one overflows instead and the outer does
   * not — the second mount below.
   */
  const rect = (top: number, height: number): DOMRect =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 0,
      x: 0,
      y: top,
      width: 0,
      height,
      toJSON: () => ({}),
    }) as DOMRect;

  const box = (content: number, client: number): HTMLElement => {
    const el = document.createElement("div");
    el.style.overflowY = "auto";
    Object.defineProperty(el, "scrollHeight", { value: content, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: client, configurable: true });
    let top = 0;
    Object.defineProperty(el, "scrollTop", {
      get: () => top,
      set: (v: number) => {
        top = v;
      },
      configurable: true,
    });
    el.getBoundingClientRect = () => rect(0, client);
    return el;
  };

  /** `phone` → the dialog scrolls; otherwise the form's own container does. */
  const mountTwoContainers = async (phone: boolean) => {
    const dialog = box(phone ? 2000 : 400, 400);
    const form = box(phone ? 549 : 1000, 549);
    dialog.append(form);
    document.body.append(dialog);

    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(CONFIG);
    el.hass = { localize: () => "", states: {} } as never;
    form.append(el);
    await el.updateComplete;
    // The editor starts 800px into whatever scrolls it.
    el.getBoundingClientRect = () => rect(800, 600);
    // `_showListAt` waits out EXPAND_MS only when expand() actually opened
    // something. happy-dom's CSS.supports answers true to everything, so an
    // unstubbed expand() here would arm a real 300ms timer that this file's
    // `listSettled()` cannot cover. The section's state is not what these
    // tests are about — which container gets written is.
    const section = el.shadowRoot?.querySelector("#items-section") as
      | (HTMLElement & { expand(): Promise<boolean> })
      | null;
    if (section) section.expand = async () => false;
    return { el, dialog, form };
  };

  afterEach(() => document.body.replaceChildren());

  it("takes both containers to the start when the form opens from the list", async () => {
    // Only one of them is real at a time, so writing both always yields exactly
    // one visible effect and the code never has to know which mode it is in.
    const { el, dialog, form } = await mountTwoContainers(true);
    el.select(0, "list");
    await el.updateComplete;
    expect(dialog.scrollTop).toBe(800);
    expect(form.scrollTop).toBe(800);
  });

  it("leaves the dialog alone when the form opens from the picture", async () => {
    // The whole point: the picture must not be thrown off the screen. The form's
    // container is still taken to the start, unconditionally — below 1000px that
    // write is inert, and above it that container is the one that moves while
    // the picture sits beside it and never moves at all.
    const { el, dialog, form } = await mountTwoContainers(true);
    dialog.scrollTop = 300;
    el.select(0, "picture");
    await el.updateComplete;
    expect(dialog.scrollTop).toBe(300);
    expect(form.scrollTop).toBe(800);
  });

  it("does not move anything when the open form merely re-renders", async () => {
    // The guard at the top of `updated()`. An item's form re-renders on every
    // keystroke and every hass tick, and scrolling on each of them would fight
    // the reader's own scrolling — so the decision is guarded on the transition
    // of `_editingIndex`, never on its value.
    const { el, dialog, form } = await mountTwoContainers(true);
    el.select(0, "list");
    await el.updateComplete;
    dialog.scrollTop = 250;
    form.scrollTop = 120;

    el.hass = { localize: () => "", states: {} } as never;
    await el.updateComplete;

    expect(dialog.scrollTop).toBe(250);
    expect(form.scrollTop).toBe(120);
  });

  /**
   * `_showListAt` awaits the section's expansion before it scrolls, and the row
   * it then asks for has no rect under happy-dom. Stub `rowFor` on the rendered
   * list with a row whose geometry is declared: what this describe is about is
   * *which container the editor writes*, not how the list finds its row — Task 2
   * owns that, and tests it there.
   *
   * **Stub before the first `select`, never after.** The list is rendered at
   * mount, `cache()` restores that same element when the form closes, and the
   * expansion `_showListAt` awaits may resolve in fewer microtasks than it takes
   * to stub afterwards — in which case `rowFor` returns a real row with a zero
   * rect, nothing moves, and the test fails for a reason that has nothing to do
   * with what it is guarding.
   */
  const stubRow = (el: PictureStudioEditor, top: number, height: number): void => {
    const list = el.shadowRoot?.querySelector(LIST_TAG) as PictureStudioBadgeList | null;
    if (!list) throw new Error("the list is not rendered");
    const row = document.createElement("div");
    row.getBoundingClientRect = () => rect(top, height);
    (list as unknown as { rowFor: () => HTMLElement }).rowFor = () => row;
  };

  /** Long enough for expand() to resolve and `_showListAt` to run its course. */
  const listSettled = () => new Promise((r) => setTimeout(r, 0));

  it("never moves the dialog when no form opens, whatever the origin", async () => {
    // Leaving a form by Back, by the ✕, or by tapping the background of the
    // picture: no form opens, so the dialog is held in all three. The row is
    // brought into view in the form's container instead — inert below 1000px,
    // which is exactly why the picture stays put there.
    for (const origin of ["list", "picture"] as const) {
      const { el, dialog, form } = await mountTwoContainers(true);
      stubRow(el, 430, 30); // bottom 460; the dialog's box ends at 400
      el.select(0, "list");
      await el.updateComplete;

      // Set BEFORE the select, never after: Task 5 starts a hold on a picture
      // origin, and a hold captures the position at the moment of the call. A
      // position written afterwards would be one the hold then undoes, and the
      // test would fail for a reason that has nothing to do with `updated`.
      dialog.scrollTop = 275;
      form.scrollTop = 88;
      el.select(undefined, origin);
      await el.updateComplete;
      await listSettled();

      expect(dialog.scrollTop).toBe(275);
      // The form's box is 549 tall and the row sits inside it: nothing to do.
      expect(form.scrollTop).toBe(88);
      document.body.replaceChildren();
    }
  });

  it("brings the row into view in the form's container, above 1000px", async () => {
    // The other mode, where that container is the one that actually moves. The
    // row sits below its box, so it is lifted into it — and the dialog, which
    // does not overflow here, has nothing to do either way.
    const { el, dialog, form } = await mountTwoContainers(false);
    stubRow(el, 600, 30); // bottom 630; the form's box ends at 549
    el.select(0, "list");
    await el.updateComplete;

    form.scrollTop = 40; // before the select — see the note above
    el.select(undefined, "picture");
    await el.updateComplete;
    await listSettled();

    expect(form.scrollTop).toBe(121); // 40 + (630 - 549)
    expect(dialog.scrollTop).toBe(0);
  });

  it("moves only the form's container above 1000px", async () => {
    // The inner container overflows and the outer does not — so `dialogScroller`
    // finds nothing above the form's and there is nothing to hold.
    const { el, dialog, form } = await mountTwoContainers(false);
    el.select(0, "list");
    await el.updateComplete;
    expect(form.scrollTop).toBe(800);
    expect(dialog.scrollTop).toBe(0);
  });
});

describe("patchBox", () => {
  const imageConfig = (
    box: Record<string, unknown> = { width: 20 },
    extra: Record<string, unknown> = {},
  ) =>
    ({
      type: "custom:picture-studio",
      image: "/local/plan.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "10%" },
          config: { type: "image", ...box, ...extra },
        },
      ],
    }) as unknown as PictureStudioConfig;

  const mountImage = async (config = imageConfig()) => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(config);
    el.hass = { localize: () => "", states: {} } as never;
    const emitted: PictureStudioConfig[] = [];
    el.addEventListener("config-changed", (ev) => {
      emitted.push((ev as CustomEvent<{ config: PictureStudioConfig }>).detail.config);
    });
    document.body.append(el);
    await el.updateComplete;
    return { el, emitted, last: () => emitted.at(-1) as PictureStudioConfig };
  };

  const firstItem = (config: PictureStudioConfig) => config.items[0] as ElementItem;

  it("writes the width into the item's own config", async () => {
    const h = await mountImage();
    h.el.patchBox(0, { width: 42 });
    expect(firstItem(h.last()).config).toMatchObject({ width: 42 });
  });

  it("omits height rather than setting it to undefined, so keep-ratio survives", async () => {
    // `"height" in config` is the predicate normalizeImageBox, effectiveBox and
    // the form all read. A key present with an undefined value reads as a
    // height that is there and is not a number.
    const h = await mountImage();
    h.el.patchBox(0, { width: 42 });
    expect("height" in firstItem(h.last()).config).toBe(false);
  });

  it("removes a height that was there when the new box has none", async () => {
    const h = await mountImage(imageConfig({ width: 20, height: 30 }));
    h.el.patchBox(0, { width: 42 });
    expect("height" in firstItem(h.last()).config).toBe(false);
  });

  it("writes box and position in a single commit", async () => {
    const h = await mountImage();
    const before = h.emitted.length;
    h.el.patchBox(0, { width: 42, height: 21 }, { left: 10, top: 20 });
    expect(h.emitted.length - before).toBe(1);
    expect(firstItem(h.last()).config).toMatchObject({ width: 42, height: 21 });
    // _reemit passes the config through storedConfig, which serialises Position
    // numbers to StoredPosition strings — "10%" not 10.
    expect(firstItem(h.last()).position).toEqual({ left: "10%", top: "20%" });
  });

  it("leaves the position alone when the gesture did not move the box", async () => {
    const h = await mountImage();
    h.el.patchBox(0, { width: 42 });
    // _reemit passes the config through storedConfig, which serialises Position
    // numbers to StoredPosition strings — "10%" not 10.
    expect(firstItem(h.last()).position).toEqual({ left: "10%", top: "10%" });
  });

  it("leaves every other key of the config untouched", async () => {
    const h = await mountImage(
      imageConfig({ width: 20 }, { image: "/a.png", tap_action: { action: "none" } }),
    );
    h.el.patchBox(0, { width: 42 });
    expect(firstItem(h.last()).config).toMatchObject({
      image: "/a.png",
      tap_action: { action: "none" },
    });
  });

  it("ignores an item that is not a readable image", async () => {
    // `normalizeConfig` turns an unrecognised element type into an UnknownItem,
    // whose raw config is written back untouched. No handle can exist on one —
    // it has no wrapper — so this guard is a floor, like patchPosition's.
    const h = await mountImage({
      type: "custom:picture-studio",
      image: "/local/plan.png",
      items: [{ type: "element", position: { top: "0%", left: "0%" }, config: { type: "nope" } }],
    } as unknown as PictureStudioConfig);
    const before = h.emitted.length;
    h.el.patchBox(0, { width: 42 });
    expect(h.emitted.length).toBe(before);
  });
});
