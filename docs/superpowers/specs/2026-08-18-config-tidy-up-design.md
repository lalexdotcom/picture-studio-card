# Config tidy-up before 1.4.0 — design

Status: **draft, awaiting review.** Amends `2026-08-12-item-anchor-design.md` and
`2026-08-17-state-label-design.md`. Target: **1.4.0**, before publication.

This started as a defect — a label writing `show_state: false` into every stored
config — and turned into a wider question about how an element's config is
shaped. Most of the wider answer was **explored and rejected**; that reasoning is
kept at the end, because it is the part that will be asked again.

## What changes

Three things, one of them a migration.

### 1. `anchor` moves inside `position`

```yaml
- type: element
  position: { top: 45%, left: 20%, anchor: center }
```

`anchor` says **which point of the item** the coordinates refer to. It is
meaningless without `position`, and it is the only key in the config that
qualifies another one from a distance.

This is the one real migration: `position` has existed since 1.0.0 and `anchor`
since 1.2.0, so published dashboards carry it at item level. The rule is the one
`normalizeElementSize` has honoured since 1.2.0 for the pre-1.2 `{ auto: bool }`
size: **read the old place, never write it back**. An `anchor` beside `position`
is read and moved in; `storedConfig` only ever emits the new shape.

`position` keeps `percentString` for its two coordinates. `anchor` is a plain
string beside them, absent when it is `auto` — the same "the default is the
absence of the key" rule the rest of the config already follows.

### 2. `show_name` / `show_state` become one `show` list

For `state-label` only:

```yaml
show: [state, name]      # absent = [state]
```

A list, not a pair of booleans, for three reasons. It is exactly what the
editor's multi-select produces, so the key cannot drift out of step with the
control. It says **everything** that is shown, so `show: [name]` hides the state
with no per-field default to reason about. And "what the label shows" is one
idea, not two independent switches.

`state-label` is **unpublished**, so this costs no migration at all — the only
config carrying the flat booleans is the author's development dashboard, migrated
in the same pass.

This is what closes the original defect. The two booleans were written to storage
as explicit `false`, and the absence of `show_state` meant *false* at render while
the editor's stub wrote *true* — the same config meaning two things depending on
where it came from. A normalized list with a default has nowhere to put that
ambiguity.

**`state_content` gains no default and no normalization.** `state-display` already
renders the entity's default state when its `content` is undefined, so we pass it
through untouched. Inventing a default here would reimplement behaviour Home
Assistant already has — and it is where this whole discussion started.

### 3. An empty `show` renders nothing, and is placeheld in the editor

`show: []` is **allowed**, exactly as Home Assistant allows an entity badge with
nothing ticked: the badge editor imposes no minimum, and `hui-entity-badge`
resolves it to `iconOnly` with an empty icon slot.

But Home Assistant can afford it and we cannot. `ha-badge` carries
`height: var(--ha-badge-size, 36px)` and the same `min-width`, so an empty badge
is still a visible 36px pill. A label's box **is** its text: an empty one is
0 x 0.

So the behaviour splits by context:

- **On a dashboard, an empty label renders nothing at all** — not even its chrome.
  Drawing a chrome-shaped box instead would break placement rather than help it:
  under `anchor: auto` the translate is a percentage of the item's *own* box, so
  an item placed as a box and rendered as nothing lands somewhere else. With
  nothing rendered there is no box, no offset, and the stored position simply
  waits for something to be ticked.
- **In the editor, it draws a placeholder** so it can still be selected and
  dragged: a dashed outline at the label's own size, labelled **"Empty"**.

```css
background: color-mix(in srgb, var(--warning-color) 15%, transparent);
border: 1px dashed var(--warning-color);
border-radius: 2px;
padding: 2px 4px;
font-size: var(--psc-label-size);
color: var(--warning-color);
font-weight: var(--ha-font-weight-bold, 700);
```

`color-mix` rather than a hardcoded `rgba(255, 166, 0, .15)`, so a theme that
redefines `--warning-color` carries the fill with it — one variable, three
intensities. It is safe at our floor: the shipped frontend uses `color-mix`
itself, 49 times in `oklab` and 17 in `srgb`.

The word carries no `!`. The dashed outline says "this is not content", the
amber says "look", the weight says "here" — a fourth signal for one message
would read as alarm rather than warning.

The fill is the one thing to settle **on the browser walk**: a translucent amber
lets a busy picture through and may fight the text, where an opaque light fill
would detach it. Both work with a saturated dashed border, so the choice is a
matter of looking at it over a real floorplan, not of reasoning.

The placeholder's box is the label's own font size, so it **approaches** the
space the item will take once something is ticked, without equalling it. There is
no text to measure; this is the closest available.

**Warning, not error.** The register is deliberate and sits between the two: the
config is perfectly valid — the user asked for a label that shows nothing — but
the consequence is an item nobody on the dashboard can see, which is worth
saying out loud. So `--warning-color` (`#ffa600` at the default theme), not
`--error-color`. Spending the error colour here would wear out the signal for
configs that really are broken, and staying at the secondary text colour would
whisper where the outcome is surprising.

**The item list gets a marker too**, and it matters more there than in the
preview: when the picture shows nothing, the row is the only way to find the item
at all.

Not a pill, though. `.conditional` wears one because it borrows `ha-label`'s
geometry; this is a **bare icon** — `mdi:alert-outline` in `--warning-color`, at
`--mdc-icon-size: 16px`, placed **before** the visibility pill with the same 8px
of trailing margin, and a `title` for the tooltip. 16 rather than the eye's 14:
the eye can afford 14 because its pill gives it body, a bare glyph has only its
stroke. And `alert-outline` rather than `eye-off`, because two eyes side by side
— one meaning "has conditions", the other "shows nothing" — would contradict each
other half a centimetre apart.

**No Home Assistant string fits.** Every `*empty*` key in the shipped fragments
is a sentence about an empty collection ("Aucun appareil", "Commencer par un
tableau de bord vide"). `Unknown` and `Unavailable` were considered and refused
on meaning rather than availability: they name **entity states**, so reusing one
would tell the user their entity is broken when it is not. The nearest intent,
`ui.panel.config.automation.editor.entity_hidden` ("Cachée"), lives in the
`config` fragment, which a Lovelace dialog never loads. So this is what
`src/strings.ts` exists for — our own en/fr catalogue, the last resort.

One consequence to build: **the element has to learn it is in the editor.** Today
it does not — the card carries `.editing` on the container, and an element's
shadow root cannot see a class on an ancestor. The flag has to be pushed onto it,
the way `hass` already is and the way `hui-card` pushes `isPanel` onto us.

## The small corrections riding along

Found while reviewing, unrelated to the shape:

**Four unlocalized labels.** `elementFormLabel` falls through to
`ui.panel.lovelace.editor.card.generic.<name>`, which does not exist for
`displayed_elements` nor `state_content` — so the form shows those two raw keys on
screen. The multi-select's own options are hardcoded English (`"name"`, `"state"`).
All four have Home Assistant strings, verified present in the shipped French
`lovelace` fragment:

| Key | fr |
| --- | --- |
| `ui.panel.lovelace.editor.badge.entity.displayed_elements` | Éléments affichés |
| `…displayed_elements_options.name` | Nom |
| `…displayed_elements_options.state` | État |
| `ui.panel.lovelace.editor.badge.entity.state_content` | Contenu de l'état |

**Two dead fallbacks to the icon**, in `_dispatch` (`element-form.ts`) and
`createElementBadge` (`picture-studio-card.ts`). Both default an unknown element
kind to `state-icon`. They are unreachable — `normalizeElementConfig` raises
first — but they make the code claim a behaviour the design refuses. Removed.

**The raise stays.** An unknown element kind throws, and Lovelace handles it:
`createLovelaceElement` wraps creation in a `try/catch`, logs to the console and
renders a `hui-error-card` carrying our message, live in the edit preview. The
user sees which item and which types are valid. Silently ignoring the item would
be worse — the recorded trap in reverse: a config that looks fine and does
nothing.

## Explored and rejected

Kept because each of these will be proposed again.

### A record per editor section (`content`, `display`)

The idea: group each section's keys into a normalized record with its own
default, generalizing what `size` and `chrome` already do.

Rejected. The argument that carried it was that a flat `color` "claims to be
universal", so a future image element would inherit a key it cannot honour. That
is **wrong**: `config` is already per-kind — `StateIconConfig` and
`StateLabelConfig` are distinct types, each normalized by its own branch, and a
kind simply declares the keys it has. The argument described a problem that does
not exist.

What was left was tidiness, against a migration of a **published** kind
(`state-icon` since 1.2.0, its `chrome` since 1.3.0), roughly ten files, and a
divergence from Home Assistant's own entity badge — the very component both our
kinds mirror, and which keeps these keys flat. The defect that started it needed
three lines, not a refactor.

If it is ever revisited, it belongs in a deliberate breaking pass together with
anything else of that kind, so dashboards migrate once rather than twice.

### Moving `position` and `anchor` into `config`

Rejected, and not as a matter of taste: it would **break badges**.

A badge's `config` belongs to a third party. Writing our keys into it is the
founding rule violated in the other direction, and Home Assistant validates
strictly:

```ts
// base-badge-struct.ts
export const baseLovelaceBadgeConfig = object({
  type: string(),
  visibility: any(),
  disabled: optional(boolean()),
});

// hui-entity-badge-editor.ts
public setConfig(config: EntityBadgeConfig): void {
  assert(config, badgeConfigStruct);   // throws on an unknown key
```

`object()` in superstruct is exact: a key it does not know fails validation. Our
badge form mounts the third-party editor **inside** ours, so a `position` slipped
into a badge's config would kill its edit panel on open.

Beyond that: placement is the card's business, not the item's — the card places,
the element draws itself. And the fallback shape, "in `config` for elements, at
item level for badges", would be worse than today's uniformity: two homes for one
idea.

### Grouping the actions under `interactions`

Rejected. `tap_action`, `hold_action` and `double_tap_action` sit at the root of
every card, badge and element config in the ecosystem — including at the root of
an element's `config` here, which is the equivalent level. Moving them would make
three lines copied from a tile card silently do nothing.

### Renaming `chrome.theme` to `surface`

Rejected on review. The key really does select a theme behaviour: `auto`
delegates to Lovelace, resolving through
`var(--ha-card-background, var(--card-background-color, white))`, so a theme that
restyles its cards restyles our surface with it. `light` and `dark` are the two
predefined escapes from that delegation. Unlike the recorded `theme:` trap, ours
does something in all four of its values.

### Out of scope entirely

- A badge's `config`, at any level.
- `visibility`, which stays at item level with Home Assistant's own name and
  shape — `visibility?: Condition[]`, the same key `LovelaceCardConfig` and
  `LovelaceBadgeConfig` carry, evaluated by `hui-card` rather than by us.

## Testing

- `position` round trip: a config with `anchor` at item level comes back with it
  inside `position`, value preserved, and one already in the new shape is
  unchanged. Both directions asserted on literals.
- `show`: absent normalizes to `[state]`; an unknown entry is dropped; `[]`
  survives normalization and storage rather than being replaced by the default.
- The empty label: nothing rendered without the editor flag, a placeholder with
  it, `rowLabel` falling back to the entity, and the list's warning marker present
  exactly when `show` is empty.
- The four localization keys, in one shared list — a pair of tests checking
  different sets is a hole this project has already fallen into.
- **The development dashboard is left in the 1.3 shape on purpose.** Its
  `anchor` stays at item level rather than being hand-migrated, so the walk
  exercises the compatibility read on a real config instead of on a fixture. Only
  the `state-label` keys — the ones no code path migrates, because the kind is
  unpublished — are rewritten by hand, and only **after** the code lands: doing it
  first would leave labels whose `show` nothing reads yet, which is to say blank.
  HA holds `.storage/lovelace.dashboard_test` in memory and rewrites it on its own
  schedule, so the edit happens with the container stopped, over a copy.
- What the suite **cannot** see stays on the browser walk: happy-dom does no
  layout, so the placeholder's box, the dashed outline and the empty item's
  absence are all browser-only checks.

## Versioning

`1.4.0`, unpublished, so this lands with the rest. `package.json` stays at
`1.3.1` and the CHANGELOG heading reads `unreleased` until delivery, when both
move together.
