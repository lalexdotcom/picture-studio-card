# Sizing-modes implementation report

Date: 2026-08-14

## What was changed per point

### 1. Three sizing modes (`element-size.ts`)

`IconSize` interface: replaced `auto: boolean` with
`mode: "auto" | "adaptive" | "fixed"` and added `value: number`. Five fields
total.

`DEFAULT_ICON_SIZE`: `{ mode: "auto", ratio: 3.5, min: 40, max: 70, value: 48 }`.
48 chosen as a plausible fixed starting point, not sacred.

`iconSizeCss`: branches on `mode`.
- `"fixed"` → `${value}px` — no clamp, no cqw.
- `"auto"` → `clamp(40px, 3.5cqw, 70px)` from DEFAULT_ICON_SIZE.
- `"adaptive"` → `clamp(${min}px, ${ratio}cqw, ${max}px)`.

`normalizeIconSize`: handles the legacy `{ auto: true/false }` shape with a
read-compatibility comment; uses `Partial<Record<string, unknown>>` (string keys)
so reading the non-interface `auto` key compiles cleanly.

`isDefaultIconSize`: compares all five fields.

`storedConfig` comment in `config.ts` updated from "four" to "five" fields.

### 2. The form (`editor/element-form.ts`)

`stateIconSizeSchema(mode, localize, hass)`:
- Radio list via `{ selector: { select: { mode: "list", options: [...] } } }`.
- Option labels: `ui.common.auto` for auto, `localizeOwn` for adaptive and fixed.
- `"auto"` → `[modeField]` only.
- `"adaptive"` → `[modeField, size_ratio row, grid(size_min, size_max)]`.
- `"fixed"` → `[modeField, size_value row]`.
- Every number field carries `mode: "box"`.

`toFormData` / `fromFormData`: replaced `auto_size` with `size_mode`, added
`size_value`.

`elementFormLabel`: handles `size_mode`, `size_value` via our own strings;
`size_ratio` still uses our `ratio` string; `size_min`/`size_max` still use HA's
generic `minimum`/`maximum`.

`PictureStudioElementForm.render()`:
- `stateIconSizeSchema` called with `element.size.mode`.
- Separator (`<div class="separator">`) between size form and anchor picker.
- Sub-heading (`<div class="anchor-heading">`) with `localizeOwn(hass, "anchor")`.

CSS:
- `ha-form { margin-bottom: var(--ha-space-6, 24px) }` — was `var(--ha-space-3)`.
- `.content ha-form { margin-bottom: 0 }` — unchanged.
- `.separator`: `border-top: 1px solid var(--divider-color); margin: var(--ha-space-3, 12px) 0`.
- `.anchor-heading`: `--secondary-text-color`, `--ha-font-size-s`, `--ha-font-weight-medium`.

### 3. The anchor picker (`editor/anchor-picker.ts`)

Proportional switch label: `this.hass?.localize("ui.common.auto") || "Automatic"`.
Replaced `localizeOwn(this.hass, "anchor_proportional")`. `localizeOwn` import
kept because `anchor_anchored` still uses it.

### 4. Strings (`strings.ts`)

Removed: `anchor_proportional` (en: "Proportional", fr: "Proportionnel").
Added:
- `size_mode`: "Size" / "Taille" — label for the radio group.
- `size_mode_adaptive`: "Adaptive" / "Adaptative".
- `size_mode_fixed`: "Fixed" / "Fixe".
- `size_value`: "Value" / "Valeur" — label for the fixed value number field.

### 5. Section spacing

`ha-form` top-level `margin-bottom` raised from `var(--ha-space-3)` (12 px) to
`var(--ha-space-6, 24px)` in `PictureStudioElementForm`. Badge form not touched.

### 6. Documentation

- `docs/superpowers/specs/2026-08-13-state-icon-element-design.md`: Config block,
  Types block, Sizing section, and Rejected alternatives updated to three modes.
- `CHANGELOG.md`: unreleased Added entry updated in-place (single feature,
  nothing shipped yet).
- `README.md`: `size:` example block and "Icon sizing" section rewritten.

## Translation keys searched and findings

Searched in:
- `/usr/local/lib/python3.14/site-packages/hass_frontend/static/translations/fr-*.json`
- `.../lovelace/fr-*.json`

Keys searched for (French and English values):
- "adaptive", "adaptif", "adaptative" — not found.
- "fixed", "fixe" (in sizing/mode context) — `edit_view.background.attachment.options.fixed`
  ("Fixée") found but scoped to image backgrounds, not reusable.
- "size mode", "mode d'icône", "icon_size" — not found.
- "value", "valeur" (as a generic label) — not found in a reusable form.
- "ui.common.*" enumerated — only `ui.common.auto` ("Automatique") is suitable.

Reused: `ui.common.auto` (already used for "Automatic" in the auto option label
and the picker switch).
New strings added: 4 (`size_mode`, `size_mode_adaptive`, `size_mode_fixed`,
`size_value`). All confirmed absent from the HA lovelace and main catalogues.

## Tests added — RED → GREEN evidence

### `element-size.test.ts`

Before (RED on new tests, wrong on old ones):
- `iconSizeCss` tests referenced old `auto` field → TS error.
- No `fixed` mode test.
- No legacy-shape tests.

After (GREEN):
- `iconSizeCss`: auto uses card defaults regardless of stored numbers; adaptive
  uses own numbers; fixed emits plain `48px`, uses `value` not `min`/`max`.
- `normalizeIconSize`: legacy `auto: true` → `mode:"auto"`; legacy `auto: false`
  → `mode:"adaptive"`; keeps all five fields; falls back per field on non-finite.
- `isDefaultIconSize`: true only with all five matching the defaults including
  `value: 48`.

### `element-form.test.ts`

Before (RED):
- `stateIconSizeSchema(true)` signature — TS error.
- `toFormData` expected old `auto_size` field.

After (GREEN):
- Schema per mode: auto shows only size_mode; adaptive shows ratio + min/max;
  fixed shows size_value; every number field has `mode:"box"`.
- Options: three values `["auto", "adaptive", "fixed"]`, select mode `"list"`.
- `toFormData`: five flat fields including `size_mode` and `size_value`.
- Round-trips for all three modes including keeping numbers when switching to auto.
- `elementFormLabel`: `size_mode` → "Size", `size_value` → "Value".

### `config.test.ts` (storedConfig)

Updated two tests (auto-with-numbers, manual) to new shape; added a `fixed` test.
All pass.

## Test / typecheck / lint output

```
pnpm test      → No test failures reported.
pnpm typecheck → (exit 0, no output)
pnpm lint      → Found 3 warnings. (pre-existing noNonNullAssertion, unchanged)
```

## Files changed

- `src/element-size.ts`
- `src/config.ts` (comment only)
- `src/editor/element-form.ts`
- `src/editor/anchor-picker.ts`
- `src/strings.ts`
- `src/tests/element-size.test.ts`
- `src/tests/card/state-icon-element.test.ts`
- `src/tests/editor/element-form.test.ts`
- `src/tests/strings.test.ts`
- `src/tests/config.test.ts`
- `docs/superpowers/specs/2026-08-13-state-icon-element-design.md`
- `CHANGELOG.md`
- `README.md`
- `.superpowers/sdd/2026-08-13-state-icon-element/sizing-modes-report.md` (this file)

## Self-review findings

1. `stateIconSizeSchema` rebuilds the option labels on every render because it
   receives `localize` as a live function. This is the correct HA pattern —
   labels must update when the user switches language.

2. The `get` helper in `element-form.test.ts` was added to avoid `as any` casts
   that Biome's `noExplicitAny` rule flags as errors. It is typed
   `(obj: unknown, ...keys: string[]): unknown` and avoids `any` throughout.

3. `storedConfig` drops `size` only when all five fields equal the defaults. A
   config in `"auto"` mode with non-default `min`/`ratio`/`max`/`value` is
   written out — the user may have typed them before switching to auto, and
   dropping them would lose their work.

4. Legacy `{ auto: false }` configs stored during development are read as
   `mode: "adaptive"` and will be rewritten to the new shape on the next editor
   commit. This is intentional and documented in `normalizeIconSize`.

5. The badge form's spacing was not touched (it doesn't have the same ha-form +
   expansion-panel pattern).

## Concerns

None. The three `noNonNullAssertion` warnings are pre-existing and unchanged.

---

## Review fix — 2026-08-14

### Findings addressed

**1. (Documented, risk does not exist.)** Reviewer flagged that `fromFormData`
might reset non-visible fields to defaults when `ha-form` only re-emits the
active schema's fields. Read the ha-form source; this does not happen. ha-form's
`addValueChangedListener` merges the changed child onto the full `.data` it was
given:

```ts
this.data = { ...this.data, ...newValue };
fireEvent(this, "value-changed", { value: this.data });
```

Because we pass `toFormData(element)` (all five size fields) as `.data`, every
field comes back regardless of which rows the mode's schema is showing. Added a
comment to `fromFormData` quoting the merge line and stating the invariant:
"`.data` must be the complete flat record; the schema decides what is *shown*,
never what is *carried*."

**2. (Pinned with a test.)** Added `"degrades gracefully when non-schema keys are
absent"` to the `toFormData / fromFormData` suite. It calls `fromFormData` with
a `data` object carrying only `size_mode: "fixed"` (no `size_value`, `size_min`,
etc.) and asserts that `normalizeIconSize` fills in the defaults rather than
crashing. Documents what happens if the ha-form invariant is ever broken.

**3. (JSDoc fixed.)** `isDefaultIconSize` in `src/element-size.ts` had a JSDoc
reading "All four fields, not just `auto`". Changed to "All five fields, not just
`mode`" to match the updated interface and the parallel comment in `config.ts`.

### Test output

```
pnpm test      → No test failures reported. (1 new test in toFormData/fromFormData suite)
pnpm typecheck → (exit 0)
pnpm lint      → Found 3 warnings. (pre-existing noNonNullAssertion, unchanged)
```

### Files changed in this commit

- `src/element-size.ts` — JSDoc on `isDefaultIconSize`
- `src/editor/element-form.ts` — comment on `fromFormData`
- `src/tests/editor/element-form.test.ts` — degradation test
