import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { activeEditor, registerCard, subscribeEditors } from "../broker";
import {
  BACKGROUND_KEYS,
  EDITOR_TAG,
  hasHeading,
  hasVisibility,
  ICON_TAG,
  IMAGE_TAG,
  imagePath,
  isSupportedBadgeType,
  LABEL_TAG,
  normalizeConfig,
  type PictureItem,
  type PictureStudioConfig,
  PROBE_TYPE,
  stubConfig,
} from "../config";
import { effectiveBox, imageBoxStyle } from "../image-box";
import "./card-heading";
import "./toolbar";
import { isResizableKind } from "../element-kinds";
import {
  type Anchor,
  DEFAULT_POSITION,
  type MarkerCorner,
  markerCorner,
  type Position,
  positionStyle,
  reanchor,
} from "../position";
import type { Corner } from "../resize-box";
import type {
  BadgeConfig,
  HomeAssistant,
  LovelaceBadgeElement,
  LovelaceElementElement,
  LovelaceGridOptions,
} from "../types";
import { createDragController } from "./drag-layer";
import { createResizeController, type ResizeHit } from "./resize-layer";

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

/** The four corners a handle sits on, in DOM order. */
const HANDLE_CORNERS: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/** Home Assistant's own error badge, the one its detail dialog dumps origConfig from. */
const ERROR_BADGE_TAG = "hui-error-badge";

/**
 * A badge type Home Assistant cannot build, used to make its factory fail on
 * purpose. See `_createChild`.
 *
 * Spelled out rather than made unprintable: the failure is logged by Home
 * Assistant as `console.error(kind, config.type, err)`, so an error line in the
 * user's console names whoever caused it instead of appearing to be a fault in
 * their own configuration.
 */
const PRIMING_TYPE = "picture-studio-priming";

/**
 * The height the editor's preview last occupied, kept across the rebuild that
 * every commit triggers.
 *
 * Home Assistant destroys the card element and creates another one on each
 * config change. The newcomer has no height until its picture has laid out, so
 * for one frame the dialog's scroll container loses ~240px — measured on an
 * iPhone: 1100 → 862 → 1087 — and the browser clamps the scroll position to fit
 * what is left. Reserving the outgoing height means nothing collapses and there
 * is nothing to clamp.
 *
 * A single value rather than a map: exactly one preview exists at a time, which
 * is what `activeCard()` already relies on.
 */
let lastPreviewHeight = 0;

/** Frames the reservation survives — long enough to cover the layout, short
 * enough that a genuinely different height is not pinned for anything a reader
 * would notice. */
const RESERVE_FRAMES = 3;

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
    // hui-card assigns this from the view's layout: isPanel = layout === "panel".
    // Only CSS reads it, hence reflected — and under the name Home Assistant's
    // own container cards already use, ispanel. See the :host([ispanel]) rule.
    isPanel: { type: Boolean, reflect: true },
    _config: { state: true },
  };

  declare preview: boolean;
  declare isPanel: boolean;
  declare editing: boolean;
  declare selected: number | undefined;
  declare _config?: PictureStudioConfig;

  private _hass?: HomeAssistant;
  private _bgElement?: LovelaceElementElement;
  /** Indexed like `items`; a hole where the item is unreadable. */
  private _elements: (LovelaceBadgeElement | undefined)[] = [];
  /** Indexed like `items`; a hole where the item is unreadable. */
  private _wrappers: (HTMLElement | undefined)[] = [];
  /** Indexed like _wrappers; a hole where the item carries no conditions. */
  private _probes: (ProbeElement | undefined)[] = [];
  private _renderedTypes: string[] = [];
  /** One subscription is enough, however many items are waiting on the class. */
  private _awaitingErrorBadge = false;
  /** Released when the card stops editing; see the broker's card registry. */
  private _unregisterCard?: () => void;
  private _unsubscribe?: () => void;

  private _drag = createDragController({
    isHandle: (target) => this._hitHandle(target) !== undefined,
    getIndexedWrapper: (target) => {
      const wrapper = (target as HTMLElement | null)?.closest?.(".item") as HTMLElement | null;
      const index = wrapper?.dataset.index;
      return wrapper && index !== undefined
        ? { element: wrapper, index: Number(index) }
        : undefined;
    },
    getSurface: () => this.renderRoot.querySelector(".layer"),
    getAnchor: (index) => {
      const item = this._config?.items[index];
      if (!item || item.type === "unknown") return "auto";
      return item.anchor ?? "auto";
    },
    onCommit: (index, position) => activeEditor()?.patchPosition(index, position),
    // The marker has to keep pointing inward for the whole gesture: it hangs
    // off the wrapper, and ha-card scrolls vertically, so a corner left on the
    // trailing side raises a scrollbar under the pointer mid-drag.
    onMove: (index, position) => {
      const wrapper = this._wrappers[index];
      if (wrapper?.classList.contains("conditional")) {
        this._applyMarkerCorner(wrapper, position);
      }
    },
    onSelect: (index) => activeEditor()?.select(index, "picture"),
  });

  private _resize = createResizeController({
    getHandle: (target) => this._hitHandle(target),
    getSurface: () => this.renderRoot.querySelector(".layer"),
    getAnchor: (index) => {
      const item = this._config?.items[index];
      if (!item || item.type === "unknown") return "auto";
      return item.anchor ?? "auto";
    },
    getPosition: (index) => {
      const item = this._config?.items[index];
      return item && item.type !== "unknown" ? item.position : { ...DEFAULT_POSITION };
    },
    getConfig: (index) => {
      const item = this._config?.items[index];
      if (!item || item.type !== "element" || item.config.type !== "image") return undefined;
      return item.config;
    },
    onCommit: (index, box, position) => activeEditor()?.patchBox(index, box, position),
    onStretch: (index, stretched) => {
      const child = this._elements[index] as (HTMLElement & { stretch?: boolean }) | undefined;
      if (child) child.stretch = stretched;
    },
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
      if (el) el.hass = hass;
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
    // The editor's item list is now the only place an unreadable item is
    // reported. Someone who configures in YAML and never opens the dialog would
    // otherwise never learn — a console line returns part of the diagnostic
    // being given up, without putting anything in front of a viewer.
    this._config.items.forEach((item, index) => {
      if (item.type !== "unknown") return;
      console.warn(
        `picture-studio: items[${index}] ignored (${item.reason}${item.token ? `: ${item.token}` : ""})`,
      );
    });
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
      this._resize.attach(root);
    } else {
      this._drag.detach();
      this._resize.detach();
    }

    // Registered on the same condition the drag is armed on, so the editor only
    // ever finds the preview it is driving — a dashboard's own cards never edit.
    if (this.editing) {
      this._unregisterCard ??= registerCard(this);
    } else {
      this._unregisterCard?.();
      this._unregisterCard = undefined;
    }

    // Elements only. A badge is a third party: inventing a property on it is the
    // same trespass as writing our keys into its config.
    this._config?.items.forEach((item, index) => {
      if (item.type !== "element") return;
      const child = this._elements[index];
      if (child) (child as HTMLElement & { editing?: boolean }).editing = this.editing;
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Only in the edit dialog: an editor is mounted there and nowhere else, and
    // a dashboard card must never be pinned to a height it did not choose.
    if (lastPreviewHeight > 0 && activeEditor() !== undefined) {
      this.style.minHeight = `${lastPreviewHeight}px`;
      let frames = 0;
      const release = (): void => {
        if (++frames < RESERVE_FRAMES) {
          requestAnimationFrame(release);
          return;
        }
        this.style.removeProperty("min-height");
      };
      requestAnimationFrame(release);
    }
    this._unsubscribe = subscribeEditors(() => this._syncEditingAndDrag());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._unregisterCard?.();
    this._unregisterCard = undefined;
    this._drag.detach();
    // Must detach the resize controller explicitly: its pointer listeners live on
    // `.root` (which dies with the shadow root) but `keydown`/`keyup` are
    // registered on `window`, which does not. Home Assistant rebuilds the card
    // element on every config commit, so without this call an edit session
    // accumulates two orphaned window listeners per commit, each holding a
    // reference to a dead element's state.
    this._resize.detach();
  }

  protected updated(changed: PropertyValues): void {
    // Recorded on every render rather than on the way out: by the time
    // disconnectedCallback runs the element is already detached and its
    // offsetHeight is 0 — measured, the reservation was reading zero and doing
    // nothing at all. Registration is the precise signal for "this is the
    // editor's preview": cards register only then.
    //
    // The *outer* height, margins included. `offsetHeight` counts padding and
    // borders but not margins, and reserving that much left the successor short
    // by exactly the missing gap — measured, 26px, which the layout then
    // reclaimed a frame later by pushing everything below back down. That was
    // the remaining flicker.
    if (this._unregisterCard) {
      const box = this.getBoundingClientRect().height;
      if (box > 0) {
        const style = getComputedStyle(this);
        const margins =
          (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
        lastPreviewHeight = Math.ceil(box + margins);
      }
    }

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
      // `preview` is in the gate because the condition marker keys on it: a
      // dashboard entering or leaving edit mode changes nothing else here, and
      // without this the mark would only appear on the next config change.
    } else if (changed.has("editing") || changed.has("selected") || changed.has("preview")) {
      // Marks only: none of these three changes a coordinate, and one of them —
      // the selection, now announced when a drag is released — arrives while the
      // config still holds the pre-drag position. See _applyMarks.
      this._applyMarks(this._config?.items ?? []);
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
    if (!layer) return;

    // The family, the kind, and whether the item carries conditions. The last
    // one belongs here because a probe is a sibling in the layer: it appearing
    // or disappearing changes the DOM we build, not just the config we push.
    const shapesOf = (list: readonly PictureItem[]): string[] =>
      list.map((item) =>
        item.type === "unknown"
          ? `unknown::`
          : `${item.type}:${String(item.config.type ?? "")}:${hasVisibility(item) ? "v" : ""}`,
      );

    let items = this._config?.items ?? [];
    let types = shapesOf(items);
    const sameShape =
      types.length === this._renderedTypes.length &&
      types.every((t, i) => t === this._renderedTypes[i]);

    if (!sameShape) {
      const helpers = await window.loadCardHelpers();
      // Re-read after the await, and re-derive the shapes with it. A drag
      // commit or an anchor change landing while the helpers chunk loaded has
      // already written a newer config; rebuilding from the snapshot taken
      // before the await would put the pre-change items back on screen until
      // Home Assistant's next setConfig, flashing — and losing a just-dropped
      // position for that frame.
      items = this._config?.items ?? [];
      types = shapesOf(items);

      layer.replaceChildren();
      this._elements = [];
      this._wrappers = [];
      this._probes = [];

      items.forEach((item, index) => {
        // The only branch the second family costs: our element answers setConfig
        // and hass exactly like a badge element, so every other path is shared.
        const child = this._createChild(item, helpers);
        if (!child) {
          // A hole, not a skip. `_elements`, `_wrappers` and `_probes` are read
          // by index against `items`; dropping an entry would hand every later
          // item the previous one's config.
          this._elements.push(undefined);
          this._wrappers.push(undefined);
          this._probes.push(undefined);
          return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = `item ${item.type}`;
        wrapper.dataset.index = String(index);

        if (this._hass) child.hass = this._hass;
        wrapper.append(child as unknown as HTMLElement);

        // Built once and shown by CSS on the selected item, rather than added
        // and removed as the selection moves: the wrapper's box is what the
        // gesture measures, and DOM churn under the pointer is how a gesture
        // loses its target.
        if (item.type === "element" && isResizableKind(item.config.type)) {
          for (const corner of HANDLE_CORNERS) {
            const handle = document.createElement("div");
            handle.className = `handle handle-${corner}`;
            handle.dataset.corner = corner;
            wrapper.append(handle);
          }
        }

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
        if (item.type === "unknown") return;
        const child = this._elements[index];
        if (!child) return;
        child.setConfig(item.config as unknown as BadgeConfig);
        // The config the gesture committed has landed, so the element derives
        // its own fit mode again. Left in place, a stale override would outlive
        // a later change made through the form — the element survives a config
        // change, only its config is replaced.
        (child as unknown as { stretch?: boolean }).stretch = undefined;
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
  ): LovelaceBadgeElement | undefined {
    if (item.type === "unknown") return undefined;
    if (item.type === "badge") {
      const type = String((item.config as Record<string, unknown>).type ?? "");
      const el = helpers.createBadgeElement(item.config) as HTMLElement & LovelaceBadgeElement;
      // Home Assistant answers the type question synchronously: build the badge
      // and look at what came back. We do not probe — the card has no machinery
      // to drive that asynchrony, and on a real dashboard with no editor open
      // no probe would ever run at all.
      // - If HA handed back its own error badge (unknown type, missing custom:
      //   resource, …), keep it — its message names the real problem better than
      //   ours could.
      // - If HA built the badge happily but the type is one we do not offer,
      //   replace it with our error badge: drawing it would silently give the
      //   user something other than what they asked for.
      // - `custom:` types are always considered supported by isSupportedBadgeType,
      //   so they are never intercepted here — HA's hide-then-reveal timer and
      //   its own error badge for a resource still loading are untouched.
      // - `origConfig` is not decoration: hui-error-badge dumps it as YAML in
      //   the detail dialog its click opens, the same affordance Lovelace gives
      //   everywhere else.
      if (type && !isSupportedBadgeType(type) && el.tagName.toLowerCase() !== ERROR_BADGE_TAG) {
        // One verdict, two channels: the badge drawn on the picture and the console
        // line reported beside it below.
        const message = `Unsupported badge type: ${type}`;
        // Upstream hole (create-badge-element.ts, frontend 20260729.6): `error` is
        // in ALWAYS_LOADED_TYPES but hui-error-badge is never statically imported
        // there, so the always-loaded branch calls setConfig on an unregistered
        // element — throwing on a cold dashboard. HA itself always reaches error
        // badges through createErrorBadgeElement, which is guarded and performs its
        // own dynamic import.
        // Filed upstream: https://github.com/home-assistant/frontend/issues/53721
        // Delete this guard, _primeErrorBadge, _awaitingErrorBadge and PRIMING_TYPE
        // once the fixed frontend is inside this card's minimum Home Assistant.
        if (!customElements.get(ERROR_BADGE_TAG)) return this._primeErrorBadge(helpers);
        // Built by hand rather than asked of helpers.createBadgeElement, and that
        // is the whole point: `error` is an always-loaded type, so the factory
        // routes it straight back through the unguarded branch described above.
        // When that branch fails, Home Assistant does not throw — it catches and
        // returns an error badge carrying its own internal message, so our verdict
        // on the user's badge would silently read "n.setConfig is not a function".
        // These two lines are what HA's own _createElement runs anyway.
        try {
          const errorBadge = document.createElement(ERROR_BADGE_TAG) as HTMLElement &
            LovelaceBadgeElement;
          errorBadge.setConfig({
            type: "error",
            error: message,
            origConfig: item.config,
          } as never);
          // Reported below the guard, so a cold dashboard writes one line and not
          // two: this method runs twice for the same item — once to refuse and
          // prime, once after the class lands — and only the second pass gets
          // here. Reported by the refusal rather than by _primeErrorBadge, because
          // the refusal is permanent and that method is not: logging there would
          // take the console channel down with the workaround the day upstream
          // ships its fix. Home Assistant's own shape, `(kind, config.type,
          // error)`, and like Home Assistant it repeats on every rebuild.
          //
          // Inside the try, and deliberately. A review proposed lifting it out, so
          // that what is drawn would not depend on a reporting call — but measured,
          // the trade goes the wrong way: a console.error that threw from above the
          // try escapes _createChild, aborts the forEach in _syncItems, and leaves
          // the whole card empty, where from in here the catch contains it to this
          // one item. Bigger blast radius for tidier semantics is not a bargain.
          //
          // The cost of this placement, accepted: a badge that can never be drawn,
          // because the chunk never arrives, is never reported either.
          console.error("badge", type, new Error(message));
          return errorBadge;
        } catch {
          // Unreachable by the guard above, and kept anyway: a hole is an honest
          // failure, Home Assistant's internal message presented as our verdict is
          // not. No retry is armed here — the class was registered a line ago, so
          // there is nothing left to wait for, and re-arming would rebuild into
          // this same failure forever.
          return undefined;
        }
      }
      // HA's badge factory returns a hui-error-badge with style.display="none"
      // and a 2000 ms timer that restores it. In the editor, stability across a
      // drag is worth more than flash-avoidance: every config change rebuilds
      // the whole card element, restarting the timer and re-hiding the badge.
      // Clearing the inline display here makes error badges visible immediately
      // while editing.
      if (this.editing && el.tagName.toLowerCase() === ERROR_BADGE_TAG) {
        el.style.display = "";
      }
      return el;
    }
    let tag: string | undefined;
    if (item.config.type === "state-label") tag = LABEL_TAG;
    else if (item.config.type === "state-icon") tag = ICON_TAG;
    else if (item.config.type === "image") tag = IMAGE_TAG;
    // No else. An unknown kind never reaches this method — normalizeElementConfig
    // raises first — and defaulting it to the icon would corrupt its config with
    // icon-only keys the day a third kind exists.
    if (!tag) return undefined;
    const el = document.createElement(tag) as unknown as LovelaceBadgeElement;
    el.setConfig(item.config as unknown as BadgeConfig);
    // Stamp the editing flag at birth so the element is never created into the
    // wrong state. The loop in _syncEditingAndDrag keeps it correct on
    // editing transitions that do not rebuild the children.
    (el as HTMLElement & { editing?: boolean }).editing = this.editing;
    return el;
  }

  /**
   * Make Home Assistant fetch hui-error-badge, and arrange for the item to be
   * drawn once it lands. Returns undefined: until then the item is a hole.
   *
   * The module is fetched from exactly one place in Home Assistant's bundle —
   * its internal createErrorBadgeElement — which is not exported. The only way
   * in is the public badge factory, and it only reaches that routine by
   * failing, hence a type built to be impossible to construct.
   *
   * The failure is genuine, so Home Assistant logs it — a line about a type
   * nobody wrote, next to the caller's line about the badge that really is at
   * fault. It is dropped, and only it: matching is on the type argument, never
   * on the message text, because the text is Home Assistant's and may change
   * while the sentinel is ours and cannot. The swap is undone in a `finally`,
   * and the window it covers is one synchronous call, so nothing else can log
   * inside it.
   *
   * Upstream: https://github.com/home-assistant/frontend/issues/53721
   */
  private _primeErrorBadge(helpers: Awaited<ReturnType<typeof window.loadCardHelpers>>): undefined {
    const log = console.error;
    console.error = (...args: unknown[]) => {
      if (args[1] !== PRIMING_TYPE) log(...args);
    };
    try {
      void helpers.createBadgeElement({ type: PRIMING_TYPE } as never);
    } finally {
      console.error = log;
    }

    if (!this._awaitingErrorBadge) {
      this._awaitingErrorBadge = true;
      void customElements.whenDefined(ERROR_BADGE_TAG).then(() => {
        this._awaitingErrorBadge = false;
        // A card removed from the document keeps its renderRoot, so `_layer` still
        // resolves and the rebuild below would run: work nobody can see, plus a
        // console line about a badge on a card that is gone.
        //
        // The flag is cleared first so nothing is left latched: a card put back
        // into the document will build the badge, or prime again if the class is
        // somehow still missing, on its next config change — which is the only
        // thing that calls _syncItems. Reconnecting does not, so an item primed
        // and then disconnected before the class landed stays a hole until then.
        // Unreachable in practice: Home Assistant builds a new card element on
        // every config change and on navigation, so the same element is never
        // taken out and put back mid-flight.
        if (!this.isConnected) return;
        // requestUpdate would not reach the hole: `updated` only syncs items on a
        // config change, and `_syncItems` only rebuilds when the shape changed —
        // which it has not. Invalidating the shape is what reopens it. Safe here:
        // `_renderedTypes = types` is assigned in the same synchronous block as
        // the loop that called us, so it has already run by the time this fires.
        this._renderedTypes = [];
        void this._syncItems();
      });
    }
    return undefined;
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
    if (item.type === "unknown" || this.editing || !hasVisibility(item)) return undefined;
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

  /**
   * Everything the wrappers carry that is not their position: the two class
   * marks, and the condition marker's corner.
   *
   * Split from `_applyPositions` because a selection change needs exactly this
   * and must not touch the coordinates. Between a drag's release and the config
   * coming back down from Home Assistant, `item.position` is still the pre-drag
   * one, so writing it would put the badge back where it was grabbed from — and
   * with nothing but the round trip to correct it, that is what the eye sees.
   * The window used to be unreachable: the selection was announced at
   * pointerdown, inside the drag guard, and nothing else re-renders in it. It
   * became reachable when the announcement moved to the release, and the browser
   * lane caught it at once.
   */
  private _applyMarks(items: PictureItem[]): void {
    const liveGesture = this._gestureIndex();
    items.forEach((item, index) => {
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      if (item.type === "unknown") return;
      // A class rather than a Lit binding because the wrappers are built
      // imperatively. It sits outside the gesture guard below because a mark is
      // not a coordinate: nothing about it goes stale mid-gesture.
      wrapper.classList.toggle("selected", this.editing && index === this.selected);
      // "This item carries conditions", not "it is hidden right now": there is
      // no probe in the editor, so there is no verdict to read — and a static
      // mark is the better affordance anyway, since it does not flicker with
      // entity state. The live verdict lives in the form's own banner.
      // Keyed on `preview`, not on `editing`: `preview` is true both in the
      // card's own edit dialog and on a dashboard in edit mode, and it is
      // exactly what makes Home Assistant hold every conditional item on
      // screen. The mark is what explains that — without it, an editing user
      // sees items that a viewing user will not, and nothing says which.
      const conditional = this.preview && hasVisibility(item);
      wrapper.classList.toggle("conditional", conditional);
      // The marker's corner is guarded like a coordinate, because it is one:
      // during a gesture the stored position is stale, and whichever controller
      // is live (drag via onMove, resize by holding the corner steady) is what
      // keeps the corner honest.
      if (index === liveGesture) return;
      this._applyMarkerCorner(wrapper, conditional ? item.position : undefined);
    });
  }

  private _applyPositions(items: PictureItem[]): void {
    this._applyMarks(items);
    const dragging = this._gestureIndex();
    items.forEach((item, index) => {
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      if (item.type === "unknown") return;
      // Leave the item under the cursor alone: its styles are live pixels
      // managed by the active gesture controller (drag or resize). Writing the
      // stored config position over them would jump the item back toward its
      // pre-gesture location on every hass tick. Once the gesture ends, the
      // controller restores the derived style and the next _applyPositions then
      // matches it exactly — no flash.
      if (index === dragging) return;

      const style = positionStyle(item.position, item.anchor);
      wrapper.style.top = style.top;
      wrapper.style.left = style.left;
      wrapper.style.transform = style.transform;

      // The box, for the one kind that has one. It goes here rather than on the
      // element because `.item` is `width: max-content`, and a percentage width
      // on a child of a max-content box is cyclic — CSS resolves it as `auto`, so
      // an element sizing itself in % simply would not. The wrapper is ours.
      //
      // Inline style rather than a class: `wrapper.className` is the item
      // *family*, never the kind, so there is no `.item.image` to write a rule
      // against — and inventing one would add a second channel saying what the
      // config already says.
      if (item.type === "element" && item.config.type === "image") {
        const box = imageBoxStyle(effectiveBox(item.config));
        wrapper.style.width = box.width;
        wrapper.style.height = box.height;
        wrapper.style.maxHeight = box.maxHeight;
      }
    });
  }

  /**
   * Point the condition marker towards the inside of the picture, or clear it
   * when there is no marker to point.
   *
   * Split out because the drag calls it on every pointermove. A marker left on
   * the side the item is travelling towards overhangs the card, and `ha-card`
   * scrolls vertically — so a stale corner does not merely look wrong, it
   * raises a scrollbar under the pointer in the middle of a gesture.
   */
  private _applyMarkerCorner(wrapper: HTMLElement, position: Position | undefined): void {
    const corner = position ? markerCorner(position) : undefined;
    for (const c of MARKER_CORNERS) wrapper.classList.toggle(`marker-${c}`, c === corner);
  }

  /**
   * What a pointer landed on: a resize handle, an item, or the picture.
   *
   * One owner, consulted by both gesture controllers. Two copies of this — one
   * per controller — is the shape that eventually disagrees, and the
   * disagreement would be invisible because each is correct on its own.
   */
  private _hitHandle(target: EventTarget | null): ResizeHit | undefined {
    const handle = (target as HTMLElement | null)?.closest?.(".handle") as HTMLElement | null;
    const corner = handle?.dataset.corner as Corner | undefined;
    const wrapper = handle?.closest(".item") as HTMLElement | null;
    const index = wrapper?.dataset.index;
    return handle && corner && wrapper && index !== undefined
      ? { element: wrapper, index: Number(index), corner }
      : undefined;
  }

  /**
   * The item under a live gesture, whichever gesture it is.
   *
   * `_applyPositions` must leave that wrapper alone: its styles are raw pixels
   * managed by a controller, and writing the stored config over them would jump
   * the item back on every hass tick. One question, not one flag per controller.
   */
  private _gestureIndex(): number | undefined {
    return this._drag.draggingIndex() ?? this._resize.resizingIndex();
  }

  /**
   * The item's coordinates re-expressed under its new anchor, or undefined if
   * there is nothing to do. Returning the position instead of only committing
   * it lets the caller render it on this same pass, so the item never shows at
   * the pre-recomputation place for a frame.
   *
   * CardChannel. The editor asks this before it writes the new anchor, because
   * afterwards there is no "before" left to measure: Home Assistant rebuilds the
   * card element on every config change, so this instance — and everything it
   * could have remembered — is gone by the time the new anchor comes back down.
   */
  reanchor(index: number, anchor: Anchor): Position | undefined {
    const item = this._config?.items[index];
    const wrapper = this._wrappers[index];
    const layer = this._layer;
    if (!item || !wrapper || !layer || item.type === "unknown" || item.anchor === anchor)
      return undefined;

    return reanchor(
      item.position,
      item.anchor,
      anchor,
      layer.getBoundingClientRect(),
      wrapper.getBoundingClientRect(),
    );
  }

  viewportTop(): number | undefined {
    const rect = this.getBoundingClientRect();
    // A height of zero means the picture has not laid out. Reporting a top then
    // hands the editor a number it would trust.
    return rect.height > 0 ? rect.top : undefined;
  }

  measureImageHeight(index: number): number | undefined {
    const wrapper = this._wrappers[index];
    const layer = this._layer;
    if (!wrapper || !layer) return undefined;
    const layerRect = layer.getBoundingClientRect();
    if (layerRect.height === 0) return undefined;
    const wrapperRect = wrapper.getBoundingClientRect();
    return Math.round((wrapperRect.height / layerRect.height) * 10000) / 100;
  }

  protected render() {
    if (!this._config) return nothing;

    return html`
      <ha-card>
        ${
          hasHeading(this._config.heading)
            ? html`
                <picture-studio-heading
                  .hass=${this.hass}
                  .heading=${this._config.heading}
                  .preview=${this.preview}
                ></picture-studio-heading>
              `
            : nothing
        }
        ${
          this.editing
            ? html`
                <picture-studio-toolbar
                  .hass=${this.hass}
                  .item=${this.selected === undefined ? undefined : this._config.items[this.selected]}
                  .index=${this.selected}
                  @anchor-changed=${(ev: CustomEvent<{ anchor: Anchor }>) => {
                    const index = this.selected;
                    if (index === undefined) return;
                    activeEditor()?.patchAnchor(index, ev.detail.anchor);
                  }}
                ></picture-studio-toolbar>
              `
            : nothing
        }
        <div class="root ${this.editing ? "editing" : ""} ${this.preview ? "previewing" : ""}">
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
      /* mdi:eye, inlined once as a mask source. Named here rather than at the
         call site so the glyph is one edit away from being another one. The
         open eye, not the crossed-out one: the mark says the item has
         visibility conditions, not that it is hidden. */
      --psc-marker-glyph: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z'/></svg>");
    }
    ha-card {
      height: 100%;
      overflow-x: hidden;
      overflow-y: auto;
    }
    /* The toolbar docks between the card heading and the picture. It is a
       sibling of .root, not a child: .root is the size container every
       element's cqw resolves against, and a child would change what a
       percentage means. */
    picture-studio-toolbar {
      display: block;
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
    /* A panel view saves the theme's card tokens under --restore-card-* and then
       zeroes them for every descendant, so a card that fills the view carries no
       border, radius or shadow. Custom properties inherit, so that zeroing
       crosses into our shadow DOM and reaches a badge, which reads
       --ha-card-border-width and --ha-card-box-shadow to draw its own outline —
       a badge in our card lost the outline the same badge wears in a sections
       view. Home Assistant's own container cards answer this with exactly these
       three declarations, on the box that holds their children; ours is .item.
       The host keeps the zeroed values, so the card still touches the edges.
       Conditional because --restore-card-* exists only under a panel view:
       applied everywhere, the declarations would be invalid elsewhere and a
       badge would fall back to its own 1px, overruling a theme that asked for
       none. */
    :host([ispanel]) .item {
      --ha-card-border-radius: var(--restore-card-border-radius);
      --ha-card-border-width: var(--restore-card-border-width);
      --ha-card-box-shadow: var(--restore-card-box-shadow);
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
    /* Twin ring lives in badge-list.ts under .item.selected (--error-color, for
       items that are selected but refused a form). Two lines, not worth a shared
       module — the comment is the link between them. */
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
    /* Two pseudo-elements over one box: the disc below, the glyph above. One
       element cannot hold both — the mask that colours the glyph would clip the
       disc away with it.
       Both are out of flow, so neither adds anything to the wrapper's
       max-content width: the halo, the ring and the radius keep tracing the
       item alone, and getBoundingClientRect — which the drag clamp measures —
       returns the same box it did before. They carry their own pointer-events,
       because the rule muting the wrapper's children matches real children and
       not pseudo-elements.
       The corner comes in as four variables rather than being written on each
       pseudo-element, so the two stay glued together by construction. */
    /* The glyph leads and the disc follows. It is the eye that has to read on
       a photograph; the disc is only what separates it from one, and the ring
       between them is a constant so the two cannot drift apart. One value to
       change, and the disc, the mask and the corner offsets all follow. */
    .previewing .item.conditional {
      --psc-marker-glyph-size: 16px;
      --psc-marker-size: calc(var(--psc-marker-glyph-size) + 6px);
    }
    .previewing .item.conditional::before,
    .previewing .item.conditional::after {
      content: "";
      position: absolute;
      width: var(--psc-marker-size);
      height: var(--psc-marker-size);
      box-sizing: border-box;
      top: var(--psc-marker-top, auto);
      right: var(--psc-marker-right, auto);
      bottom: var(--psc-marker-bottom, auto);
      left: var(--psc-marker-left, auto);
      pointer-events: none;
    }
    /* The badge's own tokens, so the mark follows the theme wherever the card
       is dropped rather than carrying two hand-picked colours that would each
       be wrong in one of the two modes. */
    .previewing .item.conditional::before {
      border-radius: var(--ha-border-radius-circle, 50%);
      background: var(--ha-card-background, var(--card-background-color, #fff));
      /* 1px outright, not --ha-card-border-width: plenty of themes set that to
         0 and let a shadow separate their cards instead. Here the ring is what
         lifts the mark off a photograph, so it is not the theme's to remove —
         only its colour is. */
      border: 1px solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
    }
    /* Same box as the disc, so the glyph needs no offset of its own: what is
       smaller and centred is the mask. --badge-color is what a badge colours
       its own icon with; outside one it resolves to the fallback, which is the
       colour a badge's icon takes when nothing overrides it. */
    .previewing .item.conditional::after {
      background-color: var(--badge-color, var(--secondary-text-color));
      -webkit-mask: var(--psc-marker-glyph) center /
        var(--psc-marker-glyph-size) var(--psc-marker-glyph-size) no-repeat;
      mask: var(--psc-marker-glyph) center / var(--psc-marker-glyph-size)
        var(--psc-marker-glyph-size) no-repeat;
    }
    /* Half the disc, so it straddles the corner exactly whatever its size. */
    .previewing .item.marker-top-right {
      --psc-marker-top: calc(var(--psc-marker-size) / -2);
      --psc-marker-right: calc(var(--psc-marker-size) / -2);
    }
    .previewing .item.marker-top-left {
      --psc-marker-top: calc(var(--psc-marker-size) / -2);
      --psc-marker-left: calc(var(--psc-marker-size) / -2);
    }
    .previewing .item.marker-bottom-right {
      --psc-marker-bottom: calc(var(--psc-marker-size) / -2);
      --psc-marker-right: calc(var(--psc-marker-size) / -2);
    }
    .previewing .item.marker-bottom-left {
      --psc-marker-bottom: calc(var(--psc-marker-size) / -2);
      --psc-marker-left: calc(var(--psc-marker-size) / -2);
    }
    .editing .item > * {
      pointer-events: none;
    }
    /* The handles exist on every resizable item and are shown only on the
       selected one. Absolutely positioned, so they add nothing to the wrapper's
       box — getBoundingClientRect is what both gestures measure, and the
       condition marker's comment above makes the same point for the same
       reason. */
    .handle {
      display: none;
    }
    .editing .item.selected > .handle {
      display: block;
      position: absolute;
      width: var(--psc-handle-size, 10px);
      height: var(--psc-handle-size, 10px);
      box-sizing: border-box;
      background: var(--card-background-color, #fff);
      border: 2px solid var(--primary-color);
      border-radius: 2px;
      /* Beats \`.editing .item > *\`, which mutes the real children so a badge
         never sees a click. A handle is the exception: it is the target. */
      pointer-events: auto;
      touch-action: none;
    }
    .editing .item.selected > .handle-top-left {
      top: calc(var(--psc-handle-size, 10px) / -2);
      left: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nwse-resize;
    }
    .editing .item.selected > .handle-top-right {
      top: calc(var(--psc-handle-size, 10px) / -2);
      right: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nesw-resize;
    }
    .editing .item.selected > .handle-bottom-left {
      bottom: calc(var(--psc-handle-size, 10px) / -2);
      left: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nesw-resize;
    }
    .editing .item.selected > .handle-bottom-right {
      bottom: calc(var(--psc-handle-size, 10px) / -2);
      right: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nwse-resize;
    }
  `;
}
