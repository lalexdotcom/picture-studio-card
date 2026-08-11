# picture-badges — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-badges`: an image with
Lovelace **badges** placed on it, positioned by **dragging them on the live
preview** inside the normal card-edit dialog. Think "picture-elements, but the
items are badges and you place them with the mouse".

Branch `feat/picture-badges`, ~28 commits, not merged. 55 unit tests,
`tsc --noEmit` clean and wired into CI, Biome clean, single-file build
`dist/picture-badges.js` (~57 kB / 15 kB gzip).

## Where things are

- Spec (authoritative, amended several times): `docs/superpowers/specs/2026-08-11-picture-badges-design.md`
- Plan (8 original tasks): `docs/superpowers/plans/2026-08-11-picture-badges.md`
- Execution ledger, findings, per-task briefs and reports:
  `.superpowers/sdd/2026-08-11-picture-badges/progress.md` — **read this for the
  full history**, including every deferred minor finding and every adjudication.
- Local HA for testing: `docker compose` in the repo, container
  `picture-badges-ha`, http://localhost:8123, resource registered at
  `/local/picture-badges/picture-badges.js?v=1`. Mushroom is installed as a
  third-party badge provider at `/local/mushroom/mushroom.js`.

## Source layout

```
src/position.ts        px <-> % conversion, clamping, style derivation (pure, tested)
src/config.ts          config shape, normalisation, tag constants (pure, tested)
src/broker.ts          editor registry + subscribeEditors (pure, tested)
src/types.ts           hand-declared HA interfaces
src/card/picture-badges-card.ts   background element + badge children + lifecycle
src/card/drag-layer.ts            pointer gesture, injected callbacks, no HA knowledge
src/editor/picture-badges-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/background-schema.ts      ha-form schema for the background
src/editor/badge-list.ts             ha-sortable rows + ha-dropdown add button
src/editor/badge-form.ts             hosts the badge's own native config form
src/editor/badge-catalog.ts          core + custom badge choices, class lookup
src/editor/badge-items.ts            add / replace / move / remove (pure, tested)
src/index.ts           registration
```

## Config shape (current)

```yaml
type: custom:picture-badges
image: /local/plan.png
entity: light.salon            # needed for state_image / state_filter to resolve
items:
  - type: badge                # discriminant; "element" is rejected, reserved for later
    position: { top: 30, left: 45 }   # numbers 0-100
    config:                    # the badge's own config, opaque to us
      type: custom:mushroom-template-badge
      entity: light.salon
```

Background keys forwarded to the element: `title`, `entity`, `image_entity`,
`image`, `camera_image`, `camera_view`, `state_image`, `state_filter`,
`dark_mode_image`, `dark_mode_filter`, `filter`, `aspect_ratio`, and currently
`tap_action` / `hold_action` / `double_tap_action` (**being removed**, see
"Next up").

## Decisions that must not be re-litigated

- **Proportional anchoring.** `positionStyle` yields `top: L%`, `left: T%` and
  `transform: translate(-left%, -top%)`. 0 is flush top-left, 50 centred, 100
  flush bottom-right, so overflow is structurally impossible. The `%` and the
  transform are **derived at render, never stored**. Rejected: the native
  `translate(-50%,-50%)` centre model, whose clamp cannot survive a resize.
- **Pixels during the drag, percentages on release.** `pointermove` mutates the
  wrapper's own `style.left/top` in px, clamped to `[0, W-w]`; one commit per
  gesture. Both the entry and the exit of the gesture must write position and
  transform *together* — each was a separate bug.
- **One `items[]` list with a `type` discriminant**, payload nested under
  `config`. A flat shape (badge keys hoisted beside ours, `kind` discriminant)
  was proposed and withdrawn: it puts our keys in the same namespace as a
  free-form map, so a third-party badge with a `position` key would lose it.
- **No `z-index`, ever.** Stacking is DOM order, which is list order, and the
  list is reorderable.
- **Single-file build.** `dist/` holds only `picture-badges.js` and its
  `.LICENSE.txt`. A dynamic import once split the bundle and left
  `picture-badges.js` with a static `import … from "./612.js"`; releases ship
  only the one file, so the card died at its first line. Never reintroduce a
  dynamic import.
- **No TypeScript decorators.** Lit components use `static properties`.
- **Lit is bundled**, never read off an HA prototype.
- **`config` is opaque**: never read, validate, reorder or rewrite a badge's
  config. Reading `entity`/`name`/`type` for a row label is the one exception.
- Minimum HA version declared in `hacs.json`: **2025.12.0**, set by `ha-dropdown`
  (first commit 2025-11-12). Everything else dates from 2024.8.

## Hard-won facts about Home Assistant (verified in their source)

- **The native badge dialogs are unreachable.** `showCreateBadgeDialog` /
  `showEditBadgeDialog` fire `show-dialog` with a `dialogImport` closure their
  bundler resolved at build time. `make-dialog-manager.ts` does
  `if (!(tag in LOADED)) { if (!dialogImport) return false }` — **silent failure
  in production**. Confirmed in the browser: both tags undefined on a fresh load.
  We add badges with our own picker and edit them through the badge class's own
  `static getConfigElement()`, the same route `HuiBadgeElementEditor` takes.
- **`window.customBadges` holds tag names, not config types.** Mushroom
  registers `mushroom-template-badge`; a config needs
  `custom:mushroom-template-badge`. `badgeCatalog` prefixes at the boundary.
- The native picker's core list is `coreBadges` in
  `src/panels/lovelace/editor/lovelace-badges.ts`: exactly `entity` and
  `shortcut`. Mirrored in `CORE_BADGES`, which cannot be imported.
- `ha-sortable` **is** defined in the card-edit dialog; the badge dialogs are
  not. Always check `customElements.get(...)` in the browser console before
  depending on an HA component.
- `hui-image` resolves `state_image` / `state_filter` against **its `entity`
  property**. Without `entity` they are inert.
- `hui-image-element` (the picture-elements `image` type) forwards every key we
  need plus `actionHandler`/`handleAction`, and has no layout styles, so it works
  in normal flow. It does **not** forward `fit_mode` — and picture-elements does
  not expose `fit_mode` either, deliberately: cropping breaks the correspondence
  between percentages and image content.
- `hui-image-element.setConfig` only rejects a falsy config, and defaults
  `tap_action`/`hold_action` to `more-info` when absent.
- `hui-sub-element-editor` handles `row`, `header`, `footer`, `element`,
  `feature`, `heading-badge` — **not** `badge`.
- **`visibility` on a badge does nothing here.** HA evaluates those conditions in
  the *container* (`checkConditionsMet`, internal). Documented as unsupported.
  Editing it without evaluating it would be worse than nothing.
- `applyThemesOnElement` is internal, so `theme` cannot be honoured.

## The recurring trap

Three times now a key has been accepted and documented while doing nothing:
`state_image` (no `entity`), `visibility` (never evaluated), and `theme` would
have been the fourth. **Before exposing any config key, verify that something
actually consumes it.** A form field that saves cleanly and changes nothing is
worse than an absent one.

## Next up — the config UI, aligned with picture-elements

The user wants our editor to mirror `hui-picture-elements-card-editor`. Its real
schema, fetched from their source:

```ts
{ name: "", type: "expandable", title: "Card options", schema: [
  { name: "title",            selector: { text: {} } },
  { name: "image",            selector: { media: { accept: ["image/*"], clearable: true,
                                                   image_upload: true, hide_content_type: true,
                                                   content_id_helper: <localised> } } },
  { name: "dark_mode_image",  selector: { media: { …identical… } } },
  { name: "camera_image",     selector: { entity: { domain: "camera" } } },
  { name: "camera_view",      selector: { select: { options: ["auto","live"], mode: "dropdown" } } },
  { name: "theme",            selector: { theme: {} } },
  { name: "state_filter",     selector: { object: {} } },
  { name: "dark_mode_filter", selector: { object: {} } },
]}
```

Decisions taken for our version:

1. Reproduce that expandable "Card options" section **minus `theme`** (inert for
   us, see above).
2. A "Badges" section with a header and the existing note about list order
   determining stacking.
3. **Remove the actions entirely** — `PictureElementsCardConfig` has no
   `tap_action`/`hold_action`/`double_tap_action` at all, not even in YAML, so
   neither do we. Drop them from `PictureBadgesConfig`, from the background
   schema, and from the README.
   **Watch out:** `hui-image-element.setConfig` defaults `tap_action` and
   `hold_action` to `more-info` when they are absent, and toggles a `clickable`
   class. To match picture-elements, where the background has no action at all,
   pass `tap_action: { action: "none" }` explicitly when building the element's
   config.
4. `entity`, `image_entity`, `state_image`, `aspect_ratio` and `filter` stay
   YAML-only — picture-elements leaves them out of its form too.

Checked and cleared: the console reported `false` for `ha-selector-media`,
`ha-selector-object` and `ha-selector-theme`, but **that is a false negative**.
`ha-selector.ts` holds a table of 58 dynamic loaders — `media`, `object`,
`theme`, `select`, `text` are all in it — and loads the sub-component itself when
a schema asks for it. HA owns the pointer to its own chunk and uses it on our
behalf; the exact inverse of the badge dialogs, where *we* had to supply a
`dialogImport` we could not build. Declaring `selector: { media: {} }` is enough.

Generalise: an undefined `ha-selector-*` tag proves nothing. Test availability by
rendering a form that uses the selector, not by probing `customElements`.

## How we work (project rules, see AGENTS.md)

- Chat in **French**, everything else in English.
- Propose, then wait for validation — no edit, no dispatch, no commit without it.
  The user confirmed this workflow explicitly when offered the alternative.
- Serena's symbolic tools are primary for code. `.serena/project.yml` originally
  declared `language_servers: [bash]` (frozen when the repo held only shell
  scripts), which silently broke `find_symbol` for every subagent; `typescript`
  has been added.
- Implementation goes through dispatched subagents with a written brief, then a
  reviewer, then a scoped re-review of any fix. Model/effort per AGENTS.md:
  sonnet/medium as the floor, opus/high for the final whole-branch review.
- **Never touch git while a subagent is running** — one commit swept up an
  implementer's staged file.
- Review findings have twice been right in conclusion and wrong in mechanism.
  Verify a claim in HA's source before dispatching a fix for it.
