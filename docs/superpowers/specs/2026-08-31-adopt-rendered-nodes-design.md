# adopting the previous card's rendered nodes — design

Date: 2026-08-31 · Target release: 1.6.0 (pre-release line `next`)

## Goal

Stop the card's pictures disappearing for two frames every time a config change
is committed while the card is being edited.

## The defect, measured rather than reasoned

Captured with a CDP screencast of a real mouse drag, correlated with a
`requestAnimationFrame` DOM probe on the same clock. At the two blank painted
frames the DOM says: background present, layer at its full 549 px, `<img>` with
its `src` **and** `naturalWidth: 1500`.

**The layout is correct, the image is loaded, and the screen is empty.** The
browser composites a frame before it has rasterised the subtree it has just been
handed.

**Two cheaper remedies were tried first and both are dead**, recorded so they are
not spent again:

- a detached, already-decoded `new Image()` held per URL — 3 blank frames
  instead of 2;
- forcing `decoding="sync"` on every `<img>` as it is inserted, through a
  MutationObserver crossing the shadow roots — still 2.

Neither could work: both act on decoding, and decoding is not the problem.

**And a probe that mattered exposed a trap:** `img.complete` is `true` for an
`<img>` with no `src` at all. An earlier reading concluded "the image is loaded"
from it and moved on. Only `naturalWidth` answers that question.

## Why the card is rebuilt at all

`hui-card.update()`, read from frontend build `20260729.6`, chunk `79381`:

```js
this.config?.type !== previous?.type || this.preview
  ? this._loadElement(this.config)    // createCardElement: a new element
  : this._updateElement(this.config); // setConfig on the existing one
```

So a card is rebuilt when its **type** changes, or whenever **`preview`** is set.
Measured against a live dashboard: `preview` is false there, a config change of
the same type leaves the same node in place, and only a type change replaces it.

`PictureStudioCard._inEditPreview` is the authority on what `preview` means —
it is set on **every card of a dashboard in edit mode**, not only on the dialog's
preview. Nothing here restates it.

**The upstream fix exists and is not this.** `_updateElement` is
`this._element.setConfig(t)` with no error handling, while `_loadElement` wraps
`createCardElement` in a try/catch that falls back to an error card — which is
almost certainly why a preview is rebuilt rather than updated: a config being
typed is invalid half the time. Giving `_updateElement` the same fallback would
let a preview reuse its element, and would fix this for every custom card with a
picture in it. Worth filing; it does not help anyone before it ships.

## Decisions

### 1. The card adopts its predecessor's rendered nodes

A rebuilt card re-attaches the nodes the previous one had already rendered
instead of building new ones. **Their rasterisation survives**, which is the
measurement the whole design rests on: detached for 400 ms and re-attached into
a **fresh shadow root on a fresh host** — the faithful shape of a successor
adopting them — the first painted frame, 9 ms later, is complete. Run twice,
once within the same shadow root and once across; same answer. The probe is
`.scratchpad/reattach.mjs` and it touches no production code.

### 2. The holder is keyed by the `hui-card` ancestor

A `WeakMap<Element, Stash>` at module level.

**`hui-card` survives the rebuild** — it is what calls `createCardElement` and
appends the result to itself — and our element is its **direct child**, because
`hui-card` renders in light DOM (`createRenderRoot(){return this}`). So it is an
exact identity across the rebuild, with nothing to compute and nothing to guard.

**A single unkeyed slot was the first design and it was wrong**, on the premise
that a preview holds one card. `preview` is set on every card of a dashboard in
edit mode, so several picture-studio cards can be in that state at once. The
correction hands over a better key than the one it cost: what a config-derived
token would have had to approximate, the DOM already states.

**`WeakMap`, so eviction is free.** When the `hui-card` goes, its stash goes with
it. There is no policy to write and none to get wrong.

### 3. The key is captured on connect, never on disconnect

`disconnectedCallback` runs **after** removal, so `parentElement` is already
`null` there. The `hui-card` ancestor is found and held at `connectedCallback`,
and the stash is written under it at `disconnectedCallback`.

### 4. The stash carries the parallel state, not only the nodes

`_syncItems` rebuilds children whenever the shape of the item list changed and
otherwise pushes config into the instances in place. Handing it nodes without
the arrays it indexes by would make it rebuild them anyway, and the adoption
would buy nothing.

So the stash holds `_bgElement`, the item wrappers, `_elements`, `_probes`, and
**the shape token `_syncItems` already computes**. On adoption the arrays are
restored and the existing sync runs unchanged — which is, precisely, the
`setConfig` `hui-card` refuses to give a preview.

### 5. Adoption is refused when the shape token differs

A stash from a differently-shaped item list is discarded and the card builds
normally. `_syncItems` would rebuild the children in that case anyway; refusing
early keeps one rule in one place rather than two that must agree.

**This is necessary and may not be sufficient**, and that is the open risk of
this design: two configs of the same shape but different items would adopt the
same nodes. The existing sync then pushes the right config into them, so it
should converge — **and a test that fails without the adoption is what settles
it, not this paragraph.**

### 6. The live camera is the trap this design cannot yet price

A detached `hui-image` receives its own `disconnectedCallback`. If it stops a
camera stream there and restarts it on reconnection, adoption buys back the
reload it exists to avoid.

**Not measured**: the dashboard's camera has no working stream, so the fixture
this line has cannot answer it. It must be checked against a real stream before
the branch closes, and if the stream does restart, a live camera is excluded
from adoption rather than the design being bent around it.

## Testing and verification

happy-dom carries the wiring: that a successor adopts, that it refuses a stash
whose shape token differs, that the arrays are restored so `_syncItems` does not
rebuild, and that a card with no stash builds normally.

**Every new test is run against the current code and seen to fail.** On this line
that rule has caught four tests that could not vary, two of them in the last two
days.

**The browser lane cannot answer the question this branch exists for.** Whether
the pictures are painted is settled by the CDP screencast of a real mouse drag —
`.scratchpad/screencast.mjs` — and by nothing else. Synthetic pointer events do
not drive the drag layer at all, and a programmatic `patchPosition` rebuilds the
card without reproducing the flicker. **Only trusted input does.** The branch is
not done until that capture shows the pictures present in every painted frame.

## Out of scope

- **The upstream `_updateElement` fallback.** Worth filing, not this branch.
- **Adoption on a dashboard that is not being edited.** Nothing is rebuilt there;
  there is nothing to adopt.

## Versioning

`1.6.0`, on the `next` line. No bump unless asked. The `CHANGELOG` entry extends
the one this line already carries about the picture jumping, which currently ends
by saying the picture can still take a moment to appear — that sentence is what
this branch removes.
