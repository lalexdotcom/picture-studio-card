# Changelog

## unreleased

### Added

- A second kind of item: `type: element` with `config.type: state-icon`. An icon
  that reflects an entity's state, with the entity badge's own controls — icon,
  colour, name as a tooltip, entity picture — and tap, hold and double-tap
  actions. Three sizing modes: **auto** (card defaults, `clamp(24px, 8cqw,
  48px)`), **adaptive** (`clamp(<min>px, <ratio>cqw, <max>px)` from the item's
  own numbers — scales with the card's column width), and **fixed** (`<value>px`
  — no container unit, for layouts where the icon must hold a precise size).

### Changed

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
