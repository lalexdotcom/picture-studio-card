/**
 * Every badge type Home Assistant's registry can build: the two eager ones plus
 * the six lazy ones, read out of `frontend_latest/14887.*.js` at build
 * 20260729.6. Deliberately wider than our own `CORE_BADGES`, which mirrors the
 * picker's list — "renders but is not in our catalogue" is a real state and the
 * tests need to reach it.
 */
const HA_NATIVE_BADGE_TYPES = new Set([
  "error",
  "entity",
  "entity-filter",
  "shortcut",
  "state-label",
  "power-total",
  "gas-total",
  "water-total",
]);

/**
 * A `loadCardHelpers` stub that answers the way Home Assistant does: a real badge
 * element for a type its registry knows, `hui-error-badge` for anything else.
 * That returned tag is the only synchronous existence signal a custom card gets,
 * and it is what `badge-existence.ts` reads.
 *
 * A factory, not a shared object: callers spy on `createBadgeElement`, and a
 * single instance would carry one file's spy into the next.
 */
export const makeNativeBadgeHelpers = () => ({
  createBadgeElement: (c: { type?: string }) =>
    document.createElement(
      HA_NATIVE_BADGE_TYPES.has(c.type ?? "") ? `hui-${c.type}-badge` : "hui-error-badge",
    ),
});
