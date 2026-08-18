# picture-studio — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-studio`: an image with
items placed on it, positioned by **dragging them on the live preview** inside
the normal card-edit dialog. "picture-elements, but you place the items with the
mouse".

**Two families of item since 1.2.0**: Lovelace **badges**, and **elements** —
today one kind, `state-icon`, an icon that reflects an entity's state, sizes
itself from the **card's** width, and since 1.3.0 can stand on a **chrome**.

**1.3.1 is the published release** — tag `v1.3.1` on `6ef4338`, five fixes after 1.3.0 (both halo corrections and the panel-view card tokens among them). 1.3.0 was tag `v1.3.0` on `62b4f80`, `main`
level with `origin/main`. It was merged on 2026-08-14 (merge commit `d67941f`,
`--no-ff`, branch `feat/icon-chrome` deleted); its two features are per-item
`visibility` and the icon chrome. The chain that published it is unchanged: a
push to `main` runs CI, then `release.yml` reads `version` from `package.json`
and creates the `v<version>` tag and the release. HACS installs from that tag.
**The user pushes, never the agent.**

Releases: 1.0.0 (2026-08-12, by hand), 1.1.0 (2026-08-13, first from the
automated chain), 1.2.0 (2026-08-14), 1.3.0 (2026-08-14, published on
2026-08-17).

Suite: **347 tests** on `feat/state-label` (329 was 1.3.0's count and was already stale at
334 when 1.4.0 started). Bundle: 132.1 kB / 32.2 kB gzip.

**`pnpm lint` is not silent on a clean tree**: 6 warnings — `noNonNullAssertion` and
`useOptionalChain` in `src/tests/config.test.ts` and `src/tests/card/picture-studio-card.test.ts`
— predate 1.4.0 and are nobody's task. The bar is **zero errors**; an implementer that reports
"the lint errors are pre-existing" is to be disbelieved and measured
(`git checkout <base> -- <file> && pnpm lint`), which is how two rounds were lost in 1.4.0.

## Work in progress — 1.4.0, branch `feat/state-label`

**Paused 2026-08-18 at the user's request, HEAD `ad88902`, tree clean, 402 tests green.** Adding
a second element kind, `state-label` (an entity's text on the picture), and turning the icon's
halo into an opt-in. Spec `docs/superpowers/specs/2026-08-17-state-label-design.md`, plan
`docs/superpowers/plans/2026-08-17-state-label.md`, now **twelve** tasks — two were inserted
mid-run from the user's first look at a real dashboard — run through the
subagent-driven-development skill. **The ledger that survives a lost session is
`.superpowers/sdd/2026-08-17-state-label/progress.md`** — it holds every ruling and the exact
resume point.

Tasks 1-9 are complete and reviewed clean: both chrome records, the size defaults as a
parameter, the halo opt-in with its shared CSS module, the model, the element itself, the
strings, the editor split per kind, the add menu and glyphs, and the polish from that first
look. **Remaining: task 10** (a badge keeps one name across the add menu, the item list and the
edit panel — a Shortcut shows its `text` and wears `mdi:label-variant`, a custom badge shows the
name its library registered instead of `custom:…`), **task 11** (README and CHANGELOG), **task
12** (the browser walk). Then the whole-branch review, then the branch is finishable.

What 1.4.0 has settled so far, beyond the spec: the element glyphs are `mdi:brightness-7` for
the icon and `mdi:card-text-outline` for the label; a label's adaptive default is
`clamp(11px, 3cqw, 20px)`; its state carries `var(--ha-font-weight-medium, 500)`, which is
`ha-badge`'s own weight and not bold — a badge styles **both** its lines at 500 and separates
them by size and colour, which is what our label already did; and `pill` hides the radius
control, because a radius beside a ticked pill is a setting that saves cleanly and does nothing.

Renames already landed, and they are the naming convention from here on — the icon's things say
"icon", the label's say "label": `Chrome` → `IconChrome` (with `DEFAULT_ICON_CHROME`,
`normalizeIconChrome`, `isDefaultIconChrome`), beside a new `LabelChrome` family; `IconSize` →
`ElementSize`, `normalizeIconSize`/`isDefaultIconSize`/`iconSizeCss` → `normalizeElementSize`/
`isDefaultElementSize`/`elementSizeCss`, each now taking its defaults as a **parameter** so
`DEFAULT_ICON_SIZE` and `DEFAULT_LABEL_SIZE` can differ. `ChromeTheme`, `THEMES`, `chromeFill`
and `finiteOrDefault` stay shared and unrenamed.

## Where things are

- Specs: `docs/superpowers/specs/` — `2026-08-11-picture-badges-design.md`
  (authoritative base), then `2026-08-12-item-anchor`,
  `2026-08-13-per-tick-work`, `2026-08-13-release-on-version-bump`,
  `2026-08-13-state-icon-element-design.md` (the element family), and
  **`2026-08-14-icon-chrome-design.md`** (the chrome; carries a Verification
  record of its browser walk).
- Plans: `docs/superpowers/plans/`, same dates.
- Local HA: `docker compose`, container `picture-studio-ha`, http://localhost:8123.
  The repo's `dist/` is mounted at `/config/www/picture-studio-card/`, so a
  `pnpm build` is live at `/local/picture-studio-card/picture-studio.js` — only
  the dashboard resource's `?v=` needs bumping.
  `.ha/` is git-ignored; the user's test picture is
  `.ha/config/www/demo/office-plan.jpg` (`/local/demo/office-plan.jpg`), with
  `CREDITS.txt` beside it. Mushroom is installed as a third-party badge provider.
- **The shipped frontend is readable in the container** at
  `/usr/local/lib/python3.14/site-packages/hass_frontend/frontend_latest/*.js`,
  its translations at `static/translations/**/<lang>-*.json` (flat `"a.b.c"`
  keys), and the whole MDI set at `static/mdi/` (162 files).
  For anything minified, prefer reading the real source over the network:
  `raw.githubusercontent.com/home-assistant/frontend/<build>/src/...`, where
  `<build>` comes from core's `frontend/manifest.json` at a tag. 2026.8.1 →
  20260729.6, and our 2026.6.0 floor → 20260527.4.
  **This is the single most productive habit in this project.**

## Source layout

```
src/position.ts        px <-> % conversion, anchor-aware style and bounds (pure)
src/element-size.ts    IconSize, the three sizing modes, iconSizeCss (pure)
src/chrome.ts          Chrome, its defaults, normalization, storage, fills (pure)
src/config.ts          item families, normalization, storage, tags (pure)
src/strings.ts         our own en/fr catalog — the last resort
src/broker.ts          editor + card registries (pure)
src/types.ts           hand-declared HA interfaces
src/card/picture-studio-card.ts   background + item children + lifecycle
src/card/state-icon-element.ts    the element: chrome wrapper, state-badge, actions
src/card/visibility-probe.ts      the phantom card a hui-card probe carries
src/editor/visibility-section.ts  hosts HA's own hui-card-visibility-editor
src/card/drag-layer.ts            pointer gesture, injected callbacks
src/editor/picture-studio-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/background-schema.ts      ha-form schema for the card itself
src/editor/badge-list.ts             rows, ha-sortable, the add menu
src/editor/badge-form.ts             the badge's own editor + Position section
src/editor/element-form.ts           our ha-form, Chrome section, Size and position
src/editor/anchor-picker.ts          switch + hand-built 3x3 grid
src/editor/badge-catalog.ts          core + custom badge choices
src/editor/element-catalog.ts        element kinds, labels, stubs
src/editor/items.ts                  add / replace / move / remove / rowLabel (pure)
src/editor/icons.ts                  only the icon NAMES two components share
src/suggestion.ts      entity-first card picker suggestion (pure)
src/index.ts           registration + window.customCards
src/tests/**           mirrors the source tree
```

## Config shape (current)

```yaml
type: custom:picture-studio
image: /local/plan.png          # or { media_content_id, media_content_type }
entity: light.salon             # needed for state_image / state_filter
title: My floorplan
items:
  - type: badge                 # family; REQUIRED since 1.2.0
    position: { top: 30%, left: 45% }
    anchor: center              # absent => auto
    visibility:                 # 1.3.0 — HA's own conditions, opaque to us
      - condition: state
        entity: binary_sensor.night
        state: "on"
    config: { type: custom:mushroom-template-badge, entity: light.salon }

  - type: element
    position: { top: 45%, left: 20% }
    config:
      type: state-icon          # the kind; the open set lives here
      entity: light.salon
      icon: mdi:floor-lamp      # optional
      color: state              # ui_color: state | none | a theme colour
      name: ___device_name___   # optional => the title attribute (tooltip)
      show_entity_picture: false
      tap_action: { action: more-info }
      size:
        mode: auto              # auto | adaptive | fixed (absent => auto)
        ratio: 8                # adaptive — % of the card's width
        min: 24                 # adaptive — px
        max: 48                 # adaptive — px
        value: 48               # fixed — px
      chrome:                   # 1.3.0 — absent => no chrome
        theme: none             # none | auto | light | dark
        radius: 50              # percent of the box, 0-50
        opacity: 1              # 0-1
        content_ratio: 0.6      # 0-1
```

## Decisions that must not be re-litigated

- **Two families, closed set; the open set is `config.type`.** `badge` and
  `element` are all there will ever be at item level; a new element kind touches
  `element-catalog.ts` and nothing else. `type` is **required** — absent and
  unknown both raise. Never ignore or purge an unreadable item: `storedConfig`
  rewrites the whole config on every editor commit, so a drop becomes permanent
  on the first drag.
- **`config` is opaque per family.** A badge's payload belongs to a third party:
  never read, validate or rewrite it. An element's is ours: read, validate,
  default — but keep unknown keys, for the same reason as above. `size` and
  `chrome` are *our* closed records inside it, so an unknown key inside either is
  dropped, exactly as `normalizeIconSize` has always done.
- **The card places, the element draws itself.** The card's only concession to
  size is `container-type: inline-size` on `.root`; `cqw` is a percentage of that
  box. Without that line `cqw` falls back to the viewport **silently**.
- **Three sizing modes, `mode` read only by `iconSizeCss`.** `auto` applies the
  card's defaults (24 / 8% / 48); `adaptive` uses the item's numbers; `fixed`
  emits plain px. **`mode` overrides, it never erases.** `normalizeIconSize`
  still reads the pre-1.2 `{ auto: bool }` shape and never writes it back.
- **The chrome is one wrapper, and the host's box never changes.** `.chrome` is
  always in the DOM at `--psc-icon-size` with `box-sizing: border-box`; only its
  styling is conditional. That is what leaves `position.ts`, `drag-layer.ts` and
  `element-size.ts` with zero diff, and it is the constraint any future change
  here must keep. `size` is the whole footprint; `content_ratio` shrinks what is
  inside it, never the item.
- **`chrome.theme` carries the switch**, like `size.mode` and like `color`.
  `none` — or an absent `chrome` — draws nothing and **keeps every number**, so
  trying a chrome and turning it off loses nothing. `none` is a storage value and
  is never offered in the interface: the editor's checkbox is what turns it off.
- **The chrome's shape is conditional; its halo is not.** `border-radius` and
  `overflow: hidden` live under `:host([chrome])`; the `drop-shadow` filter sits
  on `.chrome` unconditionally, because a chromeless icon has worn that rim and
  glow since 1.2.0. Getting this wrong clipped every chromeless icon into a
  circle — see the traps.
- **The editor rounds; the model does not clamp.** `toFormData` / `fromFormData`
  round every numeric size and chrome field, so a slider can never leave a
  fractional value behind. `normalizeChrome` and `normalizeIconSize` keep any
  finite number exactly as written — the sliders guide, and someone outside their
  range is writing YAML and means it. Same rule positions already follow.
- **Anchor is per-item, `auto` by default**, ten values, offsets derived at
  render. Re-anchoring asks the preview for coordinates *before* writing.
- **Ratcheting drag bounds computed in `pointermove`**, never at `pointerdown`.
- **Pixels during the drag, percentages on release**, one commit per gesture,
  two decimals — the precision the gesture produces.
- **No `z-index` in the rendered stacking** — DOM order = list order. One
  exception, reserved to the editor: the selected or dragged item is raised while
  `editing`.
- **The theme, the opacity and the halo come from one CSS module.** An icon's
  chrome and a label's are different records, but the surface is the same idea:
  what it is made of, and how much of the picture shows through. Only the shape
  around it belongs to the kind — a disc against a pill, a `content_ratio`
  against a `padding`. So `src/card/item-styles.ts` holds the fill and the halo,
  each written once, and each element's `static styles` is an array that puts the
  shared blocks first. The halo takes the kind's own size token as an argument,
  which is what lets an icon scale it on its box and a label on its body.
  Consequence for the tests: `cssRules` in the harness must accept an array of
  `CSSResult`, not only a single one — handed an array it would read `undefined`
  and return an empty map, so every CSS assertion would pass by finding nothing.
  That is worse than a failure, and it is the same blind spot that let 1.3.0 ship
  a rule which clipped every chromeless icon into a circle.
- **Editor section order, every item family: Interactions straight after
  Content, Visibility last.** *(1.4.0 changes the element order to Entity,
  Content, Interactions, **Size and position**, **Appearance**, Visibility —
  Chrome is renamed and moves after Size and position.)* For an element: Entity, Content, Interactions,
  Chrome, Size and position, Visibility. A badge's editor is a third-party
  element we render whole — we cannot reorder inside it — and "after Content" is
  the only formulation that can hold for both families. Every top-level section
  is spaced 24px, the gap `ha-form` gives its own root children.
- **`storedConfig`'s `chrome && !isDefaultChrome(chrome)` is not a redundant
  guard.** `chrome` is optional on `StateIconConfig`, so the check is what narrows
  the type. Two reviewers have flagged it; it is correct.
- **Single-file build, no dynamic import, no decorators, Lit bundled.**

## Hard-won facts about Home Assistant (all verified in their source)

- **HA rebuilds the card element on every config change** — no card-side state
  survives a commit.
- **`preview` does not mean "I am the edit dialog's preview"** — what separates
  them is the edit chrome, which `_inEditPreview()` walks for. Do not "simplify"
  it to an attribute test.
- **`state-badge` is the entity-icon disc, NOT the Lovelace badge.** Its colour
  computation lives **inside** the `overrideImage === undefined` branch, so
  passing `""` to hide a picture also kills the colour. It sets
  `--state-inactive-color: initial` on its own host. **It paints an entity
  picture as a `background-image` on that same host** (`background-size: cover`)
  while the glyph is a child sized by `--mdc-icon-size` — so sizing `state-badge`
  scales picture and glyph together, which is why `content_ratio` needs no
  special case for pictures. Its radii are `--state-badge-border-radius`,
  `--state-badge-with-image-border-radius` and
  `--state-badge-with-media-image-border-radius`, all 50% by default.
- **A badge's icon is not `state-badge`**: `hui-entity-badge` renders `ha-badge`
  and colours it through `--badge-color`. **`ha-badge`'s own fill is
  `var(--ha-card-background, var(--card-background-color, white))`, opaque** —
  surface from the theme, glyph from the state. That is the recipe the chrome
  copies; the tile card's tinted fill is not, because a translucent fill lets the
  photograph through.
- **Theme colour tokens come in two layers, and only one is mode-independent.**
  The `--ha-color-*` core palette is emitted once as a global `html { … }` with
  no dark counterpart, so `--ha-color-white` (#fff) and `--ha-color-neutral-10`
  (#202020) are readable whichever mode is active. The *semantic* layer above it
  (`--ha-color-surface-default`, and the classic `--card-background-color`) comes
  in two copies, and `applyThemesOnElement` writes exactly one of them onto
  `<html>` **in JavaScript**. So a theme's *other* mode is unreachable: forcing
  "light" can only mean naming the palette entry. Both palette tokens exist at
  20260527.4, our floor.
- **Translations are per panel, not per card.** `loadFragmentTranslation` is
  called with exactly three names in the whole bundle — `config`, `lovelace`,
  `energy`. The `lovelace` fragment is one JSON per language holding *every*
  Lovelace key, every card editor's included, so
  `ui.panel.lovelace.editor.card.map.theme_mode*` resolves on a dashboard that
  has never seen a map card. `ui.panel.profile.*` does **not** resolve in our
  dialog — nothing loads that fragment.
- **`hass.formatEntityName(stateObj, name)`** resolves the composed-name
  sentinels the `entity_name` selector stores.
- **`hass-action`** is a DOM event the root `<home-assistant>` hands to
  `handleAction`. **`action-handler`** is a singleton element on `document.body`
  with `bind(el, {hasHold, hasDoubleClick})`.
- **A badge is clickable when** `!tap_action || hasAction(tap|hold|double)`.
- **`ha-form` spaces its root children by 24px**; `ha-form-expandable` zeroes the
  panel's padding and wraps its body in a `.content` div at 12px. Copy that.
- **`ha-form` merges the changed field onto the whole `.data` it was given and
  re-emits it**, so `.data` must always be the complete flat record. That is what
  keeps a field alive while the active schema hides it — and what makes the
  chrome's conditional controls safe.
- **`ha-form`'s two boolean paths render DIFFERENT controls.** A schema entry
  written `{ name, selector: { boolean: {} } }` goes through
  `ha-selector-boolean`, which mounts `<ha-formfield><ha-switch>` — a switch. A
  schema entry written `{ name, type: "boolean" }` goes through
  `ha-form-boolean`, which mounts `<ha-checkbox>` with the label in its slot.
  Reading the wrong one turned a switch into a checkbox in 1.4.0, and only the
  user's eye caught it. Neither exposes a token for the gap between its label and
  its control: `ha-checkbox`'s custom properties cover colours, size and the
  required marker, and `::part` crosses one shadow boundary where there are two.
  Owning the control is the only way to set that spacing.
- **`.section-label` in `element-form.ts` carries `margin-block-end: 0.5em`**,
  because it exists to sit *above* a control group. Beside a control in a flex
  row it pushes the text off centre, and `align-items: center` cannot undo a
  margin. A label in the inline position needs its own class.
- **`ha-form` takes `icon: "mdi:…"` as first-class beside `iconPath:`.**
- **`ha-selector-select` in `mode: "list"`** never passes `orientation` to
  `ha-radio-group`, and there is no exported part, so no CSS can make it
  horizontal. Render the group yourself, behind `customElements.get`, with an
  `ha-form` select as the fallback — an undefined custom element renders
  **nothing**, silently.
- **`selector: { number: { mode: "box" } }`** removes the slider; omitting
  `mode` is what gives you one.
- **The floor is `2026.6.0`** (`hacs.json`), frontend 20260527.4.
- **Component availability is a browser question.** Counting chunks is a hint,
  not proof. When a component must be there, prove the chunk loads or write a
  fallback.
- **Switch tokens**: track `--ha-switch-background-color` /
  `--ha-switch-border-color`, checked `--ha-switch-checked-*`, thumb
  `--ha-switch-thumb-background-color`. Always close a chain on a long-lived
  variable.
- **An outer-tree rule beats a `:host` declaration.**
- **`hui-card` IS Home Assistant's implementation of the `visibility` key.** It
  evaluates and publishes the verdict by toggling the native `hidden` attribute,
  so a hidden `hui-card` sibling plus `.probe[hidden] + .item` reflects it with
  no JavaScript of ours. Catches: `preview` short-circuits to visible,
  `_updateVisibility` returns early without an inner card *and* without `hass`,
  and a config change does not re-evaluate — only `hass` or `preview` do.
- **`hui-conditional-element` is a trap**: it signals nothing.
- **`state-display` carries no stylesheet.** The component Home Assistant uses
  everywhere to render `state_content` declares only properties and a `render()`
  returning text — no `static styles`. So an inherited property set on the host
  (`font-weight`, `color`, `font-size`) reaches its text unopposed: a shadow root
  scopes rules, never inheritance, and only a local declaration would beat an
  inherited value. Styling it from outside needs no `::part` and no token.
- **`ha-expansion-panel` header slot order** is `leading-icon → header → event →
  chevron → icons`; `event` is the one before the chevron.
- **`ha-icon-button` reads `--ha-icon-button-size`**, not `--mdc-icon-button-size`.
- **The modern entity list is `hui-entity-editor`** — 48px rows, 8px apart,
  `mdiDragHorizontalVariant`, `mdiPencil` + `mdiClose`, a name over a place.
- **`--ha-card-border-width` is 0 in many themes.**
- **The shipped `.js.map` files carry the raw GitHub URL of every source file.**
  Grepping them is the fastest way to find a component's real path.
- Labels: `ui.panel.lovelace.editor.card.generic.<name>` for most,
  `…badge.entity.<name>` for `color` / `show_entity_picture`,
  `…picture-elements.element_types.<type>` for element kinds, `ui.common.auto`.
- `applyThemesOnElement` is internal, so a card-level `theme` cannot be honoured.
- **A view type can redefine anything for everything underneath it.**
  `hui-panel-view` saves the theme's card tokens under `--restore-card-*`, then
  zeroes `--ha-card-border-radius`, `--ha-card-border-width` and
  `--ha-card-box-shadow` on `*`, so a card that fills the view carries no border.
  Custom properties inherit, so that instruction crosses our shadow DOM and lands
  on the third-party content we host: a badge reads those very tokens, and lost in
  a panel view the outline it wears in a sections one. HA's own container cards
  restore the three on the box holding their children (`:host([ispanel]) #root`);
  ours does it on `.item`, and `hui-card` hands us the switch —
  `this._element.isPanel = "panel" === this.layout`, reflected as `ispanel`.
  Conditional on purpose: `--restore-card-*` exists **only** under a panel view,
  so an unconditional restore would send a badge back to its own `1px` and
  overrule a theme that asked for none.
- **Sections grid**: 12 columns, `--row-height: 56px`, `--row-gap: 8px`.

## The recurring traps

1. **A key that saves cleanly and does nothing** is worse than an absent one.
   Four times: `state_image` (no `entity`), `visibility`, `theme`, `title`.
   Before exposing a key, verify something consumes it, the way the label claims.
2. **A mechanism can be reviewed correct and rest on a false premise.** The first
   re-anchor design was proved terminating and could never fire. So was the
   `preview` reading, and 1.2.0's colour bug. **When behaviour contradicts a
   proof, doubt the premise and go get evidence.**
3. **What the suite cannot see.** happy-dom does no layout: nothing about
   `clamp()`, `cqw`, positioning, pointer muting or CSS is observable there.
   1.2.0 shipped six such defects past a green suite and two reviews. **1.3.0
   added a seventh, and it is the cleanest example yet**: `border-radius` and
   `overflow: hidden` sat unconditionally on the chrome wrapper, so every icon
   *without* a chrome was clipped into a circle. Five task reviews and a
   whole-branch review read that CSS and none could see it; the user saw it in
   seconds. **Plan for the walk; do not hope to skip it.**
4. **A test that restates a constant stops guarding it.** Assert literals.
5. **A pair of tests that check different sets is a hole.** The two localization
   tests once asserted different keys, so a missing French string would have
   passed the one not looking for it. They now share one `KEYS` list.

## How we work (project rules, see AGENTS.md)

- **Reuse Home Assistant's machinery rather than reimplementing behaviour.** The
  HACS floor is not a critical decision: raise it freely to reach a modern
  component. Guards stay anyway — a floor answers "does this version have it",
  never "is its chunk loaded here".
- **Ask what the view type changes under us.** Panel and not-panel are not the
  same environment, and the difference reaches the content we host. Before
  shipping a new element kind or a nested container, walk it in both — and when
  something looks different in one, sweep the frontend for what a view redefines
  rather than reasoning about it. The panel-view card tokens above are the worked
  example, `grep -roh -- "--ha-card-border-width:[^;}]*"` over `frontend_latest`
  the sweep that found them.
- Chat in **French**, everything else in English.
- Propose, then wait for validation — no edit, no dispatch, no commit without it.
- **Never `git push`** — it publishes. The user does it. Local merges are fine.
- **Leave a clean tree at the close.**
- **The user's browser walks cover a panel view and a sections view, every
  time.** They do not announce it. Never write "a sections view was not
  exercised" — if a walk happened, both did.
- Serena's symbolic tools are primary for code.
- Implementation runs through dispatched subagents with a written brief, then an
  independent reviewer per task, then a whole-branch review. Model/effort per
  AGENTS.md. **Never touch git while a subagent is running** — and note that
  `git merge -F -` does not read stdin the way `git commit -F -` does; write the
  merge message to a file.
- Review findings have repeatedly been right in conclusion and wrong in
  mechanism. Verify a claim in HA's source before dispatching a fix for it.
