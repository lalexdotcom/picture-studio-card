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

## 1. The screenshots — they ship with 1.5.0

`docs/images/` still shows the card as it was before `state-label` existed. The
GIFs predate the second element kind, the new hover treatment, the item list
reading top-down, and every error row. The README leans on them heavily —
they are the first thing a visitor sees.

**Retargeted 2026-08-19: they ride with 1.5.0, not a 1.4.1.** So they are shot
*after* the header badges land (entry 2), not before — otherwise they would be
stale on arrival for the second time running. It needs no brainstorm, only
doing, and it is the last thing done before that release rather than the first.

Worth deciding while shooting them: whether an error row is worth showing at all,
or whether the happy path is the whole story a landing page should tell.

## 2. Badges in the card header

**Asked 2026-08-19, at the close of 1.4.0. Not designed.**

The idea: the card's header would carry badges of its own, and would appear when
*either* a `title` is set *or* at least one header badge exists — so the header
stops being a title-only affordance.

What the user sketched for the editor: take Home Assistant's own **heading card**
form, drop its title/subtitle choice, and use it in place of our current plain
`title` input. And render the result inside a frame like the one a defined `title`
already draws, with smaller text.

**The one thing to check before anything else.** Home Assistant has a distinct
**heading-badge** family — `hui-heading-badge` is a real tag, `"heading-badge"` is
a family string in the same creation machinery as `"badge"`, and it has its own
`hui-error-heading-badge`. But **no heading-badge factory is among
`loadCardHelpers`'s nine exports** (see the list in `mem:picture-studio/state`).
So the reuse this idea assumes may not be reachable at all. Two ways out, and
which one is viable decides the whole shape:

- create `hui-heading-badge` by tag ourselves, forcing its lazy load the way
  `resolveBadgeClass` does for a core badge — and inherit that dance's fragility;
- or put **ordinary** badges in the header, which we already know how to create,
  and accept that they will not look like Home Assistant's heading badges.

Settle that first: everything about the form, the framing and the text size is
downstream of it.

## 3. The chrome, beyond icons

**Settled in 1.4.0: it does NOT move to item level.** Each element kind reads
`chrome` out of its own `config`, and `state-label` took up the idea rather than
inventing its own surface — `IconChrome` and `LabelChrome` are different records
over one shared CSS module. Kept here only until the next reader needs it; the
decision itself lives in the state file.

## 4. The `auto` fill has never been seen under a custom theme

**Shipped unverified in 1.3.0, still unverified.** Only the default theme was
walked, so `var(--ha-card-background, …)` has never been seen resolving to
anything but #fff / #1c1c1c. A theme with a translucent or strongly tinted card
background is the interesting case: the chrome would inherit it, which is the
intent, but nobody has looked. It is public now, so if it misbehaves it
misbehaves for users — cheap to settle the next time the card is open under a
theme.

## 5. Parked from the visibility session (2026-08-14)

Neither blocks anything; both are worth a minute if the area is reopened.

- **The item list is our own markup, not `ha-md-list` / `ha-md-list-item`.** It
  copies their geometry exactly. The real components were rejected because
  nothing proves their chunks are loaded by *our* dialog, and an undefined
  custom element renders nothing at all, silently — the whole list would vanish
  rather than degrade. If that availability is ever proven, the swap is direct.
- **The fallback when `hui-card-visibility-editor` is undefined** has never been
  seen, and cannot be until a frontend that does not load its chunk is tried.
  Every frontend walked so far loads it.

## 6. The preview's condition marker could show the verdict, not just "conditional"

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

## 7. Two things left open by the unknown-item work (1.4.0)

Both are recorded rather than owed; neither blocks anything.

- **`GRACE_MS = 2000` in `badge-existence.ts` was left at Home Assistant's own
  figure.** It is paid only on a *negative* verdict, and only once per type per
  session — a badge that exists settles in milliseconds through `whenDefined`.
  The perceived slowness during the browser walk was HA's own error-badge hide
  restarting on every card rebuild, which the card now un-hides while `editing`.
  If it ever still feels long, this constant is the single tunable, and the trade
  is a false red on a slow cold load: going below HA's figure means our row says
  "missing" while the card beside it is still optimistically hiding.
- **Two of the four `_moveBadge` remap branches are exercised but not
  boundary-tested** — `sel` is never equal to `to`, nor to `from + 1`. The
  arithmetic was checked by hand against `moveItem`'s two splices by two
  reviewers. A future off-by-one at an inclusive endpoint would not be caught.
