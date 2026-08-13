# Per-tick work in the card — design

Status: approved 2026-08-13. Amends `2026-08-11-picture-badges-design.md`.

## What actually happens today

Home Assistant republishes its `hass` object on **every state change of any
entity**, not only the ones a card uses. Our card reacts to each of those:

```ts
set hass(hass: HomeAssistant) {
  this._hass = hass;
  if (this._bgElement) this._bgElement.hass = hass;
  for (const el of this._elements) el.hass = hass;
  this.requestUpdate();          // <- schedules a full update cycle
}

protected updated(): void {      // <- takes no changedProperties
  this._syncEditingAndDrag();
  void this._syncBackground();   // rebuilds _bgConfig, calls setConfig
  void this._syncBadges();       // calls setConfig on every badge
}
```

So for a card with N badges, every tick costs `1 + N` calls to `setConfig` for
a configuration that did not change, and pushes `hass` **twice** to each of the
`N + 1` elements — once from the setter, once from the sync methods. With three
badges and ten ticks: 40 redundant `setConfig` calls and 80 `hass` assignments,
where 0 and 40 would do. Exact totals are in the testing section below.

A detail that makes the fix cleaner than it looks: `requestUpdate()` **with no
argument** schedules an update but records nothing in `changedProperties`. On a
`hass` tick, `updated()` therefore already receives an empty map — and
resynchronises everything anyway, because it never looks.

## What is *not* established, and is not claimed

**No symptom has been observed.** Nobody reported a slow card, a janky drag or
a hot laptop. Nothing here has been profiled, and this design does not claim a
speed-up. Framing this as "performance work" would be dressing up a suspicion
as a measurement.

## The argument that does hold

`setConfig` has a meaning: *here is your configuration*, said once. Home
Assistant's own container never says it twice — `hui-card` calls
`createCardElement` and rebuilds the element on every config change, a fact
already established in this project (and the one that killed the first
re-anchor design).

So calling `setConfig` on a third-party badge every second does something no
part of Home Assistant does, to code that was never written to expect it. A
badge that initialises state, starts an animation, or registers a subscriber in
`setConfig` has never been exercised this way. That is a correctness argument,
and it does not depend on knowing whether `setConfig` is expensive.

The weaker argument stands on its own anyway: an unnecessary call is not
justified by being cheap.

## The change: the trigger, not the synchronisers

None of the three sync methods is at fault. What is at fault is that they are
called on every tick. `updated(changed)` reads its argument:

| Sync | Runs only when |
| --- | --- |
| `_syncBackground` | `_config` changed, or first update |
| `_syncBadges` | `_config` changed, or first update |
| `_syncEditingAndDrag` | `editing` changed, or first update |
| `_applyPositions` | `_config`, `editing` or `selected` changed |

The `_syncEditingAndDrag` row looks circular — it is the method that *sets*
`editing`, gated on `editing` having changed — and it is not. The method has
two halves: it reads the broker and assigns `editing` / `selected`, then
attaches or detaches the drag, which needs `renderRoot` and so cannot run
before the first render. The broker subscription calls it for the first half;
the assignment schedules an update; `updated()` calls it again for the second
half, now that `.root` exists. The existing comment in the method says exactly
this. Gating it on `editing` is what closes that chain, not what breaks it.

And `requestUpdate()` **leaves the `hass` setter**. It buys nothing: `render()`
reads `_config.title` and `editing`, never `hass`.

**Why removing it is safe, verified rather than assumed.** Editing detection is
driven by the broker, not by ticks: `connectedCallback` subscribes through
`subscribeEditors`, which invokes the listener immediately and on every broker
change, and `editing` / `selected` are `state: true` properties whose own
assignment schedules an update. Nothing in that chain needs a `hass` tick.

**What stays, because it is the legitimate work:** the setter keeps pushing
`hass` down to the background element and to every badge. That push is what
makes a badge show a new state. What disappears is the *second* push, made
again by the sync methods, and the `1 + N` redundant `setConfig` calls.

**Two follow-up items become moot.** `_syncEditingAndDrag` doing a
`querySelector(".root")` per render, and `_applyPositions` rewriting three style
properties that did not change, only cost anything because `updated()` ran on
every tick. Once it does not, they run on real changes — rarely. Fixing them
separately would add code for a problem this change removes.

## Testing

### The harness, and why it is worth building

The project has no component test at all: its nine test files cover pure
modules, and `src/card/` is reached only by `drag-threshold.test.ts`, on
extracted logic. This change needs the first one.

- `happy-dom` as a dev dependency, and an `rstest.config.ts` declaring
  `testEnvironment`. `rstest` supports `node`, `jsdom` and `happy-dom` natively;
  neither DOM is installed today. If custom elements or `adoptedStyleSheets`
  misbehave under `happy-dom`, switching to `jsdom` is one word.
- A `mountCard()` helper that stubs `window.loadCardHelpers`, whose
  `createHuiElement` and `createBadgeElement` return fake elements **counting**
  their `setConfig` calls and `hass` assignments.
- One test file, `src/tests/card/picture-studio-card.test.ts`.

**The rejected cheaper option:** extract the "given what changed, what must
resync" decision into a pure function, test it with no DOM at all, and leave
`updated()` as three lines of dispatch. It costs nothing and matches the
pattern held by `position.ts`, `config.ts` and `badge-items.ts`. It was
rejected as the *only* test because the claim we care about — "no `setConfig`
per tick" — is a property of the wiring, not of the decision. This card's
wiring is where the project has twice been wrong while reasoning correctly (the
card-side anchor diff, and the reading of `preview`), both settled in a browser
after passing on paper. A test that validates the decision but not its
connection would repeat that mistake one level down.

**No real browser.** `rstest` can drive one, up to Playwright. It would buy
nothing: what we assert is a call count, which needs a DOM complete enough for
Lit's lifecycle, not layout, paint or real CSS. The one part of this card that
would need a real browser is `reanchor()`, which measures `.layer` via
`getBoundingClientRect` — not on the tick path, and not what is tested here.

### The three assertions

Written **before** the fix, so they fail on the current code with the real
numbers. That is what makes "measure before fixing" executable.

1. **After mount, N `hass` ticks add no `setConfig` calls at all**, and push
   `hass` exactly once per element per tick.

   The exact numbers, for three badges and ten ticks. At mount, `setConfig` has
   been called **once** — on the background element only. Badges are built by
   `createBadgeElement(item.config)`, which carries the config in, so nothing
   calls `setConfig` on them; the background is created from `_bgConfig` and
   then explicitly configured. So the assertion is that the total stays at
   **1**, where today it reaches **41** (four elements × ten ticks, plus the
   one). `hass` assignments total **40** — four elements, once each per tick —
   where today they reach **80**.
2. **A config change still reconfigures the badges.** The guard against an
   over-zealous fix: gate wrongly and you win the counter but lose the feature.
3. **A `selected` change reapplies positions and reconfigures nothing.** The
   mixed case, where gating can err in either direction.

### What the harness cannot prove

That Home Assistant's real badges still show state changes. The harness counts
calls on fakes; it says nothing about what Mushroom does with its `hass`. So
the change is checked in the local container — already running — before the
branch closes, as every previous delivery was.

That check is also where the opening argument is settled: if a third-party
badge misbehaved under repeated `setConfig`, it will now behave. If none did,
the change has "only" removed unnecessary work, which was reason enough.

## Out of scope

- Any profiling, benchmark or timing assertion. The metric is a count.
- The two moot follow-up items, fixed by consequence rather than by edit.
- `reanchor()` and drag geometry, which this change does not touch.
