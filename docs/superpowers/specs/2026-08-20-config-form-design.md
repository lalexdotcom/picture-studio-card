# The config form, redrawn — design

Status: **DRAFT — layout settled, schema not yet designed.** Brainstormed
2026-08-19 and 2026-08-20 alongside
[`2026-08-19-card-heading-design.md`](2026-08-19-card-heading-design.md), which
covers the header itself and which this one decides the placement for. The two
ship together in 1.5.0. Nothing here has been implemented.

Today the editor is one expandable, "Card config", holding every background key,
followed by the item list. This splits it into five collapsible sections and
settles what the card does with the background keys it forwards.

## 1. The five sections, in order

| | section | contents |
|---|---|---|
| 1 | **Background** — *open by default* | the static picture, the dark-mode picture, one **image-or-camera entity** field, and `camera_view` shown **only** when the chosen entity is a camera |
| 2 | **Items** | item count as a badge in the header; caption and the Add button on the first line; the list inside a max-height wrapper |
| 3 | **Heading** | `heading`, `icon`, then an `<hr>`, a "Badges" caption carrying the heading card's own section icon, and the badge list — **the badges are not a section of their own** |
| 4 | **Filters** | `filter` and `dark_mode_filter` |
| 5 | **Entity** | `entity`, then `state_image` and `state_filter` as `object` selectors |

Section 5 groups exactly what depends on `entity`, which is what names it.
Putting `state_image` anywhere other than under the field it depends on is the
thing being avoided.

**`dark_mode_filter` is not entity-dependent** — it is gated on
`hass.themes.darkMode`, like `dark_mode_image`. It belongs in Filters, not in
Entity. This corrected a misreading during the brainstorm.

Section 5's title has no Home Assistant key. `generic.entity` gives "Entity",
right for a field and thin for a section; "Filter" would be wrong since
`state_image` is not a filter. This is a legitimate case for `src/strings.ts`,
our own catalogue of last resort.

### The Items section, in detail

- The count is a **badge in the section header**. `visibility-section.ts` already
  solved the placement: `ha-expansion-panel`'s `icons` slot lands *after* the
  chevron, so a count that belongs beside the title goes in the header div.
- The list sits in a **max-height wrapper** so a long list stops pushing
  everything below it off the screen.
- **Scroll behaviour**, as asked: restore the list's scroll when an item's form
  opens; open the section and scroll to the row when `selectedItem` changes while
  the list is visible; and when `selectedItem` becomes `null` because the user
  clicked the preview's background, leave the Items section expanded and restore
  the *form's* own scroll so the section is in view.
- **`ha-sortable` inside a scrolling wrapper is the supported case.** It creates
  SortableJS with `scroll: true`, `forceAutoScrollFallback: true`,
  `scrollSpeed: 20`, commenting that the fallback autoscroll works better than
  the native one; the fallback walks up to the nearest scrollable ancestor. Two
  cautions: `ha-sortable` takes `this.children[0]` as its container, so the
  scrolling wrapper must sit **above** `<ha-sortable>`, not between it and the
  list — and none of this is observable in happy-dom. Browser walk, not a test.

## 2. The image-or-camera entity field

One field in the interface, **two keys in storage**. Domain bounded to
`["image", "camera"]`.

Storing one key of our own was considered and rejected. What makes the
background free to maintain is that we never read it — `BACKGROUND_KEYS` hands
it to `hui-image-element` verbatim and Home Assistant decides. A merged key of
our own would mean interpreting the background, a migration, and our own
precedence documentation to keep true. The gain is cosmetic; the cost is
permanent.

**The selector is authoritative: what it shows is what renders.**

- With both keys present, it shows the **camera**, because the camera wins at
  render.
- Writing an entity into it **clears the sibling key**, and `camera_view` too
  when leaving a camera.
- **Clearing it clears both keys.** This is what makes the no-alert decision
  safe: a forgotten key cannot resurface through the interface.
- A hand-written YAML holding both stays as written until the field is touched,
  and repairs itself on the first pass.

`person` is excluded from the domain, which fixes by construction a claim
[`README.md:138`](../../../README.md) makes and cannot keep — see §4.

### Why no alert

Considered and dropped. **Home Assistant's four picture cards warn about
nothing**: the only `ha-alert` among their editors is a positioning hint in
picture-elements' sub-element editor. They accept competing sources silently and
let precedence decide — but they also show every key, so the dead one is at least
visible.

The rule adopted: **an alert without a remedy in the interface is a reproach, not
help** — the `visibility` Reset button is the standard to meet. Since the field's
own dispatch already cleans, the conflicting state can only come from
hand-written YAML and repairs itself on contact. That is a narrow enough window.

**One case is left open, deliberately not relitigated**: a static `image` set
*and* an entity chosen. The dispatch cannot clean it — deleting someone's picture
because they added an entity would be destructive — so the "Picture" field stays
visible, filled, and inert. It is the one place where the "visible and solvable"
criterion applies in full.

## 3. Keys: kept, forbidden, YAML-only

**Kept, and not to be relitigated**: `entity`, `state_image`, `state_filter`
travel as one block — the last two index on the first and go inert without it,
and all three are documented in the README. Dropping `entity` alone would leave
two documented keys that save cleanly and do nothing, which is trap n°1 in its
worst form. `filter` is kept outright: self-contained, no trap, and it serves
*this* card — `brightness(0.9)` to calm a plan so the items read against it.
Keeping them costs nothing; they are already forwarded verbatim and no code of
ours reads them. Removing them would mean *adding* code to filter them out.

**The filters move to YAML-only in the form** — settled after the above; the
Filters section holds `filter` and `dark_mode_filter`, and `state_filter` sits in
Entity. *(These two statements are the layout above; the earlier "no Filter
section at all" position was superseded on 2026-08-20.)*

**`fit_mode` must never reach our card.** Not a preference — a correctness rule.
Items are placed in percentages of the box; `contain` and `fill` move or distort
the image *inside* that box while the percentages stay indexed to the box, so
every placement slips. `cover` is the only mode compatible with percentage
placement, which is exactly why picture-elements has `aspect_ratio` and **not**
`fit_mode`, while picture-entity and picture-glance have both.

**`theme` is unreachable.** `applyThemesOnElement` resolves a named theme and
writes its variables inline on the element; it is a *function* in `common/dom/`,
not a custom element, so the 2026-08-19 amendment about reaching elements by tag
does not rescue it. A `theme:` key would save cleanly and do nothing.

**`aspect_ratio` stays YAML-only** — legitimate (it changes the box, not the
image's relation to the box) and easy to promote later.

**`image_entity` could be promoted** — Home Assistant has the selector ready,
`{ entity: { domain: ["image", "person"] } }` — but it is subsumed by the merged
field above, minus `person`.

## 4. How the background resolves, and what breaks

Read in `components/hui-image.ts` and `elements/hui-image-element.ts` at build
20260729.6.

`hui-image-element` resolves `image_entity` into `image` **before** `hui-image`
sees anything. The order that then applies:

1. `camera_image` — wins over everything. `camera_view: live` mounts
   `ha-camera-stream`; `auto` shows a still refreshed every 10 s.
2. `state_image[state of entity]` — on no match, falls back to `image` and sets
   `imageFallback`, which is what re-arms the grayscale below.
3. `dark_mode_image`, in dark mode.
4. `entity`, if it is itself of the `image` domain — `hui-image`'s own branch,
   distinct from `image_entity`.
5. `image`.

**The grayscale sting.** When the computed filter is empty *and* `entity` is set,
`hui-image` applies `DEFAULT_FILTER = grayscale(100%)` as soon as the entity is
off or unavailable **and** the picture shown is a fallback. Setting `entity`
alone is enough to grey the plan, with nothing in the config saying so. It cannot
be fixed without diverging from `hui-image`; it is documented instead.

**The filters concatenate**, in this order:

```
filter = (filter || "")
       + (darkMode && dark_mode_filter ? dark_mode_filter : "")
       + (state_filter[state of entity] ?? "")
```

**`filter` is not ours and not picture-elements' either.**
`PictureElementsCardConfig` does not declare it and their card never passes
`.filter`, so at *their* card level it is inert. It belongs to the image
*element*, and we inherit it because our background **is** a
`hui-image-element`. What is ours is having lifted it to card level.

### The four failure shapes, all accepted as-is

Decided 2026-08-20: **we detect none of them.** The bounded selector makes the
two bad ones unreachable through the interface; hand-written YAML stays free.

| config | result |
|---|---|
| `camera_image` names nothing | `_onImageError()` → `#brokenImage`, a grey block with HA's broken-image glyph |
| `camera_image` names a non-camera | `auth/sign_path` signs any path without checking the entity, so a valid URL is produced, the `<img>` fails, `@error` → broken image. **`camera_view: live` is the one branch not read — verify at the walk.** |
| `image_entity` names nothing | `stateObj` is undefined, the ternary falls through, **the static `image` shows**. A typo degrades gracefully. |
| `image_entity` names something with no `access_token` | `computeImageUrl` → `undefined`, `image` becomes undefined **and the static picture is short-circuited**. No load is attempted, so no error fires: **an indefinite spinner.** |

The inversion is worth remembering: on `image_entity`, **getting the name wrong
is better than getting the entity wrong.**

### The README claim that cannot be kept

[`README.md:138`](../../../README.md) promises "an image **or person** entity".
True of the picture-elements *card*, which switches on the domain and reads
`entity_picture`. **False for the element we use**: `computeImageUrl` returns
`undefined` without an `access_token`, which a `person` never has. Worse, the
ternary tests the entity's existence rather than the URL's, so the configured
`image` is suppressed along with it. Bounding the selector to
`["image", "camera"]` fixes this by construction; the README line needs
correcting either way.

## 5. Open

1. Section 5's title, and the merged field's label — both ours to write.
2. The title's weight and the header icon's size — in the other spec; questions
   for the eye, at the walk.
3. **The whole schema.** How five sections map onto `ha-form` instances when two
   of them contain components rather than fields, how `heading.*` is flattened
   and folded back, how the merged field is expressed, and how `camera_view`
   becomes conditional. Next session.
