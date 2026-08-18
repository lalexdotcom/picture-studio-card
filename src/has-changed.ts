import type { HomeAssistant } from "./types";

/**
 * Whether anything an element renders from has changed since the last update.
 *
 * Home Assistant republishes `hass` on **every state change of any entity in the
 * house**, and the card hands each publication to every item. Without this, a
 * floorplan holding a dozen items re-renders a dozen elements every time a
 * doorbell sensor twitches, and each of those re-renders rewrites size tokens,
 * chrome tokens, three attributes and a call into HA's `action-handler`
 * singleton — for a configuration that did not move.
 *
 * `2026-08-13-per-tick-work-design.md` made that argument for the *card* and
 * taught it to read `changedProperties`. This is the same correction for the
 * elements, which never got it.
 *
 * THIS IS A COPY OF NON-EXPORTED HOME ASSISTANT CODE, reconciled against build
 * **20260729.6**: `hasConfigChanged` and `hasConfigOrEntityChanged` in
 * `src/panels/lovelace/common/has-changed.ts`, the helper every core card uses
 * for exactly this. Two deliberate differences:
 *
 * - `formatEntityName` is compared as well. HA's helper predates it; our label
 *   renders through it, so a change there has to reach us.
 * - The attribute formatters are not compared: nothing of ours calls them.
 *
 * The list is the whole point, and it errs toward re-rendering: every entry is
 * something the entity's own state object does *not* carry, and forgetting one
 * means a label that keeps the old language, the old unit or the old precision
 * until its entity happens to change. A false positive costs a render; a false
 * negative shows stale text.
 */
export const hassRenderChanged = (
  oldHass: HomeAssistant | undefined,
  newHass: HomeAssistant | undefined,
  entityId: string | undefined,
): boolean => {
  // Nothing to compare against: the first publication always renders.
  if (!oldHass || !newHass) return true;

  if (
    oldHass.connected !== newHass.connected ||
    oldHass.themes !== newHass.themes ||
    oldHass.locale !== newHass.locale ||
    oldHass.localize !== newHass.localize ||
    oldHass.formatEntityState !== newHass.formatEntityState ||
    oldHass.formatEntityName !== newHass.formatEntityName ||
    (oldHass.config as { state?: string } | undefined)?.state !==
      (newHass.config as { state?: string } | undefined)?.state
  ) {
    return true;
  }

  // An element with no entity has nothing left that could have changed.
  if (!entityId) return false;

  // HA replaces a state object only when that entity changes, so identity is
  // the comparison — never a field-by-field read.
  if (oldHass.states?.[entityId] !== newHass.states?.[entityId]) return true;

  // Display precision lives in the entity registry, not in the state object, and
  // it changes what a sensor's state reads as.
  const entities = (h: HomeAssistant) =>
    (h.entities as Record<string, { display_precision?: number }> | undefined)?.[entityId];
  return entities(oldHass)?.display_precision !== entities(newHass)?.display_precision;
};
