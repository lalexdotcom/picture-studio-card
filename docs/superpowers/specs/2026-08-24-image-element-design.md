# image element — design

Date: 2026-08-24 · Target release: 1.6.0 (pre-release line `next`)

## Goal

Add a third element kind, `image`: a **picture placed on the picture**, sized as
a share of the background and resized by dragging in the editor.

The `state-label` spec (2026-08-17) closed with "`image` remains uncovered; it is
out of scope here." This is that scope, and it completes the coverage of Home
Assistant's picture-elements element types that this card cares about.

It carries a deliberately small slice of what the background offers: a light
image, a dark image, and its own box. Everything else the background can do —
camera, state images, filters — is not offered here.

**This spec is sub-project 1 of three.** The two that follow are separate
brainstorms, separate specs, separate branches:

2. **Direct resize** — handles on the selected item, a `patchSize` symmetric to
   the existing `patchPosition`. Applies beyond images: icons and labels have a
   size too.
3. **Selection mini-toolbar** — the mode switcher that makes 2 discoverable, and
   where a later "distort" mode will attach.

Nothing in this spec may assume 2 or 3 exists. What it owes them is a size model
they can drive, which is decision 3.

## Decisions

### 1. The kind is named `image`, not `picture`

`elementLabel` translates a kind through **Home Assistant's own key**,
`ui.panel.lovelace.editor.card.picture-elements.element_types.<type>`
(`element-catalog.ts`). `image` is a native picture-elements element type, so
that key exists and is translated in every language HA ships. `picture` would
cost us a string of our own in `strings.ts`, in English and French only.

It is also the word a user migrating from picture-elements already writes. The
card is named picture-studio; its element kinds follow HA's vocabulary, not the
card's name — `state-icon` and `state-label` already do.

### 2. Our own `<img>`, not `hui-image-element`

The background renders through HA's `hui-image-element` (`_bgConfig`,
`BACKGROUND_KEYS`), and reusing it for the item was the first instinct.

**Everything below was read out of the shipped bundle, frontend build
`20260729.6`** — the same build `has-changed.ts` and the error-badge workaround
are reconciled against. An earlier draft of this decision argued from memory and
got the mechanism wrong; it claimed `hui-image` sizes its image at height *auto*
and so could not fill a box with an imposed height. It can. What follows is what
the code actually does.

First, confirming the premise: `create-hui-element` holds
`Set(["conditional", "icon", "image", "service-button", "state-badge",
"state-icon", "state-label"])` and builds the tag as `hui-<type>-element`. So
picture-elements' `image` element **is** `hui-image-element`, which renders a
`<hui-image>` inside itself.

**`hui-image`'s `<img>` is `width: 100%; height: 100%; object-fit: contain`.**
Given a box with a definite height it fills it perfectly well. The fit is driven
by a `fitMode` property — `contain` / `fill` / `cover`, each selecting a class —
and **`hui-image-element` never passes it.** Its render forwards exactly
`entity`, `image`, `stateImage`, `cameraImage`, `cameraView`, `filter`,
`stateFilter`, `title`, `aspectRatio`, `darkModeImage`, `darkModeFilter`. Nothing
else.

So the objection is not that it cannot be sized. It is that **the one thing it
does with that size is the one thing decision 4 rejects, and the property that
would change it is not on the public surface.** Through the only supported door,
an image element would be locked to `contain` — the reading where a height that
does not match the ratio changes nothing visible, which makes the height input
look broken.

Two smaller costs, also read from the bundle and also real:

- `hui-image` applies its `.ratio` container while `_lastImageHeight` is still
  undefined — a `height: 0` geometry on every mount, until the image has been
  measured. A transient we neither control nor can predict, on a card Home
  Assistant rebuilds at every config change.
- `hui-image-element.setConfig` defaults **both** `tap_action` and `hold_action`
  to `more-info` and toggles a `clickable` class. `_bgConfig` already pins the
  two to `"none"` to suppress exactly that; we would be carrying the same
  workaround a second time.

And the original argument stands on its own: once the surface is cut to light +
dark, reuse buys **one thing** — the dark-mode swap — and `hass.themes.darkMode`
is already in our `HomeAssistant` type (`types.ts`). Three lines.

**The cost, and it must be stated in the CHANGELOG:** `state_image`,
`camera_image`, `camera_view`, `filter`, `dark_mode_filter`, `state_filter` and
`entity` **do nothing** on an image element. They survive in the user's YAML —
that is `normalizeElementConfig`'s standing contract, unknown keys are kept —
but they are never read. An image element is not a second background.

### 3. Width in %, and a height whose absence means "keep ratio"

```
width: 40        # % of the background's width — always meaningful
height: 25       # % of the background's height — optional
```

**`height` absent is the keep-ratio mode**, rendered as `height: auto`: the
browser holds the image's natural ratio exactly, for free, forever, whatever the
background is. There is no stored boolean beside it. A checkbox *and* a height
would be two sources for one fact, and a hand-written YAML would eventually make
them contradict each other.

This also disposes of a wrong idea considered and dropped: "restore the original
ratio" is **not** a number to compute. Because `width` measures against the
background's width and `height` against its height, equal percentages give a box
at the *background's* ratio, not the image's — the natural-ratio height would be
`H = W · R_background / R_image`, a value that goes stale the moment the
background's ratio changes. `height: auto` is the same idea with none of the
arithmetic.

**No `size: ElementSize`, and that is the decision.** `ElementSize` answers "how
big is this glyph", clamped in pixels (`clamp(min px, ratio cqw, max px)`). An
image is a box measured against the background. Reusing it would force
`mode: fixed` in pixels, which **stops tracking the background** when the card
resizes — the opposite of what this element exists for.

The compiler is what finds the fallout: the two `assertNever` calls
(`config.ts`, `element-form.ts`) stop compiling the day `ElementConfig` gains a
member without a `size`. That is exactly what they were written for.

### 4. With a height, the image stretches

`object-fit: fill` — which is the initial value for `<img>`, so it needs no
declaration in that mode.

Unticking keep-ratio is the explicit act of saying "I want *these two*
dimensions". Any other value silently ignores one of the two numbers the user
just typed, and the height input then looks broken: with `contain`, a height
that does not match the ratio changes nothing visible; with `cover`, it crops
without saying so.

A later "distort" mode (sub-project 3) therefore has its rendering already
present; what it adds is the gesture.

### 5. Keep-ratio is clamped to the background's height — the one channel nothing else bounds

In keep-ratio mode only: `max-height: 100%` plus `object-fit: contain`. Inert in
the normal case, where the box already matches the image; it bites only when the
image would exceed the background's height. The cost, accepted: such an image
gets side margins rather than being cut.

**This does not prevent the card from scrolling, and must not be read as if it
did.** `ha-card` is `overflow-y: auto`; `.layer` and `.root` are both
`overflow: visible`; and `.item`'s containing-block chain runs through both. An
item hanging below the background therefore contributes to `ha-card`'s scrollable
overflow and raises the bar — today, already, with no image element in sight.
Only the bottom and right do: the scroll origin is the padding box's top-left, so
what overflows above or to the left is unreachable rather than scrollable.

It is rare today only because the `auto` anchor forbids it by construction —
`axisOffset(anchor, "y") ?? p.top` makes the translate `-100%` at `top: 100`, so
the item's bottom edge lands exactly on the background's. It takes an explicit
anchor *and* a low position to overflow, and the drag can only bring such an item
back.

**What this clamp really guards is a third input channel.** A box arrives from
one of three places, and they are bounded differently:

1. **A gesture** — the drag today, resize handles and distortion corners later.
   Bounded by its controller (`[0, W - w]`), so it *cannot* produce an overflow.
   Cheap, because the bound lives in the one place that already knows the
   geometry.
2. **A hand-written config** — deliberately unbounded, and it stays that way:
   `parsePercent` does not clamp, and `round2`'s comment explains why — clamping
   on the way out would put an overflowing item back and rewrite the user's YAML.
   It is let through, and a gesture can only bring it home.
3. **The image file's own ratio** — bounded by *nothing*. It is neither a gesture
   nor a value anyone typed, so neither mechanism above reaches it.

`max-height: 100%` exists for the third and only the third. A user writes
`width: 50` on a 1:10 banner, gets nothing wrong, and without the clamp gets a
card that scrolls five times its own height. That is not imprudence, it is a
surprise, and it is the only one of the three that is.

So the clamp is not an exception to the no-clamping rule: it fills a hole the
rule never covered. It also bounds the **render**, never the config — it stores
nothing, rewrites nothing, and undoes itself the moment the width changes.
Overflow from channels 1 and 2 is accepted, deliberately, and stays accepted.

### 6. Light and dark each keep their own ratio

In keep-ratio mode, two images of different natural ratios give two different
box heights, and under a bottom or centre anchor the item visibly moves when the
theme flips. Accepted: that is literally what "keep the ratio" asks for, and the
alternatives each hide something — forcing the light image's box distorts the
dark one silently, or letterboxes it with the background showing through.

With a height set, the question does not arise: the box is fixed by the two
percentages and `fill` puts any image in it exactly. Nothing moves.

The flip is seen: `hassRenderChanged` compares `oldHass.themes !== newHass.themes`
and returns true.

### 7. The card sizes the box; the element draws inside it

The card places, the element draws — the same split the state-label spec settled,
applied to one more property.

**The card must own the box, and has no choice about it.** `.item` carries
`width: max-content`, and a percentage width on a child of a `max-content` box is
cyclic — CSS resolves it as `auto`, so an element sizing itself in `%` would
simply not. The wrapper is the card's.

It is written as inline style, by the method that already owns the wrapper's
geometry, `_applyPositions` — the same idiom as the `top` / `left` / `transform`
three lines above it:

```ts
wrapper.style.width     = `${width}%`;
wrapper.style.height    = height === undefined ? "" : `${height}%`;
wrapper.style.maxHeight = height === undefined ? "100%" : "";
```

Inline style beats the stylesheet's `max-content`, so no new class and no new
selector is needed. This matters: `wrapper.className` is `item ${item.type}`,
which is the item **family** (`badge` / `element`), not the element kind — there
is no `.item.image` to write a rule against, and inventing one would add a second
channel saying what the config already says.

The element sets its own `object-fit` from its own config — `fill` with a height,
`contain` without. That is not a second source of truth: it is the same config,
read by the two parties for their two jobs.

`.item` is `position: absolute` inside `.layer` (`inset: 0`, stretched over the
background), so both percentages resolve against the background's box directly.
No container query is involved — and that is fortunate, because `cqh` would not
work: `.root` is `container-type: inline-size`, and `size` would demand an
explicit height, which the card refuses by construction.

`_applyPositions` skips the item under an in-flight drag. That is correct here:
in this sub-project the box does not change during a gesture. Sub-project 2 is
what makes it change, and it will have to revisit that guard.

### 8. Outside editing, the item is transparent to pointers

An image element has no action. Without `pointer-events: none` a large one would
swallow every click over its whole surface, including those meant for icons
underneath it — a failure that does not exist for badges, which are small.

While editing, the wrapper keeps the pointer as every item does, so it can be
selected and dragged.

**Stacking is DOM order, and the item list's reordering already controls it.**
That is what makes an image *under* the icons reachable, with no new property.
It is worth saying in the README: it is the non-obvious half of the feature.

### 9. An image element with no image must still be visible while editing

An `<img>` with no `src` draws *nothing*. A `state-icon` with no entity is not in
that position — HA's `state-badge` draws its own missing-entity marker. A freshly
added image element would therefore be invisible and impossible to grab.

The element draws a **dashed placeholder box while `editing` and image-less**, and
nothing at all otherwise. This is not decoration; it is what makes the item
selectable between being added and being configured.

### 10. Unticking keep-ratio writes the height the item already has

Otherwise the box jumps at the moment the checkbox is cleared, because `height`
goes from absent to some default.

The measurement comes from the preview through the existing `CardChannel` — the
same route `reanchor` uses to ask the card a geometric question the editor cannot
answer. This is the one non-trivial piece of the form.

### 11. `element-form.ts` is split by kind before the third kind lands

605 lines, branching eight times on `isLabel ? … : …`. A third kind turns each of
those into a three-way ternary, in a file sub-project 2 will come straight back
to.

Extract the per-kind body into modules behind a small interface —
`toFormData` / `fromFormData` / `render` — leaving `PictureStudioElementForm` as
the shell: header, dispatch, and the `ha-form` plumbing shared by all kinds.

**This is the largest risk in the plan and gets its own step**, behaviour
unchanged, with the existing 839-line `element-form.test.ts` as the net. It is in
scope because it is the file the feature modifies — not unrelated refactoring.

### 12. The image is hidden until it has loaded

In keep-ratio mode the used height is **0 until the image decodes**, and
`positionStyle` produces `translate(-X%, -Y%)` whose percentages resolve against
the element's own box. So every anchor with a non-zero Y offset draws the item in
the wrong place for one frame, then jumps.

It is not a one-off. Home Assistant destroys and rebuilds the card element on
every config change, so in the editor this fires on **every drag release** — the
same family of defect as the mobile snap-back and as `lastPreviewHeight`, which
exists in this very file for this very reason.

The element renders `visibility: hidden` and reveals on load. Nothing is ever
drawn in the wrong place; the cost is a brief absence on each rebuild.

Four things this must get right, each of which is a way it silently fails:

- **`visibility`, not `display: none`.** The box has to be laid out, or the height
  stays 0 for a different reason and nothing has been fixed.
- **`error` reveals too, not only `load`.** A broken URL must not become an
  invisible, ungrabbable item — that is precisely the failure decision 9 exists
  to prevent, arriving by another door.
- **Check `img.complete` when the listener attaches.** A cached image can already
  be done before the element gets to listen, and a `load` that has already fired
  never fires again.
- **No transition on the reveal.** A re-entry would fade in from zero and turn a
  one-frame gap into a visible flash — the reasoning the selection ring already
  carries in the card's styles.

Applied in **both** modes, not only the auto one. With an explicit height the box
is already definite, so the reveal buys nothing there — but it costs nothing
either, since an unloaded image has nothing to show in that box anyway, and a
rule that runs only sometimes is one a later change breaks by accident.

## Config shape

```yaml
# image — new
- type: element
  position: { top: 50, left: 50 }
  anchor: auto
  config:
    type: image
    image: /local/floorplan/sofa.png     # or the media selector's object
    dark_mode_image: /local/floorplan/sofa-dark.png
    width: 40          # % of the background's width; omitted at its default
    height: 25         # % of the background's height; omitted ⇒ keep ratio
    alt: ""            # decorative by default
```

```ts
export interface ImageElementConfig {
  type: "image";
  /** A path, or the object the media selector stores. Unwrapped by imagePath(). */
  image?: ImageSource;
  /** Swapped in under a dark theme; falls back to `image` when absent. */
  dark_mode_image?: ImageSource;
  /** % of the background's width. Always present in memory, defaulted. */
  width: number;
  /** % of the background's height. Absent is the keep-ratio mode. */
  height?: number;
  /** Empty string is the default: an image element is decorative. */
  alt?: string;
}
```

**Normalization.** `width` and `height` go through `parsePercent`, which
deliberately does **not** bound its result — the same rule positions follow, and
for the same reason: bounding on the way in would put an overflowing item back,
undoing what the user wrote. The one guard is `> 0`, since a zero or negative box
is not a value, it is a broken element. `height` is kept only when it parses;
anything else leaves it absent, which is the keep-ratio mode.

**Storage.** Both omitted at their default, as `size` already is, and `...rest`
carried through untouched. A config that never set a width does not grow one.

`DEFAULT_IMAGE_WIDTH = 20` — a fifth of the background, large enough to see and
grab, small enough not to cover what is already placed.

## Rendering

A new element `picture-studio-image`, tag constant `IMAGE_TAG` beside `ICON_TAG`
and `LABEL_TAG` in `config.ts`, and a third branch in `_createChild`.

```
src = imagePath(hass.themes.darkMode ? (dark_mode_image ?? image) : image)
```

The same `imagePath()` unwrapping the background applies to both of its own image
keys — an object from the media selector is not a path.

The box is written by `_applyPositions` onto the wrapper, per decision 7. The
element renders one `<img>` and, when it has no source and is editing, the dashed
placeholder of decision 9.

## Editor

- `ELEMENT_KINDS` gains `"image"` — "added here and nowhere else", as its own
  comment promises. `elementCatalog` and `stubElementConfig` follow from it.
- `icons.ts` gains `"image": "mdi:image-outline"`.
- `stubElementConfig("image")` returns `{ type: "image", width: DEFAULT_IMAGE_WIDTH }`.
  No image: the placeholder of decision 9 is what makes that state usable.
- The form, after the split of decision 11:
  **Content** — `image`, `dark_mode_image` (the media selector, the background's
  own), `alt`.
  **Size and position** — `width`, the `keep_ratio` checkbox (derived:
  `height === undefined`), and `height` shown only when it is cleared.
  **Visibility** — unchanged, shared by every kind.

No Interactions section and no Appearance section: decision 13 below.

## Strings

The kind's own label costs nothing, per decision 1.

Every other label is resolved the way `elementFormLabel` already resolves them:
Home Assistant's key when one exists, ours when it does not. **Which of `width`,
`height` and `alt` have an HA key is not assumed here — it is looked up against
the frontend build named in the plan, and each miss becomes an English/French
pair in `strings.ts`.** The keep-ratio checkbox and its helper are ours for
certain: the concept is this card's, so no HA key can exist for it.

## Testing and verification

**happy-dom**

- `config.test.ts` — normalization of `width`/`height` (number, string with `%`,
  absent, zero, negative, non-finite); the `storedConfig` round trip, including
  that an absent height stays absent and an unknown key survives.
- `element-catalog.test.ts` — the third kind is offered; its stub.
- a new `card/image-element.test.ts` — the light/dark source choice and its
  fallback; the placeholder appears only while editing and image-less; `alt`.
- `element-form.test.ts` — unchanged behaviour across the split of decision 11
  is the acceptance criterion for that step, then the image form's own cases:
  clearing keep-ratio writes a height, ticking it removes the key.

**Playwright** (`appearance.test.ts`) — an image element renders at the expected
box in both modes, and a 1:10 banner in keep-ratio mode is bounded to the
background's height by decision 5's clamp instead of growing five times past it.

The assertion is on the **box**, not on the absence of a scrollbar. Decision 5
does not promise that, and a test written against a scrollbar would fail the day
someone legitimately positions an item low with an explicit anchor.

The full suite's count and `testFiles` figure in `mem:picture-studio/state` must
be refreshed in the same breath as the run that closes this branch — a scoped run
never touches it.

## Forward compatibility — what sub-projects 2 and 3 need from this one

Not implemented here. Written down because each is a constraint this sub-project
could foreclose by accident, and the next one would discover far too late.

### The distortion is a `matrix3d`, which forces the two-node structure

The distort mode is a **free four-corner transform**: four independently dragged
corners, no two sides parallel. That is not affine — a skew, a scale or a
rotation always maps a rectangle to a *parallelogram*. It is a homography, and
CSS expresses it as a 3×3 matrix embedded in `matrix3d()`, with
`transform-origin: 0 0`.

**`transform` and `transform-origin` are single-valued, and two independent
concerns each need all of them:** the anchor wants `translate(-X%, -Y%)` with the
default origin and percentages resolved against the box; the homography wants
`matrix3d(…)` with the origin at zero, or the four corners do not land where they
were dropped. They cannot share a node.

This spec already separates them — the wrapper carries the translate, and
`picture-studio-image` is where the matrix will go. **Nothing may later collapse
those two into one node.** Note that this is not a layout argument: transforms
never participate in layout, and that is exactly why the constraint has to be
written down rather than discovered by something breaking.

One consequence in our favour: hit-testing follows the transform. A distorted
item stays grabbable on its visible quadrilateral, not on its untransformed
rectangle, so the existing drag and selection work on it unchanged.

### The corners are offsets from the box, never a replacement for it

Store the distortion as four corner offsets **relative to** the `width`/`height`
box. Not as four absolute points: a distorted item would then have no box at all,
`width` and `height` would become dead keys, and removing the distortion would
restore nothing.

Decision 3's model does not foreclose this. Nothing here may start to.

### Sub-projects 2 and 3 bound their gestures, never the model

By decision 5's three channels: a resize handle and a distortion corner are
channel 1, so they are bounded in their controllers, exactly as the drag already
is.

**The temptation will be to clamp `width` to 100 in the normalizer.** It must be
refused: it would contradict the rule positions have followed since 1.2.0, and it
would rewrite a user's YAML on the first commit after they opened the editor.

## Out of scope

### 13. No interactions, no chrome, no halo on an image element

`tap_action` / `hold_action` / `double_tap_action`, the chrome record and the halo
are all absent. An image element is decorative; the day one of them is asked for,
it is asked for with a use case.

Also out: everything decision 2 lists — camera, state images, filters — and any
direct-manipulation resize, which is sub-project 2.

## Versioning

`1.6.0`, on the `next` line. `package.json` carries `1.6.0-beta.N`; the changelog
heading stays `## 1.6.0 — unreleased` until the line ships as a stable from
`main`.

The `CHANGELOG` entry goes under **`Added`**, and must state plainly what decision
2 costs: an image element is not a second background, and the background-only keys
do nothing on it.
