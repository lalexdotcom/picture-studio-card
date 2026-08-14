# picture-studio — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-studio`: an image with
items placed on it, positioned by **dragging them on the live preview** inside
the normal card-edit dialog. "picture-elements, but you place the items with the
mouse".

**Two families of item since 1.2.0**: Lovelace **badges**, and **elements** —
today one kind, `state-icon`, an icon that reflects an entity's state and sizes
itself from the **card's** width.

**1.2.0 was merged into `main` on 2026-08-14** (merge commit `586fac9`,
`--no-ff`, branch `feat/state-icon-element` deleted). **Nothing is pushed** —
`main` is ahead of `origin/main`, and pushing is what publishes: `release.yml`
reads `version`, finds no `v1.2.0` tag, and builds/tags/publishes the release
HACS installs. **The user pushes, never the agent.**

Releases so far: 1.0.0 (2026-08-12, by hand), 1.1.0 (2026-08-13, first from the
automated chain), 1.2.0 (merged 2026-08-14, awaiting the user's push).
Suite: **239 tests**. Bundle: 101.8 kB / 25.2 kB gzip.

## Where things are

- Specs: `docs/superpowers/specs/` — `2026-08-11-picture-badges-design.md`
  (authoritative base), then `2026-08-12-item-anchor`,
  `2026-08-13-per-tick-work`, `2026-08-13-release-on-version-bump`, and
  **`2026-08-13-state-icon-element-design.md`** (the element family; carries a
  Verification record of the browser walk).
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
  20260729.6. **This is the single most productive habit in this project.**

## Source layout

```
src/position.ts        px <-> % conversion, anchor-aware style and bounds (pure)
src/element-size.ts    IconSize, the three sizing modes, iconSizeCss (pure)
src/config.ts          item families, normalization, storage, tags (pure)
src/strings.ts         our own en/fr catalog — the last resort, 7 keys
src/broker.ts          editor + card registries (pure)
src/types.ts           hand-declared HA interfaces
src/card/picture-studio-card.ts   background + item children + lifecycle
src/card/state-icon-element.ts    the element: state-badge, size, action relay
src/card/drag-layer.ts            pointer gesture, injected callbacks
src/editor/picture-studio-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/background-schema.ts      ha-form schema for the card itself
src/editor/badge-list.ts             rows, ha-sortable, the add menu
src/editor/badge-form.ts             the badge's own editor + Position section
src/editor/element-form.ts           our ha-form + Size and position section
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
    anchor: center              # absent => proportional
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
  default — but keep unknown keys, for the same reason as above.
- **The card places, the element draws itself.** The card's only concession to
  size is `container-type: inline-size` on `.root`; `cqw` is a percentage of that
  box. Without that line `cqw` falls back to the viewport **silently**, which is
  the exact bug the feature exists to fix.
- **Three sizing modes, `mode` read only by `iconSizeCss`.** `auto` applies the
  card's defaults (24 / 8% / 48, measured on this card, not inherited from the
  picture-elements workaround's 40 / 3.5 / 70 which were viewport-derived);
  `adaptive` uses the item's numbers; `fixed` emits plain px, no clamp, no
  container unit. **`mode` overrides, it never erases** — switching to `auto`
  keeps the stored numbers, and `isDefaultIconSize` compares all five fields so
  storage cannot drop numbers worth keeping. `normalizeIconSize` still reads the
  pre-1.2 `{ auto: bool }` shape and never writes it back.
- **The element reuses, it does not reimplement.** `state-badge` draws and
  colours the icon; `action-handler` (a real custom element with `bind()`)
  detects the gesture; `hass-action` hands it to HA's own `handleAction`. We
  write the relay and nothing else.
- **`.data` must stay the complete flat record.** `ha-form` merges the changed
  field onto the whole `.data` it was given and re-emits it, so a conditional
  schema is safe: the schema decides what is *shown*, never what is *carried*.
- **Anchor is per-item, `proportional` by default**, ten values, offsets derived
  at render. Re-anchoring asks the preview for coordinates *before* writing, and
  commits anchor and position in one go.
- **Ratcheting drag bounds computed in `pointermove`**, never at `pointerdown`.
- **Pixels during the drag, percentages on release**, one commit per gesture.
- **Percent strings stored, numbers in code**, and no clamp to `[0, 100]`
  anywhere.
- **No `z-index`, ever.** Stacking is DOM order = list order.
- **Single-file build, no dynamic import, no decorators, Lit bundled.**

## Hard-won facts about Home Assistant (all verified in their source)

- **HA rebuilds the card element on every config change** — no card-side state
  survives a commit. Anything the editor needs from the preview must be asked for
  before writing.
- **`preview` does not mean "I am the edit dialog's preview"** — it is set on
  every card in edit mode. What separates them is the edit chrome
  (`hui-card-options` / `hui-card-edit-mode`), which `_inEditPreview()` walks for.
  Do not "simplify" it to an attribute test: it passes in masonry and fails
  silently in sections, where `hui-section` reflects `preview`.
- **`state-badge` is the entity-icon disc, NOT the Lovelace badge.**
  `hui-state-icon-element` uses it too. Its colour computation lives **inside**
  the `overrideImage === undefined` branch, so passing `""` to hide a picture
  also kills the colour — pass it only when a picture truly must be suppressed
  and no icon override is set. A fixed colour applies only while
  `stateActive(stateObj)`. And it sets `--state-inactive-color: initial` on its
  own host, so inactive entities fall through to `--state-icon-color` (#44739e,
  blue) unless the theme's value is handed back down.
- **A badge's icon is not `state-badge`**: `hui-entity-badge` renders `ha-badge`
  with `<ha-state-icon>` and colours it through `--badge-color`, computed by its
  own `_computeStateColor`. That is the road to take if `state-badge`'s
  remaining differences ever become unacceptable.
- **`hass.formatEntityName(stateObj, name)` resolves the composed-name sentinels**
  (`___device_name___`) the `entity_name` selector stores, and returns the
  entity's default name when `name` is undefined. Present since frontend
  20260429.3, i.e. at our 2026.5 floor.
- **`hass-action`** is a DOM event the root `<home-assistant>` hands to
  `handleAction`. Nothing in the frontend fires it — it exists for third-party
  cards. **`action-handler`** is a singleton element on `document.body` with
  `bind(el, {hasHold, hasDoubleClick})`; HA's directive is only those three lines.
- **A badge is clickable when** `!tap_action || hasAction(tap|hold|double)` —
  an absent key means clickable, since the default is more-info.
- **`ha-form` spaces its root children by 24px**; `ha-form-expandable` zeroes the
  panel's own padding (`--expansion-panel-content-padding: 0`) and wraps its body
  in a `.content` div at 12px, with the header a div at `role="heading"
  aria-level="3"` and the icon in `--secondary-text-color`. Copy that, do not
  invent spacing.
- **`ha-form` takes `icon: "mdi:…"` as first-class beside `iconPath:`.** HA
  inlines paths because it tree-shakes `@mdi/js`; we have no such dependency, so
  every path inlined here is a copy of a library HA already serves. Use names.
- **`ha-selector-select` in `mode: "list"`** renders `ha-radio-group` +
  `ha-radio-option`, but never passes `orientation`, which is attribute-driven
  (`:host([orientation=horizontal]) [part~=form-control-input]`) with no exported
  part — so no CSS can make it horizontal. Render the group yourself, and guard:
  an undefined custom element renders **nothing**, silently.
- **`selector: { number: { mode: "box" } }`** removes the slider.
- **Component availability is a browser question.** Counting the chunks a tag is
  inlined into is a hint, not proof: `ha-icon` 92, `ha-state-icon` ~20,
  `ha-expansion-panel` 21, `ha-radio-group` 19, `ha-button-toggle-group` 8.
  `ha-control-select` looked fine and was not. When a component must be there,
  either prove the chunk loads (our own `entity_name` field pulls
  `ha-button-toggle-group`) or write a fallback.
- **Switch tokens, for anything that must match one**: track
  `--ha-switch-background-color` / `--ha-switch-border-color`, checked
  `--ha-switch-checked-background-color` / `--ha-switch-checked-border-color`,
  thumb `--ha-switch-thumb-background-color`. The `--ha-color-*` layer they fall
  back to does **not** exist at our 2026.5 floor — always close the chain on a
  long-lived variable (`--divider-color`, `--primary-color`,
  `--secondary-background-color`, `--text-primary-color`).
- **An outer-tree rule beats a `:host` declaration**, which is how a component's
  own token blanking can be undone from outside.
- Labels: `ui.panel.lovelace.editor.card.generic.<name>` for most,
  `…badge.entity.<name>` for `color` / `show_entity_picture` (and
  `color_helper`), `…picture-elements.element_types.<type>` for element kinds,
  `ui.common.auto`. Form-control labels resolve to `--wa-form-control-label-*`.
- Core badges are exactly `entity` and `shortcut` (2026.5+ for `shortcut`).
- `hui-image-element.setConfig` defaults **both** `tap_action` and `hold_action`
  to more-info; both must be pinned to `none`.
- `title` means the ha-card header for us, a tooltip for `hui-image-element`.
- `applyThemesOnElement` is internal, so `theme` cannot be honoured;
  `visibility` on a badge does nothing here (the container evaluates it).
- **Sections grid**: 12 columns, `--row-height: 56px`, `--row-gap: 8px`;
  `hui-card` is `height: 100%`.

## The recurring traps

1. **A key that saves cleanly and does nothing** is worse than an absent one.
   Four times: `state_image` (no `entity`), `visibility`, `theme`, `title`.
   Before exposing a key, verify something consumes it, the way the label claims.
2. **A mechanism can be reviewed correct and rest on a false premise.** The first
   re-anchor design was proved terminating and could never fire. So was the
   `preview` reading. And in 1.2.0, the colour bug: our own `overrideImage: ""`
   short-circuited a computation nobody had read to the end. **When behaviour
   contradicts a proof, doubt the premise and go get evidence.**
3. **What the suite cannot see.** happy-dom does no layout: nothing about
   `clamp()`, `cqw`, positioning, pointer muting or CSS is observable there. Six
   real defects survived a full green suite, a per-task review and a
   whole-branch review in 1.2.0 — every one of them found in the browser within
   minutes. Plan for the walk; do not hope to skip it.
4. **A test that restates a constant stops guarding it.** Two were found copying
   `DEFAULT_ICON_SIZE` values with a comment naming the constant.

## How we work (project rules, see AGENTS.md)

- Chat in **French**, everything else in English.
- Propose, then wait for validation — no edit, no dispatch, no commit without it.
- **Never `git push`** — it publishes. The user does it. Local merges are fine.
- **Leave a clean tree at the close**, and if changes remain (a formatter's, or
  the user's own), show them and get validation before committing them.
- Serena's symbolic tools are primary for code.
- Implementation runs through dispatched subagents with a written brief, then an
  independent reviewer per task, then a whole-branch review. Model/effort per
  AGENTS.md. **Never touch git while a subagent is running.**
- Review findings have repeatedly been right in conclusion and wrong in
  mechanism. Verify a claim in HA's source before dispatching a fix for it.
</content>
</invoke>
