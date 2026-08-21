import { CUSTOM_PREFIX, isSupportedBadgeType } from "./badge-catalog";

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
/** Callbacks queued while a probe is in flight. Cleared when the type settles. */
const WAITERS = new Map<string, (() => void)[]>();

/** Home Assistant's own figure: it hides its error badge for exactly this long,
    so the list and the card beside it complain at the same moment. */
const GRACE_MS = 2000;

export const badgeVerdict = (type: string): BadgeVerdict => VERDICTS.get(type) ?? "unknown";

const settle = (type: string, verdict: BadgeVerdict): void => {
  VERDICTS.set(type, verdict);
  const waiters = WAITERS.get(type);
  WAITERS.delete(type);
  if (waiters) for (const w of waiters) w();
};

export const probeBadgeType = (type: string, onSettled: () => void): void => {
  // Already settled: caller reads the verdict from `badgeVerdict` synchronously.
  // No callback needed — the value is there right now.
  if (VERDICTS.has(type)) return;

  // Accumulate the waiter whether or not a probe is already running.
  // This is the fix for a second list instance (editor closed and reopened
  // while a probe is in flight): its `requestUpdate` is registered here
  // rather than dropped by the early return that the old code had.
  WAITERS.set(type, [...(WAITERS.get(type) ?? []), onSettled]);

  // Probe already in flight — waiter registered above, nothing else to do.
  // Still exactly one probe per type: no second createBadgeElement call,
  // no second grace timer.
  if (TIMERS.has(type)) return;

  if (type.startsWith(CUSTOM_PREFIX)) {
    const tag = type.slice(CUSTOM_PREFIX.length);
    if (customElements.get(tag)) {
      settle(type, "ok");
      return;
    }
    // A tag with no dash can never be a custom element, which is why Home
    // Assistant returns its error immediately there. It catches the commonest
    // typo with no wait at all.
    if (!tag.includes("-")) {
      settle(type, "missing");
      return;
    }
    // Optimistic until the grace elapses: an error shown on a valid config while
    // its resource loads is the one flicker this design forbids.
    TIMERS.set(
      type,
      setTimeout(() => {
        TIMERS.delete(type);
        settle(type, "missing");
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
      settle(type, "ok");
    });
    return;
  }

  // Native. The verdict comes from Home Assistant's own factory, so with no
  // factory there is no verdict — and "no verdict" is the right answer, not
  // "missing". Leaving the type unsettled means the row shows its type plainly
  // instead of being accused of being broken, and a later probe can still
  // settle it once the frontend is there.
  //
  // The guard matters because of *where* this runs: a probe is kicked off from
  // a component update, so throwing here does not fail a probe, it fails a
  // render — and one row's unknowable verdict would take the list down with it.
  if (typeof window.loadCardHelpers !== "function") return;

  // One async hop per session — loadCardHelpers — and every probe after it is
  // synchronous. A placeholder keeps a second row from probing meanwhile.
  TIMERS.set(
    type,
    setTimeout(() => undefined, 0),
  );
  void window.loadCardHelpers().then((helpers) => {
    TIMERS.delete(type);
    const el = helpers.createBadgeElement({ type } as never) as HTMLElement;
    settle(type, el.tagName.toLowerCase() === "hui-error-badge" ? "missing" : "ok");
  });
};

/** Test seam. Nothing in the card or the editor calls this. */
export const resetBadgeVerdicts = (): void => {
  for (const timer of TIMERS.values()) clearTimeout(timer);
  TIMERS.clear();
  VERDICTS.clear();
  WAITERS.clear();
};

/**
 * The one answer to "is this badge type broken", for every consumer: the item
 * list's rows, the severity classifier, the editor's decision to open a form,
 * and the card's decision to draw an error badge instead.
 *
 * It exists because there were three copies of this boolean and a change to the
 * rule reached only two of them, so a refused type still opened its form.
 */
export const badgeIsBroken = (type: string): boolean =>
  !isSupportedBadgeType(type) || badgeVerdict(type) === "missing";

/**
 * Why a badge type is refused, or undefined when it is fine or the probe is
 * still pending.
 *
 * For a non-custom type outside CORE_BADGES the probe determines the word —
 * whether Home Assistant can build it (verdict "ok" → "unsupported") or not
 * (verdict "missing" → "unknown"). This is better than a duplicated registry:
 * a static list drifts silently the day Home Assistant adds a type, whereas
 * the probe is the truth at the moment it is asked.
 *
 * While the verdict has not yet landed (verdict "unknown"), returns undefined
 * so the row shows no category word rather than one it might have to retract.
 * In practice this window is one microtask — loadCardHelpers resolves from the
 * module cache after its first use — not a state users perceive.
 *
 * "unsupported" and "unknown" are for wording only, never for a verdict.
 * `badgeIsBroken` answers the "is this broken?" question, always statically
 * and immediately for non-custom types.
 */
export const badgeTypeProblem = (type: string): "unsupported" | "unknown" | undefined => {
  if (isSupportedBadgeType(type)) {
    // For custom: types the probe determines whether the resource is present.
    // Once the verdict is "missing" the row is broken and the word is "unknown".
    // An "ok" verdict (resource loaded) or "unknown" (probe in flight) produces
    // no problem word.
    if (type.startsWith(CUSTOM_PREFIX))
      return badgeVerdict(type) === "missing" ? "unknown" : undefined;
    // CORE_BADGES: fully supported, no problem.
    return undefined;
  }
  // Non-custom, non-CORE_BADGES: the probe determines the word — whether Home
  // Assistant can build the type ("ok" → "unsupported") or not ("missing" →
  // "unknown"). This is better than a duplicated registry: a static list drifts
  // silently the day Home Assistant adds a type, whereas the probe is the truth
  // at the moment it is asked. While the verdict is still pending, no word yet.
  const verdict = badgeVerdict(type);
  if (verdict === "ok") return "unsupported";
  if (verdict === "missing") return "unknown";
  return undefined; // probe pending (one microtask on first probe)
};
