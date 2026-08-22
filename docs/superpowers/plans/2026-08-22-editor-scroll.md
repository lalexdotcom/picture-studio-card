# Where the editor scrolls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the editor's two scroll containers and replace the three
`scrollIntoView` calls with explicit writes, so that tapping an item on the
picture no longer throws the picture off the screen.

**Architecture:** A new pure module `src/editor/scroll.ts` owns the flattened-tree
ancestor walk, the two container-discovery rules (declared-scrollable for the
form, actually-overflowing *above that one* for the dialog) and the two write
primitives. The editor keeps the decisions: `select()` learns an explicit origin,
`updated()` and `_showListAt()` write to the containers by name, and the existing
`_holdScroll` becomes one mechanism anchored on the **preview**, of which a drag
is the zero-delta case.

**Tech Stack:** TypeScript (native `tsgo`), Lit 3, rstest (`@rstest/core`) with
two projects — `happy-dom` and `playwright`; biome for lint/format; pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-22-editor-scroll-design.md`](../specs/2026-08-22-editor-scroll-design.md)

## Global Constraints

- **Read the spec's §7 before touching anything.** Four hypotheses died on
  measurement to produce this design and each looked obviously right beforehand.
- **A probe must never occupy the layout it measures.** Never `position: sticky`,
  never in flow, never in the event path. The iPhone overlay of Task 9 is
  `position: fixed` with `pointer-events: none`.
- **Any ancestor walk that matters for layout follows `assignedSlot ?? parentNode`**,
  hopping hosts at shadow boundaries. `parentNode` alone lands on `html`.
- **Outer box, margins included.** `getBoundingClientRect().height` plus the
  computed vertical margins. `offsetHeight` excludes margins and cost a full
  round of measurement.
- **Prove the code ran before believing a negative result.** Every mechanism
  added here carries a test that was first confronted with the defect it names.
- **Never write a media query on our side.** The layout decides; we only ask what
  it decided.
- **Version: 1.5.3**, already open with an `unreleased` heading. No bump. Do not
  replace `unreleased` with a date — that is the release act and it is the user's.
- **Serena's symbolic tools are primary for code.** `get_symbols_overview` /
  `find_symbol` to read, `replace_symbol_body` / `replace_content` to edit.
  Built-in Read/Edit only for `.md`, JSON, YAML.
- **`vi` is not exported by `@rstest/core`.** Use `rstest.spyOn`,
  `rstest.useFakeTimers`, `rstest.advanceTimersByTime`, `rstest.useRealTimers`.
- **Scoped test runs never update the memory baseline.** `pnpm test <file>` is the
  normal thing while working; only a run reporting every test file is a baseline.
- **`pnpm lint` is not silent on a clean tree.** The bar is exit code 0, not empty
  output. Baseline at `12fd441`: 25 warnings, 4 infos.
- **The decision table below overrides the spec's §2 third row**, which said
  "per the origin" for a cleared selection. Settled with the user on 2026-08-22:

  | Trigger | Form's container | Dialog's container |
  |---|---|---|
  | A form **opens from the list** — a row clicked, Add | to the start | to the start |
  | A form **opens from the picture** | to the start | **held** |
  | **No form opens** — item in error, back, a deletion, a move | the row into view | **held** |
  | **No selection change** — a field edit, a drag | — | **held** |

  **The form's container is written unconditionally**, and its target is decided
  by the trigger alone — never by where the call came from. Below 1000px that
  write is inert, so it costs nothing; above 1000px it is the only container that
  moves, and it always wants the same thing.

  **The dialog's container is held unconditionally**, with exactly one exception:
  a form opening because the reader clicked a row in the list. Above 1000px
  holding is inert — nothing above the form's container overflows — so it costs
  nothing there either.

  That is the whole rule, and it is why the code never asks which mode it is in.
  It is also why **the origin is consulted in exactly one branch**: the one where
  a form opens. Deleting an item and reordering the list are done *from* the list
  and so carry a list origin, but no form opens, so nothing follows — which is
  what makes "delete an item and nothing scrolls" fall out rather than need a
  case of its own.

  **"Nothing" is not a third behaviour — it is "held" with a delta of zero.** A
  drag alters coordinates only: same card, same image, same form, same heights,
  so the correction the hold computes at runtime comes out at 0 and nothing
  moves. There is one mechanism, and the table has two fewer rows than the
  spec's.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/editor/scroll.ts` *(new)* | The flattened-tree walk, the two container rules, the two write primitives, `boxTop`. Pure functions over a DOM node — no editor state. |
| `src/tests/happy-dom/editor/scroll.test.ts` *(new)* | Declares the geometry the two rules read, and pins the 1000px-mode distinction. |
| `src/broker.ts` | `EditorChannel.select` gains an origin; `CardChannel` gains `viewportTop()`. |
| `src/editor/picture-studio-editor.ts` | Records the origin, writes the containers by name, holds the preview, reserves its outgoing form's height. Loses `_layoutAncestors` and `_scrollContainer` to `scroll.ts`. |
| `src/editor/badge-list.ts` | `scrollToItem(index)` → `rowFor(index)`. The list stops deciding where to scroll; it only maps an array index to its display row. |
| `src/card/picture-studio-card.ts` | Implements `viewportTop()`; passes `"picture"` as the select origin. |
| `CHANGELOG.md` | One user-facing entry under the open 1.5.3. |
| `docs/superpowers/specs/2026-08-22-editor-scroll-design.md` | §2's third row amended to the settled table. |
| `.serena/memories/picture-studio/follow-ups.md` | Entry 15 struck through. |
| `.serena/memories/picture-studio/state` | Test-count baseline refreshed after the full run. |

---

### Task 1: `scroll.ts` — the two containers and the two writes

**Files:**
- Create: `src/editor/scroll.ts`
- Create: `src/tests/happy-dom/editor/scroll.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function* layoutAncestors(from: Node): Generator<HTMLElement>
  export function boxTop(container: HTMLElement): number
  export function formScroller(from: Node): HTMLElement | undefined
  export function dialogScroller(from: Node): HTMLElement | undefined
  export function scrollToStart(container: HTMLElement, target: Element): void
  export function scrollIntoNearest(container: HTMLElement, target: Element): void
  ```

- [ ] **Step 1: Write the failing test**

Create `src/tests/happy-dom/editor/scroll.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import {
  boxTop,
  dialogScroller,
  formScroller,
  layoutAncestors,
  scrollIntoNearest,
  scrollToStart,
} from "../../../editor/scroll";

/**
 * happy-dom lays nothing out, so every box here is *declared*: the overflow
 * comes from the inline style, the two heights that decide whether it overflows
 * are defined by hand, and rects are functions we install. What is guarded is
 * the rule that picks a container and the arithmetic of the write — never the
 * pixels, which belong to a real WebKit.
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

/** A box that declares `overflow-y: auto` and either overflows or does not. */
const scroller = (content: number, box: number): HTMLElement => {
  const el = document.createElement("div");
  el.style.overflowY = "auto";
  Object.defineProperty(el, "scrollHeight", { value: content, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: box, configurable: true });
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = v;
    },
    configurable: true,
  });
  el.getBoundingClientRect = () => rect(0, box);
  return el;
};

afterEach(() => document.body.replaceChildren());

describe("layoutAncestors", () => {
  it("crosses a slot, which parentNode does not", () => {
    // The editor is distributed into a slot by Home Assistant's dialog, so its
    // light-DOM parent is not the box that contains it on screen. A walk on
    // parentNode alone found only `html` and two rounds of measurement were
    // spent proving the instrument was looking at the wrong element.
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.id = "container";
    container.append(document.createElement("slot"));
    root.append(container);

    const child = document.createElement("span");
    host.append(child);
    document.body.append(host);

    const walk = [...layoutAncestors(child)].map((n) => n.id || n.localName);
    expect(walk).toContain("container");
    // And the logical walk, which is what we must NOT be doing, does not.
    const logical: string[] = [];
    for (let n: Node | null = child; n; n = n.parentNode) {
      if (n instanceof HTMLElement) logical.push(n.id || n.localName);
    }
    expect(logical).not.toContain("container");
  });
});

describe("formScroller — declared, not measured", () => {
  it("finds a declared container that does not overflow", () => {
    // Below 1000px `.element-editor` declares overflow-y:auto with nothing
    // bounding its height, so it never overflows and never scrolls. It is still
    // the form's container: an inert write to it is a no-op, which is the point.
    const outer = scroller(2000, 400);
    const inner = scroller(549, 549); // declared, inert
    const el = document.createElement("span");
    inner.append(el);
    outer.append(inner);
    document.body.append(outer);

    expect(formScroller(el)).toBe(inner);
  });

  it("is undefined when nothing above declares an overflow", () => {
    const el = document.createElement("span");
    document.body.append(el);
    expect(formScroller(el)).toBeUndefined();
  });
});

describe("dialogScroller — above the form's, and actually overflowing", () => {
  it("skips the form's container even when it overflows", () => {
    // At and above 1000px `.content` is a row with a height cap, so
    // `.element-editor` overflows and IS the form's scroller. Without the
    // "above" rule the same element would answer to both roles and the two
    // intentions would fight.
    const outer = scroller(2000, 400);
    const inner = scroller(1000, 400); // declared AND overflowing
    const el = document.createElement("span");
    inner.append(el);
    outer.append(inner);
    document.body.append(outer);

    expect(formScroller(el)).toBe(inner);
    expect(dialogScroller(el)).toBe(outer);
  });

  it("is undefined when nothing above the form's container overflows", () => {
    const outer = scroller(400, 400); // declared, inert
    const inner = scroller(1000, 400);
    const el = document.createElement("span");
    inner.append(el);
    outer.append(inner);
    document.body.append(outer);

    expect(dialogScroller(el)).toBeUndefined();
  });

  it("takes the page, which scrolls without declaring an overflow", () => {
    // On a phone the dialog is the page: measured on a real iPhone, the only
    // thing that scrolls is `html`, whose computed overflow-y is `visible`.
    const root = document.scrollingElement as HTMLElement;
    Object.defineProperty(root, "scrollHeight", { value: 2447, configurable: true });
    Object.defineProperty(root, "clientHeight", { value: 874, configurable: true });
    const el = document.createElement("span");
    document.body.append(el);
    expect(dialogScroller(el)).toBe(root);
  });
});

describe("the writes", () => {
  it("scrollToStart puts the target's top at the container's top", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(70, 30); // 70px below the box top
    container.append(target);
    document.body.append(container);

    scrollToStart(container, target);
    expect(container.scrollTop).toBe(190);
  });

  it("scrollIntoNearest leaves a target already inside alone", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(70, 30);
    container.append(target);
    document.body.append(container);

    scrollIntoNearest(container, target);
    expect(container.scrollTop).toBe(120);
  });

  it("scrollIntoNearest lifts a target that sits below the box", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(430, 30); // bottom 460, box ends 400
    container.append(target);
    document.body.append(container);

    scrollIntoNearest(container, target);
    expect(container.scrollTop).toBe(180); // 120 + (460 - 400)
  });

  it("scrollIntoNearest drops a target that sits above the box", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(-50, 30);
    container.append(target);
    document.body.append(container);

    scrollIntoNearest(container, target);
    expect(container.scrollTop).toBe(70); // 120 + (-50 - 0)
  });

  it("measures the page from the viewport, not from its own rect", () => {
    // documentElement's rect.top is -scrollY, so using it as the box top would
    // double-count the scroll.
    const root = document.scrollingElement as HTMLElement;
    Object.defineProperty(root, "clientHeight", { value: 874, configurable: true });
    root.getBoundingClientRect = () => rect(-300, 2447);
    expect(boxTop(root)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/happy-dom/editor/scroll.test.ts`
Expected: FAIL — the module does not exist, "Cannot find module '../../../editor/scroll'".

- [ ] **Step 3: Write the implementation**

Create `src/editor/scroll.ts`:

```ts
/**
 * Where the editor scrolls, and in which of the two containers.
 *
 * Home Assistant's card-edit dialog has two of them, and which one actually
 * moves depends on the viewport — measured in
 * `src/panels/lovelace/editor/card-editor/hui-dialog-edit-card.ts` and
 * corroborated by a trace on a real iPhone:
 *
 * - **Below 1000px** `.content` is a column with no height cap, so
 *   `.element-editor` — which declares `overflow-y: auto` via `ha-scrollbar` —
 *   never overflows and never scrolls. The dialog carries the scroll of the
 *   whole thing, preview included.
 * - **At 1000px and above** `.content` is a row with `max-height`, flex
 *   stretches the children to it, and `.element-editor` becomes the form's own
 *   scroller with the preview beside it, unmoving.
 *
 * The general rule underneath: `overflow` says what to do *if* a box overflows;
 * a height constraint is what makes it overflow. An `overflow: auto` with
 * nothing bounding its height is inert.
 *
 * Hence the two containers are found by *different* criteria — declared for the
 * form, actually-overflowing-and-above-the-form's for the dialog. Were they
 * found the same way, above 1000px the same element would answer to both roles
 * and the two intentions would fight. There is no media query on our side,
 * ever: the layout decides, we only ask what it decided.
 */

/**
 * The flattened-tree ancestors, starting with `from` itself — which is what
 * layout, and therefore scrolling, actually follows.
 *
 * `parentNode` alone walks the *logical* tree: the editor is distributed into a
 * slot by Home Assistant's dialog, so its light-DOM parent is not the box that
 * contains it on screen. Following `assignedSlot` first crosses that hop; the
 * host jump then crosses the shadow boundary. Measured the hard way — a walk
 * without it found only `html`, which never moved while the view plainly did.
 */
export function* layoutAncestors(from: Node): Generator<HTMLElement> {
  let node: Node | null = from;
  while (node) {
    if (node instanceof HTMLElement) yield node;
    const slot: HTMLSlotElement | null = node instanceof Element ? node.assignedSlot : null;
    const parent: Node | null = slot ?? node.parentNode;
    node = parent instanceof ShadowRoot ? parent.host : parent;
  }
}

const declaresScroll = (node: HTMLElement): boolean =>
  /auto|scroll/.test(getComputedStyle(node).overflowY);

/**
 * The top edge of `container`'s own box, in viewport coordinates.
 *
 * Zero for the scrolling element: `documentElement.getBoundingClientRect().top`
 * is `-scrollY`, so using it would count the scroll twice.
 */
export const boxTop = (container: HTMLElement): number =>
  container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;

/**
 * The container the form scrolls in — the nearest ancestor that *declares* a
 * scroll, whether or not it overflows today. Below 1000px that container is
 * inert and writing to it is a no-op, which is exactly what makes it safe to
 * write to both containers on every trigger and never ask which mode we are in.
 *
 * The walk stops at `body`: past that point any match is the dialog's container,
 * not the form's.
 */
export function formScroller(from: Node): HTMLElement | undefined {
  for (const node of layoutAncestors(from)) {
    if (node === from) continue;
    if (node === document.body || node === document.documentElement) return undefined;
    if (declaresScroll(node)) return node;
  }
  return undefined;
}

/**
 * The container the dialog scrolls in — the nearest ancestor **above the form's**
 * that actually overflows. "Above the form's" is not a nicety: at 1000px and
 * over, `.element-editor` overflows, and without the exclusion it would be
 * returned here too.
 */
export function dialogScroller(from: Node): HTMLElement | undefined {
  const form = formScroller(from);
  let above = form === undefined;
  for (const node of layoutAncestors(from)) {
    if (!above) {
      if (node === form) above = true;
      continue;
    }
    if (node === from) continue;
    if (node.scrollHeight <= node.clientHeight) continue;
    // The page scrolls without declaring it: its computed `overflow-y` is
    // `visible`, and on a phone Home Assistant's dialog *is* the page —
    // measured, `html[visible;2447/874]`. Requiring auto|scroll here found
    // nothing at all and the hold never ran.
    if (node === document.scrollingElement) return node;
    // `body` is skipped on purpose: it reports the same overflow as the document
    // while its own `overflow: hidden` makes writing to its scrollTop a no-op.
    if (node !== document.body && declaresScroll(node)) return node;
  }
  return undefined;
}

/** Scroll `container` so that `target`'s top edge sits at the container's top. */
export function scrollToStart(container: HTMLElement, target: Element): void {
  const delta = target.getBoundingClientRect().top - boxTop(container);
  if (delta !== 0) container.scrollTop += delta;
}

/**
 * Scroll `container` by the least amount that brings `target` inside it, and by
 * nothing at all when it already is. The explicit equivalent of
 * `scrollIntoView({ block: "nearest" })` — with the difference that is the whole
 * point of this module: it touches this container and no other.
 */
export function scrollIntoNearest(container: HTMLElement, target: Element): void {
  const top = boxTop(container);
  const bottom = top + container.clientHeight;
  const rect = target.getBoundingClientRect();
  if (rect.top < top) {
    container.scrollTop += rect.top - top;
  } else if (rect.bottom > bottom) {
    container.scrollTop += rect.bottom - bottom;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/tests/happy-dom/editor/scroll.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Confront the "above the form's container" rule with its defect**

Temporarily change `dialogScroller` to start its walk at `from` (delete the
`above` bookkeeping) and re-run. Expected: the test *"skips the form's container
even when it overflows"* goes RED with `expected <div> to be <div>` — the inner
container is returned for both roles. **Record that failure text in the commit
message.** Restore the implementation and confirm green.

- [ ] **Step 6: Lint and commit**

```bash
pnpm lint && pnpm format
git add src/editor/scroll.ts src/tests/happy-dom/editor/scroll.test.ts
git commit -m "feat(editor): tell the two scroll containers apart"
```

---

### Task 2: `badge-list` maps an index to a row, and stops scrolling

**Files:**
- Modify: `src/editor/badge-list.ts` — `scrollToItem` (line ~346), `updated` (line ~310)
- Test: `src/tests/happy-dom/editor/badge-list.test.ts` (the `scrollToItem` describe at ~697, and the auto-scroll describe at ~657)

**Interfaces:**
- Consumes: nothing.
- Produces: `public rowFor(index: number): HTMLElement | undefined` on
  `PictureStudioBadgeList`. Takes an **array** index and returns the rendered row,
  applying `_flip` — the list renders top-down, so the display position is the
  mirror of the array position.
- Removes: `public scrollToItem(index: number): void`, and the auto-scroll
  `updated()` performed on its own when `selectedIndex` changed.

- [ ] **Step 1: Write the failing test**

In `src/tests/happy-dom/editor/badge-list.test.ts`, replace the two describes
named *"scrolls the row at the flipped position, not the raw index position"* /
*"does not scroll on deselection"* (the auto-scroll block) and the whole
`describe("scrollToItem", …)` with:

```ts
describe("rowFor", () => {
  if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

  const item = (entity: string): PictureItem =>
    ({
      type: "badge",
      position: { top: 0, left: 0 },
      anchor: "auto",
      config: { type: "entity", entity },
    }) as unknown as PictureItem;

  afterEach(() => document.body.replaceChildren());

  it("returns the row at the flipped display position, not the raw index", async () => {
    // Three items: array [light.0, light.1, light.2], displayed [light.2, light.1, light.0].
    // rowFor(0) → _flip(0) = 2, so display row 2 is light.0's.
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [item("light.0"), item("light.1"), item("light.2")];
    document.body.append(el);
    await el.updateComplete;

    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])] as HTMLElement[];
    expect(el.rowFor(0)).toBe(rows[2]);
    expect(el.rowFor(2)).toBe(rows[0]);
  });

  it("is undefined for an index with no row", async () => {
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [item("light.0")];
    document.body.append(el);
    await el.updateComplete;
    expect(el.rowFor(7)).toBeUndefined();
  });

  it("never scrolls anything of its own", async () => {
    // The list maps an index to a row and stops there. Which container moves is
    // the editor's decision, because only the editor can tell the form's
    // container from the dialog's — and `scrollIntoView` could not: it scrolls
    // every ancestor, which is precisely the defect this work removes.
    const el = document.createElement(LIST_TAG) as PictureStudioBadgeList;
    el.items = [item("light.0"), item("light.1"), item("light.2")];
    document.body.append(el);
    await el.updateComplete;

    const rows = [...(el.shadowRoot?.querySelectorAll(".item") ?? [])] as HTMLElement[];
    const spies = rows.map((r) => rstest.spyOn(r, "scrollIntoView"));

    el.selectedIndex = 0;
    await el.updateComplete;
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/happy-dom/editor/badge-list.test.ts`
Expected: FAIL — `el.rowFor is not a function`, and *"never scrolls anything of
its own"* fails with `expected "scrollIntoView" to be called 0 times, but got 1`.

- [ ] **Step 3: Write the implementation**

Replace `scrollToItem` in `src/editor/badge-list.ts`:

```ts
  /**
   * The rendered row for an **array** index, or undefined when there is none.
   *
   * `selectedIndex` and every event this list fires speak array indices; the
   * list renders top-down, so the display position is the mirror. `_flip` is
   * applied exactly here, where one leaves this element.
   *
   * The list deliberately does not scroll: only the editor can tell the form's
   * container from the dialog's, and `scrollIntoView` — which is what stood
   * here — scrolls every ancestor container at once, which is the defect the
   * two-container work exists to remove.
   */
  public rowFor(index: number): HTMLElement | undefined {
    const itemRows = this.shadowRoot?.querySelectorAll(".item");
    return itemRows?.[this._flip(index)] as HTMLElement | undefined;
  }
```

And reduce `updated` to its remaining job:

```ts
  protected updated(_changedProperties: Map<string, unknown>): void {
    this._probeRows();
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/tests/happy-dom/editor/badge-list.test.ts`
Expected: PASS.

The editor's suite is expected to be RED at this point — `_showListAt` still
calls `scrollToItem`. Task 4 closes it. Note the failure and move on.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm format
git add src/editor/badge-list.ts src/tests/happy-dom/editor/badge-list.test.ts
git commit -m "refactor(editor): the list maps an index to a row, it does not scroll"
```

---

### Task 3: `select()` learns where the call came from

**Files:**
- Modify: `src/broker.ts` — `EditorChannel.select`
- Modify: `src/editor/picture-studio-editor.ts` — `select`, and its eight internal callers
- Modify: `src/card/picture-studio-card.ts:146` — `onSelect`
- Test: `src/tests/happy-dom/editor/picture-studio-editor.test.ts` (30 `select(` call sites)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  /** Which surface the selection was made on. */
  export type SelectOrigin = "list" | "picture";
  // EditorChannel:
  select(index: number | undefined, origin: SelectOrigin): void;
  ```
  The editor stores it in `private _selectOrigin: SelectOrigin = "list"`. It is
  read in exactly two places, and both ask a narrow question:

  - `updated()` (Task 4), in the one branch where **a form opens**: does the
    dialog's container follow? Only a list origin does.
  - `select()` and the hold's guard (Task 5): a picture origin starts a hold,
    because a selection made there changes the form's height with no config
    change and nothing else would start one.

  **No default parameter** — the origin is the point, and a default is how it
  would silently go wrong.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/happy-dom/editor/picture-studio-editor.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: FAIL — `expected undefined to be "picture"`, plus a TypeScript error on
the second argument.

- [ ] **Step 3: Write the implementation**

In `src/broker.ts`, above `EditorChannel`:

```ts
/**
 * Which surface a selection was made on.
 *
 * - `list` — a row was clicked, or Add, or Back, or the ✕, or a row was dragged
 *   to a new position. All of those are gestures in the editor's own list.
 * - `picture` — the preview was tapped, on an item or on its background.
 *
 * The distinction is already material at the source — the card reaches the
 * editor through this channel, the list through a DOM event — so it is declared
 * rather than inferred.
 *
 * It decides one thing and one only: whether the **dialog's** scroll container
 * follows a form that is opening. A list origin means the reader asked to be
 * taken to that form, so it does; a picture origin means they are looking at the
 * picture, which must not move. Every other trigger — including a deletion or a
 * reorder, which carry a list origin because that is where they happen — opens
 * no form, and there the dialog never follows whatever the origin says.
 */
export type SelectOrigin = "list" | "picture";
```

and in the interface:

```ts
  select(index: number | undefined, origin: SelectOrigin): void;
```

In `src/editor/picture-studio-editor.ts`, import `type SelectOrigin` from
`../broker`, add the field beside `_applying`:

```ts
  /** Where the last selection came from. See `updated`, which scrolls on it. */
  private _selectOrigin: SelectOrigin = "list";
  /** Set while a hold is running, so a second one is never started over it. */
  private _holdRelease?: () => void;
```

and change `select`:

```ts
  select(index: number | undefined, origin: SelectOrigin): void {
    if (this._editingIndex === index) return;
    this._selectOrigin = origin;
    this._editingIndex = index;
    notifyEditors();
  }
```

Update the editor's own callers, all of which are the list or a form and
therefore `"list"`:

- `_addItem` — `this.select(config.items.length, "list")` (a new item's form does
  open at its top: the reader asked for it by clicking Add)
- `_editBadge` — `this.select(ev.detail.index, "list")`
- `_onItemsExpandedChanged` — `this.select(undefined, "list")`
- `render()` — the two `@go-back=${() => this.select(undefined, "list")}` bindings
- `_removeBadge` — `this.select(undefined, "list")` (the ✕ is in the list; no
  form opens, so nothing follows)
- `_moveBadge` — its four `this.select(…)` calls, all `"list"` (the drag handle
  is in the list, and again no form opens)

In `src/card/picture-studio-card.ts:146`:

```ts
    onSelect: (index) => activeEditor()?.select(index, "picture"),
```

- [ ] **Step 4: Run the whole suite and fix the call sites**

Run: `pnpm test`
Expected: TypeScript errors at the 30 `select(` call sites in
`src/tests/happy-dom/editor/picture-studio-editor.test.ts`. Give each the origin
that names what it is standing in for — `"list"` for the existing ones, which all
model a click in the list or a form. Re-run until green.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm format
git add src/broker.ts src/editor/picture-studio-editor.ts src/card/picture-studio-card.ts src/tests
git commit -m "feat(editor): a selection declares where it came from"
```

---

### Task 4: `updated()` and `_showListAt()` write the containers by name

**Files:**
- Modify: `src/editor/picture-studio-editor.ts` — `updated`, `_showListAt`; delete
  `_layoutAncestors` and `_scrollContainer` (now in `scroll.ts`)
- Test: `src/tests/happy-dom/editor/picture-studio-editor.test.ts`

**Interfaces:**
- Consumes: `formScroller`, `dialogScroller`, `scrollToStart`, `scrollIntoNearest`
  from `./scroll` (Task 1); `rowFor` from `badge-list` (Task 2); `_selectOrigin`
  (Task 3).
- Produces: `private _showListAt(index: number): Promise<void>` — it expands the
  Items section and brings the row into view **in the form's container only**.
  No origin, no flag: when no form opens, the dialog never follows.

- [ ] **Step 1: Write the failing test**

Add to `src/tests/happy-dom/editor/picture-studio-editor.test.ts`. This harness
declares **two nested containers**, which is what the real dialog has and what
the existing single-scroller harness could not express:

```ts
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

      el.select(undefined, origin);
      await el.updateComplete;
      dialog.scrollTop = 275;
      form.scrollTop = 88;
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

    el.select(undefined, "picture");
    await el.updateComplete;
    form.scrollTop = 40;
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
```

Then **delete** the three `scrollIntoView`-counting tests in the describe *"a form
opens at its own top"* and the *"does not scroll the editor when the form is
refused"* test's counter — replace the latter's assertion with the container
check, since `scrollIntoView` no longer exists to count:

```ts
  it("does not move either container when the form is refused", async () => {
    const { el } = await mountMissing();
    // The editor has no scrollable ancestor here, so the only thing to prove is
    // that the refused form takes the list path rather than the form path.
    el.select(0, "list");
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("picture-studio-badge-form")).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: FAIL — `expected 0 to be 800` on the first new test (`scrollIntoView` is
stubbed away and nothing writes `scrollTop`), plus `list.rowFor is not a function`
inside `_showListAt`.

- [ ] **Step 3: Write the implementation**

In `src/editor/picture-studio-editor.ts`, add the import:

```ts
import { dialogScroller, formScroller, scrollIntoNearest, scrollToStart } from "./scroll";
```

Delete `_layoutAncestors` and `_scrollContainer` — they now live in `scroll.ts`.

Replace `updated`:

```ts
  /**
   * A form opens at the top of itself, not at the scroll position of whatever
   * was showing before. Which container that means is not ours to guess: below
   * 1000px the dialog carries the scroll and the form's own container is inert,
   * above 1000px it is the other way round — so both are written and exactly one
   * of them answers. See `scroll.ts`.
   *
   * The one container that is *not* always written is the dialog's, and the
   * origin is what decides: a selection made on the picture must leave the
   * picture where it is, which is the whole reason `select` carries an origin.
   *
   * Guarded on the transition rather than on the value: an item's form
   * re-renders on every keystroke and every hass tick, and scrolling on each of
   * them would fight the user's own scrolling.
   */
  protected updated(changed: Map<string, unknown>): void {
    if (!changed.has("_editingIndex")) return;
    const prev = changed.get("_editingIndex") as number | undefined;
    const curr = this._editingIndex;
    // Three mutually exclusive branches of one decision. The form's container is
    // written in all three, unconditionally: below 1000px the write is inert, and
    // above it that container is the only one that moves.
    if (curr !== undefined && this._formTarget()) {
      const form = formScroller(this);
      if (form) scrollToStart(form, this);
      // The one place the origin is consulted, and the only trigger on which the
      // dialog's container moves at all: the reader clicked a row and asked to be
      // taken to its form. A picture origin means they are looking at the
      // picture, which must not be thrown off the screen to show them a form.
      if (this._selectOrigin === "list") {
        const dialog = dialogScroller(this);
        if (dialog) scrollToStart(dialog, this);
      }
    } else if (curr !== undefined) {
      // An item was selected but no form opened (unreadable item, or a badge
      // whose type is missing): expand the Items section and show the row.
      void this._showListAt(curr);
    } else if (prev !== undefined) {
      // The reader came back from a form, or deleted an item: expand the Items
      // section and bring the row into view.
      void this._showListAt(prev);
    }
  }
```

Replace the tail of `_showListAt`:

```ts
  private async _showListAt(index: number): Promise<void> {
    const section = this.shadowRoot?.querySelector("#items-section") as
      | (HTMLElement & { expand(): Promise<boolean> })
      | null;
    const opened = (await section?.expand()) ?? false;
    // Wait out the transition only when expand() actually started one and the
    // browser understands interpolate-size — otherwise there is nothing to wait
    // for. transitionend is refused on purpose: the container lives in the
    // panel's shadow root, and happy-dom never fires transition events, so a
    // scroll gated on it would never run in the suite and could not be tested.
    const supportsInterpolateSize =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("interpolate-size", "allow-keywords");
    if (opened && supportsInterpolateSize) {
      await new Promise<void>((resolve) => setTimeout(resolve, EXPAND_MS));
    }
    const list = this.shadowRoot?.querySelector("picture-studio-badge-list") as
      | (HTMLElement & { rowFor(i: number): HTMLElement | undefined })
      | null;
    const row = list?.rowFor(index);
    if (!row) return;
    // The form's container, and no other. `scrollIntoView` stood here and could
    // not make that distinction: it scrolls *every* ancestor container, so
    // showing the row in the list always dragged the picture along with it.
    // Below 1000px this write is inert and the picture stays put; above 1000px
    // it is the pane the reader is looking at and the picture never moves anyway.
    const form = formScroller(this);
    if (form) scrollIntoNearest(form, row);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: PASS. The hold tests are expected to be RED — their single-scroller
harness now has its one container claimed by `formScroller`, so `dialogScroller`
finds nothing. Task 5 rewrites them. Note the failure and move on.

- [ ] **Step 5: Confirm no `scrollIntoView` is left**

Run: `grep -rn "scrollIntoView" src/ | grep -v tests`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm format
git add src/editor/picture-studio-editor.ts src/tests/happy-dom/editor/picture-studio-editor.test.ts
git commit -m "feat(editor): write the scroll containers by name, not by scrollIntoView"
```

---

### Task 5: one hold, anchored on the preview

**Files:**
- Modify: `src/broker.ts` — `CardChannel`
- Modify: `src/card/picture-studio-card.ts` — implement `viewportTop`
- Modify: `src/editor/picture-studio-editor.ts` — `_holdScroll` → `_holdPreview`,
  called from `_commit` and from `select`
- Test: `src/tests/happy-dom/editor/picture-studio-editor.test.ts` (the describe
  *"a position commit must not move the view"*, and its 4 `registerCard({…})`
  literals), `src/tests/happy-dom/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: `dialogScroller`, `boxTop` from `./scroll`; `_selectOrigin` (Task 3).
- Produces:
  ```ts
  // CardChannel:
  /** The preview's top edge in viewport coordinates, or undefined while it
   *  cannot be measured — which is the signal that the layout is not ready. */
  viewportTop(): number | undefined;
  // Editor:
  private _holdPreview(selection: number | undefined, rebuild: boolean): void;
  ```

- [ ] **Step 1: Write the failing test**

Rewrite the `mountInScroller` harness in the describe *"a position commit must not
move the view"* so it has two nested containers and a registered preview:

```ts
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
    const channel = { reanchor: () => undefined, viewportTop: () => (present ? previewTop - top : undefined) };
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
    const done = h.rebuild();
    h.el.patchPosition(0, { left: 30, top: 30 });
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
    h.rebuild(); // and never finish it
    h.el.patchPosition(0, { left: 30, top: 30 });
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
    const done = h.rebuild();
    h.el.patchPosition(0, { left: 30, top: 30 });
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
    h.grow(160); // the incoming form is 160px taller than the outgoing one
    h.el.select(1, "picture");
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
    const done = h.rebuild();
    h.el.patchPosition(0, { left: 30, top: 30 }); // stands in for the removal's commit
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
    const done = h.rebuild();
    h.el.patchPosition(1, { left: 30, top: 30 }); // onCommit
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
    const done = h.rebuild();
    h.el.patchPosition(0, { left: 30, top: 30 });
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
    const done = h.rebuild();
    h.el.patchPosition(0, { left: 30, top: 30 });
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
});
```

Delete the old *"holds the page itself, which scrolls without declaring an
overflow"* test — Task 1's `dialogScroller` test now covers the page rule
directly, at the level where it lives.

And in `src/tests/happy-dom/card/picture-studio-card.test.ts`:

```ts
describe("viewportTop — the anchor the editor holds", () => {
  it("is undefined while the card has no box", async () => {
    // A freshly connected card has not laid out; reporting its rect.top then
    // would be a number the hold would trust and act on. Undefined is the
    // signal that the layout is not ready, and the hold falls back to the
    // absolute position for exactly as long as that lasts.
    const el = await mountCard();
    el.getBoundingClientRect = () =>
      ({ top: 120, height: 0, bottom: 120, left: 0, right: 0, x: 0, y: 120, width: 0, toJSON: () => ({}) }) as DOMRect;
    expect((el as unknown as { viewportTop(): number | undefined }).viewportTop()).toBeUndefined();
  });

  it("is the rect's top once it has one", async () => {
    const el = await mountCard();
    el.getBoundingClientRect = () =>
      ({ top: 120, height: 240, bottom: 360, left: 0, right: 0, x: 0, y: 120, width: 0, toJSON: () => ({}) }) as DOMRect;
    expect((el as unknown as { viewportTop(): number | undefined }).viewportTop()).toBe(120);
  });
});
```

Use whatever the file's existing mount helper is called — read the top of
`src/tests/happy-dom/card/picture-studio-card.test.ts` and reuse it rather than
adding a second one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts src/tests/happy-dom/card/picture-studio-card.test.ts`
Expected: FAIL — `el.viewportTop is not a function`, `expected 0 to be 300`, and
`expected 300 to be 460` on the picture-selection test.

- [ ] **Step 3: Write the implementation**

In `src/broker.ts`, add to `CardChannel`:

```ts
  /**
   * The preview's top edge in viewport coordinates, or undefined while it
   * cannot be measured.
   *
   * The editor holds the reader's framing across a commit by keeping this
   * anchor at the same place on screen. Undefined is not a failure: Home
   * Assistant destroys the card element and builds another on every config
   * change, and during that gap there is no preview at all. Its absence is
   * precisely the signal that the layout is not ready — an earlier attempt
   * anchored on the editor, which *does* survive the rebuild, and got a number
   * that was wrong by 838px.
   */
  viewportTop(): number | undefined;
```

In `src/card/picture-studio-card.ts`, next to `reanchor`:

```ts
  viewportTop(): number | undefined {
    const rect = this.getBoundingClientRect();
    // A height of zero means the picture has not laid out. Reporting a top then
    // hands the editor a number it would trust.
    return rect.height > 0 ? rect.top : undefined;
  }
```

In `src/editor/picture-studio-editor.ts`, add `boxTop` to the `./scroll` import
and replace `_holdScroll` with:

```ts
  /**
   * Keep the preview where the reader put it, across a change that moves the
   * content around it.
   *
   * Blink keeps the scroll position when content above the viewport is replaced
   * — CSS scroll anchoring — and WebKit implements none of it. Home Assistant
   * rebuilds the card element on every config change, so on an iPhone every
   * committed drag drops the reader back at the top of the dialog. This is that
   * anchoring, by hand.
   *
   * **One mechanism, not two.** A drag is the case where the delta is zero: the
   * content is not supposed to change, so the correction computes to nothing. A
   * selection made on the picture is the case where it is not: one form is
   * replaced by another of a different height, and keeping the same `scrollTop`
   * would *not* keep the same framing — if the form above grows by 200px, an
   * unchanged offset pushes the picture 200px down the screen. What is
   * preserved is the preview's position on screen.
   *
   * **The anchor is the preview, and that is load-bearing.** While it cannot be
   * measured, hold the absolute value; as soon as it can, correct by the delta.
   * No detection of the rebuild is needed for that — it falls out of the
   * anchor's own availability.
   *
   * @param selection the selection this hold belongs to; it lets go if the
   *   reader picks something else, because moving the view is then the point.
   * @param rebuild whether a card rebuild is expected. A commit triggers one; a
   *   selection does not, and waiting for one that never comes would keep the
   *   hold fighting the reader for `HOLD_MAX_FRAMES`.
   */
  private _holdPreview(selection: number | undefined, rebuild: boolean): void {
    const scroller = dialogScroller(this);
    if (!scroller) return;
    const reserved = this._reserveHeight();
    const release = (): void => {
      this._holdRelease = undefined;
      reserved();
    };
    this._holdRelease = release;

    /** The preview's top, measured against the dialog container's own box. */
    const screenTop = (): number | undefined => {
      const t = activeCard()?.viewportTop();
      return t === undefined ? undefined : t - boxTop(scroller);
    };

    const desired = screenTop();
    let top = scroller.scrollTop;
    const before = activeCard();
    let frames = 0;
    let rebuilt = !rebuild;
    let measured = false;
    let stable = 0;
    let lastHeight = scroller.scrollHeight;

    const hold = (): void => {
      // Stand aside for the one trigger that is *meant* to move the dialog: a
      // form opening because the reader clicked a row. Holding through that
      // would fight `updated`, which is about to scroll to the form's top.
      //
      // Every other selection change keeps the hold. Deleting an item and
      // reordering the list both come from the list and both change the
      // selection, but no form opens and nothing is supposed to move — bailing
      // there would abandon the hold in the middle of the very rebuild it exists
      // to survive. A drag is the same shape: `drag-layer` fires `onCommit` and
      // then `onSelect(hit.index)`, so the selection changes right after the
      // commit, on a picture origin.
      const deliberate =
        this._editingIndex !== selection &&
        this._selectOrigin === "list" &&
        this._formTarget() !== undefined;
      if (deliberate) {
        release();
        return;
      }

      const now = screenTop();
      if (now === undefined || desired === undefined) {
        // Nothing to measure against — hold the absolute value.
        if (scroller.scrollTop !== top) scroller.scrollTop = top;
      } else {
        measured = true;
        // Read from the *live* scrollTop, never from the recorded one: WebKit
        // may have clamped it between two frames, and `now` was measured under
        // whatever it left. Mixing the two scroll states is how a correction
        // computes nonsense.
        const want = scroller.scrollTop + (now - desired);
        if (scroller.scrollTop !== want) scroller.scrollTop = want;
        top = scroller.scrollTop;
      }

      const height = scroller.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        stable = 0;
      } else {
        stable += 1;
      }

      if (!rebuilt) {
        const nowCard = activeCard();
        rebuilt = nowCard !== undefined && nowCard !== before;
      }
      // Three conditions, and the height one is the load-bearing part: the card
      // registers within a frame, then lays out and moves the document again.
      // `measured` is what says the correction was actually applied rather than
      // merely attempted.
      if (rebuilt && measured && stable >= STABLE_FRAMES) {
        release();
        return;
      }
      if (++frames < HOLD_MAX_FRAMES) {
        requestAnimationFrame(hold);
      } else {
        release();
      }
    };
    requestAnimationFrame(hold);
  }
```

Task 6 writes `_reserveHeight`. Until then, stub it so this task can be tested on
its own:

```ts
  /** Task 6 replaces this with the outgoing form's height reservation. */
  private _reserveHeight(): () => void {
    return () => {};
  }
```

Change `_commit`:

```ts
  protected _commit(next: PictureStudioConfig): void {
    this._holdPreview(this._editingIndex, true);
    this._config = next;
    this._reemit(next);
  }
```

And `select`, which must measure **before** the DOM changes:

```ts
  select(index: number | undefined, origin: SelectOrigin): void {
    // Selecting what is already selected is a no-op, and it is load-bearing:
    // `drag-layer` fires `onSelect(hit.index)` at the end of every gesture, so
    // dragging an item that was already selected must not disturb the hold the
    // commit just started. That is what `b55388c` fixed.
    if (this._editingIndex === index) return;
    this._selectOrigin = origin;
    // A picture selection changes the form's height with no config change, so
    // nothing else is going to start a hold — except when a commit already did,
    // which is the *other* end of a drag: `onCommit` runs first and its hold is
    // the one that should see the gesture through, with the rebuild it is
    // waiting for. Measured before `_editingIndex` moves, because the anchor is
    // where the preview sits now.
    if (origin === "picture" && this._holdRelease === undefined) {
      this._holdPreview(index, false);
    }
    this._editingIndex = index;
    notifyEditors();
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts src/tests/happy-dom/card/picture-studio-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Confront the anchor choice with its defect**

Temporarily change `screenTop` to measure the editor instead of the preview —
`this.getBoundingClientRect().top - boxTop(scroller)` — and re-run. Expected: the
test *"holds the absolute position while the preview cannot be measured"* goes RED,
because the editor still exists during the rebuild and yields a number. **Record
that failure text in the commit message.** Restore and confirm green.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm format
git add src/broker.ts src/card/picture-studio-card.ts src/editor/picture-studio-editor.ts src/tests
git commit -m "feat(editor): hold the preview's framing, of which a drag is the zero-delta case"
```

---

### Task 6: the editor reserves its outgoing form's height

**Files:**
- Modify: `src/editor/picture-studio-editor.ts` — `_reserveHeight`
- Test: `src/tests/happy-dom/editor/picture-studio-editor.test.ts`

**Interfaces:**
- Consumes: nothing beyond Task 5's call site.
- Produces: `private _reserveHeight(): () => void` — sets `min-height` on the
  host from the outgoing content's **outer** box and returns an idempotent
  release.

- [ ] **Step 1: Write the failing test**

Add to `src/tests/happy-dom/editor/picture-studio-editor.test.ts`, inside the
*"a position commit must not move the view"* describe (it has the harness):

```ts
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

    h.el.select(1, "picture");
    expect(h.el.style.minHeight).toBe("626px");

    await settle();
    // And it lets go: pinning a genuinely different height would be visible.
    expect(h.el.style.minHeight).toBe("");
    window.getComputedStyle = realComputed;
    h.cleanup();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: FAIL — `expected "" to be "626px"`. This is the check that would have
saved two rounds in the session that produced the spec: the height reservation
was delivered twice and was inert both times, and nothing said so.

- [ ] **Step 3: Write the implementation**

Replace the stub:

```ts
  /**
   * Reserve the outgoing form's height on the host while the next one renders,
   * and return the release.
   *
   * Symmetric with the card's reservation of the outgoing preview's height, and
   * for the same reason: without it the browser clamps the scroll before the
   * hold can correct anything, and the correction then has nothing left to
   * restore. The exact condition is that the target position must stay
   * reachable — the container at least `target scrollTop + visible height` tall
   * — and reserving the outgoing height covers it in the only problematic case,
   * a shorter successor.
   *
   * The **outer** box, margins included. `offsetHeight` counts padding and
   * borders and not margins, and reserving that much left the successor short
   * by exactly the missing gap — measured, 26px, which the layout then
   * reclaimed a frame later by pushing everything below back down.
   *
   * Released by the hold on every one of its exits, so the reservation lasts
   * exactly as long as the position it protects is still being corrected.
   */
  private _reserveHeight(): () => void {
    const box = this.getBoundingClientRect().height;
    if (box <= 0) return () => {};
    const style = getComputedStyle(this);
    const margins =
      (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
    this.style.minHeight = `${Math.ceil(box + margins)}px`;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.style.removeProperty("min-height");
    };
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: PASS.

- [ ] **Step 5: Confront the margin rule with its defect**

Temporarily drop `+ margins` and re-run. Expected: RED with `expected "600px" to
be "626px"`. **Record that failure text in the commit message.** Restore.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm format
git add src/editor/picture-studio-editor.ts src/tests/happy-dom/editor/picture-studio-editor.test.ts
git commit -m "feat(editor): reserve the outgoing form's height while the next renders"
```

---

### Task 7: the whole suite, the changelog and the spec

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-22-editor-scroll-design.md` — §2
- Modify: `.serena/memories/picture-studio/follow-ups.md` — entry 15
- Modify: `.serena/memories/picture-studio/state` — the test baseline

- [ ] **Step 1: Run the whole suite and the build**

```bash
pnpm test && pnpm lint && pnpm build
```
Expected: every test file reported, exit code 0 on all three. `pnpm lint` prints
the 25 warnings / 4 infos baseline — the bar is the exit code, not silence. If
the warning count moved, the new code is what moved it; fix it rather than
recording a new baseline.

- [ ] **Step 2: Write the changelog entry**

Under the existing `## 1.5.3 — unreleased`, in the `### Fixed` section, after the
drag entry:

```markdown
- On an iPhone or iPad, tapping an item on the picture scrolled the picture off
  the screen as the item's form opened in its place. The picture now stays where
  it is; only the form beside or under it changes. Tapping an item in the list
  still opens its form at the top, as before.
```

Do **not** touch the heading's `unreleased`. That word is the safety catch the
release workflow enforces, and replacing it is the release act.

- [ ] **Step 3: Amend the spec's §2**

Replace the table in §2 with the settled one, and add the note below it:

```markdown
| Trigger | Form's container | Dialog's container |
|---|---|---|
| A form **opens from the list** — a row clicked, Add | to the start | to the start |
| A form **opens from the picture** | to the start | **held** |
| **No form opens** — item in error, back, a deletion, a reorder | its row into view | **held** |
| **No selection change** — a field edit, a drag committing | — | **held** |

**This table replaces the one written above, and it is shorter for a reason.**
Settled with the user on 2026-08-22, before the build.

The third row said "per the origin", which was under-specified, and two further
rows were then tried, giving a deletion and a drag behaviours of their own. Both
were symptoms of asking the wrong question. The right one is not *where did the
call come from* but **does a form open because the reader asked for it in the
list?** — and it is asked in one branch only.

Everything follows from that:

- **The form's container is written unconditionally**, its target set by the
  trigger alone. Below 1000px the write is inert, so it costs nothing; above it,
  that container is the only one that moves.
- **The dialog's container is held unconditionally**, with that single exception.
  Above 1000px holding is inert, so it costs nothing there either. Neither side
  ever asks which mode it is in.
- **Deleting an item and reordering the list carry a *list* origin** — the ✕ and
  the drag handle are in the list — but no form opens, so nothing follows, and
  "delete an item and nothing scrolls" falls out rather than needing a case.
- **"Nothing" is not a behaviour**, it is "held" with a delta of zero. A drag
  alters coordinates only, so the correction computes to 0 at runtime. §3 already
  said this of the mechanism; the table now says it too.
```

- [ ] **Step 4: Strike follow-up entry 15**

In `.serena/memories/picture-studio/follow-ups.md`, change the heading to
`## ~~15. Where the editor scrolls, and when it must not~~ — DONE 2026-08-22`,
keep the body, and add one line naming what closed it: the six commits of this
plan, and the note that §2's third row was amended in the same breath. **Do not
renumber anything.**

- [ ] **Step 5: Refresh the test baseline**

In `.serena/memories/picture-studio/state`, update the recorded test count and
`testFiles` from Step 1's full run, with today's date. **Only from a run that
reported every test file** — a scoped run prints the same JSON shape and would
silently corrupt the record.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md docs/superpowers .serena/memories
git commit -m "docs: the editor's two scroll containers, and what closed follow-up 15"
```

---

### Task 8: confirm it on a real iPhone

**This task is not optional and the work is not done without it.** happy-dom lays
nothing out and the browser lane is Chromium, which never reproduced any of this.
Only a real WebKit answers for the pixels.

**Files:**
- Modify: `src/card/picture-studio-card.ts` — a temporary overlay, removed in Step 6
- Modify: `.ha/config/.storage/lovelace_resources` — the cache-busting `?v=`

- [ ] **Step 1: Build and serve**

```bash
pnpm build
```
Then bump the `?v=` in `.ha/config/.storage/lovelace_resources` and restart:
```bash
docker compose restart picture-studio-ha
```
Without both, the WebView replays the old bundle and every reading is of the
previous build.

- [ ] **Step 2: Add the temporary overlay**

In the card's render, behind `this.editing`, a diagnostic strip. **`position:
fixed`, `pointer-events: none`, out of the flow and out of the event path** — a
`position: sticky` strip in flow gained a line as its own text grew and
manufactured ~12px of the very movement being hunted.

```ts
  /**
   * TEMPORARY — the iPhone instrument, removed before this branch closes.
   * The companion app has no console, so the reading has to be on the card. Out
   * of the flow, out of the scroll and out of the event path, or what it reports
   * is the instrument.
   */
  private _trace(): unknown {
    if (!this.editing || !TRACE) return nothing;
    return html`<div
      style="position:fixed;top:0;left:0;z-index:99999;pointer-events:none;
             background:#000c;color:#0f0;font:10px/1.2 monospace;padding:2px 4px;
             white-space:pre;max-width:100vw;overflow:hidden"
    >${this._traceText}</div>`;
  }
```

Have the editor push into it, on each hold frame and on each container write:
the build marker, which container was written, the value before and after, and
whether `viewportTop()` returned a number or undefined. **The build marker and
"the code did something" are two different checks and both are worth having** —
a marker proves which bundle is loaded and nothing about whether the fix ran.

- [ ] **Step 3: Walk the four triggers on the phone**

For each, read the overlay and note what moved:

1. Tap an item **in the list** → the form opens at its top.
2. Tap an item **on the picture** → **the picture does not move a pixel**.
3. Tap the **background of the picture** → the form closes, the picture does not move.
4. **Drag** an item and release → nothing moves. Then drag the *same* item again
   → still nothing (this is 1.5.3's other fix; confirm it did not regress).

Then repeat 1–4 with the Items section already collapsed, and once in a **panel**
view and once in a **sections** view — the user's own walk covers both every time.

- [ ] **Step 4: If a trigger is wrong, measure before fixing**

Read the overlay first: which container was written, with what value, and whether
the anchor was measurable. **When the second fix for one symptom fails, stop
fixing and go measure where the failure actually originates** — five fixes were
once aimed at one symptom and all five were the same mistake repeated.

- [ ] **Step 5: Report the readings to the user**

Verbatim, per trigger. Do not summarise a phone reading into "it works".

- [ ] **Step 6: Remove the overlay, rebuild, confirm once more**

```bash
git diff --stat   # the overlay must be gone
pnpm build && pnpm test && pnpm lint
```
Bump `?v=` and restart once more, and confirm trigger 2 on the phone with the
clean bundle — that the confirmation survives the removal of the instrument is
itself part of the check.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: confirm the editor's scroll behaviour on a real iPhone"
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
|---|---|
| §1 the two containers, found by different criteria, flattened walk | 1 |
| §2 the rules table (as amended) | 4, 5 |
| §3 one mechanism, preview anchor, "settled" reused | 5 |
| §4 the editor's reservation, outer box with margins | 6 |
| §4 the card's reservation | already committed — untouched |
| §5 the three `scrollIntoView` replaced | 2 (list), 4 (updated, `_showListAt`), 5 (`_holdScroll`) |
| §5 `select()` learns the origin — three of them, `commit` included | 3 |
| §6 1.5.3, no bump | 7 |
| §7 the four traps | Global Constraints; 1 Step 5, 5 Step 5, 6 Step 5 |
| §8 declared geometry, iPhone confirmation, on-card overlay | every test harness; 8 |

**Type consistency.** `rowFor` (2) is consumed by `_showListAt` (4) under the same
name and signature. `SelectOrigin` (3) — two members, `"list" | "picture"` — is
read in exactly two places: `updated` (4), in the branch where a form opens, and
`select` plus the hold's guard (5). `_showListAt` takes no origin at all.
`viewportTop` (5) is declared on `CardChannel` and implemented on the card in the
same task, and the four existing `registerCard({ reanchor: … })` literals in the
editor test file are updated there. `_holdRelease` is declared in Task 3 alongside
`_selectOrigin` and used in Task 5. `_reserveHeight` is stubbed in Task 5 and
filled in Task 6, so each task's suite is green on its own.

**Out of scope, flagged not fixed.** Collapsing the Items section deselects, and
`_showListAt` then calls `section.expand()` — which re-opens the section the
reader just closed. That is today's behaviour and this work does not change it.

**Known interim red.** Task 2 leaves the editor suite red (it still calls
`scrollToItem`) and Task 4 leaves the hold tests red (single-scroller harness).
Both are named in the task that leaves them and closed by the next. Nothing else
is left red across a commit boundary.
