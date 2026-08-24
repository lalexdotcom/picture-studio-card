import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { type ImageElementConfig, imagePath } from "../config";
import { hassRenderChanged } from "../has-changed";
import type { HomeAssistant } from "../types";
import { bindActions, hasAction, relayActions } from "./item-actions";
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
 * **The one place this kind disagrees with the other two.** `isClickable` in
 * `item-actions.ts` reads an absent `tap_action` as clickable, because Home
 * Assistant's default is more-info and a state-icon always has a subject to show
 * it for. An image has none: `entity` selects a state image, it is not what the
 * item is about, and more-info on nothing is an accident rather than a default.
 *
 * The failure is also asymmetric with size. A badge that needlessly catches the
 * pointer costs a few square pixels; a large image would swallow every click
 * over its whole surface, including those meant for the icons underneath it.
 */
export const isImageClickable = (config: ImageElementConfig): boolean =>
  hasAction(config.tap_action) ||
  hasAction(config.hold_action) ||
  hasAction(config.double_tap_action);

export class PictureStudioImage extends LitElement {
  static properties = {
    _config: { state: true },
    _hass: { state: true },
    editing: { type: Boolean },
  };

  declare _config?: ImageElementConfig;
  declare _hass?: HomeAssistant;
  declare editing: boolean;

  constructor() {
    super();
    this.editing = false;
    // The same relay the other two kinds use: an `action` event is re-dispatched
    // upward as `hass-action` with the config attached, and Home Assistant
    // decides what it means.
    relayActions(this, () => this._config);
  }

  setConfig(config: ImageElementConfig): void {
    this._config = config;
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

    return html`
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
        .fitMode=${config.height === undefined ? "contain" : "fill"}
      ></hui-image>
    `;
  }

  protected updated(changed: PropertyValues): void {
    const config = this._config;
    if (!config || !changed.has("_config")) return;
    this.toggleAttribute("clickable", isImageClickable(config));
    bindActions(this, config);
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
