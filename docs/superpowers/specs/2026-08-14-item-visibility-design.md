# Item visibility — design

Status: approved 2026-08-14. Amends `2026-08-11-picture-badges-design.md` and
`2026-08-13-state-icon-element-design.md`.

## Problem

An item on the picture is always drawn. Home Assistant has a general answer to
"draw this only sometimes" — the `visibility` key, a list of conditions, offered
by a tab in every card and badge dialog — but that answer is evaluated by the
*container*, and our card is the container of its items. So a `visibility:`
written inside a badge's own config here saves cleanly and does nothing.

That is trap #1 of the project memory, and this design closes it: **the key moves
up to the item, where we can honour it**, and it keeps Home Assistant's name,
Home Assistant's editor and Home Assistant's evaluation.

The card's own visibility is already native — `hui-card` wraps every card in a
view and evaluates `config.visibility` itself, whatever the card type. Nothing to
do there, and nothing to duplicate. Once this ships the hierarchy reads the same
way at every level: view, section, card — Home Assistant — then items, us.

## Config

```yaml
items:
  - type: badge
    position: { top: 30%, left: 45% }
    visibility:
      - condition: state
        entity: binary_sensor.night
        state: "on"
    config: { type: entity, entity: light.salon }

  - type: element
    position: { top: 45%, left: 20% }
    visibility:
      - condition: screen
        media_query: "(min-width: 768px)"
      - condition: user
        users: ["abcdef…"]
    config: { type: state-icon, entity: light.salon }
```

`visibility` sits on the item, beside `position` and `anchor` — never inside
`config`. Two reasons, and both are load-bearing:

- a badge's `config` belongs to a third party, and its own editor rewrites it
  whole, so a key we put there would be erased on the next edit;
- `visibility` inside a badge config is exactly the dead key this design exists
  to replace.

Conditions are **and**-ed, as everywhere in Home Assistant: the item is drawn
when every entry is met. An absent or empty list means always drawn.

## Types, normalization, storage

`ItemBase` in `src/config.ts` gains:

```ts
/** Home Assistant's condition list. Opaque: their schema, never ours. */
visibility?: VisibilityCondition[];
```

with `VisibilityCondition = Record<string, unknown>` in `src/types.ts`. The
contents are **never read, validated or rewritten** — the same contract as
`BadgeConfig`, for the same reason: the schema is Home Assistant's, it has grown
to nine condition types, and it will grow again. Declaring their union here would
buy nothing and would have to be maintained.

- **Normalization.** Absent stays absent. Present and not an array raises, with
  the item's index in the message, like every other item error. Present and an
  array is carried through untouched.
- **Storage.** The key is omitted when absent *or empty*. That is Home
  Assistant's own rule — `hui-card-visibility-editor` deletes `visibility` when
  its list falls back to zero — and it matches what `storedConfig` already does
  for `anchor` at its default: a config that never used the feature comes back
  exactly as it went in.
- **No migration.** A `visibility` an author wrote inside a badge's `config`
  stays there, inert. Moving it would mean reading and rewriting a third party's
  payload, which the badge contract forbids.

## Evaluation: reuse, do not reimplement

Conditions are evaluated by `checkConditionsMet`, a module function in the
frontend bundle with no global export. The nine types it covers include `time`
(which needs a clock and a recomputed timer), `screen` (media-query listeners),
`user`, `location` and `view_columns`. Reimplementing that is a drift machine,
and not drifting is the project's stated requirement.

**A `hui-card` per conditional item does the evaluation for us.** It is the
component that *implements* `visibility`, so instrumenting it is not a
detour — verified in `src/panels/lovelace/cards/hui-card.ts`, at
`20260729.6` and at `20260527.4`, our floor:

```ts
private _setElementVisibility(visible: boolean) {
  if (!this._element) return;
  if (this.hidden !== !visible) {
    this.style.setProperty("display", visible ? "" : "none");
    this.toggleAttribute("hidden", !visible);   // line 281 at both versions
    fireEvent(this, "card-visibility-changed", { value: visible });
  }
  …
}
```

The host stays in the DOM and carries the verdict as the native `hidden`
attribute. **That is the whole mechanism, and it needs no JavaScript of ours to
reach the item**: an adjacent-sibling rule does it.

```css
.probe { display: none !important; }
.probe[hidden] + .item { display: none; }
```

`!important` beats the inline `display` Home Assistant drives on the probe,
without touching the attribute, which is the signal. `this.hidden` is the IDL
property, a reflection of the attribute, so CSS cannot perturb the comparison.

Three properties of `hui-card` this design depends on, all read in their source:

- **`preview` short-circuits the evaluation** and forces visible. It is bound to
  our own `preview`, not to `editing`: our `preview` is true both in the edit
  dialog *and* on a dashboard in edit mode, which is exactly when Home Assistant
  keeps its own hidden cards on screen.
- **`_updateVisibility` returns early without an inner element**, so the probe
  needs a card inside it. See the next section.
- **The Lit context it consumes (`maxColumnsContext`, for `view_columns`)
  resolves through shadow roots** — `context-request` is `composed: true` — so a
  probe in our shadow root, under a sections view, receives the column count
  normally. In a masonry view no provider exists and the condition evaluates
  true, which is Home Assistant's own behaviour for a card in the same place.
  No divergence to document.

## The phantom card

`src/card/visibility-probe.ts` registers `picture-studio-visibility-probe`: a
card of about fifteen lines whose `setConfig` accepts anything, whose
`getCardSize` returns 0, which renders nothing and ignores `hass`. It is **never
added to `window.customCards`**, so it never appears in the card picker.

The probe config is therefore
`{ type: "custom:picture-studio-visibility-probe", visibility }`.

Rejected inner cards, and why: a real Home Assistant card (`markdown`, `button`)
costs a chunk load, a render and a `hass` propagation per item, and the markdown
card can open a template subscription on the websocket — a variable cost
scattered through code we do not own, paid for a card we set to `display: none`.
A deliberately invalid type falls back to `hui-error-card`, which does set the
inner element, at the price of console noise that would read as a bug to the
first person who opens the devtools.

## Card wiring

In `_syncItems`, for each item that carries conditions **and only when `editing`
is false**: create a `hui-card`, set `.config`, `.preview = this.preview`,
`.hass`, call `.load()`, and insert it immediately before the item's wrapper with
class `probe`. An item with no conditions gets no probe at all.

No probe in the editor is deliberate, and safe: `editing` is a property of the
card's mounting context, not a state that evolves. A card is born in the edit
dialog or on a dashboard and stays there until it is destroyed — the only
true→false transition happens during teardown, on an element about to be
removed. The false→true transition at mount is the one that exists, and it is
benign in the only direction it can occur: a probe created before the editor
announces itself has `preview` true, so it forces visible instead of evaluating.

Two adjustments to existing code:

- **The rebuild key** — `${item.type}:${String(item.config.type ?? "")}` today —
  gains the presence of conditions. Without it, adding a condition to an item
  would not create its probe, because the shape would look unchanged.
- **The `hass` setter** feeds the probes as it feeds the items. This is the
  per-tick path, so it stays a plain loop with no `requestUpdate`, per
  `2026-08-13-per-tick-work-design.md`.
- **A `preview` change is pushed to the probes**, in `updated()`. Not symmetry:
  `preview` is set on every card of a dashboard entering edit mode, and it is
  what keeps Home Assistant's own hidden cards on screen. A probe built while it
  was false would go on evaluating, and an item hidden by its conditions would
  stay invisible to the person trying to edit it. It also closes the mount-order
  race described above rather than merely tolerating it.

The probe must stay in the DOM — `display: none` is not detachment — for the
context resolution described above.

## Editor

A shared `picture-studio-visibility-section`, mounted by both `badge-form` and
`element-form`, the way the anchor picker already lives a double life.

It renders an `ha-expansion-panel outlined` modelled on the existing Position
section: `mdi:eye` in `leading-icon`, the title in `header`, and in the **`icons`
slot** — the trailing zone of the header, before the chevron — an `ha-label
dense` carrying the number of top-level conditions, absent when there are none.
`dense` is 20px tall over `rgba(var(--rgb-primary-text-color), 0.15)`: a quiet
pill, not a notification badge. The panel exposes five slots — `leading-icon`,
`header`, `secondary`, `event`, `icons` — so this needs no styling of ours.

The content is `hui-card-visibility-editor`, handed `.hass` and
`.config = { visibility }`, read back from `ev.detail.value.visibility` on
`value-changed`, and relayed to the editor hub, which commits it the way it
already commits `anchor` and `position`.

Taking the whole editor rather than `ha-card-conditions-editor` alone is
deliberate. It brings two things we would otherwise have to build or do without:
`ha-visibility-status`, the live verdict banner at the top of the section
(`visible` / `hidden` / `invalid`, re-evaluated on its own listeners), and the
`ContextProvider` for `conditionsEntityContext`, which the entity-less condition
sub-editors consume.

**A guard is mandatory.** `hui-card-visibility-editor` and
`ha-card-conditions-editor` are inlined in exactly **one** chunk of the shipped
frontend — the level of `ha-tile-icon`, the least available component this
project has looked at. The bet is sound, since that chunk is loaded by the edit
dialog our form lives inside, but an undefined custom element renders **nothing,
silently**, so the section falls back to the "edit this in the YAML tab" message
`badge-form` already uses for a badge with no visual editor. For reference, the
other components used here sit at 25 chunks (`ha-expansion-panel`), 24
(`ha-label`), 7 (`hui-card`) and 4 (`ha-visibility-status`).

## The preview marker

An item that carries conditions is marked in the edit preview, where items are
actually selected. The marker says **"this item has conditions"**, not "it is
hidden right now": with no probe in the editor there is no verdict to read, and a
static mark is the better affordance anyway — it does not flicker with entity
state. The live verdict stays where Home Assistant puts it, in the form's banner.

The mark is a small numbered pill in the style of `ha-label dense`, but **drawn
by the card**: it must hold at 14px and be placed to the pixel, and the card
depends on no Home Assistant component beyond `ha-card` — a component that failed
to load would lose the mark in silence.

It is an **out-of-flow pseudo-element**, absolutely positioned inside the
wrapper, which is already a containing block. Three consequences:

- it contributes nothing to the wrapper's `width: max-content`, so the hover
  halo, the selection ring and the border radius keep tracing the item alone and
  never enclose the mark;
- **the drag is unaffected** — `getBoundingClientRect` returns an element's own
  border box, not the union with overflowing descendants — so the clamp keeps
  measuring the same width it measures today;
- it needs its own `pointer-events: none`: the existing
  `.editing .item > * { pointer-events: none }` matches real children, not a
  pseudo-element.

**The corner is chosen by a pure function** in `position.ts`, from the stored
coordinates alone: the pill sits on the side pointing towards the inside of the
card —
left when the item is in the right half, below when it is pinned to the top — so
it is not clipped by the card's `overflow-x: hidden`. No layout is read: happy-dom
performs none, and the drag deliberately avoids measurements outside
`pointermove`. It is applied as a class in `_applyPositions`, which already
iterates with the position at hand; the item under the cursor is skipped there,
so the corner flips on release rather than mid-gesture.

## One exception to "no z-index"

The selected item — and the item being dragged, since selection arrives through a
re-render that pointer capture can precede by a frame — is raised above the
others in the edit preview:

```css
.editing .item.selected,
.editing .item.dragging {
  z-index: 1;
}
```

This amends a decision the project memory lists as settled. The rule protected
one thing: that the **rendered** stacking has a single, legible authority, the
list order. This is not that — it is an editor affordance, it never reaches the
config, and it does not exist on a dashboard. The rule becomes: *no `z-index` in
the rendered stacking; one exception, editor-only, for the selected or dragged
item.*

The alternative — moving the node to the end of the layer while selected — works
too (the drag reads its index from the dataset, not from DOM position), but it is
more machinery for the same result, and moving a node mid-gesture is how pointer
captures get lost.

## Strings

One label, the section title:
`ui.panel.lovelace.editor.edit_card.tab_visibility` → "Visibility", read from the
container's translation files. It is the neutral one of the four Home Assistant
ships — `edit_badge`, `edit_card`, `edit_section` and `edit_view` all resolve to
the same word — and our section covers both item families. Our own `strings.ts`
catalogue stays the fallback, as everywhere else. The condition editor supplies
every other string itself.

## Testing

- `config.test`: normalization accepts a list, raises on a non-list, carries an
  unknown condition type through untouched; storage omits the key when absent and
  when empty, and a round trip changes nothing.
- `position.test`: the corner function, over the four quadrants and the ten
  anchors.
- the card test: a probe is created for a conditional item and not for a plain
  one, none at all while editing, the rebuild key reacts to conditions appearing
  and disappearing, and `hass` reaches the probes.
- the editor tests: the section emits on `value-changed`, the count in the header
  follows the list, an empty list clears the key, and the fallback renders when
  the Home Assistant editor is undefined.

## Browser verification

**Mandatory, not optional.** happy-dom performs no layout and applies no CSS, so
the sibling selector, the `!important`, the real hiding, the pill's placement and
the stacking are all invisible to the suite. Trap #3 of the project memory counts
six real defects that survived a fully green suite, a per-task review and a
whole-branch review in 1.2.0 — every one of them found in the browser within
minutes.

The walk must cover, at minimum: an item hidden by a state condition on a real
dashboard; the same item visible again when the condition flips; the dashboard
switched to edit mode, where it must reappear; the edit dialog, where every item
is visible and the marker is present; the marker's corner near each edge of the
picture; and a `screen` condition resized across its breakpoint, which is the
listener path rather than the `hass` path.

## Documentation and versioning

- README: the `visibility` key documented on the item, with a note that the
  card's own visibility is native and needs nothing from us.
- CHANGELOG, under `unreleased`: an `Added` entry for per-item visibility.
- `package.json` stays on the last shipped version until the bump is decided.
  The release is **1.3.0** — the key is additive — and a second feature, the
  chrome around a state-icon, joins it from another session.
- The project memory needs two amendments: the "no z-index, ever" rule as
  restated above, and the 1.2.0 publication status, which claims nothing is
  pushed when everything is.

## Rejected alternatives

- **Reimplementing `checkConditionsMet`.** Nine condition types, media-query
  listeners, recomputed timers for `time`, and a context for `view_columns` — all
  of it drifting the next time Home Assistant adds a type. The failure mode is
  silent: an item that stops obeying its own config.
- **`hui-conditional-element` as the probe.** It does not extend
  `hui-conditional-base`: it is a bare `HTMLElement` that appends and removes its
  `elements` children and sets **neither `hidden` nor `display`** on itself. With
  an empty `elements` list it signals nothing at all.
- **`hui-conditional-card` as the probe.** It works, but it requires a `card:`
  anyway and reads `conditions:` rather than `visibility:` — one more indirection
  and one more vocabulary for no gain over the component that implements the key
  we are storing.
- **Reading the verdict through `card-visibility-changed`.** A typed event, and a
  sturdier contract than an attribute, but it costs a listener per item to
  reproduce what one CSS rule already does. Kept in reserve: it is the fallback
  if the attribute signalling ever changes.
- **A probe in the editor, to dim the items that are hidden right now.** Home
  Assistant does not do this — `hui-section` merely propagates `preview` to its
  cards, and no marker exists anywhere on a dashboard. It would also cost one
  `hui-card` per item exactly where the drag layer is already the heaviest.
- **A red "invalid" state in the section header.** Knowable, through an
  `ha-visibility-status` instance used as an oracle. Rejected for 1.3.0:
  `validateConditionalConfig` is a shallow per-type check, so a numeric-state
  condition is invalid until a threshold is typed — the red would appear during
  normal entry rather than signalling a defect, and Home Assistant already shows
  it, in red, in the section being edited.
- **An eye-off icon as the marker.** `mdi:eye` is already the section's icon, and
  `mdiAlertCircle` is Home Assistant's own glyph for an invalid condition set —
  an exclamation mark would make a normal configuration look like an error.
- **A marker in the item list rather than on the preview.** The preview is the
  product: it is where items are selected, and the list is the secondary view.
