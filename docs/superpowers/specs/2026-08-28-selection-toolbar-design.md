# selection toolbar — design

Date: 2026-08-28 · Target release: 1.6.0 (pre-release line `next`)

## Goal

Give the editor's preview a **toolbar**, docked in the card between the heading
and the picture, carrying what a selected item's geometry needs and what the
corners are about to need: the anchor, a way back to keep-ratio, and the tool
picker that says what a corner drag means.

**This is sub-project 3 of the image line**, opened by the image element spec
(2026-08-24) and anticipated by the resize spec (2026-08-26) decisions 1 and 6.
It was originally written as "the toolbar **and** the free four-corner
distortion". It is split here, and the split is decision 11: the distortion
becomes sub-project 4, and this spec ships its tool as a real no-op rather than
as a stub that lies.

**Nothing here writes a new config key.** Every commit goes through
`patchAnchor` and `patchBox`, which exist. The tool choice is editor state and
never reaches the config at all (decision 13).

## Decisions

### 1. Docked between the heading and `.root`, never floating

The card renders `ha-card` → `picture-studio-heading` (optional) → `.root` →
`.background` + `.layer`. The toolbar is a **sibling of `.root`**, so it is
outside the size container: `.root` declares `container-type: inline-size` and
every element's clamp is written in `cqw` against it. A toolbar inside it would
change what a percentage means. Outside it, `cqw`, `.layer`'s geometry and
`measureImageHeight` are all untouched.

Two arrangements were weighed and refused:

- **Floating, pinned to the selected item.** It cannot leave the card:
  `ha-card` is `overflow-x: hidden; overflow-y: auto`, so for an item near the
  top edge the bar has nowhere to go and needs flipping logic. It occludes
  exactly the region being worked on, and it must either re-position on every
  frame of a drag or vanish during the gesture — a control that hides when it is
  used.
- **A band overlaid on the bottom of the picture.** No height cost and no
  re-positioning, but it permanently hides a strip of the subject, and the
  subject is what is being adjusted.

**The objection the resize spec raised against a docked strip no longer holds.**
Decision 1 there refused *"a permanently-present strip holding one disabled
button"*. This strip holds the anchor, which every item has — badges included —
so it is never inert.

**It costs nothing on a dashboard.** `editing` is true only inside the edit
dialog's own preview (`_inEditPreview`). No viewer ever pays for these pixels.

### 2. Two poles, and the anchor holds the origin

```
┌────────────────────────────────────────────────┐
│ [✦ auto] [⊞ anchored] │ (picker)  [🔓 keep-ratio]│
└────────────────────────────────────────────────┘
```

The anchor group comes **first**, and this is not a taste. It is the only group
present for every item and every state, so its width is constant — which is what
makes everything after it appear at a fixed `x`. A right-aligned anchor would be
just as stable, but it would put the invariant at the end and let the variable
part own the origin.

**The separator is drawn only when the tools group is not empty.** For a badge,
an icon or a label there are no corners, so the bar reduces to the anchor group
and a lone rule would hang off it.

### 3. Present for the whole session, disabled rather than absent

While editing, the toolbar is always rendered at the same height. With nothing
selected, or an item of type `unknown`, its controls are disabled.

The alternative — appearing on selection — spends no space when idle and costs a
**vertical shift of the picture at the exact moment the user is aiming at an
item**. The jump is the worse defect. The height is also constant across a
commit, so `lastPreviewHeight`'s reservation covers it with no change: it
measures the whole element.

### 4. The anchor group is `auto` and `anchored`, and `anchored` is a disclosure

| Button | Shows | Does |
| --- | --- | --- |
| `auto` | a magic wand | `patchAnchor(index, "auto")` |
| `anchored` | a 3×3 miniature, current cell lit — no cell lit under `auto` | opens the modal picker |

The two read as a segmented pair, but only the first is a switch. **Nothing
remembers the previous fixed point** — `auto` replaced the value and it is gone —
so pressing `anchored` from `auto` writes nothing: it opens the picker, and
**choosing a cell is the commit**. The input already behaves this way and says
so: its cells stay live while `auto` is on, because clicking one is how you leave
that mode.

`anchored` rather than `fixed`, so the toolbar and the form use one word for one
thing; the input's `.fixed` class is renamed with it, since that code is moving
anyway.

**The write is `patchAnchor` and nothing else.** It already asks the card to
`reanchor` before committing, and sends anchor and position in a single write —
two commits would render the new anchor against the old coordinates for a frame.

### 5. The miniature is a display derived from `ANCHOR_OFFSETS`, not the input

The first design mounted the input component inside the button at a small size.
Refused: it would need adapted spacing, its border suppressed because the button
has one, its cells made unclickable — branches inside a component that exists to
be an *input*, serving a place that only displays.

**What must not diverge is the data, and it does not.** `ANCHOR_OFFSETS` in
`position.ts` defines the nine points and their row-major order; the input
derives its cells from it (`CELLS = Object.keys(ANCHOR_OFFSETS)`) and the
miniature walks the same list — nine spans in a 3×3 grid, in the toolbar's own
shadow root, no border, no buttons, no focus. Neither declares the ordering, so
neither can drift from it.

### 6. `picture-studio-anchor-input` is extracted, with two consumers

`picture-studio-anchor-picker` is today the whole form row: an `ha-formfield`
holding a switch labelled "Automatic", an `<hr>`, and an `ha-formfield` holding
the label "Anchored" and the grid. The grid alone moves to
**`picture-studio-anchor-input`**, with an optional `label` property: given one,
it wraps itself in the `ha-formfield` (and claims the `margin-inline-end: 10px`
that exists only to imitate HA's slotted spacing, so that too is conditional);
given none, it renders bare.

`-input` rather than `-grid`, which names the drawing rather than the job, and
rather than `-control`, which would imply kinship with HA's `ha-control-*`
family it does not belong to. The contrast is the point: an input, against a
miniature that only displays.

The picker then becomes what it describes — switch, separator, input — and emits
the same `anchor-changed` event from the same place. **The three forms
(badge, image, state-label) change in no way**, which their existing tests prove
by passing unchanged.

### 7. The picker opens in a modal `<dialog>`, not in a `popover`

The requirement is that a click outside dismisses the picker and **reaches
nothing**. The native `popover` light-dismiss does not do that: the outside
`pointerdown` closes the popover *and* still lands on whatever is beneath it.

`showModal()` gives the whole requirement at once — the rest of the editor is
inert, `::backdrop` swallows the click, a click whose target is the `<dialog>`
element itself is the standard "clicked the backdrop" test, and Escape closes.
The focus moves into the input, whose nine cells are already `<button>`s.

It is in the **top layer**, so it is above Home Assistant's own dialog and is
never clipped by `ha-card`'s overflow — the same mechanical constraint that
refused a floating toolbar in decision 1. Position is computed from the
`anchored` button's rect: `position: fixed`, `margin: 0`, instead of the
centring a modal dialog does by default.

### 8. A tool is an object; the card becomes a switchboard

```ts
interface Tool {
  id: ToolId;
  /** Reconciles handles and state from fresh config. Inert during its own gesture. */
  render(target: { element: HTMLElement; index: number } | undefined): void;
  attach(root: HTMLElement): void;
  detach(): void;
  /** Single owner of the hit test for its own handles. */
  hit(target: EventTarget | null): ToolHit | undefined;
}
```

`resize-tool` wraps the shipped controller and **takes over creating the
handles**, today done in `_createChild` — along with the size guard in
`resize-box.ts`, which is a property of the resize gesture and not of the card.
`distort-tool` implements the four methods as no-ops.

**The inertness of a tool that does nothing is structural, not coded.** Nothing
downstream carries a special case: no handles are drawn, so no pointer can land
on one, so no gesture starts, so nothing commits. The alternative considered —
a class on `.root` suppressing the handle CSS — works, and hides the fact that
the mode is empty behind a rule that says it is full.

**Moving is not a tool.** It always applies and is not in the picker, so
`drag-layer` stays outside this abstraction. Its `isHandle` delegates to the
active tool's `hit()`, which preserves the invariant already written at
`_hitHandle` — *"one owner, consulted by both gesture controllers"* — while
changing who the owner is.

### 9. A tool receives `{ element, index }`, and never an item

The shipped controller takes `getAnchor(index)`, `getPosition(index)`,
`getConfig(index)` — **functions**, because Home Assistant destroys and rebuilds
the card element on every config commit and a snapshot is stale from the first
one. Those accessors move to the tool unchanged; only the target is passed
per-selection.

`index` is derivable from `element.dataset.index`, and is passed anyway: it is
already the shape of `ResizeHit`, and it saves a parse at every use.

### 10. `render` is the single reconciliation point, and the config is one of its inputs

A tool's behaviour depends on the config, not only on the gesture: the anchor
decides the fixed point, and a forced ratio decides which handles exist at all.
So `render(target)` is called on **three** events — the selection changes, the
active tool changes, and **the config changes**. `updated()` already tells
`changed.has("_config")` apart from a `hass` tick, so handles are not rebuilt on
every entity update.

**It must not rebuild during a live gesture.** The tool owns its controller, so
it knows whether its own gesture is running and abstains — the same invariant
`_gestureIndex()` enforces for `_applyPositions`, held where the answer is known
rather than asked back of the card.

### 11. The distort tool ships, as a no-op that does not lie

The picker renders both entries from this delivery. Choosing `distort` toggles
the button and **removes the handles**; the item stays draggable exactly as it is
under `resize`.

This is honest rather than decorative: the corners genuinely belong to the
distortion in that mode, and the distortion is not here yet, so nothing is drawn
and nothing claims to act. It is also how the picker gets exercised — in tests
and in a browser — before sub-project 4 fills it in. What that sub-project then
has to do is implement four methods behind a boundary that has already been
proven by a tool that does nothing.

### 12. The picker switches what the **corners** do, and `move` is not an entry

Two entries: `resize` and `distort`. Dragging the body always moves, so moving
is not a tool anyone chooses. Side handles, when they arrive, are never governed
by the picker either — they resize, always, which is what leaves the corners
entirely available to the distortion.

Reset to `resize` whenever the selection changes.

### 13. The tool lives in the editor, not on the card

The instinct is to keep it on the card, beside the gesture controllers. It would
be wrong: Home Assistant rebuilds the card element on **every** config commit —
*"nothing a card remembers survives a commit"* — so the choice would be lost
after every resize and every move, which is precisely when it is in use.

It lives in the editor, next to `selectedIndex`, for the same reason and by the
same route: `EditorChannel` gains `tool()` / `setTool()`, `_syncEditing()`
mirrors it into a reactive property exactly as it mirrors the selection, and
decision 12's reset falls out of `select()` for free.

### 14. "Restore keep-ratio" is a button on the model, and there is no ratio padlock

One button, `mdi:lock-reset`, enabled when a `height` exists and the ratio is
not forced. The glyph is the one thing in the bar that says the item is going
back to a state rather than into one. It calls `patchBox(index, box)` **with the
`height` key omitted** — the channel's contract
is explicit and the trap is one word wide: *"`box` carries `height` by its
presence… this must never write `height: undefined`"*.

It duplicates the form's keep-ratio checkbox in one direction only, which is the
same duplication decision 4 accepts for the anchor: the form keeps its control,
the toolbar spares a trip back into it.

**A persistent ratio padlock was designed and dropped**, and it is recorded here
so it is not reinvented. It was to be the touch channel for free resize, since
SHIFT does not exist on a tablet. Two things sank it: a toggle *engraves* a
decision for the next gesture where SHIFT decides *during* it and forgets, which
is worse ergonomics for the same job; and the premise was false, because resize
decision 14 kept the form's `width`/`height` fields for exactly the users a
pointer gesture does not serve. The channel it was meant to open is the **side
handles**, which are an amendment to the resize spec, independent of this one in
both directions, and written up in `mem:picture-studio/1.6.0-handoff`.

A second simplification was refused: folding the padlock and the restore button
into a single keep-ratio toggle whose "off" state makes the gesture free by
default. Resize decision 3 says the locked ratio is the box's ratio at
`pointerdown` in **both** states, with its reason — *"the stretch is a decision,
not an accident"* — and an image deliberately stretched to 4:3 must survive being
made bigger.

### 15. As Home Assistant as possible, at a size we choose

**Tokens with fallback chains, never raw values.** The form's input already shows
the shape and the reason:
`var(--ha-switch-border-color, var(--ha-color-border-neutral-normal, var(--divider-color)))`
— the middle token is absent from the theme at our minimum Home Assistant
version, and the last link is what keeps the appearance identical there. A theme
that restyles Lovelace moves the toolbar with it.

**Icons are named, not inlined.** `ha-icon` with an `mdi:` name; HA serves the
whole set with its own lazy loading and cache. A name shared by more than one
component goes in `editor/icons.ts`, a name used once stays at its call site.

**What may be relied on.** The toolbar exists only while the editor is mounted,
so it may use what the editor already uses — `ha-icon`, `ha-icon-button`.
`ha-control-select` stays out, for the reason already written in the anchor
picker: it lives in a lazily loaded chunk and a custom card cannot rely on the
tag being defined.

**Deviating from HA's scale is allowed and is justified on site.** The precedent
is `--grid-padding: 2px` with its comment — *"Not an `--ha-space-*` token: HA's
scale starts at 4px, and at this size the frame reads as a border rather than as
spacing."* `ha-icon-button`'s default is HA's 48px touch target, and a 48px strip
above the picture in an already-crowded dialog is expensive. It shrinks, and the
comment says why; a bare number is not acceptable.

Sizing knobs are `--psc-toolbar-*` with fallbacks, on the model of
`var(--psc-handle-size, 10px)`.

**The figures are measured, not chosen.** The most expensive lesson of this line
is three green-and-wrong verifications in a row. A legibility-against-footprint
ratio is settled in a browser with the spike harness and a screenshot. And the
trade has three axes, not two: below 48px the bar gains room and loses touch
target, on a card that is used on tablets.

## Data flow

| Control | Call |
| --- | --- |
| `auto`, or a cell in the picker | `activeEditor()?.patchAnchor(index, anchor)` |
| Restore keep-ratio | `activeEditor()?.patchBox(index, box)`, `height` key omitted |
| Tool | `activeEditor()?.setTool(tool)` — never touches the config |

Inputs are all present already: `editing` and `selected` are reactive properties
kept by `_syncEditing()`, the item is `this._config.items[selected]`, and
`ratioIsForced(config)` answers the live-camera case.

## Edge cases, all mandatory

- **`unknown` items** — everything disabled, the anchor included. `config.ts`
  keeps those entries verbatim, *"never normalized — not its position, not its
  anchor"*, and writing an anchor onto one would corrupt the only thing the card
  promises not to touch.
- **Nothing selected** — everything disabled, widths unchanged (decision 3).
- **`ratioIsForced`** — restore keep-ratio disabled; there is nothing to restore.
- **No `activeEditor()`** — controls inert. Unreachable while `editing` is true;
  the guard is free.

## Testing and verification

**happy-dom carries the render matrix**, which is most of what this component is:
kind × selection × forced ratio × presence of `height` → which controls exist,
which are disabled, whether the separator is drawn. Plus the outgoing calls and
their arguments, with a test dedicated to restore-keep-ratio **omitting** the key
rather than writing `undefined`.

**What must discriminate**, so a test is not green for the wrong reason:

- **a badge and an image in the same fixture** — the separator's absence is only
  observable on the item that has no tools;
- **a commit between two reads of the tool** — decision 13's whole reason. A test
  that never rebuilds the card cannot tell editor state from card state;
- **a config change with no selection change** — decision 10's third trigger,
  invisible if `render` is only ever exercised by selecting;
- **`distort` selected on an image that has handles under `resize`** — the no-op
  is only meaningful against a tool that draws.

**Non-regression of the extraction**: the existing `picture-studio-anchor-picker`
tests pass **unchanged**. That is the proof the three forms did not move, and it
costs nothing because it already exists.

**The browser lane takes what happy-dom cannot see** — it has no layout, which is
exactly what let an inoperative fix through on this line:

- the modal `<dialog>`: above HA's own dialog, a click outside closes it and
  reaches nothing, Escape closes;
- the toolbar disturbs neither `.root`'s container queries nor
  `measureImageHeight`;
- **the card's height is the same with and without a selection** — decision 3's
  claim, which exists only in a layout engine.

**Then a verification in real Home Assistant.** Sub-project 1 was reviewed, green
and ready to merge when a browser session found four more bugs. The setup traps
are already paid for once: bump `?v=N` in
`.ha/config/.storage/lovelace_resources` and restart the container; never
`rm -rf dist`, which kills the bind mount; a debug overlay mounts inside the
card's `.root`, not on `document.body`.

**The baseline.** Last measured 2026-08-26: 52 files, 1030 tests. The delivery's
full run updates it, with its date, in `mem:picture-studio/1.6.0-handoff`. A
scoped run never touches it.

## Out of scope

- **The distortion itself**, and the `ResizeObserver` its `matrix3d` requires —
  sub-project 4, which fills in `distort-tool`.
- **Side handles as the free-resize channel** — an amendment to the resize spec,
  independent of this work in both directions, on its own branch.
- **A keyboard path** — follow-up 9, which resize decision 14 names as the gate
  on removing the form's box fields. The modal picker's cells are reachable by
  keyboard because they were already buttons; that acquits nothing and adds no
  debt.
- **Removing the anchor from the forms.** Decision 4 keeps both surfaces
  deliberately.
- **Anything the toolbar might carry for a badge beyond the anchor.**

## Versioning

Lands on `next`, in the `1.6.0` section of `CHANGELOG.md`, under `Added`. Written
for someone configuring the card: a toolbar above the picture while editing,
carrying the anchor and a way back to proportional sizing; and, for an image, a
tool picker whose second entry — the distortion — arrives in a later
pre-release. The picker's present effect, that choosing it removes the handles,
is stated rather than left to be discovered.

No `package.json` bump belongs to this branch: a beta bump happens only when the
user asks for one.
