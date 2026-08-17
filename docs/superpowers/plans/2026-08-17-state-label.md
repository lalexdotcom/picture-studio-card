# state-label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second element kind, `state-label`, rendering an entity's text on the picture, and turn the icon's halo into an opt-in inside a renamed "Appearance" section.

**Architecture:** The two element kinds share the card's placement, the size mechanism and the halo recipe, but each owns its own chrome record and its own editor schema. Nothing about `state-icon`'s published config shape changes; the only behaviour change is the halo becoming opt-in. The label's text is rendered by Home Assistant's own `state-display`, with a `formatEntityState` fallback.

**Tech Stack:** TypeScript, Lit (bundled), rslib single-file build, rstest + happy-dom, biome.

**Spec:** `docs/superpowers/specs/2026-08-17-state-label-design.md`

## Global Constraints

- **Serena's symbolic tools are primary for code.** `get_symbols_overview` / `find_symbol` to read, `replace_symbol_body` / `insert_*_symbol` / `replace_content` / `rename_symbol` to edit. Built-in Read/Edit/Grep only for `.md`, JSON, YAML, or when Serena fails.
- **Chat in French, everything else in English** — code, comments, commit messages, docs.
- **Run `pnpm lint` (biome) after every modification**, and `pnpm typecheck` before each commit.
- **Never `git push`.** The user pushes; a push to `main` publishes a release.
- **HACS floor is `2026.6.0`**, frontend build 20260527.4. Any HA component used must exist there, and a custom element must still be guarded with `customElements.get` — the floor answers "does this version have it", never "is its chunk loaded here".
- **Never drop an unreadable or unknown key** from an item's `config`: `storedConfig` rewrites the whole config on every editor commit, so a drop becomes permanent on the first drag. `size` and `chrome` are closed records — an unknown key *inside* either is dropped.
- **The editor rounds, the model does not clamp.** Every numeric form field is `Math.round`ed on both directions; `normalize*` keeps any finite number exactly as written.
- **Tests assert literals, never restate a constant.** Two tests that check different sets are a hole — shared `KEYS` lists stay shared.
- **No `z-index` in rendered stacking**, no dynamic import, no decorators.
- Existing public CSS tokens `--psc-icon-size`, `--psc-icon-outline`, `--psc-icon-glow` are **not renamed**.

## File Structure

**Created**

| file | responsibility |
|---|---|
| `src/halo.ts` | the halo recipe: one pure function producing the `drop-shadow` pair from a token name |
| `src/card/item-styles.ts` | the CSS both element kinds share: the chrome's fill (its theme and its opacity) and the halo, each written once |
| `src/card/state-label-element.ts` | the `state-label` custom element: chrome wrapper, name + `state-display`, actions |
| `src/editor/state-icon-form.ts` | `state-icon`'s schemas and its `toFormData` / `fromFormData` (moved out of `element-form.ts`) |
| `src/editor/state-label-form.ts` | `state-label`'s schemas and its `toFormData` / `fromFormData` |
| `src/tests/halo.test.ts`, `src/tests/card/state-label-element.test.ts`, `src/tests/editor/state-label-form.test.ts` | their tests |

**Modified**

| file | change |
|---|---|
| `src/chrome.ts` | rename the existing record to `IconChrome`, add `LabelChrome` beside it |
| `src/element-size.ts` | rename to element vocabulary, take defaults as a parameter, add `DEFAULT_LABEL_SIZE` |
| `src/config.ts` | `StateLabelConfig`, `LABEL_TAG`, `halo`, widened `normalizeElementConfig` and `storedConfig` |
| `src/card/state-icon-element.ts` | halo behind `:host([halo])`, halo recipe from `src/halo.ts` |
| `src/card/picture-studio-card.ts` | `_createChild` picks the tag from `config.type` |
| `src/editor/element-catalog.ts` | `state-label` in `ELEMENT_KINDS` and in `stubElementConfig` |
| `src/editor/element-form.ts` | host only: picks the per-kind form module, renders Appearance after Size and position, shows the kind label in the header |
| `src/editor/badge-list.ts` | elements before badges in the add menu |
| `src/editor/badge-form.ts` | kind label in the header |
| `src/strings.ts` | `chrome` removed; `halo_enabled`, `halo_enabled_helper`, `chrome_pill`, `chrome_padding` added |
| `src/index.ts` | register `LABEL_TAG` |
| `README.md`, `CHANGELOG.md` | document the kind and the halo change |

---

### Task 1: `LabelChrome` beside `IconChrome`

**Files:**
- Modify: `src/chrome.ts`
- Test: `src/tests/chrome.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type IconChrome = { theme: ChromeTheme; radius: number; opacity: number; content_ratio: number }` (the current `Chrome`, renamed)
  - `DEFAULT_ICON_CHROME: IconChrome`, `normalizeIconChrome(raw: unknown): IconChrome`, `isDefaultIconChrome(c: IconChrome): boolean`
  - `type LabelChrome = { theme: ChromeTheme; radius: number; pill: boolean; opacity: number; padding: number }`
  - `DEFAULT_LABEL_CHROME: LabelChrome`, `normalizeLabelChrome(raw: unknown): LabelChrome`, `isDefaultLabelChrome(c: LabelChrome): boolean`
  - unchanged and shared: `ChromeTheme`, `THEMES`, `chromeFill`, `finiteOrDefault`

- [ ] **Step 1: Rename the existing record with Serena**

Use `rename_symbol` (reference-aware, updates every usage and test) for each:
`Chrome` → `IconChrome`, `DEFAULT_CHROME` → `DEFAULT_ICON_CHROME`, `normalizeChrome` → `normalizeIconChrome`, `isDefaultChrome` → `isDefaultIconChrome`.

Do not re-read the files afterwards to confirm — when the tool returns success the refactor is complete across declarations, references and imports.

- [ ] **Step 2: Run the suite to prove the rename changed nothing**

Run: `pnpm test`
Expected: PASS, same count as before (329).

- [ ] **Step 3: Commit the rename alone**

```bash
git add -A && git commit -m "refactor(chrome): the icon's chrome says so in its name"
```

- [ ] **Step 4: Write the failing tests for `LabelChrome`**

Append to `src/tests/chrome.test.ts`:

```ts
describe("DEFAULT_LABEL_CHROME", () => {
  // The one test allowed to name the constant: it is what it guards.
  it("draws nothing, square-cornered, opaque, with a 6px gutter", () => {
    expect(DEFAULT_LABEL_CHROME).toEqual({
      theme: "none",
      radius: 0,
      pill: false,
      opacity: 1,
      padding: 6,
    });
  });
});

describe("normalizeLabelChrome", () => {
  it("returns the defaults for anything that is not an object", () => {
    expect(normalizeLabelChrome(undefined)).toEqual(DEFAULT_LABEL_CHROME);
    expect(normalizeLabelChrome("pill")).toEqual(DEFAULT_LABEL_CHROME);
    expect(normalizeLabelChrome(null)).toEqual(DEFAULT_LABEL_CHROME);
  });

  it("keeps any finite number exactly as written — the model never clamps", () => {
    const chrome = normalizeLabelChrome({ radius: 12.5, padding: 40, opacity: 1.4 });
    expect(chrome.radius).toBe(12.5);
    expect(chrome.padding).toBe(40);
    expect(chrome.opacity).toBe(1.4);
  });

  it("falls back to the default for a non-finite or missing number", () => {
    const chrome = normalizeLabelChrome({ radius: "8", padding: Number.NaN });
    expect(chrome.radius).toBe(0);
    expect(chrome.padding).toBe(6);
  });

  it("accepts the four themes and rejects anything else", () => {
    expect(normalizeLabelChrome({ theme: "dark" }).theme).toBe("dark");
    expect(normalizeLabelChrome({ theme: "glass" }).theme).toBe("none");
  });

  it("reads `pill` as a strict boolean and drops unknown keys", () => {
    expect(normalizeLabelChrome({ pill: true }).pill).toBe(true);
    expect(normalizeLabelChrome({ pill: "yes" }).pill).toBe(false);
    expect(normalizeLabelChrome({ blur: 3 })).toEqual(DEFAULT_LABEL_CHROME);
  });
});

describe("isDefaultLabelChrome", () => {
  it("is true only when every field is the default", () => {
    expect(isDefaultLabelChrome(DEFAULT_LABEL_CHROME)).toBe(true);
    expect(isDefaultLabelChrome({ ...DEFAULT_LABEL_CHROME, pill: true })).toBe(false);
    expect(isDefaultLabelChrome({ ...DEFAULT_LABEL_CHROME, padding: 7 })).toBe(false);
  });
});
```

Add `DEFAULT_LABEL_CHROME`, `normalizeLabelChrome`, `isDefaultLabelChrome` to the import block at the top of the file.

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm test src/tests/chrome.test.ts`
Expected: FAIL — `DEFAULT_LABEL_CHROME is not defined`.

- [ ] **Step 6: Implement, with `insert_after_symbol` on `isDefaultIconChrome`**

```ts
/**
 * A label's surface. It diverges from the icon's on purpose: `radius` is a
 * length here, because a percentage of a box whose width belongs to the text
 * gives a squashed ellipse rather than a rounded end; and there is no
 * content_ratio, because shrinking a label's content means shrinking the very
 * body size that `size` already sets.
 */
export interface LabelChrome {
  /** "none" draws nothing at all; the other three name what the fill is made of. */
  theme: ChromeTheme;
  /** border-radius in px, ignored when `pill` is on. */
  radius: number;
  /** a fully rounded end, whatever the box measures. */
  pill: boolean;
  /** the fill's opacity, 0-1. The text is never faded, only the surface. */
  opacity: number;
  /** the gutter between the text and the surface's edge, px. */
  padding: number;
}

export const DEFAULT_LABEL_CHROME: LabelChrome = {
  theme: "none",
  radius: 0,
  pill: false,
  opacity: 1,
  padding: 6,
};

export const normalizeLabelChrome = (raw: unknown): LabelChrome => {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_LABEL_CHROME };
  const chrome = raw as Partial<Record<string, unknown>>;
  const theme = chrome.theme as ChromeTheme;
  return {
    theme: THEMES.includes(theme) ? theme : DEFAULT_LABEL_CHROME.theme,
    radius: finiteOrDefault(chrome.radius, DEFAULT_LABEL_CHROME.radius),
    pill: chrome.pill === true,
    opacity: finiteOrDefault(chrome.opacity, DEFAULT_LABEL_CHROME.opacity),
    padding: finiteOrDefault(chrome.padding, DEFAULT_LABEL_CHROME.padding),
  };
};

export const isDefaultLabelChrome = (chrome: LabelChrome): boolean =>
  chrome.theme === DEFAULT_LABEL_CHROME.theme &&
  chrome.radius === DEFAULT_LABEL_CHROME.radius &&
  chrome.pill === DEFAULT_LABEL_CHROME.pill &&
  chrome.opacity === DEFAULT_LABEL_CHROME.opacity &&
  chrome.padding === DEFAULT_LABEL_CHROME.padding;
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm test src/tests/chrome.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/chrome.ts src/tests/chrome.test.ts
git commit -m "feat(chrome): a surface for text, where a radius is a length"
```

---

### Task 2: size defaults become a parameter

**Files:**
- Modify: `src/element-size.ts`
- Test: `src/tests/element-size.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ElementSize` (the current `IconSize`, renamed) with the same five fields
  - `DEFAULT_ICON_SIZE: ElementSize` — unchanged values `{ mode: "auto", ratio: 8, min: 24, max: 48, value: 48 }`
  - `DEFAULT_LABEL_SIZE: ElementSize` — `{ mode: "auto", ratio: 4, min: 11, max: 20, value: 14 }`
  - `normalizeElementSize(raw: unknown, defaults: ElementSize): ElementSize`
  - `isDefaultElementSize(size: ElementSize, defaults: ElementSize): boolean`
  - `elementSizeCss(size: ElementSize, defaults: ElementSize): string`

**Note for the implementer:** the label's `auto` numbers are provisional — the browser walk (Task 10) settles them. The mechanism does not depend on their values.

- [ ] **Step 1: Rename with Serena**

`rename_symbol`: `IconSize` → `ElementSize`, `normalizeIconSize` → `normalizeElementSize`, `isDefaultIconSize` → `isDefaultElementSize`, `iconSizeCss` → `elementSizeCss`. `DEFAULT_ICON_SIZE` keeps its name — it is the icon's default, not the module's.

- [ ] **Step 2: Run the suite**

Run: `pnpm test`
Expected: PASS, unchanged count.

- [ ] **Step 3: Write the failing tests for the parameterised defaults**

In `src/tests/element-size.test.ts`, add:

```ts
describe("DEFAULT_LABEL_SIZE", () => {
  // The one test allowed to name the constant: it is what it guards.
  it("is a text body, roughly half an icon's ratio", () => {
    expect(DEFAULT_LABEL_SIZE).toEqual({
      mode: "auto",
      ratio: 4,
      min: 11,
      max: 20,
      value: 14,
    });
  });
});

describe("elementSizeCss with explicit defaults", () => {
  it("uses the given defaults in auto mode, not the icon's", () => {
    const size = { mode: "auto" as const, ratio: 99, min: 99, max: 99, value: 99 };
    expect(elementSizeCss(size, DEFAULT_LABEL_SIZE)).toBe("clamp(11px, 4cqw, 20px)");
    expect(elementSizeCss(size, DEFAULT_ICON_SIZE)).toBe("clamp(24px, 8cqw, 48px)");
  });

  it("ignores the defaults in adaptive and fixed modes", () => {
    expect(
      elementSizeCss({ mode: "adaptive", ratio: 5, min: 12, max: 30, value: 40 }, DEFAULT_LABEL_SIZE),
    ).toBe("clamp(12px, 5cqw, 30px)");
    expect(
      elementSizeCss({ mode: "fixed", ratio: 5, min: 12, max: 30, value: 40 }, DEFAULT_LABEL_SIZE),
    ).toBe("40px");
  });
});

describe("normalizeElementSize with explicit defaults", () => {
  it("fills missing numbers from the defaults it is given", () => {
    expect(normalizeElementSize({}, DEFAULT_LABEL_SIZE)).toEqual(DEFAULT_LABEL_SIZE);
    expect(normalizeElementSize({}, DEFAULT_ICON_SIZE)).toEqual(DEFAULT_ICON_SIZE);
  });

  it("still reads the pre-1.2 { auto: boolean } shape", () => {
    expect(normalizeElementSize({ auto: false }, DEFAULT_LABEL_SIZE).mode).toBe("adaptive");
    expect(normalizeElementSize({ auto: true }, DEFAULT_LABEL_SIZE).mode).toBe("auto");
  });
});

describe("isDefaultElementSize with explicit defaults", () => {
  it("compares against the defaults it is given", () => {
    expect(isDefaultElementSize(DEFAULT_LABEL_SIZE, DEFAULT_LABEL_SIZE)).toBe(true);
    expect(isDefaultElementSize(DEFAULT_LABEL_SIZE, DEFAULT_ICON_SIZE)).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm test src/tests/element-size.test.ts`
Expected: FAIL — `DEFAULT_LABEL_SIZE is not defined`, and arity errors on the three functions.

- [ ] **Step 5: Implement**

Add the constant after `DEFAULT_ICON_SIZE`:

```ts
/**
 * A label's own defaults. Half the icon's ratio, so a label reads at roughly
 * half an icon's height standing beside it, with a floor that stays legible and
 * a ceiling that stops a wide card from turning a label into a headline.
 */
export const DEFAULT_LABEL_SIZE: ElementSize = {
  mode: "auto",
  ratio: 4,
  min: 11,
  max: 20,
  value: 14,
};
```

Then give the three functions a `defaults` parameter, replacing every reference to the module constant with it:

```ts
export const normalizeElementSize = (raw: unknown, defaults: ElementSize): ElementSize => {
  if (typeof raw !== "object" || raw === null) return { ...defaults };
  // … body unchanged, except every DEFAULT_ICON_SIZE.x becomes defaults.x …
};

export const isDefaultElementSize = (size: ElementSize, defaults: ElementSize): boolean =>
  size.mode === defaults.mode &&
  size.min === defaults.min &&
  size.ratio === defaults.ratio &&
  size.max === defaults.max &&
  size.value === defaults.value;

export const elementSizeCss = (size: ElementSize, defaults: ElementSize): string => {
  if (size.mode === "fixed") return `${size.value}px`;
  if (size.mode === "auto") {
    const { min, ratio, max } = defaults;
    return `clamp(${min}px, ${ratio}cqw, ${max}px)`;
  }
  // adaptive
  return `clamp(${size.min}px, ${size.ratio}cqw, ${size.max}px)`;
};
```

Then fix every call site the compiler flags — they all pass `DEFAULT_ICON_SIZE` at this stage.

- [ ] **Step 6: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(size): the same three modes, defaults that belong to the kind"
```

---

### Task 3: the halo becomes opt-in

**Files:**
- Create: `src/halo.ts`, `src/card/item-styles.ts`, `src/tests/halo.test.ts`
- Modify: `src/config.ts`, `src/card/state-icon-element.ts`, `src/tests/card/harness.ts`
- Test: `src/tests/config.test.ts`, `src/tests/card/state-icon-element.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `haloFilter(sizeVar: string): string` from `src/halo.ts`
  - from `src/card/item-styles.ts`: `chromeFillStyles: CSSResult` (the surface — its theme fill and its opacity) and `haloStyles(sizeVar: string): CSSResult`
  - `StateIconConfig.halo?: boolean`, normalised to a strict boolean by `normalizeElementConfig`, written by `storedConfig` only when `true`
  - `cssRules` in the test harness accepting an array of `CSSResult` as well as a single one

- [ ] **Step 1: Write the failing test for the recipe**

Create `src/tests/halo.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { haloFilter } from "../halo";

describe("haloFilter", () => {
  // Literals, not a restatement of the constants: this test is what guards the
  // recipe. The rim is a fixed hairline at every size; the glow is a share of
  // the element's own size value, so it follows an icon's box and a label's
  // body alike.
  it("pairs a fixed white rim with a glow proportional to the given token", () => {
    expect(haloFilter("--psc-icon-size")).toBe(
      "drop-shadow(var(--psc-icon-outline, 0 0 1px rgba(255, 255, 255, 0.4))) " +
        "drop-shadow(var(--psc-icon-glow, 0 0 calc(var(--psc-icon-size) * 0.06) rgba(0, 0, 0, 0.2)))",
    );
  });

  it("derives the override token names from the size token", () => {
    expect(haloFilter("--psc-label-size")).toContain("var(--psc-label-outline,");
    expect(haloFilter("--psc-label-size")).toContain("var(--psc-label-glow,");
    expect(haloFilter("--psc-label-size")).toContain("calc(var(--psc-label-size) * 0.06)");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/tests/halo.test.ts`
Expected: FAIL — cannot resolve `../halo`.

- [ ] **Step 3: Implement `src/halo.ts`**

```ts
/**
 * The halo: a hairline rim and a soft glow, drawn by `filter` so it traces the
 * rendered silhouette — the glyph when there is no chrome, the surface when
 * there is one.
 *
 * The icon stands on the user's picture, not on the theme's background, so its
 * contrast has to hold against an unknown image, which no theme token can
 * promise. Hence literal white and black here, and only here.
 *
 * The blur is a share of the element's own size value rather than a length: a
 * fixed 3px was 12.5% of a 24px icon and 7.5% of a 40px one, which is why a
 * small icon wore the halo as a band. 6% comes to 1.4px at 24px and 2.9px at
 * 48px, and calc() resolves the token whatever it holds — including a clamp()ed
 * value that changes with the card's width. The white rim is part of none of
 * this: a hairline stays a hairline at every size.
 *
 * Both halves are exposed as variables so a dashboard can dial them without
 * forking the element.
 *
 * @param sizeVar the element's size custom property, e.g. "--psc-icon-size".
 *                The override tokens are derived from it by replacing the
 *                "-size" suffix, so each kind keeps its own public names.
 */
export const haloFilter = (sizeVar: string): string => {
  const base = sizeVar.replace(/-size$/, "");
  return (
    `drop-shadow(var(${base}-outline, 0 0 1px rgba(255, 255, 255, 0.4))) ` +
    `drop-shadow(var(${base}-glow, 0 0 calc(var(${sizeVar}) * 0.06) rgba(0, 0, 0, 0.2)))`
  );
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/tests/halo.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `halo` in the model**

In `src/tests/config.test.ts`:

```ts
it("normalises `halo` to a strict boolean, absent meaning off", () => {
  const config = normalizeConfig({
    type: "custom:picture-studio",
    image: "/local/a.png",
    items: [{ type: "element", position: { top: "1%", left: "1%" }, config: { type: "state-icon" } }],
  });
  expect((config.items[0].config as StateIconConfig).halo).toBe(false);
});

it("reads `halo: true` and rejects a truthy non-boolean", () => {
  const on = normalizeElementConfig({ type: "state-icon", halo: true }, 0) as StateIconConfig;
  const off = normalizeElementConfig({ type: "state-icon", halo: "yes" }, 0) as StateIconConfig;
  expect(on.halo).toBe(true);
  expect(off.halo).toBe(false);
});

it("stores `halo` only when it is on", () => {
  const withHalo = storedConfig(
    normalizeConfig({
      type: "custom:picture-studio",
      image: "/local/a.png",
      items: [
        { type: "element", position: { top: "1%", left: "1%" }, config: { type: "state-icon", halo: true } },
        { type: "element", position: { top: "2%", left: "2%" }, config: { type: "state-icon" } },
      ],
    }),
  );
  const items = withHalo.items as { config: Record<string, unknown> }[];
  expect(items[0].config.halo).toBe(true);
  expect("halo" in items[1].config).toBe(false);
});
```

In `src/tests/card/state-icon-element.test.ts`:

```ts
it("wears the halo attribute only when the config asks for it", async () => {
  expect((await mount({ entity: "light.a" })).hasAttribute("halo")).toBe(false);
  expect((await mount({ entity: "light.a", halo: true })).hasAttribute("halo")).toBe(true);
});

it("draws the halo behind :host([halo]) and nowhere else", () => {
  const rules = cssRules(PictureStudioStateIcon);
  const unconditional = rules.find((r) => r.selector === ".chrome");
  expect(unconditional?.text).not.toContain("drop-shadow");
  const gated = rules.find((r) => r.selector === ":host([halo]) .chrome");
  expect(gated?.text).toContain("drop-shadow");
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm test src/tests/config.test.ts src/tests/card/state-icon-element.test.ts`
Expected: FAIL — `halo` is `undefined`, and the `.chrome` rule still contains `drop-shadow`.

- [ ] **Step 7: Add `halo` to the model**

In `src/config.ts`, add to `StateIconConfig`:

```ts
  /** Optional: absent means no halo. Opt-in since 1.4.0. */
  halo?: boolean;
```

In `normalizeElementConfig`, add to the returned object:

```ts
    halo: raw.halo === true,
```

In `storedConfig`, inside the `item.type === "element"` branch, replace the destructuring line and add the halo rule:

```ts
      const { size, chrome, halo, ...rest } = item.config;
      const config: Record<string, unknown> = { ...rest };
      if (!isDefaultElementSize(size, DEFAULT_ICON_SIZE)) config.size = size;
      if (chrome && !isDefaultIconChrome(chrome)) config.chrome = chrome;
      // The default is the absence of the key, as with the anchor: a config
      // that never asked for a halo does not grow the key.
      if (halo) config.halo = true;
      stored.config = config;
```

- [ ] **Step 8: Create the shared CSS module**

The surface's fill and its opacity, and the halo, must be written **once** and
consumed by both element kinds — an icon's chrome and a label's are different
records but the same surface, and two copies of these rules would drift.

Create `src/card/item-styles.ts`:

```ts
import { css, type CSSResult, unsafeCSS } from "lit";
import { haloFilter } from "../halo";

/**
 * The chrome's surface: what it is made of, and how much of the picture shows
 * through it. Shared by every element kind, because the theme and the opacity
 * mean the same thing whatever the item is — only the shape around them (a
 * disc, a pill, a padding) belongs to the kind.
 *
 * The fill sits on a pseudo-element so its opacity is its own: fading the
 * surface must not fade what stands on it. `border-radius: inherit` is what
 * lets each kind decide the shape without this rule knowing it.
 */
export const chromeFillStyles: CSSResult = css`
  :host([chrome]) .chrome::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--psc-chrome-fill);
    opacity: var(--psc-chrome-opacity, 1);
  }
`;

/**
 * The halo, bound to the kind's own size token — an icon scales it on its box,
 * a label on its body, and the recipe itself lives in one place either way.
 *
 * Opt-in since 1.4.0: unconditional until then. The shape and the clipping are
 * NOT here — they belong to the chrome, and conflating the two is what once
 * clipped every chromeless icon into a circle.
 */
export const haloStyles = (sizeVar: string): CSSResult => css`
  :host([halo]) .chrome {
    filter: ${unsafeCSS(haloFilter(sizeVar))};
  }
`;
```

- [ ] **Step 9: Move the halo behind the attribute in the icon**

In `src/card/state-icon-element.ts`:

1. Import the shared blocks: `import { chromeFillStyles, haloStyles } from "./item-styles";`
2. In `static styles`, delete the `filter: drop-shadow(…) drop-shadow(…)` declaration and its long comment from the `.chrome` rule (keep everything else in that rule untouched), and delete the whole `:host([chrome]) .chrome::before` rule — both now live in the shared module. **Move the explanatory comments with them rather than dropping them**: the paragraph about literal white and black, and about the blur being a share of the size, belongs in `src/halo.ts` where the recipe is; the paragraph about the pseudo-element owning its opacity belongs beside `chromeFillStyles`.
3. Turn `static styles` into an array so the shared blocks come first and the kind's own rules can still override:

```ts
  static styles = [
    chromeFillStyles,
    haloStyles("--psc-icon-size"),
    css`
      /* …everything the icon keeps: :host, clickable, hover, .chrome's box,
         :host([chrome]) .chrome's radius and overflow, state-badge's rules… */
    `,
  ];
```

4. In `updated()`, after the `chrome` block:

```ts
    this.toggleAttribute("halo", config.halo === true);
```

- [ ] **Step 10: Widen the test harness to read an array of styles**

`cssRules` in `src/tests/card/harness.ts` reads `.cssText` off a single
`CSSResult`. Given an array it would find `undefined` and return an empty map —
so every CSS assertion would pass by finding nothing, which is worse than
failing. Accept both shapes:

```ts
export const cssRules = (styles: unknown): Map<string, string> => {
  const sheets = Array.isArray(styles) ? styles : [styles];
  const text = sheets
    .map((sheet) => (sheet as { cssText?: string }).cssText ?? "")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // …the rest of the function unchanged…
};
```

Its existing callers pass `PictureStudioStateIcon.styles` and
`PictureStudioCard.styles`; both keep working.

- [ ] **Step 11: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS. The CSS assertions in `src/tests/card/state-icon-element.test.ts`
must still find their rules — if `cssRules` returns an empty map, Step 10 is
wrong and the tests are passing on nothing.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(halo): a rim you ask for, on the size and not the box"
```

---

### Task 4: `state-label` in the model

**Files:**
- Modify: `src/config.ts`, `src/editor/element-catalog.ts`, `src/card/picture-studio-card.ts`
- Test: `src/tests/config.test.ts`, `src/tests/editor/element-catalog.test.ts`

**Interfaces:**
- Consumes: `LabelChrome`, `DEFAULT_LABEL_CHROME`, `normalizeLabelChrome`, `isDefaultLabelChrome` (Task 1); `DEFAULT_LABEL_SIZE`, `normalizeElementSize`, `isDefaultElementSize` (Task 2); `halo` (Task 3).
- Produces:
  - `LABEL_TAG = "picture-studio-state-label"`
  - `interface StateLabelConfig` with `type: "state-label"`, `entity?`, `name?`, `color?`, `show_name?`, `show_state?`, `state_content?: string | string[]`, `time_format?: string`, the three actions, `size: ElementSize`, `halo?: boolean`, `chrome?: LabelChrome`
  - `type ElementConfig = StateIconConfig | StateLabelConfig`
  - `ELEMENT_KINDS = ["state-icon", "state-label"] as const`
  - `stubElementConfig("state-label")` returning `{ type: "state-label", show_state: true, size: { ...DEFAULT_LABEL_SIZE } }`

- [ ] **Step 1: Write the failing tests**

In `src/tests/config.test.ts`:

```ts
describe("state-label config", () => {
  const label = (raw: Record<string, unknown>) =>
    normalizeElementConfig({ type: "state-label", ...raw }, 0) as StateLabelConfig;

  it("defaults size and chrome to the label's own records", () => {
    const config = label({});
    expect(config.size).toEqual(DEFAULT_LABEL_SIZE);
    expect(config.chrome).toEqual(DEFAULT_LABEL_CHROME);
    expect(config.halo).toBe(false);
  });

  it("keeps unknown keys, because storedConfig rewrites the whole config", () => {
    expect(label({ prefix: "~" }).prefix).toBe("~");
  });

  it("drops an unknown key inside its closed records", () => {
    expect(label({ chrome: { blur: 3 } }).chrome).toEqual(DEFAULT_LABEL_CHROME);
  });

  it("still raises on an absent or unknown kind", () => {
    expect(() => normalizeElementConfig({}, 2)).toThrow(/items\[2\]/);
    expect(() => normalizeElementConfig({ type: "state-gauge" }, 0)).toThrow();
  });

  it("round-trips through storedConfig without growing default keys", () => {
    const stored = storedConfig(
      normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/a.png",
        items: [
          {
            type: "element",
            position: { top: "1%", left: "1%" },
            config: { type: "state-label", entity: "sensor.a", show_state: true },
          },
        ],
      }),
    );
    expect((stored.items as { config: unknown }[])[0].config).toEqual({
      type: "state-label",
      entity: "sensor.a",
      show_state: true,
    });
  });

  it("stores a non-default label chrome and size", () => {
    const stored = storedConfig(
      normalizeConfig({
        type: "custom:picture-studio",
        image: "/local/a.png",
        items: [
          {
            type: "element",
            position: { top: "1%", left: "1%" },
            config: { type: "state-label", chrome: { theme: "auto", pill: true }, size: { mode: "fixed", value: 18 } },
          },
        ],
      }),
    );
    const config = (stored.items as { config: Record<string, unknown> }[])[0].config;
    expect((config.chrome as LabelChrome).pill).toBe(true);
    expect((config.size as ElementSize).mode).toBe("fixed");
  });
});
```

In `src/tests/editor/element-catalog.test.ts`:

```ts
it("offers both kinds, the icon first", () => {
  expect(elementCatalog()).toEqual([{ type: "state-icon" }, { type: "state-label" }]);
});

it("stubs a label showing its state, at the label's own default size", () => {
  expect(stubElementConfig("state-label")).toEqual({
    type: "state-label",
    show_state: true,
    size: DEFAULT_LABEL_SIZE,
  });
});

it("still raises on an unknown kind", () => {
  expect(() => stubElementConfig("state-gauge")).toThrow();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/tests/config.test.ts src/tests/editor/element-catalog.test.ts`
Expected: FAIL — `normalizeElementConfig` throws on `state-label`.

- [ ] **Step 3: Add the type and the tag in `src/config.ts`**

```ts
export const LABEL_TAG = "picture-studio-state-label";

/**
 * An entity's text on the picture. The mirror image of the state-icon: it keeps
 * the half of Home Assistant's entity-badge form the icon left behind — the
 * name, the displayed parts and the composed state content — and renders it
 * through HA's own `state-display`.
 */
export interface StateLabelConfig {
  type: "state-label";
  /** Optional: a freshly added label has no entity until one is picked. */
  entity?: string;
  /** May hold the composed sentinels the entity_name selector stores. */
  name?: string;
  /** "none" or a theme colour. Never "state" — see the spec, decision 6. */
  color?: string;
  show_name?: boolean;
  show_state?: boolean;
  /** What `state-display` composes; a list joins its parts. */
  state_content?: string | string[];
  time_format?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  /** Drives font-size rather than a box. */
  size: ElementSize;
  /** Optional: absent means no halo. */
  halo?: boolean;
  /** Optional: absent means no chrome, which is also what DEFAULT_LABEL_CHROME says. */
  chrome?: LabelChrome;
}

export type ElementConfig = StateIconConfig | StateLabelConfig;
```

- [ ] **Step 4: Widen `normalizeElementConfig`**

```ts
export const normalizeElementConfig = (
  raw: Record<string, unknown>,
  index: number,
): ElementConfig => {
  // Unknown keys are kept, for the same reason an unreadable item raises instead
  // of vanishing: storedConfig rewrites the whole config on every editor commit,
  // so anything dropped here would be dropped from the user's YAML on the first
  // drag.
  if (raw.type === "state-icon") {
    return {
      ...raw,
      type: "state-icon",
      size: normalizeElementSize(raw.size, DEFAULT_ICON_SIZE),
      chrome: normalizeIconChrome(raw.chrome),
      halo: raw.halo === true,
    } as StateIconConfig;
  }
  if (raw.type === "state-label") {
    return {
      ...raw,
      type: "state-label",
      size: normalizeElementSize(raw.size, DEFAULT_LABEL_SIZE),
      chrome: normalizeLabelChrome(raw.chrome),
      halo: raw.halo === true,
    } as StateLabelConfig;
  }
  throw new Error(
    `picture-studio: items[${index}].config must have a \`type\` — "state-icon" or "state-label"`,
  );
};
```

- [ ] **Step 5: Widen `storedConfig`**

Replace the `item.type === "element"` branch's body with a kind-aware comparison:

```ts
    if (item.type === "element") {
      // Only when every field is a default: a mode may be off and still carry
      // numbers the user typed, and dropping the key would lose them. A config
      // that never touched either key does not grow one.
      const { size, chrome, halo, ...rest } = item.config;
      const config: Record<string, unknown> = { ...rest };
      const isLabel = item.config.type === "state-label";
      const sizeDefaults = isLabel ? DEFAULT_LABEL_SIZE : DEFAULT_ICON_SIZE;
      if (!isDefaultElementSize(size, sizeDefaults)) config.size = size;
      // The guard is what narrows the optional type, not a redundancy — two
      // reviewers have flagged it, and it is correct.
      if (chrome) {
        const isDefault = isLabel
          ? isDefaultLabelChrome(chrome as LabelChrome)
          : isDefaultIconChrome(chrome as IconChrome);
        if (!isDefault) config.chrome = chrome;
      }
      if (halo) config.halo = true;
      stored.config = config;
    }
```

- [ ] **Step 6: Widen the catalogue in `src/editor/element-catalog.ts`**

```ts
export const ELEMENT_KINDS = ["state-icon", "state-label"] as const;

export const stubElementConfig = (type: string): ElementConfig => {
  if (type === "state-icon") return { type: "state-icon", size: { ...DEFAULT_ICON_SIZE } };
  if (type === "state-label") {
    // A label with nothing shown is an invisible item: showing the state is the
    // only stub that renders something the moment it is dropped.
    return { type: "state-label", show_state: true, size: { ...DEFAULT_LABEL_SIZE } };
  }
  throw new Error(`picture-studio: unknown element type "${type}"`);
};
```

- [ ] **Step 7: Make the card pick the tag from the kind**

In `src/card/picture-studio-card.ts`, replace `_createChild`'s element branch:

```ts
  private _createChild(
    item: PictureItem,
    helpers: Awaited<ReturnType<typeof window.loadCardHelpers>>,
  ): LovelaceBadgeElement {
    if (item.type === "badge") return helpers.createBadgeElement(item.config);
    const tag = item.config.type === "state-label" ? LABEL_TAG : ICON_TAG;
    const el = document.createElement(tag) as unknown as LovelaceBadgeElement;
    el.setConfig(item.config as unknown as BadgeConfig);
    return el;
  }
```

Add `LABEL_TAG` to the import from `../config`.

- [ ] **Step 8: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(config): a second element kind, closed set untouched"
```

---

### Task 5: the `state-label` element

**Files:**
- Create: `src/card/state-label-element.ts`, `src/tests/card/state-label-element.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `StateLabelConfig`, `LABEL_TAG` (Task 4); `haloFilter` (Task 3); `elementSizeCss`, `DEFAULT_LABEL_SIZE` (Task 2); `chromeFill`, `LabelChrome` (Task 1).
- Produces: `class PictureStudioStateLabel`, registered on `LABEL_TAG`. Public CSS tokens `--psc-label-size`, `--psc-label-outline`, `--psc-label-glow`.

**Reference:** `src/card/state-icon-element.ts` is the model for the lifecycle, the action handling and the chrome wrapper. Reuse its shape; do not invent a second one.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/card/state-label-element.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { PictureStudioStateLabel } from "../../card/state-label-element";
import { LABEL_TAG, type StateLabelConfig } from "../../config";
import { DEFAULT_LABEL_SIZE } from "../../element-size";
import { cssRules } from "./harness";

if (!customElements.get(LABEL_TAG)) customElements.define(LABEL_TAG, PictureStudioStateLabel);

const mount = async (config: Partial<StateLabelConfig>) => {
  const el = document.createElement(LABEL_TAG) as PictureStudioStateLabel;
  el.setConfig({ type: "state-label", size: DEFAULT_LABEL_SIZE, ...config });
  el.hass = {
    states: {
      "sensor.a": { entity_id: "sensor.a", state: "21.5", attributes: { friendly_name: "Salon" } },
    },
    formatEntityName: () => "Salon",
    formatEntityState: () => "21,5 °C",
  } as never;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const text = (el: PictureStudioStateLabel) =>
  el.shadowRoot?.querySelector(".content")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("displayed parts", () => {
  it("shows the state alone by default", async () => {
    const el = await mount({ entity: "sensor.a", show_state: true });
    expect(el.shadowRoot?.querySelector(".name")).toBeNull();
    expect(text(el)).toContain("21,5 °C");
  });

  it("shows the name above the state when both are asked for", async () => {
    const el = await mount({ entity: "sensor.a", show_name: true, show_state: true });
    expect(el.shadowRoot?.querySelector(".name")?.textContent).toBe("Salon");
    expect(text(el)).toBe("Salon 21,5 °C");
  });

  it("renders nothing but an empty content box when neither is asked for", async () => {
    const el = await mount({ entity: "sensor.a" });
    expect(text(el)).toBe("");
  });
});

describe("state rendering", () => {
  // state-display is a custom element, and an undefined custom element renders
  // nothing at all, silently. happy-dom never defines it, so this suite always
  // walks the fallback — which is exactly the path that must not be a blank.
  it("falls back to formatEntityState when state-display is undefined", async () => {
    const el = await mount({ entity: "sensor.a", show_state: true });
    expect(el.shadowRoot?.querySelector("state-display")).toBeNull();
    expect(text(el)).toBe("21,5 °C");
  });
});

describe("size, halo and chrome", () => {
  it("drives the font size, not a box", async () => {
    const el = await mount({ entity: "sensor.a", show_state: true });
    expect(el.style.getPropertyValue("--psc-label-size")).toBe("clamp(11px, 4cqw, 20px)");
  });

  it("wears the halo attribute only when asked", async () => {
    expect((await mount({ entity: "sensor.a" })).hasAttribute("halo")).toBe(false);
    expect((await mount({ entity: "sensor.a", halo: true })).hasAttribute("halo")).toBe(true);
  });

  it("scales the halo on the body size, never on the box", () => {
    const rule = cssRules(PictureStudioStateLabel).find((r) => r.selector === ":host([halo]) .chrome");
    expect(rule?.text).toContain("calc(var(--psc-label-size) * 0.06)");
  });

  it("wears the chrome attribute and its tokens only when a theme draws", async () => {
    const off = await mount({ entity: "sensor.a", chrome: { theme: "none", radius: 4, pill: false, opacity: 1, padding: 6 } });
    expect(off.hasAttribute("chrome")).toBe(false);
    expect(off.style.getPropertyValue("--psc-chrome-fill")).toBe("");

    const on = await mount({ entity: "sensor.a", chrome: { theme: "dark", radius: 4, pill: false, opacity: 0.8, padding: 8 } });
    expect(on.hasAttribute("chrome")).toBe(true);
    expect(on.style.getPropertyValue("--psc-chrome-radius")).toBe("4px");
    expect(on.style.getPropertyValue("--psc-chrome-padding")).toBe("8px");
    expect(on.style.getPropertyValue("--psc-chrome-opacity")).toBe("0.8");
  });

  it("gives a pill a radius no text length can outgrow", async () => {
    const el = await mount({
      entity: "sensor.a",
      chrome: { theme: "auto", radius: 4, pill: true, opacity: 1, padding: 6 },
    });
    expect(el.style.getPropertyValue("--psc-chrome-radius")).toBe("999px");
  });

  it("never wraps", () => {
    const rule = cssRules(PictureStudioStateLabel).find((r) => r.selector === ".content");
    expect(rule?.text).toContain("white-space: nowrap");
  });
});

describe("colour", () => {
  it("writes nothing for `none`, so the theme decides", async () => {
    const el = await mount({ entity: "sensor.a", color: "none", show_state: true });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe("");
  });

  it("maps a palette name onto Home Assistant's own variable", async () => {
    const el = await mount({ entity: "sensor.a", color: "red", show_state: true });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe("var(--red-color)");
  });

  it("passes an unknown value through as a plain CSS colour", async () => {
    const el = await mount({ entity: "sensor.a", color: "#abcdef", show_state: true });
    expect(el.style.getPropertyValue("--psc-label-color")).toBe("#abcdef");
  });
});

describe("actions", () => {
  it("is clickable unless all three actions are none", async () => {
    expect((await mount({ entity: "sensor.a" })).hasAttribute("clickable")).toBe(true);
    const silent = await mount({
      entity: "sensor.a",
      tap_action: { action: "none" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });
    expect(silent.hasAttribute("clickable")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/tests/card/state-label-element.test.ts`
Expected: FAIL — cannot resolve `../../card/state-label-element`.

- [ ] **Step 3: Implement the element**

Create `src/card/state-label-element.ts`. Model it on `state-icon-element.ts`: same `properties`, same `setConfig`, same `hass` accessor pair, same `actionHandler` / `hasAction` import, same `updated()` shape. The parts specific to this kind:

```ts
/**
 * Home Assistant's own mapping from a ui_color name to a CSS value. Copied
 * because computeCssColor is not exported: the palette names and the three
 * text-ish names resolve to `--<name>-color`, anything else is handed through
 * as a plain CSS colour. "none" is ours to intercept — `color: none` is not
 * valid CSS, and the point of "none" is that we name nothing at all.
 */
const NAMED_COLORS = new Set([
  "primary", "accent", "disabled", "red", "pink", "purple", "deep-purple",
  "indigo", "blue", "light-blue", "cyan", "teal", "green", "light-green",
  "lime", "yellow", "amber", "orange", "deep-orange", "brown", "light-grey",
  "grey", "dark-grey", "blue-grey", "black", "white", "primary-text",
  "secondary-text",
]);

const labelColor = (color?: string): string | undefined => {
  if (!color || color === "none") return undefined;
  return NAMED_COLORS.has(color) ? `var(--${color}-color)` : color;
};
```

`render()`:

```ts
  protected render() {
    const config = this._config;
    if (!config) return nothing;
    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;

    return html`
      <div class="chrome">
        <div class="content">
          ${
            config.show_name && stateObj
              ? html`<span class="name"
                  >${this._hass?.formatEntityName?.(stateObj, config.name) ?? ""}</span
                >`
              : nothing
          }
          ${config.show_state ? this._renderState(stateObj) : nothing}
        </div>
      </div>
    `;
  }

  /**
   * state-display is Home Assistant's own renderer for `state_content` — the one
   * the entity badge, the tile card and heading badges all use. It is a custom
   * element, and an undefined custom element renders nothing at all, silently,
   * so its absence must degrade to something rather than to a blank label.
   * formatEntityState is a function on hass, always there, and it renders
   * exactly what the default state_content produces.
   */
  // HassEntity is re-exported by src/types.ts — import it from "../types".
  private _renderState(stateObj?: HassEntity) {
    if (!stateObj) return nothing;
    if (customElements.get("state-display")) {
      return html`<state-display
        class="state"
        .hass=${this._hass}
        .stateObj=${stateObj}
        .content=${this._config?.state_content}
        .timeFormat=${this._config?.time_format}
      ></state-display>`;
    }
    return html`<span class="state">${this._hass?.formatEntityState?.(stateObj) ?? ""}</span>`;
  }
```

`updated()` — same structure as the icon's, with the label's tokens:

```ts
    this.style.setProperty("--psc-label-size", elementSizeCss(config.size, DEFAULT_LABEL_SIZE));

    const color = labelColor(config.color);
    if (color) this.style.setProperty("--psc-label-color", color);
    else this.style.removeProperty("--psc-label-color");

    const chrome = config.chrome;
    const on = !!chrome && chrome.theme !== "none";
    this.toggleAttribute("chrome", on);
    if (on && chrome) {
      this.style.setProperty("--psc-chrome-fill", chromeFill(chrome.theme));
      // A pill has to survive any text length, so it is a length large enough to
      // saturate rather than a percentage, which would draw an ellipse on a wide
      // box.
      this.style.setProperty("--psc-chrome-radius", chrome.pill ? "999px" : `${chrome.radius}px`);
      this.style.setProperty("--psc-chrome-opacity", `${chrome.opacity}`);
      this.style.setProperty("--psc-chrome-padding", `${chrome.padding}px`);
    } else {
      for (const name of [
        "--psc-chrome-fill",
        "--psc-chrome-radius",
        "--psc-chrome-opacity",
        "--psc-chrome-padding",
      ]) {
        this.style.removeProperty(name);
      }
    }

    this.toggleAttribute("halo", config.halo === true);
```

then the `clickable` block and the action-handler block, copied verbatim from the icon.

`static styles`:

```ts
  static styles = css`
    :host {
      display: block;
      transition: transform 120ms ease-out;
    }
    :host([clickable]) {
      cursor: pointer;
    }
    :host([clickable]:hover) {
      transform: scale(1.04);
    }
    /* The chrome. Always present, styled only when the config asks for it, so
       the DOM shape never depends on the config. Unlike the icon's, this box is
       not a square we chose: its width belongs to the text, so a chrome widens
       the item. Positioning and drag bounds read the rendered box, so they
       follow. */
    .chrome {
      position: relative;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    /* The shape, the clipping and the gutter belong to the chrome: an unshaped,
       unpadded wrapper is exactly what "no chrome" means. Keeping the halo out
       of this rule is deliberate — conflating the two is what once clipped every
       chromeless icon into a circle. */
    :host([chrome]) .chrome {
      border-radius: var(--psc-chrome-radius, 0);
      padding: var(--psc-chrome-padding, 0) calc(var(--psc-chrome-padding, 0) * 1.6);
      overflow: hidden;
    }
    :host([halo]) .chrome {
      filter: ${unsafeCSS(haloFilter("--psc-label-size"))};
    }
    /* The fill sits on a pseudo-element so its opacity is its own: fading the
       surface must not fade the text standing on it. */
    :host([chrome]) .chrome::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--psc-chrome-fill);
      opacity: var(--psc-chrome-opacity, 1);
    }
    .content {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      /* The size value is a body, not a box: everything below is a share of it,
         so one number moves the whole label. */
      font-size: var(--psc-label-size);
      line-height: 1.2;
      /* Decided in the design: a label never wraps, whatever it holds. */
      white-space: nowrap;
      color: var(--psc-label-color, var(--primary-text-color));
    }
    /* The hierarchy the eye expects from a name/value pair, and the same one
       Home Assistant gives its badges and tiles. Derived, never a setting. */
    .name {
      font-size: 0.75em;
      color: var(--secondary-text-color);
    }
  `;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/tests/card/state-label-element.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the element**

In `src/index.ts`, import `PictureStudioStateLabel` and `LABEL_TAG`, then add beside the icon's line:

```ts
if (!customElements.get(LABEL_TAG)) customElements.define(LABEL_TAG, PictureStudioStateLabel);
```

- [ ] **Step 6: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS, and a bundle that builds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(label): an entity's text, rendered by Home Assistant's own state-display"
```

---

### Task 6: strings for Appearance

**Files:**
- Modify: `src/strings.ts`
- Test: `src/tests/strings.test.ts`

**Interfaces:**
- Produces: keys `halo_enabled`, `halo_enabled_helper`, `chrome_pill`, `chrome_padding`. Key `chrome` is **removed** — the section title now comes from HA.

- [ ] **Step 1: Rewrite the failing test**

In `src/tests/strings.test.ts`, replace the `chrome strings` block's `KEYS` and both expectation lists. The two localization tests share one list on purpose: a pair that checks different sets is a hole.

```ts
describe("appearance strings", () => {
  const KEYS = [
    "halo_enabled",
    "halo_enabled_helper",
    "chrome_enabled",
    "chrome_radius",
    "chrome_opacity",
    "chrome_content_ratio",
    "chrome_pill",
    "chrome_padding",
  ] as const;

  it("serves the section's own fields in English", () => {
    expect(KEYS.map((key) => localizeOwn(undefined, key))).toEqual([
      "Stand out",
      "Adds a shadow and a light rim so the element stays readable on any picture.",
      "Draw a chrome",
      "Radius",
      "Opacity",
      "Content",
      "Pill",
      "Padding",
    ]);
  });

  it("serves the same eight in French", () => {
    const fr = hass({ language: "fr" });
    expect(KEYS.map((key) => localizeOwn(fr, key))).toEqual([
      "Détacher",
      "Ajoute une ombre et un liseré clair pour rester lisible sur n'importe quelle image.",
      "Dessiner un habillage",
      "Rayon",
      "Opacité",
      "Contenu",
      "Pilule",
      "Marge",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/tests/strings.test.ts`
Expected: FAIL — type error on the unknown keys.

- [ ] **Step 3: Edit the catalogue**

In `src/strings.ts`, in **both** the `en` and `fr` tables: delete the `chrome` entry, and add the four new ones beside the existing chrome keys.

```ts
    // en
    halo_enabled: "Stand out",
    halo_enabled_helper:
      "Adds a shadow and a light rim so the element stays readable on any picture.",
    chrome_pill: "Pill",
    chrome_padding: "Padding",
```

```ts
    // fr
    halo_enabled: "Détacher",
    halo_enabled_helper:
      "Ajoute une ombre et un liseré clair pour rester lisible sur n'importe quelle image.",
    chrome_pill: "Pilule",
    chrome_padding: "Marge",
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/tests/strings.test.ts && pnpm typecheck`
Expected: PASS. `typecheck` will flag `element-form.ts` still asking for `"chrome"` — Task 7 fixes it, so expect that one error here and leave it.

- [ ] **Step 5: Commit**

```bash
git add src/strings.ts src/tests/strings.test.ts
git commit -m "feat(strings): a section Home Assistant already names, a halo we had to"
```

---

### Task 7: the editor, per kind

**Files:**
- Create: `src/editor/state-icon-form.ts`, `src/editor/state-label-form.ts`, `src/tests/editor/state-label-form.test.ts`
- Modify: `src/editor/element-form.ts`
- Test: `src/tests/editor/element-form.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces, from `state-icon-form.ts` (all moved verbatim out of `element-form.ts`, then extended):
  - `iconSchema(): unknown[]`, `iconSizeSchema(mode, localize, hass, radioGroupAvailable): unknown[]`, `iconChromeSchema(localize, radioGroupAvailable): unknown[]`, `iconToFormData(config: StateIconConfig): Record<string, unknown>`, `iconFromFormData(config: StateIconConfig, data: Record<string, unknown>): StateIconConfig`
- Produces, from `state-label-form.ts`:
  - `labelSchema(): unknown[]`, `labelSizeSchema(mode, localize, hass, radioGroupAvailable): unknown[]`, `labelChromeSchema(localize, radioGroupAvailable): unknown[]`, `labelToFormData(config: StateLabelConfig): Record<string, unknown>`, `labelFromFormData(config: StateLabelConfig, data: Record<string, unknown>): StateLabelConfig`
- Produces, from `element-form.ts`: `appearanceToggleSchema(): unknown[]` returning `[{ name: "halo_enabled", selector: { boolean: {} } }, { name: "chrome_enabled", selector: { boolean: {} } }]`, and `elementFormHelper` extended to serve `halo_enabled`.

**Ordering note:** the rendered section order, both kinds, is Entity · Content · Interactions · **Size and position** · **Appearance** · Visibility. The two expansion panels swap places in `render()`.

- [ ] **Step 1: Move the icon's form pieces into their own file**

Use Serena's `move` / `insert_*_symbol` to relocate `stateIconSchema`, `stateIconSizeSchema`, `chromeSchema`, `toFormData`, `fromFormData`, `THEME_KEY`, `THEME_FALLBACK`, `themeModeLabel`, `themeModeTitle` into `src/editor/state-icon-form.ts`, renaming the first five to `iconSchema`, `iconSizeSchema`, `iconChromeSchema`, `iconToFormData`, `iconFromFormData`. Re-export the theme helpers, which the label's file also needs.

- [ ] **Step 2: Run the suite to prove the move changed nothing**

Run: `pnpm test && pnpm typecheck`
Expected: PASS except the known `"chrome"` string error from Task 6.

- [ ] **Step 3: Commit the move alone**

```bash
git add -A && git commit -m "refactor(editor): each kind's form lives in its own file"
```

- [ ] **Step 4: Write the failing tests for the label's form**

Create `src/tests/editor/state-label-form.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { DEFAULT_LABEL_CHROME } from "../../chrome";
import type { StateLabelConfig } from "../../config";
import { DEFAULT_LABEL_SIZE } from "../../element-size";
import { labelFromFormData, labelSchema, labelToFormData } from "../../editor/state-label-form";

const base: StateLabelConfig = { type: "state-label", entity: "sensor.a", size: DEFAULT_LABEL_SIZE };

const names = (schema: unknown[]): string[] =>
  schema.flatMap((row) => {
    const r = row as { name?: string; schema?: unknown[] };
    return r.schema ? names(r.schema) : r.name ? [r.name] : [];
  });

describe("labelSchema", () => {
  it("keeps the half of the badge form the icon left behind", () => {
    expect(names(labelSchema())).toEqual([
      "entity",
      "name",
      "displayed_elements",
      "state_content",
      "color",
      "tap_action",
      "hold_action",
      "double_tap_action",
    ]);
  });

  it("offers no state colour, and no `No color` trap it cannot honour", () => {
    const color = JSON.stringify(labelSchema());
    expect(color).toContain('"default_color":"none"');
    expect(color).toContain('"include_none":true');
    expect(color).not.toContain("include_state");
  });
});

describe("labelToFormData", () => {
  it("flattens the two displayed parts into one multi-select", () => {
    expect(labelToFormData({ ...base, show_name: true, show_state: true }).displayed_elements).toEqual([
      "name",
      "state",
    ]);
    expect(labelToFormData(base).displayed_elements).toEqual([]);
  });

  it("shows the chrome numbers even when the chrome is off, so unchecking loses nothing", () => {
    const data = labelToFormData({ ...base, chrome: { ...DEFAULT_LABEL_CHROME, radius: 8, padding: 10 } });
    expect(data.chrome_enabled).toBe(false);
    expect(data.chrome_radius).toBe(8);
    expect(data.chrome_padding).toBe(10);
  });

  it("rounds every number so a slider cannot leave a fraction behind", () => {
    const data = labelToFormData({
      ...base,
      chrome: { ...DEFAULT_LABEL_CHROME, theme: "auto", radius: 12.5, opacity: 0.615, padding: 7.4 },
    });
    expect(data.chrome_radius).toBe(13);
    expect(data.chrome_opacity).toBe(62);
    expect(data.chrome_padding).toBe(7);
  });

  it("carries the halo as its own checkbox", () => {
    expect(labelToFormData(base).halo_enabled).toBe(false);
    expect(labelToFormData({ ...base, halo: true }).halo_enabled).toBe(true);
  });
});

describe("labelFromFormData", () => {
  const round = (data: Record<string, unknown>) =>
    labelFromFormData(base, { ...labelToFormData(base), ...data });

  it("splits the multi-select back into two booleans", () => {
    expect(round({ displayed_elements: ["state"] })).toMatchObject({
      show_name: false,
      show_state: true,
    });
    expect(round({ displayed_elements: [] })).toMatchObject({
      show_name: false,
      show_state: false,
    });
  });

  it("never lets the form rename the kind", () => {
    expect(round({ type: "state-icon" }).type).toBe("state-label");
  });

  it("stores `none` as the theme when the box is unchecked, keeping every number", () => {
    const off = labelFromFormData(
      { ...base, chrome: { ...DEFAULT_LABEL_CHROME, theme: "auto", radius: 9 } },
      { ...labelToFormData(base), chrome_enabled: false, chrome_radius: 9 },
    );
    expect(off.chrome?.theme).toBe("none");
    expect(off.chrome?.radius).toBe(9);
  });

  it("omits the chrome entirely when there never was one and the box is off", () => {
    expect(round({ chrome_enabled: false }).chrome).toBeUndefined();
  });

  it("writes the halo as a plain boolean", () => {
    expect(round({ halo_enabled: true }).halo).toBe(true);
    expect(round({ halo_enabled: false }).halo).toBe(false);
  });

  it("converts percent back to 0-1 for opacity", () => {
    const on = round({ chrome_enabled: true, chrome_opacity: 62 });
    expect(on.chrome?.opacity).toBeCloseTo(0.62, 5);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm test src/tests/editor/state-label-form.test.ts`
Expected: FAIL — cannot resolve `state-label-form`.

- [ ] **Step 6: Implement `src/editor/state-label-form.ts`**

```ts
export const labelSchema = (): unknown[] => [
  { name: "entity", selector: { entity: {} } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    icon: "mdi:text-short",
    schema: [
      { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
      {
        name: "displayed_elements",
        selector: {
          select: {
            mode: "list",
            multiple: true,
            options: ["name", "state"].map((value) => ({ value, label: value })),
          },
        },
      },
      {
        name: "state_content",
        selector: { ui_state_content: { allow_name: true } },
        context: { filter_entity: "entity" },
      },
      {
        name: "color",
        // No include_state: a label cannot honour it. state-badge computes the
        // state colour inline and exposes nothing, and copying that computation
        // would drift from Home Assistant version to version. See the spec,
        // decision 6.
        selector: { ui_color: { default_color: "none", include_none: true } },
      },
    ],
  },
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    icon: "mdi:gesture-tap",
    schema: [
      { name: "tap_action", selector: { ui_action: { default_action: "more-info" } } },
      {
        name: "",
        type: "optional_actions",
        flatten: true,
        schema: ["hold_action", "double_tap_action"].map((name) => ({
          name,
          selector: { ui_action: { default_action: "none" } },
        })),
      },
    ],
  },
];
```

`labelSizeSchema(mode, localize, hass, radioGroupAvailable)` is `iconSizeSchema`
with one substitution: every `DEFAULT_ICON_SIZE` becomes `DEFAULT_LABEL_SIZE`,
and the `size_value` / `size_min` / `size_max` selectors keep their `px` unit —
a font size is a length like any other. Read `iconSizeSchema`'s body with
`find_symbol` and transpose it; do not guess its shape.

```ts
export const labelChromeSchema = (
  localize: LocalizeFunc,
  radioGroupAvailable = false,
): unknown[] => [
  ...(radioGroupAvailable ? [] : [themeSelectRow(localize)]),
  { name: "chrome_pill", selector: { boolean: {} } },
  {
    name: "chrome_radius",
    selector: { number: { min: 0, max: 24, step: 1, unit_of_measurement: "px" } },
  },
  {
    name: "chrome_opacity",
    selector: { number: { min: 0, max: 100, step: 1, unit_of_measurement: "%" } },
  },
  {
    name: "chrome_padding",
    selector: { number: { min: 0, max: 24, step: 1, unit_of_measurement: "px" } },
  },
];
```

`themeSelectRow` is the dropdown row currently inlined in `iconChromeSchema`; extract it into `state-icon-form.ts` and export it so both files share one definition.

`labelToFormData` / `labelFromFormData` follow `iconToFormData` / `iconFromFormData` field for field, with three differences: `displayed_elements` replaces nothing on the icon side and maps to `show_name` / `show_state`; `chrome_content_ratio` becomes `chrome_pill` and `chrome_padding`; and both carry `halo_enabled`.

```ts
export const labelToFormData = (config: StateLabelConfig): Record<string, unknown> => {
  const { size, chrome, halo, show_name, show_state, ...rest } = config;
  const c = chrome ?? DEFAULT_LABEL_CHROME;
  const displayed: string[] = [];
  if (show_name) displayed.push("name");
  if (show_state) displayed.push("state");
  return {
    ...rest,
    displayed_elements: displayed,
    size_mode: size.mode,
    size_min: typeof size.min === "number" ? Math.round(size.min) : size.min,
    size_ratio: typeof size.ratio === "number" ? Math.round(size.ratio) : size.ratio,
    size_max: typeof size.max === "number" ? Math.round(size.max) : size.max,
    size_value: typeof size.value === "number" ? Math.round(size.value) : size.value,
    halo_enabled: halo === true,
    chrome_enabled: c.theme !== "none",
    // The control never offers "none", so an off chrome pre-selects the theme
    // that checking the box will give it.
    chrome_theme: c.theme === "none" ? "auto" : c.theme,
    chrome_pill: c.pill,
    // Math.round enforces each slider's step:1 contract. The model keeps any
    // finite number as written; rounding belongs to the editor only.
    chrome_radius: Math.round(c.radius),
    chrome_padding: Math.round(c.padding),
    // opacity is 0-1 in config and 0-100 in the form. Math.round avoids
    // floating-point display drift.
    chrome_opacity: Math.round(c.opacity * 100),
  };
};

export const labelFromFormData = (
  config: StateLabelConfig,
  data: Record<string, unknown>,
): StateLabelConfig => {
  // Invariant: `data` is the complete flat record. ha-form merges the changed
  // field onto the `.data` it was given and re-emits the whole thing, so every
  // field passed to `.data` comes back regardless of which rows the active
  // schema shows. That is what keeps a hidden field alive.
  const {
    displayed_elements,
    size_mode,
    size_min,
    size_ratio,
    size_max,
    size_value,
    halo_enabled,
    chrome_enabled,
    chrome_theme,
    chrome_pill,
    chrome_radius,
    chrome_opacity,
    chrome_padding,
    ...rest
  } = data;
  const shown = Array.isArray(displayed_elements) ? (displayed_elements as string[]) : [];
  const chromeOut =
    chrome_enabled || config.chrome !== undefined
      ? {
          chrome: normalizeLabelChrome({
            // The checkbox is the switch; the theme control only ever names a
            // surface that draws. Unchecking stores "none" and every number
            // survives it.
            theme: chrome_enabled ? (chrome_theme ?? "auto") : "none",
            pill: chrome_pill === true,
            radius: typeof chrome_radius === "number" ? Math.round(chrome_radius) : chrome_radius,
            padding:
              typeof chrome_padding === "number" ? Math.round(chrome_padding) : chrome_padding,
            opacity:
              typeof chrome_opacity === "number"
                ? Math.round(chrome_opacity) / 100
                : chrome_opacity,
          }),
        }
      : {};
  return {
    ...(rest as Omit<StateLabelConfig, "type" | "size" | "chrome" | "halo">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    show_name: shown.includes("name"),
    show_state: shown.includes("state"),
    halo: halo_enabled === true,
    size: normalizeElementSize(
      {
        mode: size_mode,
        min: typeof size_min === "number" ? Math.round(size_min) : size_min,
        ratio: typeof size_ratio === "number" ? Math.round(size_ratio) : size_ratio,
        max: typeof size_max === "number" ? Math.round(size_max) : size_max,
        value: typeof size_value === "number" ? Math.round(size_value) : size_value,
      },
      DEFAULT_LABEL_SIZE,
    ),
    ...chromeOut,
  };
};
```

- [ ] **Step 7: Add `halo_enabled` to the icon's form data**

In `state-icon-form.ts`, add `halo_enabled: config.halo === true` to `iconToFormData`, destructure `halo_enabled` in `iconFromFormData` and return `halo: halo_enabled === true`. Extend `src/tests/editor/element-form.test.ts` with the same two assertions the label's suite makes.

- [ ] **Step 8: Rewire `element-form.ts` as a host**

Three changes in `render()`:

1. The header shows the kind's label:

```ts
        <span class="title">${elementLabel(hass.localize, element.type)}</span>
```

2. The Appearance panel replaces the Chrome panel, gains the halo checkbox, and **moves after** the Size and position panel. Its title comes from HA, its toggles from one shared schema:

```ts
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:shape"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${hass.localize("ui.panel.lovelace.editor.card.map.appearance") || "Appearance"}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${data}
            .schema=${appearanceToggleSchema()}
            .computeLabel=${label}
            .computeHelper=${helper}
            @value-changed=${this._valueChanged}
          ></ha-form>
          ${
            data.chrome_enabled
              ? html`
                  ${
                    radioGroupAvailable
                      ? html`
                          <span class="section-label">${themeModeTitle(hass.localize)}</span>
                          <ha-radio-group
                            orientation="horizontal"
                            .value=${(data.chrome_theme as string) ?? "auto"}
                            @change=${this._chromeThemeChanged}
                          >
                            ${(["auto", "light", "dark"] as const).map(
                              (value) => html`
                                <ha-radio-option .value=${value}
                                  >${themeModeLabel(hass.localize, value)}</ha-radio-option
                                >
                              `,
                            )}
                          </ha-radio-group>
                        `
                      : nothing
                  }
                  <ha-form
                    .hass=${hass}
                    .data=${data}
                    .schema=${chromeSchema(hass.localize, radioGroupAvailable)}
                    .computeLabel=${label}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                `
              : nothing
          }
        </div>
      </ha-expansion-panel>
```

`label` and `helper` are the two arrow functions already inlined at every
`ha-form` in this file; hoist them to one `const` each at the top of `render()`
rather than repeating them six times.

3. Every `toFormData(element)` / `stateIconSchema()` call becomes a per-kind lookup made once at the top of `render()`:

```ts
    const isLabel = element.type === "state-label";
    const data = isLabel ? labelToFormData(element) : iconToFormData(element);
    const schema = isLabel ? labelSchema() : iconSchema();
    const sizeSchema = isLabel ? labelSizeSchema : iconSizeSchema;
    const chromeSchema = isLabel ? labelChromeSchema : iconChromeSchema;
```

and `_valueChanged` dispatches to `labelFromFormData` or `iconFromFormData` on the same test.

Add to `appearanceToggleSchema` and `elementFormHelper`:

```ts
export const appearanceToggleSchema = (): unknown[] => [
  { name: "halo_enabled", selector: { boolean: {} } },
  { name: "chrome_enabled", selector: { boolean: {} } },
];
```

```ts
  // ha-form-boolean renders the helper as the checkbox's own hint, permanently
  // visible — which is what a tooltip icon could not be on a phone.
  if (name === "halo_enabled") return localizeOwn(hass, "halo_enabled_helper");
```

and in `elementFormLabel`, `halo_enabled`, `chrome_pill` and `chrome_padding` join the `localizeOwn` list; the removed `chrome` key must no longer be referenced anywhere.

- [ ] **Step 9: Fix the existing panel-index test, then add the ordering test**

**This is a known breakage, not a surprise.** `src/tests/editor/element-form.test.ts`
reads the size panel as `querySelectorAll("ha-expansion-panel")[1]`, with the
comment "the chrome panel is first". Swapping the two panels makes the size panel
`[0]`. Update the index **and** the comment — a comment that now lies is worse
than no comment.

Then add the ordering test to the same `describe`, which already has a
`mountForm` helper and the `ha-radio-group` stubs in scope:

```ts
  it("renders Size and position before Appearance", async () => {
    const form = await mountForm("auto");
    const headers = [...(form.shadowRoot?.querySelectorAll('[slot="header"]') ?? [])].map((el) =>
      el.textContent?.trim(),
    );
    // localize is stubbed as `L:${key}`, so the Appearance title arrives as the
    // borrowed Home Assistant key rather than as a translated word.
    expect(headers).toEqual([
      "Size and position",
      "L:ui.panel.lovelace.editor.card.map.appearance",
    ]);
  });
```

If the stub's return shape makes the second entry differ, assert on the two
panels' order by their leading icons instead — `mdi:shape` must come after the
placement icon. Do not weaken the test to a single-panel check.

- [ ] **Step 10: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS, and the `"chrome"` error from Task 6 is gone.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(editor): an Appearance section, and a form per kind"
```

---

### Task 8: the add menu and the form headers

**Files:**
- Modify: `src/editor/badge-list.ts`, `src/editor/badge-form.ts`
- Test: `src/tests/editor/badge-list.test.ts`

**Interfaces:**
- Consumes: `elementLabel` (existing), `choiceLabel` (existing).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/tests/editor/badge-list.test.ts`:

```ts
it("offers the elements before the badges", () => {
  const values = addChoices(localize).map((c) => c.value);
  expect(values[0]).toBe("element:state-icon");
  expect(values[1]).toBe("element:state-label");
  expect(values.slice(2).every((v) => v.startsWith("badge:"))).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/tests/editor/badge-list.test.ts`
Expected: FAIL — the first value is a badge.

- [ ] **Step 3: Swap the two spreads in `addChoices`**

Elements first, badges after; nothing else in the function changes.

- [ ] **Step 4: Show the badge's label in its header**

In `src/editor/badge-form.ts`, replace `${this.badge.type}` with the catalogue label, falling back to the raw type when no key resolves:

```ts
        <span class="title">${choiceLabel(this.hass.localize, { type: this.badge.type })}</span>
```

Import `choiceLabel` from `./badge-catalog`.

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(editor): the items first, and a header that says what you are editing"
```

---

### Task 9: documentation

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Document the kind in the README**

The README already lists `### Size and position` (l.89) before `### Chrome`
(l.109), so its order needs no change. What does change:

- Rename `### Chrome` to `### Appearance`, and open it on the halo — what it
  draws, and that it is off unless asked for.
- Rename `#### Chrome keys` to `#### Appearance keys`, and split the table in
  two: an icon's keys (`radius` as a percentage, `content_ratio`) and a label's
  (`radius` in pixels, `pill`, `padding`), with `theme`, `opacity` and `halo`
  shared.
- Add `state-label` to `## Icons` — which is now a section about two kinds and
  should be renamed `## Elements` — and to the YAML reference, with its full
  shape copied from the spec's "Config shape".
- Document the public tokens `--psc-label-size`, `--psc-label-outline`,
  `--psc-label-glow` beside the icon's three.

**Do not edit `docs/superpowers/specs/2026-08-14-icon-chrome-design.md`.** It
records what was decided for 1.3.0 and is correct as history; the new spec says
in as many words that it supersedes that order.

- [ ] **Step 2: Write the CHANGELOG entry**

Under `## unreleased`, written for someone configuring the card — not for someone reading the diff. `Changed` comes first, because that is the section people read before upgrading.

```markdown
## unreleased

### Changed

- The halo around an icon — the light rim and soft shadow that keep it readable
  on a photograph — is no longer drawn automatically. It is now a **Détacher**
  checkbox at the top of the new **Appearance** section, off by default, so
  icons placed before this release lose it until you tick the box.
- The **Chrome** section is now **Appearance**, and it comes after **Size and
  position** rather than before it.
- The panel you get when editing an item now shows the item's name — "State
  icon", "Entity badge" — instead of its technical type.
- The add menu lists the elements before the badges.

### Added

- A new element kind, **State label**: an entity's text placed on the picture.
  Show its name, its state, or both, compose what the state says the same way a
  badge does, pick a colour, and size it from the card's width like every other
  item. It can stand on the same surface an icon can, with a pill or rounded
  corners and a padding of your own.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: what changes for someone configuring the card"
```

---

### Task 10: the browser walk

**Files:** none — this task produces a Verification record appended to the spec.

**Why it is a task:** happy-dom performs no layout. Nothing in Tasks 1-9 proves that a `clamp(…cqw…)` resolves, that a pill stays a pill, that a padding lands, or that the halo is gone where it should be. Six such defects shipped in 1.2.0 past a green suite and two reviews; a seventh shipped in 1.3.0 that five reviews read and missed, and that the user saw in seconds.

- [ ] **Step 1: Build and serve**

Run: `pnpm build`
The repo's `dist/` is mounted at `/config/www/picture-studio-card/`, so the build is live at `/local/picture-studio-card/picture-studio.js`. Bump the dashboard resource's `?v=` to bypass the cache. Local HA: `docker compose`, container `picture-studio-ha`, http://localhost:8123. Test picture: `/local/demo/office-plan.jpg`.

- [ ] **Step 2: Walk the halo regression, in a panel view and a sections view**

- An icon carrying no `halo` key: **no** rim, **no** glow, and — critically — **not clipped into a circle** and **not ringed**. This is the 1.3.0 trap on the same CSS rule.
- Ticking **Détacher**: the rim and glow come back, on the glyph when there is no chrome and on the disc when there is one.
- An icon with a chrome and no halo, and one with both.

- [ ] **Step 3: Walk the label**

- Body follows the card's width: the same label in a panel view and in a 4-column sections view.
- Name and state together: hierarchy legible, no wrapping at any length.
- A pill at a one-character label and at a thirty-character one — still a rounded end, never an ellipse.
- Padding and opacity: the surface fades, the text does not.
- The halo scales with the body, not with the box: compare a short and a long label at the same size.
- Anchoring: with an anchor at each corner, tick the chrome and confirm the label grows the way the anchor promises.

- [ ] **Step 4: Prove `state-display`**

Set `state_content` to something composed (`last_changed`, or a list) and confirm it renders. Then confirm the fallback by temporarily forcing the `customElements.get` branch to `false` in the built bundle: the label must show the plain formatted state, never a blank.

- [ ] **Step 5: Settle the label's `auto` defaults**

`clamp(11px, 4cqw, 20px)` is provisional. Read a label beside an icon at several card widths and adjust `DEFAULT_LABEL_SIZE` if the pairing reads wrong. Any change lands with its test in `src/tests/element-size.test.ts` updated to the new literals.

- [ ] **Step 6: Record the walk**

Append a `## Verification` section to `docs/superpowers/specs/2026-08-17-state-label-design.md`: what was walked, in which view types, what was found, what was changed as a result.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(specs): what the browser said"
```

---

## After the plan

The version bump to `1.4.0` — `package.json` and the CHANGELOG heading together — lands with the delivery, not during the work, and the tag is the user's to push. Ask before bumping.
