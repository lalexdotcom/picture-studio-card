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

## 8. The config form's layout is being redrawn

**Asked 2026-08-19, at the very end of the header brainstorm. Not designed.**
It changes where entry 2's two touch points land, so the two are brainstormed
together, and `docs/superpowers/specs/2026-08-19-card-heading-design.md` is
annotated to say so.

What the user sketched:

- **"Items" becomes a collapsible section**, with a **count badge** and a
  **max-height** so a long list stops pushing everything else off the screen.
  That is `badge-list.ts`, which is not collapsible today.
- **"Card options" is split.** Its label comes from HA
  (`picture-elements.card_options`) and it currently holds everything:
  - **Heading** — title, icon, **and the badge list directly inside**, rather
    than a separate "Badges" section after it. This supersedes open question 4
    of the spec: the section no longer writes to two places, because it no
    longer exists.
  - **Image** or **Background** — the image selectors and the camera entity.
  - **Filter** — `state_filter` and `dark_mode_filter`. **Least settled of the
    three.** The user, told what these keys actually do (below): *"il faudra
    qu'on fasse un tri là-dessus ; en l'état, mettre les filter en YAML only ne
    me choque pas plus que ça."* So **dropping the section entirely and moving
    `state_filter` / `dark_mode_filter` out of the form is on the table**, and
    is the cheaper answer to everything in this list. Sort it before designing
    a section that may not exist.

**What the filters actually do**, established while the question was asked (read
in `components/hui-image.ts` at 20260729.6). All three are **CSS `filter`
strings applied to the background image**, concatenated in this order:

```
filter = (filter || "")
       + (darkMode && dark_mode_filter ? dark_mode_filter : "")
       + (state_filter[state of `entity`] ?? "")
```

- `filter` is unconditional and is **YAML-only in our form**. It is **not ours
  and not picture-elements' either**: `PictureElementsCardConfig` does not
  declare it and the card never passes `.filter` to `hui-image`, so at *their*
  card level the key is inert. It belongs to the **image element**
  (`ImageElementConfig`), and we inherit it because our background *is* a
  `hui-image-element`. What is ours is having lifted it to card level.
- `dark_mode_filter` is appended only when `hass.themes.darkMode`. Typical use:
  `brightness(0.6)` to dim a floorplan at night.
- `state_filter` is a *state → filter* map keyed on the state of **`entity`**,
  and **there is no `entity` field in our form** — only `camera_image`, bounded
  to the camera domain. So `state_filter` is configurable through the interface
  while the key that makes it work is not. That is trap n°1 in a section we are
  about to build on purpose; decide it rather than inherit it.
- **The sting**: when the computed filter is empty *and* `entity` is set,
  `hui-image` applies `DEFAULT_FILTER = grayscale(100%)` as soon as the entity
  is off or unavailable **and** the displayed image is a fallback (no
  `state_image` matched). Setting `entity` alone is enough to grey the plan,
  with nothing in the config saying so.

All three are in `BACKGROUND_KEYS` and forwarded verbatim to
`hui-image-element`, so they do work today.

**If the fields are kept, their shapes are already decided upstream.**
`hui-image-element-editor` — the editor of the very element we build our
background from — exposes both of the fields we lack:
`{ name: "entity", selector: { entity: {} } }` and
`{ name: "filter", selector: { text: {} } }`. For `state_filter` the `object`
selector we already use stays right: `hui-image` reads it as a state → filter
table whatever the upstream typing claims (`string` on the element, `string[]`
on the card, `StateSpecificConfig` where it is actually consumed).

**A happy side effect of `heading.title`**, noticed here: `title` is explicitly
*excluded* from `BACKGROUND_KEYS` because `hui-image-element` would feed it to
`computeTooltip` and turn it into a hover tooltip over the image. Under
`heading.title` that hazard cannot recur by construction.
