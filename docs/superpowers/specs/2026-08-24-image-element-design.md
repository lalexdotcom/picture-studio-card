# image element — design

Date: 2026-08-24 · Target release: 1.6.0 (pre-release line `next`)

## Goal

Add a third element kind, `image`: **a second background, placeable and sized** —
everything the card's own background can draw, put anywhere on that background,
at a size the user gives it, and later resized and distorted by hand in the
editor.

The `state-label` spec (2026-08-17) closed with "`image` remains uncovered; it is
out of scope here." This is that scope.

**The scope grew during the brainstorm, deliberately and with a measurement
behind it.** It opened as "a light image, a dark image, and a box", on our own
`<img>`, because Home Assistant's `hui-image` was believed unable to fill a box
with an imposed height. A spike against the running frontend showed that belief
was wrong (decision 2), which made the whole background vocabulary — camera,
state images, filters — reachable for the price of three property bindings. The
element takes it.

**This spec is sub-project 1 of three.** The two that follow are separate
brainstorms, separate specs, separate branches:

2. **Direct resize** — handles on the selected item, a `patchSize` symmetric to
   the existing `patchPosition`. Applies beyond images: icons and labels have a
   size too. It also **removes** this spec's box fields (decision 13).
3. **Selection mini-toolbar** — a tool picker, not a mode switch: move, resize
   and distort all apply to the same item and compose. It is where the free
   four-corner distortion attaches.

Nothing here may assume 2 or 3 exists. What it owes them is a geometry they can
drive, which is decisions 3 and 7 plus the forward-compatibility section.

## Decisions

### 1. The kind is named `image`, not `picture`

`elementLabel` translates a kind through **Home Assistant's own key**,
`ui.panel.lovelace.editor.card.picture-elements.element_types.<type>`
(`element-catalog.ts`). Read out of the shipped bundle, `create-hui-element`
holds `Set(["conditional", "icon", "image", "service-button", "state-badge",
"state-icon", "state-label"])`, so that key exists and is translated in every
language HA ships. `picture` would cost us a string of our own, in English and
French only.

It is also the word a user migrating from picture-elements already writes. The
card is named picture-studio; its element kinds follow HA's vocabulary, not the
card's name — `state-icon` and `state-label` already do.

### 2. Rendered by `hui-image`, mounted directly — not by `hui-image-element`

**Everything below was read out of the shipped bundle, frontend build
`20260729.6`, or measured in a real browser against the running instance.** It is
the same build `has-changed.ts` and the error-badge workaround are reconciled
against. Two earlier drafts of this decision argued from memory and got the
mechanism wrong twice; what follows is what the code does and what the
measurement says.

**Why not `hui-image-element`,** the element picture-elements itself uses for
`type: image`. Its own shadow root is:

```html
<div @action … tabindex role>
  <hui-image …></hui-image>
</div>
```

and its styles, in full, are `:host(.clickable){…}`, `hui-image{pointer-events:none…}`,
`div:focus{…}`. **Nothing sizes that `<div>`.** So a height imposed on the host
does not descend: the div is `height: auto`, `hui-image` with it, and
`img { height: 100% }` resolves against an auto height — that is, intrinsic. The
host measures H and its content measures whatever the image wants. And the div
is in a shadow root: no `::part`, no custom property, no light-DOM selector
reaches it.

It covers **one** of this element's two modes — keep-ratio, natively and well.
Building on it would mean two rendering engines for one item kind, swapping when
the user unticks a checkbox.

**Why `hui-image` itself works.** Its `:host` is `display: block`, its `<img>` is
`width: 100%; height: 100%`, and its fit is driven by a `fitMode` property —
`contain` / `fill` / `cover` — which `hui-image-element` never forwards but which
we can set, because we mount it ourselves. Measured in Chromium against the
running instance, in a 200×100 box:

| | result |
| --- | --- |
| imposed height | box 100, image 200×100 — **it fills** |
| `fitMode = "fill"` | `class="container fill"`, `object-fit: fill` — decision 4, exactly |
| default fit | **`cover`** — not `contain`, as an earlier draft claimed |
| warm remount (the rebuild case) | frame 0 already correct; no transient at all |
| cold first load | one frame at `class="container ratio"`, a **16:9** box (56.25% of 200 = 112.5) |

**Availability is not a side effect of our background.** `window.loadCardHelpers`
is literally `() => Promise.all([s.e(33932), s.e(58453), s.e(58251)]).then(…)`,
and **33932 is the `hui-image` chunk**. The helper loads it itself, before it
resolves, whatever the background config says or whether a background renders at
all. The card already awaits `loadCardHelpers()` in `_syncItems` before
`_createChild` runs, so at every point an image element can exist, `hui-image` is
registered.

**The costs, stated plainly, because they are real:**

- **`hui-image` is not exported.** It is on no public helper surface; the
  guarantee above is a chunk list, an internal decision with no deprecation
  cycle. Mitigated the way this repo already mitigates such things: a lazy
  `customElements.get("hui-image")` at render with a documented fallback, the
  idiom `element-form.ts` uses for `ha-radio-group`. This repo has spent two days
  on this class of debt before (`_primeErrorBadge`); the entry price is knowing
  it and writing it down.
- **`image_entity` is resolved by us.** `hui-image-element` did it; `hui-image`
  takes an already-resolved `image`. The whole of `computeImageUrl` is one
  expression, and it is HA's public HTTP API:
  ```js
  stateObj.attributes.access_token
    ? `/api/image_proxy/${stateObj.entity_id}?token=${stateObj.attributes.access_token}&state=${stateObj.state}`
    : undefined
  ```
  The `&state=` is a cache-buster, which is why the image redraws on a state
  change. Mirror the `undefined` too: no token, no image.
- **`alt` is unreachable, and that is an accessibility regression.** We no longer
  own the `<img>`. `hui-image` accepts a `.title`, which is what HA itself passes
  (`computeTooltip`), so a title is the whole of what we can offer. Named here
  rather than discovered later.

### 3. Width in %, and a height whose absence means "keep ratio"

```
width: 40        # % of the background's width — always meaningful
height: 25       # % of the background's height — optional
```

**`height` absent is the keep-ratio mode**, rendered as `height: auto`: the
browser holds the image's natural ratio exactly, for free, whatever the
background is. There is no stored boolean beside it. A checkbox *and* a height
would be two sources for one fact, and a hand-written YAML would eventually make
them contradict each other.

This also disposes of a wrong idea considered and dropped: "restore the original
ratio" is **not** a number to compute. Because `width` measures against the
background's width and `height` against its height, equal percentages give a box
at the *background's* ratio — the natural-ratio height would be
`H = W · R_background / R_image`, a value that goes stale the moment the
background's ratio changes. `height: auto` is the same idea with none of the
arithmetic.

**The storage survives its own interface.** At sub-project 2 the checkbox
disappears and keep-ratio becomes the constrained default of the corner handle,
with the free mode on a modifier or a toolbar toggle — Photoshop's and Figma's
arrangement. `height` absent still means keep-ratio. That the config is unchanged
by deleting the UI that inspired it is the argument that it was the right config.

**No `size: ElementSize`, and that is the decision.** `ElementSize` answers "how
big is this glyph", clamped in pixels (`clamp(min px, ratio cqw, max px)`). An
image is a box measured against the background. Reusing it would force
`mode: fixed` in pixels, which **stops tracking the background** when the card
resizes — the opposite of what this element exists for.

The compiler finds the fallout: the two `assertNever` calls (`config.ts`,
`element-form.ts`) stop compiling the day `ElementConfig` gains a member without
a `size`. That is what they were written for.

### 4. With a height, the image stretches

`fitMode = "fill"`, passed to `hui-image` — verified reaching the `<img>` as
`object-fit: fill`.

Unticking keep-ratio is the explicit act of saying "I want *these two*
dimensions". Any other value silently ignores one of the two numbers the user
just typed, and the height input then looks broken: with `contain`, a height that
does not match the ratio changes nothing visible; with `cover`, it crops without
saying so — and `cover` is exactly what `hui-image` defaults to, which is one
more reason to set the property rather than inherit it.

In keep-ratio mode the box already matches the image, so the fit is a no-op
except under decision 5's clamp, where `contain` is what bounds rather than
crops.

### 5. Keep-ratio is clamped to the background's height — the one channel nothing else bounds

In keep-ratio mode only: `max-height: 100%` plus `fitMode = "contain"`. Inert in
the normal case; it bites only when the image would exceed the background's
height. The cost, accepted: such an image gets side margins rather than being
cut.

**This does not prevent the card from scrolling, and must not be read as if it
did.** `ha-card` is `overflow-y: auto`; `.layer` and `.root` are both
`overflow: visible`; and `.item`'s containing-block chain runs through both. An
item hanging below the background contributes to `ha-card`'s scrollable overflow
and raises the bar — today, already, with no image element in sight. Only the
bottom and right do: the scroll origin is the padding box's top-left, so what
overflows above or to the left is unreachable rather than scrollable. **A
transformed box counts too**, so a distorted quadrilateral dragged below the
picture will raise it as surely as a layout box would.

It is rare today only because the `auto` anchor forbids it by construction —
`axisOffset(anchor, "y") ?? p.top` makes the translate `-100%` at `top: 100`, so
the item's bottom edge lands exactly on the background's. It takes an explicit
anchor *and* a low position to overflow, and the drag can only bring such an item
back.

**What this clamp really guards is a third input channel.** A box arrives from
one of three places, bounded differently:

1. **A gesture** — the drag today, resize handles and distortion corners later.
   Bounded by its controller (`[0, W - w]`), so it *cannot* produce an overflow.
   Cheap, because the bound lives in the one place that already knows the
   geometry.
2. **A hand-written config** — deliberately unbounded, and it stays that way:
   `parsePercent` does not clamp, and `round2`'s comment explains why — clamping
   on the way out would put an overflowing item back and rewrite the user's YAML.
   It is let through, and a gesture can only bring it home.
3. **The image file's own ratio** — bounded by *nothing*. Neither a gesture nor a
   value anyone typed, so neither mechanism above reaches it.

`max-height: 100%` exists for the third and only the third. A user writes
`width: 50` on a 1:10 banner, gets nothing wrong, and without the clamp gets a
card that scrolls five times its own height. That is not imprudence, it is a
surprise, and it is the only one of the three that is.

So the clamp is not an exception to the no-clamping rule: it fills a hole the
rule never covered. It bounds the **render**, never the config — it stores
nothing, rewrites nothing, and undoes itself the moment the width changes.
Overflow from channels 1 and 2 is accepted, deliberately, and stays accepted.

### 6. Light and dark each keep their own ratio

In keep-ratio mode, two images of different natural ratios give two different box
heights, and under a bottom or centre anchor the item visibly moves when the
theme flips. Accepted: that is what "keep the ratio" asks for, and the
alternatives each hide something — forcing the light image's box distorts the
dark one silently, or letterboxes it with the background showing through.

With a height set, the question does not arise: the box is fixed by the two
percentages and `fill` puts any image in it exactly. Nothing moves.

`hui-image` owns the swap itself, given `.darkModeImage` and `.darkModeFilter`.
The flip reaches us regardless: `hassRenderChanged` compares
`oldHass.themes !== newHass.themes` and returns true.

### 7. The card sizes the box; the element draws inside it

The card places, the element draws — the split the state-label spec settled,
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

`.item` is `position: absolute` inside `.layer` (`inset: 0`, stretched over the
background), so both percentages resolve against the background's box directly.
No container query is involved — fortunate, because `cqh` would not work:
`.root` is `container-type: inline-size`, and `size` would demand an explicit
height, which the card refuses by construction. **`container-type: size` on
`.layer` was considered and refused**: it would put size, layout and style
containment on the parent of every third-party badge, to serve one of our own
kinds, and would silently redirect every existing `cqw` from `.root` to `.layer`.

Inside the wrapper, `picture-studio-image`'s own shadow root is entirely ours, so
the `height: 100%` chain that breaks inside `hui-image-element` cannot break
here: every link is a rule we write.

`_applyPositions` skips the item under an in-flight drag. Correct here — the box
does not change during a gesture in this sub-project. Sub-project 2 is what makes
it change, and it will have to extend that guard from the coordinates to the box.

### 8. An image is clickable when there is something to open — REVISED 2026-08-25

**The original decision was wrong on its premise and harmful in its remedy.** It
read: *"an image element has no implicit subject — `entity` drives `state_image`,
it is not what the item is about. More-info on nothing is not a default, it is an
accident."* From that it made an absent `tap_action` mean inert, and gave such an
item `pointer-events: none`.

**The premise is false, and Home Assistant says so.** `handleAction`'s more-info
branch, read out of frontend build `20260729.6`:

```js
const target = action.entity || config.entity || config.camera_image || config.image_entity;
target ? fireEvent(el, "hass-more-info", { entityId: target })
       : showToast(el, { message: localize("…actions.no_entity_more_info") });
```

An image element has **three** possible subjects, tried in that order, and HA
falls back to the camera and the image entity itself. Where none resolves, it
already shows a visible failure rather than doing nothing silently.

**The remedy was worse than the problem it solved.** `pointer-events: none` was
meant to stop a large image swallowing clicks meant for the icons underneath it.
But an opaque image already hides those icons: letting clicks through does not
restore them, it makes them clickable *unseen* — a pointer cursor appears over a
picture, belonging to something the user cannot identify. Reported in use, and
the honest summary is that it traded "I cannot click what I can see" for "I click
what I cannot see". The first is a property worth having.

**What now holds:**

- An image is clickable when it carries an explicit action, or when there is a
  subject for the default one — `entity`, `camera_image` or `image_entity`. That
  is HA's own list, not ours to invent.
- The `clickable` attribute, and with it the pointer cursor, follows that.
- **No `pointer-events: none`, ever.** An image without an action is simply not
  interactive: default cursor, and it covers what it covers.
- The form must not promise what will not happen: the image kind carries its own
  interactions schema with `default_action: "none"`, where the icon's says
  `more-info`. `default_action` is what the selector *displays* for an absent
  value, and for an icon that display is truthful.

**What this gives up, knowingly:** a PNG with a transparent hole cannot let
clicks reach what is behind it. For HTML content CSS defines only
`pointer-events: auto | none` — the pixel-testing values are SVG-only, and an
SVG loaded through `<img>` is a replaced box whose interior is not interactive.
The only real route is `clip-path`, which does affect hit-testing but needs the
shape written out; it is recorded as a follow-up rather than guessed at here.

**Stacking is DOM order, and the item list's reordering already controls it.**
That is what makes an image *under* the icons reachable, with no new property,
and it is worth saying in the README: it is the non-obvious half of the feature.

### 9. An image element with no image must still be visible while editing

An image with no source draws nothing. A `state-icon` with no entity is not in
that position — HA's `state-badge` draws its own missing-entity marker. A freshly
added image element would be invisible and impossible to grab.

`picture-studio-image` draws a **dashed placeholder box while `editing` and
sourceless**, and nothing at all otherwise. Not decoration: it is what makes the
item selectable between being added and being configured. It is also what a
broken URL degrades to, so a bad path never becomes an ungrabbable item.

### 10. Unticking keep-ratio writes the height the item already has

Otherwise the box jumps at the moment the checkbox is cleared, because `height`
goes from absent to some default.

The measurement comes from the preview through the existing `CardChannel` — the
route `reanchor` already uses to ask the card a geometric question the editor
cannot answer. This is the one non-trivial piece of the form, and it retires with
the form at sub-project 2 (decision 13).

### 11. `element-form.ts` is split by kind before the third kind lands

605 lines, branching eight times on `isLabel ? … : …`. A third kind turns each of
those into a three-way ternary, in a file sub-project 2 will come straight back
to.

Extract the per-kind body into modules behind a small interface —
`toFormData` / `fromFormData` / `render` — leaving `PictureStudioElementForm` as
the shell: header, dispatch, and the `ha-form` plumbing shared by all kinds.

The same step generalises `form-schemas.ts`. `backgroundSchema`, `entitySchema`,
`filtersSchema` and above all `mergeBackground` are typed against
`PictureStudioConfig` and return one; the image element needs them over an
element config. That is the real cost of reusing the card's own sections, and it
is worth paying once rather than duplicating four schemas.

**This is the largest risk in the plan and gets its own step**, behaviour
unchanged, with the existing 839-line `element-form.test.ts` as the net. It is in
scope because it is the file the feature modifies — not unrelated refactoring.

### 12. The cold first frame is documented, not engineered around

An earlier draft hid the item until its image loaded, gating on `img.complete`.
That gate is gone with the `<img>`: we no longer own it, and `hui-image`'s
`_lastImageHeight` is private.

**The spike measured what is actually left**, and it is much less than feared:

- **Rebuild after a gesture commit — nothing.** A warm remount is correct on
  frame 0. This is the case that mattered, since Home Assistant destroys and
  rebuilds the card element on every config change, and the drag commits once per
  gesture. It does not happen.
- **Genuinely cold first load — one frame, keep-ratio only.** `hui-image` applies
  `.ratio` while `_lastImageHeight` is undefined, reserving a **16:9** box. With
  a height set, our box is definite and does not move; the image is merely blank
  for that frame. Without one, the host takes the 16:9 height, the anchor
  translate uses it, and the item settles with a small jump.

Left as it is, on purpose. Our own `<img>` would draw *nothing* in that same
frame, so the alternative is not visibly better; a `ResizeObserver` watching for
the placeholder to give way is machinery around a component we chose not to
control; and the defect is one frame, once per card load, in one of two modes.

Recorded here so it is a known limit rather than a later surprise, and so the
measurement does not have to be redone to reopen it.

### 13. The box fields are scaffolding, and the convention is suspended, not revised

`width`, `height` and the keep-ratio checkbox appear in the form **and are meant
to be removed at sub-project 2**, when handles replace them.

This repo's standing convention is that geometry is not form surface. Follow-up 9
states it: *"the drag is the sole way to set `position`, and the config form
deliberately does not expose `top`/`left` as fields."* Fields for `width` and
`height` create exactly that asymmetry, backwards.

They are accepted anyway, for one release, because the alternative is an image
element that cannot be sized from the editor at all until sub-project 2 lands.
The exception is temporary and is written here so that a later reader does not
mistake it for a change of policy.

**Consequence for accessibility, which must not be lost in the trade.** Follow-up
9 owes a keyboard path for the drag, and says its shape is a nudge committing
through the same `onCommit` the gesture uses. When sub-project 2 removes these
fields it removes the only non-pointer way to size an image — so the keyboard
path has to cover *resize as well as move*, and that is a single design, not two.

### 14. `entity` and `image_entity` are two different keys

They read alike and mean opposite things, in a form that shows both:

- **`image_entity`** *is* the image — an `image` or `camera` domain entity whose
  picture is drawn. It shares the synthetic `picture_entity` field with
  `camera_image`, exactly as the card's Background section does.
- **`entity`** is the entity whose **state** selects an entry from `state_image`
  and `state_filter`. It draws nothing by itself.

The card already carries both, in two different sections, and the image element
inherits that arrangement rather than inventing a clearer one — a form that
disagrees with the card's own would be worse than one that is merely subtle.

### 15. Hybrid cases warn in the editor, never at runtime

A dynamic background — `state_image` or a camera on the **card** — can change the
background's aspect ratio. `.layer` then scales by different factors on its two
axes, so an item's box stops being similar to itself and a distortion shears
relative to whatever it was made to fit (see forward compatibility).

Nothing can be done about it mechanically. It gets said, in the editor, where
someone can act — never as a runtime toast, which would reach dashboard readers
who cannot fix it and would not know what it meant.

The idiom exists at three levels and is already wired: `itemsSeverity(items)`
aggregates `"error" | "warning" | undefined` and the Items section header carries
the badge; the item's row carries its own marker; the form carries an
`<ha-alert alert-type="warning">`. And `items.ts` states the invariant — *"the row
marker and the form's warning must never disagree"* — so a new case is **one
predicate feeding both**, never two messages.

## Config shape

```yaml
- type: element
  position: { top: 50, left: 50 }
  anchor: auto
  config:
    type: image
    # Content
    image: /local/floorplan/sofa.png       # or the media selector's object
    dark_mode_image: /local/floorplan/sofa-dark.png
    image_entity: image.front_door         # or camera_image + camera_view
    # Entity — the state that selects among the maps below
    entity: binary_sensor.garage
    state_image: { "on": /local/open.png, "off": /local/closed.png }
    state_filter: { "off": grayscale(100%) }
    # Filters
    filter: brightness(0.9)
    dark_mode_filter: brightness(0.7)
    # Size — scaffolding fields, see decision 13
    width: 40          # % of the background's width; omitted at its default
    height: 25         # % of the background's height; omitted ⇒ keep ratio
    # Interactions
    tap_action: { action: more-info }
```

```ts
export interface ImageElementConfig {
  type: "image";
  /** A path, or the object the media selector stores. Unwrapped by imagePath(). */
  image?: ImageSource;
  dark_mode_image?: ImageSource;
  /** The entity that IS the image; resolved by us, see decision 2. */
  image_entity?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  /** The entity whose STATE selects from the maps below. See decision 14. */
  entity?: string;
  state_image?: Record<string, string>;
  state_filter?: Record<string, string>;
  filter?: string;
  dark_mode_filter?: string;
  /** % of the background's width. Always present in memory, defaulted. */
  width: number;
  /** % of the background's height. Absent is the keep-ratio mode. */
  height?: number;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
```

**No `aspect_ratio`, and it is not an omission.** It is the last entry of
`backgroundSchema` and it contradicts the box head-on: given one, `hui-image`
builds its `.ratio` container — `height: 0` plus a padding box — which defeats the
height we impose. The two cannot coexist, so the image element takes
`backgroundSchema` **minus that line**.

**Normalization.** `width` and `height` go through `parsePercent`, which
deliberately does **not** bound its result — the rule positions follow, for the
reason decision 5 gives. The one guard is `> 0`: a zero or negative box is not a
value, it is a broken element. `height` is kept only when it parses; anything else
leaves it absent, which is the keep-ratio mode. Everything else travels unchecked,
as `normalizeElementConfig` already documents at length.

**Storage.** Both omitted at their default, as `size` already is, and `...rest`
carried through untouched.

`DEFAULT_IMAGE_WIDTH = 20` — a fifth of the background, large enough to see and
grab, small enough not to cover what is already placed.

## Rendering

A new element `picture-studio-image`, tag constant `IMAGE_TAG` beside `ICON_TAG`
and `LABEL_TAG` in `config.ts`, and a third branch in `_createChild`.

Its shadow root holds one `<hui-image>`, given: `hass`, `image` (resolved per
decision 2), `darkModeImage`, `cameraImage`, `cameraView`, `entity`, `stateImage`,
`filter`, `darkModeFilter`, `stateFilter`, `title`, and **`fitMode`** — the one
`hui-image-element` never passes and the reason this element exists.

Guarded by a lazy `customElements.get("hui-image")` at render, with a documented
fallback, per decision 2.

The box is written by `_applyPositions` onto the wrapper (decision 7). The
element's own styles keep the chain unbroken: `:host { display: block; width:
100%; height: 100% }` and the same on the `<hui-image>`.

## Editor

- `ELEMENT_KINDS` gains `"image"` — "added here and nowhere else", as its own
  comment promises. `elementCatalog` and `stubElementConfig` follow from it.
- `icons.ts` gains `"image": "mdi:image-outline"`.
- `stubElementConfig("image")` returns `{ type: "image", width: DEFAULT_IMAGE_WIDTH }`.
  No source: decision 9's placeholder is what makes that state usable.

The form, after the split of decision 11, reusing the card's own sections and
their existing strings (`section_filters`, `section_entity`, `picture_entity` —
already written in English and French):

| Section | Fields |
| --- | --- |
| **Content** | `image`, `dark_mode_image`, the `picture_entity` picker (→ `image_entity` / `camera_image`), `camera_view` when the pick is a camera. **No `aspect_ratio`.** |
| **Entity** | `entity`, `state_image`, `state_filter` |
| **Filters** | `filter`, `dark_mode_filter` |
| **Size and position** | the anchor picker, `width`, the `keep_ratio` checkbox (derived: `height === undefined`), `height` when it is cleared |
| **Interactions** | `tap_action`, `hold_action`, `double_tap_action` |
| **Visibility** | unchanged, shared by every kind |

No Appearance section: no chrome and no halo on an image (decision 16).

`state_image` and `state_filter` use the `object` selector, which renders
`ha-yaml-editor` — the card already decided these maps are written as YAML, and
the image element does not relitigate it. No custom widget is needed.

## Strings

The kind's own label costs nothing (decision 1), and the four section titles
already exist.

Every other label resolves the way `elementFormLabel` already resolves them:
Home Assistant's key when one exists, ours when it does not. **Which of `width`
and `height` have an HA key is not assumed here** — it is looked up against the
build named in the plan, and each miss becomes an English/French pair. The
keep-ratio checkbox and its helper are ours for certain: the concept is this
card's.

## Testing and verification

**happy-dom**

- `config.test.ts` — normalization of `width`/`height` (number, string with `%`,
  absent, zero, negative, non-finite); the `storedConfig` round trip, including
  that an absent height stays absent and that every passthrough key survives.
- `element-catalog.test.ts` — the third kind is offered; its stub.
- a new `card/image-element.test.ts` — the properties handed to `hui-image`,
  `image_entity` resolution including the no-token case, `fitMode` by mode, the
  placeholder appearing only while editing and sourceless, and the
  `customElements.get` fallback.
- `element-form.test.ts` — **unchanged behaviour across the split of decision 11
  is the acceptance criterion for that step**, then the image form's own cases:
  clearing keep-ratio writes a height, ticking it removes the key, `aspect_ratio`
  is not offered.

**Playwright** — an image element renders at the expected box in both modes, and
a 1:10 banner in keep-ratio mode is bounded to the background's height by
decision 5's clamp instead of growing five times past it.

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
`matrix3d(…)` with the origin at zero. They cannot share a node.

The matrix goes on **`picture-studio-image`'s host**; the wrapper keeps the
anchor's translate. That the repository already holds this invariant is worth
knowing — `item-styles.ts` puts the hover `scale(1.08)` on the element host and
says why: *"the card's wrapper carries translate(…) and must not be touched."* The
constraint is not new, it is old and was decided for the same reason. The host is
free here only because an image has no hover transform; were one ever added, the
matrix moves to a node inside the shadow root, which is ours.

Not a layout argument: transforms never participate in layout. That is exactly
why the constraint has to be written down rather than discovered by something
visibly breaking.

Two consequences in our favour: hit-testing follows the transform, so a distorted
item stays grabbable on its visible quadrilateral and the existing drag and
selection work on it unchanged; and the untransformed box remains the anchor's
reference, which is what keeps "move the item" and "move a corner" from meaning
the same thing.

### The corners are fractions of the box — this is what survives a resize

Store the distortion as four corner offsets **relative to** the `width`/`height`
box, as fractions. Not as absolute points, and **never as the matrix itself**.

The weak reason: a distorted item would otherwise have no box, `width` and
`height` would be dead keys, and removing the distortion would restore nothing.

**The strong reason:** the background keeps its aspect ratio (`width: 100%`,
height auto), so a card resize multiplies `.layer` by a single factor `k` on both
axes. Everything in `%` follows for free. A homography does not: to make the
scaled result equal the scaled original you need `H' = S·H·S⁻¹`, which you get
**automatically** by re-deriving from the corners, and **wrong** by storing the
matrix.

So: derive the matrix at render, from the corners and the current box. Always.

### `matrix3d` translations are pixels, so a `ResizeObserver` is required

CSS accepts no percentage inside a matrix function; the translation components
are numbers interpreted as px. A matrix written once therefore does **not**
rescale when the window changes: the rest of the item follows, the distortion does
not, and the image peels off whatever it was fitted to.

Sub-project 3 needs a `ResizeObserver` on the box that re-derives the matrix.
**There is none anywhere in this repository today** — it is a new mechanism, not
an idiom to copy.

Note the blast radius, because it is an argument against a tempting
simplification. Expressing *everything* through the matrix — width and height
included — was considered and refused: it would make every image element
pixel-driven and observer-dependent, where box-plus-matrix leaves position and
size declarative in `%` and needs the observer only for items actually distorted.
It would also destroy `height: auto`, leave nothing to fall back to when the
distortion is removed, turn two form numbers into eight corner numbers, and risk
a blurry raster where the layout box is smaller than the drawn result. Every
design tool that offers distortion — Figma, Photoshop, Canva — keeps a box and a
transform relative to it.

### Handles are computed from the transform, not read off the box

The distortion handles sit on the quadrilateral's corners, which are not the
box's. CSS exposes no "transformed layout box", so they are computed — and the
browser does it for us:

```js
const m = new DOMMatrix(getComputedStyle(el).transform);
const corner = m.transformPoint({ x: w, y: h });
```

### Sub-projects 2 and 3 bound their gestures, never the model

By decision 5's three channels: a resize handle and a distortion corner are
channel 1, bounded in their controllers exactly as the drag already is.

**The temptation will be to clamp `width` to 100 in the normalizer.** It must be
refused: it would contradict the rule positions have followed since 1.2.0, and it
would rewrite a user's YAML on the first commit after they opened the editor.

The gesture shape is already written, in `drag-layer.ts`, and should be copied
rather than reinvented: switch to plain pixels at `pointerdown`, write pixels on
every `pointermove` with no commit at all, convert back to `%` and commit once at
release. One rebuild per gesture, at the moment the eye is least likely to catch
a frame.

## Out of scope

### 16. No chrome and no halo on an image element

The chrome record and the halo are absent. They dress a glyph; an image is its own
appearance. The day one of them is asked for, it is asked for with a use case.

Also out: any direct-manipulation resize, which is sub-project 2, and the
distortion, which is sub-project 3.

## Versioning

`1.6.0`, on the `next` line. `package.json` carries `1.6.0-beta.N`; the changelog
heading stays `## 1.6.0 — unreleased` until the line ships as a stable from
`main`.

The `CHANGELOG` entry goes under **`Added`**. It says what the element does — an
image, a camera or an entity's picture, placed and sized anywhere on the
background — and it says the two things a user would otherwise discover the hard
way: that depth is controlled by the item list's order, and that `aspect_ratio`
is the one background key an image element does not take, because it has a size
of its own.
