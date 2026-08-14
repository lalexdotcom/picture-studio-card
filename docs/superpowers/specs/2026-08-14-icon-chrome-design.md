# Icon chrome — design

Status: approved 2026-08-14. Amends `2026-08-13-state-icon-element-design.md`.

## Problem

A `state-icon` stands on the user's photograph, not on a card. Where the picture
is busy, the glyph competes with it. The 1.2.0 answer was a filter — a white rim
and a black halo tracing the glyph's own silhouette — which helps and does not
always suffice: against a light wall a light icon still dissolves.

The answer here is the one Home Assistant already gives everywhere else: put the
icon on **its own surface**. A Lovelace badge is exactly that, and its recipe is
worth copying literally.

**The whole change is one wrapper.** A `div` around the existing `state-badge`,
carrying `overflow: hidden`, a radius, a fill and the filter. Nothing outside the
element moves. That framing is the spec's main constraint: any design pressure to
touch positioning, dragging or sizing means the design took a wrong turn.

## What a badge is actually made of

Verified in the frontend at build `20260729.6`:

- `ha-badge` — background is `var(--ha-card-background, var(--card-background-color, white))`,
  **opaque**, radius `calc(size / 2)`, border `--ha-card-border-color`.
- `hui-entity-badge` — sets exactly one thing on it, `--badge-color`, from
  `_computeStateColor` (a light's corrected `rgb_color`, else `stateColorCss`).
  That token colours the **glyph**, never the fill.

So: **surface from the theme, glyph from the state.** Not the tile card's recipe,
which tints the fill with the state colour at low opacity — a translucent fill
lets the photograph through, which is the very problem being solved.

## Config

```yaml
config:
  type: state-icon
  entity: light.salon
  size: { mode: auto }        # unchanged — the element's box
  chrome:                     # absent => no chrome
    theme: none               # none | auto | light | dark
    radius: 50                # percent, 0-50
    opacity: 1                # 0-1
    content_ratio: 0.6        # 0-1
```

**`theme` carries the switch**; there is no `enabled` boolean. `none` — or an
absent `chrome` — draws nothing. The three other values turn it on *and* say what
the surface is made of.

This is 1.2.0's rule applied unchanged: **the mode overrides, it never erases.**
Turning the chrome off keeps a tuned radius and opacity, exactly as switching
`size` back to `auto` keeps its numbers. It also mirrors the `color` key already
in this config (`none | state | a colour`), so the shape is one the user has met.

**`content_ratio`, not `ratio`**, because `size.ratio` already exists next door
with an unrelated meaning (a percentage of the card's width, in `cqw`). Two
neighbouring `ratio` keys that mean different things is a trap for whoever reads
the YAML next. The prefix names what it scales: whatever is drawn *inside* the
chrome — glyph or entity picture, indifferently.

**Defaults are `50`, `1`, `0.6`.** The last one is Home Assistant's own 24/40
glyph-to-box ratio.

### Reopening a 1.2.0 decision, deliberately

`2026-08-13-state-icon-element-design.md` says: *"One value drives the whole
visual footprint … Home Assistant's own 24/40 glyph-to-box ratio is not
reproduced — the production setting reasons about the glyph, and two numbers for
one size would be two numbers to tune."*

With a chrome, that ratio is precisely what is needed, and the second number is
accepted: **`size` is the chrome's box, `content_ratio` is the share of it the
content takes.** The reasoning that rejected it does not survive the arrival of a
surface — a box with nothing in it but a glyph needs one number, a box with a
glyph *on* something needs two.

The old behaviour is still the default: with no chrome, `content_ratio` is not
read and the content fills the box, pixel for pixel as today.

### Colour resolution

| `theme` | fill |
| --- | --- |
| `auto` | `var(--ha-card-background, var(--card-background-color, #fff))` |
| `light` | `var(--ha-color-white, #fff)` |
| `dark` | `var(--ha-color-neutral-10, #202020)` |

Every mode is a chain of Home Assistant's own tokens; nothing here is a colour of
ours. `auto` copies what `ha-badge` does, and needs neither `hass` nor
`darkMode` — the chain is written into the style and the browser resolves it.

**The forced modes work because the palette layer is mode-independent.** The
`--ha-color-*` core tokens are emitted as one global `html { … }` stylesheet with
no dark counterpart, so both are readable whichever mode is active. What does
come in two copies is the *semantic* layer above them — Home Assistant builds its
own surfaces exactly this way:

```
--ha-color-surface-default: var(--ha-color-white)        /* light */
--ha-color-surface-default: var(--ha-color-neutral-10)   /* dark  */
```

The forced modes reach past that switch and name the palette entry directly. A
theme that redefines the palette redefines them with it; the literal at the end
of each chain is only a last resort. Both tokens are present at `20260527.4`, the
frontend pinned by our 2026.6.0 floor.

Reaching for *the theme's other mode* is what is impossible, and it is worth
recording why. `applyThemesOnElement` picks `darkSemanticVariables` /
`darkColorVariables` (or a custom theme's `modes.light` / `modes.dark`) **in
JavaScript** and writes *that single set* as custom properties on `<html>`. Both
sets are plain JS objects, never two CSS blocks under different selectors — when
dark is active the light values are simply absent from the document. So `light`
cannot mean "this theme, its light variant"; it means the palette's light
surface, which is the closest honest thing.

Minor consequence to keep in mind while walking the browser: in dark mode `auto`
resolves to `--card-background-color` (#1c1c1c, the legacy variable a card still
uses) while forced `dark` gives #202020. Four values apart, imperceptible, and
deliberate — `auto` follows the card, the forced modes follow the palette.

The glyph's colour source does not change — it stays the existing `color` key,
i.e. the state colour. That is the badge recipe.

## Rendering

```html
<div class="chrome">
  <state-badge …></state-badge>
</div>
```

```css
.chrome {
  position: relative;
  /* Explicit: the shadow root has no global reset, so the default is
     content-box. Border-box keeps the outer box at exactly --psc-icon-size
     whatever is drawn on its edge — see "Room left for a border" below. */
  box-sizing: border-box;
  width: var(--psc-icon-size);
  height: var(--psc-icon-size);
  border-radius: var(--psc-chrome-radius, 50%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  /* moved off :host — the wrapper carries the chrome, halo included.
     Same two tokens and same defaults as 1.2.0, unchanged. */
  filter: drop-shadow(var(--psc-icon-outline, 0 0 1px rgba(255, 255, 255, 0.4)))
    drop-shadow(var(--psc-icon-glow, 0 0 3px rgba(0, 0, 0, 0.6)));
}
.chrome::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--psc-chrome-fill);
  opacity: var(--psc-chrome-opacity, 1);
}
state-badge {
  width: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
  /* height and --mdc-icon-size follow the same expression */
}
```

**The host's box is always `--psc-icon-size`, chrome or no chrome.** That single
property is what keeps the rest of the card inert.

**Why the filter moves to the wrapper.** `drop-shadow` traces the rendered alpha
of the subtree, so on an empty wrapper it traces the glyph — identical to today —
and on a filled one it traces the disc. The token names `--psc-icon-outline` and
`--psc-icon-glow` are unchanged, so a dashboard tuning them keeps working. One
consequence worth documenting: at `opacity < 1` the rim and halo follow the
disc's reduced alpha and weaken with it.

**Entity pictures need no special case.** `state-badge` paints the picture as a
`background-image` **on its own host** (`background-size: cover`), while the glyph
is a child `ha-state-icon` sized by `--mdc-icon-size`. Sizing `state-badge`
therefore scales picture and glyph in one gesture, and `content_ratio` applies to
both — a picture is inset like a glyph, with a ring of surface around it.

The chrome's radius is handed down (`--state-badge-border-radius`,
`--state-badge-with-image-border-radius`, `--state-badge-with-media-image-border-radius`),
so at `content_ratio: 1` picture and chrome share one silhouette and the chrome
*becomes* the picture's frame. `overflow: hidden` is the safety net under that.

### Room left for a border

The chrome ships **without a CSS border**: the filter's white rim already draws
that line, it follows the real silhouette, and it is already tunable through
`--psc-icon-outline`. Whether a 1px border adds anything *next to* that rim is a
question only the browser can answer, so it is deferred to the walk rather than
guessed at here.

The layout is prepared for the answer either way, and two facts make adding one
cheap:

- `box-sizing: border-box` keeps the outer box at `--psc-icon-size`, so a border
  is drawn inward and no existing item shifts. It costs contrast at the bottom of
  the `clamp()` — at 24px a 2px border leaves 20px of surface and a 14px glyph.
- **The drag needs no change to count it.** `createDragController` measures
  `hit.element.getBoundingClientRect()`, which is the *border* box, and that
  measurement feeds the ratcheting bounds and `toPercent` alike. Whatever the
  final outer size, what is clamped and what is stored agree. The only thing that
  would break this is a size that changes *during* a gesture — the box is
  measured once at `pointerdown` — and a border is static.

Should the walk call for one, the whole cost is one key and one declaration. Its
colour would face the same problem the fill just solved: it must hold against an
unknown photograph, which no theme token can promise.

## What does not move

Stated as a requirement, not an observation:

- `src/position.ts`, `src/card/drag-layer.ts` — the card measures the item
  wrapper, whose size is `--psc-icon-size` either way. Drag bounds, the ratchet
  and anchoring are untouched.
- `src/element-size.ts` — `iconSizeCss` returns the same string as before.
  `content_ratio` is applied in CSS, inside the element.
- The hit target, the hover grow, the `clickable` attribute and the
  `action-handler` binding stay on the host. The follow-up note had them moving
  because it assumed a chrome *larger* than the box; this layout avoids that.
- `src/config.ts`'s item families, `visibility`, stacking order, the editor hub.

## Where the calculation lives

A new pure module `src/chrome.ts`, modelled on `element-size.ts`:

```ts
export type ChromeTheme = "none" | "auto" | "light" | "dark";
export interface Chrome {
  theme: ChromeTheme;
  radius: number;         // percent, 0-50
  opacity: number;        // 0-1
  content_ratio: number;  // 0-1
}
export const DEFAULT_CHROME: Chrome;
export const normalizeChrome: (raw: unknown) => Chrome;
export const isDefaultChrome: (chrome: Chrome) => boolean;
export const chromeFill: (theme: ChromeTheme) => string;
```

Everything that decides is testable without layout; the element only writes
custom properties on the host, as it already does for `--psc-icon-size`.

`normalizeChrome` returns exactly those four fields. `chrome` is a closed record
of ours, so an unknown key inside it is dropped, the way `normalizeIconSize`
drops one inside `size`. The rule that nothing may vanish sits one level up, on
the element's `config`, where `normalizeElementConfig` spreads the raw object.

`isDefaultChrome` compares **all four** fields. Without that, `storedConfig` —
which rewrites the whole config on every editor commit — would either write a
full `chrome` block into everyone's YAML on the first drag, or drop a tuned one.
That is the `size` trap, already paid for once.

**`chrome` is optional on `StateIconConfig`, where `size` is required**, and the
difference is not an oversight. An absent `size` cannot be reasoned about —
`iconSizeCss` switches on `mode`, so the object has to exist — while an absent
`chrome` already means precisely what `DEFAULT_CHROME` means: draw nothing. The
element reads it as "no chrome" and writes no custom property at all, which also
spares thirty-odd test literals a field that says nothing.

Out-of-range numbers are clamped on read (`radius` 0–50, `opacity` 0–1,
`content_ratio` 0–1) and never written back in clamped form.

## Editor

A section of its own, read top to bottom as a decision then its settings:

1. **a checkbox** — draw a chrome, or not;
2. **the theme, three choices on one line** — auto, light, dark;
3. **the three numbers**, in a grid, `selector: { number: { mode: "box" } }` so
   no slider appears.

**`none` never appears in the interface.** It is a storage value, not a choice
the user makes: the checkbox is what says whether there is a chrome, and the
theme control only ever offers the three that draw something. Unchecking writes
`theme: none` and keeps every number, which is the whole reason the switch lives
on `theme` rather than on a boolean of its own.

Checking the box sets `auto`. A theme chosen before unchecking is not restored —
`none` overwrote it — and remembering it would mean carrying editor state beside
the config. Whether that round trip is annoying enough to be worth the state is a
question for the browser walk.

**This forces a hand-built `ha-expansion-panel`, not an `expandable` entry in the
schema**, because a three-way choice on one line cannot come from `ha-form`:
`ha-selector-select` in `mode: "list"` never passes `orientation` to
`ha-radio-group`, and the attribute has no exported part, so no CSS can lay it
out horizontally. The size control solved this already — render `ha-radio-group`
ourselves, guarded by `customElements.get`, with an `ha-form` select as the
fallback since an undefined custom element renders nothing at all, silently.
Copy that shape rather than inventing a second one. The panel sits beside "Size
and position", before it.

**The theme's four labels are Home Assistant's**, taken from the map card, which
carries this exact option under this exact name:

```
ui.panel.lovelace.editor.card.map.theme_mode         Theme mode / Mode du thème
ui.panel.lovelace.editor.card.map.theme_modes.{…}    Auto / Light|Clair / Dark|Sombre
```

The identically-worded `ui.panel.profile.themes.dark_mode.*` was the other
candidate, and the more durable name — preferences outlive cards. It was
rejected on availability. Neither set is in the always-loaded core catalog; both
live in a fragment; and the frontend calls `loadFragmentTranslation` with
exactly three names — `config`, `lovelace`, `energy`. Never `profile`. A
preference key would therefore resolve only for a user who had opened their own
profile page in the same session, and read English for everyone else.

**A fragment is per panel, not per card.** The `lovelace` fragment is one JSON
per language holding every Lovelace key, every card editor's included, fetched
when the panel loads — card *chunks* are lazy, their translations are not. So
the map keys resolve on a dashboard that has never seen a map card. Our own
existing labels are the proof: `ui.panel.lovelace.editor.card.generic.*` and
`…badge.entity.*` come from that same fragment and already render in French,
with no "generic" card anywhere.

Only the section title, the checkbox and the three number labels come from our
own `strings.ts`.

The layout is expected to be adjusted at delivery, with the section on screen.

## Verification

Unit tests on `chrome.ts` — normalization, defaults, unknown keys preserved,
clamping, the storage round trip — and on the element, asserting the custom
properties it writes.

**A browser walk is mandatory.** Neither `border-radius`, `overflow`, `filter`,
`opacity` nor the ratio is observable under happy-dom, which does no layout. This
is exactly the category of the six real defects that survived a green suite, a
per-task review and a whole-branch review in 1.2.0. Points to walk: chrome on a
glyph, chrome on an entity picture at 0.6 and at 1, a square-ish radius, opacity
below 1, both forced themes against a dark and a light photograph, and an
unchanged render with `chrome` absent.

One decision is taken *during* the walk rather than before it: with the rim in
front of us, is a 1px border worth adding? Answer it there and record the verdict
in this file.

## Release

1.3.0, with per-item visibility. The chrome is **off everywhere** — absent from
existing YAML and absent from the stub of a newly added element — so no dashboard
changes on upgrade and the CHANGELOG entry goes under `Added`, not `Changed`.
