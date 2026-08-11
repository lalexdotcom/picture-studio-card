import { css, html, LitElement, nothing } from "lit";
import { activeEditor, subscribeEditors } from "../broker";
import {
  BACKGROUND_KEYS,
  EDITOR_TAG,
  normaliseConfig,
  type PictureBadgesConfig,
  type PictureItem,
  stubConfig,
} from "../config";
import { positionStyle } from "../position";
import type { HomeAssistant, LovelaceBadgeElement, LovelaceElementElement } from "../types";
import { createDragController } from "./drag-layer";

export class PictureBadgesCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    // Derived from `preview` and the broker, never set from outside. Declaring
    // it as a plain property would expose an `editing` attribute that anything
    // could flip.
    editing: { state: true },
    _config: { state: true },
  };

  declare preview: boolean;
  declare editing: boolean;
  declare _config?: PictureBadgesConfig;

  private _hass?: HomeAssistant;
  private _bgElement?: LovelaceElementElement;
  private _elements: LovelaceBadgeElement[] = [];
  private _wrappers: HTMLElement[] = [];
  private _renderedTypes: string[] = [];
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
    onCommit: (index, position) => activeEditor()?.patchPosition(index, position),
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
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  static getStubConfig(): PictureBadgesConfig {
    return stubConfig();
  }

  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TAG);
  }

  /** Must be idempotent: Home Assistant reuses the preview instance. */
  setConfig(config: unknown): void {
    this._config = normaliseConfig(config);
  }

  getCardSize(): number {
    return 4;
  }

  /**
   * Editing means: shown as a preview AND an editor is mounted. `preview` alone
   * is also true in the card-picker gallery, where no editor exists — so the
   * broker discriminates the two with no extra signal.
   */
  private _syncEditing(): void {
    const editing = this.preview && activeEditor() !== undefined;
    if (editing === this.editing) return;
    this.editing = editing;
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
    const layer = this.hasUpdated ? this._layer : null;
    if (this.editing && layer) {
      this._drag.attach(layer);
    } else {
      this._drag.detach();
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
    this._drag.detach();
  }

  protected updated(): void {
    this._syncEditingAndDrag();
    void this._syncBackground();
    void this._syncBadges();
  }

  private get _layer(): HTMLElement | null {
    return this.renderRoot.querySelector(".layer");
  }

  /** Build the config object forwarded to the hui-image-element. */
  private _bgConfig(config: PictureBadgesConfig): Record<string, unknown> {
    const out: Record<string, unknown> = { type: "image" };
    for (const key of BACKGROUND_KEYS) {
      const value = config[key];
      if (value !== undefined) out[key] = value;
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
  private async _syncBadges(): Promise<void> {
    const layer = this._layer;
    const items = this._config?.items ?? [];
    if (!layer) return;

    const types = items.map((item) => String(item.config.type ?? ""));
    const sameShape =
      types.length === this._renderedTypes.length &&
      types.every((t, i) => t === this._renderedTypes[i]);

    if (!sameShape) {
      const helpers = await window.loadCardHelpers();
      layer.replaceChildren();
      this._elements = [];
      this._wrappers = [];

      items.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "item";
        wrapper.dataset.index = String(index);

        const badge = helpers.createBadgeElement(item.config);
        if (this._hass) badge.hass = this._hass;
        wrapper.append(badge);
        layer.append(wrapper);

        this._elements.push(badge);
        this._wrappers.push(wrapper);
      });
      this._renderedTypes = types;
    } else {
      items.forEach((item, index) => {
        const badge = this._elements[index];
        if (!badge) return;
        badge.setConfig(item.config);
        if (this._hass) badge.hass = this._hass;
      });
    }

    this._applyPositions(items);
  }

  private _applyPositions(items: PictureItem[]): void {
    const dragging = this._drag.draggingIndex();
    items.forEach((item, index) => {
      // Leave the badge under the cursor alone: its styles are live pixels
      // managed by the drag controller. Writing the stored config position over
      // them would jump the badge back toward its pre-drag location on every
      // hass tick. Once the drag ends, onPointerUp restores the derived style
      // and the next _applyPositions then matches it exactly — no flash.
      if (index === dragging) return;
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      const style = positionStyle(item.position);
      wrapper.style.top = style.top;
      wrapper.style.left = style.left;
      wrapper.style.transform = style.transform;
    });
  }

  protected render() {
    if (!this._config) return nothing;

    return html`
      <ha-card>
        <div class="root ${this.editing ? "editing" : ""}">
          <div class="layer"></div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }
    /* .root holds only the background element in normal flow, so the drag
       surface matches the image's aspect ratio exactly. */
    .root {
      position: relative;
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
      cursor: grab;
      touch-action: none;
    }
    .editing .item > * {
      pointer-events: none;
    }
  `;
}
