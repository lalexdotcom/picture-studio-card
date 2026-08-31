# side resize handles — design

Date: 2026-08-28 · Target release: 1.6.0 (pre-release line `next`)

## Goal

Give the selected image element **four more handles, at the midpoints of its
edges**, each resizing one axis freely.

This is an amendment to `2026-08-26-image-resize-handles-design.md`, which
refused side handles on their merits. It is written as its own spec, on decision
14's precedent — that spec amended the image spec's decision 13 from inside its
own numbering rather than editing a published document.

**Independent of the toolbar in both directions.** Neither needs the other; the
`Tool` boundary and the resize/distort picker are untouched by everything below.

## Decisions

### 1. AMENDMENT to resize decision 1 — the sides are the free channel

Resize decision 1 rejected side handles, and its reason was:

> **The sides are the handles that fight the model.** `height` absent *is*
> keep-ratio, so a north or south handle has nothing to write while the ratio is
> kept — it can only break it.

**"Can only break it" is the definition of the free gesture.** The alleged defect
is the function being looked for. The observation was correct and its conclusion
inverted: at the time the only channel for breaking the ratio was SHIFT on a
corner, so a handle that could do nothing else read as a handle with nothing to
do.

The rule, with no mode and no modifier:

- **corners** — proportional, `width` alone in keep-ratio. Unchanged, shipped.
- **sides** — free, one axis each.

Decision 1's second and third reasons are untouched: the toolbar still earns its
own existence from the distortion, and the corners are still where the hand
expects a proportional resize. Nothing here is a return to the arrangement that
decision weighed, where the sides *replaced* the corners to save a toolbar.

### 2. The vocabulary: `Corner` becomes `Grip`

Eight handles, so the type that names one is no longer a corner. `Corner` becomes
`Grip` over the eight values, `ResizeHit.corner` becomes `grip`, the DOM's
`data-corner` becomes `data-grip`. The class stays `handle-<grip>`.

Renamed rather than widened with a second type beside it: the hit test, the
state, the CSS and the tests all name the same thing, and two names for it is the
shape that eventually disagrees.

### 3. An axis becomes tri-state, and that is the whole mechanism

`cornerGrabs` answers `{ x: boolean, y: boolean }` — *is the grabbed edge this
axis' trailing edge*. It becomes `gripAxes`, answering `boolean | undefined` per
axis, where **`undefined` is an inert axis**: one that asks for nothing, ratchets
nothing, bounds nothing, and whose size and leading edge stay at their
`pointerdown` values for the whole gesture.

**Nothing else in the arithmetic changes.** `fixedPoint`, `edgeSlopes`,
`sizeRange`, `requestedSize` and `edgeAt` are already written one axis at a time
— that is what resize decision 4 bought when it made the default mode and the
ALT mode one affine family. A side handle is not a new gesture; it is the same
gesture with one axis switched off.

The tri-state is a `boolean | undefined` rather than a fourth `Corner`-like enum
because the two questions are different: *does this axis participate*, and *which
of its edges is grabbed*. Folding them into one value would make the second
meaningless in a state where it is not asked.

### 4. A side is free by construction, so SHIFT has nothing to free

`free = isSide || (shift && !forced)`.

SHIFT is therefore **inert on a side handle**, with no clause of its own — the
disjunction already swallows it. This is deliberate and was chosen over two
alternatives:

- **SHIFT locks the ratio on a side** was refused because it makes a side
  handle equivalent to a corner, and reintroduces the implicit `height` that
  resize decision 2 exists to prevent;
- **SHIFT resizes symmetrically from the edge's midpoint** was refused because
  ALT already holds the "grow from a fixed interior point" role, generalised to
  the nine anchors.

**ALT is unchanged** and needs no new code: it holds the anchor's fraction on the
active axis, which is what `fractionOf` already computes per axis.

`lockedScale` engages only when both axes are active, so it is never reached from
a side handle — no test guards it, the structure does.

### 5. A side drag takes the item out of keep-ratio, and that is the feature

`free` ⇒ a `height` is committed, by resize decision 7's second branch, which
needs no amendment. Said plainly because a user meets it immediately: **dragging
a side is how an image stops being proportional.** The picture then fills the box
and stretches, which decision 5 of the resize spec already made the CHANGELOG say
about SHIFT.

**An E/W handle freezes the current pixel height at `pointerdown`**, writing it
onto the wrapper the way a stored height is written. Without it the height would
follow the width through the image's own ratio and an E/W drag would be
indistinguishable from a corner — which is the one way a side handle could be a
lie.

### 6. An inert axis commits verbatim what it had

Not a pixel round-trip. The stored `width` (or `height`, or the coordinate of
`position0`) is recommitted as the same number.

Two reasons, and the second is the load-bearing one:

- `percentOfContainer` rounds through hundredths, so a number that made a round
  trip through pixels can land a hundredth away from the one stored. It would
  make `boxChanged` and `moved` answer yes to a gesture that moved nothing on
  that axis, and commit a config change the user did not make.
- It makes the guarantee structural rather than arithmetical: **a N/S gesture
  cannot move the item horizontally**, because no horizontal number is
  recomputed.

**One exception, and it is not one:** an E/W handle on an item with no stored
`height` has nothing verbatim to recommit, so it commits the measured pixel
height — that measurement *is* the freeze of decision 5.

### 7. The floor stays at 24 px, and its stated reason survives verbatim

`RESIZE_FLOOR_PX` is 24, justified as "roughly twice the handle's own size,
below which the four handles overlap and there is nothing left to grab". A third
handle per axis looks like it should raise it, and it does not.

**Because a handle is centred *on* its edge rather than inset.** The CSS offsets
every corner by `-size/2`, so on a box of width `W` with a 10 px handle the two
corner handles occupy `[-5, 5]` and `[W-5, W+5]`, and a midpoint handle occupies
`[W/2-5, W/2+5]`. They stay clear as long as `W/2 - s/2 ≥ s/2`, i.e. **`W ≥ 2s`
— the same bound the corners alone already imposed**, and 24 clears it with 2 px
of gap on each side.

Written down because the opposite is the intuitive answer and the arithmetic is
the only thing that settles it. What changes is the comment, which can now say
three handles per axis instead of four in total; the number does not.

The looseness between the constant and `--psc-handle-size` is left as it is: the
CSS variable can be overridden and the floor cannot follow it, which was already
true of the corner-only floor and is not made worse here.

### 8. Hidden, not disabled, under `ratioIsForced`

A live camera (`ratioIsForced`, `src/image-box.ts`) shows the four corners only.

SHIFT is already inert there — resize decision 8 — so a side handle would be a
control that cannot act. **A visible handle that cannot act is a claim the item
does not honour**, which is the same argument the form's disabled-and-explained
keep-ratio checkbox settles the other way: there, a warning has room to say why;
on a picture, four extra squares have nowhere to put an explanation.

The tool's `render` already reconciles from fresh config on every change, so
switching `camera_view` to Live removes the side handles with no code of its own.

### 9. Crowding is still deferred

Eight handles on a small item crowd it. Handles that adapt their arrangement to
the item's size were deferred by the amendment memo and stay deferred: the floor
of decision 7 keeps them grabbable, which is the correctness question, and the
rest is comfort.

### 10. A gesture that ends where it began commits nothing — keep-ratio included

Resize decision 7 already says *"no commit when nothing changed"*, and its test
is `box.width !== storedWidth || box.height !== storedHeight`. **A side handle
breaks it**, in the direction that costs the most: releasing an E/W handle back
at its starting point produces the frozen height of decision 5, `storedHeight` is
absent, and a number is not `undefined` — so the gesture commits, and an image
the user did nothing to leaves keep-ratio.

The test compares to the wrong thing. It should ask *has the box changed since
`pointerdown`*, and the config is only one of the two ways to answer that:

```
height₀ = storedHeight ?? percentOfContainer(y.size0, surface.height)
changed = width !== storedWidth || (height !== undefined && height !== height₀)
```

**The stored number where there is one, the measured pixel size where there is
not.** Both are the box as it stood when the pointer went down, expressed in the
units it will be stored in — which is what decision 7's own sentence asks for
and what its implementation approximated while an absent height could only mean
an unchanged one.

Unreachable with a mouse in practice, and worth the line anyway: it is the
difference between a gesture that can be abandoned and one that always charges
for having been started. It also fixes the same case on a corner — grab, hold
SHIFT, wander, come back, release: nothing moved, so nothing is written, and the
item stays the kind of thing it was.

**A height still absent from the candidate is never a change.** The only path
that drops a height an item had is the forced ratio, which commits
`storedHeight × scale` on its own branch and does not reach this test.

## The gesture, in order

Unchanged from the resize spec except where an axis is inert. At `pointerdown`,
in addition to what is already measured: the grip's per-axis participation, and —
for an E/W grip — the pixel height written onto the wrapper so it stops following
the width.

At `pointermove`, an inert axis is skipped entirely: no `requestedSize`, no
`ratchet`, no `sizeBounds`, no write. Its `size` and `lead` are the ones taken at
`pointerdown`, so the code that positions the box needs no branch of its own.

At `pointerup`, decision 6 replaces the inert axis' computed numbers with the
stored ones before the change tests run.

## Testing and verification

happy-dom carries the arithmetic, as before. **Every new test is run against the
current code and seen to fail** — the rule `9ef9a44` and `5c99960` each left
behind, and a gesture built out of precedences is exactly where a test that
cannot vary hides.

What must discriminate:

- **a N/S drag writes `height` and leaves `width` and `left` byte-identical** —
  the only observation that separates decision 6 from a pixel round-trip that
  happens to agree;
- **an E/W drag on an item with no stored `height`** — the height on screen must
  not change while the width does, which is decision 5's freeze and the one way
  a side handle could silently be a corner;
- **SHIFT held through a side gesture changes nothing**, against a corner
  gesture in the same fixture where it changes everything;
- **ALT on a side handle grows from the anchor on the active axis only**, with a
  non-centred anchor, or the ALT path and the default path agree;
- **the floor**, met on the active axis, and *not* met on the inert one — an
  inert axis below the floor must survive the gesture untouched rather than be
  pushed up to it;
- **`ratioIsForced` renders four handles, not eight;**
- **an E/W gesture released back at its starting point on a keep-ratio image
  commits nothing at all** — decision 10, and the assertion is the absence of a
  `patchBox` call, not a `height` equal to the old one.

The browser lane takes the one question happy-dom cannot answer: that an E/W
drag on a keep-ratio image leaves the drawn height where it was — happy-dom has
no layout, so the frozen height is the stub's number rather than the image's.

**Then a verification in real Home Assistant**, with the traps already paid for
once: bump `?v=N` in `.ha/config/.storage/lovelace_resources` and restart the
container, never `rm -rf dist`.

**The baseline.** Last measured 2026-08-28 on `next`: 56 files, 1071 tests. The
delivery's full run updates it, with its date, in `mem:picture-studio/1.6.0-handoff`.

## Out of scope

- **The distortion**, sub-project 4, and the `ResizeObserver` its `matrix3d`
  needs.
- **A keyboard path** — follow-up 9, still the gate on removing the form's box
  fields.
- **Handles on icons and labels** — resize decision 15 stands.
- **Arrangement that adapts to a small item** — decision 9.
- **A ratio padlock in the toolbar.** Killed by the amendment memo and not
  revived: a toggle engraves a decision for the next gesture where a modifier
  decides during it and forgets.

## Versioning

`1.6.0`, on the `next` line. No bump unless asked. The `CHANGELOG` entry goes
under `Added` in `## 1.6.0 — unreleased`, and says what a user does: drag the
middle of an edge to size one dimension on its own, which is also what takes the
picture out of its proportions.
