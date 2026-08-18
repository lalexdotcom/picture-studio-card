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

## 7. Two defects found by the 1.4.0 branch review, not yet fixed

**Found 2026-08-18, both verified in the code, neither fixed — the user closed
the session on the report.** Both predate the day's work; they came in with the
state label.

- **A label writes `show_name: false` / `show_state: false` into the stored
  YAML.** `labelFromFormData` returns them as explicit booleans and
  `storedConfig` spreads them through `...rest` untouched, while `size`,
  `chrome` and `halo` are all filtered at their defaults. It breaks the rule the
  same function states three lines above — *the default is the absence of the
  key* — and it grows a line in every label a user ever opens. The fix belongs
  beside `if (halo) config.halo = true`.

- **The `displayed_elements` options are unlocalized.**
  `options: ["name", "state"].map((value) => ({ value, label: value }))` in
  `state-label-form.ts` puts the raw lowercase English values on screen, inside a
  form where every other control is localized. Home Assistant's own strings exist
  and resolve at our floor: `ui.panel.lovelace.editor.card.generic.show_name`
  ("Afficher le nom") and `…show_state` ("Afficher l'état") — checked in the
  container's French `lovelace` fragment.
