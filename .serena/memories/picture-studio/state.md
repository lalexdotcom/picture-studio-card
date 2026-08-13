# picture-studio — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-studio`: an image with
Lovelace **badges** placed on it, positioned by **dragging them on the live
preview** inside the normal card-edit dialog. "picture-elements, but the items
are badges and you place them with the mouse".

**Merged.** `feat/picture-badges` was merged into `main` with `--no-ff`
(merge commit `42dea4b`) and the branch was deleted. **Nothing is pushed** —
`main` is ahead of `origin/main`. Single-file build `dist/picture-studio.js`
(~61 kB / 16 kB gzip).

**1.0.0 was released on 2026-08-12** (tag `v1.0.0`, at `06e2080`).

`feat/item-anchor` adds the per-item anchor: ten values, `proportional`
(default) plus the nine fixed grid positions. Verified in the browser in both
view layouts and **merged into `main`**; 148 unit tests, `tsc --noEmit` clean,
Biome clean. It ships in 1.1.0, which is **not released yet** — the performance
follow-up below belongs to the same version.

## Where things are

- Spec (authoritative, amended several times): `docs/superpowers/specs/2026-08-11-picture-badges-design.md`
- Spec (anchor feature, amends the above): `docs/superpowers/specs/2026-08-12-item-anchor-design.md`
- Plan: `docs/superpowers/plans/2026-08-11-picture-badges.md`
- Plan (anchor feature): `docs/superpowers/plans/2026-08-12-item-anchor.md`
- Local HA for testing: `docker compose` in the repo, container
  `picture-studio-ha` (image `:stable`, currently 2026.8.1),
  http://localhost:8123, resource at `/local/picture-studio/picture-studio.js?v=1`.
  Mushroom is installed as a third-party badge provider at `/local/mushroom/mushroom.js`.
- The shipped frontend bundle is readable inside the container at
  `/usr/local/lib/python3.14/site-packages/hass_frontend/frontend_latest/*.js`.
  Grepping it is the fastest way to check what the user's HA actually does,
  as opposed to what `dev` on GitHub does.

## Source layout

```
src/position.ts        px <-> % conversion, anchor-aware style and bounds derivation (pure, tested)
src/config.ts          config shape, normalization, ImageSource/imagePath, tags (pure, tested)
src/strings.ts         our own en/fr catalog — four strings (pure, tested)
src/broker.ts          editor registry + subscribeEditors, and the card registry (pure, tested)
src/types.ts           hand-declared HA interfaces, incl. LocalizeFunc, LovelaceGridOptions
src/card/picture-studio-card.ts   background element + badge children + lifecycle
src/card/drag-layer.ts            pointer gesture, injected callbacks, no HA knowledge
src/editor/picture-studio-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/background-schema.ts      ha-form schema, labels, form <-> config mapping
src/editor/badge-list.ts             header, hint, ha-sortable rows, ha-dropdown add button
src/editor/badge-form.ts             hosts the badge's own native config form, then the anchor picker
src/editor/anchor-picker.ts          hand-built 3×3 grid, fixed anchors + proportional switch; emits `anchor-changed`
src/editor/badge-catalog.ts          core + custom badge choices, choiceLabel, class lookup
src/editor/badge-items.ts            add / replace / move / remove / setAnchor (pure, tested)
src/suggestion.ts      entity-first card picker suggestion (pure, tested)
src/index.ts           registration + the window.customCards entry
src/tests/**           every test, mirroring the source tree
```

## Config shape (current)

```yaml
type: custom:picture-studio
image: /local/plan.png          # or { media_content_id, media_content_type }
entity: light.salon             # needed for state_image / state_filter to resolve
title: My floorplan             # ha-card header
items:
  - type: badge                 # discriminant; "element" is rejected, reserved for later
    position: { top: 30%, left: 45% } # any finite number; a bare number is read too
    anchor: center              # absent => proportional (the default)
    config:                     # the badge's own config, opaque to us
      type: custom:mushroom-template-badge
      entity: light.salon
```

`BACKGROUND_KEYS` (forwarded to `hui-image-element`): `entity`, `image_entity`,
`image`, `camera_image`, `camera_view`, `state_image`, `state_filter`,
`dark_mode_image`, `dark_mode_filter`, `aspect_ratio`, `filter`. **Not** `title`
(card header) and **no actions at all**.

## Decisions that must not be re-litigated

- **Anchor is per-item; `proportional` is the default.** Ten values: `proportional`
  plus the nine fixed `top-left` / `top-center` / `top-right` / `center-left` /
  `center` / `center-right` / `bottom-left` / `bottom-center` / `bottom-right`.
  `positionStyle` takes both the position and the anchor; all offsets are derived
  at render, never stored — `storedConfig` omits `anchor` when it equals
  `proportional`, so an existing config round-trips byte-identical. Within
  `0-100`, and only under `proportional`, overflow is structurally impossible:
  the real offset works out to `L/100 × (C − E)`, so 0 is flush top-left and
  100 flush bottom-right. Fixed anchors shift with a constant `translate` from
  the `ANCHOR_OFFSETS` table; out-of-range positions are expressible and preserved.
- **Ratcheting drag bounds, computed live in `pointermove`, never at `pointerdown`.**
  Bounds (`AxisBounds`, seeded from `OPEN_BOUNDS`) only tighten: each move calls
  `tighten` around the item's current position, then `advance` clamps the
  requested position. A drag can neither create an overflow nor worsen one; an
  item already out of range follows the cursor faithfully and commits where
  dropped.
- **Re-anchoring is a question the editor asks the preview *before* it writes.**
  `patchAnchor` calls `activeCard()?.reanchor(index, anchor)` on the broker's
  card registry, then commits anchor and position in **one** write via
  `setAnchor`. The card measures `.layer` and the wrapper and returns the
  coordinates; when it cannot, the coordinates stay and the item moves — the
  honest degradation. Two commits would render the new anchor against the old
  coordinates for a frame, which is the jump the exchange exists to avoid.
  *A card-side diff of "the anchor I last rendered" was tried first and cannot
  work — see the HA facts below on card rebuilding. Do not reintroduce it.*
- **`CardChannel` is the editor → card hop**, mirroring `EditorChannel`. Cards
  register only while editing, so exactly one — the dialog's preview — is in the
  registry while a dialog is open.
- **Pixels during the drag, percentages on release.** One commit per gesture.
  Entry and exit must both write position and transform *together*.
- **Percent strings in the stored config, numbers in the code.** `parsePercent`
  reads `30`, `"30"` and `"30%"`; `storedConfig` serialises back to `"30%"` at
  `_reemit`, the single exit to HA. Accepting the notation without also writing it
  would have been worse than not accepting it: the first drag would silently
  rewrite what the user typed. Unquoted `top: 30%` is a plain string in YAML —
  verified with the container's own PyYAML — while a *leading* `%` would be a
  scanner error, which never happens here. **The clamp to `[0, 100]` is removed
  from all three of `parsePercent`, `toPercent`, and `percentString`** — a bound
  left in any one of them puts an overflowing item back, and silently rewriting
  a hand-typed `left: 150%` was never the right answer (same principle as the
  notation: normalising what was written widens the gap between config and intent).
  This is a knowing behaviour change even for configs that use no anchor.
- **One `items[]` list with a `type` discriminant**, payload nested under
  `config`, so a third-party badge's own keys can never collide with ours.
- **No `z-index`, ever.** Stacking is DOM order = list order, and the list is
  reorderable. The editor says so, in the user's language.
- **Single-file build.** Never reintroduce a dynamic import: it once split the
  bundle and shipped a static `import … from "./612.js"` that killed the card.
- **No TypeScript decorators.** Lit components use `static properties`.
- **Lit is bundled**, never read off an HA prototype.
- **`config` is opaque**: never read, validate, reorder or rewrite a badge's
  config. Reading `entity`/`name`/`type` for a row label is the one exception.
- **We stay on `hui-image-element`** even though picture-elements' card renders
  `hui-image` directly. The element resolves `image_entity` (image/person) and
  unwraps the media object for us, and `hui-image` has no public factory — we
  would need `loadCardHelpers()` anyway just to pull its chunk in.

## Hard-won facts about Home Assistant (verified in their source)

- **HA rebuilds the card element on every config change.** `hui-card` calls
  `createCardElement`, not `setConfig` on the existing instance — visible in a
  stack trace as our constructor under `create-card-element.ts` /
  `hui-card.ts`. **No card-side state survives a commit.** Anything the editor
  needs from the live preview must be asked for *before* it writes. This is what
  killed the first re-anchor design, which diffed the anchor the card had last
  rendered: the arrays were always empty, so the diff compared `undefined` to
  the new anchor and never fired.
- **`preview` on a card does not mean "I am the edit dialog's preview".** HA sets
  it on every card of a dashboard in edit mode (`card.preview =
  lovelace.editMode`, and `preview = !0` in `hui-card-options`) so a click edits
  the card instead of firing its actions. Reading it as "the dialog" put two
  cards in our registry and armed the drag on every picture-studio card behind
  an open dialog.
  What separates them is the **edit chrome a dashboard wraps its cards in**, and
  which the dialog's preview does not have: `hui-card-options` in a masonry
  view, `hui-card-edit-mode` in a section. `_inEditPreview()` walks up, hopping
  shadow boundaries, and excludes itself on either. The add-card dialog renders
  its preview without that chrome too, so the feature works there; the
  card-picker gallery has none of it but never has an editor mounted.
  **Do not "simplify" this to a test on the `preview` attribute.** It was tried,
  it reads better, and it works in masonry — where `hui-card` declares `preview`
  with no `reflect`, so the attribute exists only where the dialog wrote it
  literally. It then fails **silently in sections**: `hui-section` is the single
  component in the frontend declaring `preview` with `reflect: true`, so the
  attribute is present there whoever set it, and every dashboard card in a
  section passes. Observed failing in the browser after passing in masonry.
- **A slotted element is not a DOM ancestor.** `closest()` walks the real tree,
  not the flattened one, so anything we are *slotted into* is invisible to an
  ancestor walk — reaching it needs `assignedSlot`. This is why "detect a native
  `<dialog>` above us" was rejected: `ha-dialog` is what the edit dialog uses in
  2026.8.1, it renders no native `<dialog>` of its own, and the native element
  further down the stack is never an ancestor of ours.
- **The native badge dialogs are unreachable.** `showCreateBadgeDialog` /
  `showEditBadgeDialog` fire `show-dialog` with a `dialogImport` closure their
  bundler resolved at build time; `make-dialog-manager.ts` silently returns
  false in production. We add badges with our own picker and edit them through
  the badge class's own `static getConfigElement()`.
- **`window.customBadges` holds tag names, not config types.** `badgeCatalog`
  prefixes `custom:` at the boundary.
- Core badges are exactly `entity` and `shortcut` (`coreBadges`, not importable).
- `hui-image` resolves `state_image` / `state_filter` against **its `entity`
  property**. Without `entity` they are inert.
- **`hui-image-element.setConfig` defaults `tap_action` AND `hold_action` to
  `more-info`** when absent, toggles a `clickable` class, and feeds
  `computeTooltip`, which invents a "Tap to show more info" hover tooltip.
  Both must be pinned to `{ action: "none" }`; pinning only one leaves the
  hold tooltip behind.
- **`title` means two different things.** picture-elements puts it in
  `<ha-card .header>`; `hui-image-element` passes it to `computeTooltip`, i.e.
  a hover tooltip. We render it as the header ourselves.
- **`hui-image-element` unwraps `image.media_content_id` but not
  `dark_mode_image`** — it hands the raw value to `hui-image`, which wants a
  string. We unwrap both in `_bgConfig` via `imagePath`.
- **`ha-selector-media` reads `value.media_content_id` and nothing else.** A
  plain path shows an empty picker and opens the browse dialog with no
  `defaultId`, so "manual entry" is blank too. Their editor wraps strings in
  `_processData`; `backgroundData` does the same.
- **Labels come from HA's catalog, keyed on the field name**:
  `ui.panel.lovelace.editor.card.generic.<name>`, except `dark_mode_image`,
  `state_filter`, `dark_mode_filter`, which live under
  `…card.picture-elements.<name>`. Always with their `|| name` fallback.
  Reusable keys we already use: `editor.badges.name` / `.edit` / `.remove`,
  `editor.edit_badge.add`, `editor.badge.<type>.name`,
  `…picture-elements.card_options`, `…picture.content_id_helper`,
  `…generic.camera_view_options.<value>`.
- **No API lets a custom card register translations.** `localize` serves HA's
  own keys, `loadBackendTranslation` needs an integration behind it,
  `loadFragmentTranslation` is for HA's panels. Hence `src/strings.ts`.
- An **undefined `ha-selector-*` tag proves nothing**: `ha-selector.ts` holds a
  table of 58 dynamic loaders and pulls the sub-component itself. Test a
  selector by rendering a form that uses it, not by probing `customElements`.
- `ha-sortable` **is** defined in the card-edit dialog; the badge dialogs are not.
- **`ha-control-select` is not safe for custom cards.** It would have been the
  natural segmented control for the anchor picker, but it lives in a single
  lazily loaded frontend chunk and cannot be relied on to be defined — verified
  in the container's bundle for 2026.8.1. The anchor picker is hand-built.
- `hui-sub-element-editor` handles `row`, `header`, `footer`, `element`,
  `feature`, `heading-badge` — **not** `badge`.
- **`visibility` on a badge does nothing here.** HA evaluates those conditions in
  the *container* (`checkConditionsMet`, internal). Documented as unsupported.
- `applyThemesOnElement` is internal, so `theme` cannot be honoured — which is
  why the background form drops the field picture-elements has.
- **Sections grid sizing** (`hui-grid-section.ts`): 12 columns × `column_span`,
  `--row-height: 56px`, `--row-gap: 8px`. `rows: N` adds `.fit-rows`, i.e.
  `height: N×64−8` px; `rows: "auto"` follows the content; `columns: "full"` is
  `grid-column: 1 / -1`. `hui-card` is `height: 100%`, so a card that does not
  claim that height spills out of its cell.
- **`hui-picture-elements-card` declares neither `getGridOptions` nor
  `getLayoutOptions`**, so it shows the same "does not fully support resizing"
  banner we did. Verified in their source and in the shipped bundle. We declare
  `{ columns: 12, rows: "auto", min_columns: 3 }` anyway — the one place we
  deliberately do better than picture-elements.
- `hui-image.fitMode` exists but `hui-image-element` does not forward it, and
  picture-elements refuses to expose `fit_mode` on purpose: cropping breaks the
  correspondence between percentages and image content.

## Version floor (settled 2026-08-12)

Method, reusable: read the frontend build pinned in HA core's
`homeassistant/components/frontend/manifest.json` at tag `<version>`, then read
the frontend source at that tag. Both are plain `raw.githubusercontent.com`
fetches, no auth. 2025.12.0 → 20251203.0, 2026.2.0 → 20260128.6,
2026.5.0 → 20260429.3, 2026.7.0 → 20260624.3.

Already present in 2025.12, so **not** constraining: `ha-dropdown` /
`ha-dropdown-item`, `ha-button` with `appearance`, the `--ha-space-*` tokens
(`src/resources/theme/core.globals.ts`), `getGridOptions` on `LovelaceCard`, and
every media selector option we use (`image_upload`, `content_id_helper`,
`accept`, `hide_content_type`, `clearable`).

What actually constrains:

| Dependency | From | Below it |
| --- | --- | --- |
| `editor.badges.name` / `.edit` / `.remove` keys | 2026.2 | English fallback |
| **`shortcut` in `coreBadges`** | **2026.5** | **broken**: our picker offers a type the frontend cannot create |
| `ha-button size="s"` (`small\|medium\|large` → `xs…xl`) | 2026.7 | button renders one size larger |

`hacs.json` is set to **2026.5.0** for the `shortcut` reason. The rejected
alternative was keeping 2025.12 and filtering `CORE_BADGES` at runtime through
the class lookup `badge-catalog` already performs — more code and a conditional
path to test, for users three versions behind.

## The recurring trap

Four times a key has been accepted and documented while doing nothing, or
something else: `state_image` (no `entity`), `visibility` (never evaluated),
`theme` (internal API), and `title` (tooltip, not header). **Before exposing any
config key, verify that something actually consumes it, and that it consumes it
the way the label claims.** A field that saves cleanly and changes nothing is
worse than an absent one.

Its sibling, learned on the anchor feature: **a mechanism can be reviewed
correct and still rest on a false premise about HA's lifecycle.** The first
re-anchor design was proved terminating and drift-free by a reviewer, and could
never fire, because nobody asked whether the state it diffed still existed —
HA rebuilds the card on every commit. The same shape of mistake produced the
`preview` reading. Both were settled in one browser session by instrumenting
each boundary and reading a stack trace; neither was going to be settled by
more reasoning. **When behaviour contradicts a proof, doubt the premise, and go
get evidence rather than a better argument.**

## Follow-ups

**Repository: `lalexdotcom/picture-studio-card`**, card type `custom:picture-studio`,
bundle `picture-studio.js` — renamed on 2026-08-12 from `ha-extra-picture-elements`
and `picture-badges`, so the HACS path reads
`/hacsfiles/picture-studio-card/picture-studio.js`. HACS derives both the download
folder and that namespace from the repository name alone
(`full_name.split("/")[-1]` in `repositories/plugin.py`); no `hacs.json` key
influences it, and `hacs.json.filename` alone decides the file. The local
workspace directory still carries the very first name, which affects nothing
outside the devcontainer.

Why this name, so it is not reopened: `picture-badges` would have become a lie
the day `items[]` accepts an `element`, and the type of a card should say what
it *is*, not how it is configured — so no `visual-*` either. A `*-picture-elements`
name was rejected for taking on a promise we have not kept: it would lead users to
expect `state-icon`, `state-label`, `service-button` and `conditional`. The
lineage and the drag live in the description instead, where they are searched:
the card picker filters on name **and** description. The `-card` suffix on the
repository is the HACS convention (`button-card`, `mini-graph-card`,
`advanced-camera-card`) and its only effect is the doubled word in the path.

1. ~~No release yet~~ — **1.0 was released on 2026-08-12.** The workflow fires
   on `release: published`, builds, and attaches `dist/picture-studio.js` to
   that release; since `dist/` is git-ignored, that asset is the only thing
   HACS can install from. `CHANGELOG.md` and `package.json` carry the version
   alongside the tag — see AGENTS.md § Changelog and versioning, and **ask
   before bumping**. No tag is present in this local clone.
2. ~~Unverified in a browser~~ — **all checked in the local HA on 2026-08-12 and
   behaving as expected**: actions pinned to `none` (no tooltip, not clickable),
   `title` as the card header, the media picker showing an existing path, the
   `dark_mode_image` unwrap, the localized labels, `getGridOptions` (no banner),
   and the height claim plus `overflow-y: auto` under a pinned `rows`.
   Useful for the next visual test: HA serves light/dark image pairs of its own,
   e.g. `/static/images/logo_nabu_casa.png` and `…_dark.png` — no network needed.
3. ~~Minimum HA version~~ — **settled: `hacs.json` declares 2026.5.0.** See
   "Version floor" below for the evidence and for what still degrades above it.
4. **`dark_mode_filter` is a plain CSS string** in `hui-image`, yet both HA's
   form and ours expose it with an `object` selector (their label even says
   "Dark mode state filter"). Kept for parity — the object selector is the
   convenient code editor, which is why they use it.
5. **`src/strings.ts` ships `en` and `fr` only.** Everything else falls back to
   English. Adding a language is one line; adding a *string* is the thing to
   avoid, since HA's catalog is free and translated.
6. Vertical overflow scrolling is the consumer's problem to avoid: pinning
   `rows` is what creates it, `rows: "auto"` never does.
7. ~~Per-tick work in the card~~ — **fixed and merged 2026-08-13**, spec
   `docs/superpowers/specs/2026-08-13-per-tick-work-design.md`, plan
   `docs/superpowers/plans/2026-08-13-per-tick-work.md`. Ships in 1.1.0.

   **Measured before touching anything**, which is the whole reason the harness
   below exists: with three badges and ten `hass` ticks, the card made **41**
   `setConfig` calls and **80** `hass` assignments, where **1** and **40** do.
   HA republishes `hass` on every state change of *any* entity, and the card
   answered each one by pushing `hass` twice per element and reconfiguring
   everything.

   **The trigger was at fault, not the sync methods.** `updated()` ignored its
   `changedProperties` and `requestUpdate()` sat in the `hass` setter — and
   `requestUpdate()` **with no argument** schedules a cycle while recording
   nothing, so `updated()` was already receiving an empty map and resyncing
   anyway. Now: `_syncBackground` / `_syncBadges` only on `_config`;
   `_applyPositions` on `_config`, `editing` or `selected`; and
   `_syncEditingAndDrag` on **`_config`, `preview` or `editing`**.

   **`preview` must stay in that gate** — `editing` *derives* from it, since
   `_syncEditingAndDrag` is the method that assigns `editing`, so gating on
   `editing` alone means it never runs and the drag never arms. `_config` is
   there because `.root`, which the drag attaches to, does not exist until
   `_config` does. Both reasons are in the code comment; do not "simplify" the
   condition.

   **The `hass` push stays** in the setter — that is what makes a badge show a
   new state. Only the second push, repeated by the sync methods, is gone. The
   counter test asserts 40 pushes precisely so that removing it fails loudly
   instead of passing.

   The reason that carried the change was not speed — nothing was ever profiled
   and no symptom was ever reported. It is that **HA's own container never calls
   `setConfig` twice**; it rebuilds the element. Calling it every second on a
   third-party badge did something no part of HA does, to code never written to
   expect it.

   Two follow-up items became moot rather than fixed: the `querySelector(".root")`
   per render and `_applyPositions` rewriting unchanged styles only cost anything
   because `updated()` ran per tick.

   **Known untested path:** `editing` going true → false. Nothing asserts that
   wrappers shed their `.selected` class when the editor unmounts; it was checked
   by hand in the browser instead.

## The component test harness (new 2026-08-13)

Before this the project had **no component test at all** — nine files, all pure
modules. Now `rstest.config.ts` declares `testEnvironment: "happy-dom"` (both
`jsdom` and `happy-dom` are supported; neither was installed, happy-dom was
added and Lit ran under it first try), and `src/tests/card/harness.ts` mounts the
card against a stubbed `window.loadCardHelpers`.

- The fakes count **only what the card does after creation**:
  `createBadgeElement(config)` carries a badge's config in, so a clean mount
  leaves exactly **one** `setConfig` call, on the background, which the card
  configures explicitly. Numbers in the tests depend on this.
- `flush()` is `setTimeout(0)` — a macrotask, so it drains the in-flight
  `await window.loadCardHelpers()` microtasks. `await card.updateComplete` alone
  is not enough.
- A **file-scoped `afterEach`** clears `document.body` and releases any
  registered editor. Both matter: the card subscribes to the module-level broker
  in `connectedCallback`, so a card left attached by a *failing* test keeps
  receiving `notifyEditors()` for the rest of the run. Never go back to inline
  `card.remove()` — it is skipped exactly when it is needed.
- The harness mounts the card as a bare child of `document.body`, where
  `_inEditPreview()`'s shadow-boundary walk terminates on its first step. **The
  real ancestry walk is not exercised by any test** — that stays a browser
  question, which is where it has twice been settled.
8. ~~Automate the release from a version bump~~ — **done and live on `main`
   (2026-08-13)**, spec `docs/superpowers/specs/2026-08-13-release-on-version-bump-design.md`,
   plan `docs/superpowers/plans/2026-08-13-release-on-version-bump.md`.

   **The trigger is the absence of the tag, not a diff.** `release.yml` reads
   `version` from `package.json` and asks GitHub whether `vX.Y.Z` exists; if it
   does, the job goes green having published nothing. Diffing `package.json`
   against `HEAD~1` was rejected: a push carrying the bump commit *plus* a later
   commit only runs the workflow at the tip, where the diff no longer shows the
   bump — no release, no error. Testing the tag is idempotent and self-healing.
   What makes it safe is AGENTS.md's own rule: while work is in progress,
   `package.json` names the last shipped version, whose tag exists.

   **Two workflows joined by `workflow_run`, not one job.** `ci.yml` validates
   and, on `main` pushes only, uploads `dist/picture-studio.js` as an artefact
   named `bundle`. `release.yml` wakes on CI's completion and attaches *that*
   artefact — the published byte is the tested byte. Splitting it the other way
   (a workflow creating the release, another listening on `release: published`)
   cannot work: a release created with the default `GITHUB_TOKEN` does not
   trigger `release: published`, so the build would never run and HACS would get
   a release with no asset.

   **The trap `workflow_run` brings, and which the design turns on:** the job
   starts at the **tip of the default branch**, so `github.sha` is *not* the
   validated commit. `github.event.workflow_run.head_sha` is used **twice** — as
   the `checkout` ref and as `target_commitish` — and missing either recreates
   the `v1.0.0`-on-a-`0.1.0`-tree bug from automation this time. The job `if:`
   filters on both `conclusion == 'success'` and `head_branch == 'main'`, since
   `workflow_run` fires on every CI completion, PRs and failures included.

   **The CHANGELOG guard is not a separate check**, it is the extraction: the
   section for the version becomes the release body (prepended to GitHub's
   generated notes, which `body` + `generate_release_notes` compose to do). No
   section, a heading still reading `unreleased`, or an empty body fails the job
   before anything is published. AGENTS.md § Changelog and versioning is now
   enforced by CI. The `awk` matches the heading with `index()` + `substr()`,
   never a regex built from the version — `1.1.0` as a regex matches the prefix
   of `## 1.1.0-rc.1`.

   **The artefact purges itself under `success()`, never `always()`.** Rubbish in
   two cases (the no-op never used it; the release attached it permanently),
   precious in a third (a failed job's artefact is what re-running it needs, and
   a re-run reuses the same `run-id`). That inverts what the retention bounds:
   the ordinary path cleans up after itself, so 14 days only has to outlive a
   *failed* job — sized on the failure rate, not the push rate. Housekeeping
   reports through `::warning::` and never reddens a job whose release succeeded.

   **Verified live on 2026-08-13**, twice: CI green with the artefact, the
   Release job started by `workflow_run`, logging `v1.0.0 is already tagged`,
   steps 5-7 `skipped`, the purge step green, `total=0` artefact left, and no new
   tag or release. **Still unexercised**: the failure path and the nominal path,
   both of which need a version bump — so they happen when 1.1.0 ships, in that
   order (bump with the heading left at `unreleased`, expect red; then correct it
   and expect the release). **Still unknown**: whether `GITHUB_TOKEN` with
   `actions: write` suffices to download an artefact from another run, or whether
   a PAT is needed — it fails before publishing anything, and the fallback is a
   secret swapped into `github-token:`.

   Known minor, deliberately shipped: the `case *unreleased*` guard is
   case-sensitive, so a heading written `Unreleased` would slip past. AGENTS.md
   prescribes lowercase; the consequence is release-notes embarrassment, not a
   broken install.

## How we work (project rules, see AGENTS.md)

- Chat in **French**, everything else in English.
- Propose, then wait for validation — no edit, no dispatch, no commit without it.
- Serena's symbolic tools are primary for code. `.serena/project.yml` is now
  tracked and declares `typescript` before `bash`; the cache and
  `project.local.yml` are ignored. If `find_symbol` starts failing on `.ts`,
  check `Active language servers` first — a stale activation only lists `bash`,
  and restarting the MCP server fixes it.
- Implementation went through dispatched subagents with a written brief, then a
  reviewer, for the first eight tasks; the picture-elements alignment was done
  inline. Model/effort per AGENTS.md.
- **Never touch git while a subagent is running** — one commit swept up an
  implementer's staged file.
- Review findings have twice been right in conclusion and wrong in mechanism.
  Verify a claim in HA's source before dispatching a fix for it. Grep the
  container's bundle when the question is "what does *this* HA do".
