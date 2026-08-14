# Icon chrome — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `state-icon` an optional surface to stand on — a filled, rounded wrapper — so an icon on a busy photograph reads against something instead of against the picture.

**Architecture:** One `div` wrapper around the existing `state-badge`, carrying `overflow: hidden`, a radius, a fill and the halo the glyph wears today. A new pure module `src/chrome.ts` decides everything (defaults, normalization, storage, the fill's token chain); the element only writes custom properties on its host. The host's box stays `--psc-icon-size` whether or not a chrome is drawn, which is what keeps positioning, dragging and sizing untouched.

**Tech Stack:** TypeScript, Lit (bundled), rstest + happy-dom, biome, rslib single-file build.

**Spec:** `docs/superpowers/specs/2026-08-14-icon-chrome-design.md`

## Global Constraints

- **Serena's symbolic tools are primary for code.** `get_symbols_overview` / `find_symbol` to read, `replace_symbol_body` / `insert_after_symbol` / `replace_content` to edit. Built-in Read/Edit are for `.md`, JSON and YAML only.
- **Home Assistant floor: 2026.6.0** (`hacs.json`), frontend `20260527.4`. Both palette tokens used here (`--ha-color-white`, `--ha-color-neutral-10`) exist at that build.
- **Never reimplement Home Assistant behaviour.** Every fill is a chain of their tokens; no colour of ours appears except as the last fallback in a `var()` chain.
- **Nothing outside the element may change.** `src/position.ts`, `src/card/drag-layer.ts`, `src/element-size.ts` and the card's own layout are out of scope. A task that seems to need one of them has taken a wrong turn — stop and say so.
- **Chat is French; code, comments, commits and docs are English.**
- **Run `pnpm format` after every change**, and `pnpm test` before every commit.
- **A test must not restate a constant it guards.** Assert literal expected values; only the one test that pins `DEFAULT_CHROME` may name it.
- **Never `git push`.** The user does that.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/chrome.ts` *(new)* | The `Chrome` record: defaults, normalization, storage comparison, the fill's token chain. Pure — no DOM, no `hass`. |
| `src/tests/chrome.test.ts` *(new)* | Unit tests for the above. |
| `src/config.ts` | `StateIconConfig.chrome`, filled by `normalizeElementConfig`, dropped by `storedConfig` when it is the default. |
| `src/card/state-icon-element.ts` | The wrapper element, its styles, and the four custom properties. |
| `src/strings.ts` | The five labels Home Assistant has no key for — the theme's four come from the map card's. |
| `src/editor/element-form.ts` | The "Chrome" expandable: the surface select and three numbers. |
| `README.md`, `CHANGELOG.md` | User-facing reference and the release note. |

---

### Task 1: The `chrome` module

**Files:**
- Create: `src/chrome.ts`
- Test: `src/tests/chrome.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type ChromeTheme = "none" | "auto" | "light" | "dark"`
  - `export interface Chrome { theme: ChromeTheme; radius: number; opacity: number; content_ratio: number }`
  - `export const DEFAULT_CHROME: Chrome`
  - `export const normalizeChrome: (raw: unknown) => Chrome`
  - `export const isDefaultChrome: (chrome: Chrome) => boolean`
  - `export const chromeFill: (theme: ChromeTheme) => string`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/chrome.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import {
  type Chrome,
  chromeFill,
  DEFAULT_CHROME,
  isDefaultChrome,
  normalizeChrome,
} from "../chrome";

describe("DEFAULT_CHROME", () => {
  // The one test allowed to name the constant: it is what it guards.
  it("is a disc, fully opaque, drawing nothing, with Home Assistant's 24/40 ratio", () => {
    expect(DEFAULT_CHROME).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });
});

describe("normalizeChrome", () => {
  it("defaults a missing chrome to the default record", () => {
    expect(normalizeChrome(undefined)).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("reads a full record back unchanged", () => {
    expect(normalizeChrome({ theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 })).toEqual(
      { theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 },
    );
  });

  it("keeps the numbers when the theme is none — a chrome switched off is not erased", () => {
    expect(normalizeChrome({ theme: "none", radius: 8, opacity: 0.5, content_ratio: 1 })).toEqual({
      theme: "none",
      radius: 8,
      opacity: 0.5,
      content_ratio: 1,
    });
  });

  it("falls back to none on an unknown theme", () => {
    expect(normalizeChrome({ theme: "rainbow" }).theme).toBe("none");
  });

  it("clamps each number into its own range", () => {
    expect(normalizeChrome({ radius: 90, opacity: 4, content_ratio: -1 })).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0,
    });
  });

  it("falls back on values that are not finite numbers", () => {
    expect(normalizeChrome({ radius: "12%", opacity: null, content_ratio: Number.NaN })).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("drops unknown keys — chrome is a closed record, like size", () => {
    expect(normalizeChrome({ theme: "auto", border: "1px" })).toEqual({
      theme: "auto",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("survives a non-object", () => {
    expect(normalizeChrome("dark").theme).toBe("none");
    expect(normalizeChrome(null).theme).toBe("none");
  });
});

describe("isDefaultChrome", () => {
  const base: Chrome = { theme: "none", radius: 50, opacity: 1, content_ratio: 0.6 };

  it("is true only for the untouched record", () => {
    expect(isDefaultChrome(base)).toBe(true);
  });

  it("is false as soon as any one field differs", () => {
    expect(isDefaultChrome({ ...base, theme: "auto" })).toBe(false);
    expect(isDefaultChrome({ ...base, radius: 8 })).toBe(false);
    expect(isDefaultChrome({ ...base, opacity: 0.9 })).toBe(false);
    expect(isDefaultChrome({ ...base, content_ratio: 1 })).toBe(false);
  });
});

describe("chromeFill", () => {
  it("copies ha-badge's own chain for auto", () => {
    expect(chromeFill("auto")).toBe("var(--ha-card-background, var(--card-background-color, #fff))");
  });

  it("names the core palette directly for the forced modes", () => {
    expect(chromeFill("light")).toBe("var(--ha-color-white, #fff)");
    expect(chromeFill("dark")).toBe("var(--ha-color-neutral-10, #202020)");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/chrome.test.ts`
Expected: FAIL — cannot resolve `../chrome`.

- [ ] **Step 3: Write the module**

Create `src/chrome.ts`:

```ts
/**
 * The surface a state-icon can stand on. `size` gives the box; this record says
 * what is drawn in that box and how much of it the content takes.
 *
 * An icon on a photograph has no theme background behind it, so it competes
 * with whatever the picture happens to show. A Lovelace badge solves exactly
 * this by standing on its own surface, and the recipe copied here is theirs:
 * the fill comes from the theme, the glyph keeps its state colour.
 */
export type ChromeTheme = "none" | "auto" | "light" | "dark";

export interface Chrome {
  /** "none" draws nothing at all; the other three name what the fill is made of. */
  theme: ChromeTheme;
  /** border-radius as a percentage of the box — 50 is a disc, 0 a square. */
  radius: number;
  /** the fill's opacity, 0-1. The content is never faded, only the surface. */
  opacity: number;
  /** the share of the box taken by the glyph — or by an entity picture, which
      state-badge paints on the same host, so one number scales both. 0-1. */
  content_ratio: number;
}

/**
 * Off by default, so no existing dashboard changes on upgrade. The numbers are
 * the ones a chrome would want the day it is switched on: a disc, opaque, and
 * Home Assistant's own 24/40 glyph-to-box ratio.
 */
export const DEFAULT_CHROME: Chrome = {
  theme: "none",
  radius: 50,
  opacity: 1,
  content_ratio: 0.6,
};

const THEMES: readonly ChromeTheme[] = ["none", "auto", "light", "dark"];

const clamped = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/**
 * Unknown keys are dropped: `chrome` is a closed record of ours, exactly like
 * `size`. The rule that nothing may vanish applies one level up, to the
 * element's `config`, which `normalizeElementConfig` spreads.
 */
export const normalizeChrome = (raw: unknown): Chrome => {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CHROME };
  const chrome = raw as Partial<Record<string, unknown>>;
  const theme = chrome.theme as ChromeTheme;
  return {
    theme: THEMES.includes(theme) ? theme : DEFAULT_CHROME.theme,
    radius: clamped(chrome.radius, DEFAULT_CHROME.radius, 0, 50),
    opacity: clamped(chrome.opacity, DEFAULT_CHROME.opacity, 0, 1),
    content_ratio: clamped(chrome.content_ratio, DEFAULT_CHROME.content_ratio, 0, 1),
  };
};

/**
 * All four fields, because `storedConfig` rewrites the whole config on every
 * editor commit: a partial comparison would either write a `chrome:` block into
 * everyone's YAML on the first drag, or drop numbers someone had tuned.
 */
export const isDefaultChrome = (chrome: Chrome): boolean =>
  chrome.theme === DEFAULT_CHROME.theme &&
  chrome.radius === DEFAULT_CHROME.radius &&
  chrome.opacity === DEFAULT_CHROME.opacity &&
  chrome.content_ratio === DEFAULT_CHROME.content_ratio;

/**
 * Every mode is a chain of Home Assistant's tokens; the literal at the end is a
 * last resort, not a choice.
 *
 * `auto` is what ha-badge itself uses, so the surface matches the dashboard's
 * cards. The two forced modes name the *core palette* — that layer is emitted
 * once, globally, with no dark counterpart, so both entries are readable
 * whichever mode is active. The semantic layer above it (--ha-color-surface-*)
 * is the one that comes in two copies, only one of which is ever in the
 * document: applyThemesOnElement picks a set in JavaScript and writes just that
 * one. Which is why "the theme's other mode" is not something we can ask for.
 */
export const chromeFill = (theme: ChromeTheme): string => {
  if (theme === "light") return "var(--ha-color-white, #fff)";
  if (theme === "dark") return "var(--ha-color-neutral-10, #202020)";
  return "var(--ha-card-background, var(--card-background-color, #fff))";
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm format && pnpm test src/tests/chrome.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/chrome.ts src/tests/chrome.test.ts
git commit -m "feat(chrome): the record, its defaults and its fills"
```

---

### Task 2: Config — carry it, normalize it, store it

**Files:**
- Modify: `src/config.ts` — `StateIconConfig` (interface), `normalizeElementConfig`, `storedConfig`
- Test: `src/tests/config.test.ts`

**Interfaces:**
- Consumes: `Chrome`, `DEFAULT_CHROME`, `normalizeChrome`, `isDefaultChrome` from `../chrome`.
- Produces: `StateIconConfig.chrome?: Chrome` — **optional**, and always present after `normalizeElementConfig`.

**Why optional, when `size` is required:** an absent `size` cannot be reasoned about, since `iconSizeCss` switches on `mode`. An absent `chrome` already means exactly what `DEFAULT_CHROME` means — draw nothing — so the element reads it as "no chrome" and writes no custom property. It also spares some thirty test literals a field that would say nothing.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/config.test.ts`, inside the existing describes for `normalizeConfig` and `storedConfig` (match the file's existing helpers for building a config; if it builds items inline, do the same):

```ts
describe("element chrome", () => {
  const withChrome = (chrome: unknown) => ({
    type: "custom:picture-studio",
    image: "/a.png",
    items: [
      {
        type: "element",
        position: { top: "10%", left: "10%" },
        config: { type: "state-icon", entity: "light.a", chrome },
      },
    ],
  });

  it("normalizes a chrome the config carries", () => {
    const config = normalizeConfig(withChrome({ theme: "dark", radius: 8 }));
    const element = config.items[0];
    if (element.type !== "element") throw new Error("expected an element");
    expect(element.config.chrome).toEqual({
      theme: "dark",
      radius: 8,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("gives an element with no chrome key the default record", () => {
    const config = normalizeConfig(withChrome(undefined));
    const element = config.items[0];
    if (element.type !== "element") throw new Error("expected an element");
    expect(element.config.chrome).toEqual({
      theme: "none",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("does not write a chrome key back when it is untouched", () => {
    const stored = storedConfig(normalizeConfig(withChrome(undefined)));
    const item = (stored.items as Record<string, unknown>[])[0];
    expect(item.config).not.toHaveProperty("chrome");
  });

  it("writes the chrome back when any field was touched", () => {
    const stored = storedConfig(normalizeConfig(withChrome({ theme: "auto" })));
    const item = (stored.items as Record<string, unknown>[])[0];
    expect((item.config as Record<string, unknown>).chrome).toEqual({
      theme: "auto",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("keeps a chrome whose theme is none but whose numbers were tuned", () => {
    const stored = storedConfig(normalizeConfig(withChrome({ theme: "none", radius: 10 })));
    const item = (stored.items as Record<string, unknown>[])[0];
    expect((item.config as Record<string, unknown>).chrome).toEqual({
      theme: "none",
      radius: 10,
      opacity: 1,
      content_ratio: 0.6,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/tests/config.test.ts`
Expected: FAIL — `element.config.chrome` is undefined.

- [ ] **Step 3: Wire the three sites**

In `src/config.ts`, add the import beside the existing `element-size` one:

```ts
import { type Chrome, isDefaultChrome, normalizeChrome } from "./chrome";
```

Add the field to `StateIconConfig`, after `size`:

```ts
  size: IconSize;
  /** Optional: absent means no chrome, which is also what DEFAULT_CHROME says. */
  chrome?: Chrome;
```

Replace the return of `normalizeElementConfig`:

```ts
  return {
    ...raw,
    type: "state-icon",
    size: normalizeIconSize(raw.size),
    chrome: normalizeChrome(raw.chrome),
  } as StateIconConfig;
```

In `storedConfig`, the element branch currently drops a default `size`. Both keys must be droppable independently, so replace that branch with:

```ts
    if (item.type === "element") {
      // Only when every field is a default: a mode may be off and still carry
      // numbers the user typed, and dropping the key would lose them. A config
      // that never touched either key does not grow one.
      const { size, chrome, ...rest } = item.config;
      const config: Record<string, unknown> = { ...rest };
      if (!isDefaultIconSize(size)) config.size = size;
      if (chrome && !isDefaultChrome(chrome)) config.chrome = chrome;
      stored.config = config;
    }
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm format && pnpm test && pnpm typecheck`
Expected: PASS. The `storedConfig` rewrite touches the `size` path too, so the existing size-storage tests are the guard that it still behaves.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/tests/config.test.ts
git commit -m "feat(chrome): carried on the element config, dropped from storage when untouched"
```

---

### Task 3: The element draws the wrapper

**Files:**
- Modify: `src/card/state-icon-element.ts` — `render`, `updated`, `styles`
- Test: `src/tests/card/state-icon-element.test.ts`

**Interfaces:**
- Consumes: `StateIconConfig.chrome` (Task 2), `chromeFill` (Task 1).
- Produces: a `.chrome` div in the shadow root wrapping `state-badge`; a `chrome` boolean attribute on the host; the custom properties `--psc-chrome-fill`, `--psc-chrome-radius`, `--psc-chrome-opacity`, `--psc-content-ratio`.

**Note on what the suite can see:** happy-dom does no layout, so the tests assert the attribute, the properties and the DOM shape — never a rendered size, radius or shadow. The visual half is Task 6's browser walk, and it is not optional.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/card/state-icon-element.test.ts`. The file already has a `mount` helper and a `badge` accessor; add a `chrome` accessor beside it:

```ts
const chromeEl = (el: PictureStudioStateIcon) =>
  el.shadowRoot?.querySelector(".chrome") as HTMLElement | null;

describe("chrome", () => {
  it("always wraps the badge, so the DOM shape never depends on the config", async () => {
    const el = await mount({ entity: "light.a" });
    expect(chromeEl(el)).not.toBeNull();
    expect(chromeEl(el)?.querySelector("state-badge")).not.toBeNull();
  });

  it("marks nothing and writes nothing when there is no chrome", async () => {
    const el = await mount({ entity: "light.a" });
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(el.style.getPropertyValue("--psc-chrome-fill")).toBe("");
    expect(el.style.getPropertyValue("--psc-content-ratio")).toBe("");
  });

  it("treats an explicit theme of none as no chrome", async () => {
    const el = await mount({
      entity: "light.a",
      chrome: { theme: "none", radius: 10, opacity: 0.5, content_ratio: 0.4 },
    });
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(el.style.getPropertyValue("--psc-chrome-radius")).toBe("");
  });

  it("writes the four properties when a chrome is on", async () => {
    const el = await mount({
      entity: "light.a",
      chrome: { theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 },
    });
    expect(el.hasAttribute("chrome")).toBe(true);
    expect(el.style.getPropertyValue("--psc-chrome-fill")).toBe(
      "var(--ha-color-neutral-10, #202020)",
    );
    expect(el.style.getPropertyValue("--psc-chrome-radius")).toBe("12%");
    expect(el.style.getPropertyValue("--psc-chrome-opacity")).toBe("0.8");
    expect(el.style.getPropertyValue("--psc-content-ratio")).toBe("0.5");
  });

  it("clears the properties when a chrome is switched off in place", async () => {
    const el = await mount({ entity: "light.a", chrome: { theme: "auto" } as never });
    el.setConfig({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      entity: "light.a",
      chrome: { theme: "none", radius: 50, opacity: 1, content_ratio: 0.6 },
    });
    await el.updateComplete;
    expect(el.hasAttribute("chrome")).toBe(false);
    expect(el.style.getPropertyValue("--psc-chrome-fill")).toBe("");
  });
});
```

The `mount` helper's parameter type is `Partial<StateIconConfig>`, so `chrome` is accepted once Task 2 lands. In the fourth test the record is complete; in the fifth, `{ theme: "auto" } as never` stands for a partially written config reaching the element, which is what the editor's own normalization prevents but the type allows.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/tests/card/state-icon-element.test.ts`
Expected: FAIL — no `.chrome` element.

- [ ] **Step 3: Wrap the badge in `render`**

In `render`, wrap the returned `state-badge` — the badge's own attributes are unchanged:

```ts
    return html`
      <div class="chrome">
        <state-badge
          .hass=${this._hass}
          .stateObj=${stateObj}
          .overrideIcon=${config.icon}
          .color=${config.color ?? "state"}
          .overrideImage=${suppressPicture ? "" : undefined}
          title=${title}
        ></state-badge>
      </div>
    `;
```

The wrapper is always in the DOM, chrome or no chrome: one DOM shape is one thing to reason about, and an unstyled wrapper costs nothing.

- [ ] **Step 4: Write the properties in `updated`**

In `updated`, immediately after the existing `--psc-icon-size` line:

```ts
    // A chrome that is absent and a chrome whose theme is "none" are the same
    // thing — the record exists so numbers survive being switched off.
    const chrome = config.chrome;
    const on = !!chrome && chrome.theme !== "none";
    this.toggleAttribute("chrome", on);
    if (on && chrome) {
      this.style.setProperty("--psc-chrome-fill", chromeFill(chrome.theme));
      this.style.setProperty("--psc-chrome-radius", `${chrome.radius}%`);
      this.style.setProperty("--psc-chrome-opacity", `${chrome.opacity}`);
      this.style.setProperty("--psc-content-ratio", `${chrome.content_ratio}`);
    } else {
      for (const name of [
        "--psc-chrome-fill",
        "--psc-chrome-radius",
        "--psc-chrome-opacity",
        "--psc-content-ratio",
      ]) {
        this.style.removeProperty(name);
      }
    }
```

Add the import at the top of the file:

```ts
import { chromeFill } from "../chrome";
```

- [ ] **Step 5: Move the filter and style the wrapper**

In `static styles`, make three edits.

First, `:host` **loses the `filter` declaration** — the comment block that explains the white rim and the black halo moves with it to `.chrome`. What stays on `:host` is `display`, `line-height`, `--psc-inactive-color`, `transition` and the two `[clickable]` rules.

Second, add the wrapper's rules:

```css
    /* The chrome. Always present, styled only when the config asks for it, so
       the DOM shape never depends on the config. */
    .chrome {
      position: relative;
      /* Explicit: a shadow root inherits no reset, so the default is
         content-box. Border-box keeps the outer box at exactly --psc-icon-size
         whatever is ever drawn on its edge, which is what leaves the drag
         bounds, the anchoring and the stored percentages alone. */
      box-sizing: border-box;
      width: var(--psc-icon-size);
      height: var(--psc-icon-size);
      border-radius: var(--psc-chrome-radius, 50%);
      /* At content_ratio 1 the picture fills the box and this is what clips it
         to the chrome's own silhouette — the chrome becomes the picture's
         frame rather than a disc behind it. */
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      /* Moved off :host so the wrapper carries the whole chrome, halo included.
         The icon stands on the user's picture, not on the theme's background,
         so its contrast has to hold against an unknown image — which no theme
         token can promise. Hence literal white and black here, and only here.
         drop-shadow rather than a border or a box-shadow: it traces the
         rendered silhouette, so it follows the glyph when there is no chrome
         and the disc when there is one. Both are exposed as variables so a
         dashboard can dial them without forking the element. */
      filter: drop-shadow(var(--psc-icon-outline, 0 0 1px rgba(255, 255, 255, 0.4)))
        drop-shadow(var(--psc-icon-glow, 0 0 3px rgba(0, 0, 0, 0.6)));
    }
    /* The fill sits on a pseudo-element so its opacity is its own: fading the
       surface must not fade the icon standing on it. */
    :host([chrome]) .chrome::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--psc-chrome-fill);
      opacity: var(--psc-chrome-opacity, 1);
    }
    /* state-badge paints an entity picture as a background-image on its own
       host and the glyph as a child sized by --mdc-icon-size, so scaling the
       badge scales both — one declaration, no special case for pictures. */
    :host([chrome]) state-badge {
      --state-badge-border-radius: var(--psc-chrome-radius);
      --state-badge-with-image-border-radius: var(--psc-chrome-radius);
      --state-badge-with-media-image-border-radius: var(--psc-chrome-radius);
    }
```

Third, the existing `state-badge` rule keeps its `--state-inactive-color` comment and block, and its three size declarations become ratio-aware — `--psc-content-ratio` is absent unless a chrome is on, so the fallback of `1` is the whole of the no-chrome behaviour:

```css
      width: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
      height: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
      --mdc-icon-size: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
```

- [ ] **Step 6: Run the tests**

Run: `pnpm format && pnpm test && pnpm typecheck`
Expected: PASS, including the pre-existing element tests — `badge(el)` finds `state-badge` through the wrapper, since `querySelector` is not depth-limited.

- [ ] **Step 7: Commit**

```bash
git add src/card/state-icon-element.ts src/tests/card/state-icon-element.test.ts
git commit -m "feat(chrome): the element draws the wrapper, and the halo moves onto it"
```

---

### Task 4: The editor section

**Files:**
- Modify: `src/strings.ts` — five keys, `en` and `fr`
- Modify: `src/editor/element-form.ts` — `toFormData`, `fromFormData`, `elementFormLabel`, two new schema factories, and the panel in `render`
- Test: `src/tests/editor/element-form.test.ts`, `src/tests/strings.test.ts`

**Interfaces:**
- Consumes: `Chrome`, `DEFAULT_CHROME`, `normalizeChrome` from `../chrome`; `StateIconConfig.chrome` from Task 2.
- Produces: form fields `chrome_enabled`, `chrome_theme`, `chrome_radius`, `chrome_opacity`, `chrome_content_ratio`; `export const chromeToggleSchema: () => unknown[]`; `export const chromeSchema: (localize: LocalizeFunc, radioGroupAvailable?: boolean) => unknown[]`. **`stateIconSchema` keeps its current signature** — the section is a panel of its own, not a schema entry.

**The section's shape:** a checkbox says whether there is a chrome, then the theme offers three choices on one line, then the three numbers. `none` never appears in the interface — it is what unchecking stores, and storing it is what keeps the numbers.

**Why a hand-built `ha-expansion-panel`:** a three-way choice on one line cannot come from `ha-form`. `ha-selector-select` in `mode: "list"` never passes `orientation` to `ha-radio-group`, and the attribute has no exported part, so no CSS reaches it. The size control already solved this — `ha-radio-group` rendered by hand behind a `customElements.get` guard, with an `ha-form` select as the fallback, because an undefined custom element renders nothing at all, silently. Copy that shape exactly; do not invent a second one.

**The toggle goes through `ha-form`'s `boolean` selector** rather than a hand-placed `ha-checkbox`: `ha-selector` pulls its own sub-components, so it is guaranteed to render, and nothing here proves an `ha-checkbox` chunk is loaded in our dialog. It draws Home Assistant's boolean row. If a literal checkbox is wanted, that is a delivery-time layout adjustment.

**The numbers stay visible when the box is unchecked**, as agreed for the select-based version: they are kept in storage, and a row that vanishes reads as a value that was lost. This is the first thing to reconsider with the section on screen — see Task 6.

- [ ] **Step 1: Add the strings**

In `src/strings.ts`, add to `en` (this file is not in alphabetical order; keep the `chrome_*` block together, after `anchor_anchored`):

```ts
    chrome: "Chrome",
    chrome_enabled: "Draw a chrome",
    chrome_radius: "Radius",
    chrome_opacity: "Opacity",
    chrome_content_ratio: "Content",
```

and to `fr`:

```ts
    chrome: "Habillage",
    chrome_enabled: "Dessiner un habillage",
    chrome_radius: "Rayon",
    chrome_opacity: "Opacité",
    chrome_content_ratio: "Contenu",
```

The theme's own four labels are **not** ours. The map card carries this exact option under this exact name:

```
ui.panel.lovelace.editor.card.map.theme_mode          Theme mode / Mode du thème
ui.panel.lovelace.editor.card.map.theme_modes.{…}     Auto / Light|Clair / Dark|Sombre
```

Behind one helper each, so the English fallback is written once rather than at every call site:

```ts
const THEME_KEY = "ui.panel.lovelace.editor.card.map";
const THEME_FALLBACK = { auto: "Auto", light: "Light", dark: "Dark" } as const;

const themeModeLabel = (localize: LocalizeFunc, value: keyof typeof THEME_FALLBACK): string =>
  localize(`${THEME_KEY}.theme_modes.${value}`) || THEME_FALLBACK[value];

export const themeModeTitle = (localize: LocalizeFunc): string =>
  localize(`${THEME_KEY}.theme_mode`) || "Theme mode";
```

**This works on a dashboard that has no map card.** A translation fragment is per panel, not per card: `loadFragmentTranslation("lovelace")` fetches one JSON per language holding every Lovelace key, every card editor's included. Card *chunks* load lazily; their translations do not. The proof is already in this file — the labels it reads today come from `ui.panel.lovelace.editor.card.generic.*` and `…badge.entity.*`, the same fragment, and they render in French with no "generic" card anywhere.

The identically-worded `ui.panel.profile.themes.dark_mode.*` was the other candidate and the more durable name, rejected on availability: it lives in the `profile` fragment, and `loadFragmentTranslation` is called with exactly three names — `config`, `lovelace`, `energy`. Never `profile`.

- [ ] **Step 2: Write the failing form tests**

Add to `src/tests/editor/element-form.test.ts`, following the file's existing import list and helpers:

```ts
describe("chrome fields", () => {
  it("flattens the chrome into the form data", () => {
    const data = toFormData({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      chrome: { theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 },
    });
    expect(data.chrome_enabled).toBe(true);
    expect(data.chrome_theme).toBe("dark");
    expect(data.chrome_radius).toBe(12);
    expect(data.chrome_opacity).toBe(0.8);
    expect(data.chrome_content_ratio).toBe(0.5);
    expect(data).not.toHaveProperty("chrome");
  });

  it("flattens the defaults when the element has no chrome", () => {
    const data = toFormData({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    expect(data.chrome_enabled).toBe(false);
    expect(data.chrome_radius).toBe(50);
    expect(data.chrome_opacity).toBe(1);
    expect(data.chrome_content_ratio).toBe(0.6);
  });

  it("shows auto in the theme control while the box is unchecked — none is never offered", () => {
    const data = toFormData({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    expect(data.chrome_theme).toBe("auto");
  });

  it("turns the box on into the auto surface", () => {
    const config = { type: "state-icon", size: DEFAULT_ICON_SIZE } as StateIconConfig;
    const next = fromFormData(config, { ...toFormData(config), chrome_enabled: true });
    expect(next.chrome).toEqual({
      theme: "auto",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("rebuilds the chrome from the flat record", () => {
    const config = { type: "state-icon", size: DEFAULT_ICON_SIZE } as StateIconConfig;
    const next = fromFormData(config, {
      ...toFormData(config),
      chrome_enabled: true,
      chrome_theme: "dark",
      chrome_radius: 8,
    });
    expect(next.chrome).toEqual({
      theme: "dark",
      radius: 8,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("keeps every number when the box is unchecked", () => {
    const config = {
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      chrome: { theme: "dark", radius: 8, opacity: 0.5, content_ratio: 0.4 },
    } as StateIconConfig;
    const next = fromFormData(config, { ...toFormData(config), chrome_enabled: false });
    expect(next.chrome).toEqual({
      theme: "none",
      radius: 8,
      opacity: 0.5,
      content_ratio: 0.4,
    });
  });
});

describe("the chrome schema", () => {
  const localize = ((key: string) => key) as never;

  it("offers the three drawing themes and never none", () => {
    const options = JSON.stringify(chromeSchema(localize, false));
    expect(options).toContain("auto");
    expect(options).toContain("light");
    expect(options).toContain("dark");
    expect(options).not.toContain('"none"');
  });

  it("drops the theme field when the radio group renders it", () => {
    expect(JSON.stringify(chromeSchema(localize, true))).not.toContain("chrome_theme");
  });

  it("shows the three numbers either way — they are kept, not lost", () => {
    for (const available of [true, false]) {
      const json = JSON.stringify(chromeSchema(localize, available));
      expect(json).toContain("chrome_radius");
      expect(json).toContain("chrome_opacity");
      expect(json).toContain("chrome_content_ratio");
    }
  });

  it("puts the toggle in its own schema, so it can be rendered above the theme", () => {
    expect(JSON.stringify(chromeToggleSchema())).toContain("chrome_enabled");
  });
});

describe("the theme mode labels", () => {
  it("takes Home Assistant's own wording for this option", () => {
    const localize = ((key: string) =>
      key === "ui.panel.lovelace.editor.card.map.theme_mode" ? "Mode du thème" : "") as never;
    expect(themeModeTitle(localize)).toBe("Mode du thème");
  });

  it("falls back to English if the key ever goes away", () => {
    expect(themeModeTitle((() => "") as never)).toBe("Theme mode");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test src/tests/editor/element-form.test.ts`
Expected: FAIL — `chrome_theme` undefined, and `stateIconSchema` takes no arguments.

- [ ] **Step 4: Extend the two converters**

`toFormData` becomes:

```ts
toFormData = (config: StateIconConfig): Record<string, unknown> => {
  const { size, chrome, ...rest } = config;
  const c = chrome ?? DEFAULT_CHROME;
  return {
    ...rest,
    size_mode: size.mode,
    size_min: size.min,
    size_ratio: size.ratio,
    size_max: size.max,
    size_value: size.value,
    chrome_enabled: c.theme !== "none",
    // The control never offers "none", so an off chrome pre-selects the theme
    // that checking the box will give it.
    chrome_theme: c.theme === "none" ? "auto" : c.theme,
    chrome_radius: c.radius,
    chrome_opacity: c.opacity,
    chrome_content_ratio: c.content_ratio,
  };
};
```

`fromFormData` destructures the four new fields alongside the five size ones and rebuilds the record. Its existing comment about `.data` having to be the complete flat record now covers nine fields rather than five — extend it rather than leaving it saying "five":

```ts
  const {
    size_mode,
    size_min,
    size_ratio,
    size_max,
    size_value,
    chrome_enabled,
    chrome_theme,
    chrome_radius,
    chrome_opacity,
    chrome_content_ratio,
    ...rest
  } = data;
  return {
    ...(rest as Omit<StateIconConfig, "type" | "size" | "chrome">),
    type: config.type,
    size: normalizeIconSize({ ... }),   // unchanged
    chrome: normalizeChrome({
      // The checkbox is the switch; the theme control only ever names a surface
      // that draws. Unchecking stores "none" and every number survives it.
      theme: chrome_enabled ? (chrome_theme ?? "auto") : "none",
      radius: chrome_radius,
      opacity: chrome_opacity,
      content_ratio: chrome_content_ratio,
    }),
  };
```

Add the import:

```ts
import { DEFAULT_CHROME, normalizeChrome } from "../chrome";
```

- [ ] **Step 5: Write the two schema factories**

Add these beside `stateIconSizeSchema`, which they are modelled on. `stateIconSchema` is **not** touched.

```ts
/** The checkbox, alone, so the theme control can be rendered between it and the numbers. */
export const chromeToggleSchema = (): unknown[] => [
  { name: "chrome_enabled", selector: { boolean: {} } },
];

export const chromeSchema = (
  localize: LocalizeFunc,
  // When true, the caller renders ha-radio-group for the theme and the schema
  // omits chrome_theme. When false, the select stays so the theme is still
  // changeable — ha-form is the guarantee that it renders.
  radioGroupAvailable = false,
): unknown[] => [
  ...(radioGroupAvailable
    ? []
    : [
        {
          name: "chrome_theme",
          selector: {
            select: {
              mode: "dropdown",
              options: (["auto", "light", "dark"] as const).map((value) => ({
                value,
                label: themeModeLabel(localize, value),
              })),
            },
          },
        },
      ]),
  {
    name: "",
    type: "grid",
    schema: [
      {
        name: "chrome_radius",
        selector: { number: { min: 0, max: 50, step: 1, unit_of_measurement: "%", mode: "box" } },
      },
      {
        name: "chrome_opacity",
        selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } },
      },
      {
        name: "chrome_content_ratio",
        // The model clamps to 0-1; the form starts at 0.1 because a ratio of
        // zero renders an invisible icon and nothing in the editor would
        // explain why. The form guides, the model tolerates.
        selector: { number: { min: 0.1, max: 1, step: 0.05, mode: "box" } },
      },
    ],
  },
];
```

`none` is absent from the options on purpose: the checkbox is what turns the chrome off, and offering the same decision twice invites the two to disagree.

- [ ] **Step 5b: Render the panel**

In `render`, between the main `ha-form` and the "Size and position" panel. `radioGroupAvailable` is already computed above in that method — reuse it, do not compute it twice:

```ts
      <ha-expansion-panel outlined>
        <ha-icon slot="leading-icon" icon="mdi:shape"></ha-icon>
        <div slot="header" role="heading" aria-level="3">
          ${localizeOwn(hass, "chrome")}
        </div>
        <div class="content">
          <ha-form
            .hass=${hass}
            .data=${toFormData(element)}
            .schema=${chromeToggleSchema()}
            .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
            @value-changed=${this._valueChanged}
          ></ha-form>
          ${
            radioGroupAvailable
              ? html`
                <span class="section-label">${themeModeTitle(hass.localize)}</span>
                <ha-radio-group
                  orientation="horizontal"
                  .value=${(toFormData(element).chrome_theme as string) ?? "auto"}
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
            .data=${toFormData(element)}
            .schema=${chromeSchema(hass.localize, radioGroupAvailable)}
            .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
            @value-changed=${this._valueChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
```

`themeModeLabel` and `themeModeTitle` are declared in this module and read by both the schema factory and this template, so `themeModeTitle` is exported for the tests and `themeModeLabel` need not be.

And the handler, a copy of `_modeChanged` with one field changed, placed beside it so the pair reads as one idea. Checking the theme also checks the box: choosing a surface is a way of asking for one.

```ts
  private _chromeThemeChanged = (ev: Event): void => {
    if (!this.element) return;
    const value = (ev.currentTarget as { value?: string }).value;
    if (!value) return;
    const data = { ...toFormData(this.element), chrome_theme: value, chrome_enabled: true };
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: fromFormData(this.element, data) },
        bubbles: true,
        composed: true,
      }),
    );
  };
```

- [ ] **Step 6: Label the new fields**

In `elementFormLabel`, before the generic fallback:

```ts
  if (name === "chrome_enabled") return localizeOwn(hass, "chrome_enabled");
  if (name === "chrome_radius") return localizeOwn(hass, "chrome_radius");
  if (name === "chrome_opacity") return localizeOwn(hass, "chrome_opacity");
  if (name === "chrome_content_ratio") return localizeOwn(hass, "chrome_content_ratio");
  if (name === "chrome_theme") return themeModeTitle(localize);
```

`chrome` itself is not here: it labels the panel's header, which the template writes directly.

- [ ] **Step 7: Cover the strings**

`src/tests/strings.test.ts` names its keys by hand — `StringKey` is `keyof en`, so a key missing from `fr` is not a type error and needs a test. Add, beside the existing `size_and_position` block:

Both tests must assert **the same five keys** — a pair that checks different sets is how a missing translation slips through the one that does not look for it.

```ts
describe("chrome strings", () => {
  const KEYS = ["chrome", "chrome_enabled", "chrome_radius", "chrome_opacity", "chrome_content_ratio"] as const;

  it("serves the section and its fields in English", () => {
    expect(KEYS.map((key) => localizeOwn(undefined, key))).toEqual([
      "Chrome",
      "Draw a chrome",
      "Radius",
      "Opacity",
      "Content",
    ]);
  });

  it("serves the same five in French", () => {
    const fr = hass({ language: "fr" });
    expect(KEYS.map((key) => localizeOwn(fr, key))).toEqual([
      "Habillage",
      "Dessiner un habillage",
      "Rayon",
      "Opacité",
      "Contenu",
    ]);
  });
});
```

- [ ] **Step 8: Run everything**

Run: `pnpm format && pnpm test && pnpm typecheck && pnpm build`
Expected: PASS. `pnpm build` is here because this is the last code task — the bundle must still be a single file.

- [ ] **Step 9: Commit**

```bash
git add src/strings.ts src/editor/element-form.ts src/tests/editor/element-form.test.ts src/tests/strings.test.ts
git commit -m "feat(chrome): the editor's Chrome section"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md` — the YAML reference block and a new subsection
- Modify: `CHANGELOG.md` — under the existing `unreleased` → `Added`

- [ ] **Step 1: Extend the README's element block**

In the `type: state-icon` item of the reference YAML, after the `size:` block:

```yaml
      chrome:                    # optional; absent means no chrome
        theme: none              # none | auto | light | dark
        radius: 50               # % of the box — 50 is a disc, 0 a square
        opacity: 1               # the surface's opacity, 0-1
        content_ratio: 0.6       # share of the box taken by the icon, 0-1
```

- [ ] **Step 2: Add the README subsection**

After the "Positions, anchors and sizes" subsection:

```markdown
#### Chrome

An icon drawn on a photograph competes with whatever the picture happens to
show. `chrome` gives it a surface to stand on instead.

`theme` is the switch as well as the choice. `none` — the default, and what an
absent `chrome` means — draws nothing. `auto` uses the same background your
dashboard's cards use, so the surface follows your theme. `light` and `dark`
force one or the other, which is what you want when the picture is dark and the
theme is not, or the reverse.

`radius` is a percentage of the box: `50` is a disc, `0` a square, anything
between a rounded square. `opacity` fades the surface only — the icon on it
keeps its own colour. `content_ratio` is the share of the box the icon takes:
`0.6` matches Home Assistant's own icons, and `1` makes the icon fill the box
entirely, which turns the chrome into a frame around an entity picture rather
than a disc behind it.

The numbers are kept when you switch the surface back to `none`, so trying a
chrome out and turning it off costs you nothing.

Note that `size` is the size of the whole thing: switching a chrome on does not
make an item bigger, it makes the icon inside it smaller. Nothing else about the
item changes — where it sits, how it drags and what it does when clicked are the
same with or without a surface.
```

- [ ] **Step 3: Add the CHANGELOG entry**

Under `## unreleased` → `### Added`, after the visibility entry:

```markdown
- **A chrome behind an icon.** A `state-icon` element can now stand on its own
  surface — a disc by default, or any rounded shape — so an icon placed on a
  busy photograph reads against something instead of against the picture. The
  surface follows your theme, or can be forced light or dark for a picture that
  disagrees with it, and its radius, opacity and the share of the box the icon
  takes are all settings. It is off unless you turn it on, so nothing in an
  existing dashboard changes.
```

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(chrome): the reference, and the release note"
```

---

### Task 6: The browser walk

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-icon-chrome-design.md` — append a Verification record, as `2026-08-13-state-icon-element-design.md` carries one

**This task is not optional and cannot be delegated to the suite.** happy-dom does no layout: nothing about `border-radius`, `overflow`, `filter`, `opacity` or the content ratio is observable there. Six real defects survived a green suite, a per-task review and a whole-branch review in 1.2.0, and every one was found in the browser within minutes.

- [ ] **Step 1: Build and serve**

Run: `pnpm build`, then bump the `?v=` on the dashboard resource at http://localhost:8123 (the repo's `dist/` is mounted at `/config/www/picture-studio-card/`). Start the container first with `pnpm ha:up` if it is not running.

- [ ] **Step 2: Walk the list**

On a card using `/local/demo/office-plan.jpg`, check each of:

- an icon with no `chrome` — pixel-identical to before, halo included;
- `theme: auto` in a light theme and in a dark one;
- `theme: light` and `theme: dark`, each against a light and a dark region of the picture;
- an entity with a picture at `content_ratio: 0.6` (a ring of surface around it) and at `1` (the chrome as its frame), with `radius: 8` on the second;
- `opacity: 0.5` — the surface fades, the icon does not;
- the smallest size the `clamp()` produces, to see whether the ratio leaves a legible glyph;
- dragging a chromed item to each edge — the bounds should feel exactly as they did before, since the box has not changed;
- clicking one — the whole disc is the target, not just the glyph.

- [ ] **Step 3: Answer the deferred questions**

Three, all of which need the thing on screen:

1. **The border.** With the rim in front of you: is a 1px border worth adding beside it? Record the verdict — either way — in the spec's "Room left for a border" section. If it is a yes, it is a new task, not a patch to this one.
2. **The section's layout.** Checkbox, then the theme on one line, then the numbers: does it read in that order, and is the toggle better as a row inside the panel or in the panel's header? (`ha-expansion-panel`'s header slots go leading-icon → header → event → chevron → icons; `event` is the one that lands before the chevron.)
3. **The numbers while the box is unchecked.** They are shown, on the argument that a row which vanishes reads as a value that was lost. Seen on screen, that may be the wrong call — three live-looking controls under an unchecked box is the other half of the same argument. Decide, and record it.

- [ ] **Step 4: Append the Verification record and commit**

```bash
git add docs/superpowers/specs/2026-08-14-icon-chrome-design.md
git commit -m "docs(chrome): the browser walk, and what it changed"
```

---

## After the plan

Full-branch review (capable tier), then `superpowers:finishing-a-development-branch`. The version bump to **1.3.0** lands with the merge, not before: `package.json` stays on 1.2.0 and the CHANGELOG heading reads `unreleased` until the user decides the release. The user pushes; the agent never does.
