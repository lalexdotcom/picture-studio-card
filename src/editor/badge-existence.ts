import { CUSTOM_PREFIX } from "./badge-catalog";

/**
 * Does this Home Assistant know this badge type?
 *
 * The card never asks: Home Assistant already renders its own error badge for a
 * type it cannot build, and that badge names the type. The editor's list asks,
 * because there a typo (`entty`) and a native type outside our catalogue
 * (`state-label`, `entity-filter`, the three energy totals) render identically —
 * `mdi:label` over a raw string — and only one of the two is a mistake.
 *
 * The badge's own config is never given to the probe: it is asked with a bare
 * `{ type }`, so the answer is per type and cacheable per type, and the payload
 * stays as opaque as it has always been.
 */
export type BadgeVerdict = "unknown" | "ok" | "missing";

/**
 * Module level, not per instance: "does this build know this type" has one
 * answer for the whole session, and a per-instance cache would ask again on
 * every dialog open. A native entry is frozen once settled. A custom entry can
 * still move from `missing` back to `ok` — its resource may load at any moment.
 */
const VERDICTS = new Map<string, BadgeVerdict>();
const TIMERS = new Map<string, ReturnType<typeof setTimeout>>();

/** Home Assistant's own figure: it hides its error badge for exactly this long,
    so the list and the card beside it complain at the same moment. */
const GRACE_MS = 2000;

export const badgeVerdict = (type: string): BadgeVerdict => VERDICTS.get(type) ?? "unknown";

const settle = (type: string, verdict: BadgeVerdict, onSettled: () => void): void => {
  if (VERDICTS.get(type) === verdict) return;
  VERDICTS.set(type, verdict);
  onSettled();
};

export const probeBadgeType = (type: string, onSettled: () => void): void => {
  if (VERDICTS.has(type) || TIMERS.has(type)) return;

  if (type.startsWith(CUSTOM_PREFIX)) {
    const tag = type.slice(CUSTOM_PREFIX.length);
    if (customElements.get(tag)) {
      settle(type, "ok", onSettled);
      return;
    }
    // A tag with no dash can never be a custom element, which is why Home
    // Assistant returns its error immediately there. It catches the commonest
    // typo with no wait at all.
    if (!tag.includes("-")) {
      settle(type, "missing", onSettled);
      return;
    }
    // Optimistic until the grace elapses: an error shown on a valid config while
    // its resource loads is the one flicker this design forbids.
    TIMERS.set(
      type,
      setTimeout(() => {
        TIMERS.delete(type);
        settle(type, "missing", onSettled);
      }, GRACE_MS),
    );
    // No polling and no retry count: this resolves exactly when the element
    // arrives, and never lies about a resource that loads at t+5s.
    void customElements.whenDefined(tag).then(() => {
      const timer = TIMERS.get(type);
      if (timer !== undefined) {
        clearTimeout(timer);
        TIMERS.delete(type);
      }
      settle(type, "ok", onSettled);
    });
    return;
  }

  // Native. One async hop per session — loadCardHelpers — and every probe after
  // it is synchronous. A placeholder keeps a second row from probing meanwhile.
  TIMERS.set(
    type,
    setTimeout(() => undefined, 0),
  );
  void window.loadCardHelpers().then((helpers) => {
    TIMERS.delete(type);
    const el = helpers.createBadgeElement({ type } as never) as HTMLElement;
    settle(type, el.tagName.toLowerCase() === "hui-error-badge" ? "missing" : "ok", onSettled);
  });
};

/** Test seam. Nothing in the card or the editor calls this. */
export const resetBadgeVerdicts = (): void => {
  for (const timer of TIMERS.values()) clearTimeout(timer);
  TIMERS.clear();
  VERDICTS.clear();
};
