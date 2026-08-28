# Selection Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dock a toolbar in the editor's preview, between the card heading and the picture, carrying the selected item's anchor, a way back to keep-ratio, and the tool picker that says what a corner drag means.

**Architecture:** The toolbar is a presentational Lit element that receives a snapshot of the selected item and **emits events**; the card translates those into `EditorChannel` calls, exactly as it already does for the drag and the resize. Separately, the corner gesture becomes a **tool object** owning its own handles, hit test and commit, so a tool that does nothing is inert by construction rather than by a special case in the card; the active tool is editor state, because the card element does not survive a config commit.

**Tech Stack:** TypeScript, Lit 3, rstest (two lanes: `happy-dom` for logic, `playwright` for anything needing real layout), Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-28-selection-toolbar-design.md` — read it before Task 1. The plan argues from it and does not restate its reasoning.

## Global Constraints

- **Branch:** `feat/selection-toolbar`, cut from `next`, target recorded (`git config --get branch.feat/selection-toolbar.target` → `next`). Never push; the user pushes.
- **Language:** all code, comments, tests, docs and commit messages in **English**. Chat is French.
- **Serena is primary for code.** Explore with `get_symbols_overview` / `find_symbol`; edit with `replace_symbol_body` / `insert_after_symbol` / `replace_content`. Built-in Read/Edit only for `.md`, JSON, YAML and config, or when Serena fails on an unparseable file. **This rule travels into every subagent prompt that touches code.**
- **Formatter after every modification:** `pnpm format` (Biome), then `pnpm lint` must show no diagnostic in a file this branch touched. 26 warnings and 4 infos pre-exist in files this branch does not own; do not "fix" them here.
- **`height` absent IS keep-ratio.** There is no `keep_ratio` key. Restoring keep-ratio means **omitting the key** from the box passed to `patchBox`, never setting it to `undefined`. `"height" in config` is the predicate every reader uses.
- **The toolbar writes no new config key.** Everything goes through `patchAnchor` and `patchBox`, which exist. The active tool never reaches the config at all.
- **The toolbar exists only while `editing` is true**, i.e. inside the edit dialog's own preview (`_inEditPreview`). It must never render on a dashboard.
- **Tokens with fallback chains, never raw colours.** The shape to copy is in `anchor-picker.ts`: `var(--ha-switch-border-color, var(--ha-color-border-neutral-normal, var(--divider-color)))`. Deviating from HA's spacing scale is allowed and must carry a comment saying why, on the `--grid-padding: 2px` precedent.
- **Icons are named, not inlined:** `ha-icon` with an `mdi:` name. A name used by one component stays at its call site; `editor/icons.ts` holds only names two components must agree on.
- **No version bump** in `package.json` unless the user asks in so many words.
- **`CHANGELOG.md`** is updated in Task 10, under `## 1.6.0 — unreleased`, in `### Added`, written for users of the card.
- **Test baseline:** the delivery's full `pnpm test` run updates `testFiles` and `passedTests` with the date in `mem:picture-studio/1.6.0-handoff`. Scoped runs never touch it. Last recorded: 2026-08-26, 52 files, 1030 tests.

## File Structure

**Created:**

| File | Responsibility |
| ---- | -------------- |
| `src/editor/anchor-input.ts` | The 3×3 anchor grid alone, with an optional label. Emits `anchor-changed`. Two consumers: the form's picker and the toolbar's modal. |
| `src/card/toolbar.ts` | The docked toolbar. Presentational: it receives a snapshot and emits events, and calls no channel itself. |
| `src/card/tools/tool.ts` | The `Tool` interface, `ToolId`, `ToolTarget`, `ToolHit`. No implementation. |
| `src/card/tools/resize-tool.ts` | Wraps `createResizeController`, owns the handle nodes and the handle hit test. |
| `src/card/tools/distort-tool.ts` | The no-op tool. Four methods that do nothing, on purpose. |
| `src/tests/happy-dom/editor/anchor-input.test.ts` | The five grid tests moved out of the picker's file. |
| `src/tests/happy-dom/card/toolbar.test.ts` | The render matrix, the emitted events, the modal's open/close. |
| `src/tests/happy-dom/card/tools.test.ts` | Tool selection, the no-op's inertness, `render`'s three triggers and its gesture guard. |
| `src/tests/playwright/toolbar.test.ts` | The three claims that need a layout engine. |

**Modified:**

| File | Change |
| ---- | ------ |
| `src/config.ts` | Two tag constants: `ANCHOR_INPUT_TAG`, `TOOLBAR_TAG`. |
| `src/index.ts` | Register both new elements, following the existing `if (!customElements.get(...))` shape. |
| `src/editor/anchor-picker.ts` | Becomes switch + separator + `picture-studio-anchor-input`. Keeps its own tag and its event. |
| `src/broker.ts` | `EditorChannel` gains `tool()` and `setTool(tool)`. |
| `src/editor/picture-studio-editor.ts` | Implements them; `select()` resets the tool. |
| `src/card/picture-studio-card.ts` | Renders the toolbar; mirrors the tool into a reactive property; hands the handle nodes and `_hitHandle` to the resize tool; wires the toolbar's events to the channel. |
| `src/strings.ts` | New own-catalogue keys, `en` and `fr`. |
| `src/tests/happy-dom/editor/anchor-picker.test.ts` | Loses the five grid tests, gains a composition test. |
| `CHANGELOG.md` | One `### Added` entry under `## 1.6.0 — unreleased`. |

---

### Task 1: Extract `picture-studio-anchor-input`

**Files:**
- Create: `src/editor/anchor-input.ts`
- Create: `src/tests/happy-dom/editor/anchor-input.test.ts`
- Modify: `src/config.ts` (tag constant), `src/index.ts` (registration), `src/editor/anchor-picker.ts` (composes the new element)
- Modify: `src/tests/happy-dom/editor/anchor-picker.test.ts` (five tests leave, one arrives)

**Interfaces:**
- Consumes: `ANCHOR_OFFSETS`, `Anchor` from `src/position.ts`; `localizeOwn` from `src/strings.ts`.
- Produces: `PictureStudioAnchorInput` with properties `hass?: HomeAssistant`, `anchor?: Anchor`, `label?: string`; emits `anchor-changed` with `detail: { anchor: Anchor }`, `bubbles: true`, `composed: true`. Tag constant `ANCHOR_INPUT_TAG = "picture-studio-anchor-input"`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/happy-dom/editor/anchor-input.test.ts`. Move the five grid tests from `anchor-picker.test.ts` verbatim (`lays out one cell per fixed anchor…`, `emits the anchor of whichever cell is clicked`, `marks the chosen cell, and only that one`, `is where an unset anchor starts, with nothing marked on the grid`, `leaves every cell clickable while it is on`), retargeting the mount, and add the label test:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { ANCHOR_INPUT_TAG } from "../../../config";
import { PictureStudioAnchorInput } from "../../../editor/anchor-input";
import { ANCHOR_OFFSETS, type Anchor } from "../../../position";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(ANCHOR_INPUT_TAG)) {
  customElements.define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);
}

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: () => "",
} as unknown as HomeAssistant;

const mount = async (anchor?: Anchor, label?: string): Promise<PictureStudioAnchorInput> => {
  const el = document.createElement(ANCHOR_INPUT_TAG) as PictureStudioAnchorInput;
  el.hass = hass;
  el.anchor = anchor;
  el.label = label;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const cells = (el: PictureStudioAnchorInput): HTMLButtonElement[] =>
  Array.from(el.renderRoot.querySelectorAll("button.cell"));

afterEach(() => {
  document.body.replaceChildren();
});

describe("the anchor input", () => {
  it("lays out one cell per fixed anchor, in the order the grid reads", async () => {
    const el = await mount();
    expect(cells(el).map((c) => c.getAttribute("aria-label"))).toEqual(Object.keys(ANCHOR_OFFSETS));
  });

  it("renders bare when it is given no label", async () => {
    const el = await mount("center");
    expect(el.renderRoot.querySelector("ha-formfield")).toBeNull();
    expect(el.renderRoot.querySelector(".grid")).not.toBeNull();
  });

  it("wraps itself in a formfield when it is given one", async () => {
    const el = await mount("center", "Anchored");
    const field = el.renderRoot.querySelector("ha-formfield") as HTMLElement & { label?: string };
    expect(field).not.toBeNull();
    expect(field.label).toBe("Anchored");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test src/tests/happy-dom/editor/anchor-input.test.ts`
Expected: FAIL — the module `../../../editor/anchor-input` does not exist.

- [ ] **Step 3: Create the element**

Create `src/editor/anchor-input.ts`. Move `CELLS`, the grid markup, the `.grid` / `.cell` / `.selected` styles and the `_emit` helper out of `anchor-picker.ts` verbatim. Two things change and only two:

```ts
/**
 * The nine fixed anchors as a 3x3 grid. Extracted from the form's picker so the
 * toolbar's modal can mount it without the switch, the separator and the label
 * that only make sense in a form row.
 *
 * `label` is optional because the two consumers differ on exactly that: the form
 * row needs HA's own label styling, which is what `ha-formfield` gives by
 * construction rather than by copying values out of HA's CSS; the modal is
 * opened by a button that already says what it is.
 */
export class PictureStudioAnchorInput extends LitElement {
  static properties = {
    hass: { attribute: false },
    anchor: { attribute: false },
    label: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare anchor?: Anchor;
  declare label?: string;

  private _emit(anchor: Anchor): void {
    this.dispatchEvent(
      new CustomEvent("anchor-changed", { detail: { anchor }, bubbles: true, composed: true }),
    );
  }

  protected render() {
    const anchor = this.anchor ?? "auto";
    // The grid is always clickable — clicking a cell is how the user leaves the
    // automatic mode. The .anchored class is a visual state, not a disabled one;
    // do not add a disabled attribute to match.
    const grid = html`
      <div class=${anchor === "auto" ? "grid" : "grid anchored"}>
        ${CELLS.map(
          (cell) => html`
            <button
              type="button"
              class=${cell === anchor ? "cell selected" : "cell"}
              aria-label=${cell}
              aria-pressed=${cell === anchor}
              @click=${() => this._emit(cell)}
            ></button>
          `,
        )}
      </div>
    `;
    return this.label === undefined
      ? grid
      : html`<ha-formfield .label=${this.label}>${grid}</ha-formfield>`;
  }
```

In the moved styles, rename `.fixed` to `.anchored` (one vocabulary with the form's label and with the toolbar's button), and make the label-only spacing conditional:

```css
    /* ha-formfield only spaces the controls it knows about — its rule is
       ::slotted(ha-switch) { margin-inline-end: 10px }. Ours is a plain div in
       that slot, so it has to claim the same gap itself. Scoped to the labelled
       case: with no formfield around it there is nothing to sit beside. */
    :host([label]) .grid {
      margin-inline-end: 10px;
    }
```

Because `label` is declared `attribute: false`, add `reflect` is **not** the answer — Lit will not write the attribute. Use a host class instead: in `render`, wrap the labelled branch in `<div class="labelled">` and scope the rule to `.labelled .grid`.

- [ ] **Step 4: Register the tag**

In `src/config.ts`, beside `PICKER_TAG`:

```ts
export const ANCHOR_INPUT_TAG = "picture-studio-anchor-input";
```

In `src/index.ts`, import `PictureStudioAnchorInput` and `ANCHOR_INPUT_TAG` and add, next to the picker's registration:

```ts
if (!customElements.get(ANCHOR_INPUT_TAG)) {
  customElements.define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);
}
```

- [ ] **Step 5: Run the input's tests**

Run: `pnpm test src/tests/happy-dom/editor/anchor-input.test.ts`
Expected: PASS, all eight.

- [ ] **Step 6: Rewrite the picker to compose it**

`picture-studio-anchor-picker` keeps its tag, its properties and its event. Its render becomes the row and nothing else:

```ts
  protected render() {
    const anchor = this.anchor ?? "auto";
    const isAuto = anchor === "auto";
    return html`
      <div class="row">
        <div class="half">
          <ha-formfield .label=${this.hass?.localize("ui.common.auto") || "Automatic"}>
            <ha-switch
              .checked=${isAuto}
              @change=${(ev: Event) =>
                this._emit((ev.target as HTMLInputElement).checked ? "auto" : "center")}
            ></ha-switch>
          </ha-formfield>
        </div>
        <hr class="sep" />
        <div class="half">
          <picture-studio-anchor-input
            .hass=${this.hass}
            .anchor=${this.anchor}
            .label=${localizeOwn(this.hass, "anchor_anchored")}
          ></picture-studio-anchor-input>
        </div>
      </div>
    `;
  }
```

Delete the grid styles it no longer draws; keep `.row`, `.half` and `.sep`. `anchor-changed` from the input is `composed` and `bubbles`, so it crosses the picker's shadow boundary on its own — **do not re-dispatch it**, or every cell click fires twice.

- [ ] **Step 7: Move the picker's tests and add the composition test**

Delete the five grid tests from `anchor-picker.test.ts`; keep `falls back to center when the switch is turned off` and `returns to auto when the switch is turned back on`. Add:

```ts
  it("lets the input's event cross out of the picker, exactly once", async () => {
    const el = await mount("center");
    const input = el.renderRoot.querySelector(
      "picture-studio-anchor-input",
    ) as HTMLElement & { renderRoot: ShadowRoot };
    const seen: Anchor[] = [];
    el.addEventListener("anchor-changed", (ev) => {
      seen.push((ev as CustomEvent<{ anchor: Anchor }>).detail.anchor);
    });
    (input.renderRoot.querySelector('button[aria-label="top-left"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(seen).toEqual(["top-left"]);
  });
```

The `toEqual(["top-left"])` rather than a truthiness check is the point: a re-dispatch in the picker would make this `["top-left", "top-left"]` and any weaker assertion would stay green.

The picker's test file must define both tags, since it now mounts two:

```ts
if (!customElements.get(ANCHOR_INPUT_TAG)) {
  customElements.define(ANCHOR_INPUT_TAG, PictureStudioAnchorInput);
}
```

- [ ] **Step 8: Run both files and the three forms' suites**

Run: `pnpm test src/tests/happy-dom/editor/anchor-input.test.ts src/tests/happy-dom/editor/anchor-picker.test.ts src/tests/happy-dom/editor/badge-form.test.ts src/tests/happy-dom/editor/image-form.test.ts src/tests/happy-dom/editor/state-label-form.test.ts`
Expected: PASS. The form suites are unchanged and must stay so; a failure there means the picker's contract moved.

- [ ] **Step 9: Format, lint, commit**

```bash
pnpm format && pnpm lint
git add src/editor/anchor-input.ts src/editor/anchor-picker.ts src/config.ts src/index.ts src/tests/happy-dom/editor/anchor-input.test.ts src/tests/happy-dom/editor/anchor-picker.test.ts
git commit -m "refactor(editor): the anchor grid becomes its own input"
```

---

### Task 2: The toolbar shell

**Files:**
- Create: `src/card/toolbar.ts`
- Create: `src/tests/happy-dom/card/toolbar.test.ts`
- Modify: `src/config.ts`, `src/index.ts`, `src/card/picture-studio-card.ts` (render + styles)

**Interfaces:**
- Consumes: nothing from Task 1 yet.
- Produces: `TOOLBAR_TAG = "picture-studio-toolbar"`; `PictureStudioToolbar` with properties `hass?: HomeAssistant`, `item?: PictureItem`, `index?: number`. Renders `.bar` with `.anchor-group` and, when tools apply, `.sep` + `.tools`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { TOOLBAR_TAG } from "../../../config";
import { PictureStudioToolbar } from "../../../card/toolbar";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(TOOLBAR_TAG)) {
  customElements.define(TOOLBAR_TAG, PictureStudioToolbar);
}

const hass = { states: {}, language: "en", localize: () => "" } as unknown as HomeAssistant;

const mount = async (item?: unknown, index?: number): Promise<PictureStudioToolbar> => {
  const el = document.createElement(TOOLBAR_TAG) as PictureStudioToolbar;
  el.hass = hass;
  // biome-ignore lint/suspicious/noExplicitAny: the fixtures are partial items on purpose
  el.item = item as any;
  el.index = index;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const imageItem = {
  type: "element",
  anchor: "auto",
  position: { x: 50, y: 50 },
  config: { type: "image", width: 20 },
};

const badgeItem = { type: "badge", anchor: "auto", position: { x: 50, y: 50 }, config: {} };

afterEach(() => {
  document.body.replaceChildren();
});

describe("the toolbar", () => {
  it("shows the anchor group with nothing selected, disabled", async () => {
    const el = await mount(undefined, undefined);
    expect(el.renderRoot.querySelector(".anchor-group")).not.toBeNull();
    const buttons = Array.from(el.renderRoot.querySelectorAll(".anchor-group button"));
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("draws no separator for an item that has no tools", async () => {
    const el = await mount(badgeItem, 0);
    expect(el.renderRoot.querySelector(".sep")).toBeNull();
  });

  it("draws the separator for an image", async () => {
    const el = await mount(imageItem, 0);
    expect(el.renderRoot.querySelector(".sep")).not.toBeNull();
  });

  it("disables everything for an unreadable item", async () => {
    const el = await mount({ type: "unknown" }, 0);
    const buttons = Array.from(el.renderRoot.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
```

The badge/image pair in the same file is the discriminating fixture: the separator's absence is only observable against an item that has tools.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the element**

`src/card/toolbar.ts`, with the group order the spec fixes — anchor first, because it is the only invariant and therefore the only thing that can hold the origin:

```ts
/**
 * The editor's toolbar, docked between the card heading and the picture.
 *
 * Presentational on purpose: it receives a snapshot of the selected item and
 * emits events. The card owns the channel, exactly as it does for the drag and
 * the resize, so this element is testable without a broker.
 *
 * A snapshot is right here where it would be wrong in a tool: this renders on
 * every config change and never survives a gesture, so there is nothing to go
 * stale between a read and a write.
 */
export class PictureStudioToolbar extends LitElement {
  static properties = {
    hass: { attribute: false },
    item: { attribute: false },
    index: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare item?: PictureItem;
  declare index?: number;

  /** Tools apply to an image element and to nothing else, for now. */
  private get _hasTools(): boolean {
    const item = this.item;
    return item?.type === "element" && item.config.type === "image";
  }

  private get _disabled(): boolean {
    return this.item === undefined || this.index === undefined || this.item.type === "unknown";
  }

  protected render() {
    return html`
      <div class="bar">
        <div class="anchor-group">${this._renderAnchorGroup()}</div>
        ${this._hasTools ? html`<hr class="sep" /><div class="tools">${this._renderTools()}</div>` : nothing}
      </div>
    `;
  }
```

`_renderAnchorGroup` and `_renderTools` return two disabled placeholder buttons each for now; Tasks 3 and 5 fill them. The placeholders are not "TODO" — they are the disabled state the final buttons also have, so the four tests above assert real behaviour.

Styles: `.bar` is `display: flex; align-items: center;` with `gap` and padding from HA tokens with fallbacks; `.sep` copies the `align-self: stretch; border-left: 1px solid var(--divider-color)` idiom the picker already uses for its own rule.

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: PASS, all four.

- [ ] **Step 5: Register and render it from the card**

`src/config.ts`: `export const TOOLBAR_TAG = "picture-studio-toolbar";`
`src/index.ts`: the usual guarded `customElements.define`.

In `PictureStudioCard.render()`, between the heading and `.root`:

```ts
        ${
          this.editing
            ? html`
                <picture-studio-toolbar
                  .hass=${this.hass}
                  .item=${this.selected === undefined ? undefined : this._config.items[this.selected]}
                  .index=${this.selected}
                ></picture-studio-toolbar>
              `
            : nothing
        }
```

It is a **sibling of `.root`**, never inside it: `.root` is the size container every element's `cqw` clamp resolves against, and a child would change what a percentage means.

- [ ] **Step 6: Assert the card renders it only while editing**

Add to `src/tests/happy-dom/card/picture-studio-card.test.ts`, next to the existing editing-state tests:

```ts
  it("renders no toolbar on a dashboard", async () => {
    const card = await mountCard(config);
    expect(card.renderRoot.querySelector("picture-studio-toolbar")).toBeNull();
  });
```

Follow that file's existing helper for putting a card into the editing state, and add the mirror assertion that the toolbar **is** present there.

- [ ] **Step 7: Run, format, lint, commit**

```bash
pnpm test src/tests/happy-dom/card/toolbar.test.ts src/tests/happy-dom/card/picture-studio-card.test.ts
pnpm format && pnpm lint
git add src/card/toolbar.ts src/config.ts src/index.ts src/card/picture-studio-card.ts src/tests/happy-dom/card/toolbar.test.ts src/tests/happy-dom/card/picture-studio-card.test.ts
git commit -m "feat(card): a toolbar docked above the picture while editing"
```

---

### Task 3: The anchor group

**Files:**
- Modify: `src/card/toolbar.ts`, `src/card/picture-studio-card.ts` (wire the event), `src/strings.ts`
- Modify: `src/tests/happy-dom/card/toolbar.test.ts`

**Interfaces:**
- Consumes: `ANCHOR_OFFSETS` from `src/position.ts`; `localizeOwn` from `src/strings.ts`.
- Produces: the toolbar emits `anchor-changed` with `detail: { anchor: Anchor }`, `bubbles`, `composed` — deliberately the same event the input emits, so the card wires one listener.

- [ ] **Step 1: Write the failing tests**

```ts
  it("emits auto when the wand is pressed", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    let seen: string | undefined;
    el.addEventListener("anchor-changed", (ev) => {
      seen = (ev as CustomEvent<{ anchor: string }>).detail.anchor;
    });
    (el.renderRoot.querySelector("button.auto") as HTMLButtonElement).click();
    expect(seen).toBe("auto");
  });

  it("lights the cell the item is anchored to, and only that one", async () => {
    const el = await mount({ ...imageItem, anchor: "top-right" }, 0);
    const lit = Array.from(el.renderRoot.querySelectorAll(".mini span.on"));
    expect(lit).toHaveLength(1);
    expect((lit[0] as HTMLElement).dataset.cell).toBe("top-right");
  });

  it("lights no cell under the automatic anchor", async () => {
    const el = await mount({ ...imageItem, anchor: "auto" }, 0);
    expect(el.renderRoot.querySelectorAll(".mini span.on")).toHaveLength(0);
  });

  it("writes nothing when the anchored button is pressed", async () => {
    const el = await mount({ ...imageItem, anchor: "auto" }, 0);
    let fired = false;
    el.addEventListener("anchor-changed", () => {
      fired = true;
    });
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    expect(fired).toBe(false);
  });
```

The last one is the decision that is easiest to get wrong: `anchored` is a disclosure, not a switch, because nothing remembers the previous fixed point.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: FAIL — no `button.auto`, no `.mini`.

- [ ] **Step 3: Implement the group**

```ts
  /**
   * The miniature is a display, not the input. It walks ANCHOR_OFFSETS, which is
   * where the nine points and their row-major order are declared and where the
   * form's input reads them too — so the two cannot drift without the data
   * moving under both of them.
   */
  private _renderAnchorGroup() {
    const anchor = this.item?.type === "unknown" ? undefined : this.item?.anchor;
    const disabled = this._disabled;
    return html`
      <button
        type="button"
        class=${anchor === "auto" ? "auto on" : "auto"}
        ?disabled=${disabled}
        title=${localizeOwn(this.hass, "anchor_auto")}
        @click=${() => this._emitAnchor("auto")}
      >
        <ha-icon icon="mdi:auto-fix"></ha-icon>
      </button>
      <button
        type="button"
        class=${anchor !== undefined && anchor !== "auto" ? "anchored on" : "anchored"}
        ?disabled=${disabled}
        title=${localizeOwn(this.hass, "anchor_anchored")}
        @click=${this._openPicker}
      >
        <span class="mini">
          ${CELLS.map(
            (cell) =>
              html`<span class=${cell === anchor ? "on" : ""} data-cell=${cell}></span>`,
          )}
        </span>
      </button>
    `;
  }
```

`_openPicker` is a no-op until Task 4. `CELLS` is `Object.keys(ANCHOR_OFFSETS)`, imported — not redeclared.

Add to `src/strings.ts`, in **both** `en` and `fr`: `anchor_auto: "Automatic"` / `"Automatique"`. `anchor_anchored` already exists in both.

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the card**

On the `<picture-studio-toolbar>` element in the card's render:

```ts
                  @anchor-changed=${(ev: CustomEvent<{ anchor: Anchor }>) => {
                    const index = this.selected;
                    if (index === undefined) return;
                    activeEditor()?.patchAnchor(index, ev.detail.anchor);
                  }}
```

`patchAnchor` already asks the card to `reanchor` before writing and sends anchor and position in one commit; do not reimplement either.

- [ ] **Step 6: Format, lint, commit**

```bash
pnpm format && pnpm lint
git add src/card/toolbar.ts src/card/picture-studio-card.ts src/strings.ts src/tests/happy-dom/card/toolbar.test.ts
git commit -m "feat(toolbar): the anchor group, and a miniature that cannot drift"
```

---

### Task 4: The modal anchor picker

**Files:**
- Modify: `src/card/toolbar.ts`, `src/tests/happy-dom/card/toolbar.test.ts`

**Interfaces:**
- Consumes: `PictureStudioAnchorInput` (Task 1), mounted with **no** `label`.
- Produces: nothing new outward — the input's `anchor-changed` bubbles through the toolbar and reaches the card listener wired in Task 3.

- [ ] **Step 1: Write the failing tests**

```ts
  it("opens the picker when the anchored button is pressed", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    await el.updateComplete;
    const dialog = el.renderRoot.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("picture-studio-anchor-input")).not.toBeNull();
  });

  it("mounts the input with no label, so the modal carries no form chrome", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    await el.updateComplete;
    const input = el.renderRoot.querySelector(
      "picture-studio-anchor-input",
    ) as HTMLElement & { label?: string };
    expect(input.label).toBeUndefined();
  });

  it("closes on a choice, and the choice leaves the toolbar", async () => {
    const el = await mount({ ...imageItem, anchor: "center" }, 0);
    (el.renderRoot.querySelector("button.anchored") as HTMLButtonElement).click();
    await el.updateComplete;
    let seen: string | undefined;
    el.addEventListener("anchor-changed", (ev) => {
      seen = (ev as CustomEvent<{ anchor: string }>).detail.anchor;
    });
    el.renderRoot
      .querySelector("picture-studio-anchor-input")
      ?.dispatchEvent(
        new CustomEvent("anchor-changed", {
          detail: { anchor: "bottom-left" },
          bubbles: true,
          composed: true,
        }),
      );
    await el.updateComplete;
    expect(seen).toBe("bottom-left");
    expect((el.renderRoot.querySelector("dialog") as HTMLDialogElement).open).toBe(false);
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: FAIL — no `<dialog>`.

- [ ] **Step 3: Implement it**

```ts
  /**
   * A modal <dialog>, not a popover.
   *
   * The requirement is that a click outside dismisses the picker and reaches
   * nothing. The native popover light-dismiss does not do that: the outside
   * pointerdown closes it AND still lands on what is beneath. showModal() gives
   * the whole requirement — the editor behind is inert, ::backdrop swallows the
   * click, and Escape closes.
   *
   * It is in the top layer, so it is above Home Assistant's own dialog and is
   * never clipped by ha-card's overflow — the same constraint that refused a
   * floating toolbar.
   */
  private _openPicker = (ev: Event): void => {
    const dialog = this.renderRoot.querySelector("dialog");
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    // Placed against the button rather than centred, which is what a modal
    // dialog does by default. Read before showModal(): the call is what makes
    // the dialog take layout, and the button's rect does not move.
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${rect.left}px`;
    dialog.showModal();
  };
```

The dialog element, rendered once and always present in the shadow root:

```ts
      <dialog
        @click=${this._backdropClick}
        @anchor-changed=${this._closePicker}
      >
        <picture-studio-anchor-input
          .hass=${this.hass}
          .anchor=${this.item?.type === "unknown" ? undefined : this.item?.anchor}
        ></picture-studio-anchor-input>
      </dialog>
```

`_backdropClick` closes when `ev.target === ev.currentTarget` — a click on the backdrop registers on the dialog element itself, which is the standard test. `_closePicker` calls `dialog.close()` and lets the event continue; **it must not `stopPropagation`**, or the choice never reaches the card.

Styles: `dialog { position: fixed; margin: 0; }` plus the theme tokens, and `dialog::backdrop { background: transparent; }` — the modality is what is wanted, not a dimming that would read as a second dialog over the editor's own.

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: PASS. If `showModal` is undefined in happy-dom, guard the call with a capability check and assert `dialog.open` through the same path the implementation uses — do **not** stub the DOM API in the test and assert your stub.

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm format && pnpm lint
git add src/card/toolbar.ts src/tests/happy-dom/card/toolbar.test.ts
git commit -m "feat(toolbar): the anchor picker opens as a modal, so a click outside reaches nothing"
```

---

### Task 5: Restore keep-ratio

**Files:**
- Modify: `src/card/toolbar.ts`, `src/card/picture-studio-card.ts`, `src/strings.ts`
- Modify: `src/tests/happy-dom/card/toolbar.test.ts`

**Interfaces:**
- Consumes: `ratioIsForced` from `src/image-box.ts`.
- Produces: the toolbar emits `keep-ratio-restore` with `detail: { index: number }`, `bubbles`, `composed`.

- [ ] **Step 1: Write the failing tests**

```ts
  const stretched = {
    ...imageItem,
    config: { type: "image", width: 20, height: 15 },
  };
  const liveCamera = {
    ...imageItem,
    config: { type: "image", width: 20, height: 15, camera_image: "camera.x", camera_view: "live" },
  };

  it("offers the restore button only when a height is stored", async () => {
    expect(
      ((await mount(imageItem, 0)).renderRoot.querySelector("button.keep-ratio") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      ((await mount(stretched, 0)).renderRoot.querySelector("button.keep-ratio") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("does not offer it when a live camera forces the ratio", async () => {
    const el = await mount(liveCamera, 0);
    expect(
      (el.renderRoot.querySelector("button.keep-ratio") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("emits the restore request with the item's index", async () => {
    const el = await mount(stretched, 3);
    let seen: number | undefined;
    el.addEventListener("keep-ratio-restore", (ev) => {
      seen = (ev as CustomEvent<{ index: number }>).detail.index;
    });
    (el.renderRoot.querySelector("button.keep-ratio") as HTMLButtonElement).click();
    expect(seen).toBe(3);
  });
```

The live-camera fixture is the discriminating one: without it, a rule reading only `"height" in config` passes and decision 14's second condition is untested.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: FAIL — no `button.keep-ratio`.

- [ ] **Step 3: Implement the button**

```ts
      <button
        type="button"
        class="keep-ratio"
        ?disabled=${!this._canRestoreRatio}
        title=${localizeOwn(this.hass, "keep_ratio_restore")}
        @click=${this._emitRestore}
      >
        <ha-icon icon="mdi:lock-reset"></ha-icon>
      </button>
```

```ts
  /**
   * A stored height is what keep-ratio is not, so it is what there is to undo.
   * Under a forced ratio there is nothing to restore: the height is already
   * dormant, and the item is in keep-ratio whatever the config says.
   */
  private get _canRestoreRatio(): boolean {
    const item = this.item;
    if (item?.type !== "element" || item.config.type !== "image") return false;
    return "height" in item.config && !ratioIsForced(item.config);
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/tests/happy-dom/card/toolbar.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the card, omitting the key**

```ts
                  @keep-ratio-restore=${(ev: CustomEvent<{ index: number }>) => {
                    const item = this._config?.items[ev.detail.index];
                    if (item?.type !== "element" || item.config.type !== "image") return;
                    // The key is omitted, never set to undefined: its presence IS
                    // the mode, and `"height" in config` is what every reader asks.
                    const { height: _dropped, ...box } = effectiveBox(item.config);
                    activeEditor()?.patchBox(ev.detail.index, box);
                  }}
```

- [ ] **Step 6: Assert the omission, not the value**

In `src/tests/happy-dom/card/picture-studio-card.test.ts`, with a stub editor recording the call:

```ts
    expect("height" in recorded.box).toBe(false);
```

`expect(recorded.box.height).toBeUndefined()` would pass for `{ height: undefined }`, which is exactly the bug the channel's contract warns about. Assert the key, not the value.

- [ ] **Step 7: Strings, format, lint, commit**

Add `keep_ratio_restore` to `en` ("Restore the image's proportions") and `fr` ("Rétablir les proportions de l'image").

```bash
pnpm format && pnpm lint
git add src/card/toolbar.ts src/card/picture-studio-card.ts src/strings.ts src/tests/happy-dom/card/toolbar.test.ts src/tests/happy-dom/card/picture-studio-card.test.ts
git commit -m "feat(toolbar): a way back to keep-ratio without reopening the form"
```

---

### Task 6: The active tool is editor state

**Files:**
- Modify: `src/broker.ts`, `src/editor/picture-studio-editor.ts`, `src/card/picture-studio-card.ts`
- Modify: `src/tests/happy-dom/editor/picture-studio-editor.test.ts`

**Interfaces:**
- Produces: `ToolId = "resize" | "distort"` exported from `src/card/tools/tool.ts` (created here, interface added in Task 7); `EditorChannel.tool(): ToolId` and `EditorChannel.setTool(tool: ToolId): void`; `PictureStudioCard.tool` reactive state property.

- [ ] **Step 1: Write the failing test**

```ts
  it("keeps the active tool across a commit, and resets it when the selection moves", async () => {
    const editor = await mountEditor(config);
    editor.select(0, "list");
    editor.setTool("distort");
    expect(editor.tool()).toBe("distort");
    // A commit rebuilds the card element; the editor is what survives it.
    editor.patchPosition(0, { x: 10, y: 10 });
    expect(editor.tool()).toBe("distort");
    editor.select(1, "list");
    expect(editor.tool()).toBe("resize");
  });
```

The commit in the middle is the whole point of the task: a test that only selects cannot tell editor state from card state.

- [ ] **Step 2: Run and see it fail**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: FAIL — `editor.setTool is not a function`.

- [ ] **Step 3: Create the tool id and extend the channel**

`src/card/tools/tool.ts`:

```ts
/** What a corner drag means. Move is not here: dragging the body always moves. */
export type ToolId = "resize" | "distort";

export const DEFAULT_TOOL: ToolId = "resize";
```

In `src/broker.ts`, on `EditorChannel`, with the reason attached because it is the decision a reader would undo:

```ts
  /**
   * The active tool, and where it lives.
   *
   * It is editor state, beside the selection, for the same reason: Home
   * Assistant rebuilds the card element on every config change, so a tool
   * remembered on the card would be lost after every resize and every move —
   * exactly when it is in use.
   */
  tool(): ToolId;
  setTool(tool: ToolId): void;
```

- [ ] **Step 4: Implement on the editor**

A private `_tool: ToolId = DEFAULT_TOOL`; `tool()` returns it; `setTool` assigns and calls `this.requestUpdate()`. In `select()`, **after** the early return for an unchanged index, reset `this._tool = DEFAULT_TOOL`. Placing it after that guard is deliberate: `drag-layer` re-selects the dragged item at every drop, and resetting there would clear the tool on every gesture.

- [ ] **Step 5: Mirror it on the card**

In `_syncEditing()`, beside the selection mirror:

```ts
    const tool = editing ? (editor?.tool() ?? DEFAULT_TOOL) : DEFAULT_TOOL;
    if (tool !== this.tool) this.tool = tool;
```

Declare `tool: { state: true }` in `static properties`, initialised to `DEFAULT_TOOL` in the constructor.

- [ ] **Step 6: Run, format, lint, commit**

```bash
pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts
pnpm format && pnpm lint
git add src/card/tools/tool.ts src/broker.ts src/editor/picture-studio-editor.ts src/card/picture-studio-card.ts src/tests/happy-dom/editor/picture-studio-editor.test.ts
git commit -m "feat(editor): the active tool lives where it survives a commit"
```

---

### Task 7: Tools as objects, and the resize tool

**Files:**
- Modify: `src/card/tools/tool.ts` (the interface)
- Create: `src/card/tools/resize-tool.ts`
- Create: `src/tests/happy-dom/card/tools.test.ts`
- Modify: `src/card/picture-studio-card.ts` (hand over the handles and the hit test)

**Interfaces:**
- Consumes: `createResizeController` and `ResizeOptions` from `src/card/resize-layer.ts`; `HANDLE_CORNERS` moves out of the card.
- Produces:

```ts
export interface ToolTarget {
  element: HTMLElement;
  index: number;
}

export interface Tool {
  readonly id: ToolId;
  /** Reconciles handles and state from fresh config. Inert during its own gesture. */
  render(target: ToolTarget | undefined): void;
  attach(root: HTMLElement): void;
  detach(): void;
  /** Single owner of the hit test for its own handles. */
  hit(target: EventTarget | null): ResizeHit | undefined;
}

export const createResizeTool: (options: ResizeOptions) => Tool;
```

- [ ] **Step 1: Write the failing tests**

```ts
  it("mounts handles on the selected wrapper and nowhere else", async () => {
    const tool = createResizeTool(options);
    tool.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(4);
    tool.render({ element: wrapperB, index: 1 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
    expect(wrapperB.querySelectorAll(".handle")).toHaveLength(4);
  });

  it("mounts nothing when there is no selection", async () => {
    const tool = createResizeTool(options);
    tool.render({ element: wrapperA, index: 0 });
    tool.render(undefined);
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
  });

  it("mounts nothing on an item the resize does not govern", async () => {
    const tool = createResizeTool({ ...options, getConfig: () => undefined });
    tool.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
  });

  it("leaves the handles alone while its own gesture is running", async () => {
    const tool = createResizeTool(options);
    tool.render({ element: wrapperA, index: 0 });
    const before = Array.from(wrapperA.querySelectorAll(".handle"));
    startGestureOn(wrapperA, "bottom-right");
    tool.render({ element: wrapperA, index: 0 });
    expect(Array.from(wrapperA.querySelectorAll(".handle"))).toEqual(before);
  });

  it("answers the hit test for its own handles, and for nothing else", async () => {
    const tool = createResizeTool(options);
    tool.render({ element: wrapperA, index: 0 });
    const handle = wrapperA.querySelector(".handle-bottom-right") as HTMLElement;
    expect(tool.hit(handle)?.corner).toBe("bottom-right");
    expect(tool.hit(wrapperA)).toBeUndefined();
  });
```

The fourth test is the one that would otherwise be discovered in a browser: `toEqual(before)` compares node identity, so a `render` that rebuilds identical-looking handles fails it. A length assertion would not.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test src/tests/happy-dom/card/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the resize tool**

Move `HANDLE_CORNERS` and the body of `_hitHandle` from the card into `src/card/tools/resize-tool.ts`. The mount logic replaces the loop in `_createChild`:

```ts
/**
 * The corner-resize tool: it owns its handle nodes, its hit test and its
 * gesture.
 *
 * The handles used to be built once per resizable item in `_createChild` and
 * shown by CSS on the selected one, guarding against two hazards named in a
 * comment there: the wrapper's box, and DOM churn under the pointer. Neither
 * reaches this code, and both facts are structural rather than circumstantial.
 * The handles are `position: absolute`, so mounting one cannot move the
 * `getBoundingClientRect()` both controllers read; and pointer capture is taken
 * on the WRAPPER — `hit.element` is `handle.closest(".item")` — so removing a
 * handle never touches the node holding it, and the hit is resolved once at
 * `pointerdown` and kept in the gesture's state.
 *
 * The gesture guard below is a belt, not the argument: it covers the one case
 * the structure does not, a selection changing mid-gesture from two fingers —
 * one dragging on the picture, one tapping a row in the editor's list.
 */
export const createResizeTool = (options: ResizeOptions): Tool => {
  const controller = createResizeController(options);
  let mounted: HTMLElement | undefined;

  const unmount = (): void => {
    mounted?.querySelectorAll(".handle").forEach((node) => node.remove());
    mounted = undefined;
  };

  return {
    id: "resize",
    render(target) {
      if (controller.resizingIndex() !== undefined) return;
      if (mounted === target?.element) return;
      unmount();
      if (!target || !options.getConfig(target.index)) return;
      for (const corner of HANDLE_CORNERS) {
        const handle = document.createElement("div");
        handle.className = `handle handle-${corner}`;
        handle.dataset.corner = corner;
        target.element.append(handle);
      }
      mounted = target.element;
    },
    attach: controller.attach,
    detach() {
      controller.detach();
      unmount();
    },
    hit(target) { /* the body moved from the card's _hitHandle */ },
  };
};
```

The `mounted === target?.element` short-circuit is what keeps the third render trigger — a config change — from churning the DOM when nothing about the selection moved.

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/tests/happy-dom/card/tools.test.ts`
Expected: PASS, all five.

- [ ] **Step 5: Rewire the card**

- Delete the handle loop from `_createChild` **and the comment above it**, which now describes a strategy the file no longer follows. Replace it with nothing: the tool mounts them.
- Delete `_hitHandle`; `_drag`'s `isHandle` and the resize options' `getHandle` both become `(target) => this._activeTool.hit(target) !== undefined` and `(target) => this._activeTool.hit(target)`.
- `_syncEditingAndDrag` attaches and detaches the active tool alongside `_drag`.
- Call `this._activeTool.render(...)` from `updated()` on the three triggers: `changed.has("selected")`, `changed.has("tool")`, `changed.has("_config")`.
- Collapse the `.handle { display: none }` / `.editing .item.selected > .handle { display: block; … }` pair into one `.handle` rule, and drop the now-redundant `.editing .item.selected >` prefix from the four corner rules. The handles exist only where they are drawn, so the selection no longer belongs in a selector. **Keep `position: absolute`** — it is half the reason mounting per selection is safe at all, and a rule rewrite is exactly where it would be lost.

- [ ] **Step 6: Run the whole card and resize suites**

Run: `pnpm test src/tests/happy-dom/card src/tests/happy-dom/resize-box.test.ts`
Expected: PASS. Any resize-layer test that reached for a handle through the card's old always-present nodes must be updated to select first — that is a real behaviour change and the test should say so in its name.

- [ ] **Step 7: Format, lint, commit**

```bash
pnpm format && pnpm lint
git add src/card/tools src/card/picture-studio-card.ts src/tests/happy-dom/card
git commit -m "refactor(card): the corner gesture becomes a tool that owns its handles"
```

---

### Task 8: The no-op distort tool and the picker

**Files:**
- Create: `src/card/tools/distort-tool.ts`
- Modify: `src/card/toolbar.ts` (the picker UI), `src/card/picture-studio-card.ts` (tool registry + event), `src/strings.ts`
- Modify: `src/tests/happy-dom/card/tools.test.ts`, `src/tests/happy-dom/card/toolbar.test.ts`

**Interfaces:**
- Produces: `createDistortTool(): Tool`; the toolbar emits `tool-changed` with `detail: { tool: ToolId }`.

- [ ] **Step 1: Write the failing tests**

```ts
  it("draws nothing, hits nothing, and commits nothing", async () => {
    const tool = createDistortTool();
    tool.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
    expect(tool.hit(wrapperA)).toBeUndefined();
    tool.attach(root);
    root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(commits).toHaveLength(0);
  });

  it("takes the handles away when it becomes active, and gives them back", async () => {
    const resize = createResizeTool(options);
    const distort = createDistortTool();
    resize.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(4);
    resize.detach();
    distort.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
  });
```

The second test is what makes the no-op meaningful: it is only observable against a tool that draws.

In the toolbar's file:

```ts
  it("shows both tools for an image, with resize active by default", async () => {
    const el = await mount(imageItem, 0);
    expect(el.renderRoot.querySelectorAll(".tools button.tool")).toHaveLength(2);
    expect(
      (el.renderRoot.querySelector("button.tool.resize") as HTMLElement).classList.contains("on"),
    ).toBe(true);
  });

  it("emits the tool the user pressed", async () => {
    const el = await mount(imageItem, 0);
    let seen: string | undefined;
    el.addEventListener("tool-changed", (ev) => {
      seen = (ev as CustomEvent<{ tool: string }>).detail.tool;
    });
    (el.renderRoot.querySelector("button.tool.distort") as HTMLButtonElement).click();
    expect(seen).toBe("distort");
  });

  it("shows no tool picker for an item with no corners", async () => {
    const el = await mount(badgeItem, 0);
    expect(el.renderRoot.querySelectorAll(".tools button.tool")).toHaveLength(0);
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test src/tests/happy-dom/card/tools.test.ts src/tests/happy-dom/card/toolbar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the no-op tool**

```ts
/**
 * The distortion, which is not here yet.
 *
 * Four methods that do nothing, and that is the design rather than a stub: in
 * this mode the corners belong to a gesture sub-project 4 will write, so nothing
 * is drawn and nothing claims to act. Everything downstream is inert without a
 * single special case — no handles, so no pointer target, so no gesture, so no
 * commit. The item still moves, because moving is not a tool.
 */
export const createDistortTool = (): Tool => ({
  id: "distort",
  render() {},
  attach() {},
  detach() {},
  hit: () => undefined,
});
```

- [ ] **Step 4: Add the picker to the toolbar**

Two buttons in `.tools`, before the keep-ratio button, with `mdi:resize` and `mdi:vector-square-edit`; the active one carries `on`. The toolbar needs a `tool` property (`ToolId`) passed down from the card.

Add strings `tool_resize` / `tool_distort` to `en` and `fr`.

- [ ] **Step 5: Register both tools on the card**

```ts
  private _tools: Record<ToolId, Tool> = {
    resize: createResizeTool({ /* the options that were _resize's */ }),
    distort: createDistortTool(),
  };

  private get _activeTool(): Tool {
    return this._tools[this.tool];
  }
```

On a `tool` change in `updated()`: detach the outgoing tool, attach the incoming one, then `render` the current target. Order matters — detaching unmounts the handles, so attaching first would leave a frame with two tools listening.

Wire `@tool-changed` on the toolbar to `activeEditor()?.setTool(ev.detail.tool)`.

- [ ] **Step 6: Run, format, lint, commit**

```bash
pnpm test src/tests/happy-dom/card
pnpm format && pnpm lint
git add src/card/tools/distort-tool.ts src/card/toolbar.ts src/card/picture-studio-card.ts src/strings.ts src/tests/happy-dom/card
git commit -m "feat(toolbar): a tool picker whose second tool honestly does nothing"
```

---

### Task 9: The browser lane

**Files:**
- Create: `src/tests/playwright/toolbar.test.ts`

**Interfaces:**
- Consumes: the harness in `src/tests/playwright/harness.ts`; `appearance.test.ts` and `resize.test.ts` are the precedents for mounting a card in the editing state.

- [ ] **Step 1: Write the three tests happy-dom cannot make**

```ts
  it("keeps the card the same height whether or not something is selected", async () => {
    // Decision 3's claim. happy-dom has no layout, so this is the only lane
    // that can see a jump at the moment the user is aiming at an item.
    const idle = await cardHeight(page);
    await selectItem(page, 0);
    expect(await cardHeight(page)).toBe(idle);
  });

  it("leaves the size container alone", async () => {
    // The toolbar is a sibling of .root. If it ever became a child, every cqw
    // clamp would resolve against a shorter box and every item would move.
    const before = await clampedWidth(page, 0);
    await showToolbar(page);
    expect(await clampedWidth(page, 0)).toBe(before);
  });

  it("dismisses the anchor picker without letting the click through", async () => {
    await openAnchorPicker(page);
    const clicksBehind = await countClicksOn(page, ".layer");
    await page.mouse.click(5, 5);
    expect(await pickerOpen(page)).toBe(false);
    expect(await countClicksOn(page, ".layer")).toBe(clicksBehind);
  });
```

- [ ] **Step 2: Run them and see them fail against a deliberately broken build**

Before implementing helpers, make each test fail for the right reason: temporarily render the toolbar **inside** `.root` and confirm test 2 fails; temporarily use `popover` instead of `showModal()` and confirm test 3 fails. Revert both. A browser test that has never been red proves nothing — three green-and-wrong verifications on this line are on record.

- [ ] **Step 3: Run the lane**

Run: `pnpm test src/tests/playwright/toolbar.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
pnpm format && pnpm lint
git add src/tests/playwright/toolbar.test.ts
git commit -m "test(toolbar): the three claims that need a layout engine"
```

---

### Task 10: Appearance, docs, and verification in real Home Assistant

**Files:**
- Modify: `src/card/toolbar.ts` (final sizing), `CHANGELOG.md`, `.serena/memories/picture-studio/1.6.0-handoff.md`

- [ ] **Step 1: Measure the bar in a browser**

Bring the dev stack up (`pnpm ha:up`, `pnpm dev`), open a card's editor, and measure the toolbar at its default sizing. Three traps, each already paid for once: bump `?v=N` in `.ha/config/.storage/lovelace_resources` and restart the container, because a hard reload does not reliably dislodge the cached build; never `rm -rf dist`, which kills the bind mount and 404s every resource; a debug overlay mounts inside the card's `.root`, not on `document.body`, which the dialog's top layer covers.

- [ ] **Step 2: Settle the figures, with the third axis stated**

Choose the icon size and the gaps against the picture, not against a mockup. Record the trade in a comment where the values live: below HA's 48px touch target the bar gains room and loses touch target, on a card that is used on tablets. A bare number is not acceptable; the comment is the deliverable as much as the value.

- [ ] **Step 3: Walk the whole toolbar in real Home Assistant**

Select a badge (anchor group alone, no separator), an icon, an image (both tools, keep-ratio enabled once stretched), a live camera (keep-ratio disabled), and an unreadable item (everything disabled). Open the anchor picker from each, choose a cell, press Escape, click outside. Switch to `distort` and confirm the handles go and the item still moves.

- [ ] **Step 4: Update the CHANGELOG**

Under `## 1.6.0 — unreleased`, in `### Added`, written for someone configuring the card — the toolbar above the picture while editing, the anchor and the way back to proportional sizing, and the tool picker whose second entry removes the handles because the distortion arrives in a later pre-release. Say that last part plainly; a user who selects it and sees the handles vanish must find it described.

- [ ] **Step 5: Full suite and the baseline**

Run: `pnpm test` with **no arguments** — both lanes, every file.
Then update `## Test baseline — 1.6 line` in `mem:picture-studio/1.6.0-handoff` with the new `testFiles` and `passedTests` and the date. A run that does not report every test file is not a baseline.

- [ ] **Step 6: Commit**

```bash
pnpm format && pnpm lint
git add src/card/toolbar.ts CHANGELOG.md .serena/memories/picture-studio/1.6.0-handoff.md
git commit -m "docs(changelog): the selection toolbar, for someone configuring the card"
```

---

## Closing the branch

Not part of the tasks, and not to be done without the user asking: the whole-branch review gates the merge, the merge target is read from `git config --get branch.feat/selection-toolbar.target` (`next`), and the push is the user's alone.
