# The config form, redrawn — design

Status: **ready for review.** Brainstormed 2026-08-19 and 2026-08-20 alongside
[`2026-08-19-card-heading-design.md`](2026-08-19-card-heading-design.md), which
covers the header itself and whose placement this one decides. The two ship
together in 1.5.0.

Today the editor is one expandable, "Card config", holding every background key,
followed by the item list. This splits it into five collapsible sections, settles
what the card does with the background keys it forwards, and brings the last
YAML-only keys into the interface.

## What changes for someone configuring the card

- The form is five collapsible sections instead of one panel and a list.
- **Every key is now reachable from the interface.** Nothing is YAML-only any
  more — `entity`, `image_entity`, `state_image`, `aspect_ratio` and `filter`
  were the last five.
- The camera entity and the image entity become **one field**. They were always
  mutually exclusive at render; now they are mutually exclusive to configure.
- The item list carries its count, and stops growing without limit.
- `title` moves to `heading.title`. Existing configs keep working — the migration
  is in the other spec.

## 1. The five sections

| | section | contents |
|---|---|---|
| 1 | **Background** — *open by default* | `image`, `dark_mode_image`, the **image-or-camera entity** field, `camera_view` (only when the chosen entity is a camera), `aspect_ratio` |
| 2 | **Items** | count as a badge in the header; caption and Add button on the first line; the list in a max-height wrapper |
| 3 | **Heading** | `title`, `icon`, then an `<hr>`, a "Badges" caption with the heading card's own section icon, and the badge list |
| 4 | **Filters** | `filter`, `dark_mode_filter` |
| 5 | **Entity** | `entity`, `state_image`, `state_filter` |

Section 5 groups exactly what depends on `entity`, which is what names it.
Putting `state_image` anywhere but under the field it depends on is the thing
being avoided.

**`dark_mode_filter` is not entity-dependent** — it is gated on
`hass.themes.darkMode`, like `dark_mode_image`, so it belongs in Filters. This
corrected a misreading during the brainstorm.

**The badges are not a section.** Inside Heading they are a separated block, not
a nested panel — a panel inside a panel reads as a level of structure that is not
there.

`aspect_ratio` sits in Background after `camera_view`, mirroring Home Assistant's
own grouping in picture-entity and picture-glance (`camera_view`, `fit_mode`,
`aspect_ratio` in one sub-group) minus `fit_mode`, which we forbid — see §6.

### The Items section, in detail

- The count is a **badge in the section header**, beside the title.
  `visibility-section.ts` already established why: `ha-expansion-panel`'s `icons`
  slot lands *after* the chevron, so anything belonging beside the title goes in
  the header div instead.
- The list sits in a **max-height wrapper** so a long list stops pushing the
  sections below it off the screen.
- **Scroll behaviour.** Restore the list's own scroll when an item's form opens.
  Open the section and scroll the row into view when the selected item changes
  while the list is visible. When the selection is cleared by a click on the
  preview's background, leave the section expanded and restore the *form's* own
  scroll so the section stays in view.
- **`ha-sortable` inside a scrolling wrapper is the supported case**, not a
  workaround: it creates SortableJS with `scroll: true`,
  `forceAutoScrollFallback: true`, `scrollSpeed: 20`, noting that the fallback
  autoscroll behaves better than the native one, and that fallback walks up to
  the nearest scrollable ancestor. Two cautions: `ha-sortable` takes
  `this.children[0]` as its container, so the scrolling wrapper must sit
  **above** `<ha-sortable>`, never between it and the list — and none of this is
  observable in happy-dom.

## 2. One kind of panel, ours

**All five sections are our own `ha-expansion-panel`**, each holding a *flat*
`ha-form` for its fields plus components where it has them.

The alternative was to let `ha-form` draw its own expandables for the
field-only sections (1, 4, 5) and hand-roll only 2 and 3. It needs one fewer
component, and it was rejected: two origins of panel would have to be matched by
eye — `ha-form-expandable` puts its icon in `leading-icon`, zeroes the panel's
padding and wraps its body in a `.content` at 12px — and section 2 needs a custom
header for the count regardless. Uniformity by construction is worth the wrapper.

It also forces the split that the interleaving already required: an `ha-form`
renders its schema as one contiguous block, so the item list cannot sit inside
one. Four `ha-form` instances, one per section that has fields.

Consequence, and it is the rule that governs the whole file: **`ha-form` merges
the changed field onto the whole `.data` it was given**, so each instance needs
its own complete flat record — complete for *that section*, not for the card.

## 3. The schemas

`localize` is Home Assistant's; `own` is ours (`src/strings.ts`). Labels are
resolved per section, so `backgroundLabel`'s single namespace switch becomes one
routing per schema.

**Background**

```ts
{ name: "image",            selector: imageSelector(localize) }
{ name: "dark_mode_image",  selector: imageSelector(localize) }
{ name: "picture_entity",   selector: { entity: { domain: ["image", "camera"] } } }
{ name: "camera_view",      selector: { select: { options: auto|live, mode: "dropdown" } } }  // conditional
{ name: "aspect_ratio",     selector: { text: {} } }
```

**Heading**

```ts
{ name: "title", selector: { text: {} } }
{ name: "icon",  selector: { icon: {} } }
```

**Filters**

```ts
{ name: "filter",           selector: { text: {} } }
{ name: "dark_mode_filter", selector: { text: {} } }
```

**`object`, not `text`, and on purpose.** Both filters are `string`, so `text`
would match the type — and it was rejected. `ha-selector-object` renders an
`ha-yaml-editor`: a CodeMirror with syntax colouring, selection and copy-paste.
A CSS filter chain is code, and it is written more comfortably in a code editor
than in a one-line input. Home Assistant already does this for
`dark_mode_filter`; we extend it to `filter` rather than undo it.

The one consequence to know: the YAML editor **types** what is entered.
`brightness(0.7)` comes back as a string, but a bare `0.5` would come back as a
number, which `hui-image` would concatenate into the filter chain as-is — an
invalid filter that does nothing, silently. Marginal, and not a reason to prefer
`text`.

**Entity**

```ts
{ name: "entity",       selector: { entity: {} } }
{ name: "state_image",  selector: { object: {} } }
{ name: "state_filter", selector: { object: {} } }
```

## 4. Where form data is not the config

Three translations, and nothing else diverges.

**`heading` is flattened.** The Heading form is handed `{ title, icon }` and
folds them back into `heading` on merge. It must not write a `heading: {}` that
holds nothing — the same reasoning that keeps `storedConfig` from writing a
default `chrome`. `heading.badges` never passes through `ha-form`; the badge list
owns it.

**`picture_entity` is synthetic.** It exists only in form data.

| | |
|---|---|
| read | `config.camera_image ?? config.image_entity` — the camera first, because the camera is what renders |
| write, `camera.*` | set `camera_image`, delete `image_entity` |
| write, `image.*` | set `image_entity`, delete `camera_image` **and** `camera_view` |
| cleared | delete all three |

**`camera_view` is conditional**, so the Background schema is a function of
`localize` **and** of the data — a `memoizeOne` on the chosen entity's domain, as
Home Assistant's own editors do.

That breaks an invariant the current code relies on without naming it. Three
lists govern a section today — the **schema** (what is rendered), the **data
builder** (what `ha-form` is handed), and the **drop list** (which keys are
removed when the form leaves them empty). In `background-schema.ts` all three are
the same fixed set; `FORM_KEYS` is even declared
`satisfies ReadonlyArray<keyof BackgroundData>`. They cannot disagree, so nothing
guards against their disagreeing.

Make one of them conditional and both failure directions open up:

- **Data supplies `camera_view`, schema does not render it.** `ha-form` echoes it
  back untouched, the merge writes it into config, and it survives forever — a
  key invisible in the form and inert at render.
- **Data omits it, drop list still names it.** It is deleted as a side effect of
  editing any *other* field in the section, for a reason no one asked for.

So: **derive the data builder and the drop list from the schema actually
rendered**, and keep the three in step by construction rather than by
coincidence. The dispatch in the table above stays the only deliberate deleter
of `camera_view`.

## 5. The image-or-camera entity field

One field, **two keys in storage**, domain bounded to `["image", "camera"]`.

Storing one key of our own was considered and rejected. What makes the background
free to maintain is that we never read it — `BACKGROUND_KEYS` hands it to
`hui-image-element` verbatim and Home Assistant decides. A merged key of our own
would mean interpreting the background, a migration, and our own precedence
documentation to keep true. The gain is cosmetic; the cost is permanent.

**The field is authoritative: what it shows is what renders.** With both keys
present it shows the camera. Clearing it clears both keys, which is what makes
the next decision safe — a forgotten key cannot resurface through the interface.
A hand-written YAML holding both stays as written until the field is touched, and
repairs itself on the first pass.

`person` is excluded from the domain, which fixes by construction a claim the
README makes and cannot keep (§7).

### Why no alert

**Home Assistant's four picture cards warn about nothing.** The only `ha-alert`
among their editors is a positioning hint in picture-elements' sub-element
editor. They accept competing sources silently and let precedence decide — but
they also show every key, so the dead one is at least visible.

The rule adopted: **an alert with no remedy in the interface is a reproach, not
help** — the `visibility` Reset button is the standard to meet. Since the field's
own dispatch cleans, the conflicting state can only come from hand-written YAML
and repairs itself on contact. That window is narrow enough.

**One case is left open on purpose**: a static `image` set *and* an entity
chosen. The dispatch cannot clean it — deleting someone's picture because they
added an entity would be destructive — so the "Image path" field stays visible,
filled, and inert. It is the one place where "visible and solvable" applies in
full, and the one place an alert would still be defensible.

## 6. Keys: kept, forbidden

**Kept, not to be relitigated.** `entity`, `state_image` and `state_filter`
travel as one block: the last two index on the first and go inert without it, and
all three are documented. Dropping `entity` alone would leave two documented keys
that save cleanly and do nothing — trap n°1 in its worst form. `filter` is kept
outright: self-contained, no trap, and it serves *this* card — `brightness(0.9)`
to calm a plan so the items read against it. Keeping them costs nothing; they are
forwarded verbatim and no code of ours reads them. Removing them would mean
*adding* code to filter them out.

**`fit_mode` must never reach our card.** Not a preference — a correctness rule.
Items are placed in percentages of the box; `contain` and `fill` move or distort
the image *inside* that box while the percentages stay indexed to the box, so
every placement slips. `cover` is the only mode compatible with percentage
placement — which is exactly why picture-elements has `aspect_ratio` and **not**
`fit_mode`, while picture-entity and picture-glance have both.

**`theme` is unreachable.** `applyThemesOnElement` resolves a named theme and
writes its variables inline on the element. It is a *function* in `common/dom/`,
not a custom element, so the 2026-08-19 amendment about reaching elements by tag
does not rescue it. A `theme:` key would save cleanly and do nothing.

## 7. How the background resolves, and what breaks

Read in `components/hui-image.ts` and `elements/hui-image-element.ts` at build
20260729.6.

`hui-image-element` resolves `image_entity` into `image` **before** `hui-image`
sees anything. The order that then applies:

1. `camera_image` — wins over everything. `camera_view: live` mounts
   `ha-camera-stream`; `auto` shows a still refreshed every 10 s.
2. `state_image[state of entity]` — on no match, falls back to `image` and sets
   `imageFallback`, which re-arms the grayscale below.
3. `dark_mode_image`, in dark mode.
4. `entity`, if it is itself of the `image` domain — `hui-image`'s own branch,
   distinct from `image_entity`.
5. `image`.

**The grayscale sting.** When the computed filter is empty *and* `entity` is set,
`hui-image` applies `DEFAULT_FILTER = grayscale(100%)` as soon as the entity is
off or unavailable **and** the picture shown is a fallback. Setting `entity`
alone is enough to grey the plan, with nothing in the config saying so. It cannot
be fixed without diverging from `hui-image`, so it is documented instead.

**The filters concatenate:**

```
filter = (filter || "")
       + (darkMode && dark_mode_filter ? dark_mode_filter : "")
       + (state_filter[state of entity] ?? "")
```

**`filter` is neither ours nor picture-elements'.** `PictureElementsCardConfig`
does not declare it and their card never passes `.filter`, so at *their* card
level it is inert. It belongs to the image *element*, and we inherit it because
our background **is** a `hui-image-element`. What is ours is having lifted it to
card level.

**`aspect_ratio` accepts more forms than the docs suggest** — `16:9`, `16x9`,
`1.78:1`, `1.78x1`, a bare `1.78`, and a percentage like `56.25%`, which becomes
`{w: 100, h: 56.25}`. Anything it cannot read returns `null` **in silence**: no
error, no message, the image simply resumes its natural height. That was
acceptable while the key belonged to someone writing YAML with the docs open.
Exposed as a free text field, it wants a helper line giving the accepted forms —
Home Assistant provides none.

### The four failure shapes, all accepted as-is

**We detect none of them.** The bounded selector makes the two bad ones
unreachable through the interface; hand-written YAML stays free.

| config | result |
|---|---|
| `camera_image` names nothing | `_onImageError()` → `#brokenImage`, a grey block with HA's broken-image glyph |
| `camera_image` names a non-camera | `auth/sign_path` signs any path without checking the entity, so a valid URL is produced, the `<img>` fails, `@error` → broken image. **`camera_view: live` is the one branch not read — verify at the walk.** |
| `image_entity` names nothing | `stateObj` is undefined, the ternary falls through, **the static `image` shows**. A typo degrades gracefully. |
| `image_entity` names something with no `access_token` | `computeImageUrl` → `undefined`, `image` becomes undefined **and the static picture is short-circuited**. No load is attempted, so no error fires: **an indefinite spinner.** |

Worth remembering: on `image_entity`, **getting the name wrong is better than
getting the entity wrong.**

### The README claim that cannot be kept

`README.md:138` promises "an image **or person** entity". True of the
picture-elements *card*, which switches on the domain and reads `entity_picture`.
**False for the element we use**: `computeImageUrl` returns `undefined` without an
`access_token`, which a `person` never has — and the ternary tests the entity's
existence rather than the URL's, so the configured `image` is suppressed with it.
The bounded selector fixes this by construction; the line needs correcting
anyway.

`README.md:377`, which lists the YAML-only keys, is **deleted** rather than
corrected: there are none left.

## 8. Labels

Reused from Home Assistant, all in the `lovelace` fragment:

| key | label |
|---|---|
| `…card.heading.name` | Heading *(section 3 title)* |
| `…card.heading.badges` | Badges *(the caption)* |
| `…card.generic.title` / `.icon` | Title / Icon |
| `…card.generic.image` | Image path |
| `…card.picture-elements.dark_mode_image` | Dark mode image path |
| `…card.generic.camera_view` + `.camera_view_options.*` | Camera view / Auto / Live |
| `…card.generic.aspect_ratio` | Aspect ratio |
| `…card.generic.entity` | Entity |
| `…card.picture-elements.dark_mode_image` | Dark mode image path |
| `…card.picture-elements.dark_mode_filter` | Dark mode state filter |
| `…editor.elements.filter` | Filter |
| `…editor.elements.state_image` | State image |
| `…editor.elements.state_filter` | State filter |

**The `elements` namespace is the right one for us, not a lucky find.**
`state_image` appears in **no card editor at all** — not picture-entity, not
picture-glance, not picture-elements. It exists in exactly one editor in Home
Assistant: `hui-image-element-editor`, the editor of the image *element*, which
is what our background is. That editor resolves its labels as
`generic.<name>` → `elements.<name>` → the raw name, and we take the same chain
rather than inventing strings for keys Home Assistant already translates.
`dark_mode_image` and `dark_mode_filter` keep the `picture-elements` namespace
they use today, which is the only one that has them.

Ours, in `src/strings.ts` — `items` and `stacking_hint` already exist:

- section titles for **Background**, **Filters** and **Entity**; Home Assistant
  has no key for any of the three, and `generic.entity` ("Entity") is right for a
  field and thin for a section.
- the merged field's label — "Image or camera entity"; neither
  `generic.image_entity` nor `generic.camera_image` fits a field that is both.
- optionally, the `aspect_ratio` helper line from §7.

That is the whole list: four strings, one of them optional. Every field label
comes from Home Assistant.

## 9. Testing

happy-dom does no layout, so the max-height wrapper, the sortable's autoscroll,
the overflow and the panel geometry are **not observable in the suite** — trap
n°3. Plan for the browser walk, panel view and sections view both.

What the suite can hold: the `picture_entity` read and its four write branches,
the `heading` flatten and fold-back including the empty-`heading` guard, the
conditional presence of `camera_view` in the schema, each section's data/merge
round trip, the label routing per section, and the `title` → `heading.title`
migration.

Every new test is run against the defect before it is kept, with the failure text
recorded — trap n°5.

## 10. Open

1. **Wording** for the three section titles, the merged field, and the
   `aspect_ratio` helper. Content decided, phrasing not. Section 5 is called
   *Entity* here because that is the word used in the brainstorm; *State* was
   floated as a better fit for a section holding `state_image` and
   `state_filter` beside it.
2. **Whether the inert "Image path" alert of §5 is written**, or left as the one
   knowingly silent case.
3. In the other spec, and unchanged: the header title's **weight** (400 or 500)
   and the header **icon's size**. Questions for the eye, at the walk.
