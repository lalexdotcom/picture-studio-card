import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { activeEditor, registerCard, subscribeEditors } from "../broker";
import {
  BACKGROUND_KEYS,
  EDITOR_TAG,
  hasVisibility,
  ICON_TAG,
  imagePath,
  normalizeConfig,
  type PictureItem,
  type PictureStudioConfig,
  PROBE_TYPE,
  stubConfig,
} from "../config";
import {
  type Anchor,
  type MarkerCorner,
  markerCorner,
  type Position,
  positionStyle,
  reanchor,
} from "../position";
import type {
  BadgeConfig,
  HomeAssistant,
  LovelaceBadgeElement,
  LovelaceElementElement,
  LovelaceGridOptions,
} from "../types";
import { createDragController } from "./drag-layer";

/**
 * The slice of `hui-card` a probe uses. Declared rather than imported: it is
 * Home Assistant's element, and we only ever set these four.
 */
type ProbeElement = HTMLElement & {
  config?: unknown;
  hass?: unknown;
  preview?: boolean;
  load?: () => void;
};

const MARKER_CORNERS: MarkerCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

export class PictureStudioCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    // Derived from `preview` and the broker, never set from outside. Declaring
    // it as a plain property would expose an `editing` attribute that anything
    // could flip.
    editing: { state: true },
    // The badge whose form is open in the editor, mirrored here to mark it.
    selected: { state: true },
    _config: { state: true },
  };

  declare preview: boolean;
  declare editing: boolean;
  declare selected: number | undefined;
  declare _config?: PictureStudioConfig;

  private _hass?: HomeAssistant;
  private _bgElement?: LovelaceElementElement;
  private _elements: LovelaceBadgeElement[] = [];
  private _wrappers: HTMLElement[] = [];
  /** Indexed like _wrappers; a hole where the item carries no conditions. */
  private _probes: (ProbeElement | undefined)[] = [];
  private _renderedTypes: string[] = [];
  /** Released when the card stops editing; see the broker's card registry. */
  private _unregisterCard?: () => void;
  private _unsubscribe?: () => void;

  private _drag = createDragController({
    getIndexedWrapper: (target) => {
      const wrapper = (target as HTMLElement | null)?.closest?.(".item") as HTMLElement | null;
      const index = wrapper?.dataset.index;
      return wrapper && index !== undefined
        ? { element: wrapper, index: Number(index) }
        : undefined;
    },
    getSurface: () => this.renderRoot.querySelector(".layer"),
    getAnchor: (index) => this._config?.items[index]?.anchor ?? "auto",
    onCommit: (index, position) => activeEditor()?.patchPosition(index, position),
    onSelect: (index) => activeEditor()?.select(index),
  });

  constructor() {
    super();
    this.preview = false;
    this.editing = false;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._bgElement) this._bgElement.hass = hass;
    for (const el of this._elements) {
      el.hass = hass;
    }
    for (const probe of this._probes) {
      if (probe) probe.hass = hass;
    }
    // No requestUpdate: render() reads _config.title and editing, never hass.
    // Home Assistant republishes hass on every state change of any entity, so
    // scheduling a cycle here was scheduling one per tick — and the cycle's
    // changedProperties was empty, since requestUpdate() with no argument
    // records nothing.
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  static getStubConfig(): PictureStudioConfig {
    return stubConfig();
  }

  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TAG);
  }

  /** Must be idempotent: Home Assistant reuses the preview instance. */
  setConfig(config: unknown): void {
    this._config = normalizeConfig(config);
  }

  getCardSize(): number {
    return 4;
  }

  /**
   * Without this, the layout tab shows "does not fully support resizing yet":
   * hui-card returns {} for a card that declares neither getGridOptions nor the
   * deprecated getLayoutOptions, and the editor warns on an empty object.
   *
   * `rows: "auto"` is the only defensible height here — a number would add the
   * grid's `fit-rows` class, pinning the card to `rows × 64 - 8` px while the image
   * keeps its own aspect ratio. The drag surface is `.layer`, stretched over the
   * background element in normal flow; it stays glued to the image only as long as
   * nothing forces the card's height. Same reasoning as hui-entities-card, whose
   * height is likewise content-driven; hui-iframe-card pins rows because an iframe
   * has no intrinsic height.
   *
   * These are defaults only: `grid_options` in the card config is merged on top.
   */
  getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: "auto", min_columns: 3 };
  }

  /**
   * Editing means: shown as a preview AND an editor is mounted. `preview` alone
   * is also true in the card-picker gallery, where no editor exists — so the
   * broker discriminates the two with no extra signal.
   */
  private _syncEditing(): void {
    const editor = activeEditor();
    const editing = this.preview && editor !== undefined && this._inEditPreview();
    // The selection lives in the editor and never reaches the config, so it is
    // read from the channel rather than round-tripped through Home Assistant.
    const selected = editing ? editor?.selectedIndex() : undefined;
    if (selected !== this.selected) this.selected = selected;
    if (editing === this.editing) return;
    this.editing = editing;
  }

  /**
   * True when this card is the edit dialog's own preview.
   *
   * `preview` on our own element does not mean that. Home Assistant sets it on
   * every card of a dashboard in edit mode, so that a click edits the card
   * instead of firing its actions. Reading it as "I am the dialog" armed the
   * drag on every picture-studio card behind the dialog, and left the editor
   * with two candidate previews and no way to tell them apart.
   *
   * The reliable difference is the **edit chrome a dashboard wraps its cards
   * in**, and which the dialog's preview has above it: `hui-card-options` in a
   * masonry view, `hui-card-edit-mode` in a section. Neither exists around the
   * preview the dialog renders.
   *
   * Do not replace this with a test on the `preview` attribute. It looks
   * cleaner — the dialog writes `<hui-card preview>` literally while a
   * dashboard assigns the property — but it only works in a masonry view, and
   * silently not in sections: `hui-section` is the one component in the
   * frontend that declares `preview` with `reflect: true`, so the attribute is
   * written there whoever set it. Verified on 2026.8.1, and observed failing.
   *
   * The walk hops shadow boundaries, since `closest` stops at each one.
   */
  private _inEditPreview(): boolean {
    let current: Element | null = this;
    while (current) {
      if (current.closest("hui-card-options, hui-card-edit-mode")) return false;
      const root = current.getRootNode();
      current = root instanceof ShadowRoot ? root.host : null;
    }
    return true;
  }

  /**
   * Reconcile the drag layer with the current editing state.
   *
   * Called from two places on purpose. `updated()` covers our own render cycle;
   * the broker subscription covers the editor mounting or unmounting, which
   * happens outside it. Before the subscription existed, a card only re-derived
   * this when it happened to render for some other reason — so the dialog could
   * open with the drag unarmed, or close leaving it armed.
   */
  private _syncEditingAndDrag(): void {
    this._syncEditing();
    // renderRoot does not exist before the first update; _syncEditing has
    // already flipped the reactive flag, so updated() will attach on the render
    // it schedules.
    // Listeners go on .root, not on .layer: the layer is pointer-events: none,
    // so a press on the image never reaches it — only the badges' own events
    // bubble through. Listening one level up catches both, which is what lets a
    // press on the image clear the selection. The geometry still comes from
    // .layer, through getSurface.
    const root = this.hasUpdated ? this.renderRoot.querySelector(".root") : null;
    if (this.editing && root instanceof HTMLElement) {
      this._drag.attach(root);
    } else {
      this._drag.detach();
    }

    // Registered on the same condition the drag is armed on, so the editor only
    // ever finds the preview it is driving — a dashboard's own cards never edit.
    if (this.editing) {
      this._unregisterCard ??= registerCard(this);
    } else {
      this._unregisterCard?.();
      this._unregisterCard = undefined;
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribeEditors(() => this._syncEditingAndDrag());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._unregisterCard?.();
    this._unregisterCard = undefined;
    this._drag.detach();
  }

  protected updated(changed: PropertyValues): void {
    const configChanged = changed.has("_config");

    // preview is in the gate because editing DERIVES from it: _syncEditingAndDrag
    // is what sets editing, so waiting for editing to change would mean it never
    // does. _config is in it because .root — which the drag attaches to — only
    // exists once _config does.
    if (configChanged || changed.has("preview") || changed.has("editing")) {
      this._syncEditingAndDrag();
    }

    if (changed.has("preview")) {
      for (const probe of this._probes) {
        if (probe) probe.preview = this.preview;
      }
    }

    if (configChanged) {
      void this._syncBackground();
      // _syncItems ends with _applyPositions, so it is not called again here.
      void this._syncItems();
    } else if (changed.has("editing") || changed.has("selected")) {
      this._applyPositions(this._config?.items ?? []);
    }
  }

  private get _layer(): HTMLElement | null {
    return this.renderRoot.querySelector(".layer");
  }

  /** Build the config object forwarded to the hui-image-element. */
  private _bgConfig(config: PictureStudioConfig): Record<string, unknown> {
    // Both actions must be pinned to "none": hui-image-element.setConfig defaults a
    // missing one to more-info, which makes the background clickable and makes
    // computeTooltip invent a "Tap to show more info" hover tooltip. The
    // picture-elements background carries no action at all.
    const out: Record<string, unknown> = {
      type: "image",
      tap_action: { action: "none" },
      hold_action: { action: "none" },
    };
    for (const key of BACKGROUND_KEYS) {
      const value = config[key];
      if (value !== undefined) out[key] = value;
    }
    // hui-image-element unwraps a media selector value for `image` only; it hands
    // `dark_mode_image` to hui-image untouched, where an object is not a path.
    // Unwrap both here so the two behave alike.
    if (config.image !== undefined) out.image = imagePath(config.image);
    if (config.dark_mode_image !== undefined) {
      out.dark_mode_image = imagePath(config.dark_mode_image);
    }
    return out;
  }

  /**
   * Create the background hui-image-element once and reuse it thereafter.
   * Recreating on every update would restart camera streams and lose image state.
   */
  private async _syncBackground(): Promise<void> {
    const root = this.renderRoot.querySelector(".root");
    if (!root) return;

    if (!this._bgElement) {
      const config = this._config;
      if (!config) return;
      const bgConfig = this._bgConfig(config);
      const helpers = await window.loadCardHelpers();
      // Double-check: a concurrent call may have created the element while
      // we awaited. If so, fall through to the setConfig call below.
      if (!this._bgElement) {
        const el = helpers.createHuiElement(bgConfig);
        el.className = "background";
        this._bgElement = el;
        root.insertBefore(el, root.querySelector(".layer"));
      }
    }

    // Always sync the latest config — _config may have changed since this
    // call was scheduled or during the loadCardHelpers await.
    const config = this._config;
    if (config) this._bgElement.setConfig(this._bgConfig(config));
    if (this._hass) this._bgElement.hass = this._hass;
  }

  /**
   * Rebuild children only when the list of badge types changed; otherwise push
   * the new config into the instances in place. This is what lets an in-flight
   * drag survive a config round-trip.
   */
  private async _syncItems(): Promise<void> {
    const layer = this._layer;
    const items = this._config?.items ?? [];
    if (!layer) return;

    // The family, the kind, and whether the item carries conditions. The last
    // one belongs here because a probe is a sibling in the layer: it appearing
    // or disappearing changes the DOM we build, not just the config we push.
    const types = items.map(
      (item) => `${item.type}:${String(item.config.type ?? "")}:${hasVisibility(item) ? "v" : ""}`,
    );
    const sameShape =
      types.length === this._renderedTypes.length &&
      types.every((t, i) => t === this._renderedTypes[i]);

    if (!sameShape) {
      const helpers = await window.loadCardHelpers();
      layer.replaceChildren();
      this._elements = [];
      this._wrappers = [];
      this._probes = [];

      items.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = `item ${item.type}`;
        wrapper.dataset.index = String(index);

        // The only branch the second family costs: our element answers setConfig
        // and hass exactly like a badge element, so every other path is shared.
        const child = this._createChild(item, helpers);
        if (this._hass) child.hass = this._hass;
        wrapper.append(child as unknown as HTMLElement);

        const probe = this._createProbe(item);
        if (probe) layer.append(probe);
        layer.append(wrapper);

        this._elements.push(child);
        this._wrappers.push(wrapper);
        this._probes.push(probe);
      });
      this._renderedTypes = types;
    } else {
      items.forEach((item, index) => {
        const child = this._elements[index];
        if (!child) return;
        child.setConfig(item.config as unknown as BadgeConfig);
        if (this._hass) child.hass = this._hass;

        const probe = this._probes[index];
        // A new object each time is correct here: this branch only runs on a
        // config change, never on the hass path.
        if (probe) probe.config = { type: PROBE_TYPE, visibility: item.visibility };
      });
    }

    this._applyPositions(items);
  }

  private _createChild(
    item: PictureItem,
    helpers: Awaited<ReturnType<typeof window.loadCardHelpers>>,
  ): LovelaceBadgeElement {
    if (item.type === "badge") return helpers.createBadgeElement(item.config);
    const el = document.createElement(ICON_TAG) as unknown as LovelaceBadgeElement;
    el.setConfig(item.config as unknown as BadgeConfig);
    return el;
  }

  /**
   * A `hui-card` carrying nothing but the item's conditions and a phantom card.
   * It is Home Assistant's own implementation of `visibility`, so the
   * evaluation, the media-query listeners and the `time` timers are theirs. The
   * verdict lands on the probe as the native `hidden` attribute, and the
   * stylesheet's sibling rule reflects it onto the item — no JavaScript of ours
   * in that path.
   *
   * `preview` follows the card's own, not `editing`: it is true both in the edit
   * dialog and on a dashboard in edit mode, which is exactly when Home Assistant
   * keeps its own hidden cards on screen.
   *
   * None at all while editing. The editor's marker says "has conditions", not
   * "is hidden", so no verdict is needed there — and that is where the drag
   * layer is already the heaviest.
   */
  private _createProbe(item: PictureItem): ProbeElement | undefined {
    if (this.editing || !hasVisibility(item)) return undefined;
    const probe = document.createElement("hui-card") as ProbeElement;
    probe.className = "probe";
    probe.config = { type: PROBE_TYPE, visibility: item.visibility };
    probe.preview = this.preview;
    if (this._hass) probe.hass = this._hass;
    // Optional call: in the test environment hui-card is not defined, and an
    // unknown element has no load(). The probe is then inert, which is what the
    // suite asserts against — the real behaviour is a browser question.
    probe.load?.();
    return probe;
  }

  private _applyPositions(items: PictureItem[]): void {
    const dragging = this._drag.draggingIndex();
    items.forEach((item, index) => {
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      // The selection mark is a class rather than a Lit binding because the
      // wrappers are built imperatively, and it is set outside the drag guard
      // below: the badge being dragged is precisely the selected one.
      wrapper.classList.toggle("selected", this.editing && index === this.selected);
      // "This item carries conditions", not "it is hidden right now": there is
      // no probe in the editor, so there is no verdict to read — and a static
      // mark is the better affordance anyway, since it does not flicker with
      // entity state. The live verdict lives in the form's own banner.
      const conditional = this.editing && hasVisibility(item);
      wrapper.classList.toggle("conditional", conditional);
      const corner = conditional ? markerCorner(item.position) : undefined;
      for (const c of MARKER_CORNERS) wrapper.classList.toggle(`marker-${c}`, c === corner);
      if (conditional) {
        wrapper.dataset.conditions = String(item.visibility?.length ?? 0);
      } else {
        delete wrapper.dataset.conditions;
      }
      // Leave the badge under the cursor alone: its styles are live pixels
      // managed by the drag controller. Writing the stored config position over
      // them would jump the badge back toward its pre-drag location on every
      // hass tick. Once the drag ends, onPointerUp restores the derived style
      // and the next _applyPositions then matches it exactly — no flash.
      if (index === dragging) return;

      const style = positionStyle(item.position, item.anchor);
      wrapper.style.top = style.top;
      wrapper.style.left = style.left;
      wrapper.style.transform = style.transform;
    });
  }

  /**
   * The item's coordinates re-expressed under its new anchor, or undefined if
   * there is nothing to do. Returning the position instead of only committing
   * it lets the caller render it on this same pass, so the item never shows at
   * the pre-recomputation place for a frame.
   *
   * Guarded on the position being unchanged as well: the diff is indexed, and
   * _syncBadges keeps the wrappers when only the order changed between badges
   * of the same type, so a reorder would otherwise look like an anchor change
   * and recompute from the wrong anchor. An anchor flip never moves the
   * coordinates; a reorder always brings the other item's along.
   */
  /**
   * CardChannel. The editor asks this before it writes the new anchor, because
   * afterwards there is no "before" left to measure: Home Assistant rebuilds the
   * card element on every config change, so this instance — and everything it
   * could have remembered — is gone by the time the new anchor comes back down.
   */
  reanchor(index: number, anchor: Anchor): Position | undefined {
    const item = this._config?.items[index];
    const wrapper = this._wrappers[index];
    const layer = this._layer;
    if (!item || !wrapper || !layer || item.anchor === anchor) return undefined;

    return reanchor(
      item.position,
      item.anchor,
      anchor,
      layer.getBoundingClientRect(),
      wrapper.getBoundingClientRect(),
    );
  }

  protected render() {
    if (!this._config) return nothing;

    return html`
      <ha-card .header=${this._config.title}>
        <div class="root ${this.editing ? "editing" : ""}">
          <div class="layer"></div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    /* hui-card is height: 100%, so a card that does not claim that height renders
       at its natural size and spills out of the cell. With a fixed row count in
       grid_options the cell is shorter than the image, and without these rules the
       image is drawn over whatever sits below.
       The vertical overflow scrolls rather than being clipped, so the bottom of the
       image — and any badge on it — stays reachable. Horizontally there is nothing
       to reach: positions are clamped to the image width, and a scrollbar there
       would only come from the card's own rounding. */
    :host {
      display: block;
      height: 100%;
    }
    ha-card {
      height: 100%;
      overflow-x: hidden;
      overflow-y: auto;
    }
    /* .root holds only the background element in normal flow, so the drag
       surface matches the image's aspect ratio exactly.
       It is also the size container: an element's clamp is written in cqw, i.e.
       a percentage of THIS box. Without this declaration cqw silently falls back
       to the viewport, which is the very bug the element exists to fix. */
    .root {
      position: relative;
      container-type: inline-size;
    }
    .background {
      display: block;
      width: 100%;
    }
    /* While editing, pointer events must not reach the background — otherwise a
       click on the image during badge positioning would fire tap_action. */
    .editing .background {
      pointer-events: none;
    }
    /* The layer is transparent to pointers; only the wrappers catch them, so
       the image stays clickable between badges. */
    .layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    /* The probe is a hui-card carrying the item's conditions. It stays in the
       DOM — the Lit context a view_columns condition consumes resolves through
       it, and display: none is not detachment — and never draws.
       The important beats the inline display hui-card drives on itself, without
       touching the hidden attribute, which is the signal. */
    .probe {
      display: none !important;
    }
    .probe[hidden] + .item {
      display: none;
    }
    /* max-content, not shrink-to-fit: an absolutely positioned box with a left
       and no right is sized against the space remaining to its right, which is
       zero at left:100% — the badge would collapse to its minimum width and
       wrap its text. The transform runs after layout, so it cannot give the
       space back. Sizing to the content also keeps the width constant while
       dragging, which the drag clamp relies on: it measures the badge once at
       pointerdown and bounds the gesture to [0, W - w]. */
    .item {
      position: absolute;
      width: max-content;
      pointer-events: auto;
    }
    /* While editing, the wrapper keeps the pointer and the badge never sees a
       click, so tapping a badge cannot toggle a light. */
    .editing .item {
      /* Pointer, not grab: clicking opens the badge's form, which is the more
         discoverable of the two gestures. Grab belongs to the gesture itself. */
      cursor: pointer;
      touch-action: none;
      /* The rings follow this radius; badges are pills, so match them. */
      border-radius: var(--ha-badge-border-radius, 999px);
    }
    /* Elements (state-icon) have a square shape; the pill radius is wrong for
       them. Badges keep the default pill via the rule above. */
    .editing .item.element {
      border-radius: 4px;
    }
    .editing .item.dragging {
      cursor: grabbing;
    }
    /* Two independent channels, so a badge can carry both marks at once and stay
       readable — hovering the selected badge is not a no-op. The weights follow
       the meanings: a soft halo for "under the pointer", which is transient and
       needs no emphasis, and a hard ring for "this is the one whose form is
       open", which is a state the eye should find without hunting.
       The ring is an outline, not a box-shadow, because outline-offset leaves a
       real gap the image shows through; a ring flush against the badge reads as
       part of it.
       The dragging class repeats the ring for the length of the gesture: the
       selection arrives through a re-render, and pointer capture plus the config
       round trip can each cost a frame. No transition anywhere, for the same
       reason — a re-entry would fade in from zero and turn a one-frame gap into
       a visible flash. */
    .editing .item:hover {
      box-shadow: 0 0 0 4px rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
    }
    .editing .item.selected,
    .editing .item.dragging {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }
    /* The item being edited comes to the front. This is the one exception to
       "no z-index": it is an editor affordance, it never reaches the config,
       and it does not exist on a dashboard — the rendered stacking still has a
       single authority, the list order. .dragging is there in its own right:
       the selection arrives through a re-render, which pointer capture can
       precede by a frame. */
    .editing .item.selected,
    .editing .item.dragging {
      z-index: 1;
    }
    /* "This item carries conditions". Out of flow, so it adds nothing to the
       wrapper's max-content width: the halo, the ring and the radius keep
       tracing the item alone, and getBoundingClientRect — which the drag clamp
       measures — returns the same box it did before.
       Its own pointer-events, because \`.editing .item > *\` matches real
       children and not a pseudo-element. */
    .editing .item.conditional::after {
      content: attr(data-conditions);
      position: absolute;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-md, 8px);
      background: var(--secondary-background-color, #e0e0e0);
      color: var(--primary-text-color, #212121);
      font-size: 11px;
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: 16px;
      text-align: center;
      pointer-events: none;
    }
    .editing .item.marker-top-right::after {
      top: -8px;
      right: -8px;
    }
    .editing .item.marker-top-left::after {
      top: -8px;
      left: -8px;
    }
    .editing .item.marker-bottom-right::after {
      bottom: -8px;
      right: -8px;
    }
    .editing .item.marker-bottom-left::after {
      bottom: -8px;
      left: -8px;
    }
    .editing .item > * {
      pointer-events: none;
    }
  `;
}
