# State-icon element — design

Status: approved 2026-08-13. Amends `2026-08-11-picture-badges-design.md`.

## Problem

Every item on the picture is a Lovelace badge, and a badge has one size. The
production workaround is the card this project set out to replace:
picture-elements with `--mdc-icon-size: clamp(40px, 3.5vw, 70px)`. It works on a
phone, where the card spans the viewport, and fails in a sections view, where
`vw` follows the window: every card on a desktop gets the same icon size
whatever its column width.

Two things are missing, and only one of them is the size. The other is an item
that is *only* an icon — no pill, no label — which no badge can be.

## Item families

`items[]` gains a second family. The discriminant stays a closed set of two
values; the open set — the one that grows — lives in `config.type`, exactly
where the badges' open set already lives.

| | family | kind | payload |
| --- | --- | --- | --- |
| badge | `type: badge` | `config.type: entity`, `custom:…` | a third party's → opaque |
| element | `type: element` | `config.type: state-icon` | ours → validated |

This is the one asymmetry, and it is deliberate. "`config` is opaque; never
read, validate, reorder or rewrite it" was written about badges, whose payload
belongs to whoever wrote the badge. An element's config is ours: we read
`config.type`, validate the keys and write the defaults. **The rule is per
family**, not global.

Adding a second element kind later touches the element catalogue and nothing
else — `normalizeConfig` already accepts the family.

## Config

```yaml
items:
  - type: element
    position: { top: 30%, left: 45% }
    anchor: center                 # absent => proportional, unchanged
    config:
      type: state-icon
      entity: light.salon
      icon: mdi:floor-lamp         # optional; the state icon otherwise
      color: state                 # ui_color: state | none | a theme colour
      name: ___device_name___      # optional => the title attribute
      show_entity_picture: false
      tap_action: { action: more-info }
      hold_action: { action: none }
      double_tap_action: { action: none }
      size:
        mode: auto                 # auto | adaptive | fixed (absent => auto)
        ratio: 8                   # adaptive only — % of the card's width
        min: 24                    # adaptive only — px
        max: 48                    # adaptive only — px
        value: 48                  # fixed only — px
```

`config` stays nested for both families, so every item has the same shape —
`type` / `position` / `anchor` / `config` — and the placement and drag code keeps
reading `position` and `anchor` without knowing what it is placing.

`size` lives inside `config`, not on the item. The split is **the card places,
the element draws itself**: the card gains no notion of size, it only declares
the container. Item-level `size` would pool the machinery for a future element
kind, at the price of giving the card an appearance responsibility it does not
have today; either way the module deriving the `clamp()` is single and shared.

`size` follows the rule `anchor` set: always present in memory, omitted on the
way out when it equals the default. A config that never touched the switch does
not grow a `size:` key.

## Types

Two nested discriminated unions. `normalizeConfig` is the parse boundary:
`unknown` in, the union out, both discriminants raised there and nowhere else.

```ts
interface ItemBase {
  position: Position;
  anchor: Anchor;
}

interface BadgeItem extends ItemBase {
  type: "badge";
  config: BadgeConfig;
}

interface ElementItem extends ItemBase {
  type: "element";
  config: ElementConfig;
}

type PictureItem = BadgeItem | ElementItem;

type ElementConfig = StateIconConfig;          // | StateLabelConfig, later

interface IconSize {
  mode: "auto" | "adaptive" | "fixed";
  ratio: number;                               // adaptive — % of the card's width
  min: number;                                 // adaptive — px
  max: number;                                 // adaptive — px
  value: number;                               // fixed — px
}

interface StateIconConfig {
  type: "state-icon";
  entity?: string;
  icon?: string;
  color?: string;
  name?: string;
  show_entity_picture?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  size: IconSize;
}
```

Of the eight functions taking a `PictureItem`, five touch only `position` and
`anchor` — `moveItem`, `removeItem`, `setAnchor`, `_applyPositions`, the list —
and compile unchanged against the union. Three need a branch: `addItem` and
`replaceBadge`, typed on `BadgeConfig` today, and `rowLabel`, which reads
`entity` / `type` / `name` for the row label. `badge-items.ts` loses its prefix.

The payoff arrives later: an exhaustiveness check on `never` in the factory and
in the form means that the day `state-label` joins `ElementConfig`, **the
compiler enumerates the places** that must handle it.

## `type` becomes required

`normalizeConfig` currently defaults a missing `type` to `"badge"`, and the
README documents it. With a second value that default is ambiguous, so it goes:

```
picture-studio: items[2] must have a `type` — "badge" or "element"
picture-studio: items[2].config must have a `type` — "state-icon"
```

Absent and unknown now fail the same way, for the same reason.

**Not ignored, not purged.** Dropping an unreadable item at normalization would
not stay quiet: `storedConfig` rewrites the whole config on every editor commit,
so the first drag would erase the item from the user's YAML. An error stops the
card on a message Home Assistant shows, and leaves the config intact under its
author's eyes.

The editor has always written `type`, so the only reader affected is YAML
hand-written since 1.0.0 — two days. It is still a `Changed` entry.

## Sizing

The contract has two halves:

- the card declares `container-type: inline-size` on `.root` — the only line it
  gains;
- the element derives a CSS size string from its `config.size.mode`.

`1cqw` is 1% of `.root`'s inline size, and `.root` is exactly the image's width,
so the size follows the card: it changes with the column width in a sections
view and reproduces today's behaviour on a phone, where the card is the screen.
Without the container declaration `cqw` falls back to the viewport **silently** —
which is why that line is part of the contract, not a style detail.

Three modes, selected by `size.mode`:

- **`auto`** applies the card's defaults — `clamp(24px, 8cqw, 48px)` — ignoring
  whatever numbers may be stored alongside it. These are measured on this card
  rather than inherited: the picture-elements workaround used 40 / 3.5 / 70, but
  those bounds were chosen against the viewport. Against the card, a steeper
  ratio between tighter bounds is what holds the icon's proportion as a column
  narrows.
- **`adaptive`** renders `clamp(<min>px, <ratio>cqw, <max>px)` from the item's own
  numbers, so the size still scales with the card but within the user's chosen
  bounds.
- **`fixed`** renders `<value>px` — plain pixels, no container unit, no clamp.
  It earns its place for layouts where the icon must hold a precise size regardless
  of the card's width: a map overlay, a legend, a control panel with fixed columns.

`size.mode` overrides; it never erases. Switching to `auto` keeps the stored
`min`, `ratio`, `max`, and `value` intact — only the render substitutes the
defaults for them — so switching back to `adaptive` or `fixed` restores exactly
what was typed. Storage drops `size` only when all five fields equal the defaults,
not merely when `mode` is `"auto"`: an auto size may carry numbers worth keeping.

When `min > max` under `adaptive`, CSS `clamp()` returns the minimum by
specification; this is documented rather than validated, since rejecting a
transient value while the user is typing is more hostile than living with it.

One value drives the whole visual footprint: `width`, `height` and
`--mdc-icon-size` all read `--psc-icon-size`, so a glyph and an entity picture
occupy the same box. Home Assistant's own 24/40 glyph-to-box ratio is not
reproduced — the production setting reasons about the glyph, and two numbers for
one size would be two numbers to tune.

## Rendering

A new Lit element, `picture-studio-state-icon`, in `src/card/state-icon-element.ts`:

```js
<state-badge
  .hass=${hass}
  .stateObj=${hass.states[config.entity]}
  .overrideIcon=${config.icon}
  .color=${config.color ?? "state"}
  .overrideImage=${config.show_entity_picture ? undefined : ""}
  title=${config.name ? hass.formatEntityName(stateObj, config.name) : nothing}
/>
```

`state-badge` is Home Assistant's entity-icon component — the disc at the left of
an entity row, not the Lovelace badge — and it already consumes all four content
fields: the state icon or an override, colouring by state including a light's
real `rgb_color` and `brightness`, an entity picture as a rounded background, and
the three `ui_color` values (`state`, `none`, a theme colour resolved through
`computeCssColor`). One caveat worth knowing: a fixed colour applies only while
`stateActive(stateObj)`, so an inactive entity stays grey — the same behaviour as
badges and tiles.

`overrideImage: ""` is what forces the icon when the entity picture is switched
off: the entity-picture branch is guarded by `void 0 === this.overrideImage`, and
the empty string is falsy further down. Subtle, hence first on the verification
list.

**`entity` is optional, and normalization does not demand it.** A freshly added
icon has no entity yet: unlike a badge, whose class supplies a `getStubConfig`
that picks one, our stub is `{ type: "state-icon" }` and the form opens on the
entity selector, its first field. Until one is chosen, `state-badge` draws its
own missing marker — an alert glyph — which is also what an entity later removed
from Home Assistant produces. Nothing to handle on our side, and no arbitrary
entity silently attached to a new item.

`name` is not a plain string. In *composed* mode the `entity_name` selector
stores sentinels — `___device_name___` — and writing the raw value into `title`
would display them literally. `hass.formatEntityName(stateObj, name)` resolves
them; it is a method on the `hass` object, the same family as
`formatEntityState`, and it is what `hui-entity-badge` itself calls.

## Actions

Three links — detect, decide, execute — and we write none of them.

```js
// once, after loadCardHelpers() — which the card already awaits
const h = document.body.querySelector("action-handler")
      ?? document.body.appendChild(document.createElement("action-handler"));
h.bind(this, { hasHold: hasAction(config.hold_action),
               hasDoubleClick: hasAction(config.double_tap_action) });

// on the "action" event it emits
fireEvent(this, "hass-action", { config, action: ev.detail.action });
```

`hasAction` is Home Assistant's own one-liner, ours to restate: an action counts
when it is set and is not `none`.

`action-handler` is a custom element, a singleton on `document.body`, with a
`bind(element, options)` method: Home Assistant's internal `actionHandler`
directive is nothing but the three lines above. Its thresholds, its finger-travel
tolerance and its double-click window run, not ours.

`hass-action` is a DOM event the root `<home-assistant>` listens for, handing
`detail.config` and `detail.action` to Home Assistant's own `handleAction` —
more-info, toggle, navigate, url, perform-action, assist, none, with the
confirmation dialogs. Nothing in the frontend fires it; it exists for third-party
cards, which is exactly what we are.

**Editing already mutes this**, with no second mechanism: `.editing .item > *`
sets `pointer-events: none` so a click cannot toggle a light while an item is
being dragged. Our element is that `> *`, so `action-handler` sees nothing.

If `action-handler` turns out to be undefined when asked, the fallback is a
`click` listener emitting `tap`: hold and double-tap are lost, the card is not.
Three lines of fallback rather than a fifty-line reimplementation, degrading in
the honest direction — the commonest action is the one that survives.

## Card wiring

The element implements a badge element's contract — `setConfig(config)` and a
`hass` setter — so `_syncBadges` gains **exactly one branch, at creation**. The
update path, the placement, the drag, the anchoring and the measurements do not
distinguish the two families. `_syncBadges` becomes `_syncItems`, since it no
longer synchronises badges.

The rebuild key, today `item.config.type`, becomes `${item.type}:${item.config.type}` —
otherwise two icons and a typeless badge all look like `""`.

## Editor

**The add menu** — one list, two families, prefixed with Home Assistant's own
plural labels so no string of ours is involved:

```
Badges: Entity
Badges: Shortcut
Badges: Mushroom Template
Elements: State Icon
```

The separator is `": "` in every language; the thin space French typography wants
before a colon would need a per-locale format string, which is the string this
choice avoids. The element labels are already translated in Home Assistant's
catalogue under `…picture-elements.element_types.<type>`. The element catalogue is
the twin of `badgeCatalog`; `choiceLabel` gains a branch per family.

**The row label** branches per family: for a badge, today's opportunistic reading
of `entity` / `name` / `type`; for an element, the entity and the kind's label,
which we own rather than guess.

**The form** is a sibling of `badge-form` sharing the same shell — header with its
back button, then the body, then the anchor picker at the root, displayed, exactly
as for badges. Where the badge form hosts the badge's own native editor, this one
renders our `ha-form`:

```js
[
  { name: "entity", selector: { entity: {} } },

  { name: "content", type: "expandable", flatten: true, iconPath: mdiTextShort, schema: [
    { name: "", type: "grid", schema: [
      { name: "icon",  selector: { icon: {} }, context: { icon_entity: "entity" } },
      { name: "color", selector: { ui_color: { default_color: "state", include_state: true } } },
    ]},
    { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
    { name: "show_entity_picture", selector: { boolean: {} } },

    { name: "auto_size", selector: { boolean: {} } },
    { name: "", type: "grid", schema: [
      { name: "size_min",   selector: { number: { min: 8, max: 400, step: 1,   unit_of_measurement: "px" } }, disabled: auto },
      { name: "size_ratio", selector: { number: { min: 0, max: 100, step: 0.1, unit_of_measurement: "%"  } }, disabled: auto },
      { name: "size_max",   selector: { number: { min: 8, max: 400, step: 1,   unit_of_measurement: "px" } }, disabled: auto },
    ]},
  ]},

  { name: "interactions", type: "expandable", flatten: true, iconPath: mdiGestureTap, schema: [
    { name: "tap_action", selector: { ui_action: { default_action: "more-info" } } },
    { name: "", type: "optional_actions", flatten: true,
      schema: ["hold_action", "double_tap_action"].map(n => ({ name: n, selector: { ui_action: { default_action: "none" } } })) },
  ]},
]
```

The content section is the entity badge's own, cut after `show_entity_picture` and
reordered — icon and colour on one line, the name below, the entity picture last —
with the size block appended. `displayed_elements`, `state_content` and
`time_format` are what the cut leaves out, and they are what an icon-only element
has no use for.

`ha-form` is flat and `size` is not: the four fields enter as `auto_size` /
`size_min` / `size_ratio` / `size_max` and are re-nested on write. This is not a
workaround — it is what Home Assistant's own badge editor does with
`displayed_elements`, which it explodes into `show_name` / `show_state` /
`show_icon`. `disabled` is recomputed from `auto_size` on every render, so the
three fields grey and un-grey on the switch with no code; `ha-form` supports it
per field (`.disabled=${item.disabled || this.disabled}`).

`addItem(items, badge)` becomes `addItem(items, item)`, the caller supplying the
family, so the function has nothing to guess.

## Strings

Reused from Home Assistant's catalogue, hence translated everywhere: `entity`,
`icon`, `color`, `name`, `show_entity_picture`, `tap_action`, `hold_action`,
`double_tap_action`, the `content` and `interactions` headers, the family labels
`…editor.badges.name` and `…picture-elements.elements`, the element kind labels
`…picture-elements.element_types.<type>`, plus `ui.common.auto` and
`…card.generic.minimum` / `.maximum`.

Ours, because the catalogue has neither: **"Size" and "Ratio"** — two strings in
`src/strings.ts`, English and French, joining the four already there.

## Testing

Unit, on the pure modules:

- `normalizeConfig`: a missing `type` throws (the test asserting today's `"badge"`
  default inverts), `type: element` without `config.type` throws, an unknown
  `config.type` throws, a valid item comes out with its anchor and size defaults.
- `storedConfig`: `size` omitted at its default, `anchor` omitted at
  `proportional`, and the one that matters — **an existing badge config comes back
  byte-identical**.
- The size module: `auto` resolves to the defaults, `min = max` is a fixed size,
  `min > max` returns the minimum.
- Catalogue and labels: the prefix composition per family, `rowLabel` per family,
  `addItem` with an element.
- The form schema: `disabled` follows `auto_size`, and the flat ↔ nested `size`
  round trip is bijective.

Component, on the existing happy-dom harness:

- a card with a badge **and** an icon still makes exactly **one** `setConfig` on
  mount — the background's — with the icon created by our tag, not by the helpers;
- the rebuild key: changing `config.type` rebuilds, changing another key goes
  through `setConfig`;
- the `hass` push counter holds on a mixed list, which is what keeps the per-tick
  regression from coming back;
- the action relay: an `action` event on the element produces a `hass-action`
  carrying the item's config.

**What this harness cannot say, and must not be taken as proven:** happy-dom does
no layout. Neither the `clamp()`, nor `cqw`, nor the placement, nor the pointer
muting while editing — which is CSS — is observable there. Asserting them on the
strength of a green suite would repeat the re-anchoring mistake.

## Browser verification

In the local Home Assistant, before the feature counts as done:

| # | To verify | If it falls |
| --- | --- | --- |
| 1 | `hass-action` reaches the root and executes — more-info **and** toggle | reimplement `handleAction` (the mushroom road) |
| 2 | `action-handler` is defined after `loadCardHelpers`; hold and double-tap fire | fall back to click → `tap` |
| 3 | `overrideImage: ""` forces the icon | force `overrideIcon` instead |
| 4 | `hass.formatEntityName` exists, and since which version | fall back to the raw name when it holds no sentinel |
| 5 | `state-badge` is defined with no preloading of ours | await it after `loadCardHelpers` |
| 6 | `cqw` resolves against `.root` — **in masonry and in sections** | the reason the feature exists |
| 7 | `entity_name`, `ui_color`, `ui_action`, `optional_actions` render | this is the `ha-control-select` lesson |
| 8 | `disabled` really greys the three size fields | hide them instead of greying them |
| 9 | the drag bounds correctly around an icon whose size is a `clamp` | — |
| 10 | clicking an icon in the edit preview toggles nothing | — |

Row 4 is settled without a browser, by the method already used for the version
floor: read the frontend build pinned in HA core's
`homeassistant/components/frontend/manifest.json` at the wanted tag, then read the
frontend source at that tag. **It may raise `hacs.json` above 2026.5**, and it is
the only one of the ten that commits anything but code.

## Verification record

**Row 4 — settled 2026-08-13, without a browser.** Method, the same one that set
the floor originally: read the frontend build pinned in HA core's
`homeassistant/components/frontend/manifest.json` at a tag, then read the
frontend source at that build.

| core | frontend |
| --- | --- |
| 2026.5.0 | 20260429.3 |
| 2026.6.0 | 20260527.4 |
| 2026.7.0 | 20260624.3 |

`formatEntityName` is declared on the `HomeAssistant` interface at
`src/types.ts:297` of **20260429.3** — present at our existing floor, not above
it. Its signature is
`(stateObj, type: string | EntityNameItem | EntityNameItem[] | undefined, separator?)`,
which the `(stateObj, config.name)` call satisfies with `name` typed
`string | undefined`.

**`hacs.json` stays at 2026.5.0.** The one row that could have moved it did not.

**The browser walk — done 2026-08-13/14, over four rounds.** The remaining rows
were checked in the local Home Assistant, and the row this whole design exists
for holds: **two cards of different widths in a sections view render different
icon sizes.** `cqw` resolves against `.root`, and the production problem — every
card on a desktop sharing one viewport-derived size — is gone.

Actions fire on the right gesture, the missing-entity marker appears, dragging
and its clamp behave, and the size fields follow their mode.

What the walk caught, and none of it by reasoning:

- **The colour never applied.** `overrideImage: ""` was passed whenever the
  entity picture was off — the default — and `state-badge` computes colour only
  inside its `overrideImage === undefined` branch. The empty string is now passed
  only when a picture genuinely has to be suppressed.
- **No tooltip at all**: the `title` binding was missing from the element and
  from the property list its review was given.
- **Inactive entities came out blue**, where a badge shows grey: `state-badge`
  sets `--state-inactive-color: initial` on its own host, so inactive states fall
  through to `--state-icon-color`, the #44739e of entity rows. The theme's value
  is handed back down to it.
- The pointer, the hover, the section padding, the form's field order, the
  section icons and the anchor picker's colours were all aligned on values read
  from Home Assistant's own components rather than chosen.

One case remains, known and deliberate: an entity that **has** a picture, with
the picture switched off and no icon chosen, draws an uncoloured icon. Suppressing
the picture is what costs the colour. picture-elements cannot express that case at
all — it has no such switch — so nothing regresses against what this card replaces.

## Documentation and versioning

- README: the `type` key is now required, and the new element is documented.
- CHANGELOG, under `unreleased`: a `Changed` entry for the required `type`, and an
  `Added` entry for the element.
- `package.json` stays on the last shipped version until the bump is decided.

## Rejected alternatives

- **Delegating to `hui-state-icon-element` via `createHuiElement`.** Rendering,
  gestures and actions would all come free, but that element knows neither `color`
  nor `show_entity_picture`, so two of the four content fields would be wired to
  nothing.
- **`ha-state-icon` plus home-made colouring and actions.** More control over the
  markup, and every colour rule rewritten is a rule that will silently drift from
  Home Assistant's.
- **`vw` instead of `cqw`.** This is the problem, not a solution: it follows the
  window, so every card in a sections view gets the same icon size.
- **`size` at item level, applied by the card to the wrapper.** Pools the
  machinery for a future element kind, but gives the card an appearance
  responsibility that belongs to the element.
- **Ignoring or purging an item with no `type`.** `storedConfig` would make the
  drop permanent on the first drag.
- **Singular family prefixes in the add menu.** Two more strings of ours, for
  punctuation.
- **A collapsible "Positioning" section.** It would restyle the shipped badge
  form for consistency alone.
- **`min = max` as the fixed-size idiom (earlier design).** Dropped in favour of
  an explicit `fixed` mode with a dedicated `value` field: the idiom was
  non-obvious, required two coordinated edits, and did not communicate its
  intent. An explicit mode also produces a simpler CSS output (`48px` vs
  `clamp(48px, …, 48px)`) and needs no container unit at all.
