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

## 8. One kind still falls back to the icon, in two places

**Raised by the 1.4.0 final whole-branch review, shipped deliberately.** The
config tidy-up removed the implicit "anything that is not a state-label is a
state-icon" from `_dispatch` and `_createChild`. Two siblings still carry it:
`_toData` in `element-form.ts`, and the identical inline ternary in that file's
`render()` which feeds `.data` to `ha-form`.

Unreachable today — `normalizeElementConfig` raises on an unknown kind before
anything reaches them — and harmless even if it were reached, because `_dispatch`
now no-ops for an unknown kind, so garbled icon-shaped data would be built and
discarded rather than stored. The reviewer's verdict was ship, and the ruling
that parked it is recorded in the branch's history.

The fix is the same two-leg `if / else if` the other two sites now use, in one
cleanup commit. **Do it the day a third element kind is designed, and before it
is written** — that is the day all four sites stop being unreachable at once.

---

## 9. `_createChild` returning undefined misaligns the card's child arrays

**Raised by the same review, shipped for the same reason.** Task 6 gave
`_createChild` an `undefined` return for an unknown kind. Its caller returns
early without pushing, so `_elements` and `_wrappers` stop being index-aligned
with `_config.items`: with items A, B, C and B unknown, `_elements` is `[A, C]`,
and the flag or wrapper meant for C lands on nothing while B's index reaches C.

The `if (child)` and `if (!wrapper) return` guards stop it crashing, not
misrouting. Unreachable today for the same reason as follow-up 8, and it becomes
reachable on the same day — so the two are one piece of work. Push a
placeholder rather than skipping, or filter the items list once and iterate the
filtered pairs.
