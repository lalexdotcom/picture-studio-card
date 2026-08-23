# Where the editor scrolls, and when it must not — design

Status: **built**, 2026-08-22/23, on the `editor-scroll` branch — `git log main..editor-scroll`
is the record. Delivered under 1.5.3, which is open and unreleased. Designed with
the user on 2026-08-22, at the end of the session that fixed the drag jump.

The card's editor moves the reader's view at several moments. Some of those
moves are wanted and some are not, and until now the difference was decided by
one call — `scrollIntoView` — that cannot tell them apart. This settles which
container scrolls, on which trigger, and replaces that call with explicit writes.

## What changes for someone configuring the card

- Tapping an item **on the picture** no longer throws the picture off the screen.
  The image stays where it is; the form beside or under it changes.
- Tapping an item **in the list** still takes you to the top of its form, which
  is where you are already looking.
- Dragging an item moves nothing but the item. *(Already true — shipped in the
  tree, see §6.)*

## 1. The two scroll containers, and why there are two

Measured in Home Assistant's own source
(`src/panels/lovelace/editor/card-editor/hui-dialog-edit-card.ts`), and
corroborated by a trace taken on a real iPhone.

The dialog wraps the form in `<div class="element-editor ha-scrollbar">`, and
`ha-scrollbar` (`src/resources/styles.ts`) declares `overflow-y: auto`. **That
container is always scrollable in law.** Whether it scrolls in fact depends on
its parent:

```css
.content { display: flex; flex-direction: column; }        /* default */

@media (min-width: 1000px) {
  .content { flex-direction: row; max-height: calc(100vh - 209px); }
}
```

- **Below 1000px** — column, no height cap. `.content` grows with its content, so
  `.element-editor` never overflows and never scrolls. The **dialog** carries the
  scroll of the whole thing, preview included.
- **At 1000px and above** — row, height capped. Flex stretches the children to
  the capped height, so `.element-editor` overflows and becomes **the form's own
  scroller**, with the preview beside it, unmoving.

The phone trace shows exactly this: `cands: div[auto;549/549] div[auto;1087/641]`
— the first is `.element-editor`, declared scrollable, 549 of content in 549 of
box, therefore inert; the second is the dialog's, 1087 in 641, which is what
actually moves.

**The general rule this rests on:** `overflow` says what to do *if* a box
overflows; a height constraint is what makes it overflow. An `overflow: auto`
with nothing bounding its height is inert.

**Consequence for the code, and it is not optional.** The two containers must be
found by *different* criteria, or above 1000px the same element answers to both
roles and the two intentions fight:

- **the form's container** = the nearest ancestor whose computed `overflow-y` is
  `auto` or `scroll`, overflowing or not — `.element-editor`, in both modes;
- **the dialog's container** = the nearest ancestor **above that one** that
  actually overflows.

There is no media query on our side, ever. The layout decides; we only ask what
it decided.

**Both walks follow the flattened tree** — `assignedSlot ?? parentNode`, hopping
hosts at shadow boundaries. The editor is distributed into a slot by the dialog,
so `parentNode` alone walks past the real container and lands on `html`. This
cost two full rounds of measurement; `_layoutAncestors()` in the editor already
does it.

## 2. The rules

| Trigger | Form's container | Dialog's container |
|---|---|---|
| A form **opens from the list** — a row clicked, Add | to the start | to the start |
| A form **opens from the picture** | to the start | **held** |
| **No form opens** — item in error, back, a deletion, a reorder | its row into view | **held** |
| **No selection change** — a field edit, a drag committing | — | **held** |

**This table replaces the one written above, and it is shorter for a reason.**
Settled with the user on 2026-08-22, before the build.

The third row said "per the origin", which was under-specified, and two further
rows were then tried, giving a deletion and a drag behaviours of their own. Both
were symptoms of asking the wrong question. The right one is not *where did the
call come from* but **does a form open because the reader asked for it in the
list?** — and it is asked in one branch only.

Everything follows from that:

- **The form's container is written unconditionally**, its target set by the
  trigger alone. Below 1000px the write is inert, so it costs nothing; above it,
  that container is the only one that moves.
- **The dialog's container is held unconditionally**, with that single exception.
  Above 1000px holding is inert, so it costs nothing there either. Neither side
  ever asks which mode it is in.
- **Deleting an item and reordering the list carry a *list* origin** — the ✕ and
  the drag handle are in the list — but no form opens, so nothing follows, and
  "delete an item and nothing scrolls" falls out rather than needing a case.
- **"Nothing" is not a behaviour**, it is "held" with a delta of zero. A drag
  alters coordinates only, so the correction computes to 0 at runtime. §3 already
  said this of the mechanism; the table now says it too.

## 3. One mechanism, not two

The user's call, and it is right: the drag is simply the case where the delta is
zero. Do not keep a branch for it.

1. **Before the change** — record the preview's top, measured against the
   dialog container's own box.
2. **During** — two reservations keep the target position reachable (§4).
3. **After the content has settled** — measure the preview's top again and
   correct `scrollTop` by the difference.

**The anchor is the preview, not the editor, and that is the load-bearing
choice.** An earlier attempt anchored on the editor and did active harm: the
editor still exists while the card is being rebuilt, so it yielded a number —
a wrong one, +838px, landing the reader at 995 instead of 157. The preview does
*not* exist during the rebuild, and its absence is itself the signal that the
layout is not ready. Hence:

> While the preview cannot be measured, hold the absolute value. As soon as it
> can, correct by the delta.

No detection of the rebuild is needed for this: it falls out of the anchor's own
availability.

**"Settled" already has a definition in the tree** and it should be reused:
the rebuilt preview has registered with the broker **and** the container's height
has stayed put for `STABLE_FRAMES` consecutive frames. Registration alone is a
frame too early — the card registers, then lays out and moves the document again.

## 4. The two reservations, and they are symmetric

Neither is a nicety: without them the browser clamps the scroll before anything
can be corrected, and the correction then has nothing left to restore.

- **The card reserves the outgoing preview's height on its successor.**
  *Already written and committed* — §6.
- **The editor reserves its outgoing form's height while the next one renders.**
  Written in `_reserveHeight`, committed in the `editor-scroll` branch.

Sizing: "taller than the viewport" is a generous approximation that works. The
exact condition is narrower and easier to hold — the target position must remain
reachable, i.e. the container must stay at least `target scrollTop + visible
height` tall. Reserving the outgoing height covers it in the only problematic
case, which is a shorter successor.

**Measure the outer box, margins included** — `getBoundingClientRect().height`
plus the computed vertical margins. `offsetHeight` counts padding and borders and
*not* margins; reserving it left the successor short by exactly the missing gap,
26px, which the layout reclaimed a frame later by pushing everything below back
down. That was a whole round of measurement.

## 5. What is replaced

The three `scrollIntoView` calls go, and with them the reason the intentions were
inseparable: that call scrolls **every** ancestor container, so it could never
serve one container without serving the other.

| Today | Becomes |
|---|---|
| `updated()` → `this.scrollIntoView({block:"start"})` | explicit writes on one or both containers, per the origin |
| `_showListAt` → `list.scrollToItem(i)` → `row.scrollIntoView({block:"nearest"})` | a scroll **within the form's container only** |
| `_holdScroll` | folded into the single mechanism of §3 |

`select()` must learn where the call came from. The distinction is already
material: the card reaches the editor through the broker, the list through a DOM
event. An explicit origin is better than inferring it.

## 6. Already in the tree, uncommitted or committed

Committed on 2026-08-22, and this spec builds on them rather than replacing them:

- `_holdScroll` and `_scrollContainer` / `_layoutAncestors` in the editor.
- `lastPreviewHeight` and the successor's reservation in the card.
- `HOLD_MAX_FRAMES`, `STABLE_FRAMES`, `RESERVE_FRAMES`.
- Their tests, each confronted with the defect it names.

The work went into 1.5.3, which remains open (unreleased) as of 2026-08-23.

## 7. What must not be retried

Four hypotheses died on measurement during the session that produced this spec.
They are written up as traps 11 to 14 of `mem:picture-studio/state`; the short
form:

- **A probe must not occupy the layout it measures.** A `position: sticky`
  diagnostic strip gained a line as its own text grew and manufactured ~12px of
  the very movement being hunted.
- **`parentNode` walks the logical tree; layout follows the flattened one.**
- **Prove a fix is running before believing a negative result.** The height
  reservation was delivered twice and was inert both times —
  `disconnectedCallback` fires after detachment, where `offsetHeight` reads 0.
  Two rounds were spent concluding "the remedy does not work" when the truth was
  "the remedy never ran".
- **`offsetHeight` excludes margins.**

And one about the instrument: **a build marker proves which bundle is loaded, and
nothing about whether the code did anything.** Both are worth having, and they
are not the same check.

## 8. Tests, and their ceiling

happy-dom lays nothing out, so every test here has to *declare* its geometry —
heights, rects, margins — as the committed ones already do. They guard the
mechanism, never the pixels.

The pixels belong to a real WebKit, and there is no lane for that: the browser
lane is Chromium, which never reproduced any of this. **Whatever is built from
this spec has to be confirmed on a real iPhone before it is called done**, and
the instrument for that is a temporary on-card overlay — the companion app gives
no console.
