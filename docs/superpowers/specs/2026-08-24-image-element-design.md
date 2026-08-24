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
`BACKGROUND_KEYS`), and reusing it for the item was the first instinct. It is
wrong, for one measured reason:

**`hui-image` sizes its `<img>` at `width: 100%` with height *auto*.** It only
produces a box with an imposed height when `aspect_ratio` is given, and it then
fills that box with `object-fit: cover`. Its single mechanism for honouring a
height is precisely the property decision 3 removes from this model. Inside a
box with an explicit height, its image would not fill — it would overflow or
leave a gap.

What reuse would have bought, once the surface is cut to light + dark, is **one
thing**: the dark-mode swap. And `hass.themes.darkMode` is already in our
`HomeAssistant` type (`types.ts`) — three lines. Inheriting a box model that
fights ours to save three lines is a bad trade.

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

### 5. Keep-ratio is clamped to the background's height

`height: auto` is bounded by nothing. A 1:10 banner at `width: 50%` is five
times the background's height. `ha-card` is `overflow-y: auto`, so that does not
merely look wrong — it raises a scrollbar and hangs below the picture.

In keep-ratio mode only: `max-height: 100%` plus `object-fit: contain`. Inert in
the normal case, where the box already matches the image; it bites only when the
image would exceed the background's height, and then it bounds instead of
overflowing. The cost, accepted: such an image gets side margins rather than
being cut.

This bounds the *size*, not the *placement*. An item positioned near the bottom
can still hang over the edge — exactly as a badge can today, and clamped by the
same thing: the drag controller bounds a gesture to `[0, W - w]`, and only a
hand-written position escapes it.

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
box in both modes, and the keep-ratio clamp of decision 5 bounds a tall image
rather than overflowing the card.

The full suite's count and `testFiles` figure in `mem:picture-studio/state` must
be refreshed in the same breath as the run that closes this branch — a scoped run
never touches it.

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
