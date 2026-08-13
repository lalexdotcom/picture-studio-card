# State-icon element — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second item family to `items[]` — `type: element` with
`config.type: state-icon` — an icon-only item that sizes itself from the card's
width instead of the viewport's.

**Architecture:** The card places, the element draws itself. The element wraps
Home Assistant's `state-badge` (icon, state colour, entity picture), sizes itself
with `clamp(<min>px, <ratio>cqw, <max>px)` against a container the card declares
on `.root`, and delegates gestures to HA's `action-handler` element and their
execution to HA's own `handleAction` through the `hass-action` event. Nothing of
the rendering, colouring or action semantics is reimplemented.

**Tech Stack:** TypeScript, Lit 3 (bundled, no decorators, `static properties`),
rslib single-file build, rstest + happy-dom, Biome.

**Spec:** `docs/superpowers/specs/2026-08-13-state-icon-element-design.md` — read
it before Task 1; it carries the reasoning this plan only applies.

## Global Constraints

- **Serena's symbolic tools are primary for code.** Built-in Read/Edit only for
  `.md`, JSON, YAML — see `AGENTS.md`.
- **No dynamic `import()`.** It once split the bundle and shipped a broken card.
- **No TypeScript decorators.** Lit components declare `static properties` and
  `declare` their fields.
- **Lit is bundled**, never read off a Home Assistant prototype.
- **Never invent a translation key.** Every `localize(...)` call carries a
  `|| "English fallback"`. Our own strings live in `src/strings.ts` and exist only
  where HA's catalogue has nothing.
- **`config` is opaque for badges, ours for elements.** Never read, validate or
  rewrite a badge's config; do all three for an element's.
- **HA version floor is 2026.5.0** in `hacs.json`. Task 10 may raise it; nothing
  else may.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`.
- Every task ends green on `pnpm test` **and** `pnpm typecheck`.

---

### Task 1: The size module

**Files:**
- Create: `src/element-size.ts`
- Test: `src/tests/element-size.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface IconSize { auto: boolean; min: number; ratio: number; max: number }`,
  `DEFAULT_ICON_SIZE: IconSize`, `normalizeIconSize(raw: unknown): IconSize`,
  `iconSizeCss(size: IconSize): string`.

The one rule that makes everything downstream simple: **when `auto` is true the
three numbers *are* the defaults.** `normalizeIconSize` enforces it, so
"is this the default size?" is just `size.auto`, the form never shows stale
numbers behind a checked switch, and unchecking the switch starts from values the
user can see.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/element-size.test.ts
import { describe, expect, it } from "@rstest/core";
import { DEFAULT_ICON_SIZE, iconSizeCss, normalizeIconSize } from "../element-size";

describe("normalizeIconSize", () => {
  it("defaults a missing size to auto", () => {
    expect(normalizeIconSize(undefined)).toEqual(DEFAULT_ICON_SIZE);
  });

  it("forces the defaults when auto is on, whatever the numbers say", () => {
    expect(normalizeIconSize({ auto: true, min: 10, ratio: 1, max: 20 })).toEqual(
      DEFAULT_ICON_SIZE,
    );
  });

  it("keeps the numbers when auto is off", () => {
    expect(normalizeIconSize({ auto: false, min: 10, ratio: 1, max: 20 })).toEqual({
      auto: false,
      min: 10,
      ratio: 1,
      max: 20,
    });
  });

  it("falls back per field on a non-finite number", () => {
    expect(normalizeIconSize({ auto: false, min: "x", ratio: Number.NaN })).toEqual({
      auto: false,
      min: DEFAULT_ICON_SIZE.min,
      ratio: DEFAULT_ICON_SIZE.ratio,
      max: DEFAULT_ICON_SIZE.max,
    });
  });

  it("reads a bare object with no auto key as auto", () => {
    expect(normalizeIconSize({ min: 10 })).toEqual(DEFAULT_ICON_SIZE);
  });
});

describe("iconSizeCss", () => {
  it("writes the clamp in px and cqw", () => {
    expect(iconSizeCss(DEFAULT_ICON_SIZE)).toBe("clamp(40px, 3.5cqw, 70px)");
  });

  it("writes a fixed size when min equals max", () => {
    expect(iconSizeCss({ auto: false, min: 48, ratio: 3.5, max: 48 })).toBe(
      "clamp(48px, 3.5cqw, 48px)",
    );
  });

  it("does not reorder min and max — clamp returns the minimum by CSS spec", () => {
    expect(iconSizeCss({ auto: false, min: 80, ratio: 3.5, max: 20 })).toBe(
      "clamp(80px, 3.5cqw, 20px)",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test element-size`
Expected: FAIL — `Cannot find module '../element-size'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/element-size.ts

/**
 * An icon's size, in the two halves of the contract: the card declares
 * `container-type: inline-size` on `.root`, the element derives this clamp.
 * `1cqw` is 1% of `.root`'s width, so the size follows the card — which `vw`,
 * following the window, cannot do in a sections view.
 */
export interface IconSize {
  auto: boolean;
  /** px */
  min: number;
  /** % of the card's width */
  ratio: number;
  /** px */
  max: number;
}

/** The production values this design starts from; tunable once measured. */
export const DEFAULT_ICON_SIZE: IconSize = { auto: true, min: 40, ratio: 3.5, max: 70 };

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Under `auto` the three numbers ARE the defaults. That single rule buys three
 * things: "is this the default?" is `size.auto`, the disabled fields in the form
 * never show numbers the card is not using, and unchecking the switch starts
 * from values the user just saw.
 */
export const normalizeIconSize = (raw: unknown): IconSize => {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_ICON_SIZE };
  const size = raw as Partial<Record<keyof IconSize, unknown>>;
  if (size.auto !== false) return { ...DEFAULT_ICON_SIZE };
  return {
    auto: false,
    min: finite(size.min, DEFAULT_ICON_SIZE.min),
    ratio: finite(size.ratio, DEFAULT_ICON_SIZE.ratio),
    max: finite(size.max, DEFAULT_ICON_SIZE.max),
  };
};

/**
 * `min > max` is left as written: CSS clamp() returns the minimum in that case,
 * and rejecting a value while the user is still typing it is worse than the
 * documented behaviour.
 */
export const iconSizeCss = (size: IconSize): string =>
  `clamp(${size.min}px, ${size.ratio}cqw, ${size.max}px)`;
```

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test element-size && pnpm typecheck && pnpm lint`
Expected: PASS, no diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/element-size.ts src/tests/element-size.test.ts
git commit -m "feat: icon size module, clamped against the card's width"
```

---

### Task 2: Item families in the config module

**Files:**
- Modify: `src/config.ts` (`PictureItem`, `normalizeConfig`, `storedConfig`, tags)
- Test: `src/tests/config.test.ts`

**Interfaces:**
- Consumes: `IconSize`, `DEFAULT_ICON_SIZE`, `normalizeIconSize` from `src/element-size`.
- Produces:
  - `type PictureItem = BadgeItem | ElementItem`
  - `interface BadgeItem { type: "badge"; position: Position; anchor: Anchor; config: BadgeConfig }`
  - `interface ElementItem { type: "element"; position: Position; anchor: Anchor; config: ElementConfig }`
  - `type ElementConfig = StateIconConfig`
  - `interface StateIconConfig { type: "state-icon"; entity?: string; icon?: string; color?: string; name?: string; show_entity_picture?: boolean; tap_action?: ActionConfig; hold_action?: ActionConfig; double_tap_action?: ActionConfig; size: IconSize }`
  - `ICON_TAG = "picture-studio-state-icon"`, `ELEMENT_FORM_TAG = "picture-studio-element-form"`

`ActionConfig` is not declared anywhere yet. Add it to `src/types.ts` alongside
the other hand-declared HA interfaces, deliberately loose — we never read its
contents, we only hand it back to Home Assistant:

```ts
export interface ActionConfig {
  action: string;
  [key: string]: unknown;
}
```

- [ ] **Step 1: Write the failing tests**

Three existing tests change meaning. Replace them, do not add beside them:

```ts
// src/tests/config.test.ts — replaces "defaults a missing item type to badge"
it("rejects an item with no type, naming the index and the accepted values", () => {
  expect(() =>
    normalizeConfig({
      type: CARD_TYPE,
      items: [{ config: { type: "entity" }, position: { top: 10, left: 20 } }],
    }),
  ).toThrow(/items\[0\].*"badge".*"element"/s);
});

// replaces "rejects an unsupported item type, naming the index"
it("rejects an unsupported item type, naming the index", () => {
  expect(() =>
    normalizeConfig({
      type: CARD_TYPE,
      items: [
        { type: "badge", config: { type: "entity" } },
        { type: "widget", config: {} },
      ],
    }),
  ).toThrow(/items\[1\]/);
});

// replaces "rejects an item whose config is missing" — it must now carry a type,
// otherwise it fails on the type before reaching the config check.
it("rejects an item whose config is missing", () => {
  expect(() =>
    normalizeConfig({ type: CARD_TYPE, items: [{ type: "badge", position: { top: 1, left: 2 } }] }),
  ).toThrow(/items\[0\]/);
});
```

New tests for the element family:

```ts
it("rejects an element whose config has no type", () => {
  expect(() =>
    normalizeConfig({ type: CARD_TYPE, items: [{ type: "element", config: {} }] }),
  ).toThrow(/items\[0\]\.config.*"state-icon"/s);
});

it("normalizes a state-icon element, defaulting anchor and size", () => {
  const out = normalizeConfig({
    type: CARD_TYPE,
    items: [{ type: "element", config: { type: "state-icon", entity: "light.a" } }],
  });
  expect(out.items[0]).toEqual({
    type: "element",
    position: { top: 50, left: 50 },
    anchor: "proportional",
    config: { type: "state-icon", entity: "light.a", size: DEFAULT_ICON_SIZE },
  });
});

it("accepts an element with no entity — a freshly added icon has none yet", () => {
  const out = normalizeConfig({
    type: CARD_TYPE,
    items: [{ type: "element", config: { type: "state-icon" } }],
  });
  expect((out.items[0]?.config as StateIconConfig).entity).toBeUndefined();
});

it("keeps keys it does not know inside an element config", () => {
  const out = normalizeConfig({
    type: CARD_TYPE,
    items: [{ type: "element", config: { type: "state-icon", future_key: 1 } }],
  });
  expect((out.items[0]?.config as Record<string, unknown>).future_key).toBe(1);
});

it("omits an auto size on the way out", () => {
  const config = normalizeConfig({
    type: CARD_TYPE,
    items: [{ type: "element", config: { type: "state-icon", entity: "light.a" } }],
  });
  const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
  expect(stored.items[0]?.config).toEqual({ type: "state-icon", entity: "light.a" });
});

it("writes a manual size on the way out", () => {
  const config = normalizeConfig({
    type: CARD_TYPE,
    items: [
      {
        type: "element",
        config: { type: "state-icon", size: { auto: false, min: 10, ratio: 1, max: 20 } },
      },
    ],
  });
  const stored = storedConfig(config) as { items: { config: Record<string, unknown> }[] };
  expect(stored.items[0]?.config.size).toEqual({ auto: false, min: 10, ratio: 1, max: 20 });
});
```

Import `DEFAULT_ICON_SIZE` and `type StateIconConfig` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test config`
Expected: FAIL — the three replaced tests fail on the old lenient behaviour, the
new ones on the missing `element` branch.

- [ ] **Step 3: Write the implementation**

Types, replacing the current `PictureItem` interface:

```ts
// src/config.ts
import { DEFAULT_ICON_SIZE, type IconSize, normalizeIconSize } from "./element-size";
import type { ActionConfig } from "./types";

interface ItemBase {
  position: Position;
  /**
   * What the coordinates are anchored to. Always set in memory; omitted from the
   * stored config at its default, so an existing YAML never gains a key it did
   * not have.
   */
  anchor: Anchor;
}

export interface BadgeItem extends ItemBase {
  type: "badge";
  /** A third party's payload: never read, validated, reordered or rewritten. */
  config: BadgeConfig;
}

export interface ElementItem extends ItemBase {
  type: "element";
  /** Ours: read, validated, defaulted. */
  config: ElementConfig;
}

export type PictureItem = BadgeItem | ElementItem;

export type ElementConfig = StateIconConfig;

export interface StateIconConfig {
  type: "state-icon";
  /** Optional: a freshly added icon has no entity until one is picked. */
  entity?: string;
  icon?: string;
  color?: string;
  name?: string;
  show_entity_picture?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  size: IconSize;
}
```

Tags, beside `CARD_TAG` and the others:

```ts
export const ICON_TAG = "picture-studio-state-icon";
export const ELEMENT_FORM_TAG = "picture-studio-element-form";
```

The element normalizer and the new `items.map` body:

```ts
const normalizeElementConfig = (raw: Record<string, unknown>, index: number): ElementConfig => {
  if (raw.type !== "state-icon") {
    throw new Error(`picture-studio: items[${index}].config must have a \`type\` — "state-icon"`);
  }
  // Unknown keys are kept, for the same reason an unreadable item raises instead
  // of vanishing: storedConfig rewrites the whole config on every editor commit,
  // so anything dropped here would be dropped from the user's YAML on the first
  // drag.
  return { ...raw, type: "state-icon", size: normalizeIconSize(raw.size) } as StateIconConfig;
};

const items = rawItems.map((entry, index): PictureItem => {
  if (!isRecord(entry)) {
    throw new Error(`picture-studio: items[${index}] must be an object`);
  }

  const type = entry.type;
  if (type !== "badge" && type !== "element") {
    throw new Error(`picture-studio: items[${index}] must have a \`type\` — "badge" or "element"`);
  }

  if (!isRecord(entry.config)) {
    throw new Error(`picture-studio: items[${index}] must have a \`config\` object`);
  }

  const position = normalizePosition(entry.position);
  const anchor = parseAnchor(entry.anchor);

  return type === "badge"
    ? { type, position, anchor, config: entry.config as BadgeConfig }
    : { type, position, anchor, config: normalizeElementConfig(entry.config, index) };
});
```

`storedConfig` drops an auto size — and only for elements, since a badge's config
is never touched:

```ts
export const storedConfig = (config: PictureStudioConfig): Record<string, unknown> => ({
  ...config,
  items: config.items.map((item) => {
    const stored: Record<string, unknown> = {
      ...item,
      position: storedPosition(item.position),
    };
    if (item.anchor === "proportional") delete stored.anchor;
    if (item.type === "element" && item.config.size.auto) {
      // Under auto the numbers are the defaults, so the key carries nothing: a
      // config that never unchecked the switch does not grow a `size:`.
      const { size: _size, ...rest } = item.config;
      stored.config = rest;
    }
    return stored;
  }),
});
```

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. `pnpm typecheck` will flag `src/editor/badge-items.ts` and
`src/card/picture-studio-card.ts` if the union broke an assumption — if it does,
**do not widen the types to silence it**; note the file and fix it in the task
that owns it (Task 6 for `badge-items.ts`). If it blocks compilation entirely,
the minimum is a narrowing `if (item.type === "badge")`, never an `as any`.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/types.ts src/tests/config.test.ts
git commit -m "feat: item families, with type now required"
```

---

### Task 3: The state-icon element — rendering and size

**Files:**
- Create: `src/card/state-icon-element.ts`
- Test: `src/tests/card/state-icon-element.test.ts`

**Interfaces:**
- Consumes: `StateIconConfig`, `ICON_TAG` from `src/config`; `iconSizeCss` from
  `src/element-size`.
- Produces: `class PictureStudioStateIcon extends LitElement` with
  `setConfig(config: StateIconConfig): void`, a `hass` accessor pair, and the
  `state-badge` child it renders. Registered under `ICON_TAG` in `src/index.ts`
  in Task 5.

`state-badge` is not defined under happy-dom, so it renders as an unknown
element — which is exactly what makes the test possible: Lit's `.prop=` bindings
land as JS properties we can read back.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/card/state-icon-element.test.ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioStateIcon } from "../../card/state-icon-element";
import { ICON_TAG, type StateIconConfig } from "../../config";
import { DEFAULT_ICON_SIZE } from "../../element-size";

if (!customElements.get(ICON_TAG)) customElements.define(ICON_TAG, PictureStudioStateIcon);

const mount = async (config: Partial<StateIconConfig>) => {
  const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
  el.setConfig({ type: "state-icon", size: DEFAULT_ICON_SIZE, ...config });
  el.hass = { states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } } } as never;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const badge = (el: PictureStudioStateIcon) =>
  el.shadowRoot?.querySelector("state-badge") as (HTMLElement & Record<string, unknown>) | null;

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-state-icon", () => {
  it("hands the entity's state object to state-badge", async () => {
    const el = await mount({ entity: "light.a" });
    expect((badge(el)?.stateObj as { entity_id: string }).entity_id).toBe("light.a");
  });

  it("renders with no entity — the state-badge draws its own missing marker", async () => {
    const el = await mount({});
    expect(badge(el)?.stateObj).toBeUndefined();
  });

  it("colours by state unless told otherwise", async () => {
    expect(badge(await mount({ entity: "light.a" }))?.color).toBe("state");
    expect(badge(await mount({ entity: "light.a", color: "red" }))?.color).toBe("red");
  });

  it("forces the icon with an empty overrideImage when the picture is off", async () => {
    expect(badge(await mount({ entity: "light.a" }))?.overrideImage).toBe("");
    expect(
      badge(await mount({ entity: "light.a", show_entity_picture: true }))?.overrideImage,
    ).toBeUndefined();
  });

  it("passes the icon override through", async () => {
    expect(badge(await mount({ icon: "mdi:lamp" }))?.overrideIcon).toBe("mdi:lamp");
  });

  it("writes the size as a custom property on the host", async () => {
    const el = await mount({ entity: "light.a", size: { auto: false, min: 10, ratio: 1, max: 20 } });
    expect(el.style.getPropertyValue("--psc-icon-size")).toBe("clamp(10px, 1cqw, 20px)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test state-icon-element`
Expected: FAIL — `Cannot find module '../../card/state-icon-element'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/card/state-icon-element.ts
import { css, html, LitElement, nothing } from "lit";
import type { StateIconConfig } from "../config";
import { iconSizeCss } from "../element-size";
import type { HomeAssistant } from "../types";

/**
 * An icon-only item. Home Assistant's `state-badge` — the disc at the left of an
 * entity row, not the Lovelace badge — already draws the state icon, colours it
 * by state including a light's real rgb_color and brightness, and shows the
 * entity picture. All this element adds is its size and, in Task 4, the action
 * relay.
 */
export class PictureStudioStateIcon extends LitElement {
  static properties = {
    _config: { state: true },
  };

  // No accessibility modifier, matching the rest of the codebase: TypeScript
  // requires it before `declare`, and the project writes neither.
  declare _config?: StateIconConfig;
  private _hass?: HomeAssistant;

  setConfig(config: StateIconConfig): void {
    this._config = config;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // Unlike the card, this element renders from hass on every tick: the state
    // object it hands to state-badge is what makes the icon follow the entity.
    this.requestUpdate("_config");
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;

    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;

    return html`
      <state-badge
        .hass=${this._hass}
        .stateObj=${stateObj}
        .overrideIcon=${config.icon}
        .color=${config.color ?? "state"}
        .overrideImage=${config.show_entity_picture ? undefined : ""}
      ></state-badge>
    `;
  }

  /** The host's own custom property, written after render rather than during it. */
  protected updated(): void {
    if (this._config) {
      this.style.setProperty("--psc-icon-size", iconSizeCss(this._config.size));
    }
  }

  static styles = css`
    :host {
      display: block;
      line-height: 0;
    }
    /* state-badge ships :host { width: 40px }, so the size has to drive the box
       as well as the glyph. One value, one visual footprint: a glyph and an
       entity picture occupy the same square. */
    state-badge {
      width: var(--psc-icon-size);
      height: var(--psc-icon-size);
      --mdc-icon-size: var(--psc-icon-size);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;
}
```

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test state-icon-element && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/card/state-icon-element.ts src/tests/card/state-icon-element.test.ts
git commit -m "feat: the state-icon element, sized from the card's width"
```

---

### Task 4: The action relay

**Files:**
- Modify: `src/card/state-icon-element.ts`
- Test: `src/tests/card/state-icon-element.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `PictureStudioStateIcon` from Task 3.
- Produces: `hasAction(action?: ActionConfig): boolean`, exported from
  `src/card/state-icon-element.ts` for its test.

Three links — detect, decide, execute — and we write none of them. `action-handler`
is a custom element with a `bind(element, options)` method; `hass-action` is an
event the root `<home-assistant>` hands to HA's own `handleAction`.

- [ ] **Step 1: Write the failing test**

```ts
// appended to src/tests/card/state-icon-element.test.ts
import { hasAction } from "../../card/state-icon-element";

class FakeActionHandler extends HTMLElement {
  binds: { element: HTMLElement; options: unknown }[] = [];
  bind(element: HTMLElement, options: unknown): void {
    this.binds.push({ element, options });
  }
}
if (!customElements.get("action-handler")) {
  customElements.define("action-handler", FakeActionHandler);
}

describe("hasAction", () => {
  it("counts an action that is set and is not none", () => {
    expect(hasAction(undefined)).toBe(false);
    expect(hasAction({ action: "none" })).toBe(false);
    expect(hasAction({ action: "toggle" })).toBe(true);
  });
});

describe("the action relay", () => {
  it("binds itself to the singleton action-handler, declaring its gestures", async () => {
    const el = await mount({
      entity: "light.a",
      hold_action: { action: "more-info" },
      double_tap_action: { action: "none" },
    });
    const handler = document.body.querySelector("action-handler") as FakeActionHandler;
    const bound = handler.binds.find((b) => b.element === el);
    expect(bound?.options).toEqual({ hasHold: true, hasDoubleClick: false });
  });

  it("relays an action event as hass-action carrying the item's config", async () => {
    const el = await mount({ entity: "light.a", tap_action: { action: "toggle" } });
    const seen: CustomEvent[] = [];
    document.body.addEventListener("hass-action", (ev) => seen.push(ev as CustomEvent));

    el.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.detail).toEqual({
      config: { type: "state-icon", size: DEFAULT_ICON_SIZE, entity: "light.a", tap_action: { action: "toggle" } },
      action: "tap",
    });
    expect(seen[0]?.composed).toBe(true);
  });

  it("stays silent when it has no config yet", async () => {
    const el = document.createElement(ICON_TAG) as PictureStudioStateIcon;
    document.body.append(el);
    const seen: Event[] = [];
    document.body.addEventListener("hass-action", (ev) => seen.push(ev));
    el.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test state-icon-element`
Expected: FAIL — `hasAction` is not exported and no `hass-action` is emitted.

- [ ] **Step 3: Write the implementation**

Add to `src/card/state-icon-element.ts`:

```ts
import type { ActionConfig } from "../types";

/** Home Assistant's own one-liner: an action counts when set and not "none". */
export const hasAction = (action?: ActionConfig): boolean =>
  action !== undefined && action.action !== "none";

interface ActionHandlerElement extends HTMLElement {
  bind?: (element: HTMLElement, options: { hasHold: boolean; hasDoubleClick: boolean }) => void;
}

/**
 * The singleton Home Assistant's internal actionHandler directive uses. The
 * directive is nothing but these three lines, so reproducing them borrows the
 * gesture detection — thresholds, finger travel, double-click window — instead
 * of reimplementing it.
 */
const actionHandler = (): ActionHandlerElement | undefined => {
  const existing = document.body.querySelector<ActionHandlerElement>("action-handler");
  if (existing) return existing;
  if (!customElements.get("action-handler")) return undefined;
  return document.body.appendChild(document.createElement("action-handler"));
};
```

In the class: a constructor listening for `action`, and a bind folded into the
`updated()` Task 3 wrote — **replace that method**, do not add a second one.

```ts
  constructor() {
    super();
    this.addEventListener("action", (ev: Event) => {
      const action = (ev as CustomEvent<{ action?: string }>).detail?.action;
      if (!action || !this._config) return;
      // hass-action is the event the root <home-assistant> hands to Home
      // Assistant's own handleAction — more-info, toggle, navigate, url,
      // perform-action, with the confirmation dialogs. Nothing in the frontend
      // fires it; it exists for third-party cards, which is what we are.
      this.dispatchEvent(
        new CustomEvent("hass-action", {
          detail: { config: this._config, action },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }

  protected updated(): void {
    const config = this._config;
    if (!config) return;
    this.style.setProperty("--psc-icon-size", iconSizeCss(config.size));

    const handler = actionHandler();
    if (handler?.bind) {
      handler.bind(this, {
        hasHold: hasAction(config.hold_action),
        hasDoubleClick: hasAction(config.double_tap_action),
      });
      return;
    }
    // Honest degradation: without the handler we lose hold and double-tap, not
    // the card. Bound once, hence the flag.
    if (this._clickFallback) return;
    this._clickFallback = true;
    this.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    });
  }
```

Declare `private _clickFallback = false;` beside the other fields.

Editing needs no code here: `.editing .item > *` already sets
`pointer-events: none` on this element, so the handler sees nothing while an item
is being dragged.

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test state-icon-element && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/card/state-icon-element.ts src/tests/card/state-icon-element.test.ts
git commit -m "feat: relay icon gestures to Home Assistant's own action handling"
```

---

### Task 5: Card wiring

**Files:**
- Modify: `src/card/picture-studio-card.ts` (`_syncBadges` → `_syncItems`, the
  rebuild key, `.root` styles)
- Modify: `src/index.ts` (register `ICON_TAG`)
- Modify: `src/tests/card/harness.ts` (a config with a mixed list)
- Test: `src/tests/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: `PictureStudioStateIcon`, `ICON_TAG`.
- Produces: `_syncItems` in place of `_syncBadges`; the card's children are now
  either a badge element or a `picture-studio-state-icon`, both answering
  `setConfig` and `hass`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/card/picture-studio-card.test.ts — new cases
import { ICON_TAG } from "../../config";

const MIXED = {
  type: CARD_TYPE,
  image: "/local/plan.png",
  items: [
    { type: "badge", config: { type: "entity", entity: "light.a" } },
    { type: "element", config: { type: "state-icon", entity: "light.b" } },
  ],
};

it("creates a badge through the helpers and an icon through our own tag", async () => {
  const card = await mountCard(MIXED);
  const items = Array.from(root(card).querySelectorAll(".item"));
  expect(items[0]?.firstElementChild?.tagName.toLowerCase()).toBe(FAKE_TAG);
  expect(items[1]?.firstElementChild?.tagName.toLowerCase()).toBe(ICON_TAG);
});

it("still configures only the background on mount", async () => {
  const card = await mountCard(MIXED);
  expect(background(card)?.setConfigCalls).toBe(1);
});

it("pushes hass to every child, whatever its family", async () => {
  const card = await mountCard(MIXED);
  card.hass = { states: {} } as never;
  const icon = root(card).querySelector(ICON_TAG) as { hass?: unknown };
  expect(icon.hass).toBeDefined();
  expect(badges(card)[0]?.hassAssignments).toBeGreaterThan(0);
});

it("rebuilds when a kind changes, not when another key does", async () => {
  const card = await mountCard(MIXED);
  const before = root(card).querySelector(ICON_TAG);

  card.setConfig({
    ...MIXED,
    items: [
      MIXED.items[0],
      { type: "element", config: { type: "state-icon", entity: "light.c" } },
    ],
  });
  await card.updateComplete;
  await flush();
  expect(root(card).querySelector(ICON_TAG)).toBe(before);
});
```

Import `flush`, `root`, `background`, `badges`, `FAKE_TAG` from the harness as the
existing tests do.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test picture-studio-card`
Expected: FAIL — the card creates every item through `createBadgeElement`, so the
second item is a `FAKE_TAG`.

- [ ] **Step 3: Write the implementation**

Rename `_syncBadges` to `_syncItems` with Serena's `rename_symbol` (it updates
the two call sites in `updated()` and their comment references), then change the
key and the creation branch:

```ts
  private async _syncItems(): Promise<void> {
    const layer = this._layer;
    const items = this._config?.items ?? [];
    if (!layer) return;

    // The family AND the kind: without the prefix, two icons and a typeless
    // badge would all key on "".
    const types = items.map((item) => `${item.type}:${String(item.config.type ?? "")}`);
    const sameShape =
      types.length === this._renderedTypes.length &&
      types.every((t, i) => t === this._renderedTypes[i]);

    if (!sameShape) {
      const helpers = await window.loadCardHelpers();
      layer.replaceChildren();
      this._elements = [];
      this._wrappers = [];

      items.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "item";
        wrapper.dataset.index = String(index);

        // The only branch the second family costs: our element answers setConfig
        // and hass exactly like a badge element, so every other path is shared.
        const child = this._createChild(item, helpers);
        if (this._hass) child.hass = this._hass;
        wrapper.append(child as unknown as HTMLElement);
        layer.append(wrapper);

        this._elements.push(child);
        this._wrappers.push(wrapper);
      });
      this._renderedTypes = types;
    } else {
      items.forEach((item, index) => {
        const child = this._elements[index];
        if (!child) return;
        child.setConfig(item.config);
        if (this._hass) child.hass = this._hass;
      });
    }

    this._applyPositions(items);
  }
```

The one new method, beside `_syncItems`. `_elements` is typed
`LovelaceBadgeElement[]` (`src/types.ts:63`) — that stays: the type names a
contract, `setConfig` plus a `hass` setter, which our element satisfies
structurally. Renaming it would touch six call sites to say the same thing.

```ts
  private _createChild(
    item: PictureItem,
    helpers: Awaited<ReturnType<typeof window.loadCardHelpers>>,
  ): LovelaceBadgeElement {
    if (item.type === "badge") return helpers.createBadgeElement(item.config);
    const el = document.createElement(ICON_TAG) as unknown as LovelaceBadgeElement;
    el.setConfig(item.config);
    return el;
  }
```

The `.root` rule — the card's half of the size contract:

```css
    /* .root holds only the background element in normal flow, so the drag
       surface matches the image's aspect ratio exactly.
       It is also the size container: an element's clamp is written in cqw, i.e.
       a percentage of THIS box. Without this declaration cqw silently falls back
       to the viewport, which is the very bug the element exists to fix. */
    .root {
      position: relative;
      container-type: inline-size;
    }
```

Register the tag in `src/index.ts` beside the others:

```ts
import { PictureStudioStateIcon } from "./card/state-icon-element";
// …
if (!customElements.get(ICON_TAG)) customElements.define(ICON_TAG, PictureStudioStateIcon);
```

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/card src/index.ts src/tests/card
git commit -m "feat: the card mounts both item families and declares the size container"
```

---

### Task 6: Element catalogue, row labels, and the items module rename

**Files:**
- Create: `src/editor/element-catalog.ts`
- Rename: `src/editor/badge-items.ts` → `src/editor/items.ts` (Serena `rename`)
- Rename: `src/tests/editor/badge-items.test.ts` → `src/tests/editor/items.test.ts`
- Modify: `src/editor/items.ts` (`addItem`, `replaceBadge` → `replaceConfig`, `rowLabel`)
- Create: `src/tests/editor/element-catalog.test.ts`

**Interfaces:**
- Consumes: `ElementConfig`, `PictureItem` from `src/config`.
- Produces:
  - `ELEMENT_KINDS = ["state-icon"] as const`
  - `elementCatalog(): { type: string }[]`
  - `elementLabel(localize: LocalizeFunc, type: string): string`
  - `stubElementConfig(type: string): ElementConfig`
  - `addItem(items: PictureItem[], item: NewItem): PictureItem[]` where
    `type NewItem = { type: "badge"; config: BadgeConfig } | { type: "element"; config: ElementConfig }`
  - `replaceConfig(items: PictureItem[], index: number, config: BadgeConfig | ElementConfig): PictureItem[]`
  - `rowLabel(item: PictureItem, states?: Record<string, HassEntity>): RowLabel` — unchanged signature

- [ ] **Step 1: Write the failing tests**

```ts
// src/tests/editor/element-catalog.test.ts
import { describe, expect, it } from "@rstest/core";
import { DEFAULT_ICON_SIZE } from "../../element-size";
import { elementCatalog, elementLabel, stubElementConfig } from "../../editor/element-catalog";

describe("elementCatalog", () => {
  it("offers the kinds we implement", () => {
    expect(elementCatalog()).toEqual([{ type: "state-icon" }]);
  });
});

describe("elementLabel", () => {
  it("reads Home Assistant's own element type label", () => {
    const localize = ((key: string) =>
      key === "ui.panel.lovelace.editor.card.picture-elements.element_types.state-icon"
        ? "Icône d'état"
        : "") as never;
    expect(elementLabel(localize, "state-icon")).toBe("Icône d'état");
  });

  it("falls back to the raw type when the catalogue is silent", () => {
    expect(elementLabel(((): string => "") as never, "state-icon")).toBe("state-icon");
  });
});

describe("stubElementConfig", () => {
  it("picks no entity — the form opens on the entity selector instead", () => {
    expect(stubElementConfig("state-icon")).toEqual({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
    });
  });
});
```

```ts
// src/tests/editor/items.test.ts — new cases beside the renamed ones
it("adds an element with the default position and anchor", () => {
  const out = addItem([], { type: "element", config: { type: "state-icon", size: DEFAULT_ICON_SIZE } });
  expect(out[0]).toEqual({
    type: "element",
    position: DEFAULT_POSITION,
    anchor: DEFAULT_ANCHOR,
    config: { type: "state-icon", size: DEFAULT_ICON_SIZE },
  });
});

describe("rowLabel for an element", () => {
  const icon = (config: Record<string, unknown>): PictureItem => ({
    type: "element",
    position: DEFAULT_POSITION,
    anchor: DEFAULT_ANCHOR,
    config: { type: "state-icon", size: DEFAULT_ICON_SIZE, ...config } as never,
  });

  it("prefers the entity's friendly name, keeping the id as the caption", () => {
    const states = { "light.a": { attributes: { friendly_name: "Lampe" } } } as never;
    expect(rowLabel(icon({ entity: "light.a" }), states)).toEqual({
      primary: "Lampe",
      secondary: "light.a",
    });
  });

  it("falls back to the kind when there is no entity yet", () => {
    expect(rowLabel(icon({}))).toEqual({ primary: "state-icon" });
  });

  it("ignores `name`, which may hold composed sentinels", () => {
    expect(rowLabel(icon({ name: "___device_name___", entity: "light.a" })).primary).toBe(
      "light.a",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test editor`
Expected: FAIL — no `element-catalog` module, `addItem` still takes a bare badge
config, `rowLabel` reads `name` for every family.

- [ ] **Step 3: Write the implementation**

```ts
// src/editor/element-catalog.ts
import type { ElementConfig } from "../config";
import { DEFAULT_ICON_SIZE } from "../element-size";
import type { LocalizeFunc } from "../types";

/** The kinds we implement. A new one is added here and nowhere else. */
export const ELEMENT_KINDS = ["state-icon"] as const;

export const elementCatalog = (): { type: string }[] =>
  ELEMENT_KINDS.map((type) => ({ type }));

/** Home Assistant already translates these, under picture-elements' own keys. */
export const elementLabel = (localize: LocalizeFunc, type: string): string =>
  localize(`ui.panel.lovelace.editor.card.picture-elements.element_types.${type}`) || type;

/**
 * No entity is chosen: a badge gets one from its class's getStubConfig, we have
 * no equivalent, and attaching an arbitrary entity to a new icon would be worse
 * than the state-badge's own missing marker while the user picks one.
 */
export const stubElementConfig = (type: string): ElementConfig => {
  if (type !== "state-icon") throw new Error(`picture-studio: unknown element type "${type}"`);
  return { type: "state-icon", size: { ...DEFAULT_ICON_SIZE } };
};
```

In `src/editor/items.ts`:

```ts
export type NewItem =
  | { type: "badge"; config: BadgeConfig }
  | { type: "element"; config: ElementConfig };

/** A new item lands centered and proportional, ready to be dragged. */
export const addItem = (items: PictureItem[], item: NewItem): PictureItem[] => [
  ...items,
  { ...item, position: { ...DEFAULT_POSITION }, anchor: DEFAULT_ANCHOR } as PictureItem,
];

export const replaceConfig = (
  items: PictureItem[],
  index: number,
  config: BadgeConfig | ElementConfig,
): PictureItem[] =>
  index < 0 || index >= items.length
    ? items
    : items.map((item, i) => (i === index ? ({ ...item, config } as PictureItem) : item));
```

`rowLabel` branches per family:

```ts
export const rowLabel = (item: PictureItem, states?: Record<string, HassEntity>): RowLabel => {
  const friendly = item.config.entity
    ? states?.[item.config.entity as string]?.attributes?.friendly_name
    : undefined;

  if (item.type === "element") {
    // `name` is deliberately not read: in composed mode it holds sentinels like
    // ___device_name___, which belong in a tooltip, not in a list row.
    const primary = friendly ?? item.config.entity ?? item.config.type;
    return item.config.entity && item.config.entity !== primary
      ? { primary, secondary: item.config.entity }
      : { primary };
  }

  const config = item.config as { entity?: string; type?: string; name?: string };
  const primary = config.name ?? friendly ?? config.entity ?? config.type ?? "badge";
  if (config.entity && config.entity !== primary) return { primary, secondary: config.entity };
  if (config.type && config.type !== primary) return { primary, secondary: config.type };
  return { primary };
};
```

Update the two call sites of `replaceBadge` and `addItem` in
`src/editor/picture-studio-editor.ts` so the build stays green; their behaviour
changes in Task 8.

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor src/tests/editor
git commit -m "feat: element catalogue, family-aware row labels, items module renamed"
```

---

### Task 7: The element form

**Files:**
- Create: `src/editor/element-form.ts`
- Modify: `src/strings.ts` (two keys)
- Test: `src/tests/editor/element-form.test.ts`
- Modify: `src/tests/strings.test.ts` if it asserts the key set

**Interfaces:**
- Consumes: `StateIconConfig`, `ELEMENT_FORM_TAG`, `Anchor`, `IconSize`,
  `DEFAULT_ICON_SIZE`, `normalizeIconSize`.
- Produces:
  - `stateIconSchema(localize: LocalizeFunc, auto: boolean): unknown[]`
  - `toFormData(config: StateIconConfig): Record<string, unknown>`
  - `fromFormData(config: StateIconConfig, data: Record<string, unknown>): StateIconConfig`
  - `elementFormLabel(localize: LocalizeFunc, hass: HomeAssistant | undefined, name: string): string`
  - `class PictureStudioElementForm` — props `hass`, `element: ElementConfig`,
    `anchor: Anchor`; emits `element-changed` with `{ element: ElementConfig }`,
    plus the existing `anchor-changed` and `go-back`.

`ha-form` is flat and `size` is not, hence the two mappers — the same shape Home
Assistant's own badge editor uses for `displayed_elements`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/editor/element-form.test.ts
import { describe, expect, it } from "@rstest/core";
import {
  elementFormLabel,
  fromFormData,
  stateIconSchema,
  toFormData,
} from "../../editor/element-form";
import { DEFAULT_ICON_SIZE } from "../../element-size";

const base = { type: "state-icon" as const, size: DEFAULT_ICON_SIZE };
const localize = ((key: string) => `L:${key}`) as never;

const find = (schema: unknown[], name: string): Record<string, unknown> | undefined => {
  for (const entry of schema as Record<string, unknown>[]) {
    if (entry.name === name) return entry;
    const nested = entry.schema as unknown[] | undefined;
    const hit = nested && find(nested, name);
    if (hit) return hit;
  }
  return undefined;
};

describe("stateIconSchema", () => {
  it("puts icon and colour on one row, then the name, then the picture", () => {
    const content = find(stateIconSchema(localize, true), "content");
    const names = (content?.schema as { name: string; schema?: { name: string }[] }[]).flatMap(
      (entry) => (entry.schema ? entry.schema.map((s) => s.name) : [entry.name]),
    );
    expect(names.slice(0, 4)).toEqual(["icon", "color", "name", "show_entity_picture"]);
  });

  it("disables the three size fields while auto is on", () => {
    expect(find(stateIconSchema(localize, true), "size_min")?.disabled).toBe(true);
    expect(find(stateIconSchema(localize, false), "size_min")?.disabled).toBe(false);
  });

  it("offers hold and double tap as optional actions", () => {
    expect(find(stateIconSchema(localize, true), "hold_action")).toBeDefined();
    expect(find(stateIconSchema(localize, true), "double_tap_action")).toBeDefined();
  });
});

describe("toFormData / fromFormData", () => {
  it("flattens the size into four fields", () => {
    expect(toFormData({ ...base, entity: "light.a" })).toEqual({
      type: "state-icon",
      entity: "light.a",
      auto_size: true,
      size_min: 40,
      size_ratio: 3.5,
      size_max: 70,
    });
  });

  it("round-trips a manual size", () => {
    const config = { ...base, size: { auto: false, min: 10, ratio: 1, max: 20 } };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("returns to the defaults when auto is checked again", () => {
    const config = { ...base, size: { auto: false, min: 10, ratio: 1, max: 20 } };
    const data = { ...toFormData(config), auto_size: true };
    expect(fromFormData(config, data).size).toEqual(DEFAULT_ICON_SIZE);
  });

  it("never lets a form field named type overwrite the kind", () => {
    expect(fromFormData(base, { ...toFormData(base), type: "nonsense" }).type).toBe("state-icon");
  });
});

describe("elementFormLabel", () => {
  it("uses Home Assistant's badge keys for colour and picture", () => {
    expect(elementFormLabel(localize, undefined, "color")).toBe(
      "L:ui.panel.lovelace.editor.badge.entity.color",
    );
  });

  it("uses the generic keys for everything Home Assistant knows", () => {
    expect(elementFormLabel(localize, undefined, "tap_action")).toBe(
      "L:ui.panel.lovelace.editor.card.generic.tap_action",
    );
  });

  it("uses ours only for the two the catalogue has not got", () => {
    expect(elementFormLabel((() => "") as never, undefined, "size_ratio")).toBe("Ratio");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test element-form`
Expected: FAIL — `Cannot find module '../../editor/element-form'`.

- [ ] **Step 3: Write the implementation**

Add to `src/strings.ts`, both languages:

```ts
  en: { /* … */ size: "Size", ratio: "Ratio" },
  fr: { /* … */ size: "Taille", ratio: "Ratio" },
```

```ts
// src/editor/element-form.ts
import { css, html, LitElement, nothing } from "lit";
import type { Anchor } from "../position";
import type { ElementConfig, StateIconConfig } from "../config";
import { DEFAULT_ICON_SIZE, normalizeIconSize } from "../element-size";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";

const BACK_PATH = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
/** mdiTextShort and mdiGestureTap, the icons Home Assistant puts on these sections. */
const CONTENT_PATH = "M4,9H20V11H4V9M4,13H14V15H4V13Z";
const ACTIONS_PATH =
  "M9,9H11V7.5A2.5,2.5 0 0,1 13.5,5A2.5,2.5 0 0,1 16,7.5V9H18A2,2 0 0,1 20,11V15H18.5A2.5,2.5 0 0,0 16,17.5A2.5,2.5 0 0,0 18.5,20H20V22H4V11A2,2 0 0,1 6,9H9Z";

export const stateIconSchema = (localize: LocalizeFunc, auto: boolean): unknown[] => [
  { name: "entity", selector: { entity: {} } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    iconPath: CONTENT_PATH,
    schema: [
      {
        name: "",
        type: "grid",
        schema: [
          { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
          {
            name: "color",
            selector: { ui_color: { default_color: "state", include_state: true } },
          },
        ],
      },
      { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
      { name: "show_entity_picture", selector: { boolean: {} } },
      { name: "auto_size", selector: { boolean: {} } },
      {
        name: "",
        type: "grid",
        schema: [
          {
            name: "size_min",
            selector: { number: { min: 8, max: 400, step: 1, unit_of_measurement: "px" } },
            disabled: auto,
          },
          {
            name: "size_ratio",
            selector: { number: { min: 0, max: 100, step: 0.1, unit_of_measurement: "%" } },
            disabled: auto,
          },
          {
            name: "size_max",
            selector: { number: { min: 8, max: 400, step: 1, unit_of_measurement: "px" } },
            disabled: auto,
          },
        ],
      },
    ],
  },
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    iconPath: ACTIONS_PATH,
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

export const toFormData = (config: StateIconConfig): Record<string, unknown> => {
  const { size, ...rest } = config;
  return {
    ...rest,
    auto_size: size.auto,
    size_min: size.min,
    size_ratio: size.ratio,
    size_max: size.max,
  };
};

export const fromFormData = (
  config: StateIconConfig,
  data: Record<string, unknown>,
): StateIconConfig => {
  const { auto_size, size_min, size_ratio, size_max, ...rest } = data;
  return {
    ...(rest as Omit<StateIconConfig, "type" | "size">),
    // The kind is ours, never the form's: a stray `type` field cannot rename it.
    type: config.type,
    size: normalizeIconSize({
      auto: auto_size !== false,
      min: size_min,
      ratio: size_ratio,
      max: size_max,
    }),
  };
};

/** Home Assistant's own mapping, plus the two keys its catalogue has not got. */
export const elementFormLabel = (
  localize: LocalizeFunc,
  hass: HomeAssistant | undefined,
  name: string,
): string => {
  if (name === "auto_size") return localize("ui.common.auto") || "Automatic";
  if (name === "size_min") return localize("ui.panel.lovelace.editor.card.generic.minimum") || "Minimum";
  if (name === "size_max") return localize("ui.panel.lovelace.editor.card.generic.maximum") || "Maximum";
  if (name === "size_ratio") return localizeOwn(hass, "ratio");
  if (name === "color" || name === "show_entity_picture") {
    return localize(`ui.panel.lovelace.editor.badge.entity.${name}`) || name;
  }
  return localize(`ui.panel.lovelace.editor.card.generic.${name}`) || name;
};
```

Then the component, mirroring `badge-form`'s shell — header with the back button,
the form, and the anchor picker at the root, displayed, not folded:

```ts
export class PictureStudioElementForm extends LitElement {
  static properties = {
    hass: { attribute: false },
    element: { attribute: false },
    anchor: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare element?: ElementConfig;
  declare anchor?: Anchor;

  private _valueChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    if (!this.element) return;
    this.dispatchEvent(
      new CustomEvent("element-changed", {
        detail: { element: fromFormData(this.element, ev.detail.value) },
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected render() {
    const element = this.element;
    const hass = this.hass;
    if (!element || !hass) return nothing;

    return html`
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          .path=${BACK_PATH}
          @click=${() =>
            this.dispatchEvent(new CustomEvent("go-back", { bubbles: true, composed: true }))}
        ></ha-icon-button>
        <span class="title">${element.type}</span>
      </div>
      <ha-form
        .hass=${hass}
        .data=${toFormData(element)}
        .schema=${stateIconSchema(hass.localize, element.size.auto)}
        .computeLabel=${(s: { name: string }) => elementFormLabel(hass.localize, hass, s.name)}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <picture-studio-anchor-picker
        .hass=${hass}
        .anchor=${this.anchor}
      ></picture-studio-anchor-picker>
    `;
  }

  static styles = css`
    .header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      margin-bottom: var(--ha-space-2);
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
    }
    ha-form {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
  `;
}
```

Register it in `src/index.ts` under `ELEMENT_FORM_TAG`, beside the other editor
tags.

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/element-form.ts src/strings.ts src/index.ts src/tests
git commit -m "feat: the state-icon form, on Home Assistant's own selectors"
```

---

### Task 8: The add menu and the editor hub

**Files:**
- Modify: `src/editor/badge-list.ts` (family-prefixed choices, the value encoding)
- Modify: `src/editor/picture-studio-editor.ts` (`_addItem`, form routing,
  `_elementChanged`)
- Test: `src/tests/editor/badge-list.test.ts` (create — none exists yet)

**Interfaces:**
- Consumes: `elementCatalog`, `elementLabel`, `stubElementConfig`, `addItem`,
  `replaceConfig`, `PictureStudioElementForm`.
- Produces: the `item-add` event now carries `{ family: "badge" | "element"; type: string }`.

The dropdown's `value` is a single string, and a badge type may itself contain a
colon (`custom:mushroom-template-badge`), so the family is split off at the
**first** colon and never with `String.split`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/editor/badge-list.test.ts
import { describe, expect, it } from "@rstest/core";
import { addChoices, splitChoiceValue } from "../../editor/badge-list";

const localize = ((key: string) =>
  ({
    "ui.panel.lovelace.editor.badges.name": "Badges",
    "ui.panel.lovelace.editor.card.picture-elements.elements": "Éléments",
    "ui.panel.lovelace.editor.badge.entity.name": "Entité",
    "ui.panel.lovelace.editor.card.picture-elements.element_types.state-icon": "Icône d'état",
  })[key] ?? "") as never;

describe("addChoices", () => {
  it("prefixes every entry with its family, badges first", () => {
    const choices = addChoices(localize, undefined);
    expect(choices[0]).toEqual({ value: "badge:entity", label: "Badges: Entité" });
    expect(choices.at(-1)).toEqual({
      value: "element:state-icon",
      label: "Éléments: Icône d'état",
    });
  });
});

describe("splitChoiceValue", () => {
  it("splits on the first colon only, so a custom badge type survives", () => {
    expect(splitChoiceValue("badge:custom:mushroom-template-badge")).toEqual({
      family: "badge",
      type: "custom:mushroom-template-badge",
    });
  });

  it("rejects a value with no family", () => {
    expect(splitChoiceValue("entity")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test badge-list`
Expected: FAIL — neither helper exists.

- [ ] **Step 3: Write the implementation**

In `src/editor/badge-list.ts`:

```ts
export interface AddChoice {
  value: string;
  label: string;
}

/**
 * One list, two families. The plural labels are Home Assistant's own, which is
 * why the prefix costs no string of ours; the separator is ": " in every
 * language, since the thin space French typography wants before a colon would
 * need a per-locale format string — the string this choice avoids.
 */
export const addChoices = (localize: LocalizeFunc, custom?: CustomBadgeEntry[]): AddChoice[] => {
  const badges = localize("ui.panel.lovelace.editor.badges.name") || "Badges";
  const elements = localize("ui.panel.lovelace.editor.card.picture-elements.elements") || "Elements";
  return [
    ...badgeCatalog(custom).map((c) => ({
      value: `badge:${c.type}`,
      label: `${badges}: ${choiceLabel(localize, c)}`,
    })),
    ...elementCatalog().map((c) => ({
      value: `element:${c.type}`,
      label: `${elements}: ${elementLabel(localize, c.type)}`,
    })),
  ];
};

/** Split on the FIRST colon: a badge type may hold one, as `custom:` does. */
export const splitChoiceValue = (
  value: string,
): { family: "badge" | "element"; type: string } | undefined => {
  const at = value.indexOf(":");
  if (at < 0) return undefined;
  const family = value.slice(0, at);
  if (family !== "badge" && family !== "element") return undefined;
  return { family, type: value.slice(at + 1) };
};
```

`_add` and the dropdown markup follow:

```ts
  private _add(ev: CustomEvent<{ item?: { value?: string } }>): void {
    const value = ev.detail?.item?.value;
    const choice = value ? splitChoiceValue(value) : undefined;
    if (choice) this._fire("item-add", choice);
  }
```

```ts
        ${addChoices(localize, window.customBadges).map(
          (c) => html`<ha-dropdown-item .value=${c.value}>${c.label}</ha-dropdown-item>`,
        )}
```

In `src/editor/picture-studio-editor.ts`, `_addBadge` becomes family-aware, and
`_badgeChanged` gains an element sibling:

```ts
  private _addItem = async (
    ev: CustomEvent<{ family: "badge" | "element"; type: string }>,
  ): Promise<void> => {
    const config = this._config;
    if (!config || !this.hass) return;
    const item =
      ev.detail.family === "badge"
        ? ({ type: "badge", config: await stubBadgeConfig(ev.detail.type, this.hass) } as const)
        : ({ type: "element", config: stubElementConfig(ev.detail.type) } as const);
    this._commit({ ...config, items: addItem(config.items, item) });
    // Open the new item's form straight away: a stub is rarely usable as-is —
    // an element's has no entity at all — and this is what the native picker does.
    this.select(config.items.length);
  };

  private _elementChanged = (ev: CustomEvent<{ element: ElementConfig }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: replaceConfig(config.items, this._editingIndex, ev.detail.element),
    });
  };
```

`render` routes on the family:

```ts
    if (editing) {
      return editing.type === "badge"
        ? html`
            <picture-studio-badge-form
              .hass=${hass}
              .badge=${editing.config}
              .anchor=${editing.anchor}
              @badge-changed=${this._badgeChanged}
              @anchor-changed=${this._anchorChanged}
              @go-back=${() => this.select(undefined)}
            ></picture-studio-badge-form>
          `
        : html`
            <picture-studio-element-form
              .hass=${hass}
              .element=${editing.config}
              .anchor=${editing.anchor}
              @element-changed=${this._elementChanged}
              @anchor-changed=${this._anchorChanged}
              @go-back=${() => this.select(undefined)}
            ></picture-studio-element-form>
          `;
    }
```

Rename the `@item-add=${this._addBadge}` binding to `this._addItem`, and
`_badgeChanged` keeps calling `replaceConfig`.

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/editor src/tests/editor
git commit -m "feat: add and edit elements from the editor"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

No test. This is the task where the published promise is corrected — the README
currently says `type` "defaults to `badge` when omitted", which stopped being
true in Task 2.

- [ ] **Step 1: Correct the README's item shape**

Replace the commented example around line 95 with both families, and drop the
"defaults to badge" note:

````markdown
```yaml
items:
  - type: badge                  # family discriminant; required
    config:
      type: entity               # any Lovelace badge config
      entity: sensor.temperature
    position:
      top: 30%     # see Position anchoring below
      left: 60%
    anchor: center               # optional; defaults to "proportional"

  - type: element                # the other family
    config:
      type: state-icon           # the only element kind so far
      entity: light.salon
      icon: mdi:floor-lamp       # optional; the entity's state icon otherwise
      color: state               # state | none | a theme colour name
      name: Lampe du salon       # optional; shown as a tooltip
      show_entity_picture: false
      tap_action: { action: more-info }
      size:
        auto: true               # false to set the three numbers below
        min: 40                  # px
        ratio: 3.5               # % of the card's width
        max: 70                  # px
    position:
      top: 45%
      left: 20%
```
````

- [ ] **Step 2: Document the sizing, where a reader will look for it**

Add a short section after the item shape:

````markdown
### Icon sizing

A `state-icon` sizes itself from **the card's width**, not the window's:
`clamp(min, ratio, max)` where the ratio is a percentage of the card. In a
sections view two cards of different widths therefore get different icon sizes,
which a `vw`-based size in `picture-elements` cannot do. Leave `auto` on to take
the defaults (40 px / 3.5 % / 70 px); set `min` and `max` to the same value for a
fixed size.
````

- [ ] **Step 3: Write the CHANGELOG entry**

Under a `## unreleased` heading — created if absent, and **not** dated, since the
release workflow refuses a heading still reading `unreleased`:

```markdown
## unreleased

### Added

- A second kind of item: `type: element` with `config.type: state-icon`. An icon
  that reflects an entity's state, sized from the card's width rather than the
  window's, with the entity badge's own controls — icon, colour, name as a
  tooltip, entity picture — and tap, hold and double-tap actions.

### Changed

- `type` is now **required** on every item in `items[]`. It used to default to
  `badge` when omitted; with a second family that default is ambiguous. A config
  written by the editor already carries it, so only hand-written YAML is
  affected, and it now fails with a message naming the accepted values rather
  than being silently read as a badge.
```

- [ ] **Step 4: Verify nothing else claims the old behaviour**

Run: `grep -rn "defaults to \"badge\"\|defaults to badge" README.md docs/`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: the element family, icon sizing, and the required type"
```

---

### Task 10: Browser verification

**Files:**
- Modify: `hacs.json` — only if row 4 demands it
- Modify: `docs/superpowers/specs/2026-08-13-state-icon-element-design.md` —
  record what was observed

No unit test can settle any of this. happy-dom does no layout, so neither the
`clamp()`, nor `cqw`, nor the pointer muting while editing is observable there.
This project has twice had a mechanism reviewed correct that rested on a false
premise about Home Assistant; the rule is to go and get evidence.

- [ ] **Step 1: Build and load the card**

```bash
pnpm build && pnpm ha:up
```

Then bump the resource's cache-buster in the dashboard resource URL
(`/local/picture-studio/picture-studio.js?v=N`) and hard-reload.

- [ ] **Step 2: Settle the version floor without the browser**

Read the frontend build pinned in HA core's
`homeassistant/components/frontend/manifest.json` at tags `2026.5.0`, `2026.6.0`,
`2026.7.0`, then read that frontend's source for `formatEntityName` on the hass
object. Both are plain `raw.githubusercontent.com` fetches, no auth.

If it appeared after 2026.5, either raise `minimum_home_assistant_version` in
`hacs.json` to the version that has it, or fall back to the raw name when it is
absent — and write down which, and why, in the spec.

- [ ] **Step 3: Walk the ten rows**

Check each in the local Home Assistant, in **both** a masonry view and a sections
view:

1. `hass-action` reaches the root and executes — more-info **and** toggle.
2. `action-handler` is defined after `loadCardHelpers`; hold and double-tap fire.
3. `overrideImage: ""` forces the icon; `show_entity_picture: true` shows a
   person's photo (HA serves `/static/images/logo_nabu_casa.png` if no entity has
   a picture).
4. `hass.formatEntityName` resolves a composed name into the tooltip.
5. `state-badge` is defined with no preloading of ours.
6. `cqw` resolves against `.root`: two cards of different column widths in a
   sections view show different icon sizes. **This is the feature.**
7. `entity_name`, `ui_color`, `ui_action` and `optional_actions` all render in the
   form.
8. `disabled` really greys the three size fields, and un-greys them.
9. The drag bounds correctly around an icon, and re-anchoring still lands where
   it should.
10. Clicking an icon in the edit preview toggles nothing.

- [ ] **Step 4: Record the outcome**

Append a "Verified in the browser" section to the spec: what held, what did not,
and which fallback was taken. A row that failed and was worked around is worth
more written down than a row that passed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-13-state-icon-element-design.md hacs.json
git commit -m "docs: browser verification of the state-icon element"
```

---

## Closing the branch

Nothing above bumps `package.json`. Per `AGENTS.md`, the version bump lands with
the release and is the user's call — **ask, do not decide**. Until then the
CHANGELOG heading stays `unreleased` and `package.json` names 1.1.0, which is
also what keeps the release workflow's no-op path green.

Before proposing a merge: `pnpm test`, `pnpm typecheck`, `pnpm lint` and
`pnpm build` all green, and `git status` clean.
