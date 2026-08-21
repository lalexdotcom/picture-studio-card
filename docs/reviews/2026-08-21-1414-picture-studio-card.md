# Codebase Review — picture-studio-card

*2026-08-21 — 77 source and test files scanned (~18 000 lines) — full repo — 10 agents (bugs, types, security, robustness, architecture, conventions, best-practices, readability, performance, test)*
*Axes skipped: none*

## Global verdict: 🟡 WARNING

Three agents returned a BLOCKING verdict. Each of those three findings was
re-read against the actual source during synthesis, confirmed as factually
accurate, and then **downgraded to WARNING** — the reasoning is recorded under
"Severity re-calibration" below, so the decision is auditable rather than
silent. Nothing found in this pass breaks the card for a user or exposes them
to an exploit.

The headline is a genuine one: **two independent agents, with no visibility
into each other, converged on the same stale-config race in the editor's
`_addItem`.** That convergence is the strongest signal in this review.

---

## Agent summary

| Agent | Verdict | Summary |
|-------|---------|---------|
| Bugs | 🟡 WARNING | Two async races in the editor/card sync path can transiently lose a config change; four unguarded `boundingBox()` derefs in the screenshot scripts. |
| Types | 🟡 WARNING | No `any`, no `@ts-ignore`. The gap is the raw-YAML boundary: typed configs are *asserted* from unvalidated spreads rather than earned. |
| Security | 🟡 WARNING | No exploitable client-side vulnerability. One third-party GitHub Action pinned to a mutable tag while the release job holds write permissions. |
| Robustness | 🟡 WARNING | The `_addItem` TOCTOU, a double-dispatch path when `action-handler` binds late, and missing `isConnected` guards after awaits. |
| Architecture | 🟡 WARNING | The card runtime imports from the editor layer; four DRY violations duplicate size/chrome conversion rules across the two element forms. |
| Conventions | 🟡 WARNING | Two test-lane placement inconsistencies and one CSS block using hardcoded values where its sibling uses HA tokens. |
| Best Practices | 🟡 WARNING | `updated()` without a `PropertyValues` guard fires `setConfig` every hass tick; the drag interaction has no keyboard alternative. |
| Readability | 🟡 WARNING | An exceptionally well-commented codebase with two documentation defects: one stale JSDoc block and one orphaned one. |
| Performance | 🟡 WARNING | The `hass` setter and `shouldUpdate` guards are correct. All editor code ships unconditionally in the single runtime bundle. |
| Test | 🟡 WARNING | Runner confirmed as rstest. `createDragController`'s stateful behaviour is untested in isolation; two hold tests sleep against real time. |

---

## Severity re-calibration

Three findings arrived marked BLOCKING. All three are real — each was verified
against the source before this report was written. None of them blocks.

| Finding | Agent's level | Held at | Why |
|---|---|---|---|
| Card runtime imports `isSupportedBadgeType` from `src/editor/badge-catalog.ts` | BLOCKING | WARNING | Verified at [picture-studio-card.ts:18](../../src/card/picture-studio-card.ts#L18). A true layer violation worth fixing — but the module is side-effect-free constants, and the Performance agent independently established that the whole editor already ships in the same bundle. Nothing breaks; nothing grows. |
| Stale JSDoc before `reanchor()` naming the removed `_syncBadges` | BLOCKING | WARNING | Verified at [picture-studio-card.ts:724-736](../../src/card/picture-studio-card.ts#L724-L736); `_syncBadges` exists nowhere but in that comment. Misleading documentation is a real cost to the next reader, but no shipped behaviour depends on it. |
| `_addItem` commits a stale pre-await config snapshot | BLOCKING | WARNING | Verified at [picture-studio-editor.ts:242-252](../../src/editor/picture-studio-editor.ts#L242-L252). The race is genuine and is the top item below — but it needs a concurrent commit inside a short await, on the badge path only. The Bugs agent, which found it independently, also rated it WARNING. |

---

## 🟡 Warnings

### The convergent finding

#### [Bugs + Robustness] `_addItem` commits a stale config snapshot across an await
**File**: [`src/editor/picture-studio-editor.ts:242`](../../src/editor/picture-studio-editor.ts#L242)
**Found independently by two agents.**

`config` is captured at line 242, then `await stubBadgeConfig(...)` suspends at
line 246, and the stale snapshot is committed at line 249. Anything that
commits during that await — a second Add click, a drag commit, an anchor
change — is silently overwritten. `this.select(config.items.length)` at line
252 is stale for the same reason.

Only the badge path is affected: `stubElementConfig` is synchronous, so adding
an element never suspends.

**Fix**: re-read `this._config` after the await and commit from that.

```ts
const item = ev.detail.family === "badge" ? … : …;
const latest = this._config;
if (!latest) return;
this._commit({ ...latest, items: addItem(latest.items, item) });
this.select(latest.items.length);
```

#### [Bugs] `_syncItems` rebuilds the DOM from stale items after its await
**File**: [`src/card/picture-studio-card.ts:402`](../../src/card/picture-studio-card.ts#L402)
The same shape, one layer down: `items` is captured before `await
window.loadCardHelpers()` at line 418. A concurrent same-shape sync can
complete correctly, then be overwritten when the first call resumes and calls
`layer.replaceChildren()` from its stale snapshot. Self-correcting on HA's next
`setConfig`, but it costs a visible flash and can drop a drag position for a
frame.
**Fix**: re-read `this._config?.items` after the await rather than closing over
the pre-await capture.

---

### Architecture

#### Card runtime imports from the editor layer
**File**: [`src/card/picture-studio-card.ts:18`](../../src/card/picture-studio-card.ts#L18)
`isSupportedBadgeType` encodes shared policy — "is this badge type one the card
accepts?" — not editor UI logic, so both its home and its consumer are wrong.
**Fix**: move `isSupportedBadgeType`, `CORE_BADGES` and `CUSTOM_PREFIX` to the
shared layer (`src/config.ts` or a new `src/badge-types.ts`); `badge-catalog.ts`
re-exports them for existing callers.

#### `iconSizeSchema` and `labelSizeSchema` are byte-for-byte identical
**Files**: [`state-icon-form.ts:83`](../../src/editor/state-icon-form.ts#L83), [`state-label-form.ts:85`](../../src/editor/state-label-form.ts#L85)
Same select, same options, same bounds, same slider — the only difference is a
comment. Any change to a bound or a label must be made twice.
**Fix**: one `sizeSchema(mode, localize, hass, radioGroupAvailable)` in
`element-form.ts`, called from both.

#### The size/chrome form-data conversion rules are stated twice
**Files**: [`state-icon-form.ts:177`](../../src/editor/state-icon-form.ts#L177), `state-label-form.ts`
Both `toFormData`/`fromFormData` pairs duplicate the same five size fields with
the same `Math.round` guards, and the same chrome base fields with the same
`none`→`auto` fallback and `× 100` conversion. "Integer rounding, percentages
divide by 100" is a business rule written in two places that can drift per kind.
**Fix**: extract `sizeToFormFields` / `sizeFromFormFields` /
`chromeBaseToFormFields`; each kind spreads the shared part and handles only its
own additions.

#### `showsNothing` is exported, then re-implemented inline
**File**: [`src/editor/element-form.ts:281`](../../src/editor/element-form.ts#L281)
`badge-list.ts` exports `showsNothing`; `element-form.ts` writes
`isLabel && (element as StateLabelConfig).show.length === 0` instead of calling
it. Same rule, two encodings.

#### Item-analysis functions live in a rendering component
**File**: [`src/editor/badge-list.ts:89`](../../src/editor/badge-list.ts#L89)
`itemsSeverity`, `showsNothing` and `hasUnreadableVisibility` sit in a UI
component, forcing the editor root to import from its own child module to get a
utility. `items.ts` already hosts every other item-analysis function.

---

### Types

#### YAML spread asserted into a typed config without per-field validation
**File**: [`src/config.ts:261`](../../src/config.ts#L261)
`normalizeElementConfig` spreads `Record<string, unknown>` and asserts
`as StateIconConfig` / `as StateLabelConfig`. A YAML author writing
`entity: 123` gets a value the declared type promises is a `string` and is not.
The interface is asserted, not earned.
**Fix**: validate the string fields (`entity`, `icon`, `color`, `name`) and the
action fields after the spread, or build the object field-by-field.

#### `storedConfig` bypasses the discriminated union
**File**: [`src/config.ts:401`](../../src/config.ts#L401)
`item.config as ElementConfig & { show?: LabelPart[] }` destructures across both
variants at once. Narrowing on `item.config.type` first would make the `show`
access safe with no cast.

#### `PictureStudioConfig` double-cast round-trip
**File**: [`src/editor/form-schemas.ts:117`](../../src/editor/form-schemas.ts#L117)
`config as unknown as Record<string, unknown>` → mutate → `as unknown as
PictureStudioConfig`. The closing cast re-asserts the type unconditionally, so a
mistake in the key manipulation is invisible to the compiler. Same pattern at
`picture-studio-editor.ts:209`.

#### `replaceConfig` can produce an invalid `PictureItem`
**File**: [`src/editor/items.ts:30`](../../src/editor/items.ts#L30)
Spreading `config` onto an `UnknownItem` yields `{ type: "unknown", raw, reason,
config }` — no valid variant. Safe by convention today, not by construction.
**Fix**: `if (item.type === "unknown") return item;`, mirroring `setAnchor` and
`setVisibility`.

---

### Best Practices

#### `updated()` without a `PropertyValues` guard calls `setConfig` every hass tick
**File**: [`src/editor/badge-form.ts:45`](../../src/editor/badge-form.ts#L45)
`protected updated(): void { void this._syncEditor(); }` takes no changed-props
map, and `_syncEditor()` ends in `this._editor.setConfig(badge)`. HA publishes
`hass` on every state change in the house, so native badge editors receive a
`setConfig` per tick.
**Fix**: `updated(changed: PropertyValues)` and gate the `setConfig` on
`changed.has("badge")`.

#### Side effect inside `render()`
**File**: [`src/editor/badge-list.ts:212`](../../src/editor/badge-list.ts#L212)
`render()` calls `probeBadgeType(type, () => this.requestUpdate())`, which can
register a callback, start a timer and kick off `loadCardHelpers()`. Lit's
contract is that `render()` is a pure function of reactive state.
**Fix**: move the probe calls to `updated()`; `render()` reads only the settled
cache.

#### The drag interaction has no keyboard alternative
**File**: [`src/card/drag-layer.ts`](../../src/card/drag-layer.ts)
Positioning a badge on the picture is pointer-only — no `keydown`, no role, no
ARIA. `ha-sortable` covers stacking order in the list, but not position on the
image, and the drag is the sole mechanism for that. WCAG 2.1 SC 2.1.1.
**Fix**: arrow-key nudging on the selected wrapper, committing through the same
`onCommit`.

---

### Robustness

#### Late `action-handler` binding leaves the click fallback attached
**Files**: [`state-icon-element.ts:210`](../../src/card/state-icon-element.ts#L210), [`state-label-element.ts:226`](../../src/card/state-label-element.ts#L226)
When `actionHandler()` returns `undefined` on first render, a permanent
`"click"` listener is attached and `_clickFallback` is set. A later `updated()`
that *does* find the handler calls `handler.bind(...)` — but never removes the
fallback. Both then fire on one tap, dispatching `hass-action` twice.
**Fix**: remove the listener when a real handler becomes available, or
deduplicate within one tick.

#### `pointercancel` commits the displaced position
**File**: [`src/card/drag-layer.ts:291`](../../src/card/drag-layer.ts#L291)
`pointercancel` is registered to the same handler as `pointerup`, so a scroll
takeover or palm rejection writes the mid-gesture position to the config. The
user did not end the drag; the system cancelled it. Drag state is correctly
reset, so nothing leaks — the badge just ends up somewhere it was not put.
**Fix**: restore `originStyle` on cancel regardless of displacement.

---

### Security

#### Third-party Action on a mutable tag, in a job holding write permissions
**File**: [`.github/workflows/release.yml:98`](../../.github/workflows/release.yml#L98)
`softprops/action-gh-release@v2` is pinned to a movable major tag while the job
holds `contents: write` and `actions: write`. If that tag is ever redirected,
arbitrary code runs with enough scope to publish releases — and HACS users
install from those release assets.
**Fix**: pin to a commit SHA and add a Dependabot `github-actions` entry to keep
the pin current.

The client-side surface came back clean: no `unsafeHTML`, no `innerHTML` with
user data, every user-supplied value reaching the DOM through a Lit binding or
`style.setProperty()`, and the single `unsafeCSS` call taking a compile-time
constant.

---

### Performance

#### The whole editor ships in the runtime bundle
**File**: [`src/index.ts:1`](../../src/index.ts#L1)
All eight editor components are imported and registered at top level — ~3 900
lines that every dashboard viewer parses on every page load without ever opening
the editor. With `bundle: true` and `autoExternal: false` there is one file and
no splitting.
**Fix**: `getConfigElement()` is called lazily by `hui-card` and is the natural
seam — a dynamic `import()` there, or a second rslib entry.

#### `customElements.get("state-display")` on every render
**File**: [`src/card/state-label-element.ts:133`](../../src/card/state-label-element.ts#L133)
Queried unconditionally on every render that passes `shouldUpdate`. Once
defined, the element stays defined, so the answer is permanently cacheable after
the first `true`.

---

### Conventions

#### Test file in the wrong directory and misnamed
**File**: [`src/tests/happy-dom/drag-threshold.test.ts`](../../src/tests/happy-dom/drag-threshold.test.ts)
It tests `src/card/drag-layer.ts`, but sits at the happy-dom root (reserved for
top-level `src/` modules) under a name that matches no source file. Every other
`card/` module has its test in `src/tests/happy-dom/card/`, named after its
source.
**Fix**: move to `src/tests/happy-dom/card/drag-layer.test.ts`.

#### Hardcoded CSS where the sibling file uses HA tokens
**File**: [`src/editor/badge-form.ts:154`](../../src/editor/badge-form.ts#L154)
`.header { gap: 8px }` and `.title { font-weight: 500 }`, where
`element-form.ts` renders the same Back-button-plus-title structure with
`var(--ha-space-1)` and `var(--ha-font-weight-medium)`. The values also differ
numerically. The rest of the file uses tokens correctly.

---

### Readability

#### Stale JSDoc naming a method that no longer exists
**File**: [`src/card/picture-studio-card.ts:724-736`](../../src/card/picture-studio-card.ts#L724-L736)
Two JSDoc blocks are stacked before `reanchor()`. The first describes a guard on
"the position being unchanged" that the current body does not have, and
references `_syncBadges` — a method that exists nowhere else in the repo. The
second block is accurate.
**Fix**: delete the first block; the second is sufficient.

#### JSDoc for `normalizeConfig` orphaned before `hasVisibility`
**File**: [`src/config.ts:278`](../../src/config.ts#L278)
The block "Validate and fill in defaults…" sits before `hasVisibility` (which
has its own one-line doc), so both TSDoc and a linear reader attach it to the
wrong function — and `normalizeConfig`, a large public function, ends up with no
doc at all.
**Fix**: move the block down to sit directly above `export const normalizeConfig`.

---

### Test

#### `createDragController`'s stateful behaviour is untested in isolation
**File**: [`src/card/drag-layer.ts:131`](../../src/card/drag-layer.ts#L131)
The pure predicates are well covered, but the controller is exercised only
through Playwright. Untested: the non-left-button guard, the second-pointer
guard, the `pointercancel` path, `draggingIndex()`, and `detach()`. Note that
the `pointercancel` robustness finding above is exactly a behaviour no test
pins.

#### Two hold-path tests sleep against real time
**File**: [`src/tests/playwright/drag.test.ts:76`](../../src/tests/playwright/drag.test.ts#L76)
`setTimeout(resolve, DRAG_HOLD_MS + 50)` — 50 ms of slack over a 300 ms hold is
thin on a shared runner. The `DragOptions.now` seam exists precisely for this;
the card never forwards it.
**Fix**: thread a fake clock through the card's `createDragController` call and
move the boundary assertions to happy-dom.

#### Most per-domain `stateActive` branches are untested
**File**: [`src/state-color.ts:155`](../../src/state-color.ts#L155)
Twelve domain-specific cases diverge from the default "off = inactive" rule;
tests cover roughly four. Untested: `alarm_control_panel`, `media_player`,
`lawn_mower`, `vacuum`, `valve`, `plant`, `group`, `timer`, `camera`,
`schedule`. This module is a verbatim copy of non-exported HA code — a
reconciliation error maps to a wrong colour token permanently, with nothing to
catch it.

---

## ✅ Validated points

- **Security**: no exploitable client-side vulnerability. No `unsafeHTML`, no
  `innerHTML` fed with user data; every user-supplied value reaches the DOM
  through a Lit binding or `style.setProperty()`, which the browser treats as an
  opaque custom-property value. The one `unsafeCSS` call takes a compile-time
  constant.
- **Types**: no explicit `any`, no `@ts-ignore`, no `@ts-expect-error` used as a
  suppression anywhere in the source. `strict` plus `noUncheckedIndexedAccess`
  is doing real work.
- **Performance**: the `hass` setter and the `shouldUpdate` guards are correctly
  written — the card does not re-render on unrelated state ticks, which is the
  single most common defect in this class of card.
- **Readability**: "an exceptionally well-commented codebase" — deliberate *why*
  comments are the norm and are almost universally accurate. The two findings
  are documentation drift, not absence.
- **Conventions**: no violation of the AGENTS.md rules on changelog authorship,
  section ordering, or version mirroring. `CHANGELOG.md`, `package.json` and the
  last tag agree at 1.5.0.
- **Test**: the suite is broadly thorough — 35 test files against 37 source
  files, with a deliberate happy-dom / Playwright split and a documented
  rationale for which suite answers what.
- **Bugs**: no logic inversion, no unbounded loop, no use-before-initialization,
  no missing return found anywhere in the source. Both findings are async
  ordering, not logic.

---

*Review generated by the review-codebase skill*
*Scope: full codebase — 77 source and test files — 10 axes*
*Saved to: docs/reviews/2026-08-21-1414-picture-studio-card.md*
