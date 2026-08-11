# Handoff — Visual Picture Elements card + editor (Home Assistant)

> Design report distilled from a 40-turn exploratory conversation (2026-07-06).
> Audience: a coding agent picking up implementation from zero code.
> Nothing has been implemented yet. What follows is **decided architecture**,
> **verified facts**, **explicitly unverified assumptions**, and **open choices**.

---

## 1. Goal

Build a custom Lovelace card + editor that reproduces the built-in
`picture-elements` card, but adds **drag-and-drop positioning of overlay
elements directly on the live preview**, inside the normal dashboard card-edit
dialog.

Positioning model: `position: absolute` + `top`/`left` in **percent** +
`transform: translate(-50%, -50%)`. This is resolution-independent by
construction and is already the native picture-elements model — the editor only
*writes* those values, it does not invent a new layout system.

Secondary goal, stated repeatedly and strongly: **maximise reuse of native HA
components**. Own as little rendering and form code as possible. The only thing
we accept owning is the drag layer, which has no native equivalent.

---

## 2. Hard constraints (established, do not re-litigate)

### 2.1 You cannot inject drag into the built-in editor's preview
The built-in picture-elements GUI editor does exist (add/remove elements,
per-element sub-form, live preview) — but the preview is `hui-card-preview`
rendered by HA's own frontend code. It is not an extension point. There is no
supported way to attach pointer handlers to it.

**Therefore:** the only path to drag-on-preview is our own custom card + our own
editor. This is the same conclusion `shocklateboy92/custom-picture-elements-card`
reached.

### 2.2 The preview card is not the config authority
Config flows one way: editor (`getConfigElement`) → preview card. A
`config-changed` event emitted *from the preview card* is **not** wired back into
the dashboard config. The editor element is the authority.

**Therefore:** the preview cannot commit its own drag results. It must delegate
to the editor.

### 2.3 The editor element and the preview card have no shared ancestor
HA mounts the editor element and the `<hui-card preview>` in two separate
subtrees of the edit dialog, across shadow boundaries, with no cross-reference.
They cannot find each other via the DOM in any robust way.

**Therefore:** they need an explicit rendezvous mechanism. See §3.1.

### 2.4 There is no native "list + add/remove" shell you can feed an arbitrary form to
List management is assembled per-editor from shared primitives (`ha-sortable`,
`ha-icon-button`, dropdowns). `loadCardHelpers()` only exposes *factories*, never
editors. The "add" flow is also family-specific (the picture-elements type picker
≠ the badge picker ≠ the card picker).

**Two exceptions found, both important:**
- The `object` selector with `fields` + `multiple: true` **is** a generic
  native list-with-sub-form primitive (§4.3).
- `hui-heading-badges-editor` **is** a real reusable component, contrary to a
  first (wrong) assessment in the conversation (§4.4).

---

## 3. Decided architecture

Three pieces, two communication channels.

```
┌─────────────────────┐   patchElement()   ┌──────────────────────┐
│  CARD (preview)     │ ─────────────────► │  EDITOR (hub)        │
│  drag overlay       │   via BROKER       │  canonical config    │
│  ▲ setConfig        │ ◄───────────────── │  re-emits to HA      │
└─────────────────────┘   HA re-setConfig  └──────────────────────┘
          ▲                                            │
          └──────────────  Home Assistant  ◄───────────┘
                       (config-changed → setConfig)
```

- **preview → editor**: module-level broker (direct call).
- **editor → preview**: goes through HA (`config-changed` → HA → card's
  `setConfig`). Never a direct back-channel.

### 3.1 The broker
Both wrappers ship in the same bundle, so they share module scope. The editor
registers itself on `connectedCallback`, unregisters on `disconnectedCallback`.
The card asks for the active editor.

```ts
const editors = new Set<EditorChannel>();
const registerEditor = (ch: EditorChannel) => {
  editors.add(ch);
  return () => editors.delete(ch);
};
const activeEditor = () => (editors.size === 1 ? [...editors][0] : undefined);
```

**Free bonus:** this solves the gallery-vs-editor discrimination problem. The
`preview` property HA sets on cards is `true` in *both* the edit dialog and the
card-picker gallery, and does not distinguish them. But in the gallery no editor
is mounted → `activeEditor()` returns `undefined` → the drag overlay stays
inert. No extra signal needed.

**Alternative if multiple editors can be open simultaneously** (nested stacks):
the editor generates a `channelId` and injects it into the config, so HA
propagates it to the preview via `setConfig`, allowing exact matching. Cost: it
leaks into saved YAML unless stripped. Not needed for v1.

**Rejected:** DOM traversal up through the dialog — fragile against HA internals.

### 3.2 The config circulation loop

1. HA → **card**`.setConfig` → renders inner card + resyncs overlay handles
2. overlay `pointerup` → **broker** → **editor**`.patchElement(index, styleDelta)`
   *(the single preview→editor hop)*
3. editor updates canonical config → re-emits `config-changed` to HA
4. HA → **card**`.setConfig` again → overlay re-reads the `%` → loop closed

Native form edits converge on the **same** exit point (`_reemit`), so there is a
single config authority.

### 3.3 Anti-echo guard
The `config-changed` we emit comes back as `setConfig`. When the hub pushes
config down into the wrapped native editor, that can trigger the native editor's
own `config-changed` — which must be ignored. Hence the `_applying` boolean flag
around `_pushToNative`. Without it: infinite feedback loop.

### 3.4 Commit-on-pointerup
During `pointermove`, mutate the **real DOM node's** `style.left/top` directly
for zero-latency feedback. Only commit to config on `pointerup` — one config
round-trip per drag, not per frame. This also means `setConfig` arriving
mid-drag cannot corrupt an in-flight gesture.

Critical: the live nudge and the committed value must be **identical percentages**,
or you get a visible flash on re-render.

---

## 4. Component reuse decisions

### 4.1 Card rendering — build our own container, populate it with native elements

Decided after weighing two options:

- **(A) Wrap the whole native `picture-elements` card** and reach into its shadow
  root (`shadowRoot.querySelectorAll('.element')`, index-aligned with
  `config.elements`) to find nodes to drag. Maximum native. But `.element` and
  child ordering are **undocumented internals**, fragile across HA versions, and
  the index alignment **breaks with `conditional` elements** (an unrendered
  conditional shifts every subsequent index).
- **(B) Own a thin container**, render each element via
  `helpers.createHuiElement(cfg)` as a **direct light-DOM child** with
  `dataset.index`. ~30 lines of stable plumbing, robust hooks, no shadow-DOM
  archaeology.

**→ Chose (B).** `createHuiElement` is the same factory HA uses internally, so
elements stay version-aligned. It has been exposed to custom cards since 0.106
(`config-template-card` by iantrich uses it in production).

```ts
const { createHuiElement } = await window.loadCardHelpers();
this._config.elements.forEach((cfg, index) => {
  const el = createHuiElement(cfg);
  el.hass = this._hass;
  el.dataset.index = String(index);          // stable hook — it's OUR child
  Object.entries(cfg.style ?? {}).forEach(([k, v]) => el.style.setProperty(k, v));
  el.style.position = "absolute";
  this._container.append(el);
});
```

Costs we now own with (B):
- the **hass propagation loop** — on every `set hass`, re-propagate `.hass` to
  each created child (the native card did this for us);
- the **image container** (see §4.2).

Known limitation, unchanged from (A): `conditional` elements have their children
nested inside the conditional element — not individually draggable in v1.

### 4.2 Background — use `hui-image`

`hui-image` is the shared atom that `picture-entity`, `picture-glance` **and**
`picture-elements` all wrap internally. Using it directly gets us, for free:
static image, camera, `state_image`, `dark_mode_image`, filters, aspect-ratio,
`fit_mode`, person entities.

⚠️ **Unverified:** the exact camelCase property names on `hui-image`. The
conceptual 1:1 mapping with the config keys (`image`, `camera_image`,
`camera_view`, `state_image`, `aspect_ratio`, `filter`, `dark_mode_image`) is
stable; only the casing needs confirming in devtools on the target HA version.
**First implementation task: confirm these in devtools before wiring.**

### 4.3 Config editor — own `getConfigElement` built from `ha-form` + selectors

This is the sweet spot the conversation converged on.

**Why not reuse the native picture-elements editor wholesale?** It's reachable
(see §5.1) and gives list+add/remove+per-type sub-forms for free — but it's a
`getConfigElement` (opaque component), so you cannot strip the `style` fields
that the drag layer should own, and you cannot restyle the layout.

**Why not extract its schema?** Because `getConfigForm` (which returns a
*filterable schema*) is not what most built-in types use. Verified concretely:
`picture-entity` uses `getConfigElement` and returns
`document.createElement("hui-picture-entity-card-editor")` after a lazy import.
Its `ha-form` schema is a **private constant inside the component** — not
retrievable programmatically. Same for picture-elements and most rich cards.

> **General rule for triage:** type exposes `getConfigForm` → you get a schema
> you can filter. Type exposes `getConfigElement` → black box, embed whole or
> rewrite.

**→ Decision: write our own `getConfigElement` that renders `ha-form` with a
schema we control.** Native widgets, native look, exactly our fields, and the
drag/form synchronisation becomes trivial because both write the same `top`/`left`
keys of the same object.

Available schema primitives (all native, all confirmed):
- multi-entity picking: `{ selector: { entity: { multiple: true } } }` → renders
  `ha-entities-picker`
- actions: the UI action selector (tap/hold/double-tap) with the full native editor
- **list + per-item sub-form**: `{ selector: { object: { multiple: true,
  label_field: "entity", fields: {...} } } }` — gives list, add button, deletes,
  collapsible labelled rows, and a per-item sub-form, in **one schema entry**
- layout: `{ type: "grid", schema }` and `{ type: "expandable", schema }` to
  reproduce native sections/collapsible panels

Reference schema for the background section (rewritten by hand, since
picture-entity's is not extractable):

```ts
const BACKGROUND_SCHEMA = [
  { name: "image",        selector: { text: {} } },
  { name: "camera_image",  selector: { entity: { filter: { domain: "camera" } } } },
  { name: "camera_view",   selector: { select: { options: ["auto", "live"] } } },
  { name: "aspect_ratio",  selector: { text: {} } },
];
```

⚠️ **Unverified:** whether the `object` selector **preserves keys not declared in
`fields`** on round-trip. This matters only if we decide to hide `top`/`left`
from the form. If they're kept visible in `fields` the question is moot — and
keeping them visible is arguably better UX (keyboard-precise positioning that
stays in sync with the drag automatically). **Recommended: keep them in `fields`
for v1.**

⚠️ `ha-form` and selectors are **internal, non-contractual APIs**. In practice
they're the most stable and most depended-on surface in all of HA (dozens of
custom cards rely on them), so the risk is accepted — same bet the whole
ecosystem makes. Ensure `ha-form` is loaded when the editor mounts (usually
already loaded inside the edit dialog; otherwise force it via `loadCardHelpers`
plus creating an element that pulls it in).

### 4.4 The heading-badges list editor — reusable, if the look fits

The user pointed at the badges section of the **heading card** editor (sortable
list + edit/delete per row + "Add badge" dropdown) as the target UI.

Initially assessed as inline/non-reusable — **that was wrong and was corrected**
by fetching the actual source from `home-assistant/frontend@dev`:

- `src/panels/lovelace/editor/config-elements/hui-heading-card-editor.ts`
- `src/panels/lovelace/editor/config-elements/hui-heading-badges-editor.ts`

**`hui-heading-badges-editor` is a real, standalone, reusable custom element**
(364 lines, built only from `ha-sortable` / `ha-icon-button` / `ha-dropdown`).
The heading card editor merely instantiates it inside an `ha-expansion-panel`.

Verified contract:
- **Props**: `.hass`, `.badges` (array of badge configs)
- **Events**: `heading-badges-changed` `{ badges }` (add / remove / reorder),
  `edit-heading-badge` `{ index }` (pencil click)
- The "add" dropdown lists **only two types**: `entity` and `button`
  (`UI_BADGE_TYPES`). No entity-picking dialog — it takes the badge class, calls
  its `getStubConfig`, appends it, then opens the new badge's editor.
- Rows are **text rows** (primary name + `device ▸ area` secondary), not rendered
  badges — with drag handle, pencil, trash.
- It does **not** open the per-badge form itself. It emits `edit-heading-badge`;
  the *parent* translates that into an `edit-sub-element` event
  (`type: "heading-badge"`), and the dashboard's editing dialog stack mounts the
  individual form.

Reuse recipe (requires a warm-up, because it's the heading **editor** import that
registers the component — loading the card alone is not enough):

```ts
const helpers = await window.loadCardHelpers();
helpers.createCardElement({ type: "heading" });
await customElements.whenDefined("hui-heading-card");
await (customElements.get("hui-heading-card") as any).getConfigElement();
await customElements.whenDefined("hui-heading-badges-editor");

const list = document.createElement("hui-heading-badges-editor") as any;
list.hass = this._hass;
list.badges = this._config.badges ?? [];

list.addEventListener("heading-badges-changed", (e: any) =>
  this._commit({ ...this._config, badges: e.detail.badges }),
);

list.addEventListener("edit-heading-badge", (e: any) => {
  const index = e.detail.index;
  this.dispatchEvent(new CustomEvent("edit-sub-element", {
    detail: {
      config: this._config.badges[index],
      saveConfig: (cfg: any) => this._updateBadge(index, cfg),
      type: "heading-badge",
    },
    bubbles: true, composed: true,
  }));
});
```

⚠️ **Unverified:** whether re-emitting `edit-sub-element` from our own
`getConfigElement` is picked up by the same dialog stack that handles it for
heading cards. Highly likely (our editor runs inside that stack) but must be
tested.

⚠️ **Locked to heading badges**: types `entity` and `button` only, rendered by
the heading-badge factory (small, background-less badges). This is neither
view-badges nor picture-elements elements.

**Clean alternative if we want our own item types:** the file is short and
self-contained — **clone the assembly pattern** (`ha-sortable` with
`handle-selector`, `repeat` over items, pencil/trash as `ha-icon-button`, add
dropdown) rather than depend on the internal component name. We now have the
authentic template for this.

### 4.5 Badges vs picture-elements vocabulary — the core trade-off

This tension ran through the whole conversation and is **still open**:

| | Stay on `elements[]` (picture-elements vocabulary) | Move to badges |
|---|---|---|
| Item rendering | `createHuiElement`, incl. `state-badge` (badge look, native) | `createBadgeElement`, pill look |
| Per-item form | native, via wrapped editor or own `ha-form` | native `getConfigElement` per badge |
| List + add/remove | **free** if wrapping the native editor | must be built (or `object` selector, or clone §4.4) |
| Position in config | **yes** — `style.top/left` lives in the item | **no** — badges have no position concept |
| Schema | standard picture-elements, "graduating" to a pure built-in card = one line | our own, e.g. `{ image, items: [{ badge: {...}, style: { top, left } }] }` |

Key insight noted: **badges give the content/position separation for free**,
structurally — there is no `style` field to strip, because badge configs have no
position. The native form edits pure content; our layer owns position in our
own wrapper.

Counter-insight: `state-badge` as a picture-elements element type already gives
the badge *look* while staying inside the vocabulary — if only the look matters,
this is much cheaper.

**Recommendation for the agent:** ask before choosing. This is a product
decision, not a technical one.

---

## 5. Verified HA internals (with citations to how they were verified)

### 5.1 Grabbing a built-in card's editor without hardcoding tags
```ts
const helpers = await window.loadCardHelpers();
helpers.createCardElement({ type: "picture-elements", elements: [] }); // forces class load
await customElements.whenDefined("hui-picture-elements-card");
const Ctor = customElements.get("hui-picture-elements-card") as any;
const nativeEditor = await Ctor.getConfigElement();
```
Same pattern works for badges via `createBadgeElement` + `hui-entity-badge`.

### 5.2 Preview detection
HA sets a boolean `preview` property on the card element. Declare it
(`@property({ type: Boolean }) preview = false` in Lit, or a plain setter). The
parent `<hui-card>` also carries a `preview` attribute, but the property is the
supported channel. **Caveat:** true in both edit dialog and card picker gallery
— see §3.1 for the discrimination.

### 5.3 Preview instance reuse
As long as the card `type` doesn't change (always `custom:...` here), HA does
**not** recreate the preview element — it calls `setConfig` on the same instance.
Drag-layer state survives config updates. `setConfig` must be idempotent.

### 5.4 `loadCardHelpers()` exposes
`createCardElement`, `createBadgeElement`, `createHuiElement`. **Never editors.**

### 5.5 Timing
After `setConfig`, await `updateComplete` on any Lit element before querying its
rendered children — rendering is async.

---

## 6. Skeleton code (agreed, config-circulation only)

The drag layer is deliberately a bare `<div>` stub. This skeleton reflects the
**wrap-the-native-card** variant (§4.1 option A); per §4.1 the decision moved to
option B, so `_ensureInner` / `_renderHandles` should be swapped for an own
container + `hui-image` + `createHuiElement`. **Everything else — broker,
channel, editor hub, round-trip — is unchanged by that swap.**

```ts
/**
 * Visual Picture Elements — config circulation skeleton.
 * preview → editor : module-level broker channel.
 * editor → preview : via HA (config-changed → setConfig).
 */

interface PEElement {
  type: string;
  style?: Record<string, string>;
  [k: string]: unknown;
}

interface PEConfig {
  type?: string;
  image?: string;
  elements: PEElement[];
  [k: string]: unknown;
}

type HaCardElement = HTMLElement & {
  hass?: unknown;
  setConfig(config: PEConfig): void;
  getCardSize?(): number | Promise<number>;
};
type HaEditorElement = HTMLElement & {
  hass?: unknown;
  lovelace?: unknown;
  setConfig(config: PEConfig): void;
};

declare global {
  interface Window {
    loadCardHelpers(): Promise<{
      createCardElement(config: PEConfig): HaCardElement;
    }>;
    customCards?: Array<{ type: string; name: string; preview?: boolean }>;
  }
}

const NATIVE_TYPE = "picture-elements";
const CUSTOM_TYPE = "custom:visual-picture-elements";

const asNative = (c: PEConfig): PEConfig => ({ ...c, type: NATIVE_TYPE });
const asCustom = (c: PEConfig): PEConfig => ({ ...c, type: CUSTOM_TYPE });

// ── BROKER ───────────────────────────────────────────────────────────────────

interface EditorChannel {
  patchElement(index: number, styleDelta: Record<string, string>): void;
}

const editors = new Set<EditorChannel>();

function registerEditor(ch: EditorChannel): () => void {
  editors.add(ch);
  return () => editors.delete(ch);
}

function activeEditor(): EditorChannel | undefined {
  return editors.size === 1 ? [...editors][0] : undefined;
}

// ── EDITOR (hub) ─────────────────────────────────────────────────────────────

class VisualPEEditor extends HTMLElement implements EditorChannel {
  private _config: PEConfig = { elements: [] };
  private _hass?: unknown;
  private _lovelace?: unknown;
  private _native?: HaEditorElement;
  private _unregister?: () => void;
  private _applying = false;

  connectedCallback(): void {
    this._unregister = registerEditor(this);
  }

  disconnectedCallback(): void {
    this._unregister?.();
  }

  async setConfig(config: PEConfig): Promise<void> {
    this._config = config;
    await this._ensureNative();
    this._pushToNative(config);
  }

  set hass(hass: unknown) {
    this._hass = hass;
    if (this._native) this._native.hass = hass;
  }

  set lovelace(lovelace: unknown) {
    this._lovelace = lovelace;
    if (this._native) this._native.lovelace = lovelace;
  }

  patchElement(index: number, styleDelta: Record<string, string>): void {
    const elements = this._config.elements.map((el, i) =>
      i === index ? { ...el, style: { ...el.style, ...styleDelta } } : el,
    );
    this._commit({ ...this._config, elements });
  }

  private async _ensureNative(): Promise<void> {
    if (this._native) return;

    const helpers = await window.loadCardHelpers();
    helpers.createCardElement({ type: NATIVE_TYPE, elements: [] });
    await customElements.whenDefined("hui-picture-elements-card");

    const Ctor = customElements.get("hui-picture-elements-card") as unknown as {
      getConfigElement(): Promise<HaEditorElement>;
    };
    this._native = await Ctor.getConfigElement();
    if (this._hass) this._native.hass = this._hass;
    if (this._lovelace) this._native.lovelace = this._lovelace;

    this._native.addEventListener("config-changed", this._onNativeChange);
    this.append(this._native);
  }

  private _onNativeChange = (ev: Event): void => {
    if (this._applying) return;
    ev.stopPropagation();
    const next = (ev as CustomEvent<{ config: PEConfig }>).detail.config;
    this._config = next;
    this._reemit(next);
  };

  private _pushToNative(config: PEConfig): void {
    this._applying = true;
    this._native!.setConfig(asNative(config));
    this._applying = false;
  }

  /** Convergence point: drag AND native form both end up here. */
  private _commit(next: PEConfig): void {
    this._config = next;
    this._pushToNative(next);
    this._reemit(next);
  }

  /** Sole exit toward HA. */
  private _reemit(config: PEConfig): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: asCustom(config) },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

// ── CARD ─────────────────────────────────────────────────────────────────────

class VisualPECard extends HTMLElement {
  private _config: PEConfig = { elements: [] };
  private _hass?: unknown;
  private _inner?: HaCardElement;
  private _overlay?: HTMLElement;
  private _preview = false;

  static getConfigElement(): HTMLElement {
    return document.createElement("visual-picture-elements-editor");
  }

  static getStubConfig(): PEConfig {
    return { image: "", elements: [] };
  }

  connectedCallback(): void {
    this.style.position = "relative";
  }

  async setConfig(config: PEConfig): Promise<void> {
    this._config = config;
    await this._ensureInner();
    this._inner!.setConfig(asNative(config));
    this._syncOverlay();
  }

  set hass(hass: unknown) {
    this._hass = hass;
    if (this._inner) this._inner.hass = hass;
  }

  set preview(value: boolean) {
    this._preview = value;
    this._syncOverlay();
  }

  async getCardSize(): Promise<number> {
    return (await this._inner?.getCardSize?.()) ?? 5;
  }

  private async _ensureInner(): Promise<void> {
    if (this._inner) return;
    const helpers = await window.loadCardHelpers();
    this._inner = helpers.createCardElement(asNative(this._config));
    if (this._hass) this._inner.hass = this._hass;
    this.append(this._inner);
  }

  private _syncOverlay(): void {
    const editor = activeEditor();
    const shouldEdit = this._preview && !!editor;

    if (shouldEdit && !this._overlay) {
      this._overlay = this._buildOverlay(editor!);
      this.append(this._overlay);
    } else if (!shouldEdit && this._overlay) {
      this._overlay.remove();
      this._overlay = undefined;
    }
    if (this._overlay) this._renderHandles(this._overlay);
  }

  private _buildOverlay(editor: EditorChannel): HTMLElement {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "absolute",
      inset: "0",
      zIndex: "1",
    });

    // STUB: real pointerdown/move/up drag goes here.
    // Only pointerup matters for circulation.
    div.addEventListener("pointerup", (e) => {
      const rect = div.getBoundingClientRect();
      const left = ((e.clientX - rect.left) / rect.width) * 100;
      const top = ((e.clientY - rect.top) / rect.height) * 100;
      const index = 0; // selected element — handled by real drag logic

      // ⇦ THE single preview → editor hop.
      editor.patchElement(index, {
        left: `${left.toFixed(2)}%`,
        top: `${top.toFixed(2)}%`,
        transform: "translate(-50%, -50%)",
      });
    });

    return div;
  }

  private _renderHandles(_overlay: HTMLElement): void {
    // Reads this._config.elements[].style.{top,left} → positions handles.
    // Refreshed on every setConfig, so always reflects current config.
  }
}

// ── Registration ─────────────────────────────────────────────────────────────

if (!customElements.get("visual-picture-elements")) {
  customElements.define("visual-picture-elements", VisualPECard);
}
if (!customElements.get("visual-picture-elements-editor")) {
  customElements.define("visual-picture-elements-editor", VisualPEEditor);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: "visual-picture-elements",
  name: "Visual Picture Elements",
  preview: true,
});

export {};
```

**Design note on the config shape:** the wrapper's config **is** a
picture-elements config with `type: custom:visual-picture-elements`. Internally
the type is swapped back before `createCardElement`. Consequence: "graduating" to
a pure built-in card is a one-line change, and the config stays readable/portable.

---

## 7. Pitfalls to carry into implementation

- **Drag surface must match the image's exact aspect ratio.** Otherwise
  percentages drift relative to the real card.
- **Real elements have their own click handlers** (toggle a light, more-info)
  that fight with drag. Either put the drag layer above them with
  `pointer-events` discipline, or use lightweight proxies. Do not assume it
  resolves itself.
- **Preserve existing transforms.** If an element already has `rotate()` or
  `scale()`, recompose around `translate(-50%, -50%)` — read from **config**, not
  computed style. Do not overwrite.
- **Round to `.toFixed(2)`** to keep YAML clean. Consider optional grid snapping:
  `Math.round(v / step) * step`.
- **Clamp to 0–100** during drag.
- **`setPointerCapture`** on pointerdown so the drag survives the cursor leaving
  the surface.
- **Never mutate the config received via `setConfig`** — always clone.
- **⚠️ Verify HA passes `lovelace` to the wrapper editor**, and whether the
  native editor requires it (some versions depend on it for entity resolution).
  If the native form misbehaves, check this first.

---

## 8. Open decisions for the agent to raise with the user

1. **Badges vs `elements[]` vocabulary** (§4.5) — product decision, drives the
   whole schema.
2. **Wrap the native picture-elements editor, or own `ha-form` schema** (§4.3).
   The conversation leaned strongly toward own-schema, but wrapping was never
   formally killed and remains the cheapest path if fidelity matters more than
   control.
3. **Fork `shocklateboy92/custom-picture-elements-card` or start fresh** — never
   resolved. The user was going to evaluate it.
4. **Reuse `hui-heading-badges-editor` or clone its pattern** (§4.4).

---

## 9. Verification tasks before writing production code

Run these against the **target HA version** — several conclusions are version-sensitive.

1. Confirm `hui-image`'s exact camelCase property names in devtools.
2. Confirm `object` selector + `fields` + `multiple` is present and complete;
   render an `ha-form` with that schema and inspect.
3. Confirm whether the `object` selector preserves keys absent from `fields` on
   round-trip (only matters if hiding `top`/`left`).
4. Confirm `edit-sub-element` re-emitted from our own `getConfigElement` is
   caught by the dashboard's dialog stack.
5. Confirm HA passes `lovelace` to our wrapper editor.
6. Confirm `preview` is set on the card in both contexts, and that
   `activeEditor()` really is `undefined` in the card-picker gallery.

---

## 10. References

**Prior art**
- `github.com/shocklateboy92/custom-picture-elements-card` — custom card
  extending picture-elements with a drag-and-drop visual editor, TypeScript,
  HACS-installable. Closest existing match. Last release Sept 2025.
- `github.com/niklaswa/picture-elements-editor` — external React/TS tool: paste
  config, drag, re-export YAML. Useful as a drag-algorithm reference, not
  integrated into HA.
- `github.com/selvalt7/badge-horizontal-container-card` — badge add/move/edit
  editor supporting custom badges. ⚠️ The user checked and its UI appears to be a
  generic element list, **not** a replica of the heading-card badges UI. Useful
  for wiring patterns only; the user planned to test it directly.
- The "visual editor support for Picture Element Card" request on the frontend
  repo dates back to core-2021.9 era and nothing has landed natively. **No
  official solution is coming.**

**HA frontend source (fetched and read during the conversation)**
- `src/panels/lovelace/editor/config-elements/hui-heading-card-editor.ts`
- `src/panels/lovelace/editor/config-elements/hui-heading-badges-editor.ts`
- `src/panels/lovelace/editor/config-elements/hui-picture-entity-card-editor.ts`
  (confirmed `getConfigElement`-only, private schema)
