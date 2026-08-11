import { css, html, LitElement, nothing } from "lit";
import { activeEditor } from "../broker";
import {
  EDITOR_TAG,
  normaliseConfig,
  type PictureBadgeItem,
  type PictureBadgesConfig,
  stubConfig,
} from "../config";
import { positionStyle } from "../position";
import type { HomeAssistant, LovelaceBadgeElement } from "../types";
import { createDragController } from "./drag-layer";

export class PictureBadgesCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    editing: { type: Boolean },
    _config: { state: true },
  };

  declare preview: boolean;
  declare editing: boolean;
  declare _config?: PictureBadgesConfig;

  private _hass?: HomeAssistant;
  private _elements: LovelaceBadgeElement[] = [];
  private _wrappers: HTMLElement[] = [];
  private _renderedTypes: string[] = [];

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

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._drag.detach();
  }

  protected updated(): void {
    this._syncEditing();
    const layer = this._layer;
    if (this.editing && layer) {
      this._drag.attach(layer);
    } else {
      this._drag.detach();
    }
    void this._syncBadges();
  }

  private get _layer(): HTMLElement | null {
    return this.renderRoot.querySelector(".layer");
  }

  /**
   * Rebuild children only when the list of badge types changed; otherwise push
   * the new config into the instances in place. This is what lets an in-flight
   * drag survive a config round-trip.
   */
  private async _syncBadges(): Promise<void> {
    const layer = this._layer;
    const items = this._config?.badges ?? [];
    if (!layer) return;

    const types = items.map((item) => String(item.badge.type ?? ""));
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

        const badge = helpers.createBadgeElement(item.badge);
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
        badge.setConfig(item.badge);
        if (this._hass) badge.hass = this._hass;
      });
    }

    this._applyPositions(items);
  }

  private _applyPositions(items: PictureBadgeItem[]): void {
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
    const config = this._config;
    if (!config) return nothing;

    return html`
      <ha-card>
        <div class="root ${this.editing ? "editing" : ""}">
          <hui-image
            .hass=${this._hass}
            .image=${config.image}
            .cameraImage=${config.camera_image}
            .cameraView=${config.camera_view}
            .stateImage=${config.state_image}
            .darkModeImage=${config.dark_mode_image}
            .aspectRatio=${config.aspect_ratio}
            .filter=${config.filter}
            .fitMode=${config.fit_mode}
          ></hui-image>
          <div class="layer"></div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }
    /* .root holds only hui-image in normal flow, so the drag surface matches
       the image's aspect ratio exactly. */
    .root {
      position: relative;
    }
    hui-image {
      display: block;
      width: 100%;
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
