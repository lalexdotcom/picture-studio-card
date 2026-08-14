# Item Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every item on the picture a `visibility` key — Home Assistant's own condition list — evaluated by Home Assistant and reflected onto the item without a line of our JavaScript in that path.

**Architecture:** The key lives on the item envelope beside `position` and `anchor`, and stays opaque. On a dashboard, each conditional item gets a hidden `hui-card` sibling — the component that *implements* `visibility` — carrying nothing but a phantom card and the conditions; it marks itself with the native `hidden` attribute, and an adjacent-sibling CSS rule hides the item. In the editor there are no probes at all: the item is instead marked as *carrying* conditions, and the live verdict comes from Home Assistant's own banner inside the form.

**Tech Stack:** TypeScript, Lit 3 (bundled, no decorators), rstest + happy-dom, biome, rslib single-file build.

**Spec:** `docs/superpowers/specs/2026-08-14-item-visibility-design.md`

## Global Constraints

- **Serena's symbolic tools are primary for code.** Built-in Read/Edit/Grep on a `.ts` file only when a Serena tool failed or the file is unparseable. Read/Edit are fine for `.md`, JSON, YAML.
- **Home Assistant floor: 2026.6.0** (`hacs.json`). It does **not** move for this feature — `hui-card._setElementVisibility` is identical at `20260527.4` (the 2026.6.0 pin) and at `20260729.6`.
- **No decorators, no dynamic `import()`, single-file build.** Lit is bundled; properties are declared with the static `properties` block and `declare` fields, as every existing component does.
- **`config` is opaque per family**, and so is `visibility`: never read, validate, reorder or rewrite a condition's contents.
- **Never drop an unreadable item or an unknown key.** `storedConfig` rewrites the whole config on every editor commit, so a drop becomes permanent on the first drag.
- **Per-tick work is a design constraint.** The `hass` setter must not call `requestUpdate`, and nothing on the hass path may allocate a new object that a child would treat as a change. See `docs/superpowers/specs/2026-08-13-per-tick-work-design.md`.
- **A component's availability is a browser question.** `customElements.get` returning undefined is the only reliable test, and it must be done lazily (at render or on connection), never at module load.
- **Run `pnpm lint` after every modification.** Run `pnpm test` at every step that says so. Never `git push` — the user publishes.
- Chat in French; code, comments, commits and docs in English.

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `src/card/visibility-probe.ts` | The phantom card `hui-card` needs inside it. Renders nothing, ignores `hass`. |
| `src/editor/visibility-section.ts` | The collapsible "Visibility" section, shared by both item forms. Hosts Home Assistant's editor and relays its changes. |
| `src/tests/card/visibility-probe.test.ts` | The phantom card's contract. |
| `src/tests/editor/visibility-section.test.ts` | The section: relay, count, fallback. |

**Modified**

| File | Change |
| --- | --- |
| `src/types.ts` | `VisibilityCondition`, opaque. |
| `src/config.ts` | `visibility` on `ItemBase`; normalization; storage; `hasVisibility`; two tag constants. |
| `src/position.ts` | `markerCorner`, pure. |
| `src/editor/items.ts` | `setVisibility`. |
| `src/card/picture-studio-card.ts` | Probes, rebuild key, `hass` fan-out, the marker, the stacking exception, CSS. |
| `src/editor/badge-form.ts` | Mounts the section. |
| `src/editor/element-form.ts` | Mounts the section. |
| `src/editor/picture-studio-editor.ts` | `visibility` down, `visibility-changed` up, commit. |
| `src/strings.ts` | The section title fallback. |
| `src/index.ts` | Registers the phantom card and the section. |
| `README.md`, `CHANGELOG.md` | Documentation. |

**Two corrections found while planning, already folded back into the spec:**

- `markerCorner` takes `position` alone. The spec first said "from `position` and `anchor`"; writing the function showed the anchor carries no usable information without the item's size in percent — under any anchor, a large `left` means the right side is where the clipping happens.
- A `preview` change is pushed to the probes (Task 4, Step 5). The spec only set `preview` at creation. That is not enough: `preview` turns true on every card of a dashboard entering edit mode, and a probe built while it was false would keep evaluating, leaving a hidden item invisible to the person trying to edit it.

---

### Task 1: The config key

**Files:**
- Modify: `src/types.ts` (add `VisibilityCondition`)
- Modify: `src/config.ts:25-33` (`ItemBase`), `:128-163` (`normalizeConfig`), `:171-190` (`storedConfig`)
- Test: `src/tests/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type VisibilityCondition = Record<string, unknown>` from `src/types.ts`
  - `ItemBase.visibility?: VisibilityCondition[]`
  - `hasVisibility(item: PictureItem): boolean` from `src/config.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/config.test.ts`:

```ts
describe("item visibility", () => {
  const withVisibility = (visibility: unknown) => ({
    type: "custom:picture-studio",
    items: [
      {
        type: "badge",
        position: { top: "10%", left: "10%" },
        visibility,
        config: { type: "entity", entity: "light.a" },
      },
    ],
  });

  it("carries a condition list through untouched", () => {
    const conditions = [{ condition: "state", entity: "binary_sensor.night", state: "on" }];
    const out = normalizeConfig(withVisibility(conditions));
    expect(out.items[0]?.visibility).toEqual(conditions);
  });

  it("keeps a condition type it does not know", () => {
    const conditions = [{ condition: "future_condition", whatever: 1 }];
    const out = normalizeConfig(withVisibility(conditions));
    expect(out.items[0]?.visibility).toEqual(conditions);
  });

  it("leaves the key absent when the config has none", () => {
    const out = normalizeConfig({
      type: "custom:picture-studio",
      items: [{ type: "badge", config: { type: "entity" } }],
    });
    expect(out.items[0]?.visibility).toBeUndefined();
  });

  it("raises when visibility is not a list", () => {
    expect(() => normalizeConfig(withVisibility({ condition: "state" }))).toThrow(
      /items\[0\]\.visibility must be a list/,
    );
  });

  it("stores the key when it holds conditions", () => {
    const conditions = [{ condition: "state", entity: "light.a", state: "on" }];
    const stored = storedConfig(normalizeConfig(withVisibility(conditions)));
    expect((stored.items as Record<string, unknown>[])[0]?.visibility).toEqual(conditions);
  });

  it("omits the key when the list is empty", () => {
    const stored = storedConfig(normalizeConfig(withVisibility([])));
    expect((stored.items as Record<string, unknown>[])[0]).not.toHaveProperty("visibility");
  });

  it("omits the key when there is none, so an untouched config round-trips", () => {
    const raw = {
      type: "custom:picture-studio",
      items: [
        { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } },
      ],
    };
    const stored = storedConfig(normalizeConfig(raw));
    expect((stored.items as Record<string, unknown>[])[0]).not.toHaveProperty("visibility");
  });
});

describe("hasVisibility", () => {
  const item = (visibility?: unknown) =>
    normalizeConfig({
      type: "custom:picture-studio",
      items: [{ type: "badge", visibility, config: { type: "entity" } }],
    }).items[0]!;

  it("is false with no key", () => {
    expect(hasVisibility(item())).toBe(false);
  });

  it("is false with an empty list", () => {
    expect(hasVisibility(item([]))).toBe(false);
  });

  it("is true with one condition", () => {
    expect(hasVisibility(item([{ condition: "state" }]))).toBe(true);
  });
});
```

Add `hasVisibility` to the existing import from `../config` at the top of the file.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test src/tests/config.test.ts`
Expected: FAIL — `hasVisibility is not exported`, and the visibility assertions fail.

- [ ] **Step 3: Add the opaque type**

In `src/types.ts`, after the `BadgeConfig` interface:

```ts
/**
 * One entry of Home Assistant's `visibility` list. Opaque on purpose: the schema
 * is theirs, it already covers nine condition types, and `hui-card` is what
 * reads it. Declaring their union here would only be a copy to maintain, and a
 * copy that goes stale the next time they add a type.
 */
export type VisibilityCondition = Record<string, unknown>;
```

- [ ] **Step 4: Add the key to the item envelope**

In `src/config.ts`, extend the import from `./types` with `VisibilityCondition`, then add to `ItemBase`, after `anchor`:

```ts
  /**
   * Home Assistant's condition list, and theirs alone: never read, validated or
   * rewritten here. Absent means always drawn. Omitted from the stored config
   * when absent or empty — the rule Home Assistant's own visibility editor
   * applies — so a config that never used it comes back exactly as it went in.
   */
  visibility?: VisibilityCondition[];
```

- [ ] **Step 5: Normalize and store**

In `src/config.ts`, add above `normalizeConfig`:

```ts
const normalizeVisibility = (raw: unknown, index: number): VisibilityCondition[] | undefined => {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`picture-studio: items[${index}].visibility must be a list`);
  }
  // Contents are never inspected: an unknown condition type must survive a round
  // trip, exactly like an unknown key inside an element's config.
  return raw as VisibilityCondition[];
};

/** True when the item carries at least one condition. */
export const hasVisibility = (item: PictureItem): boolean =>
  Array.isArray(item.visibility) && item.visibility.length > 0;
```

Inside `normalizeConfig`'s `map`, after `const anchor = parseAnchor(entry.anchor);`, replace the trailing `return type === "badge" ? … : …` with:

```ts
    const visibility = normalizeVisibility(entry.visibility, index);
    const base = { position, anchor, ...(visibility ? { visibility } : {}) };

    return type === "badge"
      ? { ...base, type, config: entry.config as BadgeConfig }
      : { ...base, type, config: normalizeElementConfig(entry.config, index) };
```

In `storedConfig`, immediately after the `anchor` line:

```ts
    // Same rule as the anchor at its default, and the same rule Home Assistant
    // applies in its own editor: an empty list says nothing while looking like
    // it says something.
    if (!hasVisibility(item)) delete stored.visibility;
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm test src/tests/config.test.ts`
Expected: PASS, all of them.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors; the three pre-existing warnings in the test files are unrelated and stay.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/config.ts src/tests/config.test.ts
git commit -m "feat: a visibility key on every item

Home Assistant's own condition list, on the item envelope beside position and
anchor rather than inside config: a badge's payload belongs to a third party
whose editor rewrites it whole, and a visibility written there is the dead key
this feature exists to replace.

The contents stay opaque. Their schema already covers nine condition types and
will grow again; hui-card is what reads it, so an unknown type has to survive a
round trip the way an unknown key inside an element's config does.

Absent or empty, the key is omitted from the stored config — the rule Home
Assistant applies in its own visibility editor, and the one anchor already
follows at its default."
```

---

### Task 2: The marker's corner

**Files:**
- Modify: `src/position.ts` (append)
- Test: `src/tests/position.test.ts`

**Interfaces:**
- Consumes: `Position` from `src/position.ts`.
- Produces: `type MarkerCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right"` and `markerCorner(position: Position): MarkerCorner`, both from `src/position.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/position.test.ts`:

```ts
describe("markerCorner", () => {
  it("points left for an item in the right half", () => {
    expect(markerCorner({ top: 50, left: 80 })).toBe("top-left");
  });

  it("points right for an item in the left half", () => {
    expect(markerCorner({ top: 50, left: 20 })).toBe("top-right");
  });

  it("points right exactly at the middle", () => {
    expect(markerCorner({ top: 50, left: 49.99 })).toBe("top-right");
    expect(markerCorner({ top: 50, left: 50 })).toBe("top-left");
  });

  it("drops below for an item against the top edge", () => {
    expect(markerCorner({ top: 0, left: 20 })).toBe("bottom-right");
    expect(markerCorner({ top: 10, left: 80 })).toBe("bottom-left");
  });

  it("stays above just under the band", () => {
    expect(markerCorner({ top: 10.01, left: 20 })).toBe("top-right");
  });

  it("answers for an overflowing coordinate rather than throwing", () => {
    expect(markerCorner({ top: -30, left: 140 })).toBe("bottom-left");
  });
});
```

Add `markerCorner` to the existing import from `../position`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/position.test.ts`
Expected: FAIL — `markerCorner is not a function`.

- [ ] **Step 3: Implement**

Append to `src/position.ts`:

```ts
/** Which corner of the item the editor's condition marker overhangs. */
export type MarkerCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Above this band, the marker would overhang the top of the picture and be
 * clipped, so it drops under the item instead.
 */
const MARKER_TOP_BAND = 10;

/**
 * The marker overhangs the item, so it has to point towards the inside of the
 * card: `ha-card` is `overflow-x: hidden`, and the top of the picture is where
 * the vertical clipping happens.
 *
 * Derived from the stored coordinates alone. No layout is read — happy-dom
 * performs none, and the drag deliberately avoids measurements outside
 * `pointermove` — and the anchor is not consulted: without the item's size in
 * percent it cannot say where an edge falls, while the coordinate alone already
 * answers "which half of the picture is this in", which is the whole question.
 *
 * Being wrong costs a clipped marker, never a misplaced item.
 */
export const markerCorner = (position: Position): MarkerCorner => {
  const vertical = position.top <= MARKER_TOP_BAND ? "bottom" : "top";
  const horizontal = position.left >= 50 ? "left" : "right";
  return `${vertical}-${horizontal}`;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/tests/position.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add src/position.ts src/tests/position.test.ts
git commit -m "feat: the corner the condition marker sits in

The marker overhangs the item, and ha-card clips horizontally, so it has to
point towards the inside of the picture. Derived from the stored coordinates
alone: happy-dom performs no layout, and the drag avoids measurements outside
pointermove, so a rule that needed a rect would be both untestable here and a
read on the hot path.

The anchor is deliberately not consulted. Without the item's size in percent it
cannot say where an edge falls, and the coordinate already answers which half of
the picture the item is in — which is the whole question. Being wrong costs a
clipped marker, never a misplaced item."
```

---

### Task 3: The phantom card

**Files:**
- Create: `src/card/visibility-probe.ts`
- Modify: `src/config.ts` (tag constants), `src/index.ts` (registration)
- Test: `src/tests/card/visibility-probe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PROBE_TAG = "picture-studio-visibility-probe"` and `PROBE_TYPE = "custom:picture-studio-visibility-probe"` from `src/config.ts`
  - `class PictureStudioVisibilityProbe extends HTMLElement` from `src/card/visibility-probe.ts`, with `setConfig(config: unknown): void` and `getCardSize(): number`

- [ ] **Step 1: Write the failing test**

Create `src/tests/card/visibility-probe.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { PictureStudioVisibilityProbe } from "../../card/visibility-probe";
import { PROBE_TAG, PROBE_TYPE } from "../../config";

const mount = (): PictureStudioVisibilityProbe => {
  if (!customElements.get(PROBE_TAG)) {
    customElements.define(PROBE_TAG, PictureStudioVisibilityProbe);
  }
  return document.createElement(PROBE_TAG) as PictureStudioVisibilityProbe;
};

describe("the visibility probe's phantom card", () => {
  it("names its custom type after its tag", () => {
    expect(PROBE_TYPE).toBe(`custom:${PROBE_TAG}`);
  });

  it("accepts any config, since it carries no options of its own", () => {
    const probe = mount();
    expect(() => probe.setConfig({ type: PROBE_TYPE })).not.toThrow();
    expect(() => probe.setConfig(undefined)).not.toThrow();
  });

  it("claims no height", () => {
    expect(mount().getCardSize()).toBe(0);
  });

  it("renders nothing", () => {
    const probe = mount();
    probe.setConfig({ type: PROBE_TYPE });
    document.body.append(probe);
    expect(probe.childNodes.length).toBe(0);
    expect(probe.shadowRoot).toBeNull();
    probe.remove();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/tests/card/visibility-probe.test.ts`
Expected: FAIL — the module and the constants do not exist.

- [ ] **Step 3: Add the tag constants**

In `src/config.ts`, after `ELEMENT_FORM_TAG`:

```ts
export const PROBE_TAG = "picture-studio-visibility-probe";
export const VISIBILITY_SECTION_TAG = "picture-studio-visibility-section";
export const PROBE_TYPE = `custom:${PROBE_TAG}` as const;
```

- [ ] **Step 4: Write the phantom card**

Create `src/card/visibility-probe.ts`:

```ts
/**
 * The card a visibility probe carries inside it.
 *
 * A probe is a `hui-card` — Home Assistant's own implementation of the
 * `visibility` key — and `hui-card._updateVisibility` returns early when it has
 * no inner element, so a probe with no card evaluates nothing. This is that
 * card, and it is deliberately the cheapest object satisfying the contract: it
 * renders nothing, ignores `hass`, loads no chunk and opens no subscription.
 *
 * It is never pushed to `window.customCards`, so it cannot appear in the card
 * picker. A real Home Assistant card in this position would cost a chunk load, a
 * render and a `hass` propagation per item, for a card kept at `display: none`.
 */
export class PictureStudioVisibilityProbe extends HTMLElement {
  /**
   * Accepts anything. The config is ours, it carries only the type and the
   * conditions — which are read by the `hui-card` above, never here — and
   * `createCardElement` calls this with whatever it was handed.
   */
  setConfig(_config: unknown): void {}

  /** Home Assistant asks every card; nothing is drawn, so nothing is claimed. */
  getCardSize(): number {
    return 0;
  }
}
```

- [ ] **Step 5: Register it**

In `src/index.ts`, add the import and the registration next to the others:

```ts
import { PictureStudioVisibilityProbe } from "./card/visibility-probe";
```

```ts
if (!customElements.get(PROBE_TAG)) {
  customElements.define(PROBE_TAG, PictureStudioVisibilityProbe);
}
```

Extend the existing `./config` import with `PROBE_TAG`. Registration happens at module load, before any card can render, so `createCardElement` always finds the tag defined.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/tests/card/visibility-probe.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add src/card/visibility-probe.ts src/config.ts src/index.ts src/tests/card/visibility-probe.test.ts
git commit -m "feat: the phantom card a visibility probe carries

hui-card._updateVisibility returns early without an inner element, so a probe
with no card evaluates nothing. This is the cheapest object that satisfies the
contract: no render, no hass, no chunk, no subscription.

A real Home Assistant card here would cost a chunk load, a render and a hass
propagation per item — the markdown card can even open a template subscription
on the websocket — all for something kept at display: none. A deliberately
invalid type would work too, at the price of console noise that reads as a bug.

It is never pushed to window.customCards, so it stays out of the picker."
```

---

### Task 4: Probes on the card

**Files:**
- Modify: `src/card/picture-studio-card.ts:68-79` (`hass` setter), `:306-350` (`_syncItems`), styles block
- Test: `src/tests/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: `hasVisibility`, `PROBE_TYPE` from `src/config.ts`.
- Produces: a `.probe` sibling immediately before each conditional item's `.item` wrapper, on a dashboard only.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/card/picture-studio-card.test.ts` (the file already imports `mountCard`, `root`, `wrappers` and `flush` from `./harness`):

```ts
describe("visibility probes", () => {
  const CONFIG = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "badge",
        position: { top: "10%", left: "10%" },
        visibility: [{ condition: "state", entity: "light.a", state: "on" }],
        config: { type: "entity", entity: "light.a" },
      },
      {
        type: "badge",
        position: { top: "20%", left: "20%" },
        config: { type: "entity", entity: "light.b" },
      },
    ],
  };

  const probes = (card: PictureStudioCard): HTMLElement[] =>
    Array.from(root(card).querySelectorAll(".probe")) as HTMLElement[];

  const EDITOR_STUB: EditorChannel = {
    patchPosition: () => {},
    patchAnchor: () => {},
    select: () => {},
    selectedIndex: () => undefined,
  };

  it("creates one probe, for the conditional item only", async () => {
    const card = await mountCard(CONFIG);
    expect(probes(card).length).toBe(1);
  });

  it("puts the probe immediately before its own item", async () => {
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0]!;
    expect(probe.nextElementSibling).toBe(wrappers(card)[0]);
  });

  it("hands the probe the item's conditions and the phantom type", async () => {
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { config?: Record<string, unknown> };
    expect(probe.config?.type).toBe(PROBE_TYPE);
    expect(probe.config?.visibility).toEqual(CONFIG.items[0]?.visibility);
  });

  it("pushes hass to the probes", async () => {
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { hass?: unknown };
    const hass = { states: {}, themes: { darkMode: false }, language: "en", localize: () => "" };
    card.hass = hass as never;
    expect(probe.hass).toBe(hass);
  });

  it("creates none when the editor is already there at the first sync", async () => {
    releaseEditor = registerEditor(EDITOR_STUB);
    installHelpers();
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.preview = true;
    card.setConfig(CONFIG);
    document.body.append(card);
    await card.updateComplete;
    await flush();
    expect(probes(card).length).toBe(0);
  });

  it("forces a probe visible when preview arrives after it was built", async () => {
    // The false→true transition at mount: the preview can render before the
    // editor announces itself. The probe then exists, and `preview` is what
    // keeps it from hiding anything.
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { preview?: boolean };
    expect(probe.preview).toBe(false);
    card.preview = true;
    await card.updateComplete;
    expect(probe.preview).toBe(true);
  });

  it("rebuilds when conditions appear on an item that had none", async () => {
    const card = await mountCard(CONFIG);
    expect(probes(card).length).toBe(1);
    card.setConfig({
      ...CONFIG,
      items: [CONFIG.items[0], { ...CONFIG.items[1], visibility: [{ condition: "screen" }] }],
    });
    await card.updateComplete;
    await flush();
    expect(probes(card).length).toBe(2);
  });

  it("rebuilds when conditions disappear", async () => {
    const card = await mountCard(CONFIG);
    card.setConfig({ ...CONFIG, items: [{ ...CONFIG.items[0], visibility: undefined }, CONFIG.items[1]] });
    await card.updateComplete;
    await flush();
    expect(probes(card).length).toBe(0);
  });
});
```

Extend the file's imports: `PROBE_TYPE` and `CARD_TAG` from `../../config`, `installHelpers` from `./harness`, and `PictureStudioCard` from `../../card/picture-studio-card`. `registerEditor`, `EditorChannel` and the module-level `releaseEditor` variable with its `afterEach` release are already there — reuse them rather than adding a second cleanup, and follow the existing "marks the selected badge" test for the shape.

**Note the two editing tests.** `editing` is derived, never assigned: `_syncEditingAndDrag` recomputes it from `preview` and the broker, so poking the property does nothing. Entering the editor after mount does **not** rebuild the layer either — `updated()` routes an `editing` change to `_applyPositions` alone. That is why one test registers the editor *before* mounting, and the other asserts the benign race instead of pretending it cannot happen.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/card/picture-studio-card.test.ts`
Expected: FAIL — no `.probe` node is ever created.

- [ ] **Step 3: Add the probe registry and the creator**

In `src/card/picture-studio-card.ts`, extend the `./config` import with `hasVisibility` and `PROBE_TYPE`, then add a field beside `_wrappers`:

```ts
  /** Indexed like _wrappers; a hole where the item carries no conditions. */
  private _probes: (ProbeElement | undefined)[] = [];
```

and, above the class, the shape we drive on a `hui-card`:

```ts
/**
 * The slice of `hui-card` a probe uses. Declared rather than imported: it is
 * Home Assistant's element, and we only ever set these four.
 */
type ProbeElement = HTMLElement & {
  config?: unknown;
  hass?: unknown;
  preview?: boolean;
  load?: () => void;
};
```

Add the creator next to `_createChild`:

```ts
  /**
   * A `hui-card` carrying nothing but the item's conditions and a phantom card.
   * It is Home Assistant's own implementation of `visibility`, so the
   * evaluation, the media-query listeners and the `time` timers are theirs. The
   * verdict lands on the probe as the native `hidden` attribute, and the
   * stylesheet's sibling rule reflects it onto the item — no JavaScript of ours
   * in that path.
   *
   * `preview` follows the card's own, not `editing`: it is true both in the edit
   * dialog and on a dashboard in edit mode, which is exactly when Home Assistant
   * keeps its own hidden cards on screen.
   *
   * None at all while editing. The editor's marker says "has conditions", not
   * "is hidden", so no verdict is needed there — and that is where the drag
   * layer is already the heaviest.
   */
  private _createProbe(item: PictureItem): ProbeElement | undefined {
    if (this.editing || !hasVisibility(item)) return undefined;
    const probe = document.createElement("hui-card") as ProbeElement;
    probe.className = "probe";
    probe.config = { type: PROBE_TYPE, visibility: item.visibility };
    probe.preview = this.preview;
    if (this._hass) probe.hass = this._hass;
    // Optional call: in the test environment hui-card is not defined, and an
    // unknown element has no load(). The probe is then inert, which is what the
    // suite asserts against — the real behaviour is a browser question.
    probe.load?.();
    return probe;
  }
```

- [ ] **Step 4: Wire the probes into `_syncItems`**

Extend the rebuild key (`src/card/picture-studio-card.ts:311-313`):

```ts
    // The family, the kind, and whether the item carries conditions. The last
    // one belongs here because a probe is a sibling in the layer: it appearing
    // or disappearing changes the DOM we build, not just the config we push.
    const types = items.map(
      (item) => `${item.type}:${String(item.config.type ?? "")}:${hasVisibility(item) ? "v" : ""}`,
    );
```

In the rebuild branch, reset the registry beside the others and insert the probe *before* the wrapper:

```ts
      this._probes = [];
```

```ts
        const probe = this._createProbe(item);
        if (probe) layer.append(probe);
        layer.append(wrapper);

        this._elements.push(child);
        this._wrappers.push(wrapper);
        this._probes.push(probe);
```

In the same-shape branch, push the new conditions into the existing probe:

```ts
        const probe = this._probes[index];
        // A new object each time is correct here: this branch only runs on a
        // config change, never on the hass path.
        if (probe) probe.config = { type: PROBE_TYPE, visibility: item.visibility };
```

- [ ] **Step 5: Fan `hass` out to the probes**

In the `hass` setter (`src/card/picture-studio-card.ts:68-79`), after the loop over `_elements`:

```ts
    for (const probe of this._probes) {
      if (probe) probe.hass = hass;
    }
```

Still no `requestUpdate`: this is the per-tick path, and a plain assignment is what `hui-card` expects.

Then propagate `preview` too, in `updated()`, beside the existing `changed.has("preview")` branch:

```ts
    if (changed.has("preview")) {
      for (const probe of this._probes) {
        if (probe) probe.preview = this.preview;
      }
    }
```

**This is load-bearing, not symmetry.** `preview` is set on every card of a dashboard entering edit mode, and it is what makes Home Assistant keep its own hidden cards on screen. A probe built while `preview` was false would otherwise keep evaluating, and an item hidden by its conditions would stay invisible to the person trying to edit it. It also closes the mount-order race: a probe built before the editor announced itself is forced visible rather than judging.

- [ ] **Step 6: Add the CSS**

In the styles block, after the `.layer` rule:

```css
    /* The probe is a hui-card carrying the item's conditions. It stays in the
       DOM — the Lit context a view_columns condition consumes resolves through
       it, and display: none is not detachment — and never draws.
       The important beats the inline display hui-card drives on itself, without
       touching the hidden attribute, which is the signal. */
    .probe {
      display: none !important;
    }
    .probe[hidden] + .item {
      display: none;
    }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/tests/card/picture-studio-card.test.ts`
Expected: PASS, and the pre-existing tests in the file still pass — in particular the ones counting wrappers, since a probe is not a `.item`.

- [ ] **Step 8: Full suite, typecheck, lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add src/card/picture-studio-card.ts src/tests/card/picture-studio-card.test.ts
git commit -m "feat: evaluate item conditions through a hui-card probe

Conditions are evaluated by checkConditionsMet, a module function with no global
export, over nine condition types with media-query listeners and recomputed
timers behind them. Reimplementing that is a drift machine, and the failure mode
is silent: an item that stops obeying its own config.

So each conditional item gets a hidden hui-card sibling — the component that
implements the visibility key — carrying nothing but the conditions and a
phantom card. It marks itself with the native hidden attribute, and an
adjacent-sibling rule hides the item. No JavaScript of ours in that path.

None while editing: the marker there says the item has conditions, not that it
is hidden, so no verdict is needed where the drag layer is heaviest. The rebuild
key gains the presence of conditions, because a probe is a sibling in the layer
and not just a config we push."
```

---

### Task 5: The marker and the stacking exception

**Files:**
- Modify: `src/card/picture-studio-card.ts:362-380` (`_applyPositions`), styles block
- Test: `src/tests/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: `hasVisibility` from `src/config.ts`, `markerCorner` and `MarkerCorner` from `src/position.ts`.
- Produces: on each wrapper, in edit mode only, the class `conditional`, one of `marker-top-left` / `marker-top-right` / `marker-bottom-left` / `marker-bottom-right`, and `data-conditions` holding the count.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/card/picture-studio-card.test.ts`:

```ts
describe("the condition marker", () => {
  const CONFIG = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "badge",
        position: { top: "40%", left: "80%" },
        visibility: [{ condition: "state", entity: "light.a", state: "on" }, { condition: "screen" }],
        config: { type: "entity", entity: "light.a" },
      },
      {
        type: "badge",
        position: { top: "20%", left: "20%" },
        config: { type: "entity", entity: "light.b" },
      },
    ],
  };

  // editing is derived, never assigned: it comes from `preview` plus a
  // registered editor. releaseEditor and its afterEach already live at the top
  // of this file.
  const edit = async (card: PictureStudioCard): Promise<void> => {
    card.preview = true;
    releaseEditor = registerEditor({
      patchPosition: () => {},
      patchAnchor: () => {},
      select: () => {},
      selectedIndex: () => undefined,
    });
    await flush();
  };

  it("marks only the conditional item, and only while editing", async () => {
    const card = await mountCard(CONFIG);
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(false);
    await edit(card);
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(true);
    expect(wrappers(card)[1]?.classList.contains("conditional")).toBe(false);
  });

  it("carries the number of conditions", async () => {
    const card = await mountCard(CONFIG);
    await edit(card);
    expect(wrappers(card)[0]?.dataset.conditions).toBe("2");
  });

  it("points the marker towards the inside of the picture", async () => {
    const card = await mountCard(CONFIG);
    await edit(card);
    expect(wrappers(card)[0]?.classList.contains("marker-top-left")).toBe(true);
    expect(wrappers(card)[0]?.classList.contains("marker-top-right")).toBe(false);
  });

  it("clears the mark when the conditions go", async () => {
    const card = await mountCard(CONFIG);
    await edit(card);
    card.setConfig({ ...CONFIG, items: [{ ...CONFIG.items[0], visibility: undefined }, CONFIG.items[1]] });
    await card.updateComplete;
    await flush();
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(false);
    expect(wrappers(card)[0]?.dataset.conditions).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/card/picture-studio-card.test.ts`
Expected: FAIL — the `conditional` class is never set.

- [ ] **Step 3: Set the classes in `_applyPositions`**

Extend the `../position` import with `markerCorner` and `MarkerCorner`, and add a module constant above the class:

```ts
const MARKER_CORNERS: MarkerCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
```

In `_applyPositions`, right after the `selected` toggle and **before** the `if (index === dragging) return;` guard:

```ts
      // "This item carries conditions", not "it is hidden right now": there is
      // no probe in the editor, so there is no verdict to read — and a static
      // mark is the better affordance anyway, since it does not flicker with
      // entity state. The live verdict lives in the form's own banner.
      const conditional = this.editing && hasVisibility(item);
      wrapper.classList.toggle("conditional", conditional);
      const corner = conditional ? markerCorner(item.position) : undefined;
      for (const c of MARKER_CORNERS) wrapper.classList.toggle(`marker-${c}`, c === corner);
      if (conditional) {
        wrapper.dataset.conditions = String(item.visibility?.length ?? 0);
      } else {
        delete wrapper.dataset.conditions;
      }
```

It sits before the drag guard on purpose: none of it depends on the live pixels the drag controller owns, and the corner is computed from the stored coordinates, which are stale for the length of a gesture — so the marker flips on release rather than mid-gesture.

- [ ] **Step 4: Add the CSS**

In the styles block, after the `.editing .item.selected, .editing .item.dragging` rule:

```css
    /* The item being edited comes to the front. This is the one exception to
       "no z-index": it is an editor affordance, it never reaches the config,
       and it does not exist on a dashboard — the rendered stacking still has a
       single authority, the list order. .dragging is there in its own right:
       the selection arrives through a re-render, which pointer capture can
       precede by a frame. */
    .editing .item.selected,
    .editing .item.dragging {
      z-index: 1;
    }
    /* "This item carries conditions". Out of flow, so it adds nothing to the
       wrapper's max-content width: the halo, the ring and the radius keep
       tracing the item alone, and getBoundingClientRect — which the drag clamp
       measures — returns the same box it did before.
       Its own pointer-events, because `.editing .item > *` matches real
       children and not a pseudo-element. */
    .editing .item.conditional::after {
      content: attr(data-conditions);
      position: absolute;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-md, 8px);
      background: var(--secondary-background-color, #e0e0e0);
      color: var(--primary-text-color, #212121);
      font-size: 11px;
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: 16px;
      text-align: center;
      pointer-events: none;
    }
    .editing .item.marker-top-right::after {
      top: -8px;
      right: -8px;
    }
    .editing .item.marker-top-left::after {
      top: -8px;
      left: -8px;
    }
    .editing .item.marker-bottom-right::after {
      bottom: -8px;
      right: -8px;
    }
    .editing .item.marker-bottom-left::after {
      bottom: -8px;
      left: -8px;
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/tests/card/picture-studio-card.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite, typecheck, lint, commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`

```bash
git add src/card/picture-studio-card.ts src/tests/card/picture-studio-card.test.ts
git commit -m "feat: mark the items that carry conditions, and raise the edited one

The preview is where items are selected, so that is where the mark belongs. It
says the item has conditions, not that it is hidden right now: there is no probe
in the editor, so there is no verdict to read — and a static mark does not
flicker with entity state. The live verdict stays in the form's banner, which is
where Home Assistant puts it and the only place it puts it.

The pill is out of flow, so the wrapper's box is unchanged: the halo, the ring
and the radius keep tracing the item alone, and getBoundingClientRect — what the
drag clamp measures — returns the same rect. Its corner points towards the
inside of the picture, because ha-card clips horizontally.

This also takes the one exception to 'no z-index, ever': the selected or dragged
item comes to the front. It is an editor affordance, it never reaches the config
and it does not exist on a dashboard, so the rendered stacking still has a single
authority — the list order."
```

---

### Task 6: The Visibility section

**Files:**
- Create: `src/editor/visibility-section.ts`
- Modify: `src/strings.ts`, `src/index.ts`
- Test: `src/tests/editor/visibility-section.test.ts`

**Interfaces:**
- Consumes: `VISIBILITY_SECTION_TAG` from `src/config.ts`, `localizeOwn` from `src/strings.ts`, `VisibilityCondition` from `src/types.ts`.
- Produces: `class PictureStudioVisibilitySection` from `src/editor/visibility-section.ts`, with properties `hass?: HomeAssistant` and `visibility?: VisibilityCondition[]`, emitting `visibility-changed` with `detail: { visibility: VisibilityCondition[] | undefined }`, bubbling and composed.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/editor/visibility-section.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { VISIBILITY_SECTION_TAG } from "../../config";
import { PictureStudioVisibilitySection } from "../../editor/visibility-section";
import type { HomeAssistant } from "../../types";

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: (key: string) => (key.endsWith("tab_visibility") ? "Visibility" : ""),
} as unknown as HomeAssistant;

const mount = async (
  visibility?: Record<string, unknown>[],
): Promise<PictureStudioVisibilitySection> => {
  if (!customElements.get(VISIBILITY_SECTION_TAG)) {
    customElements.define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
  }
  const el = document.createElement(VISIBILITY_SECTION_TAG) as PictureStudioVisibilitySection;
  el.hass = hass;
  el.visibility = visibility;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("the visibility section", () => {
  it("shows no count when there are no conditions", async () => {
    const el = await mount();
    expect(el.renderRoot.querySelector("ha-label")).toBeNull();
  });

  it("counts the top-level conditions in the header", async () => {
    const el = await mount([{ condition: "state" }, { condition: "screen" }]);
    expect(el.renderRoot.querySelector("ha-label")?.textContent?.trim()).toBe("2");
  });

  it("falls back when Home Assistant's editor is not defined", async () => {
    const el = await mount();
    expect(el.renderRoot.querySelector(".fallback")).not.toBeNull();
    expect(el.renderRoot.querySelector("hui-card-visibility-editor")).toBeNull();
  });

  it("relays a new list, bubbling and composed", async () => {
    const el = await mount();
    const seen: unknown[] = [];
    document.body.addEventListener("visibility-changed", (ev) =>
      seen.push((ev as CustomEvent).detail),
    );
    const conditions = [{ condition: "state", entity: "light.a" }];
    el.handleValueChanged(
      new CustomEvent("value-changed", { detail: { value: { visibility: conditions } } }),
    );
    expect(seen).toEqual([{ visibility: conditions }]);
  });

  it("relays an emptied list as no conditions at all", async () => {
    const el = await mount([{ condition: "state" }]);
    const seen: unknown[] = [];
    document.body.addEventListener("visibility-changed", (ev) =>
      seen.push((ev as CustomEvent).detail),
    );
    el.handleValueChanged(new CustomEvent("value-changed", { detail: { value: {} } }));
    expect(seen).toEqual([{ visibility: undefined }]);
  });

  it("hands Home Assistant's editor the same object while the list is unchanged", async () => {
    const el = await mount([{ condition: "state" }]);
    const first = el.editorConfig();
    await el.updateComplete;
    expect(el.editorConfig()).toBe(first);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/editor/visibility-section.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Add the title fallback string**

In `src/strings.ts`, add `visibility: "Visibility"` to the `en` table and `visibility: "Visibilité"` to `fr`, keeping both alphabetically placed as the existing keys are.

- [ ] **Step 4: Write the section**

Create `src/editor/visibility-section.ts`:

```ts
import { css, html, LitElement, nothing } from "lit";
import { localizeOwn } from "../strings";
import type { HomeAssistant, VisibilityCondition } from "../types";

/** Home Assistant's whole visibility tab: the status banner and the list. */
const HA_EDITOR = "hui-card-visibility-editor";

const VISIBILITY_ICON = "mdi:eye";

/**
 * The "Visibility" section both item forms carry.
 *
 * It hosts Home Assistant's own editor rather than the conditions list alone,
 * which buys two things we would otherwise build or do without:
 * `ha-visibility-status`, the live verdict banner at the top of the section, and
 * the context provider the entity-less condition sub-editors consume.
 *
 * The count in the header answers "does this item have conditions" without
 * expanding. The verdict — visible, hidden, invalid — is the banner's job.
 */
export class PictureStudioVisibilitySection extends LitElement {
  static properties = {
    hass: { attribute: false },
    visibility: { attribute: false },
    _available: { state: true },
  };

  declare hass?: HomeAssistant;
  declare visibility?: VisibilityCondition[];
  declare _available: boolean;

  /**
   * `hass` is reassigned on every state change, so this component re-renders on
   * every tick. A fresh config object each time would look like a change to
   * Home Assistant's editor and push a new config into it per tick; caching it
   * against the list keeps the identity stable. Same idiom as the schema cache
   * in the editor hub.
   */
  private _configCache?: {
    visibility?: VisibilityCondition[];
    config: { visibility: VisibilityCondition[] };
  };

  constructor() {
    super();
    this._available = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Lazily, never at module load: a chunk that registers the element after
    // ours is still found. An undefined custom element renders nothing at all,
    // silently, so the fallback below is the difference between an explanation
    // and an empty section.
    this._available = !!customElements.get(HA_EDITOR);
    if (!this._available) {
      void customElements.whenDefined(HA_EDITOR).then(() => {
        this._available = true;
      });
    }
  }

  /** Stable while the list is unchanged. Public for the test. */
  editorConfig(): { visibility: VisibilityCondition[] } {
    if (this._configCache?.visibility !== this.visibility) {
      this._configCache = {
        visibility: this.visibility,
        config: { visibility: this.visibility ?? [] },
      };
    }
    return this._configCache.config;
  }

  /**
   * Home Assistant hands back the whole config it was given, with `visibility`
   * deleted when the list falls back to zero — so an absent key here means "no
   * conditions", not "unchanged", and it is relayed as such.
   *
   * Public for the test: the event comes from a component that does not exist
   * in the suite, so there is nothing to dispatch it from.
   */
  handleValueChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = (ev.detail as { value?: { visibility?: VisibilityCondition[] } } | undefined)
      ?.value;
    const visibility = value?.visibility;
    this.dispatchEvent(
      new CustomEvent("visibility-changed", {
        detail: { visibility: visibility?.length ? visibility : undefined },
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected render() {
    const hass = this.hass;
    if (!hass) return nothing;

    const count = this.visibility?.length ?? 0;
    const title =
      hass.localize("ui.panel.lovelace.editor.edit_card.tab_visibility") ||
      localizeOwn(hass, "visibility");

    return html`
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" .icon=${VISIBILITY_ICON}></ha-icon>
        <div slot="header" role="heading" aria-level="3">${title}</div>
        ${count > 0 ? html`<ha-label slot="icons" dense>${count}</ha-label>` : nothing}
        <div class="content">
          ${
            this._available
              ? html`<hui-card-visibility-editor
                  .hass=${hass}
                  .config=${this.editorConfig()}
                  @value-changed=${this.handleValueChanged}
                ></hui-card-visibility-editor>`
              : html`<p class="fallback">
                  This Home Assistant version does not expose the visibility editor here.
                  Edit the item's conditions in the YAML tab.
                </p>`
          }
        </div>
      </ha-expansion-panel>
    `;
  }

  static styles = css`
    /* Mirrors the placement sections of both forms: the panel's own content
       padding is zeroed and the section supplies its own, so every section of
       an item form sits exactly like Home Assistant's own expandable ones. */
    ha-expansion-panel {
      display: block;
      --expansion-panel-content-padding: 0;
      border-radius: var(--ha-border-radius-md);
      --ha-card-border-radius: var(--ha-border-radius-md);
    }
    .content {
      padding: 12px;
    }
    ha-icon[slot="leading-icon"] {
      color: var(--secondary-text-color);
    }
    .fallback {
      color: var(--secondary-text-color);
      margin: 0;
    }
  `;
}
```

- [ ] **Step 5: Register it**

In `src/index.ts`, extend the `./config` import with `VISIBILITY_SECTION_TAG`, import the class, and register it beside the others:

```ts
if (!customElements.get(VISIBILITY_SECTION_TAG)) {
  customElements.define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/tests/editor/visibility-section.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add src/editor/visibility-section.ts src/strings.ts src/index.ts src/tests/editor/visibility-section.test.ts
git commit -m "feat: the Visibility section of an item form

It hosts Home Assistant's whole visibility editor rather than the conditions
list alone, which brings the live verdict banner and the context the entity-less
condition sub-editors consume — neither of which we would want to rebuild.

Both that editor and the list underneath it are inlined in exactly one chunk of
the shipped frontend, the least available components this project has leaned on.
The bet is sound, since the edit dialog our form lives inside is what loads that
chunk, but an undefined custom element renders nothing at all, silently — so the
fallback is the difference between an explanation and an empty section.

The config object is cached against the list. hass is reassigned on every state
change, so the section re-renders per tick, and a fresh object each time would
read as a change and push a new config into Home Assistant's editor per tick."
```

---

### Task 7: Wire the section into both forms

**Files:**
- Modify: `src/editor/items.ts` (add `setVisibility`), `src/editor/badge-form.ts` (property + render), `src/editor/element-form.ts` (property + render), `src/editor/picture-studio-editor.ts` (pass down, handle up)
- Test: `src/tests/editor/items.test.ts`

**Interfaces:**
- Consumes: `PictureStudioVisibilitySection`'s `visibility-changed` event; `VISIBILITY_SECTION_TAG`.
- Produces: `setVisibility(items: PictureItem[], index: number, visibility: VisibilityCondition[] | undefined): PictureItem[]` from `src/editor/items.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/editor/items.test.ts`:

```ts
describe("setVisibility", () => {
  const items = [
    { type: "badge" as const, position: { top: 10, left: 10 }, anchor: "auto" as const, config: {} },
    { type: "badge" as const, position: { top: 20, left: 20 }, anchor: "auto" as const, config: {} },
  ];

  it("sets a list on the addressed item only", () => {
    const conditions = [{ condition: "state" }];
    const out = setVisibility(items, 1, conditions);
    expect(out[1]?.visibility).toEqual(conditions);
    expect(out[0]?.visibility).toBeUndefined();
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/editor/items.test.ts`
Expected: FAIL — `setVisibility is not a function`.

- [ ] **Step 3: Implement `setVisibility`**

In `src/editor/items.ts`, after `setAnchor`:

```ts
/**
 * Set or clear an item's conditions. An empty list is cleared rather than
 * stored: Home Assistant's own visibility editor deletes the key when its list
 * falls back to zero, and a `visibility: []` in YAML says nothing while looking
 * like it says something.
 */
export const setVisibility = (
  items: PictureItem[],
  index: number,
  visibility: VisibilityCondition[] | undefined,
): PictureItem[] => {
  if (index < 0 || index >= items.length) return items;
  return items.map((item, i) => {
    if (i !== index) return item;
    const { visibility: _dropped, ...rest } = item;
    return (visibility?.length ? { ...rest, visibility } : rest) as PictureItem;
  });
};
```

Extend the `../types` import with `VisibilityCondition`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/tests/editor/items.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount the section in the badge form**

In `src/editor/badge-form.ts`, add to the `static properties` block and the declarations:

```ts
    visibility: { attribute: false },
```

```ts
  declare visibility?: VisibilityCondition[];
```

Import `VisibilityCondition` from `../types` and add `import "./visibility-section";` beside the other side-effect imports if the file has any; otherwise import the class and rely on `src/index.ts` for the registration, as the anchor picker does.

In `render()`, after the closing `</ha-expansion-panel>` of the Position section:

```ts
      <picture-studio-visibility-section
        .hass=${this.hass}
        .visibility=${this.visibility}
      ></picture-studio-visibility-section>
```

Add to the styles block:

```css
    picture-studio-visibility-section {
      display: block;
      margin-top: var(--ha-space-3, 12px);
    }
```

The event is not handled here: it bubbles and is composed, exactly like the anchor picker's, and the hub listens for it on the form element.

- [ ] **Step 6: Mount the section in the element form**

Apply the same three changes to `src/editor/element-form.ts`: the `visibility` property, the tag after the "Size and position" panel's closing tag, and the same style rule. Keep the wording and the spacing identical to the badge form — the two forms read alike by construction, and that is deliberate.

- [ ] **Step 7: Pass it down and handle it up**

In `src/editor/picture-studio-editor.ts`:

- extend the `./items` import with `setVisibility`, and the `../types` import with `VisibilityCondition`;
- add the handler next to `_anchorChanged`:

```ts
  private _visibilityChanged = (
    ev: CustomEvent<{ visibility?: VisibilityCondition[] }>,
  ): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: setVisibility(config.items, this._editingIndex, ev.detail.visibility),
    });
  };
```

- add `.visibility=${editing.visibility}` and `@visibility-changed=${this._visibilityChanged}` to **both** form tags in `render()`.

- [ ] **Step 8: Full suite, typecheck, lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 9: Build, to be sure the bundle still builds as one file**

Run: `pnpm build`
Expected: success. Note the reported size; the spec's baseline is 101.8 kB / 25.2 kB gzip at 1.2.0.

- [ ] **Step 10: Commit**

```bash
git add src/editor/items.ts src/editor/badge-form.ts src/editor/element-form.ts src/editor/picture-studio-editor.ts src/tests/editor/items.test.ts
git commit -m "feat: the Visibility section in both item forms

The section is mounted by both forms and its event bubbles to the hub, which is
how the anchor picker already works — the hub stays the single exit toward Home
Assistant, so the drag, the dialogs and the forms all converge on one commit.

setVisibility clears the key instead of storing an empty list, matching what
Home Assistant's own editor does when its list falls back to zero."
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Document the key in the README**

In the Configuration section, where item keys are described, add `visibility` beside `position` and `anchor`, with a short YAML example, and one sentence stating that the *card's* own visibility is native to Home Assistant and needs nothing from this card — a reader who has just met the item-level key will ask.

- [ ] **Step 2: Add the CHANGELOG entry**

Under a heading that reads `## unreleased` — not a version number; the bump lands with the release, and `package.json` stays on 1.2.0 — add an `Added` entry, written for someone configuring the card rather than for someone reading the diff:

```markdown
### Added

- **Per-item visibility.** Every item now takes a `visibility` list — Home
  Assistant's own conditions, the same ones a card or a badge takes: entity
  state, numeric state, screen size, time, user, zone, and `and` / `or` / `not`.
  An item whose conditions are not met is not drawn. The editor shows a
  "Visibility" section on each item, with Home Assistant's own condition editor
  and its live "current visibility" banner inside it, and items carrying
  conditions are marked in the preview.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: per-item visibility"
```

---

## Browser verification

**Not optional, and not a step inside a task** — it is the gate before the branch is proposed for merge. happy-dom performs no layout and applies no CSS, so the sibling rule, the `!important`, the real hiding, the pill's placement and the stacking are all invisible to the suite. Trap #3 of the project memory counts six real defects that survived a fully green suite, a per-task review and a whole-branch review in 1.2.0 — every one found in the browser within minutes.

Run `pnpm build`, bump the dashboard resource's `?v=`, and walk:

- [ ] An item with a state condition on a real dashboard: hidden when the condition fails, drawn when it holds. Toggle the entity and watch it flip without a reload.
- [ ] The same dashboard in edit mode: the hidden item must reappear (`preview` short-circuits the evaluation).
- [ ] The card's edit dialog: every item visible, whatever its conditions, and the marker present on the conditional ones with the right count.
- [ ] The marker's corner near each edge of the picture, including an item pinned to the top and one pushed past the right edge — nothing clipped.
- [ ] The marker against the halo and the ring: hover and select a conditional item, and confirm neither encloses the pill.
- [ ] Drag a conditional item across the picture: the clamp must behave exactly as before, and the marker flips corner on release.
- [ ] A `screen` condition, resized across its breakpoint: this is the listener path, not the `hass` path, and it is the one nothing else covers.
- [ ] The Visibility section itself: the banner's three states, the count in the header following the list, and an emptied list removing the key from the YAML tab.
- [ ] A conditional item in a **sections** view and in a **masonry** view, to confirm the probe behaves in both.

Record the outcome in a `## Verification record` section appended to the spec, as `2026-08-13-state-icon-element-design.md` does.

## Self-review notes

- **Spec coverage.** §1 modèle → Task 1. §2 formulaire → Tasks 6 and 7. §3 runtime → Tasks 3 and 4. §4 marque → Tasks 2 and 5. §5 exception `z-index` → Task 5. §Strings → Task 6. §Testing → the test steps of Tasks 1-7. §Browser verification → the section above. §Documentation and versioning → Task 8, plus the two memory amendments, which belong to the session's close and not to a code task.
- **The one deviation** is `markerCorner`'s signature, flagged at the top of this plan and to be confirmed before Task 2 lands.
- **Names used across tasks**, all defined before first use: `VisibilityCondition` (Task 1), `hasVisibility` (Task 1), `PROBE_TYPE` / `PROBE_TAG` (Task 3), `VISIBILITY_SECTION_TAG` (Task 3), `markerCorner` / `MarkerCorner` (Task 2), `setVisibility` (Task 7).
