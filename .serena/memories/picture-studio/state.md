# picture-studio — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-studio`: an image with
items placed on it, positioned by **dragging them on the live preview** inside
the normal card-edit dialog. "picture-elements, but you place the items with the
mouse".

**Two families of item since 1.2.0**: Lovelace **badges**, and **elements** —
since 1.4.0 two kinds, `state-icon` and `state-label`.

**1.3.1 is the published release** — tag `v1.3.1` on `6ef4338`. The chain that
publishes is unchanged: a push to `main` runs CI, then `release.yml` reads
`version` from `package.json` and creates the `v<version>` tag and the release.
HACS installs from that tag. **The user pushes, never the agent.**

Releases: 1.0.0 (2026-08-12, by hand), 1.1.0 (2026-08-13, first from the
automated chain), 1.2.0 (2026-08-14), 1.3.0 (2026-08-14, published 2026-08-17),
1.3.1 (2026-08-17).

## Work in progress — 1.4.0, branch `feat/state-label`

**Paused 2026-08-18 at session close. 468 tests green, lint exit 0, `tsc`
clean, bundle 169.4 kB / 39.5 kB. The tree is DIRTY: ~20 files, nothing from
2026-08-18 is committed.** That is the first thing to settle on resume.

Adding `state-label`, turning the icon's halo into an opt-in, and — decided
late in the branch — the state colour, the hover and the list order. Spec
`docs/superpowers/specs/2026-08-17-state-label-design.md`, plan
`docs/superpowers/plans/2026-08-17-state-label.md`, ledger
`.superpowers/sdd/2026-08-17-state-label/progress.md`.

**Validated in the user's browser**, panel and sections both: the halo opt-in,
the chromeless square corners, `state-display`, a composed `state_content`, the
pill, anchoring, adaptive sizing, the Appearance section, and (2026-08-18) the
state colour on a label, the hover veil, the chromeless grow and the reversed
list.

**What remains before publishing:** the whole-branch review on a capable model
(the ledger's five deferred minors), `superpowers:finishing-a-development-branch`,
the 1.4.0 bump — `package.json` still says `1.3.1` and the CHANGELOG heading
still says `unreleased`, and both move together at delivery, the user's call —
then the user's push.

### What 1.4.0 settled beyond the spec

- Glyphs `mdi:brightness-7` (icon) and `mdi:card-text-outline` (label); a
  label's adaptive default `clamp(11px, 3cqw, 20px)`; its state at
  `var(--ha-font-weight-medium, 500)`; `pill` hides the radius control.
- **Decision 6 of the spec is REVERSED** — a label honours `color: state`. The
  spec carries the reversal beside the original text; see the decisions below.
- **The hover**: a veil with a chrome, a grow without. See the decisions below.
- **The item list reads top-down**, the array is untouched.
- The renames are the naming convention from here on: `Chrome` → `IconChrome`
  beside `LabelChrome`; `IconSize` → `ElementSize`, with
  `normalizeElementSize` / `isDefaultElementSize` / `elementSizeCss` each taking
  their defaults as a **parameter**. `ChromeTheme`, `THEMES`, `chromeFill` and
  `finiteOrDefault` stay shared and unrenamed.

## Where things are

- Specs: `docs/superpowers/specs/` — `2026-08-11-picture-badges-design.md`
  (authoritative base), then `2026-08-12-item-anchor`,
  `2026-08-13-per-tick-work`, `2026-08-13-release-on-version-bump`,
  `2026-08-13-state-icon-element`, `2026-08-14-icon-chrome`,
  `2026-08-14-item-visibility`, `2026-08-17-state-label`.
- Local HA: `docker compose`, container `picture-studio-ha`, http://localhost:8123.
  `dist/` is mounted at `/config/www/picture-studio-card/`, so a `pnpm build` is
  live at `/local/picture-studio-card/picture-studio.js` — only the dashboard
  resource's `?v=` needs bumping. `.ha/` is git-ignored; the test picture is
  `.ha/config/www/demo/office-plan.jpg`. Mushroom is installed.
  The test dashboard is `.ha/config/.storage/lovelace.dashboard_test`, three
  views: sections, panel ("Office"), masonry. **Reading it as JSON is the fast
  way to answer "which config reproduces this".**
- **The shipped frontend is readable in the container** at
  `/usr/local/lib/python3.14/site-packages/hass_frontend/frontend_latest/*.js`,
  translations at `static/translations/**/<lang>-*.json`, MDI at `static/mdi/`.
  Build **20260729.6**; our 2026.6.0 floor is 20260527.4.
  For anything minified, prefer the real source over the network:
  `raw.githubusercontent.com/home-assistant/frontend/<build>/src/...`.
  **This is the single most productive habit in this project**, and 2026-08-18
  is its best demonstration: reading `state_color.ts` overturned a written
  design decision in one afternoon.

## Source layout

```
src/position.ts        px <-> % conversion, anchor-aware style and bounds (pure)
src/element-size.ts    ElementSize, the three sizing modes, elementSizeCss (pure)
src/chrome.ts          IconChrome / LabelChrome, defaults, normalization, fills (pure)
src/state-color.ts     HA's state-colour recipe, rebuilt (pure) — 1.4.0
src/config.ts          item families, normalization, storage, tags (pure)
src/strings.ts         our own en/fr catalog — the last resort
src/broker.ts          editor + card registries (pure)
src/types.ts           hand-declared HA interfaces
src/card/picture-studio-card.ts   background + item children + lifecycle
src/card/item-styles.ts           chromeFillStyles, haloStyles, interactionStyles
src/card/state-icon-element.ts    chrome wrapper, state-badge, actions
src/card/state-label-element.ts   chrome wrapper, state-display, actions
src/card/visibility-probe.ts      the phantom card a hui-card probe carries
src/card/drag-layer.ts            pointer gesture, injected callbacks
src/editor/picture-studio-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/visibility-section.ts  hosts HA's own hui-card-visibility-editor
src/editor/background-schema.ts   ha-form schema for the card itself
src/editor/badge-list.ts          rows, ha-sortable, the add menu, the flip
src/editor/badge-form.ts          the badge's own editor + Position section
src/editor/element-form.ts        our ha-form, Appearance, Size and position
src/editor/state-label-form.ts    the label's schema halves
src/editor/state-icon-form.ts     the icon's schema halves
src/editor/anchor-picker.ts       switch + hand-built 3x3 grid
src/editor/badge-catalog.ts       core + custom badge choices
src/editor/element-catalog.ts     element kinds, labels, stubs
src/editor/items.ts               add / replace / move / remove / rowLabel (pure)
src/editor/icons.ts               only the icon NAMES two components share
src/suggestion.ts      entity-first card picker suggestion (pure)
src/index.ts           registration + window.customCards
src/tests/**           mirrors the source tree
```

## Config shape (current)

```yaml
type: custom:picture-studio
image: /local/plan.png          # or { media_content_id, media_content_type }
entity: light.salon             # needed for state_image / state_filter
items:
  - type: badge                 # family; REQUIRED since 1.2.0
    position: { top: 30%, left: 45% }
    anchor: center              # absent => auto
    visibility: [ … ]           # 1.3.0 — HA's own conditions, opaque to us
    config: { type: custom:mushroom-template-badge, entity: light.salon }

  - type: element
    position: { top: 45%, left: 20% }
    config:
      type: state-icon          # or state-label; the open set lives here
      entity: light.salon
      color: state              # state | none | a theme colour — both kinds
      size: { mode: auto, ratio: 8, min: 24, max: 48, value: 48 }
      halo: false               # 1.4.0 — opt-in
      chrome: { theme: none, radius: 50, opacity: 1, content_ratio: 0.6 }
      # a label's chrome instead: { theme, radius(px), pill, opacity, padding }
```

## Decisions that must not be re-litigated

- **Two families, closed set; the open set is `config.type`.** `type` is
  required — absent and unknown both raise.
  **Correction, 2026-08-18:** the old claim that "a new element kind touches
  `element-catalog.ts` and nothing else" is **false**, and adding the second kind
  is what proved it. Three more places branch on the kind and each defaults to
  the icon: `_dispatch` in `element-form.ts`, `createElementBadge` in
  `picture-studio-card.ts`, and `storedConfig`'s `isLabel` in `config.ts`. A
  third kind added without touching all four is not rejected — it is silently
  treated as an icon. Nothing is broken today (`normalizeElementConfig` raises on
  an unknown type first), but the checklist is four files, not one. Never ignore or purge an unreadable
  item: `storedConfig` rewrites the whole config on every editor commit, so a
  drop becomes permanent on the first drag.
- **`config` is opaque per family.** A badge's payload belongs to a third party:
  never read, validate or rewrite it. An element's is ours — but keep unknown
  keys. `size` and `chrome` are *our* closed records inside it, so an unknown key
  inside either is dropped.
- **The card places, the element draws itself.** The card's only concession to
  size is `container-type: inline-size` on `.root`. Without that line `cqw` falls
  back to the viewport **silently**.
- **Three sizing modes, `mode` read only by `elementSizeCss`.** `mode` overrides,
  it never erases. The pre-1.2 `{ auto: bool }` shape is still read and never
  written back.
- **The chrome is one wrapper, and the host's box never changes.** `.chrome` is
  always in the DOM; only its styling is conditional. `size` is the whole
  footprint; `content_ratio` shrinks what is inside it, never the item.
- **`chrome.theme` carries the switch**, like `size.mode` and like `color`.
  `none` draws nothing and **keeps every number**. It is a storage value, never
  offered in the interface.
- **The chrome's shape is conditional; its halo is not** (the halo is now
  opt-in via `halo`, but it is still never clipped by the chrome's rule).
  Getting this wrong clipped every chromeless icon into a circle in 1.3.0.
- **The editor rounds; the model does not clamp.** Sliders guide; someone outside
  their range is writing YAML and means it.
- **Anchor is per-item, `auto` by default**, ten values, offsets derived at
  render. Re-anchoring asks the preview for coordinates *before* writing.
- **Ratcheting drag bounds computed in `pointermove`**, never at `pointerdown`.
- **Pixels during the drag, percentages on release**, one commit per gesture,
  two decimals.
- **No `z-index` in the rendered stacking** — DOM order = list order. One
  exception, reserved to the editor: the selected or dragged item is raised while
  `editing`.
- **The theme, the opacity, the halo and the hover come from one CSS module**,
  `src/card/item-styles.ts`, and each element's `static styles` is an array that
  puts the shared blocks first. Consequence for the tests: `cssRules` in the
  harness must accept an array of `CSSResult` — handed an array it would read
  `undefined` and return an empty map, so every CSS assertion would pass by
  finding nothing. That is worse than a failure.
- **The item list reads top-down; the array is untouched** (1.4.0). Reversing the
  array was refused: the array's order *is* the paint order, no key in the config
  distinguishes a pre- from a post-reversal array, so the migration would be
  undecidable — and `picture-elements` stores paint order too. The flip lives
  entirely in `badge-list.ts`: one `_flip(i) = length - 1 - i`, its own inverse,
  applied to the three indices that leave the component (`item-edit`,
  `item-removed`, both ends of `item-moved`). It must never leak further:
  `item-edit` becomes `_editingIndex`, which travels to the **card** to mark the
  selected item.
- **The hover: a veil with a chrome, a grow without** (1.4.0). With a surface
  there is something to tint — 4% of the item's own colour, 12% pressed, HA's
  badge ripple figures, behind `--psc-hover-opacity` / `--psc-pressed-opacity`.
  Without a surface a 4% veil over a photograph is invisible, so the item grows
  to 1.08 instead. The veil is deliberately independent of
  `--psc-chrome-opacity`. Only `clickable` items react, and the card's
  `.editing .item > * { pointer-events: none }` already keeps the editor out.
  The 1.2.0 grow at 1.04 was rejected twice by eye before this split.
- **`storedConfig`'s `chrome && !isDefaultChrome(chrome)` is not a redundant
  guard.** Two reviewers have flagged it; it is correct.
- **Single-file build, no dynamic import, no decorators, Lit bundled.**

## Hard-won facts about Home Assistant (all verified in their source)

- **HA rebuilds the card element on every config change** — no card-side state
  survives a commit.
- **`preview` does not mean "I am the edit dialog's preview"** — `_inEditPreview()`
  walks for the edit chrome. Do not "simplify" it to an attribute test.
- **`state-badge` is the entity-icon disc, NOT the Lovelace badge.** Its colour
  computation lives **inside** the `overrideImage === undefined` branch, so
  passing `""` to hide a picture also kills the colour. It sets
  `--state-inactive-color: initial` on its own host, paints an entity picture as
  a `background-image` on that host, and writes the resolved colour inline onto
  its internal `<ha-state-icon>` — nothing is exposed. Radii:
  `--state-badge-border-radius`, `…-with-image-…`, `…-with-media-image-…`.
- **`stateColorCss` computes no colour.** It returns a chain of nested `var()`
  fallbacks — `var(--state-light-on-color, var(--state-light-active-color,
  var(--state-active-color)))` — and the theme resolves it. So the state colour
  is reproducible without reading anything private: `src/state-color.ts` rebuilds
  the recipe (33 coloured domains, device class first, `slugify`d state,
  active/inactive, battery thresholds, single-domain groups, `hvac_action`,
  `rgb_color`, the brightness filter). What a copy duplicates is a **token
  naming convention**, the one every published theme redefines, and it degrades
  rather than breaks: a missing domain falls to `--state-active-color`.
- **`ha-visibility-status` is the visibility verdict, as a component.** Public
  surface: `hass`, `conditions`, and a `state` of `"visible" | "hidden" |
  "invalid"` written in `willUpdate` — so after `await el.updateComplete` it is
  current. No event, no reflection: `state` is a plain property, which is why one
  instance is cheap to drive and N instances need a controller. Mounted hidden it
  is an oracle, and its `ConditionListenersController.hostDisconnected()` calls
  `clear()`, so removing it releases every subscription. `setup()` clears first
  and returns early on an empty list, so handing it `conditions = []` genuinely
  idles it. Its icon/colour mapping is `mdi:eye` / `mdi:eye-off` /
  `mdi:alert-circle` on `ha-alert`'s `success` / `warning` / `error`, which
  resolve to `--success-color` / `--warning-color` / `--error-color`. It has **no
  icon-only mode** — it always draws a full alert with a headline and supporting
  text. Note the cost: its `willUpdate` re-runs `setup()` whenever `hass`
  changes, so it clears and re-subscribes its listeners on every tick — HA's own
  banner does the same, and an oracle beside it doubles that while the section
  is open.
- **`window.loadCardHelpers()` exposes exactly nine symbols** — `showEnterCodeDialog`,
  `showAlertDialog`, `showConfirmationDialog`, `showPromptDialog`,
  `importMoreInfoControl`, `createBadgeElement`, `createCardElement`,
  `createHeaderFooterElement`, `createHuiElement`, `createRowElement`. Dialogs
  and element factories. **No colour utility, no `computeCssColor`, nothing
  else** is reachable from a custom card. Check this list before assuming
  anything of HA's is importable.
- **The brightness filter is `brightness((brightness + 245) / 5 %)`**, excluded
  for `plant` (whose `brightness` is light *received*). 255 → 100%, 128 → 74.6%,
  1 → 49.2%. `state-badge` applies it to the glyph itself, so an icon has had it
  since 1.2.0 without us doing anything.
- **A named colour applies only while the entity is active**, in `state-badge`
  and now in ours — which is what the editor's own helper text promises.
- **A badge's icon is not `state-badge`**: `hui-entity-badge` renders `ha-badge`
  and colours it through `--badge-color`. `ha-badge`'s fill is
  `var(--ha-card-background, var(--card-background-color, white))`, **opaque**.
  It has **no `:hover` rule**: it uses a Material ripple, `--ha-ripple-color:
  var(--badge-color)`, hover `.04`, pressed `.12`.
- **Theme colour tokens come in two layers, and only one is mode-independent.**
  The `--ha-color-*` core palette is a global `html { … }` with no dark
  counterpart; the semantic layer above it comes in two copies and
  `applyThemesOnElement` writes exactly one onto `<html>` in JavaScript. A
  theme's *other* mode is unreachable.
- **Translations are per panel, not per card.** `loadFragmentTranslation` is
  called with three names in the whole bundle — `config`, `lovelace`, `energy`.
  Every Lovelace key resolves; `ui.panel.profile.*` does not.
- **`hass.formatEntityName(stateObj, name)`** resolves the composed-name
  sentinels the `entity_name` selector stores.
- **`hass-action`** is a DOM event the root `<home-assistant>` hands to
  `handleAction`. **`action-handler`** is a singleton on `document.body` with
  `bind(el, {hasHold, hasDoubleClick})`.
- **A badge is clickable when** `!tap_action || hasAction(tap|hold|double)`.
- **`ha-form` spaces its root children by 24px**; `ha-form-expandable` zeroes the
  panel's padding and wraps its body in a `.content` div at 12px.
- **`ha-form` merges the changed field onto the whole `.data` it was given**, so
  `.data` must always be the complete flat record.
- **`ha-form`'s two boolean paths render DIFFERENT controls.**
  `{ selector: { boolean: {} } }` → `ha-selector-boolean` → `<ha-switch>`.
  `{ type: "boolean" }` → `ha-form-boolean` → `<ha-checkbox>`. Neither exposes a
  token for the gap between label and control.
- **`.section-label` in `element-form.ts` carries `margin-block-end: 0.5em`** and
  is meant to sit *above* a control group; beside a control it needs its own class.
- **`ha-form` takes `icon: "mdi:…"` as first-class beside `iconPath:`.**
- **`ha-selector-select` in `mode: "list"`** never passes `orientation`, and
  exports no part — render the group yourself behind `customElements.get`.
- **`selector: { number: { mode: "box" } }`** removes the slider.
- **`ha-dropdown` is Web Awesome's dropdown**, reports its choice on `wa-select`,
  and takes `placement` — HA's own code writes `placement="bottom-end"` for a
  right-hand trigger. An unsupported placement degrades to the default position,
  so no guard is needed: nothing vanishes.
- **`hui-card` IS HA's implementation of the `visibility` key**, publishing its
  verdict through the native `hidden` attribute. Catches: `preview`
  short-circuits to visible, `_updateVisibility` returns early without an inner
  card *and* without `hass`, and a config change does not re-evaluate.
- **`hui-conditional-element` is a trap**: it signals nothing.
- **`state-display` carries no stylesheet**, so an inherited property set on the
  host reaches its text unopposed — no `::part`, no token needed.
- **`ha-expansion-panel` header slot order** is `leading-icon → header → event →
  chevron → icons`.
- **`ha-icon-button` reads `--ha-icon-button-size`**, not `--mdc-icon-button-size`.
- **The modern entity list is `hui-entity-editor`** — 48px rows, 8px apart.
- **`--ha-card-border-width` is 0 in many themes.**
- **The shipped `.js.map` files carry the raw GitHub URL of every source file.**
- Labels: `ui.panel.lovelace.editor.card.generic.<name>` for most,
  `…badge.entity.<name>` for `color` / `show_entity_picture`,
  `…picture-elements.element_types.<type>` for element kinds, `ui.common.auto`.
- `applyThemesOnElement` is internal, so a card-level `theme` cannot be honoured.
- **A view type can redefine anything for everything underneath it.**
  `hui-panel-view` saves the theme's card tokens under `--restore-card-*` then
  zeroes `--ha-card-border-radius`, `--ha-card-border-width` and
  `--ha-card-box-shadow` on `*`. Custom properties inherit, so that crosses our
  shadow DOM onto third-party content. We restore the three on `.item`, and
  `hui-card` hands us the switch (`isPanel`, reflected as `ispanel`).
  Conditional on purpose: `--restore-card-*` exists **only** under a panel view.
- **Sections grid**: 12 columns, `--row-height: 56px`, `--row-gap: 8px`.
- **Under `anchor: auto` an item sits on a fractional pixel by construction.**
  `position.ts` writes `translate(-<left>%, -<top>%)` of the item's *own* box, so
  the offset is the coordinate itself; a fixed anchor uses 0 / 50 / 100 instead.
  A `transform: scale()` animation on a non-promoted layer then re-rasterizes and
  snaps to the pixel grid differently each frame — the item visibly jumps by a
  pixel. **`will-change: transform` fixes it** (rasterize once, composite the
  scale) and this was confirmed in the user's browser on 2026-08-18. `50% / 50%`
  is the *most* likely value to show it, not the safest. Rounding the stored
  percentages would change nothing.

## The recurring traps

1. **A key that saves cleanly and does nothing** is worse than an absent one.
   Four times: `state_image` (no `entity`), `visibility`, `theme`, `title`.
2. **A mechanism can be reviewed correct and rest on a false premise.** The first
   re-anchor design was proved terminating and could never fire. So was the
   `preview` reading, and 1.2.0's colour bug. **And so was spec decision 6**,
   which refused the state colour on the premise that it was a computation —
   reading HA's source showed it was a string of variable names. **When behaviour
   or a decision rests on a claim about HA, go read HA.**
3. **What the suite cannot see.** happy-dom does no layout: nothing about
   `clamp()`, `cqw`, positioning, pointer muting, compositing or CSS is
   observable there. 1.2.0 shipped six such defects past a green suite and two
   reviews; 1.3.0 added the chromeless-circle clipping, which five reviews read
   and the user saw in seconds. **Plan for the walk; do not hope to skip it.**
4. **A test that restates a constant stops guarding it.** Assert literals — which
   is why every `state-color` expectation spells the whole `var()` chain out.
5. **A pair of tests that check different sets is a hole.** The two localization
   tests once asserted different keys; they now share one `KEYS` list. Same
   reasoning put the shared hover block's assertions in one file, with both
   element tests asserting the *same* three selectors.

## How we work (project rules, see AGENTS.md)

- **Reuse Home Assistant's machinery rather than reimplementing behaviour** —
  but check `loadCardHelpers`'s nine exports before assuming reuse is possible,
  and when a copy is the only way, say so in the file: the upstream paths, the
  build it was reconciled against, and what happens when it drifts.
- **Ask what the view type changes under us.** Panel and not-panel are not the
  same environment. Walk both.
- Chat in **French**, everything else in English.
- Propose, then wait for validation — no edit, no dispatch, no commit without it.
- **Never `git push`** — it publishes. The user does it.
- **Leave a clean tree at the close.**
- **The user's browser walks cover a panel view and a sections view, every
  time.** They do not announce it.
- Serena's symbolic tools are primary for code.
- **A CHANGELOG entry must change what a user does.** See the auto-memory
  `changelog-is-for-users`: expected platform behaviour and corrections to
  unreleased features get cut.
- Implementation normally runs through dispatched subagents with a written brief,
  then an independent reviewer per task, then a whole-branch review — model and
  effort per AGENTS.md. **The 2026-08-18 session ran in-session instead**, on the
  harness rule that subagents are not dispatched unless the user asks. **Never
  touch git while a subagent is running**, and note that `git merge -F -` does
  not read stdin the way `git commit -F -` does.
- Review findings have repeatedly been right in conclusion and wrong in
  mechanism. Verify a claim in HA's source before dispatching a fix for it.
- **`pnpm lint` is not silent on a clean tree**: 6 warnings and 1 info, all
  pre-existing, all in test files plus one `useLiteralKeys` in
  `element-form.ts`. The bar is **exit code 0**, not an empty output — and an
  implementer reporting "the lint errors are pre-existing" is to be disbelieved
  and measured (`git show HEAD:<file>` and compare).
