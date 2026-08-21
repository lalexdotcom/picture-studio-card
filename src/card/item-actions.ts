import type { ActionConfig, ElementActions } from "../types";

/**
 * The action relay both element kinds share, in one place.
 *
 * It was written twice — `actionHandler`, the `clickable` rule and the whole
 * bind-or-degrade dance existed verbatim in `state-icon-element.ts` and
 * `state-label-element.ts`, with `hasAction` exported from the first and
 * imported by the second. A double-dispatch bug found on 2026-08-21 had to be
 * fixed in both copies, which is the usual way this kind of duplication
 * announces itself.
 *
 * Nothing here knows what an item draws. That is the whole reason the two kinds
 * can share it: an icon and a label differ in their content, never in how a tap
 * reaches Home Assistant.
 */

/**
 * Whether an action is set and asks for something to happen.
 *
 * Only `undefined` and an explicit `none` say no. A value that is neither — a
 * `tap_action: []` or a bare string from a hand-written YAML — reads as an
 * action here, and that is deliberate: the item stays clickable, and Home
 * Assistant's own `handleAction` decides what an unreadable action does, the
 * same way it decides what an unreadable entity displays.
 *
 * Tightening this was considered on 2026-08-21 and rejected. An empty array is
 * truthy, so the `!config.tap_action` escape in `isClickable` does not fire for
 * one; a stricter test here would flip such an item from "clickable, HA decides"
 * to "not clickable at all", which is further from the documented intent that an
 * action nobody could read falls back to more-info.
 */
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
 * The degraded tap listener currently bound to an element, if any.
 *
 * Module-level and keyed by element so neither component carries a field for it:
 * it is the relay's own bookkeeping, and an element that goes away takes its
 * entry with it.
 */
const FALLBACKS = new WeakMap<HTMLElement, () => void>();

/**
 * Whether the item should look and behave as something you can press.
 *
 * Absent `tap_action` means clickable: Home Assistant's default action is
 * more-info. The cursor disappears only when all three actions are explicitly
 * set to "none" — the same rule HA's own `badge.hasAction` getter applies.
 */
export const isClickable = (config: ElementActions): boolean =>
  !config.tap_action ||
  hasAction(config.tap_action) ||
  hasAction(config.hold_action) ||
  hasAction(config.double_tap_action);

/**
 * Hand the element's gestures to Home Assistant, or degrade to a plain click.
 *
 * Call it from `updated()`. Safe to call on every update: binding is idempotent
 * and the fallback is attached at most once.
 *
 * **The two paths must never both be live.** HA injects the action-handler
 * element itself and the first render can beat it there, so an element can
 * degrade and then meet the real handler on a later update. Without taking the
 * fallback back off at that moment, one tap dispatches twice — once through the
 * handler's pointer machinery, once through our click — and the user's
 * `tap_action` runs twice.
 */
export const bindActions = (element: HTMLElement, config: ElementActions): void => {
  const handler = actionHandler();
  if (handler?.bind) {
    const fallback = FALLBACKS.get(element);
    if (fallback) {
      element.removeEventListener("click", fallback);
      FALLBACKS.delete(element);
    }
    handler.bind(element, {
      hasHold: hasAction(config.hold_action),
      hasDoubleClick: hasAction(config.double_tap_action),
    });
    return;
  }
  // Honest degradation: without the handler we lose hold and double-tap, not the
  // card. Bound once, hence the map.
  if (FALLBACKS.has(element)) return;
  const fallback = (): void => {
    element.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
  };
  FALLBACKS.set(element, fallback);
  element.addEventListener("click", fallback);
};

/**
 * Re-emit an `action` event as the `hass-action` Home Assistant listens for.
 *
 * Call it from the constructor, with a getter rather than a config: the element
 * has none yet at that point, and the one in hand when the tap happens is the
 * one that must travel.
 *
 * `hass-action` is what the root `<home-assistant>` hands to HA's own
 * `handleAction` — more-info, toggle, navigate, url, perform-action, with the
 * confirmation dialogs. Nothing in the frontend fires it; it exists for
 * third-party cards, which is what we are.
 */
export const relayActions = (
  element: HTMLElement,
  currentConfig: () => ElementActions | undefined,
): void => {
  element.addEventListener("action", (ev: Event) => {
    const action = (ev as CustomEvent<{ action?: string }>).detail?.action;
    const config = currentConfig();
    if (!action || !config) return;
    element.dispatchEvent(
      new CustomEvent("hass-action", {
        detail: { config, action },
        bubbles: true,
        composed: true,
      }),
    );
  });
};
