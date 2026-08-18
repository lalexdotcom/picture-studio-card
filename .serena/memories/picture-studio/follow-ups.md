# picture-studio — follow-ups

**A todo list.** What is parked, not what is done: this file holds what has been
asked for and not yet designed, and an entry **leaves** it once it is settled. An
entry here is a starting point for a brainstorm, never a decision already taken.

Anything durable belongs in `picture-studio/state` instead — a verified fact about
Home Assistant, a decision not to re-litigate, a habit to keep across the whole
project. If an entry here would still be true and useful with nothing left to do,
it is in the wrong file.

Kept separate because the two age differently: the state file is rewritten as the
card changes, this one grows and empties.

---

## 1. The chrome, beyond icons

**Delivered in 1.3.0 for `state-icon` only.** The key is written to belong to an
*item* rather than to one kind of item — the README says so in as many words —
but only `state-icon` reads it today. Whatever element kind arrives next should
take it up rather than invent its own surface.

Nothing to design until there is a second element kind. The open question when
that day comes: does `chrome` move up beside `position` and `anchor` at item
level, or does each element kind keep reading it out of its own `config`? Today
it lives in `config` because that is where an element's own keys live, and moving
it would be a config migration — a real one since 1.3.0 shipped: dashboards in
the wild now carry `chrome` inside `config`, so any move has to keep reading the
old place.

---

## 2. The `auto` fill has never been seen under a custom theme

**Shipped unverified in 1.3.0.** Only the default theme was walked, so
`var(--ha-card-background, …)` has never been seen resolving to anything but
#fff / #1c1c1c. A theme with a translucent or strongly tinted card background is
the interesting case: the chrome would inherit it, which is the intent, but
nobody has looked. It is public now, so if it misbehaves it misbehaves for
users — cheap to settle the next time the card is open under a theme.

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

## 4. The hover, now that the grow has been rejected

**Reopened 2026-08-18, and no longer hypothetical.** `transform: scale(1.04)`
was kept in 1.3.0 on a second look. With a chrome on it, the user has now
looked again and decided it "ne colle pas bien" — they want a tinted fill on
hover instead, for both element kinds, and an alternative designed rather than
a value tweaked. Nothing is decided beyond that.

What is already established, so the next session starts from facts:

- **`ha-badge` has no `:hover` rule at all.** It uses a Material ripple:
  `--ha-ripple-color: var(--badge-color)`, `--ha-ripple-hover-opacity: .04`,
  `--ha-ripple-pressed-opacity: .12`. "The chosen colour, dimmed" is a **4%**
  veil of the badge's own colour, 12% when pressed.
- **The "dashboard only, not the editor" half needs no code.** The card already
  sets `.editing .item > * { pointer-events: none }`, so no hover reaches an
  element while editing, and the editor's own feedback is
  `.editing .item:hover { box-shadow: 0 0 0 4px rgba(primary, .35) }`.
- **A veil tinted by the entity's state is not available.** `state-badge`
  computes that colour inline and writes it onto an internal child; nothing is
  exposed. It is the same wall that made `state-label` offer no state colour at
  all. `currentColor` at 4%, behind a token a dashboard could override, was the
  proposal on the table when the session ended.
- **`interactionStyles` is still duplicated** in `state-icon-element.ts` and
  `state-label-element.ts` — the transition, the `clickable` cursor and the
  hover. Whatever replaces the scale is the moment to factor it into
  `src/card/item-styles.ts`, beside the fill and the halo that already live
  there.

Two questions were put to the user and not answered: does the tint **replace**
the scale when a chrome is present, or join it; and is `currentColor` an
acceptable veil given the state colour is out of reach.
