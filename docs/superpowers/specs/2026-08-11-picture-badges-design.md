# Picture Badges — design

Status: approved 2026-08-11. Supersedes the exploratory report in
[`docs/visual-picture-elements-handoff.md`](../../visual-picture-elements-handoff.md),
which remains valid as background on Home Assistant internals but predates the
decisions recorded here.

---

## 1. Goal

A custom Lovelace card, `custom:picture-badges`, that shows an image with
Lovelace **badges** placed on top of it, positioned by **dragging them directly
on the live preview** inside the normal card-edit dialog.

The name echoes `picture-elements`. The card is not a superset of it: it renders
badges only.

Guiding constraint, stated repeatedly by the user: **reuse native Home Assistant
components wherever they exist**. We own the drag layer, because it has no
native equivalent, and as little else as possible.

### 1.1 In scope for v1

- Background rendering via `hui-image` (static image, camera, `state_image`,
  `dark_mode_image`, filters, `aspect_ratio`, `fit_mode`).
- Any Lovelace badge, including third-party badges registered in
  `window.customBadges` (Mushroom and similar).
- Drag positioning on the preview, percentage-based, resolution-independent.
- Add / edit badges through the **native** badge picker and edit dialogs.
- Reorder badges by drag, which also determines stacking order.
- Neutralising badge actions while editing. Not a feature — a precondition:
  without it, clicking a badge in the editor toggles the light.

### 1.2 Out of scope for v1

Grid snapping; keyboard nudge; multi-selection; resizing badges; importing an
existing `picture-elements` config.

Explicitly **not needed, ever**: a `z-index` field. Stacking follows DOM order,
which follows list order, and the list is reorderable. Moving a badge down the
list brings it to the front.

Possible later, and deliberately not designed for now: a `custom:badge-element`
that renders a badge inside a **native** `picture-elements` card. The card does
not depend on it.

---

## 2. Decisions and rationale

Each of these was weighed against at least one rejected alternative.

### 2.1 Own vocabulary, not a `picture-elements` superset

**Rejected:** keep `elements[]` and add a `custom:badge-element` type, so the
config stays a valid `picture-elements` config.

**Chosen:** a dedicated `badges[]` schema (§5).

The entire cost of this project sits in the editor. A `picture-elements`
superset forces that editor to cover every native element type — `icon`,
`state-label`, `service-button`, `conditional`, `image` — either by wrapping the
native editor (which cannot have its `style` fields removed, nor be restyled) or
by rewriting N sub-forms. It also forces the drag layer to handle heterogeneous
items, including `conditional` elements, which shift index alignment and are not
draggable.

A single item type collapses all of that: one native picker, one native edit
dialog, homogeneous drag. The separation between content and position becomes
structural rather than something to enforce — badge configs have no notion of
position, so the native form cannot see or damage it.

What we give up: native `picture-elements` element types, and copy-paste
migration from an existing `picture-elements` config. Custom badges cover the
bulk of real usage, and "graduating" to a built-in card was never realistic —
drag-on-preview will not land natively.

### 2.2 `hui-image` for the background, not the `picture` card

`hui-image` is the shared atom that `picture`, `picture-entity`,
`picture-glance` and `picture-elements` all wrap. Using it directly yields
cameras, `state_image`, `dark_mode_image`, filters, aspect ratio and fit mode
for free.

Wrapping the `picture` card instead would layer our badges over a foreign shadow
root, giving up control of the aspect ratio — and the drag surface **must**
match the image's exact ratio, or percentages drift relative to what the user
sees.

### 2.3 Proportional anchoring for positions

**Rejected:** the native `picture-elements` model, a constant
`translate(-50%, -50%)` — the point marks the badge's centre.

**Chosen:** `translate(-left%, -top%)`, the semantics of CSS
`background-position`. At 0 the badge is flush with the top-left corner, at 50
it is centred, at 100 it is flush with the bottom-right corner.

Centre anchoring buys nothing in a WYSIWYG editor: the user drags until the
result looks right, and we record whatever reproduces that result. It would only
matter for numeric entry or for importing `picture-elements` configs, both out
of scope.

Against that, centre anchoring cannot guarantee that a badge stays inside the
image. Clamping at drag time uses the badge's half-size measured *then*; on a
narrower screen the container shrinks while the badge keeps its pixel size, so
the clamp no longer holds and the badge overflows again. Proportional anchoring
makes overflow structurally impossible, with no runtime layout logic at all.

### 2.4 Build-to-`www`, not a dev server

**Rejected:** serving the card from a dev server registered as a Lovelace
resource, for HMR.

**Chosen:** watch-build into a directory mounted at `/config/www/`, loaded as
`/local/picture-badges/picture-badges.js`, reload with F5.

HMR would not help much: the work happens inside a card-edit dialog that a hot
reload does not restore, so the dialog has to be reopened either way. The chosen
path is also byte-for-byte the one HACS users will exercise.

### 2.5 Bundle Lit; do not borrow Home Assistant's

Home Assistant's frontend is bundled, with no import map and no `window.lit`.
The only access is a prototype hack inherited from Lit 1
(`Object.getPrototypeOf(customElements.get("ha-panel-lovelace"))`, then reading
`html`/`css` off the prototype) which depends on a non-contractual internal tag
*and* on an API shape Lit dropped in v2. It buys 10–15 kB gzipped and costs the
guarantee that the card survives a Home Assistant upgrade.

Two coexisting Lit copies are harmless — a console warning, nothing more —
because we share no base class with Home Assistant.

The reuse that matters is not Lit. `ha-form`, `ha-sortable`, `ha-icon-button`
and the badge dialogs are already in the global `customElements` registry; we
consume them by creating tags, with no import and no version coupling. Our
bundled Lit serves only our two components.

### 2.6 Toolchain: Rslib + Rstest

Rsbuild targets applications (HTML entry, dev server); Rslib is the library
layer built on it and emits exactly what we need — a single ES file.
`autoExternal: false` is mandatory, or Rslib externalises dependencies and Lit
is left out of the bundle.

`custom-card-helpers` is **not** used. It lags the current frontend and knows
nothing of `customBadges` or the badge dialogs. We declare the handful of
interfaces we need and take `HassEntity` from `home-assistant-js-websocket`.

---

## 3. Architecture

Three units in one bundle, two channels.

```
┌──────────────────────┐   patchPosition()    ┌────────────────────────┐
│ CARD (preview)       │ ──── via BROKER ───► │ EDITOR (authority)     │
│ hui-image + badges   │                      │ canonical config       │
│ drag layer           │ ◄─ HA: setConfig ─── │ re-emits config-changed│
└──────────────────────┘                      └────────────────────────┘
```

- **card → editor**: a module-scope broker. Both elements ship in the same
  bundle, so they share module scope. The editor registers on
  `connectedCallback` and unregisters on `disconnectedCallback`; the card asks
  for the active editor.
- **editor → card**: never direct. `config-changed` → Home Assistant →
  `setConfig`. The editor is the sole authority; the card commits nothing.

```ts
const editors = new Set<EditorChannel>();
const registerEditor = (ch: EditorChannel) => (editors.add(ch), () => editors.delete(ch));
const activeEditor = () => (editors.size === 1 ? [...editors][0] : undefined);
```

The broker also solves gallery-versus-dialog discrimination for free. Home
Assistant sets `preview = true` on the card in **both** the edit dialog and the
card-picker gallery, and nothing distinguishes them — but no editor is mounted
in the gallery, so `activeEditor()` returns `undefined` and the drag layer stays
inert.

### 3.1 One drag, end to end

1. `pointerdown` — capture the pointer; the drag layer takes over.
2. `pointermove` — mutate the node's `style.left/top` **in pixels**, clamped to
   `[0, W−w]`. No config round-trip, no latency.
3. `pointerup` — convert (§4.3) and make the single call
   `editor.patchPosition(index, position)`.
4. The editor updates its config and re-emits `config-changed`.
5. Home Assistant calls `setConfig` on the card; it re-renders in percentages,
   pixel-identical to where the gesture ended.

Two mandatory guards:

- **`_applying`** around every push of config into a native child component.
  Those components emit their own `config-changed` in response, which must be
  ignored or the loop never terminates.
- **Idempotent `setConfig`.** Home Assistant reuses the same preview instance as
  long as the card `type` is unchanged, so drag state must survive config
  updates.

### 3.2 Module layout

Two modules are pure and carry the logic worth unit-testing; everything else is
DOM plumbing.

```
src/
  index.ts                      registration: customElements.define, window.customCards
  broker.ts                     editor registry, EditorChannel
  types.ts                      the handful of Home Assistant interfaces we declare
  config.ts                     PictureBadgesConfig, defaults, normalisation
  position.ts                   px ↔ % conversion and clamping          ← pure, tested
  card/picture-badges-card.ts   hui-image, badge children, hass propagation
  card/drag-layer.ts            pointer capture, live px nudge, release
  editor/picture-badges-editor.ts   hub: _commit / _reemit / _applying
  editor/badge-list.ts          ha-sortable rows, add button
  editor/background-schema.ts   ha-form schema for the background
  editor/native-dialogs.ts      shim building and absorption             ← pure, tested
```

---

## 4. The card

```html
<ha-card>
  <div class="root">                            <!-- position: relative -->
    <hui-image .hass .image .cameraImage …/>     <!-- display: block; width: 100% -->
    <div class="item" data-index="0" style="…">  <!-- absolute; top/left %; translate() -->
      <hui-…-badge>                              <!-- from createBadgeElement -->
    </div>
  </div>
</ha-card>
```

`.root` holds only `hui-image` in normal flow, so the image dictates its height
and the drag surface matches the image's ratio exactly.

### 4.1 The `.item` wrapper carries position, and makes neutralising clean

Positioning and `data-index` live on the wrapper, never on the badge. While
editing, the badge gets `pointer-events: none` and the wrapper gets
`pointer-events: auto`. The wrapper hugs the badge (`display: inline-block`), so
it receives every `pointerdown` while the badge receives none — a click cannot
reach the badge's own action, and we still know which index was hit, without
duplicating geometry into a separate handle layer.

Outside editing we set neither, and native badge actions work normally.

### 4.2 Lifecycle

On `setConfig`, rebuild children only if the list of badge `type`s changed;
otherwise call `badge.setConfig(cfg)` on the existing instances and refresh
wrapper styles. This is what lets an in-flight drag survive a config round-trip.

On `set hass`, propagate `.hass` to every badge. This is the price of owning the
container rather than wrapping a native card.

A badge whose library is not installed already yields a `hui-error-badge` from
`createBadgeElement`, including its two-second grace period while the module
loads. Nothing to write.

`getStubConfig` returns an example image and an empty list, so the gallery
preview is not an empty frame.

---

## 5. The editor

Three zones: an `ha-form` for the background (`image`, `camera_image`,
`camera_view`, `aspect_ratio`), a sortable badge list, an "add badge" button.

### 5.1 List

`ha-sortable` — Home Assistant's SortableJS wrapper — provides the reordering
drag: `handle-selector`, `draggable-selector`, `filter`, `group`, `disabled`,
and the events `item-moved` (`{oldIndex, newIndex}`), `item-added`,
`item-removed`, `drag-start`, `drag-end`. SortableJS itself is lazy-loaded on
the Home Assistant side and never enters our bundle.

We write only the row template (handle, label, pencil, trash) and the add
button. We clone the row pattern from `hui-heading-badges-editor` rather than
instantiating that component: its add menu is hard-coded to `entity` and
`button` and ignores custom badges.

The list is labelled so that "lower in the list is on top" is explicit.

### 5.2 Add and edit are delegated to the native dialogs

```ts
// outward: a synthetic Lovelace config
const shim = { views: [{ badges: this._config.badges.map((b) => b.badge) }] };

showCreateBadgeDialog(this, { lovelaceConfig: shim, path: [0], saveConfig: this._absorb });
showEditBadgeDialog(this, { lovelaceConfig: shim, path: [0], badgeIndex: i, saveConfig: this._absorb });

// inward: keep views[0].badges, re-pair by index
private _absorb = (next: LovelaceConfig) => {
  const badges = next.views[0].badges ?? [];
  this._commit({
    ...this._config,
    badges: badges.map((badge, i) => ({
      badge,
      position: this._config.badges[i]?.position ?? { top: 50, left: 50 },
    })),
  });
};
```

Both dialogs are `fireEvent(el, "show-dialog", …)`, so they reach Home
Assistant's dialog manager from our editor without instantiating any private
API. Both funnel through our `saveConfig`: the picker either calls
`addBadge(lovelaceConfig, path, config)` directly (entity suggestion) or hands
off to `showEditBadgeDialog` with `badgeConfig`, which ends the same way.

Index re-pairing is safe because the only mutations Home Assistant applies are
`addBadge` (appends) and `replaceBadge` (constant index). A newly added badge
therefore lands at the centre of the image, ready to be dragged.

Delete and reorder never take this path. They are ours, and act directly on
`badges[]`, moving each `{badge, position}` pair as a unit — so a reorder
changes stacking without disturbing any position.

For no form code, this yields: the native picker with its "Custom" section fed
by `window.customBadges`, entity suggestions, each badge type's own form, the
GUI/YAML toggle, live preview and dirty-state tracking. Third-party badges take
this path with no special handling.

### 5.3 Convergence

Drag (`patchPosition`), dialogs (`_absorb`) and the background `ha-form` all end
in `_commit`, whose single exit toward Home Assistant is `_reemit`. One
authority, one emission point.

---

## 6. Config schema

```yaml
type: custom:picture-badges
image: /local/plan.png        # or camera_image / camera_view / state_image / dark_mode_image
aspect_ratio: "16:9"          # plus filter, fit_mode — anything hui-image accepts
badges:
  - badge:                    # a Lovelace badge config, opaque to us
      type: custom:mushroom-template-badge
      entity: light.salon
    position:
      top: 30
      left: 45
```

**`badge` is opaque.** We never read, validate or rewrite its contents; it
travels between the native dialog and `createBadgeElement` untouched. That is
what makes third-party badges work with no code of ours, and what will make
future native badges work too.

**`position` is separate, in numbers 0–100.** Separate, because that boundary is
the whole justification for this vocabulary: the native form edits `badge` and
cannot see `position`; the drag layer edits `position` and cannot damage
`badge`. Numbers rather than CSS strings, because percentages are all we need —
comparing, clamping and testing them stays trivial, and the YAML stays readable.

The `%` suffix and `translate(-left%, -top%)` are **derived at render time,
never stored**. One source of truth, no possible drift between the two.

No version key, no free-form `style`, no `z-index`. A badge without `position`
falls at the centre.

Storage-mode dashboards persist this as JSON in `.storage`; the dialog's YAML
editor serialises it in block style, as above.

---

## 7. Positioning model

```
during drag   left in px, clamped to [0, W − w]      (no transform)
on release    L = 100 · X / (W − w)                  → L ∈ [0, 100] by construction
render        left: L%   +   transform: translate(-L%, -T%)
```

`translate()` percentages resolve against the **element's own** size, while
`top`/`left` percentages resolve against the container. Passing the position
values into `translate` therefore anchors the badge proportionally: 0 flush
top-left, 50 centred, 100 flush bottom-right.

Consequences:

- Clamping is exact and trivial. No half-size measurement, no drift.
- Overflow is impossible at any container size, with no runtime clamping.
- The render after release reproduces the end of the gesture to the pixel, so
  there is no flash.

Round to two decimals. Guard the degenerate case `W == w` (badge as wide as the
container): division by zero, fall back to `0`.

---

## 8. Development environment

```
docker-compose.yml   ghcr.io/home-assistant/home-assistant:stable
                     ./.ha/config → /config                      (persistent, gitignored)
                     ./dist       → /config/www/picture-badges    (read-only)
                     8123:8123
```

The devcontainer already provides Node 24, pnpm, Biome and docker-in-docker. The
Home Assistant container is therefore a child of the devcontainer, so bind
mounts resolve against workspace paths directly. The only devcontainer change is
`forwardPorts: [8123]`.

**Loop.** `pnpm dev` runs `rslib build --watch` into `dist/`, immediately visible
to Home Assistant at `/local/picture-badges/picture-badges.js`. The Lovelace
resource is registered once, with a `?v=` query to bump when the cache is
stubborn. Rebuild is roughly 200 ms, then F5.

**Build.** Rslib, `format: "esm"`, `bundle: true`, `autoExternal: false`, target
`web` / ES2022, single-file output. TypeScript decorators enabled for Lit.

**Quality.** Biome for lint and format, run after every modification.

**Distribution.** `hacs.json`; `dist/` attached to GitHub releases and
gitignored. `.ha/config/` is gitignored too — it holds the database, secrets and
tokens. Home Assistant onboarding (account creation) is manual once on the first
`docker compose up`; the volume persists afterwards.

**Scripts.** `dev`, `build`, `test`, `lint`, `ha:up`, `ha:down`.

---

## 9. Testing

Rstest, on what is worth testing and testable without a DOM:

- **Position conversion** — `L = 100·X/(W−w)`, clamping, two-decimal rounding,
  the degenerate `W == w`.
- **`_absorb`** — position/badge re-pairing after the two mutations the dialogs
  can produce: append and replace-at-index.
- **Local list mutations** — delete and reorder never reach `_absorb`; they act
  on our own `badges[]`, moving each `{badge, position}` pair as a unit.

The drag gesture itself and the integration with native dialogs are verified in
the running Home Assistant instance. Simulating them would cost more than
watching them work.

---

## 10. Runtime verification tasks

These depend on the target Home Assistant version and must be checked in
devtools against the running instance, before or while wiring the code that
relies on them.

1. `hui-image`'s exact camelCase property names. The 1:1 mapping with config
   keys (`image`, `camera_image`, `camera_view`, `state_image`, `aspect_ratio`,
   `filter`, `dark_mode_image`) is stable; only the casing needs confirming.
2. That the synthetic `{ views: [{ badges }] }` config satisfies
   `findLovelaceContainer(config, [0])`, which both badge dialogs call on open.
3. That `show-dialog` fired from our own `getConfigElement` reaches Home
   Assistant's dialog manager.
4. That `ha-sortable` is already defined when our editor mounts. It very likely
   is — the card-edit dialog loads a great deal — otherwise force it with the
   same warm-up used for other components: instantiate a native editor that uses
   it, then `customElements.whenDefined`.
5. That `preview` is set on the card in both contexts, and that `activeEditor()`
   really is `undefined` in the card-picker gallery.
6. Whether Home Assistant passes `lovelace` to our editor element.

---

## 11. Accepted risks and known limitations

- **Internal APIs.** `ha-form`, selectors, `ha-sortable`, `createBadgeElement`
  and the badge dialogs are internal and non-contractual. In practice they are
  the most depended-upon surface in the whole frontend; this is the bet the
  entire custom-card ecosystem makes.
- **A spurious toast.** The native dialog's `_save` calls
  `showSaveSuccessToast`, so closing it shows "Saved" even though only an editor
  draft changed. Not disableable, functionally harmless. Revisit later.
- **Two Lit copies.** A console warning about multiple Lit versions. No
  functional impact.
- **Badge dialogs think in views.** They operate on a full Lovelace config at a
  `path: [viewIndex]`. The shim is a deliberate workaround, and verification
  task 2 covers it.
