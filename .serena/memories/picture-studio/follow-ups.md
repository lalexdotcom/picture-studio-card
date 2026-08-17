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

## 4. What else does a view type change under our feet?

Opened by the badge outline of 1.3.1: `hui-panel-view` saves the theme's card
tokens under `--restore-card-*` and then zeroes `--ha-card-border-radius`,
`--ha-card-border-width` and `--ha-card-box-shadow` for **every** descendant, so
the instruction crossed our shadow DOM and reached the third-party badges we
host. HA's own container cards answer it with `:host([ispanel]) #root`; ours now
does the same on `.item`, and `hui-card` hands us the switch
(`this._element.isPanel = "panel" === this.layout`).

That was one instance of a shape, not a one-off: a view type redefines something
for everything below it, and our card relays foreign content in the middle. **Any
future element kind or nested container should be checked against it before it
ships.** The sweep that found this one, on the frontend in the container, is the
one to repeat on other tokens: `grep -roh -- "--ha-card-border-width:[^;}]*"`
over `frontend_latest/*.js` returned exactly two declarations and led straight to
the mechanism. `ispanel`, `layout` and `--restore-card-*` are the names to follow.

---

## 5. Small things noticed and left alone

- **The hover grow with a chrome.** `transform: scale(1.04)` on the host now
  scales a filled disc rather than a glyph. Looked at on a real dashboard and
  kept — the user's impression that it was off-centre did not survive a second
  look. If it is ever revisited, the alternative already sketched is to drop the
  scale when a chrome is on and brighten the fill instead, which is what Home
  Assistant's own tiles and badges do.
- **`storedConfig`'s `chrome && !isDefaultChrome(chrome)`** looks like a
  redundant guard and is not: `chrome` is optional on `StateIconConfig`, so the
  check is what narrows the type. Two reviewers have now flagged it; it is
  correct.
