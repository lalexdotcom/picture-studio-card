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

**Percentages are no longer clamped to `[0, 100]`.** Neither `toPercent` nor
`parsePercent` bounds its result; both accept any finite number and keep
today's rounding to two decimals, and an unparseable value still falls back to
the default. This is what makes an overflowing position expressible, and it is
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
knows pixels, so the recomputation lives there and reuses the channel that
already exists, `activeEditor()?.patchPosition`.

The card records the anchor each wrapper was last rendered with. In
`_applyPositions`, when that recorded anchor differs from the config's and the
card is in editing mode, it:

1. measures `.layer` and the wrapper (size only — anchor-independent);
2. computes the new position with `reanchor`;
3. stores the new anchor as the rendered one **before** committing;
4. renders the recomputed position immediately, then calls `patchPosition`.

The `setConfig` round trip that comes back finds the anchors equal and does
nothing. Step 3 is what guarantees termination even if the arithmetic is wrong.

The recorded-anchor array is reinitialised from the config whenever
`_syncBadges` rebuilds the wrappers, so adding, removing or reordering an item
never triggers a recomputation.

Because percentages are unbounded, the recomputation is exact in every case,
including an item that already overflows: at `left: 100%` under `top-left` on a
400 px image with a 100 px item, switching to `center` writes `112.5%` and the
item does not move.

## Editor

A standalone `src/editor/anchor-picker.ts`: a 3×3 grid of clickable cells for
the fixed anchors, plus a switch for `proportional` that visually disables the
grid. It emits `anchor-changed` with the value and knows nothing about the
config or Home Assistant.

The intent is to look like Lovelace's own controls. It cannot literally reuse
them: `ha-control-select`, the segmented control that would have been the
closest match, appears in a single lazy chunk of the shipped frontend, so the
card cannot rely on it being defined — verified in the container's bundle for
2026.8.1. The grid is therefore hand-built but dressed in HA's tokens
(`--ha-space-*`, `--divider-color`, `--primary-color`), and the switch uses
`ha-formfield` + `ha-switch`, both of which are broadly present. Visual
alignment with Lovelace is expected to need a pass after delivery.

`badge-form.ts` renders the picker above the badge's own native form — the
anchor belongs to our wrapper, not to the badge, so it cannot go into the
badge's form. The event reaches the hub, which gains `patchAnchor(index, anchor)`
modelled on `patchPosition`.

Two new strings in `src/strings.ts`, en and fr: the field label and the switch
label. The nine anchors need none, which is the point of a grid.

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
- `drag`: a pointerup under a fixed anchor commits the expected percentage; a
  gesture started outside the image commits the overflow it ended on.

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
