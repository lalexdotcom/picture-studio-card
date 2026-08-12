# picture-studio — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-studio`: an image with
Lovelace **badges** placed on it, positioned by **dragging them on the live
preview** inside the normal card-edit dialog. "picture-elements, but the items
are badges and you place them with the mouse".

**Merged.** `feat/picture-badges` was merged into `main` with `--no-ff`
(merge commit `42dea4b`) and the branch was deleted. **Nothing is pushed** —
`main` is ahead of `origin/main`. 78 unit tests, `tsc --noEmit` clean and wired
into CI, Biome clean, single-file build `dist/picture-studio.js`
(~61 kB / 16 kB gzip).

## Where things are

- Spec (authoritative, amended several times): `docs/superpowers/specs/2026-08-11-picture-badges-design.md`
- Plan: `docs/superpowers/plans/2026-08-11-picture-badges.md`
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
src/position.ts        px <-> % conversion, clamping, style derivation (pure, tested)
src/config.ts          config shape, normalization, ImageSource/imagePath, tags (pure, tested)
src/strings.ts         our own en/fr catalog — one string (pure, tested)
src/broker.ts          editor registry + subscribeEditors (pure, tested)
src/types.ts           hand-declared HA interfaces, incl. LocalizeFunc, LovelaceGridOptions
src/card/picture-studio-card.ts   background element + badge children + lifecycle
src/card/drag-layer.ts            pointer gesture, injected callbacks, no HA knowledge
src/editor/picture-studio-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/background-schema.ts      ha-form schema, labels, form <-> config mapping
src/editor/badge-list.ts             header, hint, ha-sortable rows, ha-dropdown add button
src/editor/badge-form.ts             hosts the badge's own native config form
src/editor/badge-catalog.ts          core + custom badge choices, choiceLabel, class lookup
src/editor/badge-items.ts            add / replace / move / remove (pure, tested)
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
    position: { top: 30%, left: 45% } # 0-100; a bare number is read too
    config:                     # the badge's own config, opaque to us
      type: custom:mushroom-template-badge
      entity: light.salon
```

`BACKGROUND_KEYS` (forwarded to `hui-image-element`): `entity`, `image_entity`,
`image`, `camera_image`, `camera_view`, `state_image`, `state_filter`,
`dark_mode_image`, `dark_mode_filter`, `aspect_ratio`, `filter`. **Not** `title`
(card header) and **no actions at all**.

## Decisions that must not be re-litigated

- **Proportional anchoring.** `positionStyle` yields `top: L%`, `left: T%` and
  `transform: translate(-left%, -top%)`. 0 flush top-left, 50 centered, 100 flush
  bottom-right, so overflow is structurally impossible. The `%` and the transform
  are **derived at render, never stored**.
- **Pixels during the drag, percentages on release.** One commit per gesture.
  Entry and exit must both write position and transform *together*.
- **Percent strings in the stored config, numbers in the code.** `parsePercent`
  reads `30`, `"30"` and `"30%"` and clamps to [0, 100]; `storedConfig`
  serialises back to `"30%"` at `_reemit`, the single exit to HA. Accepting the
  notation without also writing it would have been worse than not accepting it:
  the first drag would silently rewrite what the user typed. Unquoted `top: 30%`
  is a plain string in YAML — verified with the container's own PyYAML — while a
  *leading* `%` would be a scanner error, which never happens here.
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

1. **No release yet.** `main` is pushed, but there is no tag and no GitHub
   release, therefore no asset. The workflow fires on `release: published`,
   builds, and attaches `dist/picture-studio.js` to that release — and since
   `dist/` is git-ignored, that asset is the only thing HACS can install from.
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
