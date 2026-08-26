# image resize handles — design

Date: 2026-08-26 · Target release: 1.6.0 (pre-release line `next`)

## Goal

Give the selected image element **four corner handles**, so its box is set by
dragging rather than by typing two numbers into a form.

**This is sub-project 2 of three**, opened by the image element spec
(2026-08-24). Sub-project 3 — the selection toolbar and the free four-corner
distortion — is a separate brainstorm, a separate spec and a separate branch.
Nothing here may assume it exists; what it owes it is a gesture whose corners
can later mean something else, which is decisions 1 and 12.

**Two things this sub-project was expected to carry and does not**, both narrowed
deliberately and both amended in writing below: it does not remove the form's box
fields (decision 14), and it applies to the image kind alone (decision 15).

## Decisions

### 1. The handles are on the corners, and the toolbar is not in this scope

Two arrangements were weighed. Putting resize on the **sides** would leave the
corners free for the distortion and need no mode at all; putting it on the
**corners** needs a way to say "these corners now distort", which is the toolbar.

The corners win, for three reasons that are ours rather than conventional:

- **The sides are the handles that fight the model.** `height` absent *is*
  keep-ratio (image spec decision 3), so a north or south handle has nothing to
  write while the ratio is kept — it can only break it. A corner writes `width`
  alone in keep-ratio mode and both numbers otherwise; both cases pass.
- **The toolbar is not a new cost.** Sub-project 3 was already brainstormed as a
  *tool picker*. The corners were always going to need something to say what they
  mean; the side arrangement spends them permanently to avoid a thing that is
  already on the roadmap.
- **The corners are where the hand expects them**, and modifiers live there:
  ratio on SHIFT, anchor on ALT (decisions 2 and 4).

**The toolbar itself is out of scope here.** Its reason to exist is the
resize/distort switch, which arrives with the distortion. Shipping it now would
mean a permanently-present strip holding one disabled button, and it takes
vertical space in the edit dialog for the whole session.

### 2. A corner drag keeps the ratio; SHIFT frees it

This is **Photoshop's modern arrangement and the opposite of Figma, Illustrator
and Sketch**, where a corner is free and SHIFT constrains. Written down with its
reason, because someone will otherwise "correct" it back:

**The choice is forced by the model, not by taste.** Keep-ratio is the stored
default state — a fresh image has no `height`. A gesture that were free by
default would write a `height` on the first corner ever dragged and take every
image out of keep-ratio silently. **The default gesture must not change the kind
of thing the item is.**

Under a forced ratio (decision 8) SHIFT is inert.

### 3. The ratio locked is the box's ratio at `pointerdown`, in pixels

One rule covers both cases the user can be in. With no `height` the box already
sits at the image's natural ratio, so that is what is preserved; with a `height`
the box sits at whatever stretch the user chose, and *that* is preserved. The
stretch is a decision, not an accident.

**In pixels, and this is the trap of the whole design.** `width` is a percentage
of the background's *width* and `height` a percentage of its *height*. The
background is not square, so `height / width` in stored units **is not the visual
ratio**. Locking on the stored numbers gives a distortion that grows with the
drag. The gesture works in pixels throughout — which `drag-layer.ts` already does
for its own reasons — and converts back only at the release.

### 4. The opposite corner is the fixed point; ALT fixes the anchor instead

Default: the corner diagonally opposite the grabbed one stays put, as in every
design tool. The item's box therefore moves, so the gesture commits a position as
well as a box (decision 11).

**ALT resizes from the item's anchor** — the generalisation of Photoshop's
"from the centre" to the nine anchors this card already has. It writes `width` /
`height` and nothing else: `positionStyle` puts `translate(-Xoffset%, -Yoffset%)`
on the wrapper, so changing the size alone already grows the box around the
anchor point, for free and for every anchor.

**Worth knowing before touching the default path: under the `auto` anchor,
"opposite corner fixed" is self-referential.** `axisOffset` returns `null` for
`auto` and `positionStyle` then uses the coordinate itself as the translate
fraction — an item at `left: 30` is translated by `-30 %` of its own width. So
changing `left` to hold an edge also changes the translate, which moves the edge
again. It resolves in closed form — `L = 100 · (R − w) / (W − w)` for a held
right edge `R` — but it does not resolve by guessing, and `auto` is the default
anchor, so this is the common case rather than the corner case.

The ALT path never meets this: it does not touch the position.

### 5. In keep-ratio mode the gesture writes `width` only

`height` stays empty and the browser resolves it. The ratio is then held by the
image itself, exactly, with no arithmetic of ours — and it is held the same way
the committed config will hold it, so the gesture is WYSIWYG to the pixel.

Two consequences, both accepted:

- **The dragged corner does not stay under the pointer.** It lands where the
  image's ratio puts it. Figma behaves this way under SHIFT; here it is the
  default, so it is met immediately rather than learned.
- **One forced reflow per `pointermove`**, for the three corners whose fixed
  point is not the top-left: `top` and `left` are recomputed from the resolved
  height, which must be read back after the width is written. `drag-layer.ts`
  reads rects at `pointerdown` only, so this is a new cost. It is one element,
  and it is stated here so it is not discovered at a profile.

**Also removed for the duration of the gesture: `max-height`.** In keep-ratio
mode the card writes `max-height: 100%`; leaving it would cap the drag against
the background's height with nothing on screen to explain it. Image spec decision
5 is explicit that the clamp guards channel 3 — the image file's own ratio — and
not a gesture, which is channel 1 and carries its own bound. `imageBoxStyle`
restores it at the release.

### 6. The gesture's mode is one boolean, and SHIFT is only one of its inputs

`free` is computed by the gesture from all of its inputs — `ev.shiftKey`,
`ratioIsForced`, and whatever sub-project 3 adds — and drives **both** what is
drawn and what is committed.

Neither a maintained boolean nor a reading of `shiftKey` at the commit. The
reason is dated: **the toolbar will make SHIFT stop being the only channel.** It
is the natural home for a ratio lock and for the "restore keep-ratio" affordance
that decision 14 leaves owed. A rule naming SHIFT is wrong the day a button can
free the ratio, and wrong *silently*, because the display will have followed the
button. `ratioIsForced` already carries this shape and the comment explaining it:
one predicate, three readers, because three copies each correct on their own
eventually disagree invisibly.

**Modifiers are read live**, from `ev.shiftKey` / `ev.altKey` on every pointer
event. `keydown` / `keyup` on `window` replay the same computation with the last
known pointer position, and exist for one case only: moved, then stationary, then
SHIFT — where no `pointermove` will come. Three properties, each load-bearing:

- **on `window`**, because during `setPointerCapture` the element has no keyboard
  focus and the keys go to the dialog's focused node;
- **`ev.shiftKey` from the pointer event stays authoritative.** An alt-tab
  mid-gesture takes the `keyup` with it; reading the pointer event's own flag
  resynchronises on the next move with nothing to repair;
- **auto-repeat needs no guard.** The computation is idempotent in its inputs. A
  guard added by reflex here would mask a real bug later.

A SHIFT toggled with *zero* movement since `pointerdown` needs no handling at
all: the constraint only acts on a displacement, and there is none.

### 7. What is committed is derived from the mode and the initial state

> - `height` was absent, and the gesture is not `free` at the release → `height`
>   is not written.
> - `height` was absent, and the gesture **is** `free` at the release → `height`
>   is written.
> - `height` was present → `height` is written, whatever the mode.

`width` is among the written keys whenever a commit happens at all. **The forced
ratio needs no clause of its own here**: `free` accounts for `ratioIsForced`
(decision 6), so under a live camera the second branch cannot fire and a height
is never created — only scaled, by decision 8.

The modifier's *history* enters nowhere: pressing
SHIFT, wandering and releasing it re-locks the box to the ratio of decision 3, so
the item is unchanged in kind and nothing is frozen that the user believed they
had undone.

**`hadHeight` is read from the stored config — `"height" in config` — not from
the rendered box.** `effectiveBox` drops the key under a forced ratio, which is
exactly the case where the distinction decides the outcome.

**Re-locking must clear the pixel height from the wrapper, not merely recompute
it.** Forgetting that line breaks nothing visible — the height returns to `auto`
regardless — and commits a `height` on an item the user left in keep-ratio.
Silent, and in the case this design spent the longest on.

**No commit when nothing changed.** The test is on the values as they will be
stored: `toPercent` already rounds through `round2`, so candidates equal to the
stored numbers after rounding produce no write. No pixel threshold and no hold
timer — `isDrag` exists because a click on a badge also *selects*, and a press on
a handle has no second meaning: the item is already selected, which is the
condition for the handle to exist at all.

### 8. Under a forced ratio, SHIFT is inert and the dormant height is scaled

`ratioIsForced` (`src/image-box.ts`) is already read by the card, the element and
the form; the gesture becomes its fourth reader rather than its second copy.

- **SHIFT does nothing.** Letting it write a `height` would reintroduce through
  the handle exactly what `855ba92` closed in the form.
- **A stored `height` is scaled by `k = w_final / w₀`**, the only factor
  available since width is the sole free variable. The dormant box keeps its
  shape, so leaving Live returns the same picture as before the resize.

The second point departs from the form's rule that the stored height is *never*
touched. That rule was made for an interface which could not change the width
either; the handle breaks its premise, and holding its letter would return a box
of a different ratio. The cost, accepted: the gesture writes a key whose effect
is not visible on screen.

The gesture never *creates* a height under a forced ratio.

### 9. The clamp reduces to a single scale factor, and ratchets per edge

**Per-axis clamping is wrong here, and its symptom reads as a rendering bug.** A
ratio-locked resize has **one** degree of freedom. Clamping width and height in
their own intervals, as the drag rightly does for its two independent axes,
leaves `w / h ≠ ratio₀`: the image stays proportioned while the corner is pulled
toward the middle of the picture and **distorts progressively as it is pushed
into a border**.

Each constraint becomes a maximum admissible `k` — the moving vertical edge, the
moving horizontal edge, the floor — and `k = clamp(k_candidate, k_min,
min(k_max_x, k_max_y))` is applied to both axes at once. The box stops growing
the moment *either* edge reaches its bound, and the ratio is exact throughout.
Under `free` the question dissolves: two degrees of freedom, two independent
clamps, exactly the drag.

**The ratchet is `tighten`, reused with `element = 0`.** It computes
`span(container, element)`; the drag bounds a *leading corner* of fixed size,
this bounds an *edge*, and `span(container, 0) === container` gives the ratcheted
interval `[min(0, edge₀), max(container, edge₀)]` — "an existing overflow can be
reduced, never increased", which is image spec decision 5's channel 1. Reusing it
this way also keeps the interval constant for the whole gesture: a ratchet
computed against a *moving* box size would be wrong the moment an overflowing
item is shrunk. If the `0` reads as a trick, the two lines of the ratchet extract
into a helper both controllers call.

Two consequences to write down, or they will be read as bugs:

- **Under ALT an already-overflowing item cannot grow on that axis.** Growing
  from the anchor pushes both edges outward, and the one already outside would
  increase its overflow. Shrinking still works, as does the corner without ALT.
- **A fixed corner outside the frame locks nothing.** The ratchet consults only
  the *moving* edge. The gesture stays live and brings back what it can; it
  simply cannot make such a box fully interior.

**None of this reaches the model.** `normalizeImageBox` gains no upper bound, for
the reason `parsePercent` and `round2` already carry: clamping on the way out
would rewrite an overflowing item on its first trip through the editor.

### 10. A floor, which the drag never needed

The box does not go below the size at which its four handles would overlap. Below
that there is nothing left to grab. `positivePercent` already refuses a
non-positive box on the way in, but only a gesture can *reach* zero, and decision
14 leaving the form fields in place is what keeps this from being a dead end
today — not a reason to skip the floor, since it will not stay that way.

### 11. Box and position travel in one write: `patchBox`

`patchAnchor` settled this question and wrote why: *"two commits would render the
new anchor against the old coordinates for a frame, which is the jump this whole
exchange exists to avoid."* Here it would render the new box against the old
position.

`patchBox(index, box, position?)` joins `patchPosition` on `EditorChannel`. The
image spec called it `patchSize`; **`box` is the right word**, because it carries
an `ImageBox` and because `size` already means `ElementSize` — the clamped pixels
of the icon and the label, which image spec decision 3 explicitly refused to
conflate with a percentage box.

### 12. A new module, and one hit test deciding between two gestures

**`src/card/resize-layer.ts`, not an extension of `drag-layer.ts`.** The two
gestures resemble each other only from a distance: one bounds two independent
axes, the other has a single degree of freedom; one reads no modifiers and no
keyboard, the other reads both; one has no floor; and they commit different
things. What is genuinely shared already lives in `position.ts` — `tighten`,
`toPercent`, `axisOffset`, `positionStyle`.

**One `pointerdown`, dispatched by the hit test.** A handle is a child of the
wrapper, so `getIndexedWrapper` would resolve a press on it to the item and start
a drag. It becomes a hit test returning a discriminated union — handle (with its
corner) / item / nothing — and the listener dispatches explicitly. The
alternative, two controllers with the resize attached first and stopping
propagation, makes correctness depend on listener registration order: invisible
to a reader and undone by the first refactor that reorders two lines.

**One owner of "a gesture is live on item N".** `_applyPositions` already skips
`index === dragging`, without which every `hass` tick would overwrite the live
pixels. The resize needs the same protection and for `width` / `height` /
`maxHeight` as well as the position — as **one question asked of whichever
gesture is live**, not two flags read in two places.

**The transient `fitMode`.** During a gesture that writes a height, the config
still has none, so the element renders `contain` and the image sits letterboxed
inside the selection ring until the commit flips it to `fill`. The card pushes a
transient `fitMode` onto the element — the channel by which it already stamps
`editing` — and drops it at `pointerup`, where the commit restores the derived
value. Without it the two modes would make different promises about what the
gesture shows, which is the kind of inconsistency nobody explains twice.

### 13. The handles are children of the wrapper, on the selected image, while editing

**On the wrapper**, which is where `_applyPositions` already writes the box, and
for a reason that covers them too: `.item` is `width: max-content`, so a
percentage on a child is cyclic. The element's host is reserved — the image
spec's forward-compatibility section promises it the distortion's `matrix3d`, and
resize handles have no business inside a transformed node.

Four corners, on the selected item only, in edit mode only.

### 14. AMENDMENT to image spec decision 13 — the box fields stay

Image spec decision 13 says `width`, `height` and the keep-ratio checkbox *"are
meant to be removed at sub-project 2, when handles replace them"*, and in the same
paragraph that removing them removes the only non-pointer way to size an image,
so **the keyboard path must cover resize as well as move, and that is a single
design, not two**.

**The fields stay. They are removed when their replacement exists, and the
replacement is the keyboard path — not the handles.** Handles replace the fields
for whoever has a pointer, and for nobody else. Follow-up 9 still has four open
questions of its own (the step and its unit, editor-only or live dashboard, what
takes focus, what is announced), and removing the fields now would ship an
accessibility regression for as long as those stay open.

This is a real contradiction of a published decision, and it is amended here
rather than left to be a thing the spec says and the code does not do.

### 15. The image kind alone

The image spec's introduction says sub-project 2 *"applies beyond images: icons
and labels have a size too."* Narrowed: **the handles drive `width` / `height`,
which only the image has.** `ElementSize` is `clamp(min px, ratio cqw, max px)` —
not a box, and a handle would have to choose which of the three numbers it moves.
That is a different design, and it is not this one.

Where "this kind is resizable" is declared: `element-kinds.ts`, beside `stub` and
`defaultActions`, rather than an inline `config.type === "image"` in the card. The
card has such a test already, but `element-kinds.ts` exists to declare per-kind
facts once and a third kind is coming.

## The gesture, in order

**`pointerdown` on a handle.** Left button only; a second pointer during a live
gesture is ignored. Capture goes on the **wrapper**, as the drag's does — one
fewer node whose identity has to survive the gesture. Measured once, in pixels:
`box₀` relative to the surface, `ratio₀ = w / h`, `hadHeight`, `forced`, the
anchor, and the declarations about to be overwritten — `left`, `top`,
`transform`, `width`, `height`, `maxHeight` — kept **verbatim**, per the drag's
precedent: a gesture that commits nothing restores exactly the strings it
replaced rather than recomputed ones a hundredth of a percent away.

**`pointermove`:**

1. the pointer in surface pixels;
2. the **fixed point**, taken at `pointerdown`: the opposite corner, or the
   anchor under ALT;
3. the candidate box, per axis;
4. **ratio lock** unless `free`: the 2D candidate reduces to the scalar `k` by
   projection onto the diagonal of `ratio₀`;
5. **clamp**: each axis yields a maximum `k` through `tighten` on its moving edge
   with `element = 0`; the smallest wins, plus the floor;
6. pixels written to the wrapper.

**`pointerup`** converts to percentages, applies decision 7, calls `patchBox`
once, and restores the derived style immediately — a gesture ending where it
began produces no config change, so no `setConfig` is coming to correct raw
pixels left on screen.

**`pointercancel`** restores the verbatim strings and commits nothing. The user
never let go.

## Testing and verification

**happy-dom carries the arithmetic**, on `drag-layer.test.ts`'s precedent —
synthetic pointer events against a stubbed layout, noted there as *"happy-dom has
no layout, so every box the controller reads is stubbed."* One difference: **the
stub must be dynamic.** The height read back in keep-ratio mode is a function of
the width just written, so a stub reading `el.style.width` and returning
`width / ratio` does what the browser does and makes decision 5's only
layout-dependent path testable. No new seam.

**What must discriminate** — the tests that would otherwise be green for the
wrong reason:

- **a non-square surface and a non-square box.** The most important fixture
  choice here: on a square background, locking the ratio on stored percentages
  and locking it in pixels agree, and decision 3's trap passes unnoticed;
- **a corner pushed into a border where one axis binds before the other**, or
  per-axis clamping and single-`k` clamping agree and decision 9 is untested;
- **an item already overflowing at `pointerdown`**, or `tighten` is
  indistinguishable from an ordinary clamp — it is the ratchet under test, not
  the bound;
- **`forced` with a dormant height present**, the only way decision 8's scaling
  is observable;
- **SHIFT pressed and released before `pointerup`**, the case where forgetting to
  clear the wrapper's height breaks nothing visible and commits the wrong item.

**Every new test is run against the current code and seen to fail.** That step is
what `9ef9a44` and `5c99960` each lacked — both asserted something that could not
vary and stayed green for weeks. A geometric gesture is a stack of precedences,
and the rule those left behind applies verbatim: a test guarding a precedence must
use inputs that make every branch reachable.

**The browser lane takes the two questions happy-dom cannot answer**: that the
read-back height is the one the image imposes, and that the committed box renders
where the gesture drew it, transient `fitMode` included — decision 5's WYSIWYG
claim, which needs a real rendering engine. `src/tests/playwright/image-box.test.ts`
and `drag.test.ts` are the precedents.

**Then a verification in real Home Assistant, which is not a formality.**
Sub-project 1 was reviewed, green and ready to merge when a browser session found
four more bugs, keep-ratio among them. Three setup traps, each already paid for
once: bump `?v=N` in `.ha/config/.storage/lovelace_resources` and restart the
container, because a hard reload does not reliably dislodge the cached build;
never `rm -rf dist`, which kills the bind mount and 404s every resource; and any
debug overlay mounts inside the card's `.root`, not on `document.body`, which the
dialog's top layer covers.

**The baseline.** Last measured 2026-08-25: 47 files, 956 tests. The delivery's
full run updates it, with its date, in `mem:picture-studio/1.6.0-handoff`. A
scoped run never touches it — `testFiles` is recorded next to the count precisely
so a partial run is recognisable.

## Out of scope

- **The toolbar** and the resize/distort switch — sub-project 3, decision 1.
- **The distortion** itself, and the `ResizeObserver` its `matrix3d` requires.
- **A keyboard path**, which is follow-up 9 and which decision 14 now names as
  the gate on removing the form's box fields.
- **Handles on icons and labels** — decision 15.
- **Side and edge handles.** Nothing here forecloses them; they were refused on
  their merits, not deferred.

## Versioning

`1.6.0`, on the `next` line. `package.json` carries `1.6.0-beta.N`, bumped only
when asked; the changelog heading stays `## 1.6.0 — unreleased` until the line
ships as a stable from `main`.

The `CHANGELOG` entry goes under **`Added`**, and says what a user does: drag an
image's corners to size it, hold SHIFT to break its proportions, hold ALT to
resize from its anchor. It also says the one thing they would otherwise find out
by accident — that breaking the proportions is what fills the box, so the picture
stretches rather than letterboxes.
