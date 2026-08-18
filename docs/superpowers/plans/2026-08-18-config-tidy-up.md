# Config tidy-up before 1.4.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `anchor` inside `position`, replace a label's two `show_*` booleans with one `show` list, give an empty label a defined behaviour, and clear four unlocalized labels and two dead fallbacks — all before 1.4.0 is published.

**Architecture:** Everything happens at the two boundaries that already exist. `normalizeConfig` reads both the old and the new shape; `storedConfig` only ever writes the new one. The in-memory `PictureItem` keeps `anchor` at item level — the YAML moves, the model does not, exactly as `storedPosition` already turns numbers into `"30%"` without changing `Position`. The one new mechanism is the card pushing its `editing` flag onto element children so a label can draw a placeholder when it has nothing to show.

**Tech Stack:** TypeScript, Lit 3, rstest + happy-dom, biome, rslib. Home Assistant frontend build 20260729.6, floor 2026.6.0.

**Spec:** `docs/superpowers/specs/2026-08-18-config-tidy-up-design.md`

## Global Constraints

- **Serena's symbolic tools are primary for code.** Built-in Read/Edit only as a fallback, and freely for `.md` / JSON / YAML.
- **`pnpm lint` must exit 0.** It is not silent on a clean tree: 6 warnings and 1 info pre-exist, all in test files plus one `useLiteralKeys` in `element-form.ts`. Do not "fix" those. If a lint error appears, it is yours.
- **Every task ends green:** `pnpm lint` (exit 0), `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Assert literals in tests.** A test that rebuilds its expectation from the code it tests stops guarding it.
- **Never `git push`.** Local commits only. The user pushes.
- **Never invent a default Home Assistant already provides.** `state_content` stays untouched and unnormalized: `state-display` renders the entity's default state when its `content` is undefined.
- **Read the old shape, never write it back.** Compatibility reads are one-way, always.
- **happy-dom does no layout.** Nothing about boxes, `cqw`, dashed borders or `color-mix` is observable in the suite; assert the CSS rules, not their effect.

---

### Task 1: `anchor` moves inside `position`

**Files:**
- Modify: `src/config.ts` (`normalizeItems`, `storedConfig`)
- Test: `src/tests/config.test.ts`

**Interfaces:**
- Consumes: `parseAnchor(raw: unknown): Anchor` and `storedPosition(position: Position): StoredPosition`, both already exported from `src/position.ts`.
- Produces: no new symbol. The stored shape becomes `position: { top: string; left: string; anchor?: Anchor }`, and `PictureItem.anchor` keeps its place and type in memory.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/config.test.ts`:

```ts
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
    expect(config.items[0]?.anchor).toBe("center");
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
    expect(config.items[0]?.anchor).toBe("bottom-right");
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
    expect(config.items[0]?.anchor).toBe("center");
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec rstest 'src/tests/config.test.ts' --testNamePattern 'anchor lives inside position'`
Expected: FAIL — the first test reads `undefined` (the anchor inside `position` is ignored today), and the storage tests still find `anchor` beside `position`.

- [ ] **Step 3: Read the anchor from both places**

In `src/config.ts`, in `normalizeItems`, replace:

```ts
    const anchor = parseAnchor(entry.anchor);
```

with:

```ts
    // Since 1.4.0 the anchor lives inside `position`: it says which point of the
    // item the coordinates refer to, so it belongs with them. Read from beside
    // `position` too — that is where 1.2.0 through 1.3.x wrote it, and a config
    // is never rewritten in the old place. The new place wins when a config
    // somehow carries both, so there is one answer rather than a merge.
    const anchor = parseAnchor(
      (isRecord(entry.position) ? entry.position.anchor : undefined) ?? entry.anchor,
    );
```

- [ ] **Step 4: Write the anchor into position, and only there**

In `src/config.ts`, in `storedConfig`, replace:

```ts
    const stored: Record<string, unknown> = {
      ...item,
      position: storedPosition(item.position),
    };
    // The default is the absence of the key, so a config that never used an
    // anchor comes back exactly as it went in.
    if (item.anchor === "auto") delete stored.anchor;
```

with:

```ts
    const stored: Record<string, unknown> = {
      ...item,
      // The anchor qualifies the coordinates, so it is written with them. The
      // default is the absence of the key, so a config that never used an anchor
      // comes back exactly as it went in.
      position: {
        ...storedPosition(item.position),
        ...(item.anchor === "auto" ? {} : { anchor: item.anchor }),
      },
    };
    // Always: `...item` copies the in-memory field, and item level is the one
    // place the anchor must never be written back to.
    delete stored.anchor;
```

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS. Older tests asserting `anchor` at item level in stored output must be updated to the new place, not deleted — the assertion is still worth making, one level down.

- [ ] **Step 6: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/config.ts src/tests/config.test.ts
git commit -m "feat(config): the anchor is written inside position, and read from both"
```

---

### Task 2: `show_name` / `show_state` become one `show` list

**Files:**
- Modify: `src/config.ts` (`StateLabelConfig`, `normalizeElementConfig`, `storedConfig`)
- Modify: `src/card/state-label-element.ts:93` and `:99` (render)
- Modify: `src/editor/element-catalog.ts:24` (the stub)
- Modify: `src/editor/state-label-form.ts` (`labelToFormData`, `labelFromFormData`)
- Test: `src/tests/config.test.ts`, `src/tests/card/state-label-element.test.ts`, `src/tests/editor/state-label-form.test.ts`

**Interfaces:**
- Produces: `export type LabelPart = "state" | "name";`, `export const DEFAULT_LABEL_SHOW: LabelPart[] = ["state"];` and `export const normalizeLabelShow = (raw: unknown): LabelPart[]`, all from `src/config.ts`. `StateLabelConfig.show: LabelPart[]` is **required in memory** and optional in YAML — normalization always fills it.
- `show_name` and `show_state` disappear from `StateLabelConfig`. No compatibility read: the kind is unpublished.

- [ ] **Step 1: Write the failing model tests**

Add to `src/tests/config.test.ts`:

```ts
describe("a label's show list", () => {
  const label = (config: Record<string, unknown>) =>
    normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [{ type: "element", position: { top: "1%", left: "1%" }, config }],
    }).items[0]?.config as { show: string[] };

  it("shows the state when the config says nothing", () => {
    expect(label({ type: "state-label", entity: "sensor.a" }).show).toEqual(["state"]);
  });

  it("keeps what it is given, in the order the form produced", () => {
    expect(label({ type: "state-label", entity: "sensor.a", show: ["state", "name"] }).show).toEqual(
      ["state", "name"],
    );
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec rstest 'src/tests/config.test.ts' --testNamePattern "a label's show list"`
Expected: FAIL — `show` is undefined, nothing normalizes it.

- [ ] **Step 3: Add the type, the default and the normalizer**

In `src/config.ts`, beside the other element types, add:

```ts
/** What a label draws. One idea, not two switches — see the 1.4.0 spec. */
export type LabelPart = "state" | "name";

/** A label that says nothing shows its state: that is what a label is for. */
export const DEFAULT_LABEL_SHOW: LabelPart[] = ["state"];

const LABEL_PARTS: readonly string[] = ["state", "name"];

/**
 * An absent list is the default; a present one is taken as written, including
 * empty. Unknown entries are dropped, like every other key inside one of our own
 * closed records, and a repeat is dropped with them — the list is a set with an
 * order, not a bag.
 */
export const normalizeLabelShow = (raw: unknown): LabelPart[] => {
  if (!Array.isArray(raw)) return [...DEFAULT_LABEL_SHOW];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry === "string" && LABEL_PARTS.includes(entry)) seen.add(entry);
  }
  return [...seen] as LabelPart[];
};
```

Change `StateLabelConfig`: delete `show_name?: boolean;` and `show_state?: boolean;`, add `show: LabelPart[];`.

- [ ] **Step 4: Fill it in normalization and filter it in storage**

In `normalizeElementConfig`, inside the `state-label` branch, add `show: normalizeLabelShow(raw.show),` beside `size`.

In `storedConfig`, inside the element branch, destructure `show` out of `item.config` alongside `size`, `chrome` and `halo`, then:

```ts
      // The default is the absence of the key. An empty list is not the default:
      // it is a deliberate "show nothing", and it has to survive the round trip.
      if (!(isLabel && show?.length === 1 && show[0] === "state")) {
        if (show) config.show = show;
      }
```

- [ ] **Step 5: Run the model tests**

Run: `pnpm exec rstest 'src/tests/config.test.ts'`
Expected: PASS.

- [ ] **Step 6: Write the failing render test**

Add to `src/tests/card/state-label-element.test.ts`, inside the existing `describe("displayed parts")`:

```ts
  it("shows the state when show says nothing, and honours a list", async () => {
    const stateOnly = await mount({ entity: "sensor.a", show: ["state"] });
    expect(stateOnly.shadowRoot?.querySelector(".name")).toBeNull();
    expect(text(stateOnly)).toContain("21,5 °C");

    const nameOnly = await mount({ entity: "sensor.a", show: ["name"] });
    expect(nameOnly.shadowRoot?.querySelector(".state")).toBeNull();
    expect(nameOnly.shadowRoot?.querySelector(".name")?.textContent).toBe("Salon");
  });
```

Update the file's `mount` helper to pass `show: ["state"]` by default instead of `show_state: true`, and replace every `show_name` / `show_state` in the existing tests with the equivalent `show` list.

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm exec rstest 'src/tests/card/state-label-element.test.ts'`
Expected: FAIL — the element still reads `config.show_name` and `config.show_state`.

- [ ] **Step 8: Render from the list**

In `src/card/state-label-element.ts`, in `render()`, replace `config.show_name && stateObj` with `config.show.includes("name") && stateObj`, and `config.show_state ?` with `config.show.includes("state") ?`.

- [ ] **Step 9: Move the stub and the form**

In `src/editor/element-catalog.ts:24`, replace `show_state: true` with `show: ["state"]`.

In `src/editor/state-label-form.ts`, in `labelToFormData`, replace the destructure and the `displayed` build:

```ts
  const { size, chrome, halo, show, ...rest } = config;
  const c = chrome ?? DEFAULT_LABEL_CHROME;
```

and pass `displayed_elements: [...show],` instead of `displayed_elements: displayed,`.

In `labelFromFormData`, replace:

```ts
    show_name: shown.includes("name"),
    show_state: shown.includes("state"),
```

with:

```ts
    // The control's own value, normalized rather than trusted: ha-form hands
    // back whatever was in `.data`, and the model owns the shape.
    show: normalizeLabelShow(shown),
```

Import `normalizeLabelShow` from `../config`.

- [ ] **Step 10: Run everything**

Run: `pnpm test`
Expected: PASS. Any remaining `show_name` / `show_state` in tests is a call site to update, not a failure to work around.

- [ ] **Step 11: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/config.ts src/card/state-label-element.ts src/editor/element-catalog.ts src/editor/state-label-form.ts src/tests
git commit -m "feat(state-label): one show list replaces the two display booleans"
```

---

### Task 3: An empty label renders nothing, and is placeheld in the editor

**Files:**
- Modify: `src/card/picture-studio-card.ts` (push `editing` onto element children)
- Modify: `src/card/state-label-element.ts` (the `editing` property, the empty render, its styles)
- Modify: `src/strings.ts` (two keys, en and fr)
- Test: `src/tests/card/state-label-element.test.ts`, `src/tests/strings.test.ts`

**Interfaces:**
- Consumes: `LabelPart` and `normalizeLabelShow` from Task 2.
- Produces: `PictureStudioStateLabel.editing: boolean` — a reactive property the card writes. Set on **element** children only, never on a badge: a badge is a third party and its properties are not ours to invent.

- [ ] **Step 1: Add the strings**

In `src/strings.ts`, add to both catalogues:

```ts
    label_empty: "Empty",
    label_empty_hint: "This item shows nothing",
```

and in `fr`:

```ts
    label_empty: "Vide",
    label_empty_hint: "Cet item n'affiche rien",
```

Add both keys to the shared `KEYS` list in `src/tests/strings.test.ts` so the two localization tests keep checking the same set.

- [ ] **Step 2: Write the failing element tests**

Add to `src/tests/card/state-label-element.test.ts`:

```ts
describe("a label with nothing to show", () => {
  it("renders nothing at all on a dashboard, chrome or not", async () => {
    const el = await mount({
      entity: "sensor.a",
      show: [],
      chrome: { theme: "auto", radius: 8, pill: false, opacity: 1, padding: 6 },
    });
    expect(el.shadowRoot?.querySelector(".chrome")).toBeNull();
    expect(el.shadowRoot?.querySelector(".placeholder")).toBeNull();
  });

  it("draws a placeholder once the card says it is editing", async () => {
    const el = await mount({ entity: "sensor.a", show: [] });
    el.editing = true;
    await el.updateComplete;
    const placeholder = el.shadowRoot?.querySelector(".placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent?.trim()).toBe("Empty");
    // No chrome behind it: the placeholder is the whole item while it is empty.
    expect(el.shadowRoot?.querySelector(".chrome")).toBeNull();
  });

  it("goes back to its normal rendering as soon as something is shown", async () => {
    const el = await mount({ entity: "sensor.a", show: ["state"] });
    el.editing = true;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector(".placeholder")).toBeNull();
    expect(el.shadowRoot?.querySelector(".chrome")).not.toBeNull();
  });

  it("dresses the placeholder as a warning, in one colour at three strengths", () => {
    const rule = cssRules(PictureStudioStateLabel.styles).get(".placeholder");
    expect(rule).toContain("border: 1px dashed var(--warning-color)");
    expect(rule).toContain("color: var(--warning-color)");
    expect(rule).toContain("color-mix(in srgb, var(--warning-color) 15%, transparent)");
    expect(rule).toContain("border-radius: 2px");
    expect(rule).toContain("padding: 2px 4px");
    // Not the error colour: the config is valid, the outcome is merely invisible.
    expect(rule).not.toContain("--error-color");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm exec rstest 'src/tests/card/state-label-element.test.ts' --testNamePattern 'a label with nothing to show'`
Expected: FAIL — `editing` is not a property, and the element renders its chrome whatever `show` holds.

- [ ] **Step 4: Declare the property and branch the render**

In `src/card/state-label-element.ts`, add `editing: { type: Boolean }` to `static properties` and `declare editing: boolean;` beside `_config`, initialised to `false` in the constructor.

At the top of `render()`, after the `config` guard:

```ts
    // Nothing to show. On a dashboard that means nothing at all — not even the
    // chrome: under `anchor: auto` the translate is a percentage of the item's
    // own box, so drawing a box here and none there would place the item in one
    // spot and render it in another. With no box there is no offset, and the
    // stored position simply waits for something to be ticked.
    if (config.show.length === 0) {
      if (!this.editing) return nothing;
      // In the editor it still has to be selectable and draggable, so it gets a
      // marker instead. A warning, not an error: the config is valid, its result
      // is merely invisible.
      return html`<div class="placeholder">${localizeOwn(this._hass, "label_empty")}</div>`;
    }
```

Import `localizeOwn` from `../strings`.

- [ ] **Step 5: Style it**

Add to the element's `css` block:

```css
      /* One colour at three strengths, so it reads on any photograph: a
         saturated dashed border and text, over a fill that lets the picture
         through. color-mix rather than a frozen rgba, so a theme that redefines
         --warning-color carries the fill with it. */
      .placeholder {
        display: inline-block;
        box-sizing: border-box;
        font-size: var(--psc-label-size);
        line-height: 1.2;
        white-space: nowrap;
        font-weight: var(--ha-font-weight-bold, 700);
        color: var(--warning-color);
        background: color-mix(in srgb, var(--warning-color) 15%, transparent);
        border: 1px dashed var(--warning-color);
        border-radius: 2px;
        padding: 2px 4px;
      }
```

- [ ] **Step 6: Push `editing` from the card**

In `src/card/picture-studio-card.ts`, wherever `editing` is reconciled onto children (`_syncEditingAndDrag`), set it on element children only:

```ts
    // Elements only. A badge is a third party: inventing a property on it is the
    // same trespass as writing our keys into its config.
    this._config?.items.forEach((item, index) => {
      if (item.type !== "element") return;
      const child = this._elements[index];
      if (child) (child as HTMLElement & { editing?: boolean }).editing = this.editing;
    });
```

- [ ] **Step 7: Run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/card src/strings.ts src/tests
git commit -m "feat(state-label): an empty label draws nothing, and a placeholder while editing"
```

---

### Task 4: The item list marks a label that shows nothing

**Files:**
- Modify: `src/editor/badge-list.ts` (the row template and its styles)
- Test: `src/tests/editor/badge-list.test.ts`

**Interfaces:**
- Consumes: `PictureItem` from `src/config.ts`, and the `label_empty_hint` string added in Task 3.
- Produces: nothing other tasks read.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/editor/badge-list.test.ts`, inside the mounted-list describe:

```ts
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
```

Import `cssRules` from `../card/harness`, `DEFAULT_LABEL_SIZE` from `../../element-size`, and `PictureItem` from `../../config`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec rstest 'src/tests/editor/badge-list.test.ts' --testNamePattern 'shows nothing'`
Expected: FAIL — there is no `.empty` element.

- [ ] **Step 3: Render the marker**

In `src/editor/badge-list.ts`, add above the class:

```ts
/** A label with an empty `show` draws nothing on the dashboard — say so here. */
const showsNothing = (item: PictureItem): boolean =>
  item.type === "element" &&
  item.config.type === "state-label" &&
  Array.isArray((item.config as { show?: unknown[] }).show) &&
  (item.config as { show: unknown[] }).show.length === 0;
```

In the row template, immediately **before** the `.conditional` block:

```ts
                ${
                  // A bare icon rather than a pill: .conditional wears one
                  // because it borrows ha-label's geometry, and a warning is not
                  // a label. Before the eye, so the row reads left to right from
                  // the most surprising fact.
                  showsNothing(item)
                    ? html`<ha-icon
                        class="empty"
                        icon="mdi:alert-outline"
                        title=${localizeOwn(this.hass, "label_empty_hint")}
                      ></ha-icon>`
                    : nothing
                }
```

- [ ] **Step 4: Style it**

Add to the list's styles, beside `.conditional`:

```css
    /* 16px, not the eye's 14: the eye can afford 14 because its pill gives it
       body, and a bare glyph has only its stroke. mdi:alert-outline rather than
       an eye-off, because two eyes side by side — one "has conditions", one
       "shows nothing" — would contradict each other half a centimetre apart. */
    .empty {
      display: flex;
      flex: none;
      color: var(--warning-color);
      --mdc-icon-size: 16px;
      margin-inline-end: var(--ha-space-2, 8px);
    }
```

- [ ] **Step 5: Pin the row's label, which already holds**

The spec asks for a `rowLabel` fallback so an empty label's row is not mute. It
already is not: `rowLabel` reads the **entity**, never what the item draws, and
an element returns `entityId ?? item.config.type`. Nothing to build — but the
guarantee is now load-bearing, so it gets a test rather than a change. Add to
`src/tests/editor/items.test.ts`:

```ts
it("labels a row from the entity, so an item that draws nothing is still named", () => {
  const item = {
    type: "element",
    position: { top: 1, left: 1 },
    anchor: "auto",
    config: { type: "state-label", entity: "sensor.a", show: [] },
  } as unknown as PictureItem;
  expect(rowLabel(item).primary).toBe("sensor.a");
});
```

- [ ] **Step 6: Run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/editor/badge-list.ts src/tests/editor
git commit -m "feat(editor): the item list marks a label that shows nothing"
```

---

### Task 5: Four labels that show as raw keys

**Files:**
- Modify: `src/editor/element-form.ts` (`elementFormLabel`)
- Modify: `src/editor/state-label-form.ts:21` (the multi-select's options)
- Test: `src/tests/editor/element-form.test.ts`, `src/tests/editor/state-label-form.test.ts`

**Interfaces:** none produced.

- [ ] **Step 1: Write the failing tests**

In `src/tests/editor/state-label-form.test.ts`:

```ts
it("localizes the displayed-elements options through Home Assistant's own keys", () => {
  const localize = ((key: string) =>
    ({
      "ui.panel.lovelace.editor.badge.entity.displayed_elements_options.name": "Nom",
      "ui.panel.lovelace.editor.badge.entity.displayed_elements_options.state": "État",
    })[key] ?? "") as never;
  const schema = JSON.stringify(labelSchema(false, localize));
  expect(schema).toContain('"label":"Nom"');
  expect(schema).toContain('"label":"État"');
  // The raw values must never reach the screen.
  expect(schema).not.toContain('"label":"name"');
  expect(schema).not.toContain('"label":"state"');
});
```

In `src/tests/editor/element-form.test.ts`:

```ts
it("labels the two fields whose generic key does not exist", () => {
  const localize = ((key: string) =>
    ({
      "ui.panel.lovelace.editor.badge.entity.displayed_elements": "Éléments affichés",
      "ui.panel.lovelace.editor.badge.entity.state_content": "Contenu de l'état",
    })[key] ?? "") as never;
  expect(elementFormLabel(localize, undefined, "displayed_elements")).toBe("Éléments affichés");
  expect(elementFormLabel(localize, undefined, "state_content")).toBe("Contenu de l'état");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec rstest 'src/tests/editor' --testNamePattern 'localiz|generic key'`
Expected: FAIL — the options carry `label: value`, and `elementFormLabel` falls through to a `generic.*` key that does not exist, returning the raw name.

- [ ] **Step 3: Label the two fields**

In `src/editor/element-form.ts`, in `elementFormLabel`, above the final fallthrough:

```ts
  // Two fields whose ui.panel.lovelace.editor.card.generic.<name> key does not
  // exist, so the fallthrough put the raw key on screen. Home Assistant has both
  // under the entity badge, which is the editor this form mirrors.
  if (name === "displayed_elements" || name === "state_content") {
    return localize(`ui.panel.lovelace.editor.badge.entity.${name}`) || name;
  }
```

- [ ] **Step 4: Label the options**

In `src/editor/state-label-form.ts`, give `labelSchema` a second parameter `localize: LocalizeFunc` and replace the options:

```ts
            options: ["name", "state"].map((value) => ({
              value,
              label:
                localize(
                  `ui.panel.lovelace.editor.badge.entity.displayed_elements_options.${value}`,
                ) || value,
            })),
```

Update the one call site in `src/editor/element-form.ts` — `labelSchema(showTimeFormat)` becomes `labelSchema(showTimeFormat, hass.localize)` — and every `labelSchema(...)` in the tests.

- [ ] **Step 5: Run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/editor src/tests/editor
git commit -m "fix(editor): four labels were showing their raw translation keys"
```

---

### Task 6: Remove the two dead fallbacks to the icon

**Files:**
- Modify: `src/editor/element-form.ts` (`_dispatch`)
- Modify: `src/card/picture-studio-card.ts` (`createElementBadge`)
- Test: `src/tests/config.test.ts`

**Interfaces:** none produced.

- [ ] **Step 1: Write the test that pins the real behaviour**

Add to `src/tests/config.test.ts`:

```ts
it("raises on an unknown element kind rather than treating it as an icon", () => {
  expect(() =>
    normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/p.png",
      items: [
        {
          type: "element",
          position: { top: "1%", left: "1%" },
          config: { type: "state-gauge", entity: "sensor.a" },
        },
      ],
    }),
  ).toThrow(/state-icon.*state-label/);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm exec rstest 'src/tests/config.test.ts' --testNamePattern 'raises on an unknown element kind'`
Expected: PASS already — this test exists to keep the raise honest once the fallbacks are gone. Lovelace turns that throw into a `hui-error-card` carrying the message, live in the edit preview, which is the behaviour we keep.

- [ ] **Step 3: Make each branch say what it means**

In `src/editor/element-form.ts`, in `_dispatch`, replace the `type === "state-label" ? … : iconFromFormData(…)` catch-all with an explicit pair, so an unhandled kind produces nothing rather than icon-shaped data:

```ts
    const kind = this.element?.type;
    if (kind === "state-label") { /* …existing label branch… */ }
    else if (kind === "state-icon") { /* …existing icon branch… */ }
    // No else. An unknown kind never reaches this form — normalizeElementConfig
    // raises first — and defaulting it to the icon would corrupt its config with
    // icon-only keys the day a third kind exists.
```

In `src/card/picture-studio-card.ts`, in `createElementBadge`, do the same: `state-label` → `LABEL_TAG`, `state-icon` → `ICON_TAG`, anything else → do not create an element.

- [ ] **Step 4: Run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/editor/element-form.ts src/card/picture-studio-card.ts src/tests/config.test.ts
git commit -m "refactor(elements): no kind falls back to the icon; the raise is the behaviour"
```

---

### Task 7: Documentation, and the development dashboard

**Files:**
- Modify: `README.md` (the YAML reference, the anchor paragraph, a new Bug report section)
- Modify: `CHANGELOG.md` (`unreleased`)
- Modify: `.ha/config/.storage/lovelace.dashboard_test` (by hand, git-ignored)

**Interfaces:** none.

- [ ] **Step 1: Update the README's YAML reference**

Move `anchor` into `position` in all three examples, replace the label's `show_name` / `show_state` lines with `show: [state, name]  # absent => [state]`, and add one paragraph under "Positions, anchors and sizes":

```markdown
`anchor` lives inside `position` — it says which point of the item the
coordinates refer to. A config written before this release, with `anchor` beside
`position`, is still read; the editor writes the new form back the first time you
move anything.
```

Add, under the label's keys:

```markdown
`show` lists what the label draws: `state`, `name`, or both. Absent means
`[state]`. An empty list is allowed and means the label draws nothing at all —
the editor marks it so you can still find and move it.
```

- [ ] **Step 2: Update the CHANGELOG**

Under `## unreleased`, `### Changed`:

```markdown
- **A label now says what it shows in one place.** `show: [state, name]` replaces
  the two separate switches, and a label that says nothing shows its state. An
  empty list draws nothing at all — the editor marks those so you can still find
  them.
- **`anchor` moved inside `position`**, where the coordinates it qualifies live.
  Dashboards written before this release keep working, and are rewritten the
  first time you move an item.
```

- [ ] **Step 3: Verify the docs against the code**

Re-read both files beside `src/config.ts`. Every key named must exist; every default stated must match `DEFAULT_LABEL_SHOW`, `DEFAULT_ANCHOR` and the size defaults. A README that states a default the code does not hold is worse than one that states none.

- [ ] **Step 4: Add a "Bug report" section to the README**

Immediately **before** `## Development`, so it is the last thing a user reads
before the part written for contributors:

```markdown
## Bug report

Found something wrong? [Open an issue](https://github.com/lalexdotcom/picture-studio-card/issues/new).

What makes a report actionable here, roughly in order of usefulness:

- **The card's YAML.** Use the editor's three-dot menu → *Edit in YAML* and paste
  the whole card. Most defects in this card are defects of one particular
  configuration.
- **Which view type** the dashboard uses — sections, panel or masonry. A view
  redefines styling for everything underneath it, and this card has already
  shipped bugs that only appeared in one of the three.
- **Your Home Assistant version**, and the card's — the version is in the
  release you installed through HACS.
- **A screenshot**, when the problem is something you can see. Placement,
  sizing and colour issues are far quicker to fix from an image than from a
  description.
- **The browser console**, if the card shows an error card or nothing at all.
```

- [ ] **Step 5: Commit the docs**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: the show list and the anchor's new home"
```

- [ ] **Step 6: Migrate the development dashboard, container stopped**

This is deliberately **not** a full migration. The `anchor` keys stay where they
are, at item level, so the browser walk exercises the compatibility read on a
real config instead of on a fixture. Only the `state-label` items change — the
keys no code path migrates.

```bash
pnpm ha:down
cp .ha/config/.storage/lovelace.dashboard_test .ha/config/.storage/lovelace.dashboard_test.bak-before-show
```

Then, in every item whose `config.type` is `state-label`: delete `show_name` and
`show_state`, and add `show` holding the parts that were true — `["state"]`,
`["state","name"]`, or `["name"]`. Leave every `anchor` untouched.

```bash
pnpm ha:up
```

- [ ] **Step 7: Hand back for the browser walk**

Do not commit anything under `.ha/` — it is git-ignored. Report to the user what
to look at, panel view **and** sections view both:

- an item that had an anchor still sits exactly where it did, and moving it once
  rewrites `anchor` inside `position`
- a label with both parts, a label with only its name, and a label with `show: []`
  — invisible on the dashboard, placeheld in the editor, marked in the list
- the Content section's four labels now read in the interface language
