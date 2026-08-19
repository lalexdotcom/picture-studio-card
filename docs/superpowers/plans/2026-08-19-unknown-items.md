# Unknown items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single unreadable item in `items` no longer takes the whole card down — it is skipped by the card, kept verbatim in the YAML, and shown in the editor's list as a non-editable but deletable row.

**Architecture:** `normalizeConfig` gains a third `PictureItem` variant, `UnknownItem`, holding the raw entry plus a decided `reason`. The card renders nothing for it and keeps its three parallel arrays index-aligned by pushing holes. The editor's list renders it as an error row, and gains a second, independent source of error rows: a runtime probe that tells whether a badge's type exists on this Home Assistant. A malformed `visibility` is handled separately — the item stays normal and its Visibility section explains and offers a reset.

**Tech Stack:** TypeScript (no decorators, no dynamic import), Lit 3 bundled, rstest + happy-dom, Biome.

**Spec:** `docs/superpowers/specs/2026-08-19-unknown-items-design.md` — read it before Task 1. Every "why" lives there; this plan carries the "how".

## Global Constraints

- **Serena's symbolic tools are primary for code.** `get_symbols_overview` / `find_symbol` to read, `replace_symbol_body` / `insert_*_symbol` / `replace_content` to edit. Built-in Read/Edit only for `.md`, JSON, YAML — or when Serena genuinely fails on a file.
- **Run `pnpm format` after every modification.** The bar for `pnpm lint` is **exit code 0**, not empty output: 6 warnings and 1 info are pre-existing (test files, plus one `useLiteralKeys` in `element-form.ts`). If you believe a warning is pre-existing, prove it with `git show HEAD:<file>` before saying so.
- **`pnpm typecheck` must stay clean** and `pnpm test` must stay green. 519 tests at the branch point.
- Comments and code in **English**. Chat with the user in **French**.
- **Never `git push`.** Commit freely on `feat/unknown-items`; publishing is the user's alone.
- **A test that restates a constant stops guarding it** — assert literals.
- **happy-dom does no layout.** Nothing about `clamp()`, `cqw`, positioning, pointer muting, compositing or resolved colour is observable in the suite. Those go to the browser walk at the end.
- **When a fix rests on a claim about Home Assistant, read Home Assistant.** The shipped frontend is in the container at `/usr/local/lib/python3.14/site-packages/hass_frontend/frontend_latest/*.js`, build **20260729.6**.
- Existing strings live in `src/strings.ts` (`en` + `fr`, same order in both). `StringKey` derives from the `en` record, so adding a key to `en` alone breaks the `fr` table's type.

---

### Task 1: The new strings

Three tasks consume these. Doing them first means no task invents a key another task also invents under a different name.

**Files:**
- Modify: `src/strings.ts`
- Test: `src/tests/strings.test.ts`

**Interfaces:**
- Produces: eight new `StringKey` values — `unknown_item_type`, `unknown_config_missing`, `unknown_element_type`, `unknown_badge_type`, `unknown_item`, `visibility_unreadable`, `visibility_unreadable_body`, `visibility_reset`.

- [ ] **Step 1: Read the existing test to learn what it asserts**

`src/tests/strings.test.ts` already checks that `en` and `fr` carry the same key set. Find that test — the new keys must satisfy it, which is the whole point of adding them to both tables in one edit.

- [ ] **Step 2: Write the failing test**

Append to `src/tests/strings.test.ts`:

```ts
describe("the unknown-item catalog", () => {
  const KEYS = [
    "unknown_item_type",
    "unknown_config_missing",
    "unknown_element_type",
    "unknown_badge_type",
    "unknown_item",
    "visibility_unreadable",
    "visibility_unreadable_body",
    "visibility_reset",
  ] as const;

  it("resolves every key in English and in French", () => {
    for (const key of KEYS) {
      expect(localizeOwn({ language: "en" } as never, key)).not.toBe("");
      expect(localizeOwn({ language: "fr" } as never, key)).not.toBe("");
    }
  });

  it("translates rather than echoing English", () => {
    // Spelled out rather than compared as a set: a French table that silently
    // copied the English one would pass a "both are non-empty" check.
    expect(localizeOwn({ language: "fr" } as never, "visibility_reset")).toBe("Réinitialiser");
    expect(localizeOwn({ language: "fr" } as never, "unknown_element_type")).toBe(
      "Type d'élément inconnu",
    );
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm test src/tests/strings.test.ts`
Expected: FAIL — the keys are not assignable to `StringKey`, so this fails to compile before it fails to run.

- [ ] **Step 4: Add the keys to both tables**

In `src/strings.ts`, add to `en`, after `visibility_invalid`:

```ts
    unknown_item: "Unreadable item",
    unknown_item_type: "Unknown item type",
    unknown_config_missing: "Missing config",
    unknown_element_type: "Unknown element type",
    unknown_badge_type: "Unknown badge type",
    visibility_unreadable: "Unreadable conditions",
    visibility_unreadable_body:
      "This item's conditions are not a list. They are ignored, and the item always shows.",
    visibility_reset: "Reset",
```

and to `fr`, in the same position and the same order:

```ts
    unknown_item: "Item illisible",
    unknown_item_type: "Type d'item inconnu",
    unknown_config_missing: "Config manquante",
    unknown_element_type: "Type d'élément inconnu",
    unknown_badge_type: "Type de badge inconnu",
    visibility_unreadable: "Conditions illisibles",
    visibility_unreadable_body:
      "Les conditions de cet item ne forment pas une liste. Elles sont ignorées, et l'item reste toujours visible.",
    visibility_reset: "Réinitialiser",
```

`unknown_item` is the row's first line when there is no token at all to show.

- [ ] **Step 5: Run the tests and the formatter**

Run: `pnpm format && pnpm test src/tests/strings.test.ts && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/strings.ts src/tests/strings.test.ts
git commit -m "feat(strings): the unknown-item and unreadable-conditions catalog"
```

---

### Task 2: `UnknownItem` — the model, the normalization, the storage

The heart of the change. Everything downstream is the compiler telling you where a `PictureItem` no longer has a `config`.

**Files:**
- Modify: `src/config.ts` — `ItemBase` (the `visibility` type), the new `UnknownItem` interface, `PictureItem`, `normalizeVisibility`, `normalizeConfig`, `storedConfig`
- Test: `src/tests/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type UnknownReason = "item-type" | "config-missing" | "element-type";
  export interface UnknownItem {
    type: "unknown";
    raw: unknown;
    reason: UnknownReason;
    token?: string;
  }
  export type PictureItem = BadgeItem | ElementItem | UnknownItem;
  ```
  `ItemBase["visibility"]` becomes `unknown`. `hasVisibility(item: PictureItem): boolean` keeps its signature and stays the only gate.

- [ ] **Step 1: Write the failing tests for normalization**

Append to `src/tests/config.test.ts`:

```ts
describe("an unreadable item is kept, not fatal", () => {
  const wrap = (item: unknown) => ({ type: "custom:picture-studio", image: "/x.png", items: [item] });

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
    expect(items[0]).toMatchObject({ type: "unknown", reason: "element-type", token: "state-lable" });
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
        { type: "element", position: { top: "5%", left: "6%" }, config: { type: "state-icon", entity: "light.a" } },
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
    const raw = { type: "element", config: { type: "state-lable", size: { mode: "fixed", value: 40 } } };
    const config = normalizeConfig({
      type: "custom:picture-studio",
      image: "/x.png",
      items: [raw, { type: "element", position: { top: "5%", left: "5%" }, config: { type: "state-icon", entity: "light.a" } }],
    });
    const moved = { ...config, items: config.items.map((it, i) => (i === 1 ? { ...it, position: { top: 9, left: 9 } } : it)) };
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
    const { items } = normalizeConfig({ type: "custom:picture-studio", image: "/x.png", items: [item] });
    expect(items[0]?.type).toBe("badge");
    expect(items[0]?.visibility).toEqual(item.visibility);
  });

  it("reports no conditions, so nothing hides the item", () => {
    const { items } = normalizeConfig({ type: "custom:picture-studio", image: "/x.png", items: [item] });
    expect(hasVisibility(items[0] as never)).toBe(false);
  });

  it("writes the raw value back rather than dropping it", () => {
    const config = normalizeConfig({ type: "custom:picture-studio", image: "/x.png", items: [item] });
    expect(((storedConfig(config).items as Record<string, unknown>[])[0] as { visibility: unknown }).visibility)
      .toEqual(item.visibility);
  });
});
```

Add `hasVisibility` and `storedConfig` to the file's existing import from `../config` if they are not already there.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test src/tests/config.test.ts`
Expected: FAIL — the four "holds…" tests throw the old error, and the round-trip tests never reach their assertion.

- [ ] **Step 3: Add the type**

With Serena, insert before `PictureItem` in `src/config.ts`:

```ts
/** Why an item could not be read. Decided once, at normalization. */
export type UnknownReason = "item-type" | "config-missing" | "element-type";

/**
 * An item we cannot read. It is ignored everywhere — the card draws nothing, the
 * editor offers no form — but `raw` is written back to the YAML untouched, so
 * ignoring costs nothing. That is the whole safety argument: `storedConfig`
 * rewrites the entire config on every editor commit, so anything dropped here
 * would vanish from the user's YAML on the first drag.
 *
 * It deliberately does not extend `ItemBase` and carries no `config`: the
 * compiler is then what finds every consumer that has to learn about it.
 */
export interface UnknownItem {
  type: "unknown";
  /** The original entry, never normalized — not its position, not its anchor. */
  raw: unknown;
  reason: UnknownReason;
  /** The rawest identifying token we hold; the row's first line. */
  token?: string;
}
```

and widen the union:

```ts
export type PictureItem = BadgeItem | ElementItem | UnknownItem;
```

- [ ] **Step 4: Widen `ItemBase["visibility"]`**

Replace the `visibility?: VisibilityCondition[];` declaration in `ItemBase` with:

```ts
  /**
   * Home Assistant's condition list, and theirs alone: never read, validated or
   * rewritten here. Typed `unknown` because it genuinely is — only its
   * array-ness was ever checked, and a malformed value is now kept rather than
   * refused. `hasVisibility` is the single gate every reader passes through.
   */
  visibility?: unknown;
```

`VisibilityCondition` may become unused in `config.ts`; remove the import if Biome flags it.

- [ ] **Step 5: Stop `normalizeVisibility` throwing**

```ts
const normalizeVisibility = (raw: unknown): unknown => raw;
```

Delete its `index` parameter and its call-site argument. Keep the doc comment's point — contents are never inspected — and add that a non-list is kept rather than refused, because dropping it would discard a readable intention on the first commit.

Simpler still: if the function now does nothing, inline it and delete it. Prefer deleting: a function that returns its argument is a comment pretending to be code. Keep the explanation as a comment at the `visibility` assignment in `normalizeConfig`.

- [ ] **Step 6: Rewrite the `items.map` body in `normalizeConfig`**

```ts
  const items = rawItems.map((entry, index): PictureItem => {
    if (!isRecord(entry)) {
      // The one case still fatal: no family, no position, not even a key to name
      // in a row. Home Assistant's error card, which prints the offending config,
      // says more than a row that could only read "?".
      throw new Error(`picture-studio: items[${index}] must be an object`);
    }

    const unknown = (reason: UnknownReason, token?: string): UnknownItem => ({
      type: "unknown",
      raw: entry,
      reason,
      ...(token ? { token } : {}),
    });

    const type = entry.type;
    if (type !== "badge" && type !== "element") {
      return unknown("item-type", typeof type === "string" ? type : undefined);
    }
    if (!isRecord(entry.config)) return unknown("config-missing", type);
    if (type === "element") {
      const kind = entry.config.type;
      if (kind !== "state-icon" && kind !== "state-label") {
        return unknown("element-type", typeof kind === "string" ? kind : undefined);
      }
    }

    const position = normalizePosition(entry.position);
    const anchor = parseAnchor(
      (isRecord(entry.position) ? entry.position.anchor : undefined) ?? entry.anchor,
    );
    // Kept exactly as written, whatever it is. Only its array-ness ever mattered,
    // and `hasVisibility` is what asks.
    const visibility = entry.visibility;
    const base = { position, anchor, ...(visibility !== undefined ? { visibility } : {}) };

    return type === "badge"
      ? { ...base, type, config: entry.config as BadgeConfig }
      : { ...base, type, config: normalizeElementConfig(entry.config, index) };
  });
```

The element-kind check moves **out** of `normalizeElementConfig` and up here, because only the caller knows the index and can build the `UnknownItem`. Change `normalizeElementConfig`'s tail from the `throw` to an unreachable-by-construction guard:

```ts
  // Unreachable: normalizeConfig checks the kind before calling, because only it
  // can turn an unknown one into an UnknownItem. Kept as a type-level floor.
  throw new Error(`picture-studio: items[${index}].config has an unreadable type`);
```

- [ ] **Step 7: Re-emit the raw entry in `storedConfig`**

First line of the `items.map` callback:

```ts
    // Verbatim, and nothing else: no spread, no key deletion, no position
    // rewrite. This is the whole safety argument of the design.
    if (item.type === "unknown") return item.raw as Record<string, unknown>;
```

- [ ] **Step 8: Guard `hasVisibility`**

`Array.isArray(item.visibility)` already returns `false` for a string or a mapping, and `UnknownItem` has no `visibility` property, so `item.visibility` is a type error rather than a runtime one. Give it a narrowing:

```ts
export const hasVisibility = (item: PictureItem): boolean =>
  item.type !== "unknown" && Array.isArray(item.visibility) && item.visibility.length > 0;
```

- [ ] **Step 9: Run the tests and the typechecker**

Run: `pnpm test src/tests/config.test.ts && pnpm typecheck`
Expected: the config tests PASS. `pnpm typecheck` **fails**, in `badge-list.ts`, `items.ts`, `element-form.ts`, `picture-studio-editor.ts` and `picture-studio-card.ts` — that failure list is Tasks 3 to 7's work list, so read it and keep it.

- [ ] **Step 10: Commit**

```bash
git add src/config.ts src/tests/config.test.ts
git commit -m "feat(config): an unreadable item becomes an UnknownItem, kept verbatim"
```

Commit with `typecheck` red: the type change is one atomic idea and splitting it across the consumer fixes would make each commit a half-truth. Say so in the body.

---

### Task 3: The card ignores it, and keeps its arrays aligned

**Files:**
- Modify: `src/card/picture-studio-card.ts` — `_elements` / `_wrappers` declarations, `_syncItems`, the `hass` fan-out loop at line ~112, `setConfig`
- Test: `src/tests/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: `UnknownItem`, `PictureItem` from Task 2.
- Produces: nothing new; `_elements` and `_wrappers` become `(T | undefined)[]`.

- [ ] **Step 1: Write the failing alignment test**

This is the test that matters. Append to `src/tests/card/picture-studio-card.test.ts`, following the file's existing setup helpers:

```ts
describe("an unknown item does not shift the items after it", () => {
  it("gives the second element its own config, not the first one's", async () => {
    const card = await mountCard({
      items: [
        { type: "element", position: { top: "10%", left: "10%" }, config: { type: "state-icon", entity: "light.a" } },
        { type: "badgee" },
        { type: "element", position: { top: "20%", left: "20%" }, config: { type: "state-icon", entity: "light.b" } },
      ],
    });
    const icons = [...card.shadowRoot!.querySelectorAll(ICON_TAG)] as { _config?: { entity?: string } }[];
    expect(icons).toHaveLength(2);
    // The whole point: without the hole, icons[1] receives items[1]'s config —
    // which is the unknown item — and the third item is never reached.
    expect(icons[0]?._config?.entity).toBe("light.a");
    expect(icons[1]?._config?.entity).toBe("light.b");
  });

  it("builds no wrapper and no probe for it", async () => {
    const card = await mountCard({
      items: [
        { type: "badgee", visibility: [{ condition: "user", users: [] }] },
        { type: "element", position: { top: "20%", left: "20%" }, config: { type: "state-icon", entity: "light.b" } },
      ],
    });
    expect(card.shadowRoot!.querySelectorAll(".item")).toHaveLength(1);
    expect(card.shadowRoot!.querySelectorAll(PROBE_TAG)).toHaveLength(0);
  });
});
```

Reuse whatever the file already calls to mount a card and flush updates — do not invent a second `mountCard` if one exists under another name. `ICON_TAG` and `PROBE_TAG` come from `../../config`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/card/picture-studio-card.test.ts`
Expected: FAIL. Record the actual failure text — the first test failing with `light.a` twice, or with one icon instead of two, is the defect being measured before it is fixed. If it passes, stop: the fixture is not reaching the misalignment and the test is worthless.

- [ ] **Step 3: Widen the two arrays**

```ts
  /** Indexed like `items`; a hole where the item is unreadable. */
  private _elements: (LovelaceBadgeElement | undefined)[] = [];
  /** Indexed like `items`; a hole where the item is unreadable. */
  private _wrappers: (HTMLElement | undefined)[] = [];
```

`_probes` is already `(ProbeElement | undefined)[]`.

- [ ] **Step 4: Push holes instead of skipping**

In `_syncItems`'s `items.forEach`, replace `if (!child) return;` with:

```ts
        const child = this._createChild(item, helpers);
        if (!child) {
          // A hole, not a skip. `_elements`, `_wrappers` and `_probes` are read
          // by index against `items`; dropping an entry would hand every later
          // item the previous one's config.
          this._elements.push(undefined);
          this._wrappers.push(undefined);
          this._probes.push(undefined);
          return;
        }
```

Move the `wrapper` creation **below** this guard so no orphan div is built.

- [ ] **Step 5: Teach `_createChild` about the third variant**

```ts
    if (item.type === "unknown") return undefined;
    if (item.type === "badge") return helpers.createBadgeElement(item.config);
```

- [ ] **Step 6: Guard the fan-out loops**

`for (const el of this._elements)` at line ~112 now iterates holes. Change to:

```ts
    for (const el of this._elements) {
      if (el) el.hass = hass;
    }
```

Apply the same guard wherever `tsc` reports a possibly-undefined member access on `_elements` or `_wrappers` — `_applyPositions` already does `if (!wrapper) return;` and needs nothing.

- [ ] **Step 7: Add the console warning**

At the end of `setConfig`:

```ts
  setConfig(config: unknown): void {
    this._config = normalizeConfig(config);
    // The editor's item list is now the only place an unreadable item is
    // reported. Someone who configures in YAML and never opens the dialog would
    // otherwise never learn — a console line returns part of the diagnostic
    // being given up, without putting anything in front of a viewer.
    this._config.items.forEach((item, index) => {
      if (item.type !== "unknown") return;
      console.warn(
        `picture-studio: items[${index}] ignored (${item.reason}${item.token ? `: ${item.token}` : ""})`,
      );
    });
  }
```

- [ ] **Step 8: Run the tests**

Run: `pnpm format && pnpm test src/tests/card/ && pnpm typecheck`
Expected: the new tests PASS; `typecheck` still reports the editor files, which are Tasks 4 to 7.

- [ ] **Step 9: Commit**

```bash
git add src/card/picture-studio-card.ts src/tests/card/picture-studio-card.test.ts
git commit -m "fix(card): keep the child arrays aligned when an item has no child"
```

---

### Task 4: The error row in the item list

**Files:**
- Modify: `src/editor/items.ts` — `rowLabel`
- Modify: `src/editor/badge-list.ts` — `kindLabel`, `render`, `static styles`
- Modify: `src/editor/picture-studio-editor.ts` — the defensive branch when `_editingIndex` points at an unknown item
- Test: `src/tests/editor/items.test.ts`, `src/tests/editor/badge-list.test.ts`

**Interfaces:**
- Consumes: `UnknownItem`, `UnknownReason` (Task 2); the eight string keys (Task 1).
- Produces: `rowLabel` gains an unknown branch returning `{ primary, secondary }` where `primary` is `item.token ?? localizeOwn(hass, "unknown_item")` and `secondary` is the reason's string. `rowLabel`'s signature grows nothing — it already takes `hass`.

- [ ] **Step 1: Write the failing `rowLabel` test**

Append to `src/tests/editor/items.test.ts`:

```ts
describe("rowLabel for an unreadable item", () => {
  const hass = { language: "en" } as never;

  it("shows the raw type over the reason", () => {
    expect(rowLabel({ type: "unknown", raw: {}, reason: "item-type", token: "badgee" }, hass))
      .toEqual({ primary: "badgee", secondary: "Unknown item type" });
  });

  it("shows the family over the reason when the config is missing", () => {
    expect(rowLabel({ type: "unknown", raw: {}, reason: "config-missing", token: "badge" }, hass))
      .toEqual({ primary: "badge", secondary: "Missing config" });
  });

  it("shows the raw element kind over the reason", () => {
    expect(rowLabel({ type: "unknown", raw: {}, reason: "element-type", token: "state-lable" }, hass))
      .toEqual({ primary: "state-lable", secondary: "Unknown element type" });
  });

  it("never renders a blank first line when there is no token", () => {
    expect(rowLabel({ type: "unknown", raw: {}, reason: "item-type" }, hass))
      .toEqual({ primary: "Unreadable item", secondary: "Unknown item type" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/editor/items.test.ts`
Expected: FAIL — `rowLabel` reads `item.config` on its first line, so this throws before it asserts.

- [ ] **Step 3: Add the branch at the top of `rowLabel`**

```ts
const UNKNOWN_REASON_KEYS: Record<UnknownReason, StringKey> = {
  "item-type": "unknown_item_type",
  "config-missing": "unknown_config_missing",
  "element-type": "unknown_element_type",
};

export const rowLabel = (item: PictureItem, hass?: HomeAssistant, badgeName?: string): RowLabel => {
  // First, because everything below reads `item.config`. The token is the raw
  // string a user will search their YAML for; the reason is why it is here.
  if (item.type === "unknown") {
    return {
      primary: item.token ?? localizeOwn(hass, "unknown_item"),
      secondary: localizeOwn(hass, UNKNOWN_REASON_KEYS[item.reason]),
    };
  }
  const entityId = …
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test src/tests/editor/items.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing row test**

Append to `src/tests/editor/badge-list.test.ts`, following the file's existing pattern for mounting the list and reading its rows:

```ts
describe("the row of an unreadable item", () => {
  const items = [
    { type: "element", position: { top: 5, left: 5 }, anchor: "auto", config: { type: "state-icon", entity: "light.a" } },
    { type: "unknown", raw: {}, reason: "element-type", token: "state-lable" },
  ] as PictureItem[];

  it("marks it with the error glyph in the kind slot", async () => {
    const list = await mountList(items);
    // Top-down: the unknown item is last in the array, so it is the first row.
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".kind")?.getAttribute("icon")).toBe("mdi:alert-circle");
    expect(row.querySelector(".kind")?.classList.contains("error")).toBe(true);
  });

  it("disables Edit and leaves Delete working", async () => {
    const list = await mountList(items);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    const [edit, remove] = [...row.querySelectorAll("ha-icon-button")];
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
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".conditional")).toBeNull();
    expect(row.querySelector(".empty")).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm test src/tests/editor/badge-list.test.ts`
Expected: FAIL — `kindLabel` reads `item.config.type`, so the render throws.

- [ ] **Step 7: Guard `kindLabel`**

```ts
export const kindLabel = (item: PictureItem, localize: LocalizeFunc, catalog: BadgeChoice[]): string => {
  if (item.type === "unknown") return item.token ?? "";
  const type = String(item.config.type ?? "");
  …
```

- [ ] **Step 8: Render the error row**

In `render()`, the `labels` and `kinds` maps already call `rowLabel` and `kindLabel`, both now safe. Add a per-row flag before the template:

```ts
    const unknown = rows.map((item) => item.type === "unknown");
```

In the row template, replace the `.kind` icon with:

```ts
                <ha-icon
                  class="kind ${unknown[index] ? "error" : ""}"
                  .icon=${
                    unknown[index]
                      ? "mdi:alert-circle"
                      : itemIcon(rows[index]!.type as "badge" | "element", String((rows[index] as { config?: { type?: unknown } }).config?.type ?? ""))
                  }
                  title=${kinds[index]}
                ></ha-icon>
```

Guard both markers on `!unknown[index]`:

```ts
                ${!unknown[index] && showsNothing(item) ? html`<ha-icon class="empty" …>` : nothing}
                ${!unknown[index] && hasVisibility(item) ? html`<span class="conditional" …>` : nothing}
```

and disable Edit:

```ts
                <ha-icon-button
                  .label=${localize("ui.common.edit") || "Edit"}
                  .disabled=${unknown[index]}
                  @click=${() => this._fire("item-edit", { index: this._flip(index) })}
                  ><ha-icon icon="mdi:pencil"></ha-icon></ha-icon-button>
```

`showsNothing` already narrows on `item.type === "element"` and needs no change; the `!unknown[index]` guard is there to state the rule at the call site, not to prevent a crash.

- [ ] **Step 9: Style the error row**

Add beside the existing `.kind` rule:

```css
    /* The glyph replaces the kind rather than joining it: there is no kind to
       show. Home Assistant's own error vocabulary — ha-alert's `error`, which
       ha-visibility-status uses too — so the list and the form's Visibility
       header read as one language. No row tint: one bad item among twelve, and
       a full-width band buries the list. */
    .kind.error {
      color: var(--error-color);
    }
    .item .label .secondary.error {
      color: var(--error-color);
    }
```

and give the secondary span the class when the row is unknown:

```ts
<span class="secondary ${unknown[index] ? "error" : ""}">${labels[index]?.secondary}</span>
```

- [ ] **Step 10: Close the editor's routing hole**

In `picture-studio-editor.ts`'s `render()`, `editing` can now be an `UnknownItem`. Edit is disabled so `item-edit` never fires for one, but a stale `_editingIndex` after a delete could land there. Add, where the form is chosen:

```ts
    // Unreachable through the interface — the row's Edit button is disabled —
    // but a stale index after a removal must fall back to the list rather than
    // pick a form at random.
    if (editing?.type === "unknown") return this._renderList();
```

Match the file's actual structure: if it does not have a `_renderList()`, make the `editing` local `undefined` for an unknown item instead, which routes to the list by the existing path.

- [ ] **Step 11: Run everything**

Run: `pnpm format && pnpm test && pnpm typecheck && pnpm lint`
Expected: all green, `lint` exit 0.

- [ ] **Step 12: Commit**

```bash
git add src/editor/items.ts src/editor/badge-list.ts src/editor/picture-studio-editor.ts src/tests/editor/
git commit -m "feat(editor): an unreadable item gets an error row, deletable but not editable"
```

---

### Task 5: Does this badge type exist?

A new module, kept apart from `badge-list.ts` because it is the one piece with a cache and a timer, and it is worth testing without mounting a component.

**Files:**
- Create: `src/editor/badge-existence.ts`
- Test: `src/tests/editor/badge-existence.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BadgeVerdict = "unknown" | "ok" | "missing";
  /** Synchronous read of the cache. Never probes. */
  export const badgeVerdict: (type: string) => BadgeVerdict;
  /** Starts the probe if this type has never been asked about. `onSettled` fires
   *  once per state change, never for a type already settled. */
  export const probeBadgeType: (type: string, onSettled: () => void) => void;
  /** Test seam: drops the module-level cache and every pending timer. */
  export const resetBadgeVerdicts: () => void;
  ```

- [ ] **Step 1: Read the two Home Assistant facts this rests on**

Both verified in build 20260729.6, `frontend_latest/14887.*.js`, and written down in the spec:

- `createBadgeElement` is the **catching** wrapper. An unknown type returns a `hui-error-badge`; it never throws.
- A `custom:` type resolves to the bare tag. `customElements.get(tag)` answers directly, and a tag with no `-` can never be a custom element.

Do not re-derive these. Do check them if a test says otherwise.

- [ ] **Step 2: Write the failing tests**

Create `src/tests/editor/badge-existence.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "@rstest/core";
import { badgeVerdict, probeBadgeType, resetBadgeVerdicts } from "../../editor/badge-existence";

const helpers = { createBadgeElement: (c: { type?: string }) => document.createElement(
  c.type === "entity" || c.type === "shortcut" ? `hui-${c.type}-badge` : "hui-error-badge",
) };

beforeEach(() => {
  resetBadgeVerdicts();
  (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () => helpers;
});
afterEach(() => resetBadgeVerdicts());

describe("native types", () => {
  it("starts unknown so the first paint is optimistic", () => {
    expect(badgeVerdict("entty")).toBe("unknown");
  });

  it("settles a real type to ok", async () => {
    const settled = new Promise<void>((r) => probeBadgeType("entity", r));
    await settled;
    expect(badgeVerdict("entity")).toBe("ok");
  });

  it("settles a type the frontend does not know to missing", async () => {
    const settled = new Promise<void>((r) => probeBadgeType("entty", r));
    await settled;
    expect(badgeVerdict("entty")).toBe("missing");
  });

  it("probes a type once however many rows ask", async () => {
    const spy = vi.spyOn(helpers, "createBadgeElement");
    await new Promise<void>((r) => probeBadgeType("entty", r));
    probeBadgeType("entty", () => {});
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("custom types", () => {
  it("is ok at once when the element is already defined", () => {
    customElements.define("already-here-badge", class extends HTMLElement {});
    probeBadgeType("custom:already-here-badge", () => {});
    expect(badgeVerdict("custom:already-here-badge")).toBe("ok");
  });

  it("is missing at once when the tag cannot be a custom element", () => {
    probeBadgeType("custom:nodash", () => {});
    expect(badgeVerdict("custom:nodash")).toBe("missing");
  });

  it("stays optimistic during the grace period, then turns missing", async () => {
    vi.useFakeTimers();
    let settled = 0;
    probeBadgeType("custom:never-arrives", () => settled++);
    expect(badgeVerdict("custom:never-arrives")).toBe("unknown");
    vi.advanceTimersByTime(1999);
    expect(badgeVerdict("custom:never-arrives")).toBe("unknown");
    vi.advanceTimersByTime(1);
    expect(badgeVerdict("custom:never-arrives")).toBe("missing");
    expect(settled).toBe(1);
    vi.useRealTimers();
  });

  it("recovers when the element arrives late, and cancels the timer", async () => {
    let settled = 0;
    probeBadgeType("custom:arrives-late", () => settled++);
    customElements.define("arrives-late", class extends HTMLElement {});
    await customElements.whenDefined("arrives-late");
    await Promise.resolve();
    expect(badgeVerdict("custom:arrives-late")).toBe("ok");
    expect(settled).toBe(1);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm test src/tests/editor/badge-existence.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write the module**

```ts
import { CUSTOM_PREFIX } from "./badge-catalog";

/**
 * Does this Home Assistant know this badge type?
 *
 * The card never asks: Home Assistant already renders its own error badge for a
 * type it cannot build, and that badge names the type. The editor's list asks,
 * because there a typo (`entty`) and a native type outside our catalogue
 * (`state-label`, `entity-filter`, the three energy totals) render identically —
 * `mdi:label` over a raw string — and only one of the two is a mistake.
 *
 * The badge's own config is never given to the probe: it is asked with a bare
 * `{ type }`, so the answer is per type and cacheable per type, and the payload
 * stays as opaque as it has always been.
 */
export type BadgeVerdict = "unknown" | "ok" | "missing";

/**
 * Module level, not per instance: "does this build know this type" has one
 * answer for the whole session, and a per-instance cache would ask again on
 * every dialog open. A native entry is frozen once settled. A custom entry can
 * still move from `missing` back to `ok` — its resource may load at any moment.
 */
const VERDICTS = new Map<string, BadgeVerdict>();
const TIMERS = new Map<string, ReturnType<typeof setTimeout>>();

/** Home Assistant's own figure: it hides its error badge for exactly this long,
    so the list and the card beside it complain at the same moment. */
const GRACE_MS = 2000;

export const badgeVerdict = (type: string): BadgeVerdict => VERDICTS.get(type) ?? "unknown";

const settle = (type: string, verdict: BadgeVerdict, onSettled: () => void): void => {
  if (VERDICTS.get(type) === verdict) return;
  VERDICTS.set(type, verdict);
  onSettled();
};

export const probeBadgeType = (type: string, onSettled: () => void): void => {
  if (VERDICTS.has(type) || TIMERS.has(type)) return;

  if (type.startsWith(CUSTOM_PREFIX)) {
    const tag = type.slice(CUSTOM_PREFIX.length);
    if (customElements.get(tag)) {
      settle(type, "ok", onSettled);
      return;
    }
    // A tag with no dash can never be a custom element, which is why Home
    // Assistant returns its error immediately there. It catches the commonest
    // typo with no wait at all.
    if (!tag.includes("-")) {
      settle(type, "missing", onSettled);
      return;
    }
    // Optimistic until the grace elapses: an error shown on a valid config while
    // its resource loads is the one flicker this design forbids.
    TIMERS.set(
      type,
      setTimeout(() => {
        TIMERS.delete(type);
        settle(type, "missing", onSettled);
      }, GRACE_MS),
    );
    // No polling and no retry count: this resolves exactly when the element
    // arrives, and never lies about a resource that loads at t+5s.
    void customElements.whenDefined(tag).then(() => {
      const timer = TIMERS.get(type);
      if (timer !== undefined) {
        clearTimeout(timer);
        TIMERS.delete(type);
      }
      settle(type, "ok", onSettled);
    });
    return;
  }

  // Native. One async hop per session — loadCardHelpers — and every probe after
  // it is synchronous. A placeholder keeps a second row from probing meanwhile.
  TIMERS.set(type, setTimeout(() => undefined, 0));
  void window.loadCardHelpers().then((helpers) => {
    TIMERS.delete(type);
    const el = helpers.createBadgeElement({ type } as never) as HTMLElement;
    settle(type, el.tagName.toLowerCase() === "hui-error-badge" ? "missing" : "ok", onSettled);
  });
};

/** Test seam. Nothing in the card or the editor calls this. */
export const resetBadgeVerdicts = (): void => {
  for (const timer of TIMERS.values()) clearTimeout(timer);
  TIMERS.clear();
  VERDICTS.clear();
};
```

- [ ] **Step 5: Run them and watch them pass**

Run: `pnpm test src/tests/editor/badge-existence.test.ts`
Expected: PASS. The "probes once" test is the one that fails if the in-flight placeholder is missing.

- [ ] **Step 6: Commit**

```bash
git add src/editor/badge-existence.ts src/tests/editor/badge-existence.test.ts
git commit -m "feat(editor): a per-type probe for whether a badge type exists"
```

---

### Task 6: Wire the probe into the list, and fix the hang beside it

**Files:**
- Modify: `src/editor/badge-list.ts` — `render`
- Modify: `src/editor/badge-catalog.ts` — `resolveBadgeClass`
- Test: `src/tests/editor/badge-list.test.ts`, `src/tests/editor/badge-catalog.test.ts`

**Interfaces:**
- Consumes: `badgeVerdict`, `probeBadgeType`, `resetBadgeVerdicts` (Task 5); the error-row rendering (Task 4).
- Produces: nothing new.

- [ ] **Step 1: Write the failing list tests**

```ts
describe("a badge whose type does not exist", () => {
  beforeEach(() => resetBadgeVerdicts());

  it("renders unmarked on the first paint", async () => {
    const list = await mountList([{ type: "badge", position: { top: 5, left: 5 }, anchor: "auto", config: { type: "entty" } }] as PictureItem[]);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".kind")?.classList.contains("error")).toBe(false);
  });

  it("marks the row once the verdict lands, and disables Edit", async () => {
    const list = await mountList([{ type: "badge", position: { top: 5, left: 5 }, anchor: "auto", config: { type: "entty" } }] as PictureItem[]);
    await flushProbe(list);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".kind")?.getAttribute("icon")).toBe("mdi:alert-circle");
    expect((row.querySelectorAll("ha-icon-button")[0] as { disabled?: boolean }).disabled).toBe(true);
  });

  it("leaves a native type outside our catalogue alone", async () => {
    // `state-label` is a real badge type — it is in Home Assistant's lazy map
    // and simply absent from the picker's list, which is what CORE_BADGES
    // mirrors. It must not be flagged.
    const list = await mountList([{ type: "badge", position: { top: 5, left: 5 }, anchor: "auto", config: { type: "state-label" } }] as PictureItem[]);
    await flushProbe(list);
    const row = list.shadowRoot!.querySelectorAll(".item")[0]!;
    expect(row.querySelector(".kind")?.classList.contains("error")).toBe(false);
  });
});
```

`flushProbe` awaits the helpers promise and `list.updateComplete`; write it as a local helper in the file. Stub `window.loadCardHelpers` exactly as `badge-existence.test.ts` does, `state-label` included in the "real" list.

- [ ] **Step 2: Run them and watch the second and third fail**

Run: `pnpm test src/tests/editor/badge-list.test.ts`
Expected: the first PASSES already (nothing marks anything yet); the second FAILS.

- [ ] **Step 3: Wire it in `render()`**

Replace the `unknown` flag from Task 4 with one that folds both sources:

```ts
    // Two independent sources put a row into the error state, and they render
    // identically: the model, for an item we could not read, and the probe, for
    // a badge type this Home Assistant does not have.
    const broken = rows.map((item) => {
      if (item.type === "unknown") return true;
      if (item.type !== "badge") return false;
      const type = String(item.config.type ?? "");
      // A badge with no type at all is legal and means `entity` — the factory's
      // last argument is the default type. Nothing to probe.
      if (!type) return false;
      probeBadgeType(type, () => this.requestUpdate());
      return badgeVerdict(type) === "missing";
    });
```

Use `broken[index]` everywhere Task 4 used `unknown[index]`, **except** for the two things that are model-only: `rowLabel` already returns the badge's own label, and its secondary line for a probed-missing badge must be `localizeOwn(this.hass, "unknown_badge_type")`. Compute the secondary as:

```ts
    const secondary = rows.map((item, i) =>
      item.type !== "unknown" && broken[i]
        ? localizeOwn(this.hass, "unknown_badge_type")
        : labels[i]?.secondary,
    );
```

and render `secondary[index]` instead of `labels[index]?.secondary`.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test src/tests/editor/badge-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `resolveBadgeClass` test**

```ts
it("gives up instead of hanging on a type that does not exist", async () => {
  // `await customElements.whenDefined(tag)` never resolves for a type nothing
  // will ever define, so the add flow would hang forever. Unreachable through
  // the menu, which offers only known types — but the file now has the verdict
  // to short-circuit on.
  await expect(
    Promise.race([
      resolveBadgeClass("entty"),
      new Promise((r) => setTimeout(() => r("HUNG"), 50)),
    ]),
  ).resolves.toBeUndefined();
});
```

- [ ] **Step 6: Run it and watch it hang out to "HUNG"**

Run: `pnpm test src/tests/editor/badge-catalog.test.ts`
Expected: FAIL, resolving to `"HUNG"`.

- [ ] **Step 7: Short-circuit on the returned tag**

```ts
  const helpers = await window.loadCardHelpers();
  const probe = helpers.createBadgeElement({ type } as never) as HTMLElement;
  // The wrapper catches and returns hui-error-badge rather than throwing, so
  // this is the only synchronous signal that the type does not exist. Without
  // it, the whenDefined below never resolves.
  if (probe.tagName.toLowerCase() === "hui-error-badge") return undefined;
  const tag = `hui-${type}-badge`;
  await customElements.whenDefined(tag);
  return customElements.get(tag) as BadgeClass | undefined;
```

The existing `helpers.createBadgeElement({ type })` call is what forces the lazy import; this replaces it rather than adding a second one.

- [ ] **Step 8: Run everything**

Run: `pnpm format && pnpm test && pnpm typecheck && pnpm lint`
Expected: all green, `lint` exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/editor/badge-list.ts src/editor/badge-catalog.ts src/tests/editor/
git commit -m "feat(editor): flag a badge type this Home Assistant does not have"
```

---

### Task 7: The Visibility section explains and offers a reset

**Files:**
- Modify: `src/editor/visibility-section.ts` — `render`, `updated`, `editorConfig`, `static styles`
- Test: `src/tests/editor/visibility-section.test.ts`

**Interfaces:**
- Consumes: the `visibility_*` strings (Task 1); `hasVisibility` (Task 2).
- Produces: nothing new. The reset reuses the existing `visibility-changed` event with an empty list.

- [ ] **Step 1: Write the failing tests**

```ts
describe("a malformed visibility", () => {
  const malformed = { condition: "state", entity: "light.a", state: "on" } as never;

  it("shows no count pill — `.length` on a mapping is not a count", async () => {
    const section = await mountSection({ visibility: malformed });
    expect(section.shadowRoot!.querySelector("ha-label")).toBeNull();
  });

  it("mounts no oracle", async () => {
    const section = await mountSection({ visibility: malformed });
    expect(section.shadowRoot!.querySelector("ha-visibility-status")).toBeNull();
  });

  it("puts the warning and a visible verdict in the header", async () => {
    const section = await mountSection({ visibility: malformed });
    const icons = [...section.shadowRoot!.querySelectorAll('[slot="event"]')];
    expect(icons.map((i) => i.getAttribute("icon"))).toEqual(["mdi:alert-outline", "mdi:eye"]);
  });

  it("renders the alert instead of Home Assistant's editor", async () => {
    const section = await mountSection({ visibility: malformed });
    expect(section.shadowRoot!.querySelector("ha-alert")).not.toBeNull();
    expect(section.shadowRoot!.querySelector("hui-card-visibility-editor")).toBeNull();
  });

  it("clears the raw value when Reset is pressed", async () => {
    const section = await mountSection({ visibility: malformed });
    let detail: { visibility?: unknown } | undefined;
    section.addEventListener("visibility-changed", (ev) => {
      detail = (ev as CustomEvent).detail;
    });
    (section.shadowRoot!.querySelector('[slot="action"]') as HTMLElement).click();
    expect(detail).toEqual({ visibility: undefined });
  });

  it("falls back to a paragraph when ha-alert is not defined", async () => {
    // An undefined custom element renders nothing at all, silently — and here
    // that would evaporate the whole warning.
    const section = await mountSection({ visibility: malformed }, { haAlert: false });
    expect(section.shadowRoot!.querySelector("p.warning")?.textContent).toContain("not a list");
  });
});

describe("a well-formed visibility is unchanged", () => {
  it("still shows the count pill and no warning", async () => {
    const section = await mountSection({ visibility: [{ condition: "user", users: [] }] });
    expect(section.shadowRoot!.querySelector("ha-label")?.textContent?.trim()).toBe("1");
    expect(section.shadowRoot!.querySelector("ha-alert")).toBeNull();
  });
});
```

Follow the file's existing helper for mounting the section and for registering or withholding stub custom elements; add the `haAlert` switch to it rather than writing a second helper.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test src/tests/editor/visibility-section.test.ts`
Expected: FAIL. The first test in particular should report a pill reading `2` — `"on".length` — which is the defect being measured before it is fixed.

- [ ] **Step 3: Make the count a count**

Add near the top of the file:

```ts
/** The conditions, or undefined when the key holds something that is not a list.
    `.length` on a string is a character count, not a condition count. */
const conditionsOf = (value: unknown): VisibilityCondition[] | undefined =>
  Array.isArray(value) ? (value as VisibilityCondition[]) : undefined;
```

and use it in `render()` and `updated()`:

```ts
    const conditions = conditionsOf(this.visibility);
    const malformed = this.visibility !== undefined && conditions === undefined;
    const count = conditions?.length ?? 0;
```

In `updated()`, the same guard: `const count = conditionsOf(this.visibility)?.length ?? 0;` — so a malformed value takes the `count === 0` release path and no oracle is ever created.

`editorConfig()` already falls back with `?? []`; change it to `conditionsOf(this.visibility) ?? []` so a mapping does not reach Home Assistant's editor.

- [ ] **Step 4: Render the header**

```ts
        ${
          malformed
            ? html`
                <ha-icon
                  slot="event"
                  class="warning-icon"
                  icon="mdi:alert-outline"
                  title=${localizeOwn(hass, "visibility_unreadable")}
                ></ha-icon>
                <!-- Rendered, not measured: no condition applies, so the item is
                     visible. The oracle would be the wrong instrument — updated()
                     treats an empty list as its release path, and setup() returns
                     early on one. This also renders where ha-visibility-status is
                     absent, which the oracle route cannot. -->
                <ha-icon
                  slot="event"
                  class="status-icon"
                  .icon=${VERDICT_ICONS.visible}
                  style="color: ${VERDICT_COLORS.visible}"
                  title=${localizeOwn(hass, VERDICT_KEYS.visible)}
                ></ha-icon>
              `
            : count > 0
              ? html`…the existing pill + oracle verdict, unchanged…`
              : nothing
        }
```

The warning replaces the **count pill only** — the verdict stays, so the header says both things in one line: something is wrong, and the item shows anyway. Warning first, verdict second, the same left-to-right ordering the list row uses.

- [ ] **Step 5: Render the panel**

```ts
        <div class="content">
          ${
            malformed
              ? this._renderMalformed(hass)
              : this._available
                ? html`<hui-card-visibility-editor …>`
                : html`<p class="fallback">…</p>`
          }
        </div>
```

with:

```ts
  /**
   * The alert replaces Home Assistant's editor rather than sitting above it. One
   * decision, made explicitly, and then the section is ordinary again — an empty
   * editor ready for conditions.
   */
  private _renderMalformed(hass: HomeAssistant) {
    const title = localizeOwn(hass, "visibility_unreadable");
    const body = localizeOwn(hass, "visibility_unreadable_body");
    const reset = localizeOwn(hass, "visibility_reset");
    const onReset = () => {
      // The existing path: an empty list, which storedConfig already turns into
      // an absent key. No dedicated removal to write.
      this.dispatchEvent(
        new CustomEvent("visibility-changed", {
          detail: { visibility: undefined },
          bubbles: true,
          composed: true,
        }),
      );
    };
    // Guarded like every other borrowed component: an undefined custom element
    // renders nothing at all, silently, and here that is the whole warning.
    if (!customElements.get("ha-alert")) {
      return html`<p class="warning">
        ${body}
        <button type="button" @click=${onReset}>${reset}</button>
      </p>`;
    }
    return html`<ha-alert alert-type="warning" .title=${title}>
      ${body}
      <ha-button size="s" slot="action" @click=${onReset}>${reset}</ha-button>
    </ha-alert>`;
  }
```

`alert-type` is the attribute (`alertType` the property) and `<ha-button size="s" slot="action">` is Home Assistant's own idiom — both read out of the shipped frontend.

- [ ] **Step 6: Style the two new bits**

```css
    .warning-icon {
      color: var(--warning-color);
      --mdc-icon-size: 16px;
    }
    /* The ha-alert fallback, never seen on a frontend that has ha-alert. */
    p.warning {
      color: var(--warning-color);
      margin: 0;
    }
```

- [ ] **Step 7: Run the tests**

Run: `pnpm format && pnpm test src/tests/editor/visibility-section.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/editor/visibility-section.ts src/tests/editor/visibility-section.test.ts
git commit -m "feat(editor): explain an unreadable visibility and offer a reset"
```

---

### Task 8: Make the element-kind checklist self-enforcing

Three places treat a third element kind silently as an icon. Nothing is broken today; the point is that the next kind added cannot slip through.

**Files:**
- Modify: `src/editor/element-form.ts` — `_toData`, the inline ternary in `render()`
- Modify: `src/config.ts` — `isLabel` in `storedConfig`
- Create: `src/tests/element-kind-exhaustive.test.ts`
- Test: `src/tests/editor/element-form.test.ts`, `src/tests/config.test.ts`

**Interfaces:**
- Produces: `assertNever(value: never, what: string): never` — put it in `src/config.ts` beside the types it guards, exported.

- [ ] **Step 1: Write the failing compile-time test**

Create `src/tests/element-kind-exhaustive.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import type { ElementConfig } from "../config";

describe("adding a third element kind", () => {
  it("is a compile error at every site that branches on the kind", () => {
    // The guarantee is checked by tsc, not at runtime: each `assertNever` call
    // stops compiling the day ElementConfig gains a third member. This test
    // exists so the guarantee is named somewhere a reader will find it, and so
    // `pnpm typecheck` failing on it reads as a designed failure.
    const kinds: ElementConfig["type"][] = ["state-icon", "state-label"];
    expect(kinds).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Add the helper**

In `src/config.ts`:

```ts
/**
 * The floor under every branch on an element kind. Three sites default to the
 * icon when they do not recognise a kind, which means a third kind added without
 * touching all of them is not rejected — it is silently drawn as an icon. Calling
 * this in the default stops that: the day `ElementConfig` gains a member, each
 * site fails to compile.
 */
export const assertNever = (value: never, what: string): never => {
  throw new Error(`picture-studio: unhandled ${what}: ${String(value)}`);
};
```

- [ ] **Step 3: Guard `storedConfig`**

Replace `const isLabel = item.config.type === "state-label";` with a switch that names both kinds and calls `assertNever` in the default:

```ts
      const kind = item.config.type;
      const isLabel = kind === "state-label" ? true : kind === "state-icon" ? false : assertNever(kind, "element kind");
```

If Biome's formatting of the nested ternary is unpleasant, use a small `switch` in a local function instead — the requirement is the `assertNever(kind, …)` call in the exhaustive position, not the syntax.

- [ ] **Step 4: Guard the two sites in `element-form.ts`**

`_toData`:

```ts
  private _toData = (element: ElementConfig): Record<string, unknown> => {
    if (element.type === "state-label") return labelToFormData(element);
    if (element.type === "state-icon") return iconToFormData(element);
    return assertNever(element, "element kind");
  };
```

and in `render()`, replace `const data = element.type === "state-label" ? labelToFormData(element) : iconToFormData(element);` with `const data = this._toData(element);`. That removes the duplicate ternary entirely rather than guarding it twice — the two were the same expression written out in two places.

- [ ] **Step 5: Prove the guard bites**

Temporarily widen `ElementConfig` in a scratch edit — add `| { type: "state-gauge" }` — and run `pnpm typecheck`. Expected: three errors, one per site. Revert the scratch edit. Do not commit it; record in the commit body that it was measured.

- [ ] **Step 6: Run everything**

Run: `pnpm format && pnpm test && pnpm typecheck && pnpm lint`
Expected: all green, `lint` exit 0. Note that `element-form.ts` carries one pre-existing `useLiteralKeys` info — verify with `git show HEAD:src/editor/element-form.ts` if the count changes.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/editor/element-form.ts src/tests/
git commit -m "refactor: a third element kind now fails to compile rather than rendering as an icon"
```

---

### Task 9: The changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read the rule before writing the entry**

`CHANGELOG.md` is written **for users of the card**: an entry must change what a user does. Expected platform behaviour and corrections to unreleased features get cut. `Added` comes before `Changed`; then `Fixed`, `Removed`, `Deprecated`, `Security`.

- [ ] **Step 2: Write the entry under the `unreleased` heading**

```markdown
### Added

- The item list flags a badge whose type this Home Assistant does not have — a
  typo, or a custom badge whose resource never loaded.
- An item the card cannot read now gets a row of its own in the item list,
  marked with the reason, so it can be deleted without editing the YAML.

### Changed

- A single unreadable item no longer replaces the whole card with an error. The
  card skips it and draws everything else; the entry stays in your YAML exactly
  as you wrote it.
- Conditions written as something other than a list are ignored instead of
  breaking the card. The item always shows, and its Visibility section explains
  what happened and offers to clear them.
```

Nothing about `UnknownItem`, the index alignment or the exhaustiveness guards: none of them changes what a user does. They are in the git history.

- [ ] **Step 3: Ask about the version bump**

1.4.0 is on `main`, unreleased, and `package.json` still reads `1.3.1`. Whether this rides in 1.4.0 or becomes 1.5.0 is **the user's call** — ask, do not decide, and do not touch `package.json`.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): unreadable items are skipped, not fatal"
```

---

### Task 10: The browser walk

Not optional, and not replaceable by the suite: happy-dom does no layout, so nothing about the glyph colours, the alert's ground and spacing, or the row's geometry is observable in a test. Six defects shipped past a green suite and two reviews in 1.2.0.

**Fixtures are already in place.** `.ha/config/.storage/lovelace.dashboard_test` carries, added on 2026-08-19:
- a **"Unknown items — sections"** card in the sections view's second section, with every case
- a **"Unknown items — (a), still fatal"** card beside it
- a **"Unknown (panel)"** view carrying the same card

The container was restarted so Home Assistant reloaded the storage. `pnpm build` writes into the mounted `dist/`; only the dashboard resource's `?v=` needs bumping.

- [ ] **Step 1: Build and reload**

Run: `pnpm build`, bump the resource `?v=`, hard-reload.

- [ ] **Step 2: Walk the sections view**

- the five unreadable items draw nothing, and the control `state-icon` at 50/50 still draws
- the item list shows five error rows: `badgee`, `Unreadable item`, `badge`, `element`, `state-lable`
- their Edit buttons are dead, Delete removes one, and the remaining YAML is untouched — check the other items' coordinates did not move
- `entty` shows Home Assistant's error badge on the picture and a red row in the list
- `state-label` as a badge type shows **no** marker: it is a real type, merely outside our catalogue
- `custom:nodash` is red immediately; `custom:not-a-real-badge` goes red after about two seconds
- the `(d)` badge draws and is always visible; its row carries the orange warning; its Visibility header shows the orange glyph then a green eye while collapsed; opening it shows the alert and no editor; Reset clears it and the section becomes ordinary
- the `(a)` card is still a Home Assistant error card, naming the offending config

- [ ] **Step 3: Walk the panel view**

The same list, in "Unknown (panel)". Panel is a different environment: `hui-panel-view` zeroes the card tokens on `*`, so this is where a glyph or an alert inherits something it should not.

- [ ] **Step 4: Check the console**

One `console.warn` per ignored item, naming the index, the reason and the token. Five of them, no more — a warning per hass tick would mean the loop moved out of `setConfig`.

- [ ] **Step 5: Report what was seen**

Write down what was walked and what was found, per the project's habit. If nothing was found, say that — it is a result, not an absence of one.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the model, storage and the five cases → Task 2; the card and the alignment → Task 3; the error row → Task 4; the badge probe, native and custom → Tasks 5 and 6; the `resolveBadgeClass` hang → Task 6; the Visibility section and the `count` defect → Task 7; the exhaustiveness hardening → Task 8; the strings → Task 1; the versioning question → Task 9; the browser walk → Task 10.

**Placeholders.** The one deliberate ellipsis is in Task 7 Step 4, `…the existing pill + oracle verdict, unchanged…` — the branch is quoted verbatim in `visibility-section.ts` and copying it here would invite it being retyped subtly differently. Task 8 Step 3 offers a syntax choice, with the requirement stated exactly.

**Type consistency.** `UnknownItem` / `UnknownReason` (Task 2) are used under those names in Tasks 3, 4 and 8. `badgeVerdict` / `probeBadgeType` / `resetBadgeVerdicts` (Task 5) are used under those names in Task 6. `assertNever(value, what)` (Task 8) has one signature at all three call sites. Task 4 names the per-row flag `unknown`; Task 6 renames it to `broken` and says so explicitly, because it then folds in a second source.
