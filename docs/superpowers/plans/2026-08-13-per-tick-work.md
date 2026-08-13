# Per-tick work — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the card resynchronising everything on every Home Assistant
state tick, and prove it with a call counter.

**Architecture:** The three sync methods are not at fault; the trigger is.
`updated(changed)` starts reading its `changedProperties`, and `requestUpdate()`
leaves the `hass` setter. The proof needs the project's first component test, so
this plan also stands up a minimal DOM harness.

**Tech Stack:** Lit 3.3.3, `@rstest/core` 0.11, `happy-dom` (new dev
dependency), TypeScript.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-per-tick-work-design.md`. Every
  requirement there binds every task here.
- **This is not performance work and must not be described as such.** Nothing
  has been profiled and no slowness was reported. The metric is a count of
  calls, never a duration. Do not add a benchmark or a timing assertion.
- **The `hass` push stays.** The setter must keep assigning `hass` to the
  background element and to every badge — that is what makes a badge show a new
  state. What must disappear is the *second* push, made again by the sync
  methods, and the redundant `setConfig` calls.
- Do not touch `reanchor()`, the drag geometry, or `_bgConfig`.
- Do not "fix" the two moot follow-up items — `querySelector(".root")` per
  render and `_applyPositions` rewriting unchanged styles. The gating removes
  their cost; editing them would add code for a solved problem.
- Serena's symbol-aware tools are primary for every file under `src/`. Built-in
  Read/Edit are for `.md`, JSON and config only.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before every commit.
- Branch: `perf/per-tick-work`, already created, already carrying the spec
  commit `f3b69c7`.

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `rstest.config.ts` | Modify — it already exists, carrying `include` | Declare the DOM test environment |
| `package.json` | Modify | Add `happy-dom` to `devDependencies` |
| `src/tests/card/harness.ts` | Create | Mount the card with stubbed helpers; fake children that count `setConfig` and `hass` |
| `src/tests/card/picture-studio-card.test.ts` | Create | The smoke test, then the three assertions |
| `src/card/picture-studio-card.ts` | Modify — `hass` setter (67-74) and `updated` (215-219) | The gating itself |
| `CHANGELOG.md` | Modify | One entry under `1.1.0 — unreleased` |

## Facts established before writing this plan, so no task has to rediscover them

- `requestUpdate()` **with no argument** schedules an update but records nothing
  in `changedProperties`. On a `hass` tick `updated()` already receives an empty
  map today, and resynchronises anyway because it never looks.
- `_config`, `editing` and `selected` are declared `{ state: true }`, `preview`
  is `{ type: Boolean }`, and `hass` is `{ attribute: false }` with a
  hand-written accessor — which is why the manual `requestUpdate()` exists.
- Editing detection is broker-driven, not tick-driven: `connectedCallback`
  subscribes via `subscribeEditors`, which calls the listener immediately and on
  every broker change.
- `_inEditPreview()` returns **true** for an element with no `hui-card-options`
  / `hui-card-edit-mode` ancestor — so a card appended to `document.body` in a
  test counts as an edit preview once `preview` is true and an editor is
  registered.
- `createBadgeElement(item.config)` carries the config in, so nothing calls
  `setConfig` on a badge at mount. `_syncBackground` creates the background and
  then configures it explicitly. **Mount total: exactly one `setConfig` call.**
- `CARD_TAG = "picture-studio"` is exported from `src/config.ts`, a pure module —
  importing it does not pull in the editors the way `src/index.ts` would.

---

### Task 1: A DOM harness, and a smoke test that uses it

**Files:**
- Modify: `rstest.config.ts` — **the file already exists** and declares
  `include: ["src/**/*.test.ts"]`. Add `testEnvironment` alongside it; do not
  replace the file and do not drop `include`.
- Modify: `package.json` (add `happy-dom` to `devDependencies`)
- Create: `src/tests/card/harness.ts`
- Create: `src/tests/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `src/tests/card/harness.ts`:
  - `class FakeChild extends HTMLElement` with public `setConfigCalls: number`,
    `hassAssignments: number`, `config: unknown`, a `setConfig(config: unknown)`
    method and a counting `hass` accessor.
  - `installHelpers(): void` — puts a stub on `window.loadCardHelpers`.
  - `mountCard(config: unknown): Promise<PictureStudioCard>` — creates the
    element, calls `setConfig`, appends it to `document.body`, and settles.
  - `flush(): Promise<void>` — settles Lit's update and the sync methods' awaits.
  - `background(card): FakeChild`, `badges(card): FakeChild[]`,
    `wrappers(card): HTMLElement[]`.
  - `CONFIG_3` — a config with three badges, reused by Task 2.

- [ ] **Step 1: Add the DOM environment**

Run:

```bash
pnpm add -D happy-dom
```

Then create `rstest.config.ts` at the repository root:

```ts
import { defineConfig } from "@rstest/core";

export default defineConfig({
  // The card is a Lit element: its lifecycle needs a DOM. happy-dom is the
  // light end of what rstest supports — we assert call counts, not layout, so
  // a real browser would buy nothing. If custom elements or adoptedStyleSheets
  // misbehave here, "jsdom" is a drop-in replacement (and its own dependency).
  testEnvironment: "happy-dom",
});
```

- [ ] **Step 2: Confirm the existing suite still runs under the new environment**

Run: `pnpm test`

Expected: the nine existing test files still pass. They test pure modules, so
the environment change must not affect them. If anything breaks here, stop and
report — it means the environment is not neutral and the choice needs revisiting
before any card test is written.

- [ ] **Step 3: Write the harness**

Create `src/tests/card/harness.ts`:

```ts
import { CARD_TAG } from "../../config";
import { PictureStudioCard } from "../../card/picture-studio-card";

/**
 * Stands in for a badge or the background element. It counts what the CARD
 * does to it after creation — the creation helpers below deliberately do not
 * call setConfig, mirroring createBadgeElement(config), which carries the
 * config in. So a clean mount leaves exactly one setConfig call, on the
 * background, which the card configures explicitly.
 */
export class FakeChild extends HTMLElement {
  setConfigCalls = 0;
  hassAssignments = 0;
  config: unknown;
  #hass: unknown;

  setConfig(config: unknown): void {
    this.setConfigCalls++;
    this.config = config;
  }

  set hass(value: unknown) {
    this.hassAssignments++;
    this.#hass = value;
  }

  get hass(): unknown {
    return this.#hass;
  }
}

const FAKE_TAG = "fake-child";

const define = (tag: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
};

const makeChild = (config: unknown): FakeChild => {
  const el = document.createElement(FAKE_TAG) as FakeChild;
  el.config = config;
  return el;
};

export const installHelpers = (): void => {
  define(FAKE_TAG, FakeChild);
  define(CARD_TAG, PictureStudioCard);
  (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers =
    async () => ({
      createHuiElement: makeChild,
      createBadgeElement: makeChild,
    });
};

/** Settles Lit's update queue and the sync methods' awaits. */
export const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

export const mountCard = async (config: unknown): Promise<PictureStudioCard> => {
  installHelpers();
  const card = document.createElement(CARD_TAG) as PictureStudioCard;
  card.setConfig(config);
  document.body.append(card);
  await card.updateComplete;
  await flush();
  return card;
};

const root = (card: PictureStudioCard): ParentNode =>
  card.renderRoot as unknown as ParentNode;

export const background = (card: PictureStudioCard): FakeChild =>
  root(card).querySelector(".background") as FakeChild;

export const badges = (card: PictureStudioCard): FakeChild[] =>
  Array.from(root(card).querySelectorAll(`.item > ${FAKE_TAG}`)) as FakeChild[];

export const wrappers = (card: PictureStudioCard): HTMLElement[] =>
  Array.from(root(card).querySelectorAll(".item")) as HTMLElement[];

export const CONFIG_3 = {
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity", entity: "light.a" } },
    { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity", entity: "light.b" } },
    { type: "badge", position: { top: "30%", left: "30%" }, config: { type: "entity", entity: "light.c" } },
  ],
};
```

- [ ] **Step 4: Write the smoke test**

Create `src/tests/card/picture-studio-card.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { background, badges, CONFIG_3, mountCard } from "./harness";

describe("mounting", () => {
  it("configures the background once and builds one element per badge", async () => {
    const card = await mountCard(CONFIG_3);

    expect(background(card)).not.toBeNull();
    expect(background(card).setConfigCalls).toBe(1);

    expect(badges(card)).toHaveLength(3);
    // Badges receive their config through createBadgeElement, so nothing
    // configures them afterwards.
    expect(badges(card).map((b) => b.setConfigCalls)).toEqual([0, 0, 0]);

    card.remove();
  });
});
```

- [ ] **Step 5: Run it**

Run: `pnpm test`

Expected: PASS, alongside the nine existing files. This test describes today's
behaviour and must pass before anything changes — it is the baseline the next
task moves.

If it fails because `renderRoot` is empty or `customElements` is missing,
happy-dom is not carrying Lit; switch `testEnvironment` to `"jsdom"`, run
`pnpm add -D jsdom`, remove `happy-dom`, and re-run. Report the switch.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add rstest.config.ts package.json pnpm-lock.yaml src/tests/card/
git commit -m "test: stand up a DOM harness for the card

The project had no component test: nine files, all on pure modules, while the
card's lifecycle — the part it has twice been wrong about — had none. The fakes
count what the card does to its children, which is what the next commit needs
to assert.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Count the per-tick work, then remove it

**Files:**
- Modify: `src/tests/card/picture-studio-card.test.ts` (append two describes)
- Modify: `src/card/picture-studio-card.ts` — `hass` setter (67-74), `updated` (215-219)

**Interfaces:**
- Consumes: everything `harness.ts` produces (Task 1).
- Produces: `updated(changed: PropertyValues): void` on `PictureStudioCard`,
  replacing the no-argument `updated()`.

- [ ] **Step 1: Write the failing counter test**

Append to `src/tests/card/picture-studio-card.test.ts`:

Extend the existing harness import on line 2 to bring in `flush` and
`wrappers` as well — the guard tests in Step 3 need `wrappers`, and adding it
now keeps the import untouched afterwards:

```ts
import type { HomeAssistant } from "../../types";
import { background, badges, CONFIG_3, flush, mountCard, wrappers } from "./harness";
```

`HomeAssistant` is imported the way the rest of the codebase does it — see
`src/tests/strings.test.ts:3`.

Then append:

```ts
// One cast, in one place: the card only ever forwards hass, so a fixture
// carrying a single state is enough to tell one tick from the next.
const tick = (n: number): HomeAssistant =>
  ({ states: { "light.a": { state: String(n) } } }) as unknown as HomeAssistant;

describe("a hass tick", () => {
  it("neither reconfigures anything nor pushes hass twice", async () => {
    const card = await mountCard(CONFIG_3);

    const setConfigTotal = () =>
      background(card).setConfigCalls +
      badges(card).reduce((sum, b) => sum + b.setConfigCalls, 0);
    const hassTotal = () =>
      background(card).hassAssignments +
      badges(card).reduce((sum, b) => sum + b.hassAssignments, 0);

    // Mount configures the background once and no badge. Nothing has pushed
    // hass yet, because mountCard never assigns it.
    expect(setConfigTotal()).toBe(1);
    expect(hassTotal()).toBe(0);

    for (let i = 0; i < 10; i++) {
      card.hass = tick(i);
      await flush();
    }

    // Four elements, ten ticks, one push each: 40. Not 80.
    expect(hassTotal()).toBe(40);
    // Nothing reconfigured: still the single mount call. Not 41.
    expect(setConfigTotal()).toBe(1);

    card.remove();
  });
});
```

Add `flush` to the harness import at the top of the file.

- [ ] **Step 2: Run it and read the real numbers**

Run: `pnpm test`

Expected: **FAIL**. This is the measurement the spec asks for, and the numbers
are the point — record them in the report. Expect `hassTotal()` to come back as
**80** and `setConfigTotal()` as **41**, because today the setter pushes `hass`
and then `requestUpdate()` makes `updated()` push it again and reconfigure
everything.

If the numbers differ from 80 and 41, stop and report before changing anything:
the spec's model of the current behaviour would be wrong, and the fix would be
aimed at the wrong thing.

- [ ] **Step 3: Write the two guard tests**

These must pass both before and after the fix — they are what stops an
over-zealous gate winning the counter and losing the feature.

Add the broker imports at the top of the file — they are used only from here:

```ts
import { notifyEditors, registerEditor } from "../../broker";
import type { EditorChannel } from "../../broker";
```

Then append:

```ts
describe("a real change", () => {
  it("still reconfigures the badges when the config changes", async () => {
    const card = await mountCard(CONFIG_3);
    expect(badges(card)[0].setConfigCalls).toBe(0);

    card.setConfig({
      ...CONFIG_3,
      items: CONFIG_3.items.map((item) => ({
        ...item,
        config: { ...item.config, name: "renamed" },
      })),
    });
    await flush();

    expect(badges(card).map((b) => b.setConfigCalls)).toEqual([1, 1, 1]);
    expect((badges(card)[0].config as { name?: string }).name).toBe("renamed");

    card.remove();
  });

  it("marks the selected badge without reconfiguring anything", async () => {
    const card = await mountCard(CONFIG_3);

    let selected: number | undefined = 1;
    const editor: EditorChannel = {
      patchPosition: () => {},
      patchAnchor: () => {},
      select: () => {},
      selectedIndex: () => selected,
    };
    card.preview = true;
    const release = registerEditor(editor);
    await flush();

    expect(wrappers(card)[1].classList.contains("selected")).toBe(true);

    const before =
      background(card).setConfigCalls +
      badges(card).reduce((sum, b) => sum + b.setConfigCalls, 0);

    selected = 2;
    notifyEditors();
    await flush();

    expect(wrappers(card)[1].classList.contains("selected")).toBe(false);
    expect(wrappers(card)[2].classList.contains("selected")).toBe(true);
    expect(
      background(card).setConfigCalls +
        badges(card).reduce((sum, b) => sum + b.setConfigCalls, 0),
    ).toBe(before);

    release();
    card.remove();
  });
});
```

- [ ] **Step 4: Run them**

Run: `pnpm test`

Expected: the two guard tests **PASS** on the unchanged code, the counter test
still **FAILS**. If a guard test fails now, the harness is wrong, not the card —
fix the harness before touching `src/card/`.

- [ ] **Step 5: Remove the `requestUpdate()` from the `hass` setter**

Use Serena's `replace_symbol_body` on `PictureStudioCard/hass` (the setter, the
one at lines 67-74):

```ts
set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._bgElement) this._bgElement.hass = hass;
    for (const el of this._elements) {
      el.hass = hass;
    }
    // No requestUpdate: render() reads _config.title and editing, never hass.
    // Home Assistant republishes hass on every state change of any entity, so
    // scheduling a cycle here was scheduling one per tick — and the cycle's
    // changedProperties was empty, since requestUpdate() with no argument
    // records nothing.
  }
```

- [ ] **Step 6: Gate `updated`**

Use Serena's `replace_symbol_body` on `PictureStudioCard/updated`:

```ts
protected updated(changed: PropertyValues): void {
    const configChanged = changed.has("_config");

    // preview is in the gate because editing DERIVES from it: _syncEditingAndDrag
    // is what sets editing, so waiting for editing to change would mean it never
    // does. _config is in it because .root — which the drag attaches to — only
    // exists once _config does.
    if (configChanged || changed.has("preview") || changed.has("editing")) {
      this._syncEditingAndDrag();
    }

    if (configChanged) {
      void this._syncBackground();
      // _syncBadges ends with _applyPositions, so it is not called again here.
      void this._syncBadges();
    } else if (changed.has("editing") || changed.has("selected")) {
      this._applyPositions(this._config?.items ?? []);
    }
  }
```

Add `PropertyValues` to the existing `lit` type import at the top of the file
(it is a type-only import).

- [ ] **Step 7: Run the whole suite**

Run: `pnpm test`

Expected: **all four card tests pass**, and the nine existing files still pass.
The counter test now reports 40 and 1.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/card/picture-studio-card.ts src/tests/card/picture-studio-card.test.ts
git commit -m "fix: stop reconfiguring everything on every state tick

Home Assistant republishes hass on every state change of any entity. The card
answered each one by pushing hass twice to every element and calling setConfig
on all of them for a config that had not moved — 41 setConfig calls and 80 hass
assignments over ten ticks with three badges, where 1 and 40 do.

None of the sync methods was at fault; the trigger was. updated() now reads its
changedProperties, and the hass setter no longer schedules a cycle render()
would have nothing to do with.

HA's own container never calls setConfig twice — it rebuilds the element — so
calling it every second on a third-party badge was doing something no part of
HA does, to code never written to expect it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The changelog entry, and the check the harness cannot make

**Files:**
- Modify: `CHANGELOG.md` — under the existing `## 1.1.0 — unreleased`

**Interfaces:**
- Consumes: Tasks 1 and 2, both committed.
- Produces: nothing later depends on.

- [ ] **Step 1: Add the changelog entry**

Under `## 1.1.0 — unreleased`, in the existing `### Changed` section, append:

```markdown
- **Badges are no longer reconfigured on every state update.** The card used to
  hand each badge its configuration again every time any entity in Home
  Assistant changed state, which is something Home Assistant itself never does —
  it rebuilds a card when its configuration changes. Badges still receive every
  state update; they are simply no longer told their configuration has changed
  when it has not. A third-party badge that misbehaved under that treatment
  should now behave.
```

Written for someone using the card, per AGENTS.md § Changelog and versioning:
it says what changes for them, not how the code got there.

- [ ] **Step 2: Rebuild the bundle the local container serves**

Run: `pnpm build`

`docker-compose.yml` mounts `./dist` read-only at
`/config/www/picture-studio-card`, so the container serves the new file the
moment the build finishes. No copy step.

- [ ] **Step 3: Check it in the running Home Assistant**

The container `picture-studio-ha` is already up at http://localhost:8123.
Hard-reload the dashboard (the bundle is cached) and confirm, on a card with at
least one badge bound to an entity that changes:

1. **The badge still updates when its entity changes state.** This is the one
   thing the harness cannot prove — it counts calls on fakes and says nothing
   about what a real badge does with its `hass`.
2. **Opening the card editor still arms the drag**, and dragging a badge still
   commits its position. This exercises the `preview` and `editing` gate paths
   in a way the test only approximates.
3. **Selecting a badge in the editor list still marks it** on the preview.

This step needs a human at a browser. Report what was seen, not what was
expected.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: record that badges are no longer reconfigured per tick

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## What this plan does not do

- **No version bump.** `package.json` stays at `1.0.0` and the changelog
  heading stays `1.1.0 — unreleased`, per AGENTS.md § Changelog and versioning:
  the bump lands with the release, and is never decided alone.
- **No profiling, no benchmark, no timing assertion.** The metric is a count.
- **No fix for the two moot follow-up items.** The gating removes their cost.
