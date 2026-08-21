import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { chromeFill } from "../chrome";
import type { StateIconConfig } from "../config";
import { DEFAULT_ICON_SIZE, elementSizeCss } from "../element-size";
import { hassRenderChanged } from "../has-changed";
import { itemColorCss } from "../state-color";
import type { ActionConfig, HomeAssistant } from "../types";
import { chromeFillStyles, haloStyles, interactionStyles } from "./item-styles";

/** Home Assistant's own one-liner: an action counts when set and not "none". */
export const hasAction = (action?: ActionConfig): boolean =>
  action !== undefined && action.action !== "none";

interface ActionHandlerElement extends HTMLElement {
  bind?: (element: HTMLElement, options: { hasHold: boolean; hasDoubleClick: boolean }) => void;
}

/**
 * The singleton Home Assistant's internal actionHandler directive uses. The
 * directive is nothing but these three lines, so reproducing them borrows the
 * gesture detection — thresholds, finger travel, double-click window — instead
 * of reimplementing it.
 */
const actionHandler = (): ActionHandlerElement | undefined => {
  const existing = document.body.querySelector<ActionHandlerElement>("action-handler");
  if (existing) return existing;
  if (!customElements.get("action-handler")) return undefined;
  return document.body.appendChild(document.createElement("action-handler"));
};

/**
 * An icon-only item. Home Assistant's `state-badge` — the disc at the left of an
 * entity row, not the Lovelace badge — already draws the state icon, colours it
 * by state including a light's real rgb_color and brightness, and shows the
 * entity picture. All this element adds is its size and, in Task 4, the action
 * relay.
 */
export class PictureStudioStateIcon extends LitElement {
  static properties = {
    _config: { state: true },
    _hass: { state: true },
  };

  // No accessibility modifier — just declare, matching the rest of the codebase.
  declare _config?: StateIconConfig;
  // Reactive, not a plain field: shouldUpdate below reads the previous value out
  // of changedProperties, which only a declared property records.
  declare _hass?: HomeAssistant;
  /** The degraded tap listener while one is bound, so it can be taken back off. */
  private _clickFallback?: () => void;

  constructor() {
    super();
    this.addEventListener("action", (ev: Event) => {
      const action = (ev as CustomEvent<{ action?: string }>).detail?.action;
      if (!action || !this._config) return;
      // hass-action is the event the root <home-assistant> hands to Home
      // Assistant's own handleAction — more-info, toggle, navigate, url,
      // perform-action, with the confirmation dialogs. Nothing in the frontend
      // fires it; it exists for third-party cards, which is what we are.
      this.dispatchEvent(
        new CustomEvent("hass-action", {
          detail: { config: this._config, action },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }

  setConfig(config: StateIconConfig): void {
    this._config = config;
  }

  set hass(hass: HomeAssistant) {
    // A plain assignment: `_hass` is reactive, so this schedules the update and
    // records the previous value. It used to call requestUpdate("_config"),
    // which claimed the config had changed on every tick of any entity — the
    // one lie that made a per-tick guard impossible to write.
    this._hass = hass;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /**
   * The card hands every item every `hass` publication, and Home Assistant
   * publishes on every state change in the house. Render only when something we
   * draw from actually moved.
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("_config") || !changed.has("_hass")) return true;
    return hassRenderChanged(
      changed.get("_hass") as HomeAssistant | undefined,
      this._hass,
      this._config?.entity,
    );
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;

    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;

    // Only blank out overrideImage when the entity actually has a picture to suppress,
    // picture-display is off, and no icon override is chosen (overrideIcon already wins
    // that branch in state-badge anyway). Passing "" unconditionally blocks state-badge's
    // colour computation — it only colours inside the `overrideImage === undefined` branch.
    // Residual hole: an entity with a picture, show_entity_picture off, and no icon still
    // loses colour. Closing it would require a different approach to picture suppression.
    const hasPicture = !!(
      stateObj?.attributes?.entity_picture || stateObj?.attributes?.entity_picture_local
    );
    const suppressPicture = !config.show_entity_picture && hasPicture && !config.icon;

    // Use the entity's formatted name (with optional user-supplied override) as the
    // tooltip. formatEntityName returns the entity's default name when name is undefined,
    // so one call covers both the "name typed" and "no name" cases.
    const title = stateObj
      ? (this._hass?.formatEntityName?.(stateObj, config.name) ?? nothing)
      : nothing;

    return html`
      <div class="chrome">
        <state-badge
          .hass=${this._hass}
          .stateObj=${stateObj}
          .overrideIcon=${config.icon}
          .color=${config.color ?? "state"}
          .overrideImage=${suppressPicture ? "" : undefined}
          title=${title}
        ></state-badge>
      </div>
    `;
  }

  /**
   * The host's own custom properties, written after render rather than during it.
   *
   * Split in two on purpose. The colour follows the **entity**, so it is rewritten
   * on every update this element allows. Everything else follows the **config**,
   * which does not move on a state change — and rewriting it anyway is what made
   * a floorplan call into HA's action-handler singleton once per item per tick.
   * `shouldUpdate` already turns most ticks away; this is what the ones that get
   * through cost.
   */
  protected updated(changed: PropertyValues): void {
    const config = this._config;
    if (!config) return;

    // The colour state-badge paints inside its own shadow root, computed a
    // second time on our side because nothing exposes it — and needed here only
    // to tint the hover veil. The default matches what render() hands the badge,
    // so the two never disagree.
    const stateObj = config.entity ? this._hass?.states?.[config.entity] : undefined;
    const itemColor = itemColorCss(stateObj, config.color ?? "state");
    if (itemColor) this.style.setProperty("--psc-item-color", itemColor);
    else this.style.removeProperty("--psc-item-color");

    if (!changed.has("_config")) return;

    this.style.setProperty("--psc-icon-size", elementSizeCss(config.size, DEFAULT_ICON_SIZE));

    // A chrome that is absent and a chrome whose theme is "none" are the same
    // thing — the record exists so numbers survive being switched off.
    const chrome = config.chrome;
    const on = !!chrome && chrome.theme !== "none";
    this.toggleAttribute("chrome", on);
    if (on && chrome) {
      this.style.setProperty("--psc-chrome-fill", chromeFill(chrome.theme));
      this.style.setProperty("--psc-chrome-radius", `${chrome.radius}%`);
      this.style.setProperty("--psc-chrome-opacity", `${chrome.opacity}`);
      this.style.setProperty("--psc-content-ratio", `${chrome.content_ratio}`);
    } else {
      for (const name of [
        "--psc-chrome-fill",
        "--psc-chrome-radius",
        "--psc-chrome-opacity",
        "--psc-content-ratio",
      ]) {
        this.style.removeProperty(name);
      }
    }

    this.toggleAttribute("halo", config.halo === true);

    // Absent tap_action means clickable (the default action is more-info).
    // Mirrors Home Assistant's own badge.hasAction getter exactly: the cursor
    // disappears only when all three actions are explicitly set to "none".
    const clickable =
      !config.tap_action ||
      hasAction(config.tap_action) ||
      hasAction(config.hold_action) ||
      hasAction(config.double_tap_action);
    this.toggleAttribute("clickable", clickable);

    const handler = actionHandler();
    if (handler?.bind) {
      // The handler can arrive after we have already degraded — its element is
      // injected by Home Assistant, and the first render can precede it. Take
      // the fallback back off before binding, or one tap dispatches twice: once
      // through the handler's pointer machinery, once through our click.
      if (this._clickFallback) {
        this.removeEventListener("click", this._clickFallback);
        this._clickFallback = undefined;
      }
      handler.bind(this, {
        hasHold: hasAction(config.hold_action),
        hasDoubleClick: hasAction(config.double_tap_action),
      });
      return;
    }
    // Honest degradation: without the handler we lose hold and double-tap, not
    // the card. Bound once, hence the field.
    if (this._clickFallback) return;
    this._clickFallback = (): void => {
      this.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    };
    this.addEventListener("click", this._clickFallback);
  }

  static styles = [
    chromeFillStyles,
    haloStyles("--psc-icon-size"),
    interactionStyles,
    css`
    :host {
      display: block;
      line-height: 0;
      /* Captured from the page, where the theme defines it, so it can be handed
         back to state-badge below — and so the hover veil has a colour to fall
         back on when the item names none. */
      --psc-inactive-color: var(--state-inactive-color);
    }
    /* The chrome. Always present, styled only when the config asks for it, so
       the DOM shape never depends on the config. */
    .chrome {
      position: relative;
      /* Explicit: a shadow root inherits no reset, so the default is
         content-box. Border-box keeps the outer box at exactly --psc-icon-size
         whatever is ever drawn on its edge, which is what leaves the drag
         bounds, the anchoring and the stored percentages alone. */
      box-sizing: border-box;
      width: var(--psc-icon-size);
      height: var(--psc-icon-size);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* The shape and the clipping belong to the chrome: an unshaped, unclipped
       wrapper is exactly what "no chrome" means. */
    :host([chrome]) .chrome {
      border-radius: var(--psc-chrome-radius, 50%);
      /* At content_ratio 1 the picture fills the box and this is what clips it
         to the chrome's own silhouette — the chrome becomes the picture's
         frame rather than a disc behind it. */
      overflow: hidden;
    }
    /* state-badge paints an entity picture as a background-image on its own
       host and the glyph as a child sized by --mdc-icon-size, so scaling the
       badge scales both — one declaration, no special case for pictures. */
    :host([chrome]) state-badge {
      --state-badge-border-radius: var(--psc-chrome-radius);
      --state-badge-with-image-border-radius: var(--psc-chrome-radius);
      --state-badge-with-media-image-border-radius: var(--psc-chrome-radius);
    }
    /* state-badge ships :host { width: 40px }, so the size has to drive the box
       as well as the glyph. One value, one visual footprint: a glyph and an
       entity picture occupy the same square. */
    state-badge {
      /* state-badge sets --state-inactive-color: initial on its own host, which
         sends inactive entities to the host's own color — var(--state-icon-color),
         the #44739e blue of entity rows. Handing the theme's value back turns an
         off entity grey, which is what a Lovelace badge shows. An outer-tree rule
         beats a :host declaration, so this wins.
         Scope: only resolutions that pass through this token, i.e. inactive
         states. Active colours, a lit lamp's rgb_color and its brightness filter
         travel through other tokens and are untouched. */
      --state-inactive-color: var(--psc-inactive-color);
      width: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
      height: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
      --mdc-icon-size: calc(var(--psc-icon-size) * var(--psc-content-ratio, 1));
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
  ];
}
