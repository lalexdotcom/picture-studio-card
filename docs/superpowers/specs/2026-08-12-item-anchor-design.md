# Configurable item anchor — design

Status: approved 2026-08-12. Amends `2026-08-11-picture-badges-design.md`.

## Problem

An item's position is stored as two percentages and rendered as
`top: T%; left: L%; transform: translate(-L%, -T%)`. The translate is derived
from the position itself — *proportional anchoring*. It has one very good
property, which is why it was chosen: the item's real offset works out to
`L/100 × (containerW − elemW)`, so `0` is flush top-left, `100` is flush
bottom-right, and overflow is structurally impossible.

It is also the only behaviour available. A user who wants `left: 50%` to mean
"the item's centre sits at the middle of the image" — the picture-elements
idiom — cannot express it. This design makes the anchor a per-item choice while
keeping the current behaviour as the default.

## Config

A new optional `anchor` key on the item, sibling of `position`, not nested in
it: `position` is a pair of percentages and stays that way, and folding an
enumeration into it would force `normalizePosition` and `storedPosition` to
carry a value that is not a percentage.

```yaml
items:
  - type: badge
    position: { top: 30%, left: 45% }
    anchor: center            # absent => proportional
    config: { ... }
```

Ten values. The fixed nine are named in two parts systematically, so no anchor
name can be misread as one of `position`'s own `top` / `left` keys — which is
why the CSS `transform-origin` shorthands (`top`, `left`, `right` alone) were
rejected.

| `anchor` | `translate(x, y)` |
| --- | --- |
| `proportional` *(default)* | `-L%, -T%` |
| `top-left` | `0, 0` |
| `top-center` | `-50%, 0` |
| `top-right` | `-100%, 0` |
| `center-left` | `0, -50%` |
| `center` | `-50%, -50%` |
| `center-right` | `-100%, -50%` |
| `bottom-left` | `0, -100%` |
| `bottom-center` | `-50%, -100%` |
| `bottom-right` | `-100%, -100%` |

In memory, `PictureItem.anchor` is always set: `normalizeConfig` maps both an
absent and an unrecognised value to `proportional`. On the way out,
`storedConfig` **omits** the key when it equals `proportional`. The round trip
is stable and an existing config comes back byte-identical — no
`anchor: proportional` gets sown into users' YAML on the first drag.

## Geometry

With `a` the anchor's component on the axis (0, 50 or 100), `C` the container
size and `E` the element size:

```
fixed anchor    px = C·L/100 − E·a/100        L = 100·(px + E·a/100) / C
proportional    px = (C − E)·L/100            L = 100·px / (C − E)
```

Additions to `src/position.ts`:

| Symbol | Role |
| --- | --- |
| `Anchor`, `ANCHOR_OFFSETS`, `parseAnchor` | the vocabulary above, as a type and a table |
| `axisOffset(anchor, axis)` | a `number` for a fixed anchor, `null` for `proportional` |
| `toPx(percent, C, E, offset)` | new — the forward map, until now implicit in the CSS |
| `toPercent(px, C, E, offset)` | the inverse, one parameter wider |
| `reanchor(position, from, to, container, element)` | `toPercent(toPx(…, from), …, to)`, per axis |
| `positionStyle(position, anchor)` | one parameter wider |
| `AxisBounds`, `OPEN_BOUNDS`, `tighten`, `advance` | the ratcheting drag bounds, below |

`span` is unchanged. `clampPx` is replaced by `advance` and goes away.

**Percentages are no longer clamped to `[0, 100]`.** That means all three of
`parsePercent` (read), `toPercent` (derive) and `percentString` (write) — a
bound left in any one of them puts the item back. They accept any finite number
and keep today's rounding to two decimals, and an unparseable value still falls
back to the default. `clampPercent` then has no caller and goes away. This is what makes an overflowing position expressible, and it is
required by the drag rule below: an item must stay where the user dropped it.

Two consequences worth stating. First, `reanchor` now preserves pixels exactly,
in every case — there is no representability limit. Second, `proportional`
keeps its property only in the form that matters, "within `0-100`, overflow is
impossible".

That second point is a behaviour change for configs that use no anchor at all,
and it is accepted: a hand-typed `left: 150%` or `left: -10%` used to be pulled
back to `100%` or `0%` and now overflows. Silently rewriting what someone typed
was never the better answer, and it is the same reasoning that made us
serialise percent strings back rather than normalise them away.

Degenerate inputs keep today's answers: `C − E = 0` under `proportional`
returns `0`, and `C = 0` returns `0`.

Under a fixed anchor the drag no longer reaches the whole `0-100` range: a
100 px item on a 400 px image anchored `top-left` tops out at `left: 75%`, since
that is where it sits flush against the right edge.

## Drag

`src/card/drag-layer.ts` gains one injected callback, `getAnchor(index)`, in the
same style as `getSurface` and `getIndexedWrapper`. The controller still knows
nothing about Home Assistant.

On pointerdown the pixels are read off the DOM rect, which is
anchor-independent, and the element is switched to `transform: none` exactly as
before. On pointerup, `toPercent` and `positionStyle` both take the item's
anchor.

### Ratcheting bounds

A fixed anchor makes an out-of-bounds starting position reachable, and the flat
`clampPx` handles it badly: pointerdown records the real pixels, then the first
pointermove snaps the item inside, so the point the user grabbed is no longer
under the cursor for the rest of the gesture.

The bounds are per axis and they only ever shrink toward `[0, span]`. They are
computed **live, in pointermove, never at pointerdown**: they start open, and
each move first tightens them around the element's *current* position, then
clamps the position the pointer is asking for.

```
pointerdown   lo = −∞                     hi = +∞
pointermove   lo = max(lo, min(0, cur))   hi = min(hi, max(span, cur))
              px = clamp(raw, lo, hi)
```

Tightening from `cur` rather than from `raw` is what makes the ceiling stick to
where the item *is* instead of where the pointer went. On the first move `cur`
is `px₀`, so an item sitting at `px = 120` on a span of 100 is immediately
bounded to `[0, 120]`: it can travel all the way to 0, never past 120, and every
step leftward lowers the ceiling. Once back inside, `hi` is `span` and it cannot
leave again. A drag can thus neither create an overflow nor worsen one — while
an item that was already overflowing follows the cursor faithfully and is
committed where it was dropped, overflow included.

In the ordinary case `px₀` is already within `[0, span]`, the bounds are
`[0, span]` from the first frame, and the behaviour is exactly today's. A press
with no movement computes no bounds at all.

`tighten` and `advance` are pure and live in `position.ts`; `drag-layer.ts` only
holds the two `AxisBounds` in its state, seeded from `OPEN_BOUNDS`.

## Switching an item's anchor

Changing the anchor must leave the item where it is on screen. Only the card
knows pixels, so it does the arithmetic — but it has to be **asked before the
editor writes**, and the answer has to travel back in the same commit as the
anchor.

> This section replaces an earlier design that had the card notice the change
> after the fact, by diffing the anchor it last rendered against the config's.
> That design cannot work, and the reason is worth keeping: **Home Assistant
> rebuilds the card element on every config change.** `hui-card` calls
> `createCardElement`, not `setConfig`, so the instance that rendered the
> previous anchor is gone by the time the new one arrives, and any state it kept
> went with it. The diff compared `undefined` to the new anchor on every item,
> every time, and never fired.

The exchange, in order:

1. The picker's `anchor-changed` reaches the editor, which calls `patchAnchor`.
2. `patchAnchor` asks the live preview through the broker's card registry:
   `activeCard()?.reanchor(index, anchor)`. Nothing has been committed yet, so
   the card is still the one that rendered the current anchor.
3. The card measures `.layer` and the wrapper — size only, which is
   anchor-independent — and returns `reanchor(...)`, or `undefined` if it cannot
   measure.
4. The editor writes anchor and position together, in **one** commit, through
   `setAnchor`. Two commits would render the new anchor against the old
   coordinates for a frame, which is the jump this whole exchange exists to
   avoid.

Nothing has to converge and nothing is remembered across a commit, so the
termination question the earlier design carried does not arise. The same goes
for its reorder guard: the editor knows exactly which item the user changed.

When the card cannot answer, the coordinates stay as they are and the item
moves. That is the honest degradation — better than writing a position derived
from a measurement we do not have.

Because percentages are unbounded, the recomputation is exact in every case,
including an item that already overflows: at `left: 100%` under `top-left` on a
400 px image with a 100 px item, switching to `center` writes `112.5%` and the
item does not move.

### Which card is the preview

The registry needs to hold exactly one card, and the obvious reading of "the
card being edited" is wrong: `preview` on a card does **not** mean "I am the
dialog's preview". Home Assistant sets it on every card of a dashboard in edit
mode — `card.preview = lovelace.editMode` — so that a click edits the card
instead of firing its actions. Reading it as "the dialog" put two cards in the
registry and left the editor unable to choose between them.

What separates them is the **edit chrome a dashboard wraps its cards in**, and
which the dialog's preview does not have above it: `hui-card-options` in a
masonry view, `hui-card-edit-mode` in a section. The card walks up, hopping
shadow boundaries, and excludes itself if it finds either.

> A test on the `preview` **attribute** was tried first and must not come back.
> It reads better — the dialog writes `<hui-card preview>` literally while a
> dashboard assigns the property — and it works in a masonry view, where
> `hui-card` declares `preview` with no `reflect` so the attribute only exists
> where it was written. It then fails **silently in sections**: `hui-section` is
> the one component in the frontend that declares `preview` with `reflect:
> true`, so the attribute is written there whoever set it, and every dashboard
> card in a section passes. Verified on 2026.8.1, and observed failing in the
> browser after passing in masonry.

The **card-picker gallery** needs no special case either way: it puts the card
element straight into a `div.preview`, with none of these wrappers, and no
editor is mounted while it is open. The **add-card dialog** renders its preview
without the edit chrome, like the edit dialog, so the feature works in the flow
where a card is first configured.

This also fixes a defect that predates the feature: the drag used to be armed on
every picture-studio card behind an open dialog, and a drag there would have
written into the dialog's config. The dialog covered them, so it was never
reachable — but it was the same wrong reading of `preview`.

If Home Assistant ever renames one of those wrappers, that layout's dashboard
cards re-enter the registry and anchor changes stop recomputing there — the same
symptom this section exists to fix, which is why the wrapper names are worth
re-checking whenever the card is tried against a new Home Assistant.

## Editor

A standalone `src/editor/anchor-picker.ts`: a 3×3 grid of clickable cells for
the fixed anchors, and a switch for `proportional`, which has no place on the
grid because it is not a point. It emits `anchor-changed` with the value and
knows nothing about the config or Home Assistant.

The cells stay live while `proportional` is on, with none of them marked:
clicking one is how you leave that mode, so disabling them would make the switch
the only way out of a state the grid is there to replace.

The intent is to look like Lovelace's own controls. It cannot literally reuse
them: `ha-control-select`, the segmented control that would have been the
closest match, appears in a single lazy chunk of the shipped frontend, so the
card cannot rely on it being defined — verified in the container's bundle for
2026.8.1. The grid is therefore hand-built but dressed in HA's tokens
(`--ha-space-*`, `--divider-color`, `--primary-color`), and the switch uses
`ha-formfield` + `ha-switch`, both of which are broadly present. Visual
alignment with Lovelace is expected to need a pass after delivery.

`badge-form.ts` renders the picker below the badge's own native form — the
anchor belongs to our wrapper, not to the badge, so it cannot go inside a form
whose config we treat as opaque. The event reaches the hub, which gains
`patchAnchor(index, anchor)`; see "Switching an item's anchor" for what it does
before it writes.

Three new strings in `src/strings.ts`, en and fr: the section title
("Positioning") and the two side labels ("Proportional", "Anchored"). The nine
anchors need none, which is the point of a grid.

The section sits below the badge's form as a row of two halves, each `flex: 1`,
split by a vertical rule. Both halves put their control in an `ha-formfield`,
including the grid: it is the only way the two labels are styled and spaced
identically by construction rather than by copying values out of HA's CSS —
their rule spaces `::slotted(ha-switch)` alone, so the grid claims the same
`margin-inline-end` itself. The section title matches the label Home Assistant
puts above a form field: primary text colour, `--ha-font-size-m`, normal weight.

## Tests

Unit tests, pure, mirroring the source tree as the rest do.

- `position`: the offset table; `positionStyle` for each of the ten values; the
  `toPx` / `toPercent` round trip per anchor, including out-of-range
  percentages; `reanchor` preserving pixels, overflowing item included;
  `C − E = 0` and `C = 0`.
- `position`, bounds: `tighten` closing open bounds onto `[0, span]` for a
  position inside, and widening only on the overflowing side; `advance`
  ratcheting the ceiling down over a sequence of moves, latching at `span`, and
  refusing to widen again; an ordinary drag behaving as a flat `[0, span]`
  clamp from the first move.
- `config`: an absent anchor and an unrecognised one both normalise to
  `proportional`; `parsePercent` keeping a value outside `0-100`;
  `storedConfig` omits the key at the default and writes it otherwise; the full
  round trip leaves an existing config unchanged.
- `badge-items`: `setAnchor` writing anchor and position together, keeping the
  coordinates when the caller had none to give, leaving other items alone, not
  mutating its input, and ignoring an index that is not there.
- `broker`: the card registry resolves a single card, refuses to guess between
  several, releases once, and is independent of the editor registry.
There is no DOM environment — `rstest` runs on node and `drag-layer` is covered
only through the pure functions it delegates to, as `hasMoved` already is. So
"a pointerup under a fixed anchor commits the right percentage" is tested as
`toPercent` with that anchor's offset, and "a gesture that started outside
commits the overflow it ended on" as a sequence of `advance` calls. Wiring the
controller to those functions is left to review and to the browser pass.

## Docs

The `anchor` key in the README, with the two sentences that matter:
`proportional` is the only mode in which a position within `0-100` cannot
overflow, and a drag never creates an overflow — only a hand-written position
or a switch of anchor does.

## Out of scope

- A free `anchor: { x, y }` pair. The named set was chosen over it; nothing here
  forecloses adding one later, since `axisOffset` already returns a number.
- A card-level default with per-item override.
- Exposing the anchor anywhere other than the badge form.

Deliberately deferred until the picker has been seen and tuned in a browser,
since both only make sense next to it:

- A **reset** button, putting the item back to `50 / 50 / proportional` — the
  way out for an item dragged so far past the edge that it is hard to grab
  again.
- A **read-out of `top` / `left`** in the badge form. Read-only first; whether
  it becomes editable is a separate decision, because an editable field is the
  one place a user can type the out-of-range values this design now preserves.
