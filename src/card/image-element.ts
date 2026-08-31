import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { type ImageElementConfig, imagePath } from "../config";
import { IMAGE_KIND, withDefaultActions } from "../element-kinds";
import { hassRenderChanged } from "../has-changed";
import { effectiveBox, ratioIsForced } from "../image-box";
import { captureRatio, pictureKey, recallRatio } from "../picture-ratio";
import type { HomeAssistant } from "../types";
import { bindActions, isClickable, relayActions } from "./item-actions";
import { interactionStyles } from "./item-styles";

/**
 * Home Assistant's shared image renderer — verified against HA frontend build
 * **20260729.6**. **Not `hui-image-element`**, the
 * picture-elements wrapper: its own shadow root holds an unstyled `<div>` that
 * breaks the `height: 100%` chain, and nothing reaches that node from outside —
 * no `::part`, no custom property, no light-DOM selector. So it covers only one
 * of this element's two modes.
 *
 * `hui-image` itself is fine, and the difference is one property: `fitMode`,
 * which the wrapper never forwards and which we do. Measured on frontend
 * 20260729.6, in a real browser: given a definite height it fills it, and
 * `fitMode: "fill"` reaches the `<img>` as `object-fit: fill`.
 *
 * It is not on any public helper surface. Its availability is nonetheless not a
 * side effect of our background rendering — `window.loadCardHelpers` is
 * `Promise.all([s.e(33932), …])` and 33932 is this chunk, so the helper loads it
 * before resolving, whatever the card's config says. The card awaits
 * `loadCardHelpers()` before `_createChild` runs. The guard below is for the day
 * Home Assistant splits its chunks differently, which it may do without a
 * deprecation cycle.
 */
const HUI_IMAGE = "hui-image";

/**
 * The path `hui-image` should draw, resolving `image_entity` ourselves.
 *
 * `hui-image-element` did this and `hui-image` does not; the whole of Home
 * Assistant's `computeImageUrl` is the expression below, and it is the public
 * HTTP API. The `&state=` is a cache-buster, which is why the picture redraws
 * when the entity changes. The `undefined` on a missing token is mirrored too —
 * that is HA's own answer, not a degradation of ours.
 */
export const imageSource = (
  config: ImageElementConfig,
  hass: HomeAssistant | undefined,
): string | undefined => {
  if (config.image_entity) {
    const stateObj = hass?.states?.[config.image_entity];
    const token = (stateObj?.attributes as { access_token?: string } | undefined)?.access_token;
    if (!stateObj || !token) return undefined;
    return `/api/image_proxy/${config.image_entity}?token=${token}&state=${stateObj.state}`;
  }
  return imagePath(config.image);
};

/**
 * Per-page ratio cache, keyed by camera entity id.
 * Exported so tests can clear it between cases.
 */
export const liveCameraRatioCache = new Map<string, string>();

/**
 * Corrects `hui-image`'s aspect ratio for a live camera.
 *
 * Verified on HA frontend **20260729.6**: with no `aspectRatio` given and
 * the camera not yet measured, `hui-image` falls back to a hard-coded
 * **56.25 % padding-bottom** (16:9). The camera served 600 × 410; the
 * wrapper came out 600 × 337.5 — a 72.5 px overflow. `_lastImageHeight` is
 * only set by `_onVideoLoad`, from `ha-camera-stream.offsetHeight`, which is
 * 0 because the container gave it no height. Measured stable from 200 ms to
 * 9 s after a card rebuild. It never heals on its own.
 *
 * Fix: supply the real ratio via `hui-image`'s public `aspectRatio` property
 * (the string form `parseAspectRatio` accepts, e.g. `"600x410"`). After
 * setting it, the container comes out 600 × 410 — equal by construction.
 *
 * **Spec tension:** the image-element spec says `aspect_ratio` is "the one
 * background key an image element must not take" because it makes `hui-image`
 * build a `.ratio` container that defeats an imposed height. That is about the
 * **config key**. The case here is the inverse: a live camera is already in
 * forced keep-ratio (`ratioIsForced` is true), so there is no imposed height
 * to defeat. These are not in conflict.
 *
 * **Guard:** we act only while `hui-image` is demonstrably guessing — its
 * 16:9 fallback. We read `padding-bottom / offsetWidth` from the open shadow
 * root and proceed only when the ratio is within 0.002 of 0.5625. When Home
 * Assistant derives the real ratio itself, that test stops matching and our
 * value never lands — the workaround retires itself rather than overriding
 * a proper fix. If you find yourself removing this guard or widening it,
 * stop and report instead.
 *
 * **Cache:** `entity_picture` tokens rotate; the ratio does not. One
 * measurement per camera entity per page load.
 *
 * **Failures:** every failure path (no `entity_picture`, load error, absent
 * or closed shadow root, not yet connected) degrades to today's behaviour
 * silently — no throw.
 */
export const applyLiveCameraRatio = async (
  config: ImageElementConfig,
  hass: HomeAssistant,
  huiImage: Element,
): Promise<void> => {
  if (!ratioIsForced(config)) return;

  // hui-image is a Lit element whose shadow DOM is not settled on the same
  // turn as our own updated(). Measured on HA frontend 20260729.6: the
  // container was absent at the first synchronous check; calling setConfig a
  // second time made it apply immediately — confirming timing, not logic, was
  // wrong. Fall back to Promise.resolve() for stubs without updateComplete.
  await ((huiImage as unknown as { updateComplete?: Promise<boolean> }).updateComplete ??
    Promise.resolve());

  // If the element was removed while we were waiting, the layout it would read
  // is stale and the aspectRatio it would set lands on an orphaned node.
  if (!huiImage.isConnected) return;

  // Guard: act only while hui-image is serving its 16:9 guess.
  // In a real browser getComputedStyle returns pixels ("337.5px" for a 600 px
  // host); in happy-dom it may return the inline percentage ("56.25%").
  // Both forms are handled so the happy-dom tests cover the decision logic.
  const shadow = huiImage.shadowRoot;
  if (!shadow) return;
  const container = shadow.querySelector(".container");
  if (!(container instanceof HTMLElement)) return;

  const pb = window.getComputedStyle(container).paddingBottom;
  const w = container.offsetWidth;

  let ratio: number | undefined;
  if (pb.endsWith("%")) {
    const pct = parseFloat(pb);
    if (!Number.isNaN(pct)) ratio = pct / 100;
  } else if (pb.endsWith("px") && w > 0) {
    ratio = parseFloat(pb) / w;
  }

  if (ratio === undefined || Math.abs(ratio - 0.5625) >= 0.002) return;

  const cameraEntity = config.camera_image;
  if (!cameraEntity) return;

  // Cache hit: entity_picture tokens rotate, the ratio does not.
  if (liveCameraRatioCache.has(cameraEntity)) {
    const cached = liveCameraRatioCache.get(cameraEntity);
    if (cached !== undefined) {
      (huiImage as unknown as { aspectRatio: string }).aspectRatio = cached;
    }
    return;
  }

  const stateObj = hass.states?.[cameraEntity];
  const entityPicture = (stateObj?.attributes as Record<string, unknown> | undefined)
    ?.entity_picture as string | undefined;
  if (!entityPicture) return;

  // Load entity_picture — the HA-published attribute, not a hand-built URL.
  const img = new Image();
  img.onerror = (): void => {
    // A failed load fires no onload and throws nothing — the silent-degrade
    // requirement already holds in practice. The explicit no-op makes the
    // failure path visible to a reader who is auditing error handling.
  };
  img.onload = () => {
    const { naturalWidth: imgW, naturalHeight: imgH } = img;
    if (imgW > 0 && imgH > 0) {
      const aspectRatio = `${imgW}x${imgH}`;
      liveCameraRatioCache.set(cameraEntity, aspectRatio);
      (huiImage as unknown as { aspectRatio: string }).aspectRatio = aspectRatio;
    }
  };
  img.src = entityPicture;
};

export class PictureStudioImage extends LitElement {
  static properties = {
    _config: { state: true },
    _hass: { state: true },
    editing: { type: Boolean },
    stretch: { type: Boolean },
    _ratioHint: { state: true },
  };

  declare _config?: ImageElementConfig;
  declare _hass?: HomeAssistant;
  declare editing: boolean;
  /**
   * A fit mode the gesture imposes before the config catches up.
   *
   * During a resize no `setConfig` fires, so an element whose box has just
   * gained a pixel height would still render `contain` and sit letterboxed
   * inside the selection ring until the release flipped it to `fill`. The card
   * pushes this for the length of the gesture and drops it at the commit, which
   * restores the derived value. `undefined` means "read the config", which is
   * every moment outside a gesture.
   */
  declare stretch: boolean | undefined;

  /**
   * The remembered shape of this picture, handed to `hui-image` for its first
   * render and **dropped the moment it has measured the picture itself**.
   *
   * A fresh `hui-image` renders its 16:9 placeholder until its own image loads,
   * which costs a frame at the wrong height on every card rebuild — and Home
   * Assistant rebuilds on every config change **made from the editor**, where
   * `hui-card` sets `preview` (see `CardChannel` in `broker.ts`). The hint fills
   * exactly that gap.
   *
   * Dropped rather than kept, and that is the whole reason it is a field instead
   * of a value read at render time: an imposed ratio makes `hui-image` keep its
   * padding box **for good** and never measure, so a remembered shape that
   * turned out wrong would draw the picture wrong for the element's whole life
   * rather than for one frame.
   */
  declare _ratioHint: string | undefined;

  constructor() {
    super();
    this.editing = false;
    // The same relay the other two kinds use: an `action` event is re-dispatched
    // upward as `hass-action` with the config attached, and Home Assistant
    // decides what it means.
    relayActions(this, () => this._config);
  }

  setConfig(config: ImageElementConfig): void {
    this._config = withDefaultActions(IMAGE_KIND, config);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /**
   * The card hands every item every `hass` publication. Both entity keys can
   * make that parameter mean something here: `entity` selects among
   * `state_image` entries (state-driven picture switching), while `image_entity`
   * IS the picture source (its proxy URL carries the state as a cache-buster).
   * Either one changing must trigger a re-render; watching only one leaves the
   * other stale.
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("_config") || changed.has("editing") || !changed.has("_hass")) return true;
    const old = changed.get("_hass") as HomeAssistant | undefined;
    return (
      hassRenderChanged(old, this._hass, this._config?.entity) ||
      hassRenderChanged(old, this._hass, this._config?.image_entity)
    );
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;

    const src = imageSource(config, this._hass);
    const drawable = !!(src || config.camera_image || config.state_image);

    // Two ways to have nothing to draw, one answer. An <img> with no source
    // renders nothing at all — unlike a state-icon, which gets HA's own
    // missing-entity marker — so a fresh item would be invisible and impossible
    // to grab. The dashed box is what makes it selectable between being added
    // and being configured, and it is also where a broken path degrades to.
    if (!drawable || !customElements.get(HUI_IMAGE)) {
      return this.editing ? html`<div class="placeholder"></div>` : nothing;
    }

    // **Keyed on whether the view is Live, so that crossing that boundary
    // replaces the node rather than updating it.** `undefined` and `"auto"`
    // both mean the still image and share a node: rebuilding between them would
    // restart the camera for a distinction hui-image does not make either. Two things break on a `hui-image` asked to leave Live,
    // and both were measured in a real Home Assistant (see
    // `mem:picture-studio/1.6.0-handoff`):
    //
    // 1. Its still-image poller is started from `connectedCallback` — and only
    //    while `cameraView !== "live"` at that instant — from `willUpdate` on a
    //    **`hass`** change, and from the intersection observer those two create.
    //    Nothing watches `cameraView`, so an element built as a stream keeps
    //    `_cameraImageSrc === undefined`, renders no `<img>` at all and sits on
    //    its spinner.
    // 2. `aspectRatio` is written onto the node by `applyLiveCameraRatio`,
    //    behind this binding's back. Lit only assigns a property whose committed
    //    value changed, so a render going `undefined` → `undefined` cannot take
    //    it back, and the camera's shape outlives Live.
    //
    // Rebuilding is the only re-entry `hui-image` offers for the first, and it
    // settles the second on the way. **Removing this key brings both back.**
    // Nothing else keys it: a fresh node reconnects the camera, far too much to
    // pay for a width being typed into the form.
    return keyed(
      config.camera_view === "live",
      html`
      <hui-image
        .hass=${this._hass}
        .image=${src}
        .darkModeImage=${imagePath(config.dark_mode_image)}
        .cameraImage=${config.camera_image}
        .cameraView=${config.camera_view}
        .entity=${config.entity}
        .stateImage=${config.state_image}
        .stateFilter=${config.state_filter}
        .filter=${config.filter}
        .darkModeFilter=${config.dark_mode_filter}
        .fitMode=${(this.stretch ?? effectiveBox(config).height !== undefined) ? "fill" : "contain"}
        .aspectRatio=${this._ratioHint}
      ></hui-image>
    `,
    );
  }

  /**
   * The hint is taken here and nowhere else: `willUpdate` runs **before** the
   * render, which is the only moment at which it can reach `hui-image`'s first
   * paint. Taken in `updated` it would arrive one frame after the frame it
   * exists to fill.
   *
   * **Only in keep-ratio mode**, and that is not a refinement — it is the same
   * rule that makes `aspect_ratio` the one background key an image element must
   * not take. A ratio, remembered or configured, makes `hui-image` build its
   * `.ratio` container — `height: 0` plus a padding box — which defeats the
   * height the card imposes. Measured in a real Home Assistant: a camera item
   * at width 39 / height 14 opened with the remembered `"375x257"` and drew its
   * picture 241 px tall inside a 145 px frame. A forced ratio (a live camera)
   * has no height to defeat, which is why the question is asked of
   * `effectiveBox` and not of the stored config.
   */
  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") && this._config) {
      this._ratioHint =
        effectiveBox(this._config).height === undefined
          ? recallRatio(pictureKey(this._config))
          : undefined;
    }
  }

  protected updated(changed: PropertyValues): void {
    const config = this._config;
    if (!config) return;
    if (changed.has("_config")) {
      // The same rule as the other two kinds, on the config the kind's defaults
      // have already been merged into: an image defaults to `none`, so a picture
      // nobody gave an action offers no cursor.
      this.toggleAttribute("clickable", isClickable(config));
      bindActions(this, config);
    }
    const huiImage = this.renderRoot.querySelector("hui-image");
    if (this._hass && huiImage) void applyLiveCameraRatio(config, this._hass, huiImage);

    const key = pictureKey(config);
    captureRatio(key, huiImage);
    // Measured for real now, so the hint has done its job and must go: leaving
    // it would keep `hui-image` on its padding box for good, and a remembered
    // shape that turned out wrong would then be drawn for the element's life.
    //
    // `naturalWidth` is the whole test. A memo lookup here would add nothing:
    // the hint can only have come from the memo in the first place.
    //
    // **This runs on any update, which for a file-backed item means the next
    // `hass` push and nothing sooner.** Home Assistant pushes state constantly
    // so the hint clears within a second in practice; it is worth knowing that
    // nothing here schedules that update itself.
    if (this._ratioHint !== undefined && huiImage) {
      const img = huiImage.shadowRoot?.querySelector("img");
      if (img && img.naturalWidth > 0) this._ratioHint = undefined;
    }
  }

  static styles = [
    interactionStyles,
    css`
      /* Every link of the chain is ours, which is the whole reason this element
         exists rather than a hui-image-element: the wrapper's box reaches the
         <img> because nothing unstyled sits between them. */
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      hui-image {
        display: block;
        width: 100%;
        height: 100%;
      }
      /* The aspect-ratio only applies when the height is auto — that is, in
         keep-ratio mode, where a sourceless item has no intrinsic height and
         would otherwise be a zero-pixel box nobody can grab. With an explicit
         height, height: 100% is definite and wins. */
      .placeholder {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        aspect-ratio: 3 / 2;
        border: 2px dashed var(--secondary-text-color, #888);
        border-radius: 4px;
      }
    `,
  ];
}
