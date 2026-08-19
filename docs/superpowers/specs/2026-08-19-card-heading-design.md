# Badges in the card header — design

Status: **DRAFT — the brainstorm is unfinished.** The feasibility half of
follow-up 2 is settled and written down here; the decisions taken on 2026-08-19
are recorded as decisions; the list at the end is what remains to agree before
this becomes a plan. Nothing here has been implemented.

Today the card's only header is `<ha-card .header=${this._config.title}>`
([`src/card/picture-studio-card.ts:611`](../../../src/card/picture-studio-card.ts)) —
Home Assistant's plain card header, text only. This gives it an icon and a row of
**heading badges**, the same family the heading card uses, with the title and icon
on the left and the badges on the right.

The premise the follow-up was parked on — that this might not be reachable at all,
because no heading-badge factory is among `loadCardHelpers`'s nine exports — is
**false**, and section 3 is the proof. Almost the whole mechanism is reusable
as-is. There was never a fallback plan to put *ordinary* badges in the header;
if a memory says otherwise it is wrong.

## What changes for someone configuring the card

- The header can carry an **icon** beside the title.
- The header can carry **badges** — Home Assistant's heading badges, configured
  through Home Assistant's own editor, including their per-badge visibility
  conditions.
- The header appears when **any** of the three is set. It is no longer a
  title-only affordance.
- The title is smaller than it is today.
- **The header is not clickable.** The heading card offers a `tap_action`; ours
  does not, deliberately.
- `title` at the top level of the config becomes `heading.title`. Existing
  configs keep working — see the migration below.

## 1. Config shape

```yaml
type: custom:picture-studio
heading:
  title: Office
  icon: mdi:desk
  badges:
    - type: entity            # or `button`; `entity` is the default when absent
      entity: sensor.office_temperature
    - type: entity
      entity: light.office
      visibility: [ … ]       # HA's own conditions, opaque to us
image: /local/plan.png
items: [ … ]
```

`heading.badges` is **opaque third-party config**, exactly like a badge item's
`config`: never read, validated or rewritten. An entry Home Assistant cannot
build renders as `hui-error-heading-badge` on its own, so the unknown-item
doctrine does not need extending here — there is nothing for us to catch.

`storedConfig` must not emit an empty `heading: {}`, on the same reasoning that
keeps it from emitting a default `chrome`.

### The migration

`title` has been at the top level since 1.0.0, so moving it is a **breaking
change**, and the project's recurring trap n°1 is waiting for it: read only
`heading.title` and an existing top-level `title:` saves cleanly and does
nothing.

Home Assistant's own precedent is the model — `migrateHeadingCardConfig` in
`hui-heading-card.ts` reads the legacy `entities` key, folds it into `badges`,
and deletes it, silently, at both `setConfig` and editor `setConfig`. Ours does
the same at normalization: a top-level `title` becomes `heading.title` when
`heading.title` is absent, and is dropped. Because `storedConfig` rewrites the
whole config on every editor commit, the migration lands in the user's YAML the
first time they open the editor; a config never opened keeps rendering.

## 2. The editor

**Amended 2026-08-19, later the same day: where these two touch points land is
reopened.** The user has since asked for the whole config form to be redrawn —
"Card config" split into *Heading* (with the badge list **directly inside**,
not as a section after it), *Image* / *Background* and *Filter*, and "Items"
made collapsible with a count badge and a max-height. That is
`mem:picture-studio/follow-ups` entry 8, and it is brainstormed together with
this. What follows describes the *fields* and the *plumbing*, which the
reorganisation does not change; only their placement is in question.

Two touch points, both where the user asked for them.

**In "Card config"**, an icon field right after the title:

```ts
{ name: "icon", selector: { icon: {} } }
```

verbatim from the heading card's schema. `backgroundLabel` already falls through
to `ui.panel.lovelace.editor.card.generic.*`, where `icon` resolves.

Consequence to keep in view: `ha-form` merges the changed field onto the whole
flat `.data` it was given, so `backgroundData` flattens `heading.title` and
`heading.icon` into the record and `mergeBackground` folds them back. Same shape
as the existing `asMediaValue` round trip — no new mechanism. It does mean the
"Card config" section writes to two places: `heading.*` for two fields, the root
for everything else.

**After "Card config"**, a "Badges" section that is a single Home Assistant
component — see 3.2.

## 3. What Home Assistant gives us, verified

Everything below was read in the frontend source at build **20260729.6** and
cross-checked against the shipped bundle in the container.

### 3.1 Rendering — available unconditionally, nothing to force

`hui-heading-badge` is defined in chunk `79381`, and `app.8a110b5d89329ef9.js`
requests it in the **same `Promise.all` as the Lovelace panel itself**:

```
a.e(…),a.e(37175),a.e(91332),a.e(79381),a.e(59454),…,a.e(74185)
```

The static import chain that explains it:

| module | what it does |
|---|---|
| `custom-card-helpers.ts` | `export { createCardElement } from "./create-element/create-card-element"` |
| `create-element/create-card-element.ts` | `import "../cards/hui-heading-card"` at top level; `heading` ∈ `ALWAYS_LOADED_TYPES` |
| `cards/hui-heading-card.ts` | `import "../heading-badges/hui-heading-badge"` at top level |
| `create-element/create-heading-badge-element.ts` | static `import` of `hui-entity-heading-badge` and `hui-button-heading-badge`; `ALWAYS_LOADED_TYPES = {error, entity, button}`; default type `entity` |

So on any dashboard, `hui-heading-badge` is defined before our card runs. Guard
with `customElements.get` anyway — the project rule stands, an undefined custom
element renders nothing at all, silently — but there is no lazy-load dance to
write.

`hui-heading-badge` itself: a `ReactiveElement` whose `createRenderRoot()`
returns `this`, so it renders into the light DOM. Properties `config`, `hass`,
`preview`. It builds its inner element through `createHeadingBadgeElement`,
re-loads it on a `type` change and `setConfig`s it otherwise, and handles
`ll-upgrade` / `ll-rebuild`.

It also **implements `visibility` itself**, through `ConditionalListenerMixin`
and `checkConditionsMet`, and re-evaluates live — which is strictly better than
what `hui-card` gives our items, since `hui-card` does not re-evaluate on a
config change. `preview` short-circuits to visible, as everywhere else in
Lovelace. It reports through `heading-badge-visibility-changed` and
`heading-badge-updated`.

### 3.2 The "Badges" section — one component

`hui-heading-badges-editor`, in
`src/panels/lovelace/editor/config-elements/hui-heading-badges-editor.ts`. Its
whole public surface:

| | |
|---|---|
| in | `.hass`, `.badges` |
| out | `heading-badges-changed` `{ badges }`, `edit-heading-badge` `{ index }` |

It owns the sortable list (`ha-sortable`, drag handle), the row rendering with
entity name / device ▸ area secondary line, the amber "entity not found" row, the
delete button, and the "Add badge" dropdown over `UI_BADGE_TYPES = ["entity",
"button"]` — resolving each new badge's stub through
`getHeadingBadgeElementClass(type).getStubConfig(hass)` and firing
`edit-heading-badge` for it straight away. This is the box in the user's
screenshot, entire.

We host it exactly as `visibility-section.ts` hosts `hui-card-visibility-editor`.

**Its chunk is lazy.** Chunk `11600` is requested from one place in the whole
bundle: `79381`, i.e. `HuiHeadingCard.getConfigElement()`, whose body is
`await import("../editor/config-elements/hui-heading-card-editor")`. One line
forces it, on a class guaranteed to be defined by 3.1:

```ts
await (customElements.get("hui-heading-card") as any)?.getConfigElement();
```

The returned `hui-heading-card-editor` element is discarded; the side effect is
what we want. Guard and fall back afterwards — this is the `ha-md-list` trap, and
here it is real rather than hypothetical.

### 3.3 Editing one badge — free

Our editor fires:

```ts
fireEvent(this, "edit-sub-element", {
  config, saveConfig, type: "heading-badge",
});
```

`hui-element-editor` — the base class of `hui-card-element-editor`, which is what
hosts our editor — listens for it on the `<div class="gui-editor">` that wraps
`renderConfigElement()`. It `await import("./hui-sub-element-editor")`s and swaps
our editor for the sub-editor through Lit's `cache()`, so our DOM and state
survive the round trip. `hui-sub-element-editor` has a `case "heading-badge"`
branch rendering `hui-heading-badge-element-editor` (chunk `58509`).

We write the `fireEvent` and the `saveConfig` callback. Everything else — the
back arrow, the GUI/YAML toggle, the per-type form — is Home Assistant's.

### 3.4 Translations

All in the `lovelace` fragment, which resolves everywhere in our editor:

- `ui.panel.lovelace.editor.card.heading.badges` — the section title
- `ui.panel.lovelace.editor.heading-badges.*` — `add`, `types.<type>.label`,
  `no_entity`, `entity_not_found`
- `ui.panel.lovelace.editor.badges.edit` / `.remove` — the row's icon buttons
- `ui.panel.lovelace.editor.card.generic.icon` — the new field

### 3.5 The floor holds — no version bump

Compared against build **20260527.4**, the frontend pinned by our `2026.6.0`
floor, whitespace-insensitively:

| file | verdict |
|---|---|
| `hui-element-editor.ts` | identical |
| `hui-sub-element-editor.ts` | identical |
| `create-heading-badge-element.ts` | identical, byte for byte |
| `hui-heading-badges-editor.ts` | identical but for HA's own `size="small"` → `size="s"` on its internal add button |

The 20260729.6 files differ from the floor's only by a Prettier reformat.

## 4. What we copy

The header's layout, and only that. Roughly sixty lines lifted from
`hui-heading-card`'s `static styles`, with its origin, the build it was
reconciled against, and the drift note written into the file, per the project
rule.

What earns its place:

- `.container` — `flex row`, `justify-content: space-between`, `align-items:
  center`, `gap: var(--ha-space-2)`, `flex-wrap: nowrap`, `overflow: visible`.
- The title/badges split: `.content { flex: 0 1 max-content; min-width: 0 }` and
  `.content:not(:only-child) { flex: 1 0 var(--…-title-min-width, 150px);
  max-width: max-content }`, against `.badges { flex: 0 1 auto; min-width: 0 }`.
  This is the part worth taking faithfully — it is what makes a long title yield
  to the badges instead of pushing them off.
- `.content p` — `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- `.badges-row` — `flex row nowrap`, `gap: var(--ha-space-2)`.

What we drop with the actions: `[role="button"] { cursor: pointer }`,
`ha-icon-next` and its `.content:hover` transform, `actionHandler`, the `role` /
`tabindex` bindings.

We also stop using `ha-card`'s `.header` slot, so **the header's padding becomes
ours**. `ha-card` used `var(--ha-space-3) var(--ha-space-4) var(--ha-space-4)`;
the heading card uses `0 var(--ha-space-1)` because it *is* the card. Ours sits
inside a card, above the image, and needs its own figure.

## 5. What is ours: the typography

Behind our own custom properties, the way `--ha-heading-card-title-*` works for
them — that is what makes the copy adjustable rather than frozen.

| | size | weight | other |
|---|---|---|---|
| today, `ha-card` `.card-header` | `--ha-font-size-2xl` = 24px | 400 | `line-height: expanded`, letter-spacing −0.012em |
| heading card, style *Title* | `--ha-font-size-l` = 16px | 400 | `line-height: normal`, letter-spacing 0.1px, `--mdc-icon-size: 18px` |
| **ours** | **`--ha-font-size-xl` = 20px** | *open — 400 or 500* | icon size to follow, ~22px |
| `ha-heading-badge` (untouched) | `--ha-font-size-m` = 14px | 400 | `line-height: 20px`, `--mdc-icon-size: 16px` |

`xl` is the only step on Home Assistant's scale between the heading card's title
and today's card header, so the size is decided by the scale rather than by us.
The 20/14 pairing with the badges is more contrasted than the heading card's
16/14, which is the intended direction.

## 6. Deliberately not taken

- **`tap_action` on the header.** A behaviour of the heading card we do not keep.
- **`heading_style` (title / subtitle).** Dropped from the form — we have one
  header style. *Open: whether the stored value should still be tolerated.*
- **`DragScrollController`.** `src/common/controllers/drag-scroll-controller.ts`,
  ~140 lines, internal, absent from `loadCardHelpers` — a copy or nothing. It is
  drag-to-scroll for the badge row, mouse-only (`mousedown`/`mousemove` on
  `window`/`mouseup`), with `scrolled` flipping past 1px as the click-versus-drag
  discriminator and `scrolling` driving `.dragging { cursor: grabbing;
  pointer-events: none }`. The heading card runs it with `enabled = !preview`.
- **The overflow mask** — a separate mechanism: a `ResizeObserver` on `.badges`
  feeding `.overflowing`, which adds the two-edge gradient mask, `cursor: grab`,
  and `::before`/`::after` spacers standing in for padding (real padding
  misbehaves with scrolling, as they note). Watch the subtlety if it is ever
  taken: those spacers inflate `scrollWidth`, so `_measureBadgesOverflow`
  subtracts `--ha-space-4` while the class is already set, or the class
  flip-flops.

Skipping both costs the mouse-drag and the edge fade only; wheel, trackpad and
touch still scroll the row. The two are independent — the mask can be taken later
without the controller.

## 7. Testing

happy-dom does no layout, so nothing in section 4 or 6 is observable in the
suite: no `scrollWidth`, no `clientWidth`, no `offsetLeft`, no ellipsis, no flex
resolution. Trap n°3 in full. **Plan for the browser walk** — panel view and
sections view, both, as always — and keep the suite to what it can actually see:
the migration, the config round trip through `storedConfig`, the header's
appearance condition, the flattening in `backgroundData` / `mergeBackground`, the
`edit-sub-element` payload, and the guard when `hui-heading-badges-editor` is
undefined.

Every new test gets run against the defect before it is kept, with the failure
text recorded — trap n°5.

## 8. Open, before this becomes a plan

1. **Title weight: 400 or 500.** 400 reads as the heading card enlarged; 500
   returns some of today's presence without going back to 24px. Needs an eye,
   not an argument.
2. **The icon's size** once the weight is settled — 18px sits under 16px text
   for them; ~22px is the proportional guess, unverified.
3. **The header's own padding**, now that `ha-card`'s no longer applies.
4. ~~**"Card config" writing to two places.**~~ **Superseded 2026-08-19** by
   `mem:picture-studio/follow-ups` entry 8: the section is being split, and a
   *Heading* section carrying title, icon and the badge list answers this by
   removing the section that had the problem. Nothing to decide here any more —
   it is decided in that brainstorm.
5. **A tolerated `heading_style`** in stored config, or an unknown key we drop.
6. **Whether the header sits above or below the image** — assumed above
   throughout, never actually asked.
