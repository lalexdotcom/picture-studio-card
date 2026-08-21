# picture-studio — where the project stands

A Home Assistant Lovelace custom card, `custom:picture-studio`: an image with
items placed on it, positioned by **dragging them on the live preview** inside
the normal card-edit dialog. "picture-elements, but you place the items with the
mouse".

**Two families of item since 1.2.0**: Lovelace **badges**, and **elements** —
since 1.4.0 two kinds, `state-icon` and `state-label`.

## Where the project stands — look, do not remember

**Nothing below this heading records a value a command gives in a second.** Those
went stale twice in one day and were repeated to the user both times. What is
recorded here is *where to look* and *how to read the answer* — never the answer.

| Question | Command |
| --- | --- |
| Which version is open? | `jq -r .version package.json` |
| Is it releasable? | `head -3 CHANGELOG.md` — a date means yes, `unreleased` means no |
| What is published? | `git ls-remote --tags origin` |
| How far is `main` from the remote? | `git log --oneline origin/main..main \| wc -l` |

**`git tag -l` lies here and is the trap that caught a session.** This clone has
never fetched the tags the release workflow creates, so the local list stops
several releases behind. A session read it, told the user a published version was
unreleased, and was corrected by the user. Always the remote.

**The release chain:** a push to `main` runs CI, then `release.yml` reads
`version` from `package.json` and creates the `v<version>` tag and the release.
HACS installs from that tag. **The user pushes, never the agent.**

**The CHANGELOG date is the safety catch, and it is load-bearing.** `main` can
sit a long way ahead of `origin/main` — a push then publishes whatever
`package.json` names. The only thing between an accidental push and a release is
`release.yml` refusing while the heading for that version says `unreleased`. Do
not replace that word until the user asks for the release.

Release history, which is the one thing here that does not go stale by itself:
1.0.0 (2026-08-12, by hand), 1.1.0 (2026-08-13, first from the automated chain),
1.2.0 (2026-08-14), 1.3.0 (published 2026-08-17), 1.3.1 (2026-08-17),
1.4.0 (2026-08-19).

### The versioning workflow changed on 2026-08-21

**The bump opens a version; it no longer closes one.** When the user calls for a
new version — and only then, in so many words — `package.json` and the CHANGELOG
heading both take the new number immediately, with `unreleased` standing in for
the date. Everything delivered afterwards is written under that heading; there is
never a separate `## unreleased` section beside a numbered one. Replacing
`unreleased` with a real date is the act of releasing, and it is the last thing
done. Written into `AGENTS.md` rules 4 to 7.

The older text here said "then the bump, then the push", which was the previous
workflow and is no longer true.

### What the open version still needs

**Nothing but the user's decision to release it, and the date that replaces
`unreleased`.** The 2026-08-21 review branch is merged and deleted; the doc pass
and the screenshots were done before it. Anything else is in
`mem:picture-studio/follow-ups` as an open entry — the struck ones are done. If
an entry there says something is owed, **check the repo before repeating it**;
that is exactly how a settled entry got reported as outstanding.

### The 2026-08-21 codebase review, and what it settled

Ten axes, sixty findings, twenty-one commits, merged after a whole-branch review
came back READY TO MERGE with no blocking findings. The report is kept at
`docs/reviews/2026-08-21-1414-picture-studio-card.md`.

**Three findings were refused, not implemented**, and each has its reasoning
recorded where the next review will meet it rather than in the report: the
monolithic bundle (see the single-file build rule below), the YAML boundary in
`normalizeElementConfig`, and `hasAction` on an unreadable action. **Do not
re-open them from the report alone** — the report states the diagnosis, the code
and this file state why the remedy was declined.

**Three of the review's remedies were wrong**, and following them would each have
made things worse: deleting a whole JSDoc block that also held the only accurate
description of a return value; `var(--ha-space-1)` for a gap written as 8px, when
step 1 of that scale is 4px; and the claim that `off` is active for a
`lawn_mower`, which the guard above the switch catches first. Each is noted at
the point it would have landed. **The pattern is the project's oldest lesson: a
review finding can be right about the mechanism and wrong about the remedy.
Measure the remedy, not just the diagnosis.**

## The green baseline — refresh it whenever you run the whole suite

**This is the one place figures are recorded, and only because deriving them is
slow.** A full run is minutes; `jq -r .version package.json` is a second. Anything
in the second category lives under "Where the project stands" as a command, not as
a value.

**The rule that makes this section trustworthy: whoever runs the whole suite, or
a build, updates these numbers and the date in the same breath.** A baseline
nobody refreshes is worse than no baseline — it reads as authoritative and is
quietly wrong, which is precisely how the release status went bad twice in one
day. If the date below is older than your last full run, the numbers are yours.

**A scoped run must never be copied in here, and the trap is that it looks
identical.** `pnpm test src/tests/happy-dom/editor/items.test.ts` prints the same
JSON as a full run — `"passedTests": 54`, no marker saying it covered one file.
**`testFiles` is the tell, which is why it is recorded beside the count: if your
run does not report every file, it is not a baseline.** Scoped runs are the
normal way to work; the full run belongs to a delivery's verification, which is
the same moment this file gets updated anyway.

**Measured 2026-08-21, on `main` after the review branch merged:**

| Run | `testFiles` | tests |
| --- | --- | --- |
| `pnpm test` — both lanes, **this is the baseline** | 39 | 822 |
| `pnpm test --project happy-dom` | 36 | 779 |
| `pnpm test --project playwright` | 3 | 43 |

`pnpm build`: **209.4 kB / 49.5 kB gzip**. No scoped variant — a build is always
the whole thing. `pnpm typecheck` is expected clean; no number to carry.

A single lane is a scoped run, so it does not update the baseline either — the
lane figures are here only so a lane run can be recognised as complete for its
own lane.

**Never write `pnpm test -- …` here. The `--` discards every argument after it**
and the whole suite runs regardless — no error, no warning, just 39 files and 797
tests where a scoped run was expected. Measured on 2026-08-21, all four cases:

| Command | What runs |
| --- | --- |
| `pnpm test --project happy-dom` | that lane |
| `pnpm test <file>` | that file |
| `pnpm test -- --project happy-dom` | **everything** |
| `pnpm test -- <file>` | **everything** |

The silence is the danger: the output shape is identical, so a scoped run and a
full one are told apart only by `testFiles`. A whole session of runs was believed
to be scoped and was not — and the first draft of this very entry claimed a
positional path survived the `--`, which measuring disproved.

**`pnpm lint` exits 0 while reporting warnings, and that is not a failure.** The
count has sat in the mid-twenties for a long time, almost all `!` non-null
assertions in test files; no session has been asked to clear them. The
interpretation is what matters and it does not drift: **a warning you did not
have before is yours**, whatever the running total says. Compare against `main`
rather than against a remembered figure.

## Where things are

- Specs: `docs/superpowers/specs/` — `2026-08-11-picture-badges-design.md`
  (authoritative base), then `2026-08-12-item-anchor`,
  `2026-08-13-per-tick-work`, `2026-08-13-release-on-version-bump`,
  `2026-08-13-state-icon-element`, `2026-08-14-icon-chrome`,
  `2026-08-14-item-visibility`, `2026-08-17-state-label`,
  `2026-08-18-config-tidy-up`, `2026-08-19-unknown-items`,
  `2026-08-19-card-heading`, `2026-08-20-config-form`.
- Reviews: `docs/reviews/` — one file per full-codebase review, timestamped. The
  2026-08-21 one is the first.
- Local HA: `docker compose`, container `picture-studio-ha`, http://localhost:8123.
  `dist/` is mounted at `/config/www/picture-studio-card/`, so a `pnpm build` is
  live at `/local/picture-studio-card/picture-studio.js` — only the dashboard
  resource's `?v=` needs bumping. `.ha/` is git-ignored; the test picture is
  `.ha/config/www/demo/office-plan.jpg`. Mushroom is installed.
  The test dashboard is `.ha/config/.storage/lovelace.dashboard_test`, three
  views: sections, panel ("Office"), masonry. **Reading it as JSON is the fast
  way to answer "which config reproduces this".**
- **The README's gifs are recorded, not hand-captured**, by `scripts/screenshot/`
  against a dashboard of their own (`picture-studio-capture`). How to run it, what
  it films, and the traps — Home Assistant's service worker reloading the page
  mid-take, the injected cursor, the ffmpeg the devcontainer actually has — are in
  `mem:picture-studio/screenshots`. `dashboard_test` is not what gets filmed and
  must not become it: its broken items are error fixtures.
- **The shipped frontend is readable in the container** at
  `/usr/local/lib/python3.14/site-packages/hass_frontend/frontend_latest/*.js`,
  translations at `static/translations/**/<lang>-*.json`, MDI at `static/mdi/`.
  Build **20260729.6**; our 2026.6.0 floor is 20260527.4.
  For anything minified, prefer the real source over the network:
  `raw.githubusercontent.com/home-assistant/frontend/<build>/src/...`.
  **This is the single most productive habit in this project**, and 2026-08-18
  is its best demonstration: reading `state_color.ts` overturned a written
  design decision in one afternoon.

## Source layout

```
src/position.ts        px <-> % conversion, anchor-aware style and bounds (pure)
src/element-size.ts    ElementSize, the three sizing modes, elementSizeCss (pure)
src/chrome.ts          IconChrome / LabelChrome, defaults, normalization, fills (pure)
src/state-color.ts     HA's state-colour recipe, rebuilt (pure) — 1.4.0
src/config.ts          item families, normalization, storage, tags (pure)
src/strings.ts         our own en/fr catalog — the last resort
src/broker.ts          editor + card registries (pure)
src/types.ts           hand-declared HA interfaces
src/card/picture-studio-card.ts   background + item children + lifecycle
src/card/item-styles.ts           chromeFillStyles, haloStyles, interactionStyles
src/card/state-icon-element.ts    chrome wrapper, state-badge
src/card/state-label-element.ts   chrome wrapper, state-display
src/card/item-actions.ts          the action relay both kinds share:
                                  hasAction, isClickable, bindActions,
                                  relayActions
src/card/visibility-probe.ts      the phantom card a hui-card probe carries
src/card/drag-layer.ts            pointer gesture, injected callbacks
src/editor/picture-studio-editor.ts  hub: _commit / _reemit, the only exit to HA
src/editor/visibility-section.ts  hosts HA's own hui-card-visibility-editor
src/editor/badge-list.ts          rows, ha-sortable, the add menu, the flip.
                                  Renders only — the verdicts it draws live in
                                  items.ts, and it probes from updated(), never
                                  from render()
src/editor/badge-form.ts          the badge's own editor + Position section
src/editor/element-form.ts        our ha-form, Appearance, Size and position
src/editor/state-label-form.ts    the label's schema halves (size is shared)
src/editor/state-icon-form.ts     the icon's schema halves (size is shared)
src/editor/element-size-form.ts   sizeSchema + size <-> form, once for both kinds
src/editor/anchor-picker.ts       switch + hand-built 3x3 grid
src/editor/badge-catalog.ts       core + custom badge choices
src/editor/badge-existence.ts     does this HA know this badge type? cache + grace
src/editor/element-catalog.ts     element kinds, labels, stubs
src/editor/items.ts               add / replace / move / remove / rowLabel,
                                  and the item verdicts: itemsSeverity,
                                  showsNothing / elementShowsNothing,
                                  hasUnreadableVisibility (pure)
src/editor/icons.ts               only the icon NAMES two components share
src/suggestion.ts      entity-first card picker suggestion (pure)
src/index.ts           registration + window.customCards
src/tests/happy-dom/** mirrors the source tree — the fast lane, no layout
src/tests/playwright/**  the browser lane: harness.ts + placement / drag / appearance
```

## Config shape (current)

```yaml
type: custom:picture-studio
image: /local/plan.png          # or { media_content_id, media_content_type }
entity: light.salon             # needed for state_image / state_filter
items:
  - type: badge                 # family; REQUIRED since 1.2.0
    position: { top: 30%, left: 45% }
    anchor: center              # absent => auto
    visibility: [ … ]           # 1.3.0 — HA's own conditions, opaque to us
    config: { type: custom:mushroom-template-badge, entity: light.salon }

  - type: element
    position: { top: 45%, left: 20% }
    config:
      type: state-icon          # or state-label; the open set lives here
      entity: light.salon
      color: state              # state | none | a theme colour — both kinds
      size: { mode: auto, ratio: 8, min: 24, max: 48, value: 48 }
      halo: false               # 1.4.0 — opt-in
      chrome: { theme: none, radius: 50, opacity: 1, content_ratio: 0.6 }
      # a label's chrome instead: { theme, radius(px), pill, opacity, padding }
```

In memory only, never in YAML, a third variant holds what we could not read:

```ts
{ type: "unknown", raw: <the entry, untouched>,
  reason: "item-type" | "config-missing" | "element-type", token?: string }
```

`reason` and `token` are decided at normalization and never re-derived. `raw` is what
`storedConfig` emits back — no spread, no key deletion, no position rewrite, so a
`top: 30` returns as `30` and not `"30%"`.

## Decisions that must not be re-litigated

- **Two families, closed set; the open set is `config.type`.** `type` is
  required — absent and unknown both raise.
  **Correction, 2026-08-18:** the old claim that "a new element kind touches
  `element-catalog.ts` and nothing else" is **false**, and adding the second kind
  is what proved it. Three more places branch on the kind and each defaults to
  the icon: `_dispatch` in `element-form.ts`, `createElementBadge` in
  `picture-studio-card.ts`, and `storedConfig`'s `isLabel` in `config.ts`. A
  third kind added without touching all four is not rejected — it is silently
  treated as an icon. Nothing is broken today (`normalizeElementConfig` raises on
  an unknown type first), but the checklist is four files, not one — and since 1.4.0
  the two form sites carry an `assertNever` guard, so a third kind is a compile
  error at each rather than a wrong render. **Measured**: widening `ElementConfig`
  yields exactly two `tsc` errors.
- **An unreadable item is ignored, not fatal** (1.4.0). This **reverses** the old
  "never ignore or purge an unreadable item" rule, and legitimately: that rule
  refused ignoring *because it led to losing* — `storedConfig` rewrites the whole
  config on every editor commit. An item held as an `UnknownItem` and re-emitted
  **verbatim**, position unnormalized, loses nothing, so the objection dissolves.
  Spec: `docs/superpowers/specs/2026-08-19-unknown-items-design.md`.
  - Exactly one item-level failure is still fatal: an `items[i]` that is not an
    object. No family, no position, not even a key to name in a row — HA's error
    card, which prints the offending config, says more than we could.
  - **Two independent sources** put an editor row into the error state and render
    alike: the model's `UnknownItem`, and the runtime verdict of
    `src/editor/badge-existence.ts` for a badge type this HA does not have. The
    glyph says which **family** broke — `mdi:alert-box` for a badge,
    `mdi:alert-circle` otherwise.
  - A malformed `visibility` is **not** an unknown item: the value is kept raw,
    `hasVisibility` reports nothing, the item always shows, and its Visibility
    section carries an `ha-alert` with the only path to clearing it.
- **`config` is opaque per family.** A badge's payload belongs to a third party:
  never read, validate or rewrite it. An element's is ours — but keep unknown
  keys. `size` and `chrome` are *our* closed records inside it, so an unknown key
  inside either is dropped.
- **The card places, the element draws itself.** The card's only concession to
  size is `container-type: inline-size` on `.root`. Without that line `cqw` falls
  back to the viewport **silently**.
- **Three sizing modes, `mode` read only by `elementSizeCss`.** `mode` overrides,
  it never erases. The pre-1.2 `{ auto: bool }` shape is still read and never
  written back.
- **The chrome is one wrapper, and the host's box never changes.** `.chrome` is
  always in the DOM; only its styling is conditional. `size` is the whole
  footprint; `content_ratio` shrinks what is inside it, never the item.
- **`chrome.theme` carries the switch**, like `size.mode` and like `color`.
  `none` draws nothing and **keeps every number**. It is a storage value, never
  offered in the interface.
- **The chrome's shape is conditional; its halo is not** (the halo is now
  opt-in via `halo`, but it is still never clipped by the chrome's rule).
  Getting this wrong clipped every chromeless icon into a circle in 1.3.0.
- **The editor rounds; the model does not clamp.** Sliders guide; someone outside
  their range is writing YAML and means it.
- **Anchor is per-item, `auto` by default**, ten values, offsets derived at
  render. Re-anchoring asks the preview for coordinates *before* writing.
- **Ratcheting drag bounds computed in `pointermove`**, never at `pointerdown`.
- **Pixels during the drag, percentages on release**, one commit per gesture,
  two decimals.
- **A gesture commits on distance OR on time** (2026-08-21). `isDrag(travelled,
  heldMs, displaced)` in `drag-layer.ts`: the travel cleared `DRAG_THRESHOLD_PX`
  (4, sticky — a drag that wanders far and returns near its start still counts),
  **or** the pointer was held `DRAG_HOLD_MS` (300) and the item ended at
  different pixels. The time path exists because the threshold could only answer
  "was this obviously a drag" and answered the opposite by default: a deliberate
  one-pixel adjustment is smaller than any tremor, and it was being discarded.
  `displaced` compares the final pixels to those at `pointerdown`, **not** the
  pointer's travel — against an edge the clamp absorbs the whole gesture, and a
  press-and-think has nothing to store.
  **And a non-commit now restores the three inline style strings verbatim**, kept
  from `pointerdown`. Recomputing them through `toPercent` would land a hundredth
  of a percent off; more importantly, before this a click left the badge up to
  4 px from its stored coordinates with no `setConfig` coming to correct it.
  The clock is injected (`now?()` on `DragOptions`, `performance.now` by default,
  monotone) purely so the 300 ms boundary is testable exactly rather than slept
  through.
- **No `z-index` in the rendered stacking** — DOM order = list order. One
  exception, reserved to the editor: the selected or dragged item is raised while
  `editing`.
- **The theme, the opacity, the halo and the hover come from one CSS module**,
  `src/card/item-styles.ts`, and each element's `static styles` is an array that
  puts the shared blocks first. Consequence for the tests: `cssRules` in the
  harness must accept an array of `CSSResult` — handed an array it would read
  `undefined` and return an empty map, so every CSS assertion would pass by
  finding nothing. That is worse than a failure.
- **The item list reads top-down; the array is untouched** (1.4.0). Reversing the
  array was refused: the array's order *is* the paint order, no key in the config
  distinguishes a pre- from a post-reversal array, so the migration would be
  undecidable — and `picture-elements` stores paint order too. The flip lives
  entirely in `badge-list.ts`: one `_flip(i) = length - 1 - i`, its own inverse,
  applied to the three indices that leave the component (`item-edit`,
  `item-removed`, both ends of `item-moved`). It must never leak further:
  `item-edit` becomes `_editingIndex`, which travels to the **card** to mark the
  selected item.
- **The hover: a veil with a chrome, a grow without** (1.4.0). With a surface
  there is something to tint — 4% of the item's own colour, 12% pressed, HA's
  badge ripple figures, behind `--psc-hover-opacity` / `--psc-pressed-opacity`.
  Without a surface a 4% veil over a photograph is invisible, so the item grows
  to 1.08 instead. The veil is deliberately independent of
  `--psc-chrome-opacity`. Only `clickable` items react, and the card's
  `.editing .item > * { pointer-events: none }` already keeps the editor out.
  The 1.2.0 grow at 1.04 was rejected twice by eye before this split.
- **`storedConfig`'s `chrome && !isDefaultChrome(chrome)` is not a redundant
  guard.** Two reviewers have flagged it; it is correct.
- **Single-file build, no dynamic import, no decorators, Lit bundled.** The whole
  editor ships with it, and that is **closed, not open**: splitting needs a
  dynamic `import()`, rspack then emits a chunk the release never publishes, and
  it has shipped a broken card once already. Settled 2026-08-21 — it does not
  need raising again.
- **`PictureStudioConfig` is a `type`, never an `interface`, and that is load
  bearing** (2026-08-21). Only a type alias gets TypeScript's implicit index
  signature; without one it does not satisfy `Record<string, unknown>`, which is
  what forced `sectionMerge`, `sectionData` and `mergeBackground` to launder it
  through `as unknown as` on the way in and back out. Between those casts sat
  real key manipulation that nothing checked: a `next.camera_imge = chosen` typo
  produced **zero** compile errors, measured. It produces one now. Changing it
  back to an `interface` reinstates the casts and the blind spot.
- **The YAML boundary in `normalizeElementConfig` asserts its type on purpose —
  do not "fix" it** (arbitrated 2026-08-21, after a review raised it). Everything
  outside `size`, `chrome`, `halo` and `show` travels unchecked: `entity`,
  `icon`, `color`, `name`, the three `*_action`. The reasoning is written at the
  cast itself; the short version is three measured facts.

  **Home Assistant already has the display fallback**, and reimplementing it is
  against the project's oldest rule. Malformation is per field, not per item — by
  the time this runs the kind is recognised, so a non-string `entity` just misses
  in `hass.states` and `state-badge` draws its own marker, and a bad `color`
  costs only the colour.

  **Validating would cost more than it buys.** Dropping a bad value in memory
  erases it from the user's YAML on the next commit, because `storedConfig`
  rewrites everything; refusing the item takes a drawable item off the picture
  over a decorative field. Both were measured and both are worse.

  **The decision rests on one condition, and it is guarded.** A user must always
  be able to repair a malformed value from the editor — the bad value reaches the
  form untouched, picking a valid one writes it back, fixing one field leaves the
  others alone, and an unedited round trip changes nothing. Four tests in
  `tests/happy-dom/editor/element-form.test.ts` pin exactly that. **If one of
  them ever goes red, the escape hatch is gone and this decision reopens.**

  `hasAction` follows the same principle and was left alone for the same reason:
  an unreadable action keeps the item clickable and lets HA's `handleAction`
  decide. A stricter test there would make such an item non-clickable, which is
  further from the intent than the status quo.
- **The two element forms share sizing and nothing else — and the types are the
  reason** (2026-08-21, from the codebase review). `sizeSchema`,
  `sizeToFormFields` and `sizeFromFormFields` live once, in
  `editor/element-size-form.ts`; `iconSizeSchema` and `labelSizeSchema` are
  aliases kept so the call sites still read in the kind's own vocabulary.

  **The chrome conversions stay duplicated on purpose. Do not "finish the job".**
  The review counted four common keys across `iconToFormData` /
  `labelToFormData` and asked for a shared base. The two cases are not alike:
  the size copies were written over the *same* `ElementSize` type, so a bound or
  a rounding rule could drift with nothing to report it — which is exactly what
  happened and what the extraction closes. `IconChrome` and `LabelChrome` are
  **distinct types** (1.4.0: two records over one shared CSS module), so the
  compiler is already the guard against drift there. Factoring them would trade
  a real safeguard for four fewer lines, and split each form's reading across
  two files.

## Hard-won facts about Home Assistant (all verified in their source)

- **The badge registry, read out of `frontend_latest/14887.*.js` (build 20260729.6):**
  `KNOWN = {error, entity}` eager, `LAZY = {entity-filter, shortcut, state-label,
  power-total, gas-total, water-total}`. **Eight native types; our `CORE_BADGES` lists
  two** — and that is correct, it mirrors `coreBadges`, which is the *picker's* list.
  So "renders but is not in our catalogue" is a real, testable state.
  The factory's last argument is `"entity"`, the **default type**: a badge with no
  `type` at all is legal and means `entity`.
- **`createBadgeElement` never throws.** It is the catching wrapper: for a type it
  cannot build it returns a `hui-error-badge` carrying the message. That returned tag
  is the only synchronous existence signal available to a custom card, and it is what
  `src/editor/badge-existence.ts` reads.
- **The badge factory has three branches, and only one is unguarded** (read in
  `frontend_latest/99344.*.js` and `56721.*.js`, build 20260729.6; module 76541 is
  `create-badge-element`, 3601 is `create-element-base`). `_createElement` — minified
  `s = (e,t) => { const n = document.createElement(e); return n.setConfig(t), n }` —
  is where **`n.setConfig is not a function`** comes from, and that message is its
  signature: it means `s` was handed a tag that is not registered.
  - `custom:` → `customElements.get(tag) ? s(...) : error element`. Guarded. **The
    2000 ms hide-then-reveal timer lives strictly inside this branch** — no other
    path pays it, so priming and our own error badge never do.
  - lazy (`entity-filter`, `shortcut`, `state-label`, the three totals) → element
    created, `setConfig` deferred to `whenDefined`. Guarded.
  - `ALWAYS_LOADED` → `if (r.has(h)) return s(u, t)`. **Unguarded.** For badges the
    set is `{error, entity}`; `entity` is statically imported by module 76541,
    `error` is not. So `type: "error"` on a cold dashboard is the whole bug.
- **`createErrorBadgeElement` is guarded and is the only fetcher of the error-badge
  chunk** — `customElements.get(tag) ? setConfig : (Promise.all([…chunks…]),
  whenDefined.then(upgrade + setConfig))` — **and it is not exported**. That
  asymmetry is why HA's own error badges appear on a cold load while ours could not:
  HA reaches its loader directly, a custom card can only reach it by making the
  public factory fail. Hence `PRIMING_TYPE` in `picture-studio-card.ts`.
- **HA logs `console.error(kind, config.type, err)`** just before returning an error
  element. The **second argument is the config type**, which is what makes a
  deliberate sentinel filterable without ever matching on message text.
- **A `custom:` badge that is not defined gets its error badge hidden for 2000 ms**
  (`display: None` + a timer) while `customElements.whenDefined(tag)` is awaited, so an
  error is not flashed at a resource about to load. A tag with **no dash** can never be
  a custom element, so HA returns the error at once there. And since HA rebuilds the
  card element on *every* config change, that timer restarts on every drag — which is
  why the card un-hides it while `editing`.
- **`ha-alert`** takes `alert-type` (property `alertType`), and `<ha-button size="s"
  slot="action">` is HA's own idiom for its action. Its internal
  `.icon.no-title { align-self: center }` means **the icon centres itself when no title
  is passed** — the only clean route to a centred icon, since the layout is in its
  shadow DOM.
- **`ha-button` takes `variant` (`neutral|danger|warning|brand|success`) and
  `appearance` (`plain|filled|outlined`).**

- **HA rebuilds the card element on every config change** — no card-side state
  survives a commit.
- **`preview` does not mean "I am the edit dialog's preview"** — `_inEditPreview()`
  walks for the edit chrome. Do not "simplify" it to an attribute test.
- **`state-badge` is the entity-icon disc, NOT the Lovelace badge.** Its colour
  computation lives **inside** the `overrideImage === undefined` branch, so
  passing `""` to hide a picture also kills the colour. It sets
  `--state-inactive-color: initial` on its own host, paints an entity picture as
  a `background-image` on that host, and writes the resolved colour inline onto
  its internal `<ha-state-icon>` — nothing is exposed. Radii:
  `--state-badge-border-radius`, `…-with-image-…`, `…-with-media-image-…`.
- **`stateColorCss` computes no colour.** It returns a chain of nested `var()`
  fallbacks — `var(--state-light-on-color, var(--state-light-active-color,
  var(--state-active-color)))` — and the theme resolves it. So the state colour
  is reproducible without reading anything private: `src/state-color.ts` rebuilds
  the recipe (33 coloured domains, device class first, `slugify`d state,
  active/inactive, battery thresholds, single-domain groups, `hvac_action`,
  `rgb_color`, the brightness filter). What a copy duplicates is a **token
  naming convention**, the one every published theme redefines, and it degrades
  rather than breaks: a missing domain falls to `--state-active-color`.
- **`ha-visibility-status` is the visibility verdict, as a component.** Public
  surface: `hass`, `conditions`, and a `state` of `"visible" | "hidden" |
  "invalid"` written in `willUpdate` — so after `await el.updateComplete` it is
  current. No event, no reflection: `state` is a plain property, which is why one
  instance is cheap to drive and N instances need a controller. Mounted hidden it
  is an oracle, and its `ConditionListenersController.hostDisconnected()` calls
  `clear()`, so removing it releases every subscription. `setup()` clears first
  and returns early on an empty list, so handing it `conditions = []` genuinely
  idles it. Its icon/colour mapping is `mdi:eye` / `mdi:eye-off` /
  `mdi:alert-circle` on `ha-alert`'s `success` / `warning` / `error`, which
  resolve to `--success-color` / `--warning-color` / `--error-color`. It has **no
  icon-only mode** — it always draws a full alert with a headline and supporting
  text. Note the cost: its `willUpdate` re-runs `setup()` whenever `hass`
  changes, so it clears and re-subscribes its listeners on every tick — HA's own
  banner does the same, and an oracle beside it doubles that while the section
  is open.
- **`window.loadCardHelpers()` exposes exactly nine symbols** — `showEnterCodeDialog`,
  `showAlertDialog`, `showConfirmationDialog`, `showPromptDialog`,
  `importMoreInfoControl`, `createBadgeElement`, `createCardElement`,
  `createHeaderFooterElement`, `createHuiElement`, `createRowElement`. Dialogs
  and element factories. **No colour utility, no `computeCssColor`, nothing
  else** is reachable from a custom card. Check this list before assuming
  anything of HA's is importable.
  **Amended 2026-08-19:** the nine bound what can be *imported*, not what can be
  *used*. A custom element that HA's own panel already defines is reachable by
  tag, and a `static` on such a class is reachable through
  `customElements.get(tag)`. Ask which chunk group defines it before concluding
  a reuse is impossible — the heading badges below are the case that proved it.
- **Heading badges are available to us unconditionally** (read at 20260729.6,
  identical at our 20260527.4 floor). `app.*.js` requests chunk `79381` in the
  same `Promise.all` as the Lovelace panel itself, so `hui-heading-badge` is
  defined before our card runs. The static chain: `custom-card-helpers` →
  `create-card-element` (`heading` ∈ `ALWAYS_LOADED_TYPES`, top-level `import` of
  `hui-heading-card`) → `hui-heading-card` (top-level `import` of
  `../heading-badges/hui-heading-badge`) → `create-heading-badge-element`
  (top-level `import` of the `entity` and `button` badges, the only two the
  interface offers; default type `entity`).
  `hui-heading-badge` is a `ReactiveElement` rendering into the **light DOM**
  (`createRenderRoot(){return this}`), props `config` / `hass` / `preview`, and it
  implements `visibility` itself through `ConditionalListenerMixin` — **it
  re-evaluates on a config change, which `hui-card` does not**.
- **`hui-heading-badges-editor` is the whole "Badges" box, as one component**
  (`editor/config-elements/`). In: `.hass`, `.badges`. Out:
  `heading-badges-changed` `{badges}` and `edit-heading-badge` `{index}`. Sortable
  list, stub resolution, add dropdown, entity-not-found row — all inside. **Its
  chunk `11600` is lazy**, requested from exactly one place in the bundle:
  `HuiHeadingCard.getConfigElement()`. One line forces it —
  `await customElements.get("hui-heading-card")?.getConfigElement()`, discard the
  result — and then the guard-and-fallback rule applies, because an undefined
  custom element renders nothing at all.
- **`edit-sub-element` works from a custom card's editor.** `hui-element-editor`
  — the base of `hui-card-element-editor`, which hosts our editor — listens for it
  on the `<div class="gui-editor">` wrapping `renderConfigElement()`, imports
  `hui-sub-element-editor` and swaps through Lit's `cache()`, so our DOM survives.
  Payload `{config, saveConfig, type}`; the supported types include
  `heading-badge`, `row`, `header`, `footer`, `element`, `feature`. Firing it buys
  the back arrow, the GUI/YAML toggle and the per-type form for free.
- **Font scale**: `--ha-font-size-` `xs`10 `s`12 `m`14 `l`16 `xl`20 `2xl`24
  `3xl`28 `4xl`32 `5xl`40. `ha-card`'s `.card-header` is `2xl` at weight 400;
  the heading card's *Title* is `l` at 400 with `--mdc-icon-size: 18px`;
  `ha-heading-badge` is `m` at 400 with `--mdc-icon-size: 16px`. There is exactly
  one step between the card header and the heading card's title, and it is `xl`.
- **`DragScrollController`** (`common/controllers/`, internal, ~140 lines) is the
  heading card's drag-to-scroll for its badge row: mouse only, `scrolled` flips
  past 1px as the click-versus-drag discriminator, `scrolling` drives
  `.dragging { cursor: grabbing; pointer-events: none }`, `enabled = !preview`.
  Its companion — the `ResizeObserver` feeding `.overflowing`, the two-edge
  gradient mask and the `::before`/`::after` spacers — is a **separate** mechanism
  and can be taken without it. Trap in the companion: those spacers inflate
  `scrollWidth`, so the measurement subtracts `--ha-space-4` while the class is
  already set, or the class flip-flops.
- **The brightness filter is `brightness((brightness + 245) / 5 %)`**, excluded
  for `plant` (whose `brightness` is light *received*). 255 → 100%, 128 → 74.6%,
  1 → 49.2%. `state-badge` applies it to the glyph itself, so an icon has had it
  since 1.2.0 without us doing anything.
- **A named colour applies only while the entity is active**, in `state-badge`
  and now in ours — which is what the editor's own helper text promises.
- **A badge's icon is not `state-badge`**: `hui-entity-badge` renders `ha-badge`
  and colours it through `--badge-color`. `ha-badge`'s fill is
  `var(--ha-card-background, var(--card-background-color, white))`, **opaque**.
  It has **no `:hover` rule**: it uses a Material ripple, `--ha-ripple-color:
  var(--badge-color)`, hover `.04`, pressed `.12`.
- **Theme colour tokens come in two layers, and only one is mode-independent.**
  The `--ha-color-*` core palette is a global `html { … }` with no dark
  counterpart; the semantic layer above it comes in two copies and
  `applyThemesOnElement` writes exactly one onto `<html>` in JavaScript. A
  theme's *other* mode is unreachable.
- **Translations are per panel, not per card.** `loadFragmentTranslation` is
  called with three names in the whole bundle — `config`, `lovelace`, `energy`.
  Every Lovelace key resolves; `ui.panel.profile.*` does not.
- **`hass.formatEntityName(stateObj, name)`** resolves the composed-name
  sentinels the `entity_name` selector stores.
- **`hass-action`** is a DOM event the root `<home-assistant>` hands to
  `handleAction`. **`action-handler`** is a singleton on `document.body` with
  `bind(el, {hasHold, hasDoubleClick})`.
- **A badge is clickable when** `!tap_action || hasAction(tap|hold|double)`.
- **`ha-form` spaces its root children by 24px**; `ha-form-expandable` zeroes the
  panel's padding and wraps its body in a `.content` div at 12px.
- **`ha-form` merges the changed field onto the whole `.data` it was given**, so
  `.data` must always be the complete flat record.
- **`ha-form`'s two boolean paths render DIFFERENT controls.**
  `{ selector: { boolean: {} } }` → `ha-selector-boolean` → `<ha-switch>`.
  `{ type: "boolean" }` → `ha-form-boolean` → `<ha-checkbox>`. Neither exposes a
  token for the gap between label and control.
- **`.section-label` in `element-form.ts` carries `margin-block-end: 0.5em`** and
  is meant to sit *above* a control group; beside a control it needs its own class.
- **`ha-form` takes `icon: "mdi:…"` as first-class beside `iconPath:`.**
- **`ha-selector-select` in `mode: "list"`** never passes `orientation`, and
  exports no part — render the group yourself behind `customElements.get`.
- **`selector: { number: { mode: "box" } }`** removes the slider.
- **`ha-dropdown` is Web Awesome's dropdown**, reports its choice on `wa-select`,
  and takes `placement` — HA's own code writes `placement="bottom-end"` for a
  right-hand trigger. An unsupported placement degrades to the default position,
  so no guard is needed: nothing vanishes.
- **`hui-card` IS HA's implementation of the `visibility` key**, publishing its
  verdict through the native `hidden` attribute. Catches: `preview`
  short-circuits to visible, `_updateVisibility` returns early without an inner
  card *and* without `hass`, and a config change does not re-evaluate.
- **`hui-conditional-element` is a trap**: it signals nothing.
- **`state-display` carries no stylesheet**, so an inherited property set on the
  host reaches its text unopposed — no `::part`, no token needed.
- **`ha-expansion-panel` header slot order** is `leading-icon → header → event →
  chevron → icons`.
- **`ha-icon-button` reads `--ha-icon-button-size`**, not `--mdc-icon-button-size`.
- **The modern entity list is `hui-entity-editor`** — 48px rows, 8px apart.
- **`--ha-card-border-width` is 0 in many themes.**
- **The shipped `.js.map` files carry the raw GitHub URL of every source file.**
- Labels: `ui.panel.lovelace.editor.card.generic.<name>` for most,
  `…badge.entity.<name>` for `color` / `show_entity_picture`,
  `…picture-elements.element_types.<type>` for element kinds, `ui.common.auto`.
- `applyThemesOnElement` is internal, so a card-level `theme` cannot be honoured.
- **A view type can redefine anything for everything underneath it.**
  `hui-panel-view` saves the theme's card tokens under `--restore-card-*` then
  zeroes `--ha-card-border-radius`, `--ha-card-border-width` and
  `--ha-card-box-shadow` on `*`. Custom properties inherit, so that crosses our
  shadow DOM onto third-party content. We restore the three on `.item`, and
  `hui-card` hands us the switch (`isPanel`, reflected as `ispanel`).
  Conditional on purpose: `--restore-card-*` exists **only** under a panel view.
- **Sections grid**: 12 columns, `--row-height: 56px`, `--row-gap: 8px`.
- **Under `anchor: auto` an item sits on a fractional pixel by construction.**
  `position.ts` writes `translate(-<left>%, -<top>%)` of the item's *own* box, so
  the offset is the coordinate itself; a fixed anchor uses 0 / 50 / 100 instead.
  A `transform: scale()` animation on a non-promoted layer then re-rasterizes and
  snaps to the pixel grid differently each frame — the item visibly jumps by a
  pixel. **`will-change: transform` fixes it** (rasterize once, composite the
  scale) and this was confirmed in the user's browser on 2026-08-18. `50% / 50%`
  is the *most* likely value to show it, not the safest. Rounding the stored
  percentages would change nothing.

## The recurring traps

1. **A key that saves cleanly and does nothing** is worse than an absent one.
   Four times: `state_image` (no `entity`), `visibility`, `theme`, `title`.
2. **A mechanism can be reviewed correct and rest on a false premise.** The first
   re-anchor design was proved terminating and could never fire. So was the
   `preview` reading, and 1.2.0's colour bug. **And so was spec decision 6**,
   which refused the state colour on the premise that it was a computation —
   reading HA's source showed it was a string of variable names. **When behaviour
   or a decision rests on a claim about HA, go read HA.**
3. **What the suite cannot see — narrowed 2026-08-21, not closed.** happy-dom
   does no layout: nothing about `clamp()`, `cqw`, positioning, pointer muting,
   compositing or CSS is observable there. 1.2.0 shipped six such defects past a
   green suite and two reviews; 1.3.0 added the chromeless-circle clipping, which
   five reviews read and the user saw in seconds.
   **Since 2026-08-21 there is a second lane that CAN see those things** — real
   Chromium, real layout, `src/tests/playwright/`. It covers placement under
   every anchor, `reanchor`, the whole drag gesture, and computed styles
   including the exact 1.3.0 shape bug, which was reproduced and confirmed to go
   red. What it still cannot cover: Home Assistant's own components (they are
   stubbed, so the lane tests *our* layout around children of known size), the
   panel-versus-sections view difference, themes, and anything that needs a real
   input device — pointer capture is neutralised in the harness. **So the walk is
   shorter, not gone.** Ask which of the two lanes can answer a question before
   writing a test, and put it in the fast one whenever the answer is "either".
4. **A test that restates a constant stops guarding it.** Assert literals — which
   is why every `state-color` expectation spells the whole `var()` chain out.
5. **A test that exercises the path but cannot distinguish the defect.** The most
   expensive trap of the 2026-08-19 session: **five** tests written that round passed
   without guarding anything, each for a different reason — a crash that masked the
   real defect, a first build that never reads the array being tested, an assertion on
   an HTML attribute where the code binds a JS property, a fixture whose `.length` was
   `undefined` where the bug needed a string, and a fixture whose display and array
   indices coincided. **The rule: run every new test against the defect before keeping
   it, and record the failure text.** A green suite proves nothing about a test that
   has never been red. **Refined 2026-08-20:** confront a test with the defect *it*
   names, not with the session's headline defect. Three tests were written for the
   console rewriting and two stayed green against "no rewriting at all" — they guard
   the opposite faults (a filter that eats foreign lines, a swap never restored) and
   only went red once each was confronted with its own. A failure text recorded
   against the wrong defect is worse than none: it certifies a guard that does not
   exist.
6. **A pair of tests that check different sets is a hole.** The two localization
   tests once asserted different keys; they now share one `KEYS` list. Same
   reasoning put the shared hover block's assertions in one file, with both
   element tests asserting the *same* three selectors.

7. **Aiming five fixes at a symptom is not five attempts, it is one mistake
   repeated.** On 2026-08-21 a test file failed as a *file* while every test in it
   passed. Five fixes were tried — stubs in three different hooks, a generation
   counter, an `isConnected` guard — and two of them broke other tests. All five
   tried to guarantee a global was *present*. The answer was to make the caller
   tolerate its absence, and one instrumented run named it. **When the second fix
   for one symptom fails, stop fixing and go measure where the failure actually
   originates.**
8. **Local git tags are not the release history.** `git tag -l` stops at v1.3.1 in
   this clone; the remote has v1.4.0. Use `git ls-remote --tags origin`. A session
   read the local list, told the user 1.4.0 was unreleased, and was corrected by
   the user.
9. **Memory is a claim, not evidence.** The same session repeated "the screenshots
   are still owed" from a follow-up entry that had been settled hours earlier by a
   commit sitting in the log. Confront a memory with the repo before acting on it,
   especially any memory that says something is *owed*.

## How we work (project rules, see AGENTS.md)

- **Reuse Home Assistant's machinery rather than reimplementing behaviour** —
  but check `loadCardHelpers`'s nine exports before assuming reuse is possible,
  and when a copy is the only way, say so in the file: the upstream paths, the
  build it was reconciled against, and what happens when it drifts.
- **Ask what the view type changes under us.** Panel and not-panel are not the
  same environment. Walk both.
- Chat in **French**, everything else in English.
- Propose, then wait for validation — no edit, no dispatch, no commit without it.
- **Never `git push`** — it publishes. The user does it.
- **Leave a clean tree at the close.**
- **"On clôture" assumes a branch, but work sometimes stays on `main`** (as on
  2026-08-21). Then there is nothing to merge — and the whole-branch review is
  still owed, because what it gates is the integration, which in that case is the
  commit onto `main` itself. Launch it, do not skip it for want of a branch.
- **The user's browser walks cover a panel view and a sections view, every
  time.** They do not announce it.
- Serena's symbolic tools are primary for code.
- **A CHANGELOG entry must change what a user does.** See the auto-memory
  `changelog-is-for-users`: expected platform behaviour and corrections to
  unreleased features get cut.
- Implementation normally runs through dispatched subagents with a written brief,
  then an independent reviewer per task, then a whole-branch review — model and
  effort per AGENTS.md. **The 2026-08-18 session ran in-session instead**, on the
  harness rule that subagents are not dispatched unless the user asks. **Never
  touch git while a subagent is running**, and note that `git merge -F -` does
  not read stdin the way `git commit -F -` does.
- Review findings have repeatedly been right in conclusion and wrong in
  mechanism. Verify a claim in HA's source before dispatching a fix for it.
- **`vi` is NOT exported by `@rstest/core`** — checked at 0.11.6, still true at
  0.11.9. Spies and fake timers go through the `rstest` object — `rstest.spyOn`,
  `rstest.useFakeTimers`, `rstest.advanceTimersByTime`, `rstest.useRealTimers`. It
  works on DOM element instance methods under happy-dom.
  `src/tests/happy-dom/editor/badge-existence.test.ts` set the idiom.
- **Two test lanes since 2026-08-21, declared as rstest `projects`.** One command
  still runs both (`pnpm test`); `--project happy-dom` / `--project playwright`
  runs one — **written without a `--`, see the baseline section: `pnpm test --
  --project happy-dom` silently runs everything**. `@rstest/browser` peer-depends on `@rstest/core` **exactly**, so the
  two versions move together — and `playwright` is an *optional* peer, which pnpm
  never installs on its own, hence the explicit devDependency. Chromium binaries
  come from `pnpm exec playwright install --with-deps chromium`, which the
  devcontainer's post-create runs.
  Facts about the browser harness (`src/tests/playwright/harness.ts`) that are
  not obvious and cost time to rediscover:
  - **`ha-card` must be stubbed with `display: block`.** An undefined custom
    element is `display: inline`, so the card's own `ha-card { height: 100% }`
    does nothing and `.root` never gets a box — every measurement reads zero.
  - **The stubs are dimensioned**, unlike happy-dom's call-counting fakes. Layer
    400×300, badge 40×20, round on purpose so expectations read as arithmetic.
  - **`setPointerCapture` is neutralised globally for the lane.** It throws
    `NotFoundError` for a pointerId no physical pointer owns, and
    `@rstest/browser` 0.11.9 exposes no driver for trusted events (its only
    exports are `createBrowserExecutor` and `validateBrowserConfig`). The cost is
    precise: nothing proves a gesture survives the cursor leaving the surface.
  - **`headless: true` is set explicitly.** rstest infers it from CI, which means
    *headed* locally, and the devcontainer has no X server.
  - **`cleanup()` must release the editor registrations**, not just remove nodes:
    `activeEditor()` returns undefined unless exactly one editor is registered, so
    a leak silently disarms the drag in a later test and it passes for the wrong
    reason.
  - **HA design tokens must be set on `documentElement`** or `var(--ha-space-2)`
    resolves to nothing, the declaration is invalid at computed-value time, and
    getComputedStyle reports the initial value — a padding regression and a
    missing token then look identical.
  - **`color-mix` computes to `color(srgb …)`, not `rgb(…)`.** Assert the
    mechanism (the mix ran, the value sits between its two inputs), not the
    format, and not the ratio when the source calls it an eye value.
- **A Lit property binding (`.icon=${…}`) is a JS property, not an HTML attribute**, and
  happy-dom does not reflect one onto an undefined custom element. Assert
  `(el as { icon?: string } | null)?.icon`, never `getAttribute("icon")`. A *static*
  `icon="mdi:…"` in the template is a real attribute and `getAttribute` is right for it.
  Match the accessor to the binding — do **not** change the binding to suit the test.
- **`typescript` is the native (Go) compiler since 7.0**: `lib/getExePath.js` resolves
  `@typescript/typescript-<platform>-<arch>` and picks `tsc` or `tsgo` from the package
  name. The VS Code extension is `TypeScriptTeam.native-preview`, pointed at the
  project's own copy with `js/ts.tsdk.path` (the old
  `typescript.native-preview.tsdk` is deprecated). `ms-vscode.vscode-typescript-next`
  is the classic JS tsserver on the TS 6 line and was removed — the two compete.
- **`pnpm lint` is not silent on a clean tree**: the baseline is **25 warnings
  and 4 infos** — re-measured 2026-08-21 against `530ca40`, unchanged by the
  browser-test work. They are `noNonNullAssertion`, `useOptionalChain` and
  `useLiteralKeys`, concentrated in four happy-dom test files
  (`visibility-section` 11, `badge-list` 5, `picture-studio-card` 5, `config` 3)
  plus one in `element-form.ts`. Default output truncates at 20, so pass
  `--max-diagnostics=100` to see them all. The bar is **exit code 0**, not an
  empty output — and an implementer reporting "the lint warnings are
  pre-existing" is to be disbelieved and measured. The cheap way, used this
  session: `git archive HEAD | tar -x -C <tmpdir>` and run biome there, which
  compares the whole tree rather than one file at a time.
