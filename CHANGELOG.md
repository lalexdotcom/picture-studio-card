# Changelog

## unreleased

### Added

- The card header can now carry an **icon** and **badges** beside its title,
  using Home Assistant's own heading badges — the same ones the Heading card
  offers, with their own visibility conditions.
- Every setting is now reachable from the editor. `entity`, `image_entity`,
  `state_image`, `aspect_ratio` and `filter` were YAML-only and are not any more.

### Changed

- The editor is now five collapsible sections — Background, Items, Heading,
  Filters and Entity — instead of one panel and a list. The item list carries
  its count and no longer grows without limit.
- The camera entity and the image entity are now **one field**: they were always
  mutually exclusive on screen, and choosing one clears the other.
- `title` moves into `heading.title`. **Existing configs keep working** — an
  existing `title` appears in the Heading section immediately, and is written to
  its new place the first time you save any change.
- The header's title is smaller than it was.

## 1.4.0 — 2026-08-19

### Added

- **A new element kind, State label**: an entity's text placed on the picture.
  Show its name, its state, or both, compose what the state says the same way a
  badge does, pick a colour, and size it from the card's width like every other
  item. It can stand on the same surface an icon can, with a pill or rounded
  corners and a padding of your own.
- **Each item kind now has its own glyph** in the editor's item list and add
  menu: a sun for a state icon, a text card for a state label, and distinct
  label shapes for the core and custom badge families.
- The item list flags a badge whose type this Home Assistant does not have — a
  typo, or a custom badge whose resource never loaded.
- An item the card cannot read now gets a row of its own in the item list,
  marked with the reason, so it can be deleted without editing the YAML.

### Changed

- **A label now says what it shows in one place.** `show: [state, name]` replaces
  the two separate switches, and a label that says nothing shows its state. An
  empty list draws nothing at all — the editor marks those so you can still find
  them.
- **`anchor` moved inside `position`**, where the coordinates it qualifies live.
  Dashboards written before this release keep working, and are rewritten the
  first time you move an item.
- **The halo around an icon** — the light rim and soft shadow that keep it
  readable on a photograph — is no longer drawn automatically. It is now a
  **Stand out** checkbox at the top of the new **Appearance** section, off by
  default, so icons placed before this release lose it until you tick the box.
- **The Chrome section is now Appearance**, and it comes after **Size and
  position** rather than before it.
- **The panel you get when editing an item now shows the item's name** — "State
  icon", "Entity badge" — instead of its technical type. The add menu and the
  item list agree on the same name: a Shortcut badge shows the **Text** you
  gave it, and a custom badge shows the name its library registered rather
  than the raw `custom:…` tag.
- **The add menu lists the elements before the badges.**
- **The Add button sits on the Items line**, to the right of the title, instead
  of below the list — so it stays in the same place however many items you have.
- **Opening an item now shows you the top of its form.** It used to inherit
  wherever you had scrolled to before, which could open a form halfway down
  itself.
- **The item list now reads top-down.** The first row is the item drawn on top
  of the picture, and a new item lands at the top of the list — which is how a
  layer list reads everywhere else. Your YAML is unchanged: `items` still stores
  the item on top last, and the list is simply the mirror of it. The note under
  the list says so.
- **Items react to the mouse again, and they react to it differently.** An item
  standing on a surface tints that surface with its own colour while the pointer
  is over it — the shading Home Assistant gives a badge, and deeper while you
  hold the button down. An item with no surface grows slightly instead, as it
  did before, because a shading laid over a photograph cannot be seen. Only
  items you can click react, and nothing reacts while you are editing the card.
- A single unreadable item no longer replaces the whole card with an error. The
  card skips it and draws everything else; the entry stays in your YAML exactly
  as you wrote it.
- A `visibility:` written as something other than a list is ignored instead of
  breaking the card. The item always shows, and its Visibility section explains
  what happened and offers to clear them.

## 1.3.1 — 2026-08-17

### Changed

- **The halo behind an icon is softer, and its width follows the icon's size.**
  The dark glow that lifts an icon off the picture under it was drawing a hard
  ring rather than a shadow on a light picture — most visibly behind a chrome,
  where it traces the whole disc instead of the strokes of a glyph, and on a
  small icon, where a fixed width is a large share of the icon. It is now
  fainter, and its width is a share of the icon's size, so a small icon wears a
  small halo and a large one keeps the halo it had. The thin white rim above it
  is unchanged, since that is what carries a dark icon on a dark picture.
  Nothing to configure, and a dashboard that sets `--psc-icon-glow` itself still
  wins.

### Fixed

- **A badge in the card lost its outline in a panel view.** The same badge kept
  it in a sections view, and keeps it in the view's own badge row. A panel view
  strips the border, the rounding and the shadow of the card that fills it, and
  that instruction was reaching the badges the card holds. They now look the
  same wherever the card is placed, and the card itself still fills a panel view
  edge to edge.

## 1.3.0 — 2026-08-14

### Added

- **Per-item visibility.** Every item now takes a `visibility` list — Home
  Assistant's own conditions, the same ones a card or a badge takes: entity
  state, numeric state, screen size, time, user, zone, and `and` / `or` / `not`.
  An item whose conditions are not met is not drawn. The editor shows a
  "Visibility" section on each item, with Home Assistant's own condition editor
  and its live "current visibility" banner inside it, and items carrying
  conditions are marked in the preview.
- **A chrome behind an icon.** A `state-icon` element can now stand on its own
  surface — a disc by default, or any rounded shape — so an icon placed on a
  busy photograph reads against something instead of against the picture. The
  surface follows your theme, or can be forced light or dark for a picture that
  disagrees with it, and its radius, opacity and the share of the box the icon
  takes are all settings. It is off unless you turn it on, so nothing in an
  existing dashboard changes.

### Changed

- **The item list in the editor has been redesigned** to match Home Assistant's
  own entity lists. Each item now shows an icon for its kind, its name over its
  area and device rather than over its entity id, and the section is titled
  "Items" instead of "Badges" — it has held two families since 1.2.0. The same
  items, said differently.

## 1.2.0 — 2026-08-14

### Added

- A second kind of item: `type: element` with `config.type: state-icon`. An icon
  that reflects an entity's state, with the entity badge's own controls — icon,
  colour, name as a tooltip, entity picture — and tap, hold and double-tap
  actions. Three sizing modes: **auto** (card defaults, `clamp(24px, 8cqw,
  48px)`), **adaptive** (`clamp(<min>px, <ratio>cqw, <max>px)` from the item's
  own numbers — scales with the card's column width), and **fixed** (`<value>px`
  — no container unit, for layouts where the icon must hold a precise size).

### Changed

- **The minimum Home Assistant version is now 2026.6.0**, up from 2026.5.0. The
  editor's size control uses a radio group Home Assistant only ships from that
  version; below it the control still works, laid out as a list, but the card is
  no longer tested there.
- **`anchor: proportional` is now `anchor: auto`.** The nine fixed anchors are
  unchanged. Configs written with `proportional` are still read and normalise to
  `auto`; nothing needs to be updated by hand.
- **The badge editor's positioning control now lives in a collapsible
  "Position" section**, instead of sitting bare under the badge's own form. It
  is the same control, one click away, and it matches the "Size and position"
  section an icon item carries — so the two kinds of item read alike.
- `type` is now **required** on every item in `items[]`. It used to default to
  `badge` when omitted; with a second family that default is ambiguous. A config
  written by the editor already carries it, so only hand-written YAML is
  affected, and it now fails with a message naming the accepted values rather
  than being silently read as a badge.

## 1.1.0 — 2026-08-13

### Added

- **Per-badge anchoring.** A new `anchor` option decides what a badge's `top`
  and `left` percentages are anchored to. `proportional` — the previous and
  still default behaviour — makes the anchor follow the coordinate: `0` sits
  flush against the top-left corner, `50` centres the badge, `100` sits flush
  against the bottom-right. The nine fixed values (`top-left`, `top-center`,
  `top-right`, `center-left`, `center`, `center-right`, `bottom-left`,
  `bottom-center`, `bottom-right`) pin it instead, so `left: 50%` with
  `anchor: center` puts the badge's own centre at the middle of the image.
- **A Positioning control in the badge editor**, below the badge's own form: a
  switch for proportional and a 3×3 grid for the fixed anchors. Changing a
  badge's anchor does not move it — its coordinates are recomputed so the badge
  stays exactly where you put it.

### Changed

- **Coordinates outside `0-100` are kept as written.** They used to be pulled
  back to `0` or `100` when the card read them. Under a fixed anchor they are
  the way to place a badge deliberately over the edge, so they are now
  preserved — including for configurations that use no anchor at all.
- **Dragging never pushes a badge off the image, and never further off.** A
  badge already hanging over an edge can be dragged back in but not further
  out, and once fully inside it stays inside. Only a hand-written coordinate or
  a change of anchor puts a badge over the edge.
- **Badges are no longer reconfigured on every state update.** The card used to
  hand each badge its configuration again every time any entity in Home
  Assistant changed state, which is something Home Assistant itself never does —
  it rebuilds a card when its configuration changes. Badges still receive every
  state update; they are simply no longer told their configuration has changed
  when it has not. A third-party badge that misbehaved under that treatment
  should now behave.

## 1.0.0 — 2026-08-12

Initial release: an image with Lovelace badges placed on it, positioned by
dragging them on the live preview inside the card editor.
