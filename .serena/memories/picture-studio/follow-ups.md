# picture-studio — follow-ups

**A todo list.** What is parked, not what is done: this file holds what has been
asked for and not yet designed. An entry here is a starting point for a
brainstorm, never a decision already taken.

Anything durable belongs in `mem:picture-studio/state` instead — a verified fact
about Home Assistant, a decision not to re-litigate, a habit to keep across the
whole project. If an entry here would still be true and useful with nothing left
to do, it is in the wrong file.

## How a settled entry is retired — changed 2026-08-21

**Strike the title through, keep the entry, never renumber.** An entry that is
done reads `## ~~4. Its title~~ — DONE <date>`, gains a short line saying what
closed it, and stays exactly where it is.

It used to be deleted outright. That cost more than it saved twice in one day:
numbering shifted under references written elsewhere, and entry 1 — the
screenshots — was *not* deleted when it was settled, so a later session read
"the screenshots are still owed", repeated it to the user, and was corrected by
the user rather than by the file. Striking through fails safe in both
directions: a stale entry is visibly closed rather than silently absent, and
"entry 7" means the same thing forever.

**Update this file as part of the delivery, not after it.** The trap is not
forgetting to write — it is writing the code, moving on, and leaving the memory
describing a project that no longer exists.

Kept separate from the state file because the two age differently: the state file
is rewritten as the card changes, this one accumulates and strikes through.

---

## ~~1. The screenshots — they ship with 1.5.0~~ — DONE 2026-08-21

**Closed by `97c5463`**, which retired `demo.gif` and `custom-badge.gif`, added
`dashboard.gif` and re-recorded `editor.gif`, all from the new pipeline in
`scripts/screenshot/` — see `mem:picture-studio/screenshots`. The same commit and
`593ab0a` carried the full README pass: the heading block, the five sections, the
CSS tokens moved to Theming, and two wrong claims about `tap_action` corrected.
The capture dashboard builds `state-icon`, `state-label` and a `heading`
(`capture-view.mjs`), so the GIFs show the 1.5.0 card, not its predecessor.

**This entry was the one that proved the rule above.** It stayed here after it
was settled, and the next session read it as still owed.

The original text follows, struck for the record.

### ~~Original entry~~

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

## ~~2. Badges in the card header — designed, not yet planned~~ — DONE 2026-08-20

**Shipped in 1.5.0.** `feat/card-heading` merged as `608ced7`; the header carries
a title, an icon and Home Assistant's own heading badges, with `heading.title` and
the silent `title` → `heading.title` migration. The six questions left open at the
end of the spec were settled during the build; the answers are in the code and in
`mem:picture-studio/state`, not here.

The original entry follows, struck for the record.

### ~~Original entry~~

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
- **~~CI: not attempted.~~ — DONE 2026-08-21, the hard way.** This entry was
  right and got tested by reality: the first push after the lane was added failed
  CI, which skipped the release. `pnpm test` runs both projects and the runner had
  no Chromium. `ci.yml` now installs it exactly as the devcontainer does, before
  lint. **The lesson is the entry itself** — a parked "nothing runs this on a
  push" is a bill that comes due at the next push, and a release was riding on
  that one.
- **Which walks it retires: not enumerated.** The honest answer needs the user,
  since only they know what they actually look at. **Carried into entry 11**,
  where it is the question that dimensions the whole thing. What can be said is that
  shape, size, placement and the drag gesture now have automated coverage, and
  themes, view types and HA's own rendering do not.
- **Screenshot comparison was never built** and was not needed. Geometry and
  computed styles carried every assertion, which is the outcome the original
  entry hoped for — baselines drift with every HA update, numbers do not.

## ~~3. The chrome, beyond icons~~ — SETTLED in 1.4.0

The decision lives in `mem:picture-studio/state`; the entry says so itself. Struck
rather than deleted so the numbering below it never moves.

### ~~Original entry~~

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

## ~~6. The preview's condition marker could show the verdict, not just "conditional"~~ — SETTLED, and it was already settled

**Closed 2026-08-21. The user pointed out this had been arbitrated more than
once and should not have been carried as open** — this entry was a reopening of a
question decided on 2026-08-14, which is exactly the failure mode a follow-up
file is supposed to prevent.

**The marker stays "this item has conditions".** The arguments are in
`docs/superpowers/specs/2026-08-14-item-visibility-design.md`, section "The
preview marker", and repeated at `_createProbe` in `picture-studio-card.ts`:

- **The live verdict already exists, where Home Assistant puts it** — the form's
  banner. A second, different answer to the same question in the editor is
  confusing, not helpful.
- **A static mark is the better affordance**: it does not flicker with entity
  state. A verdict on a photograph would change under the eyes of someone
  placing an item.
- The marker keys on `preview`, not `editing`, so it also shows on a dashboard in
  edit mode. `preview` is what makes Home Assistant hold every conditional item
  on screen, so the mark is there to explain *why they are all visible* — a
  verdict would be answering a different question.

Having no probe in the editor is the *consequence* of this, not its cause.

**If it is ever reopened, reopen the spec, not this entry.**

### ~~Original entry~~

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

## ~~8. The config form, redrawn — designed, schema still open~~ — DONE 2026-08-20

**Shipped in 1.5.0**, on the same branch as entry 2. The editor is the five
collapsible sections — Background, Items, Heading, Filters, Entity — the camera
and image entities are one field, and every setting that was YAML-only
(`entity`, `image_entity`, `state_image`, `aspect_ratio`, `filter`) is reachable.
The schema question this entry ended on is answered by the code.

The original entry follows, struck for the record.

### ~~Original entry~~

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

## 9. The drag has no keyboard alternative

**Raised by the 2026-08-21 codebase review, and parked deliberately — it is the
one finding of that pass that needs a design, not a patch.**

Positioning an item on the picture is pointer-only. `drag-layer.ts` listens for
`pointerdown` / `pointermove` / `pointerup` / `pointercancel` and nothing else:
no `keydown`, no `tabindex` on the wrappers, no role, no ARIA. Someone who
cannot use a pointer can add an item, configure it, and never place it.

**What does not cover it, and why the gap is easy to miss.** `ha-sortable` in the
item list gives keyboard reordering — but that is stacking order, not position on
the image. The Anchor picker sets which corner the coordinates are measured
from, not the coordinates. The drag is the sole way to set `position`, and the
config form deliberately does not expose `top`/`left` as fields.

**The obvious shape, and it is only a starting point:** make the selected
wrapper focusable, nudge it on the arrow keys, and commit through the same
`options.onCommit` the gesture already uses — so the percentage conversion, the
clamp and the marker corner all stay in one place. A larger step on Shift, and
Escape to abandon, would mirror what the pointer path already offers through
`pointercancel`.

**What wants deciding before any of that is written:**

- **The step.** Pixels are wrong — the card is sized in container-query units
  and the same nudge must mean the same thing on a phone and on a wall panel.
  `1cqw` is the natural unit but it is not obviously the right *amount*.
- **Edit mode only, or not.** The drag layer is only attached while `editing`.
  A keyboard path that exists solely in the editor is defensible and much
  smaller; one that works on a live dashboard is a different feature.
- **What takes focus.** The wrappers are built imperatively in `_syncItems` and
  carry no `tabindex` today. Making every item a tab stop on a photograph with
  twenty badges is its own usability problem — focus probably belongs to the
  selected item only, which ties this to the selection the editor already owns.
- **What to announce.** `role="application"` and a live region reading the new
  coordinates is one answer; `role="slider"` per axis with
  `aria-valuenow` is another and reads better to a screen reader, but it means
  two controls per item.

**There is now somewhere to test it.** `src/tests/happy-dom/card/drag-layer.test.ts`
was created in that same session and drives the controller directly with
synthetic pointer events — a keyboard path can be tested the same way, without
the browser lane.

**~~Note the pre-existing split while you are here~~ — fixed 2026-08-21.** The
predicates and the controller now share `src/tests/happy-dom/card/drag-layer.test.ts`,
one file for one module. A keyboard path can be driven there the same way the
pointer one is: synthetic events against a stubbed layout, no browser needed.

## ~~10. `picture-studio-editor.test.ts` fails the file when the file gets slower~~ — DONE 2026-08-21

**Closed by `c6f5f87`, and the diagnosis in the entry was wrong**, which is the
part worth keeping.

The symptom: several describes in that file end their `afterEach` by setting
`window.loadCardHelpers` back to `undefined`. Invisible while the file is quick —
the last renders they schedule never get a turn. Give the file any extra duration
and they do, and `probeBadgeType` reads that global **synchronously, from a
component update**, so it threw with no test on the stack: `failedFiles: 1` while
every test passed, and a non-zero exit. Proven with a describe whose only test was
`await new Promise(r => setTimeout(r, 300))` — six throws, file red.

**Five fixes were tried against the symptom and all five failed**, two of them by
breaking other tests: a benign stub in the new describe's hooks (no effect, the
strays come from earlier describes); the same stub in the outermost `afterEach`
(2 tests fail — with a stub that answers, probes settle, fire `requestUpdate`,
and the extra renders move other tests' `expand`/`scrollToItem` counts); that plus
`resetBadgeVerdicts()` (5 tests fail); a generation counter making an in-flight
probe a no-op after a reset (suite green, strays unchanged — cancellation is the
wrong lever when the failure is at the *call site*); an `isConnected` guard around
the probe (strays unchanged).

**What actually fixed it:** `probeBadgeType` now returns quietly when
`window.loadCardHelpers` is not a function. Every attempt above tried to guarantee
the global was *there*; the answer was to make the caller tolerate its absence.
No factory means no verdict, and no verdict is the honest answer rather than
"missing" — the row shows its type instead of being accused of being broken.

**The lesson, and it is the project's oldest one restated:** five fixes aimed at
the symptom, none at the mechanism. The instrumented run that finally named the
mechanism took one attempt.

The probe also left `render()` for `updated()` in the same commit — the review's
Best Practices axis asked for that on its own merits, and it is worth being clear
that **it fixed nothing here**.

## 11. A third test lane, against the real Home Assistant

**Asked 2026-08-21, deliberately not designed — the session ran short of context
and the user parked it for a fresh one.** It is architectural: a new subsystem,
authentication, a live instance, fixtures. It starts with a proper brainstorm,
not with code.

**The ask:** an idempotent bootstrap that creates a dedicated user if absent, a
hidden dashboard if absent, a sections view and a panel view, and cards with
fixtures — so that what the user has been validating by hand through every
browser walk becomes something a command re-runs.

### Most of the plumbing already exists — read it before designing anything

`scripts/screenshot/` solves the hard half already, and the next session should
start by reading it rather than inventing:

- **`ha-session.mjs`** runs the real login flow — `/auth/login_flow`, then
  `/auth/token` — and returns what the frontend keeps in `hassTokens`. No
  long-lived token to store, which is what entry 2c worried about. `seed()`
  writes it into `localStorage` before the first script runs, so the frontend
  never shows a login form.
- **`setup-capture-dashboard.mjs`** creates a dashboard **idempotently** through
  `hass.callWS` — `lovelace/dashboards/list`, then `create` only when absent,
  then `lovelace/config/save`. It already passes `show_in_sidebar: false`, which
  is the "hidden dashboard" half of the ask, and without `--force` an existing
  one is left untouched.

So the bootstrap pattern is proven against this very instance. What is missing is
the user, the second view type, the fixtures, and the assertions.

### The dedicated user is its own point, and it cuts both ways

**The screenshots currently log in as an existing user** — `HA_USER`/`HA_PASS`,
defaulting to `Card`/`card`. The tests must not do that: they need a user of
their own, created idempotently like the dashboard.

**And so, ideally, should the screenshots.** The user asked for the same
create-if-absent treatment there — same principle, same script family. That
makes this entry touch `scripts/screenshot/` as well, not only a new lane.

### The question that dimensions everything, still unanswered

Entry 2c already said it and it is still true: **which walks this retires has
never been enumerated, and only the user can say.** It decides the number of
fixtures, the runtime, and how fragile the lane is. Four candidates were drafted
while exploring, and they are worth putting back on the table:

- **Panel versus sections.** The one thing no current lane can see: the card
  sizes itself from `container-type: inline-size` on `.root`, so `cqw` resolves
  against a real card width. This is also the walk the user does *every time*.
- **The real Home Assistant elements.** `state-badge`, `state-display`,
  `hui-heading-badge` — everything our stubs replace. This is exactly the class
  of defect found on 2026-08-21: a missing `.name` on `state-display` that
  **neither existing lane could see**, because one has no such element and the
  other has no Home Assistant.
- **The error paths.** Unreadable items, refused badge types, malformed
  visibility, the component-missing fallbacks. Static fixtures, deterministic
  rendering, the least fragile of the four.
- **Themes and colours.** Follow-up 4 has been open since 1.3.0 for want of
  exactly this.

### Constraints to carry in

- **CI cannot run this as it stands.** `ci.yml` has a runner, not a Home
  Assistant. Either the lane is local-only and says so, or CI gains an HA service
  container — a real decision, not a detail.
- **Screenshot comparison was already rejected**, on 2026-08-21: baselines drift
  with every HA update, numbers do not. Assertions should stay geometry and
  computed styles, as the browser lane's do.
- `.ha/config/.storage/lovelace.dashboard_test` already holds three views and is
  the user's own fixture. **It is not what gets filmed and must not become what
  gets tested** — its broken items are error fixtures, and entry 2c's warning
  about not conflating the two applies here too.

### Brainstorm opened 2026-08-21, stopped mid-design — resume at section 2

**The architectural brainstorm was started and the user stopped it after
validating section 1.** Nothing has been written to `src/` yet, no spec file
exists. What follows is everything that was settled or measured, so the next
session resumes at the design's section 2 rather than re-deriving it. **Do not
re-open the decisions below** — they were taken with the user in front of them.

#### Settled with the user

- **What the lane must prove: all four axes above**, and the user's own wording
  for the criterion is the durable part — *everything that has ever required a
  visual validation from them, for want of coverage*.
- **CI: local now, CI-ready by construction.** The bootstrap must be able to
  start from a virgin instance (onboarding included); `ci.yml` is not touched in
  this lot.
- **This lot stops at bootstrap + one smoke test** — the lane authenticates,
  reaches both views, reads a real geometry. The four axes become later lots that
  add only fixtures and assertions.
- **Everything lives in `src/tests/ha/`, the bootstrap included.** Explicitly
  *not* in `scripts/`, and explicitly **no refactor of `scripts/screenshot/`** —
  the user ruled that the capture will copy or take inspiration later and that it
  is not this lot's problem. So `ha-session.mjs` stays where it is and the new
  lane duplicates what it needs, deliberately.
- **The bootstrap owns `ha:up` too**: `docker compose up -d` first, then an
  **active wait on `:8123`** with a ceiling. Without the wait, `up -d` returns
  before HA listens and the lane fails on a perfectly good instance.
- Files agreed: `session.ts`, `bootstrap.ts`, `fixtures.ts` (the two views'
  literal, source of truth the way `capture-view.mjs` is), `global-setup.ts`,
  `smoke.test.ts`.
- Playwright is driven **node-side**, `serviceWorkers: "block"` from the start —
  see the trap in `mem:picture-studio/screenshots`.

#### The wiring, and it is the user's design

One `rstest.config.ts` with three projects, `ci:` prefixing the ones CI runs:
`ci:happy-dom`, `ci:playwright`, `ha`. `pnpm test` becomes
`rstest run --project 'ci:*'`, and each lane gets a named script
(`test:happy-dom`, `test:playwright`, `test:ha`). The `ha` project carries the
`globalSetup` that calls the bootstrap.

**Integrating the lane into CI later is renaming `ha` to `ci:ha`** plus the one
script that targets it. The prefix *is* the declaration "this runs in CI".

**Inclusion by prefix was chosen over `--project '!ha'` for a measured reason:
filters union.** One negation works; two do not — `'!a' ∪ '!b'` is everything.

#### The new rule this creates, and the memory it invalidates

**Never pass `--project` to `pnpm test`.** Because filters union,
`pnpm test --project ci:happy-dom` would run `ci:*` **plus** that project — that
is, everything, silently. It is the exact twin of the `pnpm test -- …` trap.
Hence the named scripts.

**This kills the `pnpm test --project happy-dom` idiom documented in
`mem:picture-studio/state`** (baseline section and the two-lane bullet). That
memory is still correct *today* and must not be edited before the change lands —
but the delivery that lands it has to fix it in the same breath, and the project
names in the baseline table change too.

#### Measured, so nobody re-derives it

- **`@rstest/browser` cannot reach Home Assistant, and that is why the lane is
  node-side.** Its client exports exactly `Locator`, `page`,
  `setTestIdAttribute` — a locator over *its own* page, no navigation. Test code
  runs inside the page rstest serves; HA is another origin.
- **`--project` semantics** (`rstest list`, 0.11.9): repeatable and **unions**,
  never overrides; `'!name'` negation works; wildcards work; a **positional file
  filter intersects correctly** (`--project '!playwright' <a playwright file>`
  yields nothing), so `pnpm test <file>` survives a baked-in project filter.
- **`globalSetup` is per-project and is skipped for a filtered-out project.**
  `ProjectConfig` is `Omit<RstestConfig, 'projects'|'reporters'|…>` and does not
  omit it; proven with a throwaway two-project config — 0 firings under
  `--project keep`, 1 under `--project probe`. This is what makes the single
  config viable.
- **The Home Assistant side, read in the container's own source**, all
  `require_admin`: `config/auth/list`, `config/auth/create`
  (`name`, optional `group_ids`, optional `local_only`),
  `config/auth_provider/homeassistant/create` (`user_id`, `username`,
  `password`). For a virgin instance it is `POST /api/onboarding/users`, which
  creates the owner and returns a token directly.
- **The instance has exactly one real account**: `Card`, owner and admin, login
  `card` / `card`. So the bootstrap must authenticate as an admin to create the
  test user — the chicken-and-egg is real and the admin credentials are an input.

#### The argument for the dedicated user, which is stronger than hygiene

It is what makes the **themes** axis possible at all. `settheme` writes to the
**profile**, permanently — the documented trap in `mem:picture-studio/screenshots`.
Tests that flip the theme on the user's own account leave it flipped. On an
account of their own, theme, sidebar and formats are fixtures like any others.

#### Where to pick up

Section 2 of the design: the bootstrap's steps and their idempotence rules —
onboarding if virgin, user, hidden dashboard, the two views. Then section 3: what
the two views actually contain and what the smoke test asserts. Then the spec
under `docs/superpowers/specs/`, then `writing-plans`. The patron to follow for
idempotence is `setup-capture-dashboard.mjs`: list, create only when absent,
leave an existing one untouched without `--force`.

**One thing section 3 must decide, and it was already visible:** the two views
should hold the **same card config**, so that the only difference measured
between panel and sections is the view type itself.

### Reaching a real phone, which the panel-only defect of 1.5.2 had to do

Not part of the lane's design, but the same instance and the same traps, and all
of it cost a session to establish. `.ha/` is git-ignored, so nothing in the
repository records any of this.

- **The devcontainer publishes 8123, it does not forward it.** VS Code binds a
  forwarded port to the loopback only, so a phone on the LAN cannot reach it.
  `.devcontainer/devcontainer.json` carries `"appPort": ["8123:8123"]` and no
  `forwardPorts` — the two would fight over the same host port. The reasoning is
  written at the edit; putting `forwardPorts` back rebuilds the wall.
- **Home Assistant runs in a nested Docker inside the devcontainer.** After a
  container rebuild, check `docker ps` for `picture-studio-ha` and bring it back
  with `docker compose up -d`. `.ha/config` is a bind mount, so nothing is lost.
- **`/local/` is served with `Cache-Control: max-age=2678400` — 31 days.**
  Measured. `dist/` is mounted there, so **a rebuilt bundle does not reach a
  phone that has already loaded it** unless the `?v=` in
  `.ha/config/.storage/lovelace_resources` is bumped and the container
  restarted. The failure is silent and misleading: everything renders, from the
  previous build.
- **The dashboard's `url_path` is `dashboard-test`, with a hyphen**, while its
  storage file is `.storage/lovelace.dashboard_test` with an underscore. Using
  the file name in a URL gives a page that loads, answers 200 and renders
  nothing, with no error worth the name. The truth is in `.storage/lovelace_dashboards`.

**And the technique, which is the part worth reusing.** The companion app gives
no console, so the trace was drawn **on the card itself**, in a strip over the
preview in editing mode. It did not infer from events: every place that could
write an item's position was made to announce itself, so one line named the
writer. Two things to know before doing it again — a probe's own passive
listeners make `TouchEvent.cancelable` read `false` and can be mistaken for a
verdict from the browser, and a gesture that *succeeds* re-renders the card and
therefore erases its own strip, so a successful run has to be captured **during**
the gesture, never after it.

## ~~12. The mobile snap-back found on 1.5.1~~ — DONE 2026-08-22, shipped in 1.5.2

An item returned to its pre-drag position after a fraction of a second of
dragging, on a real iPhone in the companion app, in the **panel** view only.
Closed by the non-passive `touchmove` in `drag-layer.ts` — the root cause and
the reason the listener is shaped the way it is are written at the code and
summarised in trap 10 of `mem:picture-studio/state`. The blow-by-blow of the
investigation is deliberately not kept: it is in the git history, and what it
taught outlives it in the two places just named.

Three things it settled that are not about this defect:

- **It met entry 11 head on.** That entry wants the panel and sections views to
  carry the **same card config**, so the only thing measured between them is the
  view type. This defect was the first concrete demand for exactly that — the
  panel-only symptom was the whole mystery, and the answer turned out to be that
  a panel view makes the document scrollable where a sections view does not.
- **It also showed that lane's limit.** The defect does not appear under Chrome's
  Device mode, so a lane driving desktop Chromium would have reported the card
  healthy. See trap 3.
- **The measuring technique is reusable and the plumbing is fragile.** Both are
  recorded under entry 11's "Reaching a real phone" above.

