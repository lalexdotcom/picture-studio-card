import { css, html, LitElement, nothing } from "lit";
import type { StateIconConfig } from "../config";
import { iconSizeCss } from "../element-size";
import type { ActionConfig, HomeAssistant } from "../types";

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
  };

  // No accessibility modifier — just declare, matching the rest of the codebase.
  declare _config?: StateIconConfig;
  private _hass?: HomeAssistant;
  private _clickFallback = false;

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
    this._hass = hass;
    // Unlike the card, this element renders from hass on every tick: the state
    // object it hands to state-badge is what makes the icon follow the entity.
    this.requestUpdate("_config");
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
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
      <state-badge
        .hass=${this._hass}
        .stateObj=${stateObj}
        .overrideIcon=${config.icon}
        .color=${config.color ?? "state"}
        .overrideImage=${suppressPicture ? "" : undefined}
        title=${title}
      ></state-badge>
    `;
  }

  /** The host's own custom property, written after render rather than during it. */
  protected updated(): void {
    const config = this._config;
    if (!config) return;
    this.style.setProperty("--psc-icon-size", iconSizeCss(config.size));

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
      handler.bind(this, {
        hasHold: hasAction(config.hold_action),
        hasDoubleClick: hasAction(config.double_tap_action),
      });
      return;
    }
    // Honest degradation: without the handler we lose hold and double-tap, not
    // the card. Bound once, hence the flag.
    if (this._clickFallback) return;
    this._clickFallback = true;
    this.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    });
  }

  static styles = css`
    :host {
      display: block;
      line-height: 0;
      /* Captured from the page, where the theme defines it, so it can be handed
         back to state-badge below. A custom theme keeps deciding the value. */
      --psc-inactive-color: var(--state-inactive-color);
      /* Long enough to read as motion: at 90ms the grow registered as a flicker
         rather than an animation. */
      transition: transform 180ms ease-out;
    }
    /* Pointer when there is something to click. */
    :host([clickable]) {
      cursor: pointer;
    }
    /* Subtle grow on hover: scale goes on the host — the card's wrapper carries
       translate(…) and must not be touched; 50% 50% is the default
       transform-origin, so the icon scales from its own centre regardless of
       the item's anchor. No guard for edit mode needed: the card already sets
       .editing .item > * { pointer-events: none }, so hover never reaches
       this host while a drag is running. */
    :host([clickable]:hover) {
      transform: scale(1.04);
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
      width: var(--psc-icon-size);
      height: var(--psc-icon-size);
      --mdc-icon-size: var(--psc-icon-size);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;
}
