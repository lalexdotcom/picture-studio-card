# An unreadable item is ignored, not fatal — design

Status: **draft, awaiting review.** Closes follow-ups 8 and 9. Amends
`2026-08-11-picture-badges-design.md` (the "absent and unknown both raise" rule)
and `2026-08-14-item-visibility-design.md` (the `visibility` validation).

Today one bad entry in `items` costs the whole card. `normalizeConfig` throws,
`hui-card` catches, and the user gets `hui-error-card` in place of the image and
every other item. The motivating case is a config pasted onto an installation
running an older version of the card: one item it does not know, and nothing
renders.

This reverses that, and it can be reversed safely for one reason. The earlier
decision refused ignoring **because it led to losing** — `storedConfig` rewrites
the whole config on every editor commit, so anything dropped at normalization
disappears from the user's YAML on the first drag. An item that survives
normalization in an *unknown* state and is written back **verbatim** loses
nothing, so the objection dissolves.

## What changes for someone configuring the card

- A single unreadable item no longer takes the card down. It is skipped; the
  image and every other item render.
- The card renders nothing at all in its place — no placeholder, in the edit
  preview either.
- The editor's item list keeps a row for it, marked with a red error glyph and
  the reason. **Edit is disabled, Delete works** — so removing it does not force
  a trip into the YAML.
- The YAML entry is preserved exactly as written, drags and edits to other items
  included.
- The list also flags a **badge whose type does not exist** on this Home
  Assistant — a typo, or a custom badge whose resource never loaded.
- A malformed `visibility` no longer breaks anything: the item renders, always
  visible, with an orange warning in the list and, in its Visibility section, an
  explanation and a Reset button.

## The five failure cases, and their fates

Everything below is decided at normalization. Nothing else in `config.ts` throws:
`position` falls back to its default, unparseable coordinates fall back, an
unknown `anchor` becomes `auto`, `size` / `chrome` / `show` take their defaults,
unknown keys inside an element's `config` are kept, and a badge's `config` is
never inspected.

| | trigger | fate |
|---|---|---|
| **a** | `items[i]` is not an object — string, number, list, `null` | **keeps throwing** |
| **b** | `type` absent, or ∉ {`badge`, `element`} | unknown item |
| **c** | `config` absent or not an object | unknown item |
| **d** | `visibility` present and not a list | normal item, conditions ignored |
| **e** | element whose `config.type` ∉ {`state-icon`, `state-label`} | unknown item |

**(a) stays fatal on purpose.** There is nothing to hold onto — no family, no
position, not even a key to name in a row. An entry that is not an object is a
structural mistake in the list itself, and Home Assistant's error card, which
prints the offending config, says more than a row that could only read "?".

**No migration for an absent `type`.** `type` has been required since 1.2.0 and
1.1.x has no consumers — it was a development convenience. A 1.1.x config
becomes an empty card rather than an error card, and that is accepted.

**(c) and (e) are not editable**, though we know more about them than about (b).
Offering to repair them means asking the user to choose an identity, which is a
new picker to build, and then reconciling an existing opaque `config` with the
identity chosen. Delete plus a hand edit is the honest answer; the row makes the
deletion possible without opening the YAML, which was the point.

## The model

```ts
interface UnknownItem {
  type: "unknown";
  /** The original entry, untouched. */
  raw: unknown;
  reason: "item-type" | "config-missing" | "element-type";
  /** The rawest identifying token we hold, shown as the row's first line. */
  token?: string;
}

export type PictureItem = BadgeItem | ElementItem | UnknownItem;
```

`reason` and `token` are **computed at normalization, never re-derived by the
list**. Normalization is the only place that decided; every consumer displays.

`token` is filled by the most specific raw string available:

| case | `token` |
|---|---|
| b | `entry.type` when it is a string, else absent |
| c | `"badge"` or `"element"` — the family we did read |
| e | `entry.config.type` when it is a string, else absent |

`raw` is **never normalized**. Not its `position`, not its `anchor`, not its
`visibility`. A `top: 30` must come back `top: 30`, not `top: "30%"`, on an item
we claim not to understand.

`UnknownItem` deliberately does **not** extend `ItemBase` and carries no
`config`. The compiler then flags every site that reads `item.config` or
`item.position`, which is how the work is found rather than hunted:
`rowLabel`, `kindLabel`, `showsNothing`, `hasVisibility`, `itemIcon`'s callers,
the shape key in `_syncItems`, `_applyPositions`, and the helpers in
`editor/items.ts`.

### Storage

`storedConfig` emits `item.raw` verbatim for an unknown item — no spread, no
key deletion, no position rewrite. This is the whole safety argument of the
design and deserves its own test: a config with an unknown item, normalized and
stored, must come back byte-identical for that entry.

## The card

**Nothing is rendered.** No wrapper, no placeholder, no marker, in the edit
preview as well. An item we cannot read has no size and no meaningful position,
and a placeholder over a photograph would be worse than the silence.

**The index alignment is a precondition, not an improvement.** `_syncItems`
currently does `if (!child) return` and pushes nothing into `_elements`,
`_wrappers` and `_probes`. One item without a child and all three arrays are
offset against `items` — every later item receives the previous one's config.
This is unreachable today because `_createChild` never returns `undefined`;
after this change it is the normal case. Push a hole rather than skipping, and
have `_applyPositions` step over it. This is the old follow-up 9.

**One `console.warn` per ignored item, at `setConfig`.** Today the failure is
loud. After this change the editor's item list is the *only* place it exists,
and someone who configures in YAML and never opens the dialog will never learn.
A console line returns part of the diagnostic being given up, without putting
anything in front of an end user. Message: the item index, the reason, and the
token.

## The editor's item list

### The error row

The row keeps its geometry — `handle · kind · label · markers · Edit · Delete`.

- **The `.kind` glyph becomes the marker**: `mdi:alert-circle` on
  `--error-color`. There is no kind to show, so no column is added. This is
  Home Assistant's own error vocabulary — `ha-alert`'s `error`, which
  `ha-visibility-status` already uses — so the Visibility header and the list
  speak one language.
- **`primary`** is `token`, or a generic string when there is none.
- **`secondary`** is the reason, in `--error-color` instead of
  `--secondary-text-color`.
- **No row tint.** One bad item among twelve, and a full-width red band buries
  the list.
- **No other marker** — neither the conditional eye nor the orange warning. Even
  when an unknown item's `visibility` happens to be readable it applies to
  nothing, and showing the eye would suggest it participates.
- **The drag handle stays.** Reordering an item that paints nothing has no
  effect, but removing it would mean a special case in `ha-sortable` and a
  different row geometry, to prevent a harmless gesture.
- **Edit is `disabled`; Delete is unchanged.**

| case | primary | secondary |
|---|---|---|
| b | `badgee` | unknown item type |
| c | `badge` | missing config |
| e | `state-lable` | unknown element type |

`rowLabel` in `editor/items.ts` grows the unknown branch — it is already the one
pure function that builds a row's two lines, and it stays the only one.

### The malformed `visibility` — case (d)

Almost entirely a deletion:

- `normalizeVisibility` **stops throwing** and returns the raw value unchanged
  when it is not a list.
- `hasVisibility` already reads `Array.isArray(item.visibility) && length > 0`,
  so it returns `false`: no probe is created, the shape key carries no `"v"`,
  and the item is simply always visible. **No change.**
- `storedConfig` already copies `...item`, so the raw value round-trips into the
  YAML untouched. **No change.**

**The raw value survives in the YAML.** It costs nothing — `storedConfig` copies
it without a line being written — and dropping it would silently discard a
readable intention. `visibility:` written as a mapping instead of a list is the
likely mistake, and the whole intent is right there.

The declared type of `visibility` becomes `unknown`, with `hasVisibility` as the
single gate every reader passes through. The old declaration promised a
validation that never existed: contents were never inspected, only the
array-ness.

The **item list** gains the orange marker — `mdi:alert-outline`, the one
`showsNothing` already uses — because the item renders and is editable. Red is
for what is ignored, orange for "this renders, but not what you meant".

#### The Visibility section

The trail has to be followable from the collapsed header, exactly as the Content
panel's warning is.

**In the header**, the warning glyph goes in the `event` slot — `mdi:alert-outline`
on `--warning-color`, same glyph and same slot as the Content marker — and it
**replaces the count pill and the verdict icon** rather than joining them. There
are no readable conditions to count and no verdict to report, so the slot carries
exactly one thing and the layout does not move.

**A defect to fix on the way.** `render()` computes
`count = this.visibility?.length ?? 0`. With `visibility: "hidden"` that is
**5** — the section would show a "5" pill and mount the oracle on a string. The
count must go through `Array.isArray` first.

**In the panel**, `ha-alert` — Home Assistant's own component, so the tinted
ground, the glyph and the title/body layout cost us no CSS. Verified in the
shipped frontend: attribute `alert-type`, property `alertType`, and
`<ha-button size="s" slot="action">` is Home Assistant's own idiom for the
action.

```
⚠  Unreadable conditions                        [ Reset ]
   This item's conditions are not a list. They are ignored,
   and the item always shows.
```

**The alert replaces `hui-card-visibility-editor`; it does not sit above it.**
One decision, made explicitly, and then the section is ordinary again — an empty
editor ready for conditions. Two clicks instead of one for someone who only
wanted to write conditions, and in exchange nothing is ambiguous about what the
section currently holds.

**Reset adds no plumbing.** It emits `[]` through the existing
`handleValueChanged`, and `storedConfig` already deletes the key when
`hasVisibility` is false. The raw value goes with it; there is no dedicated
removal path to write.

**Guarded like every other borrowed component** — `customElements.get("ha-alert")`,
as `hui-card-visibility-editor` and `ha-switch` already are. An undefined custom
element renders nothing at all, silently, and here that would evaporate the whole
warning. The fallback is a `<p class="warning">` carrying the sentence and a plain
button: ugly, never seen, present.

## A badge whose type does not exist

Separate mechanism, same error row. A badge's `config` is opaque, so it
normalizes cleanly and the item is never *unknown* — the verdict is produced at
runtime, by the list, and it is the second source that can put a row into the
error state.

### Why it is worth doing, and where the line is

For an unknown *item*, the card is about to go silent, so the list is the only
diagnostic. For a badge the card is **not** silent: Home Assistant renders its
own error badge naming the type. The list marker is an echo — but a useful one,
because today a typo (`entty`) and a future native type render identically:
`mdi:label` and the raw string.

**The item is never ignored and never rewritten.** The card keeps handing the
config to `createBadgeElement`, and Home Assistant keeps rendering whatever it
renders. Only the row changes.

### The registry, read from the shipped frontend

Build **20260729.6**, `frontend_latest/14887.*.js`:

```js
const KNOWN = new Set(["error", "entity"])           // eager
const LAZY  = { "entity-filter", "shortcut", "state-label",
                "power-total", "gas-total", "water-total" }
createBadgeElement = (config) => Ue("badge", config, KNOWN, LAZY, undefined, "entity")
```

Three facts follow, all verified there:

- **Eight native types exist, and `CORE_BADGES` lists two.** That is correct and
  stays correct: `CORE_BADGES` mirrors `coreBadges`, which is the **picker's**
  list — Home Assistant itself offers only `entity` and `shortcut`. The other
  six are legacy or placed by the energy strategy. So "renders but is not in our
  catalogue" is a real, testable state today, not a hypothetical.
- **A badge with no `type` at all is legal and means `entity`** — the last
  argument of the factory is the default type, and `u = config.type || default`.
  So an absent `config.type` on a badge is never an error.
- **`createBadgeElement` never throws for us.** It is the wrapper that catches
  and returns `hui-error-badge` carrying the message.

### The test

`createBadgeElement({ type })` with a **bare config**, then read the tag:

| type | result |
|---|---|
| in `KNOWN` | `hui-<type>-badge`; `setConfig` runs synchronously |
| in `LAZY` | `hui-<type>-badge`; `setConfig` deferred inside `whenDefined`, never an error |
| unknown | `hui-error-badge` |

Synchronous and definitive. Because the probe carries `{ type }` and never the
item's config, **the answer is per type and memoizable per type** — and the
badge's payload is still never read.

The one theoretical false negative is a `KNOWN` type whose `setConfig` rejects a
bare config, since that path runs synchronously and its throw is caught into an
error badge. Verified not to happen: `hui-entity-badge.setConfig` validates
nothing, it merges defaults.

**Not `getConfigElement`.** It is a static on the class; reaching the class
requires the tag to be defined, which requires the lazy chunk to be loaded —
the whole async dance of `resolveBadgeClass` — and some badges define no
`getConfigElement` at all, so its absence would be a false negative.

**All native types are probed, including those in our catalogue.** Guarding on
`catalog.find` — already in the row's render for the icon and the label — would
save two element creations per session and, in exchange, leave one case
unflagged: a type we still offer that has been removed upstream. The saving is
not worth a second rule, and probing unconditionally means the list's verdict has
one source.

### Custom types

`customElements.get(tag)` answers directly and synchronously; no element is
created. `window.customBadges` is **not** consulted — it is the picker's
registry, and a library can define its element without registering there;
`customElements.get` is the truth.

The difference that matters: a native negative is immutable, a custom negative
may be "not yet". So per custom type, once:

```
customElements.get(tag)
  defined         → ok, final
  tag has no "-"  → missing, final, red immediately
  otherwise       → optimistic, and arm two things:
                      setTimeout(2000) → turn the row red
                      whenDefined(tag) → turn it back, cancel the timer
```

`2000` is Home Assistant's own figure — it hides its error badge for exactly
that long — so the list and the card next to it complain at the same moment.
A tag with no `-` can never be a custom element, which is why Home Assistant
returns the error at once there, and it catches the commonest typo instantly.

**No polling, no `maxRetries`.** A retry returns what `whenDefined` already knew,
later; it needs an interval and a count that nothing justifies; and a "final
verdict after N tries" leaves a resource that loads at t+5s marked red forever,
in the editor, beside a card where the badge renders correctly.

### Rendering the verdict

- **The first paint is optimistic**, always: catalogue type → its icon and
  label; native type outside the catalogue → `mdi:label` and the raw type;
  custom → `mdi:label-outline`. **No marker.** So a slow probe can never flash a
  false error; the row only ever moves toward the error, and back only when a
  custom resource genuinely arrives.
- On a negative verdict the row takes the same error treatment as an unknown
  item, and **Edit is disabled** — a badge editor cannot be built for a type
  that does not exist, and Home Assistant would fall back to raw YAML.
- One cache entry per type, at **module level**: the question "does this build
  know this type" is global. A native entry is frozen; a custom entry carries
  the subscription that may flip it.
- One async hop per session — `loadCardHelpers()` — after which every native
  probe is synchronous. Custom probes are synchronous from the start.

### A latent hang, fixed on the way

`resolveBadgeClass` forces the lazy load and then awaits
`customElements.whenDefined(tag)`. For a type that does not exist that promise
**never resolves**, so the add flow would hang. It is unreachable today because
the menu only offers known types, but the same file is about to gain an
existence test, and the test must not be built on `whenDefined`. Short-circuit
on the tag returned by `createBadgeElement`.

## The exhaustiveness hardening — follow-up 8

The parked note expected two ternaries in `element-form.ts` to become reachable
once the raise was removed. Under this design they do not: an element of unknown
type is no longer an `ElementItem` and never reaches the form.

The trap the note was aiming at is real, though, and independent. Three places
branch on the element kind with `type === "state-label" ? label : icon` and
therefore treat **a third kind silently as an icon**:

- `_toData` in `editor/element-form.ts`
- the inline ternary in the same file's `render()`
- `isLabel` in `storedConfig`

(`_dispatch` and `_createChild` already branch explicitly with no `else`, and are
safe.)

Replace the three with an exhaustive branch guarded by a `never` check at the
default. Adding a third element kind then becomes a compile error at each site
instead of a wrong render, which makes the "four files, not one" checklist in the
project memory self-enforcing.

## Strings

Home Assistant has no key for "this item is unreadable", so these go in our own
`src/strings.ts` catalog, en + fr. A search for a closer Home Assistant key is
part of the work; the catalog is the last resort, not the first.

- the three reasons: unknown item type, missing config, unknown element type
- the badge verdict: unknown badge type
- the malformed visibility warning: one short string for the list row's tooltip
  and the section header's tooltip, plus the alert's title and body
- the reset action's label — look for a Home Assistant common key first

## Testing

The suite mirrors the source tree and is `happy-dom`, so nothing about layout,
colour resolution or compositing is observable — those go to the browser walk.

**`config.ts`**

- each of (b), (c), (e) produces an `UnknownItem` with the right `reason` and
  `token`, and does not throw
- (a) still throws
- (d) does not throw, the raw value is returned unchanged, `hasVisibility` is
  `false`
- **the round trip**: `storedConfig(normalizeConfig(config))` returns the unknown
  entry identical to its input, including an unnormalized `top: 30` and an
  `anchor` at item level
- a commit that changes *another* item leaves the unknown entry untouched

**The card**

- an unknown item creates no wrapper and no probe
- **the alignment**: a config of `[element, unknown, element]` pushes the second
  element's config into the second element, not the first — this is the test
  that would have caught the old defect, and it must be measured failing against
  the pre-change `_syncItems` before being kept
- `_applyPositions` steps over the hole

**The list**

- an unknown row renders the error glyph, the token, the reason
- its Edit button is disabled and its Delete button still fires `item-removed`
  with the flipped index
- an unknown row carries neither the eye nor the orange warning
- a (d) item renders a normal row plus the orange warning

**The Visibility section**

- a malformed `visibility` puts the warning glyph in the `event` slot and
  renders **neither** the count pill nor the verdict icon
- `visibility: "hidden"` shows no "5" pill and mounts no oracle — the regression
  test for the `.length` defect, measured failing before being kept
- the panel renders the alert and **not** `hui-card-visibility-editor`
- the reset action emits `[]`, after which the section renders normally and
  `storedConfig` no longer carries the key
- with `ha-alert` undefined, the fallback paragraph and its button render
- the badge probe: a known type stays unmarked; an unknown native type marks the
  row after the verdict; a custom type with no `-` marks it immediately; a custom
  type that resolves later clears the marker and the timer
- the module-level cache is consulted once per type — a second row of the same
  type creates no second probe

**Types**

- the exhaustiveness guards fail to compile when a third element kind is added.
  A `@ts-expect-error` fixture, so the guarantee is asserted rather than assumed.

**The browser walk**, panel view and sections view both, as always:

- a config with one unknown item among several: the others render, the image
  renders, the list shows the row, Delete removes it, the YAML of the remaining
  items is unchanged
- a badge with a typo'd native type: Home Assistant's error badge on the card,
  the red row in the list
- a custom badge from Mushroom with the resource temporarily removed, to see the
  2s window and the recovery
- an item with `visibility:` written as a mapping: the header glyph while the
  panel is collapsed, the alert's ground and spacing against the panel it sits
  in, and the section returning to normal after Reset

## Versioning

This changes existing behaviour — a config that used to produce an error card now
renders — so it belongs under `Changed`, with the new list marker under `Added`.

1.4.0 is on `main`, unreleased, and `package.json` still reads `1.3.1`. Whether
this rides in 1.4.0 or becomes 1.5.0 is the user's call at delivery, not a
decision this spec makes.
