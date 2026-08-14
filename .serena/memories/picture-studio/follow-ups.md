# picture-studio — follow-ups

What is parked, not what is done. `picture-studio/state` describes the card as it
stands; this file holds what has been asked for and not yet designed. An entry
here is a starting point for a brainstorm, never a decision already taken.

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
it would be a config migration.

---

## 2. What 1.3.0's browser walk did not exercise

Both were reasoned about rather than observed, and both would be cheap to check
the next time the card is open in a browser.

- **The `auto` fill under a custom theme.** Only the default theme was walked, so
  `var(--ha-card-background, …)` has never been seen resolving to anything but
  #fff / #1c1c1c. A theme with a translucent or strongly tinted card background
  is the interesting case: the chrome would inherit it, which is the intent, but
  nobody has looked.
- **A sections view.** Still never walked, in any version — see entry 3.

---

## 3. Parked from the visibility session (2026-08-14)

Neither blocks anything; both are worth a minute if the area is reopened.

- **The item list is our own markup, not `ha-md-list` / `ha-md-list-item`.** It
  copies their geometry exactly. The real components were rejected because
  nothing proves their chunks are loaded by *our* dialog, and an undefined
  custom element renders nothing at all, silently — the whole list would vanish
  rather than degrade. If that availability is ever proven, the swap is direct.
- **The browser walk covered a panel view only.** A sections view has never been
  exercised, so the `view_columns` context path — the Lit context resolving up
  through our shadow root — is reasoned about rather than observed. Same for the
  fallback when `hui-card-visibility-editor` is undefined, which needs a
  frontend that does not load its chunk.

---

## 4. Small things noticed and left alone

- **The hover grow with a chrome.** `transform: scale(1.04)` on the host now
  scales a filled disc rather than a glyph. Looked at on a real dashboard and
  kept — the user's impression that it was off-centre did not survive a second
  look. If it is ever revisited, the alternative already sketched is to drop the
  scale when a chrome is on and brighten the fill instead, which is what Home
  Assistant's own tiles and badges do.
- **A 1px border on the chrome was considered and rejected on sight.** The
  filter's white rim already draws that line and follows the real silhouette.
  The layout is prepared for one if it is ever wanted: `box-sizing: border-box`
  means it would be drawn inward and shift nothing, and `getBoundingClientRect`
  is already a border box so the drag would count it with no code change. The
  spec's "Room left for a border" section records the verdict.
- **`storedConfig`'s `chrome && !isDefaultChrome(chrome)`** looks like a
  redundant guard and is not: `chrome` is optional on `StateIconConfig`, so the
  check is what narrows the type. Two reviewers have now flagged it; it is
  correct.
