# state-label — design

Date: 2026-08-17 · Target release: 1.4.0

## Goal

Add a second element kind, `state-label`: an entity's **text** placed on the
picture — a name, a state, or both — sized from the card's width like every
other item, and able to stand on the same kind of surface an icon stands on.

Home Assistant's picture-elements offers seven element types. Five are already
reachable from this card: `conditional` is superseded by per-item `visibility`,
`service-button` by a template badge, `icon` by a `state-icon` with a fixed icon
and colour, `state-badge` and `state-icon` by our own element. `state-label` is
not — it renders text, not a glyph, and nothing in either item family can do
that today. (`image` remains uncovered; it is out of scope here.)

The release also turns the halo — the rim and glow every icon has worn since
1.2.0 — into an opt-in, and reorganises the appearance controls of both kinds.

## Decisions

### 1. The halo becomes opt-in, default off

Today `filter: drop-shadow(…) drop-shadow(…)` sits unconditionally on `.chrome`,
so **every** icon carries it. It moves behind `:host([halo])`, driven by a new
`halo` boolean in an element's `config`, absent ⇒ `false`.

This is a visible behaviour change for every dashboard already using 1.2.0 or
1.3.0: icons lose their halo on upgrade until the box is ticked. Accepted
deliberately — those releases are days old and were never announced. It leads
the `Changed` section of the CHANGELOG.

`halo` is the same boolean, with the same default, for both kinds. It lives in
`config` beside `chrome`, not at item level: the card places, the element draws.

### 2. "Chrome" becomes "Appearance", and moves after "Size and position"

Section order, **both** element kinds — this supersedes the 1.3.0 order:

> Entity · Content · Interactions · Size and position · **Appearance** · Visibility

The section title comes from Home Assistant:
`ui.panel.lovelace.editor.card.map.appearance`. It is the only occurrence of the
word in the frontend, it lives in the `lovelace` fragment — loaded whole on any
dashboard — and it is already the prefix we borrow `theme_mode` from
(`THEME_KEY` in `element-form.ts`). It is translated in every language HA ships,
so the section costs us no string of our own.

Inside, the section is **flat**: the halo checkbox, then the chrome checkbox and
its conditional controls. No nested expansion panel, and therefore no sub-title
— which retires the `chrome` string entirely.

The halo checkbox reads **"Stand out" / "Détacher"**, with a permanent helper
text rather than a tooltip icon: `ha-form-boolean` renders
`<ha-checkbox .hint=${this.helper}>`, so `computeHelper` beside our existing
`computeLabel` is the whole mechanism. `ha-help-tooltip` exists but has no
attachment point inside `ha-form`, and a hover tooltip does not exist on mobile.

### 3. Content is the badge's editor, inverted

`state-icon` kept the icon half of Home Assistant's entity-badge form.
`state-label` keeps the other half:

- `name` — `entity_name` selector, composed or custom, resolved through
  `hass.formatEntityName`. Unlike `state-icon`, where it feeds the tooltip, here
  it is visible text.
- `displayed_elements` — the Name / State checkboxes, stored as `show_name` and
  `show_state`, exactly as `hui-entity-badge-editor` does.
- `state_content` — `{ ui_state_content: { allow_name: true } }` with
  `context: { filter_entity: "entity" }`.
- `time_format` — conditional, shown only when `state_content` carries a
  time-based value. HA's own behaviour, copied.
- `color` — see decision 6.

Labels come from `ui.panel.lovelace.editor.badge.entity.*`, the keys the icon
form already uses.

### 4. Two lines, the name secondary

With both boxes ticked, the name sits above the state at ~75 % of the body size
in `--secondary-text-color`, the state at full size. One size control, a
hierarchy the eye expects from a name/value pair, and — on a photograph —
hierarchy does more for legibility than the halo does.

The ratio is derived, never a setting. Someone who wants a single line unticks
Name and puts `name` inside `state_content`, which `allow_name` permits.

### 5. Size: the same three modes, per-kind defaults

`state-label` reuses the `size` record and `iconSizeCss` unchanged — they are
pure and know nothing about icons. The value drives `font-size` instead of the
box.

The `auto` defaults are per kind: `clamp(24px, 8cqw, 48px)` for an icon,
`clamp(11px, 4cqw, 20px)` for text — half the ratio, so a label reads at roughly
half an icon's height beside it. **The exact numbers are to be settled in the
browser walk**; the mechanism does not depend on them.

Concretely, `iconSizeCss` takes its defaults as a parameter instead of reading a
module constant.

Home Assistant has no responsive typography to borrow: its scale is
`calc(<fixed px> * var(--ha-font-size-scale))`, the factor is written once in the
global `html {}` at `1` and nothing in the bundle changes it. There is no
`font-size: clamp(…)` and no `cqw`/`cqi` anywhere in the frontend. Our container
query does something HA cannot, on the only basis that matters here — the card's
width, not the screen's.

### 6. No state colour on a label in 1.4.0

`state-icon` computes no colour: it hands `.color` to `state-badge`, which calls
`stateColorCss(stateObj)`, adds `rgb_color` for lights, a brightness filter and
an `hvac_action` case, then writes the result inline onto its internal
`<ha-state-icon>`. None of it is reachable from outside, and `hui-entity-badge`
duplicates the same computation on its side.

Reimplementing it was rejected: a copy of a non-exported HA function drifts
silently across versions. Stealing the colour from a hidden `state-badge` at
runtime is fragile and invisible to the test suite; it is parked as a follow-up,
not adopted.

So the label's selector simply omits `include_state`:

```js
{ name: "color", selector: { ui_color: { include_none: true, default_color: "none" } } }
```

`none` means "I name no colour, the theme decides". `computeCssColor` maps
palette names to `var(--<name>-color)` but returns `none` unchanged, and
`color: none` is not valid CSS — **our code intercepts `none` and writes
nothing**. That case does not exist for the icon, where `state-badge` handles it.

`default_color` adds no entry to the list: it presets the value and suffixes the
matching option with " (default)", while leaving the key out of the YAML until
the user picks something.

The icon keeps its published line untouched:
`{ ui_color: { default_color: "state", include_state: true } }`.

Consequence: the label does **not** show HA's `color_helper` ("Inactive state …
will not be colored"), which only describes the state-colour case and would be
false here. The icon keeps it.

### 7. Two chrome records, no migration

The two habillages diverge: `radius` as a percentage of a square makes a disc,
but a squashed ellipse on a 120 × 30 box; `content_ratio` shrinks content inside
a fixed box, which for text would mean shrinking the very body size set in
decision 5.

`chrome.ts` keeps its shared trunk — `ChromeTheme`, `THEMES`, `chromeFill` — and
carries two records:

- `IconChrome` — today's, renamed, **behaviour untouched**:
  `{ theme, radius (% of the box), opacity, content_ratio }`.
- `LabelChrome` — new: `{ theme, radius (px), pill, opacity, padding (px) }`.
  `pill` is a checkbox that overrides `radius` with a full round end.

Each kind reads its own, each has its own normalization. No migration, and no
`radius` key that changes unit depending on its neighbours.

This closes follow-up #1, open since 1.3.0: **`chrome` does not move up to item
level.** An icon's surface and a label's surface are not the same object, so it
stays in `config`, where a kind's own keys live. The feared migration has no
reason to happen.

Rounding follows the existing rule: the editor rounds every numeric field so a
slider cannot leave a fraction behind; the model clamps nothing, because someone
outside the slider's range is writing YAML and means it.

### 8. The halo follows the body size, never the box

The blur is `calc(var(--psc-…-size) * 0.06)` — a share of **our** size value, not
of the rendered box. Since decision 5 makes that value the font size for a
label, the halo scales with the text for free. The white rim stays a fixed
hairline, as it is for the icon.

`--psc-icon-size`, `--psc-icon-outline` and `--psc-icon-glow` are public since
1.2.0 and are **not renamed**; the label gets its own `--psc-label-*`. What is
not duplicated is the recipe: a pure function produces the
`drop-shadow(…) drop-shadow(…)` string from the token name it is given, so the
proportions are decided in one place.

An icon's box is still exactly `--psc-icon-size`, chrome included. A label's is
not: its width belongs to the text, so **the chrome enlarges the item's box**.
Positioning and drag bounds read the rendered box, so they follow — but the
1.3.0 invariant does not survive as written, and this is a browser check, not a
suite check.

### 9. No wrapping, no maximum width

A label never wraps, whatever it contains — one line per displayed part. No
`maxWidth` in 1.4.0: `state_content`, the name and the picked entity are all
chosen by someone watching the live preview, so length is already under their
control. A width cap can be added later without breaking anything.

## Config shape

```yaml
# state-icon — unchanged, plus one key
config:
  type: state-icon
  # … everything as published in 1.3.0 …
  halo: false                 # 1.4.0 — absent ⇒ false
  chrome: { theme, radius, opacity, content_ratio }

# state-label — new
config:
  type: state-label
  entity: sensor.salon_temperature
  name: ___device_name___     # optional, composed sentinels
  color: none                 # none | a theme colour — never "state"
  show_name: false
  show_state: true
  state_content: state        # string | string[]
  time_format: 24             # only when state_content carries a time
  tap_action / hold_action / double_tap_action
  size: { mode, ratio, min, max, value }   # drives font-size
  halo: false
  chrome: { theme, radius, pill, opacity, padding }
```

An element's `config` stays ours to read, validate and default — while unknown
keys are kept, because `storedConfig` rewrites the whole config on every editor
commit and a drop would become permanent on the first drag. `size` and `chrome`
remain closed records, so an unknown key **inside** either is dropped.

## Rendering

`picture-studio-state-label`, in `src/card/state-label-element.ts`, same
contract as the icon: `setConfig`, `hass`, and a host the card positions without
ever measuring it.

```html
<div class="chrome">           <!-- halo, fill via ::before, padding, radius -->
  <div class="content">        <!-- font-size = the size value -->
    <span class="name">…</span>                    <!-- if show_name -->
    <state-display .content=${state_content} …/>   <!-- if show_state -->
  </div>
</div>
```

- The name comes from `hass.formatEntityName(stateObj, config.name)`, the call
  the icon already makes for its tooltip.
- The state comes from `<state-display>`, passed `.hass`, `.stateObj`,
  `.content` and `.timeFormat` — the component `hui-entity-badge`, the tile card
  and heading badges all use.
- `line-height: 1.2`, `white-space: nowrap`.
- The fill sits on `.chrome::before` so `opacity` fades the surface and never the
  text — the same reason the pseudo-element exists for the icon.
- Actions reuse the icon's mechanism verbatim: `action-handler` bound in
  `updated`, `hass-action` dispatched, `clickable` attribute, click fallback.

**`state-display` fallback.** It is a custom element, and an undefined custom
element renders **nothing, silently**. Its chunk cannot be proven loaded outside
a browser. Behind `customElements.get("state-display")`, fall back to
`hass.formatEntityState(stateObj)` — a function, always available, which renders
exactly what the default `state_content` produces. Composed contents are lost,
the label never is.

## Editor

`element-form.ts` stays the host: it picks the schema from `config.type`, mounts
the sections and runs `toFormData` / `fromFormData`. The schemas and their
conversions move to one file per kind — `ha-form` merges the changed field onto
the whole `.data` it was given and re-emits it, so `.data` must always be the
complete flat record, and two kinds with disjoint keys inside one `toFormData`
is exactly where a key goes missing unnoticed.

| section | state-label fields |
|---|---|
| Entity | `entity` |
| Content | `name` · `displayed_elements` → `show_name`/`show_state` · `state_content` · `time_format` (conditional) · `color` |
| Interactions | `tap_action`, `hold_action`, `double_tap_action` |
| Size and position | size mode and its numbers · anchor picker |
| Appearance | **Stand out** (+ helper) · **Draw a chrome** → theme, pill, radius, opacity, padding |
| Visibility | `hui-card-visibility-editor`, unchanged |

Creation stub: the chosen entity, `show_state: true`, nothing else — so `auto`
size, no halo, no chrome.

Two further adjustments, both wiring rather than mechanism:

- **Elements first in the add menu**, `state-icon` then `state-label`, ahead of
  the badges. The order comes from the catalogue.
- **The header beside the Back button shows the kind's label**, not the raw
  type. Both forms print `type` today (`badge-form.ts:111`,
  `element-form.ts:397`) while the menu labels already exist and are translated:
  `elementLabel` for an element, `choiceLabel` for a badge. The raw type stays
  only as the fallback when a key does not resolve.

## Strings

| key | status | en | fr |
|---|---|---|---|
| section title | HA `…card.map.appearance` | Appearance | Apparence |
| `chrome` | **removed** | ~~Chrome~~ | ~~Habillage~~ |
| `halo_enabled` | new | Stand out | Détacher |
| `halo_enabled_helper` | new | Adds a shadow and a light rim so the element stays readable on any picture. | Ajoute une ombre et un liseré clair pour rester lisible sur n'importe quelle image. |
| `chrome_enabled` | unchanged | Draw a chrome | Dessiner un habillage |
| `chrome_radius`, `chrome_opacity` | unchanged | Radius, Opacity | Rayon, Opacité |
| `chrome_content_ratio` | unchanged, icon only | Content | Contenu |
| `chrome_pill` | new, label only | Pill | Pilule |
| `chrome_padding` | new, label only | Padding | Marge |

The kind's own name comes from
`…picture-elements.element_types.state-label`, translated by HA.

Both localization tests share one `KEYS` list — a removal and three additions
all have to land there, which is what that list is for.

## Testing and verification

**What the suite covers.** Normalization of both chromes and both sizes;
`toFormData` / `fromFormData` round-trips; `storedConfig` writing and re-reading
a label config, unknown keys included; the catalogue and the add-menu order; the
header label; and which parts are rendered for each `show_name` / `show_state`
combination. Tests assert literals, never restate a constant.

**What it cannot cover.** happy-dom performs no layout. The `clamp(…cqw…)` body,
the padding, the radius and the pill, the halo, the chrome enlarging the box,
the absence of wrapping, the name/state hierarchy — none of it is observable
there. Six such defects shipped in 1.2.0 past a green suite and two reviews, and
a seventh in 1.3.0 that five reviews read and missed.

**The browser walk is part of the plan, in a panel view and a sections view.**
Three points structure it:

1. **The halo regression.** Both directions: an existing icon no longer has one;
   ticking the box brings it back. And critically, an icon with **no** chrome and
   **no** halo must be neither clipped nor ringed — the 1.3.0 trap, on the same
   CSS rule.
2. **`state-display` availability**, plus the fallback forced by hand.
3. **The label itself**: body following the card's width, a pill still a pill at
   any text length, the halo scaling with the body and not the box, and the
   anchor holding when the chrome widens the label.

## Out of scope

- The `image` element kind — the last picture-elements type with no equivalent.
- State colour on a label; the "borrow it from a hidden `state-badge`" approach
  is to be studied separately.
- A maximum width, and therefore wrapping or truncation.
- `chrome` moving to item level: settled, it does not.

## Versioning

`1.4.0`. `package.json` stays at `1.3.0` while the work is in progress; the
CHANGELOG heading reads `unreleased` and both change together at delivery, with
the git tag. The CHANGELOG opens on `Changed`: the halo is no longer drawn by
default and is ticked in Appearance, and that section now comes after Size and
position.
