# picture-studio — follow-ups

**A todo list.** What is parked, not what is done: this file holds what has been
asked for and not yet designed, and an entry **leaves** it once it is settled. An
entry here is a starting point for a brainstorm, never a decision already taken.

Anything durable belongs in `mem:picture-studio/state` instead — a verified fact
about Home Assistant, a decision not to re-litigate, a habit to keep across the
whole project. If an entry here would still be true and useful with nothing left
to do, it is in the wrong file.

Kept separate because the two age differently: the state file is rewritten as the
card changes, this one grows and empties.

---

## 1. The chrome, beyond icons

**Settled in 1.4.0: it does NOT move to item level.** Each element kind reads
`chrome` out of its own `config`, and `state-label` took up the idea rather than
inventing its own surface — `IconChrome` and `LabelChrome` are different records
over one shared CSS module. Kept here only until the next reader needs it; the
decision itself lives in the state file.

---

## 2. The `auto` fill has never been seen under a custom theme

**Shipped unverified in 1.3.0, still unverified.** Only the default theme was
walked, so `var(--ha-card-background, …)` has never been seen resolving to
anything but #fff / #1c1c1c. A theme with a translucent or strongly tinted card
background is the interesting case: the chrome would inherit it, which is the
intent, but nobody has looked. It is public now, so if it misbehaves it
misbehaves for users — cheap to settle the next time the card is open under a
theme.

---

## 3. Parked from the visibility session (2026-08-14)

Neither blocks anything; both are worth a minute if the area is reopened.

- **The item list is our own markup, not `ha-md-list` / `ha-md-list-item`.** It
  copies their geometry exactly. The real components were rejected because
  nothing proves their chunks are loaded by *our* dialog, and an undefined
  custom element renders nothing at all, silently — the whole list would vanish
  rather than degrade. If that availability is ever proven, the swap is direct.
- **The fallback when `hui-card-visibility-editor` is undefined** has never been
  seen, and cannot be until a frontend that does not load its chunk is tried.
  Every frontend walked so far loads it.

---

## 4. ~~The per-tick doctrine was never applied to the elements~~ — DONE 2026-08-18

Raised and delivered the same day. `src/has-changed.ts` copies HA's own
`hasConfigOrEntityChanged`; both element kinds now render only when the config
or their own entity moved, and `updated(changed)` writes the config-only tokens
only on a config change. The lie that made the guard unwritable — a
`requestUpdate("_config")` inside the `hass` setter, on every tick — is gone:
`_hass` is a reactive state property. Kept here until the branch is committed,
then it leaves.

---

## 5. ~~`repeat` in the item list is keyed by the display index~~ — DONE 2026-08-18

Keyed by the array index instead — `this._flip(index)` — so an item added to the
end of the array leaves every other key where it was and only one row is built.
The test that guards it holds a row's DOM node across an insertion and asserts
the same node moved down: it was measured failing against the old key before
being kept.

---

## 6. ~~`will-change` and the antialiasing of a chromeless label~~ — CLOSED 2026-08-18

Looked at and **accepted**. The concern was that promoting every chromeless
clickable item to its own compositing layer costs subpixel text antialiasing, so
a chromeless label renders slightly softer, permanently. It does — and the user
judges the softer text an improvement rather than a defect. `will-change:
transform` stays on both kinds, and the grow keeps its smooth frames.

**Do not reopen this as a defect.** If it ever has to move, the trade is named:
text fidelity at rest against a pixel jump during the grow under `anchor: auto`.

---

## 7. ~~Two defects found by the 1.4.0 branch review~~ — DONE 2026-08-18

Both fixed on `feat/config-tidy-up`: the label's display keys became one `show`
list that storage omits at its default, and the four form labels now resolve
through Home Assistant's own entity-badge keys. Kept until the branch merges.

---

## 8 + 9. An unknown item is ignored, not raised — DESIGNED 2026-08-19, NOT BUILT

**The user's ruling, given 2026-08-19 and to be implemented in a fresh session:**
any item whose kind we cannot read is **ignored** — the card, the config layer and
the editor act as if it were not there — **but the YAML keeps it, untouched**. The
motivating case is a config pasted onto an installation running an older version.

This reverses "never ignore an unreadable item", and legitimately: that decision
refused ignoring **because it led to losing**, `storedConfig` rewriting the whole
config on the first drag. An item that survives normalization in an "unknown"
state and is written back verbatim loses nothing, so the objection dissolves.

**Scope correction, established before designing.** A badge whose custom type is
not loaded does NOT raise today and must not be touched: a badge's `config` is
opaque, so it reaches `createBadgeElement`, and Home Assistant's `_customCreate`
renders an error badge *and* waits on `customElements.whenDefined(tag)` to fire
`ll-rebuild` — the badge repairs itself the moment its JS arrives. Ignoring it
would replace a self-healing path with permanent silence. Only two things raise,
and only they are in scope: an item-level `type` that is neither `badge` nor
`element`, and an element's `config.type` that is neither `state-icon` nor
`state-label`.

**What the design has to carry:**

- `PictureItem` gains a third state holding the raw entry, and `storedConfig`
  re-emits it **verbatim** — including its position, which must NOT be normalized
  on the way through, or a `top: 30` would come back `top: "30%"` on an item we
  claim not to understand.
- The items array then contains entries with no child, which is exactly the
  `_createChild` misalignment of the old follow-up 9. **That fix is no longer
  optional — it is the precondition.** Push a placeholder rather than skipping,
  or filter once and iterate the filtered pairs.
- The two ternaries of the old follow-up 8 (`_toData` and the inline one in
  `render()`, both in `element-form.ts`) go at the same time: with the raise
  removed, they stop being unreachable.
- Losing the raise loses the diagnostic. Today an unknown kind produces a Lovelace
  error card naming the item and the valid types. After this, a typo like
  `state-lable` vanishes with no feedback at all.

**The one question left open, and it is the user's to answer:** does the editor's
item list keep a row for an unknown item — non-editable, naming the type it could
not read, and deletable — or does the item disappear everywhere? The controller
recommended keeping the row: the viewer sees nothing wrong, the person configuring
sees exactly what is wrong and can remove it, and without a row the only way to
delete it is hand-editing YAML.

Everything above is design, not code. Nothing was written. The next session
should settle that question, write a spec, then plan.

## 10. The preview's condition marker could show the verdict, not just "conditional"

**Asked 2026-08-19, deferred with the reason written down.** The marker drawn on
a conditional item in the edit preview is `.item.conditional` — a CSS mask over
an inlined `mdi:eye`, in `--psc-marker-glyph`. It says *this item has
conditions*. The Visibility section's header now says *and right now it is
hidden*, with Home Assistant's own vocabulary: `mdi:eye` / `mdi:eye-off` /
`mdi:alert-circle` on `--success-color` / `--warning-color` / `--error-color`.
The question was whether the preview should speak the same language.

**Swapping the glyph is trivial** — it is already a CSS variable, three states
means three classes. **The cost is that the preview has no verdict at all**, by
an explicit decision recorded in `picture-studio-card.ts`: no probe is created
while editing, because the marker only ever claimed "has conditions" and that is
where the drag layer is already heaviest.

Two ways to get one, and the second is better:

- **Revive the probes while editing** — a whole `hui-card` plus a phantom card
  per conditional item. Heavier, and `hui-card` does not re-evaluate on a config
  change, so a verdict would lag while the user edits the very conditions it
  reports.
- **One `ha-visibility-status` oracle per conditional item**, the mechanism the
  section header now uses. Lighter, and it re-evaluates on a conditions change.
  But its `state` is a plain property — no event, no reflection — so N instances
  need a controller: a table keyed by item, a read after each `updateComplete`, a
  comparison, and the guard against the read→render→read loop. Roughly a hundred
  lines with its own tests, against twenty for the single-instance header.

**If it is ever built, build it asymmetric.** "Visible" is the normal case and
deserves no ink on a photograph: a floorplan speckled with green pills is noise
added to the frequent case. Keep today's eye for "conditional", and change the
glyph and colour only for `hidden` and `invalid` — the two states worth stopping
for. The same argument applies to the item list, where the question was asked
first.

