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

**Scheduled 2026-08-20: this is the next session**, together with a review pass
over `README.md` and `CHANGELOG.md` — the user named all three at the close.

**Displaced 2026-08-21**: that session became the browser-test session (entry 2c)
instead. `README.md` and `CHANGELOG.md` were touched only where the new test lane
made them wrong — a Prerequisites line, a `### Tests` section, two CHANGELOG
bullets. **The full doc review and the screenshots are still owed**, and they
still come before the bump.

## 2. Badges in the card header — designed, not yet planned

**Asked 2026-08-19 at the close of 1.4.0; brainstormed the same day.** The
feasibility spike is done and the draft spec is
`docs/superpowers/specs/2026-08-19-card-heading-design.md`. This entry stays here
only until that spec is agreed and turned into a plan.

**The wall this entry was parked on does not exist.** `hui-heading-badge` is
defined by the Lovelace panel's own chunk group, so it is available to us
unconditionally — the reasoning and the proof are in the spec and, for the
durable half, in `mem:picture-studio/state`. There was **never** a fallback plan
to put *ordinary* badges in the header; an earlier version of this entry said so
and the user corrected it.

Settled on 2026-08-19: `--ha-font-size-xl` (20px) for the title, behind our own
variables; no `tap_action` on the header; config moves to
`heading: { title, icon, badges }` with a silent `title` → `heading.title`
migration at normalization; `DragScrollController` and the overflow mask both
skipped at the first pass.

**What is left to settle** — the list at the end of the spec, in short: the title
weight (400 or 500) and the icon size that follows, the header's own padding now
that `ha-card`'s no longer applies, whether "Card config" should keep writing to
two places, the fate of a stored `heading_style`, and whether the header sits
above or below the image. All of them want an eye, not an argument.

## 2b. Watch the upstream error-badge fix, in two hops

**Filed 2026-08-21 and already assigned:**
https://github.com/home-assistant/frontend/issues/53721 — `create-badge-element`
lists `error` in `ALWAYS_LOADED_TYPES` without statically importing
`hui-error-badge`, so the public factory throws for `type: "error"` on a cold
dashboard. Our workaround is `_primeErrorBadge` in `src/card/picture-studio-card.ts`.

**The card benefits the moment a user's frontend carries the fix** — the guard
reads `customElements.get`, so it simply stops firing. Nothing to release, nothing
to configure. What needs watching is only the *deletion* of the dead code, and it
takes two hops, because the frontend and Home Assistant ship on different clocks:

1. **Which frontend release closes it.** The frontend repo tags `YYYYMMDD.N`; the
   closing PR's milestone, or the tag the merge lands in, gives it.
2. **Which core release carries that frontend.** Core pins it as a Python
   dependency — `home-assistant-frontend==YYYYMMDD.N` in
   `homeassistant/package_constraints.txt` (also visible in `requirements_all.txt`).
   The first core release whose pin is that build or later is the real floor.

**One console line per refused badge, and the placement is what guarantees it.**
The verdict is reported beside the badge on the path that actually draws it, not
beside the guard: a cold dashboard runs `_createChild` twice for the same item —
once to refuse and prime, once after the class lands — and only the second pass
draws. Reported by the refusal rather than by `_primeErrorBadge`, because the
refusal is permanent and that method is not. **The accepted cost:** a badge that
can never be drawn, because the chunk never arrives, is never reported either.
(A review on 2026-08-21 accepted the double line as harmless; the user asked for
one, and it was moved the same day.)

Only then: raise the card's minimum Home Assistant (see the auto-memory
`raising-the-ha-floor-is-cheap`) and delete `_primeErrorBadge`,
`_awaitingErrorBadge` and `PRIMING_TYPE` in one commit. The console line for a
refused badge is **not** part of that deletion — it moved into the refusal itself
on 2026-08-21 precisely so it would survive.

Our current floor is HA 2026.6.0, frontend 20260527.4. The container runs
20260729.6.

### Raised by the 2026-08-21 review, and both settled the same day

- **`isConnected` in `_primeErrorBadge`'s `whenDefined` callback — DONE.** `_layer`
  reads `this.renderRoot`, which outlives a removal, so a card taken out of the
  document rebuilt itself and wrote its console line when the class landed. The
  callback now returns early when disconnected, clearing the flag first so a card
  put back arms a fresh subscription on the next `_createChild`.
- **`console.error` inside the `try` — LEFT WHERE IT IS, on purpose, and do not
  reopen it.** The review proposed lifting it above the `try` so that what is drawn
  would not depend on a reporting call. Measured rather than argued, with a
  throwaway test that makes `console.error` throw: from **above** the try the throw
  escapes `_createChild`, aborts the `forEach` in `_syncItems` and leaves the whole
  card empty; from **inside**, the `catch` contains it to one item. The suggestion
  enlarges the blast radius it means to remove. The reasoning is in the file, next
  to the call. Neither case is reachable in a browser — `console.error` does not
  throw there.

**The lesson, and it is the project's oldest one:** a review finding can be right
about the mechanism and wrong about the remedy. This one correctly identified that
drawing depended on a logging call, and proposed a fix that made the failure
worse. Measure the remedy, not just the diagnosis.

## 2c. Real-browser tests — BUILT 2026-08-21; what is left is narrower

**The lane exists.** rstest browser mode, real Chromium, `src/tests/playwright/`,
alongside `src/tests/happy-dom/`. The durable half — how it is wired, the harness
traps, what it can and cannot prove — is in `mem:picture-studio/state`: see the
two-lane bullet under "How we work" and the **amended trap 3**. Do not re-derive
it, and do not re-open the choice of runner: rstest's own browser mode was
confirmed to work, one `pnpm test` still runs both lanes.

It covers placement under all ten anchors, `reanchor`, the whole drag gesture,
and computed styles. The 1.3.0 chromeless-circle bug was reproduced deliberately
and the lane went red on it — the gap that motivated the whole thing is closed
for that class of defect.

**What was NOT decided, because the session never needed it, and what is
therefore still open:**

- **It never touches the real Home Assistant.** The lane mounts our components
  with stubbed HA elements of known size. So the docker-compose instance, the
  test dashboard's three views and the authentication question (a long-lived
  token in `.ha/`) are all still untouched — and still the obvious next step if
  the panel-versus-sections difference is ever to be automated.
- **CI: not attempted.** Chromium is a dev dependency today, installed by the
  devcontainer's post-create. Nothing runs this lane on a push.
- **Which walks it retires: not enumerated.** The honest answer needs the user,
  since only they know what they actually look at. What can be said is that
  shape, size, placement and the drag gesture now have automated coverage, and
  themes, view types and HA's own rendering do not.
- **Screenshot comparison was never built** and was not needed. Geometry and
  computed styles carried every assertion, which is the outcome the original
  entry hoped for — baselines drift with every HA update, numbers do not.

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

## 8. The config form, redrawn — designed, schema still open

**Asked 2026-08-19, designed 2026-08-20.** Everything that was parked here is
now in `docs/superpowers/specs/2026-08-20-config-form-design.md`, which also
absorbed the background findings that used to live in this entry: the filter
concatenation, the `grayscale(100%)` sting, the resolution order, the four
failure shapes, and the README line about `person` that cannot be kept.

Settled: five sections — **Background** (open), **Items**, **Heading**,
**Filters**, **Entity**. One image-or-camera entity field, two keys in storage,
the selector authoritative, its dispatch clearing the sibling key. **No alert**,
on the rule that an alert without a remedy in the interface is a reproach.
`fit_mode` forbidden, `theme` unreachable, `aspect_ratio` YAML-only,
`entity`/`state_image`/`state_filter`/`filter` all kept.

**What is left is the schema**, and it is the whole of it: how five sections map
onto `ha-form` instances when two of them hold components rather than fields,
how `heading.*` is flattened and folded back, how the merged entity field is
expressed, and how `camera_view` becomes conditional. That is where the next
session starts.

Also still open, and cheap: section 5's title and the merged field's label, both
ours to write in `src/strings.ts`.
