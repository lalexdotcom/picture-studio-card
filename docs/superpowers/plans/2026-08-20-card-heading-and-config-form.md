# Card heading and config form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the card a header carrying a title, an icon and Home Assistant's heading badges, and redraw the editor as five collapsible sections so every config key is reachable from the interface.

**Architecture:** The header reuses `hui-heading-badge` for rendering and `hui-heading-badges-editor` for configuration — both Home Assistant components, reached by tag; only the header's layout CSS is copied. The editor becomes five uniform panels of our own, each holding a flat `ha-form`, with each section's data builder and drop list derived from the schema it actually rendered so a conditional field cannot desynchronise them.

**Tech Stack:** TypeScript, Lit 3 (no decorators), rstest + happy-dom, biome, rslib. Home Assistant frontend build 20260729.6, floor 2026.6.0 (build 20260527.4).

**Spec:**
- [`docs/superpowers/specs/2026-08-20-config-form-design.md`](../specs/2026-08-20-config-form-design.md)
- [`docs/superpowers/specs/2026-08-19-card-heading-design.md`](../specs/2026-08-19-card-heading-design.md)

## Global Constraints

- **Home Assistant floor is 2026.6.0**, frontend build `20260527.4`. Every mechanism used here was diffed against it and is identical. Do not raise the floor.
- **Serena's symbolic tools are primary for code.** Built-in Read/Edit only on `.md`, JSON, YAML.
- **No decorators, no dynamic `import()`, single-file build.** Lit is bundled. Components declare `static properties` and `declare` their fields, as every existing component does.
- **`ha-form` merges the changed field onto the whole `.data` it was given**, so each `ha-form` instance must always receive a complete flat record for its own section.
- **An undefined custom element renders nothing at all, silently.** Every Home Assistant tag created by name is guarded with `customElements.get`.
- **The background config is forwarded verbatim.** `BACKGROUND_KEYS` hands it to `hui-image-element` untouched; nothing in this plan reads, validates or rewrites a background value. The `picture_entity` dispatch writes *keys*, never rewrites a value a user typed.
- **`vi` is not exported by `@rstest/core`.** Spies and timers go through the `rstest` object.
- **A Lit property binding is a JS property, not an attribute.** Assert `(el as {icon?: string}).icon`, never `getAttribute("icon")`, for `.icon=${…}` bindings.
- **`cssRules` in `src/tests/card/harness.ts` must be handed the component's `styles` array**, not a single `CSSResult`.
- **Run every new test against the defect before keeping it, and record the failure text.** A green test that has never been red guards nothing.
- **happy-dom does no layout.** Nothing about max-height, overflow, sortable autoscroll, flex resolution or the header's geometry is observable in the suite. Those are browser-walk items, listed in Task 10.
- **Commit after every task.** Never `git push`.
- **`pnpm lint` exits 0 on a clean tree but prints 27 warnings and 1 info** (measured at `44ef06f`). The bar is the exit code. Use `--max-diagnostics=100` to see them all.

---

## File Structure

**Created**

| file | responsibility |
|---|---|
| `src/card/card-heading.ts` | `picture-studio-heading`: the header element — title, icon, heading badges, and the copied layout CSS |
| `src/editor/section-panel.ts` | `picture-studio-section`: the one panel shape every section uses |
| `src/editor/form-section.ts` | generic schema→data and schema→merge machinery, plus the shared label routing |
| `src/editor/form-schemas.ts` | the four section schemas and the `picture_entity` dispatch |
| `src/editor/heading-section.ts` | `picture-studio-heading-section`: the Heading panel's contents, including the badge list |
| `src/tests/card/card-heading.test.ts` | |
| `src/tests/editor/section-panel.test.ts` | |
| `src/tests/editor/form-section.test.ts` | |
| `src/tests/editor/form-schemas.test.ts` | |
| `src/tests/editor/heading-section.test.ts` | |

**Modified**

| file | change |
|---|---|
| `src/config.ts` | `HeadingConfig`, the `title` → `heading.title` migration, `storedConfig`'s heading branch, three new tag constants |
| `src/card/picture-studio-card.ts` | render the header above `.root`, drop `.header` on `ha-card` |
| `src/editor/picture-studio-editor.ts` | compose the five sections; four `ha-form` instances instead of one |
| `src/editor/badge-list.ts` | live inside a section: count badge, max-height wrapper |
| `src/strings.ts` | four new strings, en + fr |
| `README.md` | the `heading` block, the `person` correction, delete the YAML-only sentence |
| `CHANGELOG.md` | the `unreleased` entry |

**Deleted**

| file | replaced by |
|---|---|
| `src/editor/background-schema.ts` | `form-section.ts` + `form-schemas.ts` |
| `src/tests/editor/background-schema.test.ts` | `form-section.test.ts` + `form-schemas.test.ts` |

---

### Task 1: `heading` in the config, and the migration from `title`

**Files:**
- Modify: `src/config.ts`
- Test: `src/tests/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface HeadingConfig { title?: string; icon?: string; badges?: unknown[] }`; `PictureStudioConfig.heading?: HeadingConfig`; `hasHeading(heading: HeadingConfig | undefined): boolean`; the tag constants `HEADING_TAG = "picture-studio-heading"`, `SECTION_TAG = "picture-studio-section"`, `HEADING_SECTION_TAG = "picture-studio-heading-section"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/config.test.ts`:

```ts
describe("heading", () => {
  it("migrates a legacy top-level title into heading.title", () => {
    const config = normalizeConfig({ type: CARD_TYPE, title: "Office", items: [] });
    expect(config.heading).toEqual({ title: "Office" });
    expect((config as Record<string, unknown>).title).toBeUndefined();
  });

  it("lets an existing heading.title win over a legacy title", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      title: "old",
      heading: { title: "new" },
      items: [],
    });
    expect(config.heading).toEqual({ title: "new" });
  });

  it("drops the legacy key even when heading has no title", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      title: "Office",
      heading: { icon: "mdi:desk" },
      items: [],
    });
    expect(config.heading).toEqual({ icon: "mdi:desk", title: "Office" });
  });

  it("keeps a non-record heading out of the way", () => {
    const config = normalizeConfig({ type: CARD_TYPE, heading: "nope", items: [] });
    expect(config.heading).toBeUndefined();
  });

  it("does not write an empty heading back", () => {
    const stored = storedConfig(normalizeConfig({ type: CARD_TYPE, heading: {}, items: [] }));
    expect("heading" in stored).toBe(false);
  });

  it("writes a heading that carries something", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, heading: { title: "Office" }, items: [] }),
    );
    expect(stored.heading).toEqual({ title: "Office" });
  });

  it("never writes the legacy title back", () => {
    const stored = storedConfig(normalizeConfig({ type: CARD_TYPE, title: "Office", items: [] }));
    expect("title" in stored).toBe(false);
  });
});

describe("hasHeading", () => {
  it("is false for undefined and for an empty record", () => {
    expect(hasHeading(undefined)).toBe(false);
    expect(hasHeading({})).toBe(false);
  });

  it("is true when any of the three carries something", () => {
    expect(hasHeading({ title: "x" })).toBe(true);
    expect(hasHeading({ icon: "mdi:desk" })).toBe(true);
    expect(hasHeading({ badges: [{ type: "entity" }] })).toBe(true);
  });

  it("is false for an empty badge list", () => {
    expect(hasHeading({ badges: [] })).toBe(false);
  });
});
```

Add `hasHeading` to the file's existing import from `../config`.

- [ ] **Step 2: Run the tests and record the failure**

Run: `pnpm test src/tests/config.test.ts`
Expected: FAIL — `hasHeading is not a function`, and the heading assertions receive `undefined`. Paste the failure text into the task's notes before continuing.

- [ ] **Step 3: Add the types and the tag constants**

In `src/config.ts`, beside the other tag constants:

```ts
export const HEADING_TAG = "picture-studio-heading";
export const SECTION_TAG = "picture-studio-section";
export const HEADING_SECTION_TAG = "picture-studio-heading-section";
```

Beside `PictureStudioConfig`:

```ts
/**
 * The card's header. `badges` is opaque third-party config, exactly like a badge
 * item's: never read, validated or rewritten. Home Assistant's own
 * `hui-heading-badge` renders an entry it cannot build as an error badge, so
 * there is nothing here for us to catch.
 */
export interface HeadingConfig {
  title?: string;
  icon?: string;
  badges?: unknown[];
}

/** Does the header have anything to draw? Three keys, any one of them is enough. */
export const hasHeading = (heading: HeadingConfig | undefined): boolean =>
  !!(heading?.title || heading?.icon || heading?.badges?.length);
```

In `PictureStudioConfig`, replace the `title?: string` member with:

```ts
  /** Since 1.5.0. A legacy top-level `title` is folded in here at normalization. */
  heading?: HeadingConfig;
```

- [ ] **Step 4: Migrate at normalization**

In `normalizeConfig`, replace the final `return` with:

```ts
  const record = raw as Record<string, unknown>;
  // `title` lived at the top level from 1.0.0 to 1.4.x. Read it, fold it in, and
  // drop it — Home Assistant's own migrateHeadingCardConfig does exactly this for
  // the heading card's legacy `entities`. Because storedConfig rewrites the whole
  // config on every editor commit, the migration lands in the user's YAML the
  // first time they open the editor; a config never opened keeps rendering.
  const { title, heading: rawHeading, ...rest } = record;
  const heading: HeadingConfig = isRecord(rawHeading) ? { ...(rawHeading as HeadingConfig) } : {};
  if (heading.title === undefined && typeof title === "string") heading.title = title;

  return {
    ...rest,
    ...(hasHeading(heading) ? { heading } : {}),
    items,
  } as PictureStudioConfig;
```

- [ ] **Step 5: Keep `storedConfig` from writing an empty heading**

`storedConfig` spreads `config`, so a `heading` present in memory is written as-is and an absent one stays absent — which Step 4 already guarantees, since `normalizeConfig` only sets the key when `hasHeading` is true. Add the comment that says so, above the spread in `storedConfig`:

```ts
  // `heading` needs no guard here: normalizeConfig only ever sets the key when
  // hasHeading() is true, so an empty one never reaches memory in the first place.
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test src/tests/config.test.ts`
Expected: PASS, and every pre-existing test in the file still passes.

- [ ] **Step 7: Typecheck, lint, full suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: `tsc` clean, lint exit 0. Compile errors will point at every reader of `config.title` — there is exactly one, `src/card/picture-studio-card.ts:611`, and Task 2 replaces it. Until then, change that line to `.header=${this._config.heading?.title}` so the tree stays green.

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/tests/config.test.ts src/card/picture-studio-card.ts
git commit -m "feat(config): move the card title into a heading block

A top-level title is folded into heading.title at normalization and the
legacy key dropped, so an existing config keeps rendering and migrates the
first time its editor is opened."
```

---

### Task 2: The card's header

**Files:**
- Create: `src/card/card-heading.ts`
- Modify: `src/card/picture-studio-card.ts`
- Test: `src/tests/card/card-heading.test.ts`

**Interfaces:**
- Consumes: `HeadingConfig`, `hasHeading`, `HEADING_TAG` from Task 1.
- Produces: `class PictureStudioHeading extends LitElement` with properties `hass?: HomeAssistant`, `heading?: HeadingConfig`, `preview: boolean`; registered as `HEADING_TAG` in `src/index.ts`'s registration path alongside the other components.

- [ ] **Step 1: Write the failing test**

Create `src/tests/card/card-heading.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from "@rstest/core";
import { HEADING_TAG } from "../../config";
import { PictureStudioHeading } from "../../card/card-heading";
import type { HomeAssistant } from "../../types";
import { cssRules } from "./harness";

const hass = { states: {}, language: "en", localize: () => "" } as unknown as HomeAssistant;

const mount = async (heading: Record<string, unknown>): Promise<PictureStudioHeading> => {
  if (!customElements.get(HEADING_TAG)) customElements.define(HEADING_TAG, PictureStudioHeading);
  const el = document.createElement(HEADING_TAG) as PictureStudioHeading;
  el.hass = hass;
  el.heading = heading;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

beforeAll(() => {
  // The component guards on customElements.get, and happy-dom defines no Home
  // Assistant tag. Without this stub the badge assertions would pass against a
  // row that was never rendered — a test that cannot distinguish the defect.
  if (!customElements.get("hui-heading-badge")) {
    customElements.define("hui-heading-badge", class extends HTMLElement {});
  }
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-heading", () => {
  it("renders the title as text", async () => {
    const el = await mount({ title: "Office" });
    expect(el.shadowRoot?.querySelector("p")?.textContent).toBe("Office");
  });

  it("binds the icon as a property, not an attribute", async () => {
    const el = await mount({ icon: "mdi:desk" });
    const icon = el.shadowRoot?.querySelector("ha-icon") as { icon?: string } | null;
    expect(icon?.icon).toBe("mdi:desk");
  });

  it("draws no icon when none is configured", async () => {
    const el = await mount({ title: "Office" });
    expect(el.shadowRoot?.querySelector("ha-icon")).toBeNull();
  });

  it("creates one hui-heading-badge per badge, with its config", async () => {
    const badges = [{ type: "entity", entity: "sensor.a" }, { type: "entity", entity: "sensor.b" }];
    const el = await mount({ badges });
    const rendered = el.shadowRoot?.querySelectorAll("hui-heading-badge");
    expect(rendered?.length).toBe(2);
    expect((rendered?.[1] as unknown as { config?: unknown }).config).toEqual(badges[1]);
  });

  it("renders no badge row when the list is empty", async () => {
    const el = await mount({ title: "Office", badges: [] });
    expect(el.shadowRoot?.querySelector(".badges")).toBeNull();
  });

  it("keeps the title box from squeezing the badges away", async () => {
    const rules = cssRules(PictureStudioHeading.styles);
    expect(rules[".content:not(:only-child)"]?.["flex"]).toBe(
      "1 0 var(--psc-heading-title-min-width, 150px)",
    );
    expect(rules[".badges"]?.["flex"]).toBe("0 1 auto");
  });

  it("uses the card header's own padding, not the heading card's", async () => {
    const rules = cssRules(PictureStudioHeading.styles);
    expect(rules[".container"]?.["padding"]).toBe(
      "var(--ha-space-3) var(--ha-space-4) var(--ha-space-4)",
    );
  });

  it("sizes the title between the card header and the heading card", async () => {
    const rules = cssRules(PictureStudioHeading.styles);
    expect(rules[".content"]?.["font-size"]).toBe(
      "var(--psc-heading-title-font-size, var(--ha-font-size-xl))",
    );
  });
});
```

- [ ] **Step 2: Run the test and record the failure**

Run: `pnpm test src/tests/card/card-heading.test.ts`
Expected: FAIL — the module does not exist. Record the text.

- [ ] **Step 3: Write the component**

Create `src/card/card-heading.ts`:

```ts
import { css, html, LitElement, nothing } from "lit";
import type { HeadingConfig } from "../config";
import type { HomeAssistant } from "../types";

/**
 * Home Assistant's heading badge. Defined by the Lovelace panel's own chunk
 * group — `app.*.js` requests chunk 79381 in the same Promise.all as the panel —
 * so it is available before our card runs, through this static chain:
 * custom-card-helpers → create-card-element (`heading` is ALWAYS_LOADED and
 * statically imported) → hui-heading-card → hui-heading-badge. Guarded anyway:
 * an undefined custom element renders nothing at all, silently.
 */
const HEADING_BADGE = "hui-heading-badge";

/**
 * The card's header: title and icon on the left, heading badges on the right.
 *
 * The layout is copied from `hui-heading-card`'s `static styles`, reconciled
 * against frontend build 20260729.6 and identical at our 20260527.4 floor.
 * Upstream: src/panels/lovelace/cards/hui-heading-card.ts. What is copied is the
 * horizontal split — a title box that yields to the badges rather than pushing
 * them off — and nothing else: we carry no tap action, so their `[role=button]`,
 * `ha-icon-next` and hover transform are gone, and the drag-to-scroll and
 * overflow mask are deliberately not taken (see the spec). If upstream changes
 * its flex figures ours will simply keep the old behaviour; nothing breaks.
 *
 * The padding is `ha-card`'s `.card-header`, not the heading card's `0 4px`:
 * this header replaces the title in the card's own chrome, where the heading
 * card *is* the card.
 */
export class PictureStudioHeading extends LitElement {
  static properties = {
    hass: { attribute: false },
    heading: { attribute: false },
    preview: { type: Boolean },
  };

  declare hass?: HomeAssistant;
  declare heading?: HeadingConfig;
  declare preview: boolean;

  constructor() {
    super();
    this.preview = false;
  }

  protected render() {
    const heading = this.heading;
    if (!heading) return nothing;
    const badges = heading.badges?.length ? heading.badges : undefined;
    const available = !!customElements.get(HEADING_BADGE);

    return html`
      <div class="container">
        <div class="content">
          ${heading.icon ? html`<ha-icon .icon=${heading.icon}></ha-icon>` : nothing}
          ${heading.title ? html`<p>${heading.title}</p>` : nothing}
        </div>
        ${
          badges && available
            ? html`
                <div class="badges">
                  <div class="badges-row">
                    ${badges.map(
                      (config) => html`
                        <hui-heading-badge
                          .config=${config}
                          .hass=${this.hass}
                          .preview=${this.preview}
                        ></hui-heading-badge>
                      `,
                    )}
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .container {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      flex-wrap: nowrap;
      align-items: center;
      overflow: visible;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-4);
    }
    /* The title yields to the badges rather than pushing them off: it is
       max-content while alone, and a shrinkable 150px floor once it has a
       neighbour. This pair is the whole reason the block is copied. */
    .content {
      flex: 0 1 max-content;
      min-width: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--psc-heading-title-color, var(--primary-text-color));
      font-size: var(--psc-heading-title-font-size, var(--ha-font-size-xl));
      font-weight: var(--psc-heading-title-font-weight, var(--ha-font-weight-normal));
      line-height: var(--psc-heading-title-line-height, var(--ha-line-height-normal));
      letter-spacing: 0.1px;
      --mdc-icon-size: 22px;
    }
    .content:not(:only-child) {
      flex: 1 0 var(--psc-heading-title-min-width, 150px);
      max-width: max-content;
      min-width: 0;
    }
    .content ha-icon {
      display: flex;
      flex: none;
    }
    .content p {
      margin: 0;
      font-style: normal;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
      min-width: 0;
    }
    .badges {
      position: relative;
      display: flex;
      flex: 0 1 auto;
      min-width: 0;
      overflow: auto;
      max-width: 100%;
      scrollbar-width: none;
    }
    .badges-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      flex-wrap: nowrap;
      justify-content: flex-start;
      gap: var(--ha-space-2);
      margin: 0;
    }
    .badges-row > * {
      min-width: fit-content;
    }
  `;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test src/tests/card/card-heading.test.ts`
Expected: PASS.

- [ ] **Step 5: Render it from the card**

In `src/card/picture-studio-card.ts`, add `hasHeading` and `HEADING_TAG` to the `../config` import, add `import "./card-heading";` beside the other component imports, and replace the `render()` body's `ha-card` opening:

```ts
    return html`
      <ha-card>
        ${
          hasHeading(this._config.heading)
            ? html`
                <picture-studio-heading
                  .hass=${this.hass}
                  .heading=${this._config.heading}
                  .preview=${this.preview}
                ></picture-studio-heading>
              `
            : nothing
        }
        <div class="root ${this.editing ? "editing" : ""} ${this.preview ? "previewing" : ""}">
          <div class="layer"></div>
        </div>
      </ha-card>
    `;
```

Register the tag where the other components are registered, guarded exactly as they are.

- [ ] **Step 6: Add the card-level test**

Append to `src/tests/card/picture-studio-card.test.ts`:

```ts
describe("the header", () => {
  it("is absent when the heading holds nothing", async () => {
    const card = await mountCard({ type: CARD_TYPE, items: [] });
    expect(card.shadowRoot?.querySelector("picture-studio-heading")).toBeNull();
  });

  it("appears for an icon alone, with no title", async () => {
    const card = await mountCard({ type: CARD_TYPE, heading: { icon: "mdi:desk" }, items: [] });
    expect(card.shadowRoot?.querySelector("picture-studio-heading")).not.toBeNull();
  });

  it("appears for a badge alone", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      heading: { badges: [{ type: "entity", entity: "sensor.a" }] },
      items: [],
    });
    expect(card.shadowRoot?.querySelector("picture-studio-heading")).not.toBeNull();
  });

  it("no longer uses ha-card's own header", async () => {
    const card = await mountCard({ type: CARD_TYPE, heading: { title: "Office" }, items: [] });
    const haCard = card.shadowRoot?.querySelector("ha-card") as { header?: string } | null;
    expect(haCard?.header).toBeUndefined();
  });
});
```

Reuse the file's existing mount helper; if its signature differs, adapt the calls rather than the helper.

- [ ] **Step 7: Run everything**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: all green, lint exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/card/card-heading.ts src/card/picture-studio-card.ts src/tests/card/card-heading.test.ts src/tests/card/picture-studio-card.test.ts src/index.ts
git commit -m "feat(card): draw a header with an icon and heading badges

The header replaces ha-card's own, appears when any of title, icon or
badges is set, and reuses hui-heading-badge for rendering. Only the
horizontal layout is copied from hui-heading-card, with its origin and
build recorded in the file."
```

---

### Task 3: The section panel

**Files:**
- Create: `src/editor/section-panel.ts`
- Test: `src/tests/editor/section-panel.test.ts`

**Interfaces:**
- Consumes: `SECTION_TAG` from Task 1.
- Produces: `class PictureStudioSection extends LitElement`, properties `label: string`, `icon: string`, `open: boolean`. Slots: default for the body, `event` forwarded beside the title.

- [ ] **Step 1: Write the failing test**

Create `src/tests/editor/section-panel.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { SECTION_TAG } from "../../config";
import { PictureStudioSection } from "../../editor/section-panel";

const mount = async (props: Partial<PictureStudioSection> = {}): Promise<PictureStudioSection> => {
  if (!customElements.get(SECTION_TAG)) customElements.define(SECTION_TAG, PictureStudioSection);
  const el = document.createElement(SECTION_TAG) as PictureStudioSection;
  Object.assign(el, { label: "Background", icon: "mdi:image", ...props });
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-section", () => {
  it("renders an outlined expansion panel", async () => {
    const el = await mount();
    expect(el.shadowRoot?.querySelector("ha-expansion-panel")?.hasAttribute("outlined")).toBe(true);
  });

  it("puts the label in the header slot as a heading", async () => {
    const el = await mount();
    const header = el.shadowRoot?.querySelector('[slot="header"]');
    expect(header?.textContent?.trim()).toBe("Background");
    expect(header?.getAttribute("role")).toBe("heading");
    expect(header?.getAttribute("aria-level")).toBe("3");
  });

  it("binds the icon as a property in the leading-icon slot", async () => {
    const el = await mount();
    const icon = el.shadowRoot?.querySelector('[slot="leading-icon"]') as { icon?: string } | null;
    expect(icon?.icon).toBe("mdi:image");
  });

  it("forwards an adornment into the event slot, not icons", async () => {
    const el = await mount();
    const forwarded = el.shadowRoot?.querySelector('slot[name="event"]');
    // ha-expansion-panel renders leading-icon → header → event → chevron → icons,
    // so anything in `icons` lands after the chevron.
    expect(forwarded?.getAttribute("slot")).toBe("event");
  });

  it("is closed unless asked to be open", async () => {
    expect(
      (await mount()).shadowRoot?.querySelector("ha-expansion-panel")?.hasAttribute("expanded"),
    ).toBe(false);
    expect(
      (await mount({ open: true })).shadowRoot
        ?.querySelector("ha-expansion-panel")
        ?.hasAttribute("expanded"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run and record the failure**

Run: `pnpm test src/tests/editor/section-panel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/editor/section-panel.ts`:

```ts
import { css, html, LitElement } from "lit";

/**
 * The one panel shape every section of the editor uses.
 *
 * Home Assistant's `ha-form` can draw expandables of its own, and we do not use
 * them: two sections hold components rather than fields, one needs a custom
 * header for its count, and an `ha-form` renders its schema as a single
 * contiguous block, so an item list could never sit inside one. Drawing all five
 * ourselves makes them identical by construction rather than by matching
 * `ha-form-expandable`'s padding and `.content` wrapper by eye.
 *
 * The adornment goes to `event`, never to `icons`: `ha-expansion-panel` renders
 * its header as leading-icon → header → event → chevron → icons, so `icons`
 * lands *after* the chevron.
 */
export class PictureStudioSection extends LitElement {
  static properties = {
    label: { type: String },
    icon: { type: String },
    open: { type: Boolean },
  };

  declare label: string;
  declare icon: string;
  declare open: boolean;

  constructor() {
    super();
    this.label = "";
    this.icon = "";
    this.open = false;
  }

  protected render() {
    return html`
      <ha-expansion-panel outlined ?expanded=${this.open}>
        <ha-icon slot="leading-icon" .icon=${this.icon}></ha-icon>
        <div slot="header" role="heading" aria-level="3">${this.label}</div>
        <slot name="event" slot="event"></slot>
        <div class="content"><slot></slot></div>
      </ha-expansion-panel>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    /* ha-form spaces its own root children by 24px; a section's body carries the
       same rhythm so a panel of fields and a panel of components read alike. */
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-6);
    }
  `;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test src/tests/editor/section-panel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/section-panel.ts src/tests/editor/section-panel.test.ts
git commit -m "feat(editor): one panel shape for every section

All five sections are drawn by us rather than by ha-form's expandables:
two hold components, one needs a custom header, and an ha-form cannot be
interrupted by foreign markup."
```

---

### Task 4: Schema-driven data and merge

**Files:**
- Create: `src/editor/form-section.ts`
- Test: `src/tests/editor/form-section.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type FormField = { name: string; selector?: unknown }`
  - `type FormSchema = readonly FormField[]`
  - `sectionData<T extends Record<string, unknown>>(schema: FormSchema, source: T): Record<string, unknown>`
  - `sectionMerge<C extends Record<string, unknown>>(schema: FormSchema, config: C, data: Record<string, unknown>): C`
  - `formLabel(localize: LocalizeFunc, name: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/tests/editor/form-section.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { formLabel, sectionData, sectionMerge } from "../../editor/form-section";
import type { LocalizeFunc } from "../../types";

const echo: LocalizeFunc = (key) => key;
const only = (...known: string[]): LocalizeFunc => (key) => (known.includes(key) ? key : "");

const schema = [{ name: "filter" }, { name: "dark_mode_filter" }] as const;

describe("sectionData", () => {
  it("takes exactly the keys the schema renders", () => {
    const data = sectionData(schema, { filter: "a", dark_mode_filter: "b", image: "c" });
    expect(data).toEqual({ filter: "a", dark_mode_filter: "b" });
  });

  it("keeps a rendered key absent rather than undefined-filled", () => {
    expect(sectionData(schema, { filter: "a" })).toEqual({ filter: "a" });
  });
});

describe("sectionMerge", () => {
  it("writes back the keys the schema rendered", () => {
    const next = sectionMerge(schema, { filter: "a", image: "keep" }, { filter: "z" });
    expect(next).toEqual({ filter: "z", image: "keep" });
  });

  it("drops a rendered key the form left empty", () => {
    const next = sectionMerge(schema, { filter: "a", image: "keep" }, { filter: "" });
    expect(next).toEqual({ image: "keep" });
  });

  it("leaves a key the schema did NOT render completely alone", () => {
    // The whole point: camera_view is not in this schema, so editing `filter`
    // must not delete it. A fixed key list would.
    const next = sectionMerge(schema, { filter: "a", camera_view: "live" }, { filter: "z" });
    expect(next).toEqual({ filter: "z", camera_view: "live" });
  });

  it("does not resurrect a key the form omitted entirely", () => {
    const next = sectionMerge(schema, { filter: "a" }, {});
    expect("filter" in next).toBe(false);
  });
});

describe("formLabel", () => {
  it("prefers the generic namespace", () => {
    expect(formLabel(echo, "entity")).toBe("ui.panel.lovelace.editor.card.generic.entity");
  });

  it("falls back to picture-elements for the dark-mode keys", () => {
    const localize = only("ui.panel.lovelace.editor.card.picture-elements.dark_mode_image");
    expect(formLabel(localize, "dark_mode_image")).toBe(
      "ui.panel.lovelace.editor.card.picture-elements.dark_mode_image",
    );
  });

  it("falls back to the elements namespace, where filter and state_image live", () => {
    const localize = only("ui.panel.lovelace.editor.elements.state_image");
    expect(formLabel(localize, "state_image")).toBe("ui.panel.lovelace.editor.elements.state_image");
  });

  it("degrades to the raw field name, never to blank", () => {
    expect(formLabel(() => "", "picture_entity")).toBe("picture_entity");
  });
});
```

- [ ] **Step 2: Run and record the failure**

Run: `pnpm test src/tests/editor/form-section.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `src/editor/form-section.ts`:

```ts
import type { LocalizeFunc } from "../types";

export interface FormField {
  name: string;
  selector?: unknown;
}

export type FormSchema = readonly FormField[];

/**
 * A section's data record, built from the schema that was actually rendered.
 *
 * Three lists govern a section: the schema, the data handed to `ha-form`, and
 * the set of keys dropped when the form leaves them empty. In the pre-1.5 editor
 * all three were the same fixed constant and could not disagree, so nothing
 * guarded them. One schema is conditional now — `camera_view` appears only for a
 * camera — so both are derived from the schema here and stay in step by
 * construction.
 */
export const sectionData = <T extends Record<string, unknown>>(
  schema: FormSchema,
  source: T,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (const field of schema) {
    const value = source[field.name];
    if (value !== undefined) data[field.name] = value;
  }
  return data;
};

/** Empty for a form: never written, and the key is dropped instead. */
const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

/**
 * Fold a section's form data back into the config.
 *
 * Only the keys the schema rendered are touched. A key the schema did not render
 * is left exactly as it was — that is what keeps a conditional field from being
 * deleted as a side effect of editing its neighbour.
 */
export const sectionMerge = <C extends Record<string, unknown>>(
  schema: FormSchema,
  config: C,
  data: Record<string, unknown>,
): C => {
  const next: Record<string, unknown> = { ...config };
  for (const field of schema) {
    const value = data[field.name];
    if (isEmpty(value)) delete next[field.name];
    else next[field.name] = value;
  }
  return next as C;
};

/**
 * Home Assistant keys its labels on the field name, across three namespaces.
 *
 * `generic` first, as everywhere. Then `picture-elements`, the only namespace
 * that has `dark_mode_image` and `dark_mode_filter`. Then `elements`, which is
 * where `filter`, `state_image` and `state_filter` live — the namespace of the
 * image element, which is what our background is; `hui-image-element-editor`
 * resolves its own labels with the same chain. An unresolved key degrades to the
 * raw field name, never to blank, exactly as HA's own fallbacks do.
 */
const NAMESPACES = [
  "ui.panel.lovelace.editor.card.generic",
  "ui.panel.lovelace.editor.card.picture-elements",
  "ui.panel.lovelace.editor.elements",
] as const;

export const formLabel = (localize: LocalizeFunc, name: string): string => {
  for (const namespace of NAMESPACES) {
    const label = localize(`${namespace}.${name}`);
    if (label) return label;
  }
  return name;
};
```

- [ ] **Step 4: Run the test**

Run: `pnpm test src/tests/editor/form-section.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/form-section.ts src/tests/editor/form-section.test.ts
git commit -m "feat(editor): derive a section's data and drop list from its schema

A conditional field breaks the invariant the old editor relied on without
naming it — schema, data and drop list were one fixed constant. Deriving
two of them from the third keeps them in step by construction."
```

---

### Task 5: The four schemas and the `picture_entity` dispatch

**Files:**
- Create: `src/editor/form-schemas.ts`
- Modify: `src/strings.ts`
- Delete: `src/editor/background-schema.ts`, `src/tests/editor/background-schema.test.ts`
- Test: `src/tests/editor/form-schemas.test.ts`

**Interfaces:**
- Consumes: `FormSchema`, `sectionData`, `sectionMerge` from Task 4.
- Produces:
  - `backgroundSchema(localize: LocalizeFunc, config: PictureStudioConfig): FormSchema`
  - `headingSchema(localize: LocalizeFunc): FormSchema`
  - `filtersSchema(localize: LocalizeFunc): FormSchema`
  - `entitySchema(localize: LocalizeFunc): FormSchema`
  - `backgroundData(config): Record<string, unknown>` — adds the synthetic `picture_entity`
  - `mergeBackground(config, data): PictureStudioConfig` — runs the dispatch
  - `formHelper(hass, name): string | undefined`

- [ ] **Step 1: Add the four strings**

In `src/strings.ts`, add to the `en` table:

```ts
    section_background: "Background",
    section_filters: "Filters",
    section_entity: "Entity",
    picture_entity: "Image or camera entity",
    aspect_ratio_hint: "16:9, 16x9, 1.78 or 56.25% — decimals use a point.",
```

and to `fr`:

```ts
    section_background: "Fond",
    section_filters: "Filtres",
    section_entity: "Entité",
    picture_entity: "Entité image ou caméra",
    aspect_ratio_hint: "16:9, 16x9, 1.78 ou 56.25% — les décimales s'écrivent avec un point.",
```

The four examples describe the same box on purpose — `16:9` and `16x9` give a 56.25 % padding, `1.78` gives 56.18 %, `56.25%` gives 56.25 % — so the hint reads as four spellings of one shape. The separator is stated because nothing localises it: the field is plain text and `parseAspectRatio` uses `parseFloat`, which stops at a comma rather than rejecting it, so `1,78` silently renders a square.

- [ ] **Step 2: Write the failing test**

Create `src/tests/editor/form-schemas.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE, type PictureStudioConfig } from "../../config";
import {
  backgroundData,
  backgroundSchema,
  entitySchema,
  filtersSchema,
  headingSchema,
  mergeBackground,
} from "../../editor/form-schemas";
import type { LocalizeFunc } from "../../types";

const echo: LocalizeFunc = (key) => key;
const config = (over: Partial<PictureStudioConfig> = {}): PictureStudioConfig =>
  ({ type: CARD_TYPE, items: [], ...over }) as PictureStudioConfig;

const names = (schema: readonly { name: string }[]) => schema.map((f) => f.name);

describe("backgroundSchema", () => {
  it("hides camera_view when no entity is chosen", () => {
    expect(names(backgroundSchema(echo, config()))).toEqual([
      "image",
      "dark_mode_image",
      "picture_entity",
      "aspect_ratio",
    ]);
  });

  it("hides camera_view for an image entity", () => {
    const schema = backgroundSchema(echo, config({ image_entity: "image.plan" }));
    expect(names(schema)).not.toContain("camera_view");
  });

  it("shows camera_view for a camera, right after the entity field", () => {
    const schema = backgroundSchema(echo, config({ camera_image: "camera.door" }));
    expect(names(schema)).toEqual([
      "image",
      "dark_mode_image",
      "picture_entity",
      "camera_view",
      "aspect_ratio",
    ]);
  });

  it("bounds the entity field to image and camera", () => {
    const field = backgroundSchema(echo, config())[2] as {
      selector: { entity: { domain: string[] } };
    };
    expect(field.selector.entity.domain).toEqual(["image", "camera"]);
  });
});

describe("the other three schemas", () => {
  it("lists the heading fields", () => {
    expect(names(headingSchema(echo))).toEqual(["title", "icon"]);
  });

  it("lists the filters, both as object selectors", () => {
    const schema = filtersSchema(echo);
    expect(names(schema)).toEqual(["filter", "dark_mode_filter"]);
    // An object selector renders ha-yaml-editor: a code editor, which is what a
    // CSS filter chain deserves. HA already does this for dark_mode_filter.
    for (const field of schema) {
      expect((field as { selector: Record<string, unknown> }).selector).toHaveProperty("object");
    }
  });

  it("lists the entity fields with the entity first", () => {
    expect(names(entitySchema(echo))).toEqual(["entity", "state_image", "state_filter"]);
  });
});

describe("backgroundData", () => {
  it("shows the camera when both keys are set, because the camera renders", () => {
    const data = backgroundData(config({ camera_image: "camera.door", image_entity: "image.plan" }));
    expect(data.picture_entity).toBe("camera.door");
  });

  it("shows the image entity when it is alone", () => {
    expect(backgroundData(config({ image_entity: "image.plan" })).picture_entity).toBe("image.plan");
  });

  it("wraps a plain image path for the media selector", () => {
    expect(backgroundData(config({ image: "/local/p.png" })).image).toEqual({
      media_content_id: "/local/p.png",
    });
  });
});

describe("mergeBackground", () => {
  it("writes a camera and clears the image entity", () => {
    const next = mergeBackground(config({ image_entity: "image.plan" }), {
      picture_entity: "camera.door",
    });
    expect(next.camera_image).toBe("camera.door");
    expect("image_entity" in next).toBe(false);
  });

  it("writes an image entity and clears the camera AND its view", () => {
    const next = mergeBackground(config({ camera_image: "camera.door", camera_view: "live" }), {
      picture_entity: "image.plan",
    });
    expect(next.image_entity).toBe("image.plan");
    expect("camera_image" in next).toBe(false);
    expect("camera_view" in next).toBe(false);
  });

  it("clearing the field clears all three", () => {
    const next = mergeBackground(
      config({ camera_image: "camera.door", camera_view: "auto", image_entity: "image.plan" }),
      { picture_entity: "" },
    );
    expect("camera_image" in next).toBe(false);
    expect("camera_view" in next).toBe(false);
    expect("image_entity" in next).toBe(false);
  });

  it("never stores the synthetic key", () => {
    const next = mergeBackground(config(), { picture_entity: "camera.door" });
    expect("picture_entity" in next).toBe(false);
  });

  it("keeps camera_view while the entity is still a camera", () => {
    const next = mergeBackground(config({ camera_image: "camera.door", camera_view: "live" }), {
      picture_entity: "camera.door",
      camera_view: "live",
    });
    expect(next.camera_view).toBe("live");
  });

  it("stores the media selector value as written; the card unwraps at render", () => {
    const next = mergeBackground(config(), { image: { media_content_id: "/local/p.png" } });
    expect(next.image).toEqual({ media_content_id: "/local/p.png" });
  });
});
```

- [ ] **Step 3: Run and record the failure**

Run: `pnpm test src/tests/editor/form-schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the module**

Create `src/editor/form-schemas.ts`, moving `imageSelector` and `asMediaValue` across from `background-schema.ts` unchanged:

```ts
import type { ImageSource, PictureStudioConfig } from "../config";
import { localizeOwn } from "../strings";
import type { HomeAssistant, LocalizeFunc } from "../types";
import type { FormSchema } from "./form-section";
import { sectionMerge } from "./form-section";

/** The media selector picture-elements uses for both of its image fields. */
const imageSelector = (localize: LocalizeFunc) => ({
  media: {
    accept: ["image/*"],
    clearable: true,
    image_upload: true,
    hide_content_type: true,
    content_id_helper: localize("ui.panel.lovelace.editor.card.picture.content_id_helper"),
  },
});

/**
 * ha-selector-media reads `value.media_content_id` and nothing else: handed the
 * plain path a YAML user wrote, it shows an empty picker. Wrapping is what
 * picture-elements does in its own `_processData`; the card unwraps at render.
 */
const asMediaValue = (value: ImageSource | undefined): ImageSource | undefined =>
  typeof value === "string" ? { media_content_id: value } : value;

const domainOf = (entityId: string | undefined): string => entityId?.split(".")[0] ?? "";

/** The synthetic field. It exists in form data only and is never stored. */
export const PICTURE_ENTITY = "picture_entity";

/**
 * Background. `camera_view` is rendered only for a camera, which is what makes
 * this schema a function of the config and not of `localize` alone — and why the
 * data builder and the drop list are derived from it rather than from a constant.
 */
export const backgroundSchema = (
  localize: LocalizeFunc,
  config: PictureStudioConfig,
): FormSchema => {
  const chosen = config.camera_image ?? config.image_entity;
  const isCamera = domainOf(chosen) === "camera";
  return [
    { name: "image", selector: imageSelector(localize) },
    { name: "dark_mode_image", selector: imageSelector(localize) },
    { name: PICTURE_ENTITY, selector: { entity: { domain: ["image", "camera"] } } },
    ...(isCamera
      ? [
          {
            name: "camera_view",
            selector: {
              select: {
                options: ["auto", "live"].map((value) => ({
                  value,
                  label: localize(
                    `ui.panel.lovelace.editor.card.generic.camera_view_options.${value}`,
                  ),
                })),
                mode: "dropdown",
              },
            },
          },
        ]
      : []),
    { name: "aspect_ratio", selector: { text: {} } },
  ];
};

export const headingSchema = (_localize: LocalizeFunc): FormSchema => [
  { name: "title", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
];

/**
 * Both filters are strings, and both get an `object` selector on purpose: it
 * renders `ha-yaml-editor`, a code editor with colouring and copy-paste, and a
 * CSS filter chain is code. Home Assistant already does this for
 * `dark_mode_filter`; we extend it to `filter` rather than undo it.
 */
export const filtersSchema = (_localize: LocalizeFunc): FormSchema => [
  { name: "filter", selector: { object: {} } },
  { name: "dark_mode_filter", selector: { object: {} } },
];

/** Everything that depends on `entity`, under the field it depends on. */
export const entitySchema = (_localize: LocalizeFunc): FormSchema => [
  { name: "entity", selector: { entity: {} } },
  { name: "state_image", selector: { object: {} } },
  { name: "state_filter", selector: { object: {} } },
];

/** The camera first: it is what renders when both keys are set. */
export const backgroundData = (config: PictureStudioConfig): Record<string, unknown> => {
  const chosen = config.camera_image ?? config.image_entity;
  return {
    ...(config.image !== undefined ? { image: asMediaValue(config.image) } : {}),
    ...(config.dark_mode_image !== undefined
      ? { dark_mode_image: asMediaValue(config.dark_mode_image) }
      : {}),
    ...(chosen !== undefined ? { [PICTURE_ENTITY]: chosen } : {}),
    ...(config.camera_view !== undefined ? { camera_view: config.camera_view } : {}),
    ...(config.aspect_ratio !== undefined ? { aspect_ratio: config.aspect_ratio } : {}),
  };
};

/**
 * The selector is authoritative: what it shows is what renders. Writing an
 * entity clears the sibling key — and `camera_view` too when leaving a camera —
 * and clearing the field clears all three. That is what makes the deliberate
 * absence of a conflict alert safe: a forgotten key cannot resurface through the
 * interface.
 */
export const mergeBackground = (
  config: PictureStudioConfig,
  data: Record<string, unknown>,
): PictureStudioConfig => {
  const schema = backgroundSchema(() => "", config);
  const next = sectionMerge(
    schema,
    config as unknown as Record<string, unknown>,
    data,
  ) as Record<string, unknown>;

  const chosen = next[PICTURE_ENTITY] as string | undefined;
  delete next[PICTURE_ENTITY];
  if (!chosen) {
    delete next.camera_image;
    delete next.image_entity;
    delete next.camera_view;
  } else if (domainOf(chosen) === "camera") {
    next.camera_image = chosen;
    delete next.image_entity;
  } else {
    next.image_entity = chosen;
    delete next.camera_image;
    delete next.camera_view;
  }
  return next as unknown as PictureStudioConfig;
};

/**
 * Nothing localises the ratio's decimal separator: the field is plain text, the
 * string reaches the config verbatim, and `parseAspectRatio` reads it with
 * `parseFloat`, which stops at a comma rather than rejecting it — so `1,78`
 * becomes `1` and renders a square. The hint carries the separator; normalising
 * the value would be the first place we rewrite what a user typed.
 */
export const formHelper = (hass: HomeAssistant, name: string): string | undefined =>
  name === "aspect_ratio" ? localizeOwn(hass, "aspect_ratio_hint") : undefined;
```

- [ ] **Step 5: Delete the old module and its test**

```bash
git rm src/editor/background-schema.ts src/tests/editor/background-schema.test.ts
```

Use Serena's `find_referencing_symbols` on `backgroundSchema` first and fix every importer; the only one is `src/editor/picture-studio-editor.ts`, which Task 8 rewrites. Until then, point its import at `./form-schemas` and `./form-section`, pass `config` to `backgroundSchema`, **and replace `backgroundLabel` with `formLabel`** — it was exported by the deleted module, so leaving it would end this task on a broken `tsc`.

- [ ] **Step 6: Run the tests**

Run: `pnpm test src/tests/editor/form-schemas.test.ts && pnpm test && pnpm typecheck`
Expected: PASS everywhere.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): four section schemas, and one field for two entity keys

The camera entity and the image entity become a single bounded selector
whose dispatch clears the sibling key, and camera_view is rendered only
for a camera. aspect_ratio joins the form, so no key is YAML-only."
```

---

### Task 6: The Heading section

**Files:**
- Create: `src/editor/heading-section.ts`
- Test: `src/tests/editor/heading-section.test.ts`

**Interfaces:**
- Consumes: `HeadingConfig`, `HEADING_SECTION_TAG`; `headingSchema`, `formLabel`, `sectionData`, `sectionMerge`.
- Produces: `class PictureStudioHeadingSection extends LitElement`, properties `hass?`, `heading?: HeadingConfig`. Emits `heading-changed` with `{ heading: HeadingConfig }` and `edit-sub-element` with `{ config, saveConfig, type: "heading-badge" }`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/editor/heading-section.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { HEADING_SECTION_TAG } from "../../config";
import { PictureStudioHeadingSection } from "../../editor/heading-section";
import type { HomeAssistant } from "../../types";

const hass = {
  states: {},
  language: "en",
  localize: (key: string) => (key.endsWith("heading.badges") ? "Badges" : ""),
} as unknown as HomeAssistant;

const mount = async (heading: Record<string, unknown> = {}) => {
  if (!customElements.get(HEADING_SECTION_TAG)) {
    customElements.define(HEADING_SECTION_TAG, PictureStudioHeadingSection);
  }
  const el = document.createElement(HEADING_SECTION_TAG) as PictureStudioHeadingSection;
  el.hass = hass;
  el.heading = heading;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-heading-section", () => {
  it("hands ha-form a flat record, not the nested heading", async () => {
    const el = await mount({ title: "Office", icon: "mdi:desk", badges: [] });
    const form = el.shadowRoot?.querySelector("ha-form") as { data?: Record<string, unknown> };
    expect(form.data).toEqual({ title: "Office", icon: "mdi:desk" });
  });

  it("folds the flat record back into a heading", async () => {
    const el = await mount({ title: "Office", badges: [{ type: "entity" }] });
    let received: unknown;
    el.addEventListener("heading-changed", (ev) => {
      received = (ev as CustomEvent).detail.heading;
    });
    el.shadowRoot
      ?.querySelector("ha-form")
      ?.dispatchEvent(
        new CustomEvent("value-changed", { detail: { value: { title: "Salon" } } }),
      );
    expect(received).toEqual({ title: "Salon", badges: [{ type: "entity" }] });
  });

  it("separates the badges with a rule and a caption", async () => {
    const el = await mount();
    expect(el.shadowRoot?.querySelector("hr")).not.toBeNull();
    expect(el.shadowRoot?.querySelector(".badges-title")?.textContent?.trim()).toBe("Badges");
  });

  it("passes the badge list to HA's own editor", async () => {
    const badges = [{ type: "entity", entity: "sensor.a" }];
    const el = await mount({ badges });
    const editor = el.shadowRoot?.querySelector("hui-heading-badges-editor") as {
      badges?: unknown;
    } | null;
    expect(editor?.badges).toEqual(badges);
  });

  it("re-emits HA's badge list changes as a heading change", async () => {
    const el = await mount({ title: "Office", badges: [] });
    let received: unknown;
    el.addEventListener("heading-changed", (ev) => {
      received = (ev as CustomEvent).detail.heading;
    });
    el.shadowRoot
      ?.querySelector("hui-heading-badges-editor")
      ?.dispatchEvent(
        new CustomEvent("heading-badges-changed", {
          detail: { badges: [{ type: "entity" }] },
          bubbles: true,
          composed: true,
        }),
      );
    expect(received).toEqual({ title: "Office", badges: [{ type: "entity" }] });
  });

  it("asks HA to open its own sub-element editor for a badge", async () => {
    const badges = [{ type: "entity", entity: "sensor.a" }];
    const el = await mount({ badges });
    let detail: Record<string, unknown> | undefined;
    el.addEventListener("edit-sub-element", (ev) => {
      detail = (ev as CustomEvent).detail;
    });
    el.shadowRoot
      ?.querySelector("hui-heading-badges-editor")
      ?.dispatchEvent(
        new CustomEvent("edit-heading-badge", {
          detail: { index: 0 },
          bubbles: true,
          composed: true,
        }),
      );
    expect(detail?.type).toBe("heading-badge");
    expect(detail?.config).toEqual(badges[0]);
    expect(typeof detail?.saveConfig).toBe("function");
  });

  it("saves an edited badge back into the list", async () => {
    const el = await mount({ badges: [{ type: "entity", entity: "sensor.a" }] });
    let detail: { saveConfig: (config: unknown) => void } | undefined;
    let received: unknown;
    el.addEventListener("edit-sub-element", (ev) => {
      detail = (ev as CustomEvent).detail;
    });
    el.addEventListener("heading-changed", (ev) => {
      received = (ev as CustomEvent).detail.heading;
    });
    el.shadowRoot
      ?.querySelector("hui-heading-badges-editor")
      ?.dispatchEvent(
        new CustomEvent("edit-heading-badge", {
          detail: { index: 0 },
          bubbles: true,
          composed: true,
        }),
      );
    detail?.saveConfig({ type: "entity", entity: "sensor.b" });
    expect(received).toEqual({ badges: [{ type: "entity", entity: "sensor.b" }] });
  });
});
```

- [ ] **Step 2: Run and record the failure**

Run: `pnpm test src/tests/editor/heading-section.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/editor/heading-section.ts`:

```ts
import { css, html, LitElement, nothing } from "lit";
import type { HeadingConfig } from "../config";
import type { HomeAssistant } from "../types";
import { formLabel, sectionData, sectionMerge } from "./form-section";
import { headingSchema } from "./form-schemas";

/** Home Assistant's whole badge list: rows, drag handle, add menu, stubs. */
const HA_BADGES_EDITOR = "hui-heading-badges-editor";
/** The class whose static getConfigElement pulls that editor's chunk in. */
const HA_HEADING_CARD = "hui-heading-card";
/** The heading card's own section icon, so ours reads as the same thing. */
const BADGES_ICON = "mdi:format-list-bulleted-type";

interface HeadingCardClass {
  getConfigElement?: () => Promise<HTMLElement>;
}

/**
 * The Heading panel: the card's title and icon, then Home Assistant's own
 * heading-badge list.
 *
 * The badges are **not** a nested section — a panel inside a panel reads as a
 * level of structure that is not there. A rule and a caption separate them.
 *
 * `hui-heading-badges-editor` lives in a chunk requested from exactly one place
 * in the whole bundle: `HuiHeadingCard.getConfigElement()`. Calling that static
 * is what pulls it in; the element it returns is discarded. `hui-heading-card`
 * itself is guaranteed defined — it ships in the Lovelace panel's own chunk
 * group — but the editor is not, so the render is guarded: an undefined custom
 * element renders nothing at all, silently.
 */
export class PictureStudioHeadingSection extends LitElement {
  static properties = {
    hass: { attribute: false },
    heading: { attribute: false },
    _ready: { state: true },
  };

  declare hass?: HomeAssistant;
  declare heading?: HeadingConfig;
  declare _ready: boolean;

  constructor() {
    super();
    this._ready = !!customElements.get(HA_BADGES_EDITOR);
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    if (this._ready) return;
    const heading = customElements.get(HA_HEADING_CARD) as unknown as HeadingCardClass | undefined;
    try {
      await heading?.getConfigElement?.();
    } catch {
      // A frontend that cannot build the heading card's editor leaves the badge
      // list undefined; the guarded render below is the whole fallback.
    }
    this._ready = !!customElements.get(HA_BADGES_EDITOR);
  }

  private _emit(heading: HeadingConfig): void {
    this.dispatchEvent(
      new CustomEvent("heading-changed", {
        detail: { heading },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _fieldsChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    const schema = headingSchema(this.hass?.localize ?? (() => ""));
    const merged = sectionMerge(
      schema,
      { ...(this.heading ?? {}) } as Record<string, unknown>,
      ev.detail.value,
    );
    this._emit(merged as HeadingConfig);
  };

  private _badgesChanged = (ev: CustomEvent<{ badges: unknown[] }>): void => {
    ev.stopPropagation();
    this._emit({ ...(this.heading ?? {}), badges: ev.detail.badges });
  };

  private _editBadge = (ev: CustomEvent<{ index: number }>): void => {
    ev.stopPropagation();
    const index = ev.detail.index;
    const badges = this.heading?.badges ?? [];
    this.dispatchEvent(
      new CustomEvent("edit-sub-element", {
        detail: {
          config: badges[index],
          type: "heading-badge",
          // hui-element-editor holds this callback for the life of the
          // sub-editor, so it must read the list at call time rather than close
          // over the array it saw when the event was fired.
          saveConfig: (config: unknown) => {
            const next = [...(this.heading?.badges ?? [])];
            next[index] = config;
            this._emit({ ...(this.heading ?? {}), badges: next });
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected render() {
    const hass = this.hass;
    if (!hass) return nothing;
    const schema = headingSchema(hass.localize);

    return html`
      <ha-form
        .hass=${hass}
        .data=${sectionData(schema, (this.heading ?? {}) as Record<string, unknown>)}
        .schema=${schema}
        .computeLabel=${(s: { name: string }) => formLabel(hass.localize, s.name)}
        @value-changed=${this._fieldsChanged}
      ></ha-form>
      <hr />
      <div class="badges-header">
        <ha-icon .icon=${BADGES_ICON}></ha-icon>
        <span class="badges-title"
          >${hass.localize("ui.panel.lovelace.editor.card.heading.badges")}</span
        >
      </div>
      ${
        this._ready
          ? html`
              <hui-heading-badges-editor
                .hass=${hass}
                .badges=${this.heading?.badges ?? []}
                @heading-badges-changed=${this._badgesChanged}
                @edit-heading-badge=${this._editBadge}
              ></hui-heading-badges-editor>
            `
          : nothing
      }
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    hr {
      border: none;
      border-top: 1px solid var(--divider-color);
      margin: var(--ha-space-4) 0 var(--ha-space-3);
    }
    .badges-header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-2);
      --mdc-icon-size: 20px;
    }
    .badges-title {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
  `;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test src/tests/editor/heading-section.test.ts`
Expected: PASS. The `hui-heading-badges-editor` assertions rely on `_ready`; in happy-dom neither HA tag exists, so define a stub in the test's `beforeAll`:

```ts
beforeAll(() => {
  if (!customElements.get("hui-heading-badges-editor")) {
    customElements.define("hui-heading-badges-editor", class extends HTMLElement {});
  }
});
```

Add `beforeAll` to the `@rstest/core` import.

- [ ] **Step 5: Commit**

```bash
git add src/editor/heading-section.ts src/tests/editor/heading-section.test.ts
git commit -m "feat(editor): the Heading section, with HA's own badge list

The badge list, its rows, its add menu and the per-badge form are all
Home Assistant's: we host hui-heading-badges-editor and fire
edit-sub-element, which hui-element-editor already handles for the
heading-badge type."
```

---

### Task 7: The Items section

**Files:**
- Modify: `src/editor/badge-list.ts`
- Test: `src/tests/editor/badge-list.test.ts`

**Interfaces:**
- Consumes: `PictureItem` from `src/config.ts`; `badgeVerdict` from `./badge-existence`.
- Produces: `itemsSeverity(items: readonly PictureItem[]): "error" | "warning" | undefined`, exported from `src/editor/badge-list.ts`. Task 8 renders its result in the Items panel's header.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/editor/badge-list.test.ts`:

```ts
describe("the Items section", () => {
  it("no longer draws a heading of its own — the panel carries the title", async () => {
    const el = await mountList([]);
    expect(el.shadowRoot?.querySelector("h3")).toBeNull();
  });

  it("keeps the caption and the add button on one line", async () => {
    const el = await mountList([]);
    const header = el.shadowRoot?.querySelector(".header");
    expect(header?.querySelector(".hint")).not.toBeNull();
    expect(header?.querySelector("ha-button, ha-dropdown")).not.toBeNull();
  });

  it("keeps the sortable's container inside the scrolling wrapper", async () => {
    const el = await mountList([badgeItem()]);
    const wrapper = el.shadowRoot?.querySelector(".scroll");
    // ha-sortable takes children[0] as its container, so the scrolling wrapper
    // must sit ABOVE it, never between it and the rows.
    expect(wrapper?.firstElementChild?.tagName.toLowerCase()).toBe("ha-sortable");
  });

  it("caps the list's height", async () => {
    const rules = cssRules(PictureStudioBadgeList.styles);
    expect(rules[".scroll"]?.["max-height"]).toBe("var(--psc-items-max-height, 320px)");
    expect(rules[".scroll"]?.["overflow-y"]).toBe("auto");
  });
});

describe("itemsSeverity", () => {
  const badge = (config: Record<string, unknown>) =>
    ({ type: "badge", config, position: { top: 0, left: 0 }, anchor: "auto" }) as never;
  const label = (show: string[]) =>
    ({
      type: "element",
      config: { type: "state-label", entity: "sensor.a", show },
      position: { top: 0, left: 0 },
      anchor: "auto",
    }) as never;

  it("is undefined when every item is fine", () => {
    expect(itemsSeverity([badge({ type: "entity", entity: "sensor.a" })])).toBeUndefined();
  });

  it("is undefined for an empty list", () => {
    expect(itemsSeverity([])).toBeUndefined();
  });

  it("reports an error for an unreadable item", () => {
    expect(itemsSeverity([{ type: "unknown", raw: {}, reason: "item-type" } as never])).toBe(
      "error",
    );
  });

  it("reports a warning for unreadable visibility", () => {
    const item = { ...badge({ type: "entity" }), visibility: "nope" } as never;
    expect(itemsSeverity([item])).toBe("warning");
  });

  it("reports a warning for a label that shows nothing", () => {
    expect(itemsSeverity([label([])])).toBe("warning");
  });

  it("lets the error win over the warning, whatever the order", () => {
    const broken = { type: "unknown", raw: {}, reason: "item-type" } as never;
    const warned = label([]);
    expect(itemsSeverity([warned, broken])).toBe("error");
    expect(itemsSeverity([broken, warned])).toBe("error");
  });
});
```

Reuse the file's existing mount helper and item factory; if they are named differently, adapt the calls rather than the helpers.

- [ ] **Step 2: Run and record the failure**

Run: `pnpm test src/tests/editor/badge-list.test.ts`
Expected: FAIL — no `picture-studio-section` in the shadow root.

- [ ] **Step 3: Restructure the render**

**The list does not draw its own panel.** The editor owns all five sections
(Task 8), so this component renders only the panel's *contents*: the caption row
and the capped list. Keeping the panel here would put the Items panel in a
different shadow root from the other four and make it the one section the editor
does not own.

In `badge-list.ts`, drop the `<h3>` — the panel's header carries the title now —
and wrap the sortable:

```ts
    return html`
      <div class="header">
        <p class="hint">${localizeOwn(this.hass, "stacking_hint")}</p>
        ${this._addMenu(localize)}
      </div>
      <div class="scroll">
        <ha-sortable
          handle-selector=".handle"
          draggable-selector=".item"
          @item-moved=${…unchanged…}
        >
          …unchanged rows…
        </ha-sortable>
      </div>
    `;
```

The caption keeps its line, beside the Add button. `.titles` goes with the
`<h3>`; `.header` keeps its flex row with the two children it now has.

- [ ] **Step 4: Add the styles**

In `badge-list.ts`'s `static styles`, delete the `h3` and `.titles` rules and add:

```css
    /* The list is capped so a long one stops pushing the sections below it off
       the screen. The wrapper sits ABOVE ha-sortable, never between it and the
       rows: ha-sortable takes children[0] as its container, and SortableJS's
       autoscroll — forced to its fallback by HA, with scroll: true and
       scrollSpeed: 20 — walks up to the nearest scrollable ancestor. */
    .scroll {
      max-height: var(--psc-items-max-height, 320px);
      overflow-y: auto;
      overflow-x: hidden;
    }
```

- [ ] **Step 5: Export the severity classifier**

The panel's header must say that something inside needs attention while it is
folded. The four states are already decided per row in this file; the classifier
reuses those same predicates so the header and the rows can never disagree.

Add to `src/editor/badge-list.ts`, beside `hasUnreadableVisibility` and
`showsNothing`:

```ts
/**
 * The worst state among the items, for the section header's glyph — error beats
 * warning, and neither draws anything.
 *
 * Deliberately built from the very predicates the rows use. Two places deciding
 * "is this item broken" would drift, and the row is the one that has to stay
 * right.
 */
export const itemsSeverity = (
  items: readonly PictureItem[],
): "error" | "warning" | undefined => {
  let warning = false;
  for (const item of items) {
    if (item.type === "unknown") return "error";
    if (item.type === "badge") {
      const type = String((item.config as Record<string, unknown>).type ?? "");
      if (type && badgeVerdict(type) === "missing") return "error";
    }
    if (hasUnreadableVisibility(item) || showsNothing(item)) warning = true;
  }
  return warning ? "warning" : undefined;
};
```

Add `itemsSeverity` to the test file's import from `../../editor/badge-list`, and
make sure `PictureItem` and `badgeVerdict` are imported in `badge-list.ts` (both
already are, for the row rendering).

- [ ] **Step 6: Run the tests**

Run: `pnpm test src/tests/editor/badge-list.test.ts && pnpm test`
Expected: PASS. The pre-existing tests that queried `h3` need retargeting to the panel's `label` property — change the assertion, not the markup.

- [ ] **Step 7: Commit**

```bash
git add src/editor/badge-list.ts src/tests/editor/badge-list.test.ts
git commit -m "feat(editor): cap the item list and classify its worst state

The list is capped in height so a long one stops pushing the sections
below it off the screen, and itemsSeverity reuses the rows' own
predicates so the section header and the rows cannot disagree."
```

---

### Task 8: Compose the five sections

**Files:**
- Modify: `src/editor/picture-studio-editor.ts`
- Test: `src/tests/editor/picture-studio-editor.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 3–7.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/editor/picture-studio-editor.test.ts`:

```ts
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
    el.shadowRoot
      ?.querySelector("picture-studio-heading-section")
      ?.dispatchEvent(
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
        { type: "element", config: { type: "state-label", entity: "sensor.a", show: [] }, position: {} },
        { type: "nope" },
      ],
    });
    const glyph = bad.shadowRoot?.querySelector(".severity");
    expect(glyph?.classList.contains("error")).toBe(true);
    expect(glyph?.getAttribute("slot")).toBe("event");
  });

  it("does not write an empty heading back", async () => {
    const el = await mountEditor({ type: CARD_TYPE, heading: { title: "Office" }, items: [] });
    const emitted: Record<string, unknown>[] = [];
    el.addEventListener("config-changed", (ev) => emitted.push((ev as CustomEvent).detail.config));
    el.shadowRoot
      ?.querySelector("picture-studio-heading-section")
      ?.dispatchEvent(
        new CustomEvent("heading-changed", {
          detail: { heading: {} },
          bubbles: true,
          composed: true,
        }),
      );
    expect("heading" in (emitted.at(-1) ?? {})).toBe(false);
  });
});
```

Reuse the file's existing mount helper.

- [ ] **Step 2: Run and record the failure**

Run: `pnpm test src/tests/editor/picture-studio-editor.test.ts`
Expected: FAIL — no `picture-studio-section` elements.

- [ ] **Step 3: Rewrite the render**

Replace the non-form branch of `render()` in `picture-studio-editor.ts`:

```ts
    const localize = hass.localize;
    const background = backgroundSchema(localize, config);
    const filters = filtersSchema(localize);
    const entity = entitySchema(localize);
    const label = (s: { name: string }) =>
      s.name === PICTURE_ENTITY ? localizeOwn(hass, "picture_entity") : formLabel(localize, s.name);
    const helper = (s: { name: string }) => formHelper(hass, s.name);
    const flat = config as unknown as Record<string, unknown>;

    return html`
      <picture-studio-section open .label=${localizeOwn(hass, "section_background")} icon="mdi:image">
        <ha-form
          .hass=${hass}
          .data=${backgroundData(config)}
          .schema=${background}
          .computeLabel=${label}
          .computeHelper=${helper}
          @value-changed=${this._backgroundChanged}
        ></ha-form>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "items")} icon="mdi:format-list-bulleted">
        ${
          config.items.length
            ? html`<span class="count" slot="event">${config.items.length}</span>`
            : nothing
        }
        ${
          // The strongest state wins: one glyph, never two. Same vocabulary as
          // visibility-section.ts, and the same asymmetry — the normal case gets
          // no ink at all.
          (() => {
            const severity = itemsSeverity(config.items);
            if (!severity) return nothing;
            return html`<ha-icon
              slot="event"
              class="severity ${severity}"
              icon=${severity === "error" ? "mdi:alert-circle" : "mdi:alert-outline"}
              title=${localizeOwn(hass, severity === "error" ? "items_error" : "items_warning")}
            ></ha-icon>`;
          })()
        }
        <picture-studio-badge-list
          .hass=${hass}
          .items=${config.items}
          .selectedIndex=${this._editingIndex}
          @item-add=${this._addItem}
          @item-edit=${this._editBadge}
          @item-moved=${this._moveBadge}
          @item-removed=${this._removeBadge}
        ></picture-studio-badge-list>
      </picture-studio-section>

      <picture-studio-section
        .label=${hass.localize("ui.panel.lovelace.editor.card.heading.name")}
        icon="mdi:format-title"
      >
        <picture-studio-heading-section
          .hass=${hass}
          .heading=${config.heading}
          @heading-changed=${this._headingChanged}
        ></picture-studio-heading-section>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "section_filters")} icon="mdi:image-filter-black-white">
        <ha-form
          .hass=${hass}
          .data=${sectionData(filters, flat)}
          .schema=${filters}
          .computeLabel=${label}
          @value-changed=${this._sectionChanged(filters)}
        ></ha-form>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "section_entity")} icon="mdi:lightbulb">
        <ha-form
          .hass=${hass}
          .data=${sectionData(entity, flat)}
          .schema=${entity}
          .computeLabel=${label}
          @value-changed=${this._sectionChanged(entity)}
        ></ha-form>
      </picture-studio-section>
    `;
```

- [ ] **Step 4: Add the two handlers**

Beside `_backgroundChanged`:

```ts
  /**
   * One handler shape for the sections that are only fields. Bound per schema so
   * the merge touches exactly the keys that section rendered — a key another
   * section owns, or one this schema left out, is never written and never
   * dropped.
   */
  private _sectionChanged =
    (schema: FormSchema) =>
    (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
      ev.stopPropagation();
      if (!this._config || this._applying) return;
      this._commit(
        sectionMerge(
          schema,
          this._config as unknown as Record<string, unknown>,
          ev.detail.value,
        ) as unknown as PictureStudioConfig,
      );
    };

  private _headingChanged = (ev: CustomEvent<{ heading: HeadingConfig }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    const heading = ev.detail.heading;
    const { heading: _drop, ...rest } = this._config;
    // The empty heading is dropped rather than written, for the same reason
    // storedConfig never writes a default chrome: a key that holds nothing.
    this._commit({
      ...(rest as PictureStudioConfig),
      ...(hasHeading(heading) ? { heading } : {}),
    });
  };
```

Give the editor a `static styles` for the count pill it now owns — the Items
panel lives here, beside the other four, so the pill does too:

```ts
  static styles = css`
    .count {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      background: var(--ha-color-fill-neutral-quiet-resting, rgba(0, 0, 0, 0.06));
      border-radius: var(--ha-border-radius-pill, 9999px);
      padding: 0 var(--ha-space-2);
      line-height: var(--ha-space-5);
    }
    .severity {
      --mdc-icon-size: 20px;
    }
    .severity.error {
      color: var(--error-color);
    }
    .severity.warning {
      color: var(--warning-color);
    }
  `;
```

If the class already declares `static styles`, add the rule to the existing block
rather than replacing it.

Delete `_schemaCache` and `_schema`: the schema now depends on the config as well as on `localize`, and `ha-form` is handed a fresh array per render. If a profiler ever shows that this matters, memoize on the pair — not on `localize` alone, which would return a stale schema when the chosen entity's domain changes.

Add two strings to `src/strings.ts` for the glyph's hover title — `items_error` (en: "Some items are unreadable", fr: "Des items sont illisibles") and `items_warning` (en: "Some items need attention", fr: "Des items demandent attention").

Update the imports: `itemsSeverity` from `./badge-list`; `formLabel`, `sectionData`, `sectionMerge`, `type FormSchema` from `./form-section`; `backgroundData`, `backgroundSchema`, `entitySchema`, `filtersSchema`, `formHelper`, `mergeBackground`, `PICTURE_ENTITY` from `./form-schemas`; `hasHeading`, `type HeadingConfig` from `../config`; `localizeOwn` from `../strings`; and `import "./section-panel"; import "./heading-section";`.

- [ ] **Step 5: Run everything**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: all green, lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/editor/picture-studio-editor.ts src/tests/editor/picture-studio-editor.test.ts
git commit -m "feat(editor): five sections replace the single Card config panel

Four ha-form instances, one per section that has fields, each handed and
merged through the schema it actually rendered."
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update the config example**

In `README.md`, replace `title: My floorplan   # optional card header` with the heading block, and put it at the top of the example:

```yaml
heading:                           # optional card header
  title: My floorplan
  icon: mdi:floor-plan
  badges:                          # Home Assistant's heading badges
    - type: entity
      entity: sensor.temperature
```

- [ ] **Step 2: Correct the `image_entity` line**

Replace `image_entity: image.floorplan      # optional, an image or person entity instead of image` with:

```yaml
image_entity: image.floorplan      # optional, an `image` entity instead of image
```

and add, under the example:

> `image_entity` takes an `image` entity only. A `person` entity is not supported: the background is a `hui-image-element`, whose image resolution needs an access token that a person has not — and it suppresses the static `image` along with it, leaving the card blank.

- [ ] **Step 3: Delete the YAML-only sentence**

`README.md:377` currently reads "… `entity`, `image_entity`, `state_image`, `aspect_ratio` and `filter` are set in YAML only." Delete that sentence and rewrite the paragraph to describe the five sections. Add the grayscale note:

> Setting `entity` without any filter greys the picture while that entity is off or unavailable — Home Assistant's own behaviour for a state-driven image.

- [ ] **Step 4: Write the CHANGELOG entry**

Under `## unreleased`, `### Added` before `### Changed`:

```markdown
### Added

- The card header can now carry an **icon** and **badges** beside its title,
  using Home Assistant's own heading badges — the same ones the Heading card
  offers, with their own visibility conditions.
- Every setting is now reachable from the editor. `entity`, `image_entity`,
  `state_image`, `aspect_ratio` and `filter` were YAML-only and are not any more.

### Changed

- The editor is now five collapsible sections — Background, Items, Heading,
  Filters and Entity — instead of one panel and a list. The item list carries
  its count and no longer grows without limit.
- The camera entity and the image entity are now **one field**: they were always
  mutually exclusive on screen, and choosing one clears the other.
- `title` moves into `heading.title`. **Existing configs keep working** — a
  top-level `title` is read and moved the first time you open the card's editor.
- The header's title is smaller than it was.
```

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: the heading block, the five sections, and the person correction"
```

---

### Task 10: The browser walk

**Files:** none — this task produces findings, not code.

happy-dom does no layout, so nothing below is observable in the suite. Walk a **panel** view and a **sections** view, both, as every release does.

- [ ] **Step 1: Build and load**

```bash
pnpm build
```

Then bump the dashboard resource's `?v=` at http://localhost:8123 and reload.

- [ ] **Step 2: The header**

- A long title with three badges: the title ellipsises and the badges stay put.
- A title alone, an icon alone, a badge alone — the header appears for each.
- No heading at all: no header, and no leftover gap above the image.
- The badges overflow when the card is narrow: confirm what actually happens, since neither the drag-scroll nor the fade mask was taken.
- **Decide by eye**: title weight 400 or 500, and the icon size beside it (22px is the proportional guess, unverified).

- [ ] **Step 3: The form**

- Drag an item while the list is capped: SortableJS's autoscroll should scroll the wrapper.
- Open an item's form and come back: the list's scroll position.
- Click the preview's background to clear the selection: the Items section stays expanded and in view.
- Switch the entity field from a camera to an image entity: `camera_view` disappears and both `camera_image` and `camera_view` leave the YAML.
- Clear the entity field: all three keys go.
- Add a heading badge, edit it, come back: Home Assistant's sub-editor opens and saves.

- [ ] **Step 4: The one unread branch**

`camera_view: live` pointing at a **non-camera** entity — the only failure shape not read in the source. Note what `ha-camera-stream` does with it.

- [ ] **Step 5: Record the findings**

Write what the walk found into `mem:picture-studio/state`, and open a follow-up for anything left.

---

## Self-Review

**Spec coverage.** Five sections and their order → Tasks 3, 7, 8. Items detail → Task 7 (count, cap, sortable) and Task 10 (scroll behaviour, which is layout). Heading section and badges-not-a-section → Task 6. Uniform panel → Task 3. The four schemas → Task 5. The three translations → Task 1 (`heading` flatten is Task 6's `sectionMerge` over a nested record), Task 5 (`picture_entity`, `camera_view`). Merged field and no-alert → Task 5. Keys kept/forbidden → nothing to build: `fit_mode` and `theme` are simply never added, and the kept keys are already forwarded. Background resolution and failure shapes → documented only, Task 9 and Task 10 step 4. README lines → Task 9. Labels → Tasks 4 and 5. Testing → each task. Header spec: migration → Task 1; render and copied CSS → Task 2; typography → Task 2 plus the eye decision in Task 10.

**Gap found and closed:** the header spec's `preview` handling — `hui-heading-badge` short-circuits its visibility to visible under `preview` — is covered by Task 2 passing `.preview=${this.preview}` through, asserted implicitly by the card test. No separate task needed.

**Placeholder scan:** none. Every step carries the code it asks for. The three "…unchanged…" markers in Task 7 Step 3 point at code that already exists in the file and is explicitly not to be retyped.

**Type consistency:** `hasHeading` (Task 1) is used in Tasks 2 and 8 with the same signature. `FormSchema`, `sectionData`, `sectionMerge`, `formLabel` (Task 4) are used in Tasks 5, 6 and 8 unchanged. `PICTURE_ENTITY` (Task 5) is used in Task 8. `HeadingConfig` (Task 1) is the property type in Tasks 2, 6 and 8. `heading-changed` carries `{ heading: HeadingConfig }` in both Task 6 and Task 8.
