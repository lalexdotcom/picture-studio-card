import { afterEach, beforeEach, describe, expect, it, rstest } from "@rstest/core";
import {
  badgeIsBroken,
  badgeTypeProblem,
  badgeVerdict,
  probeBadgeType,
  resetBadgeVerdicts,
} from "../../../editor/badge-existence";
import { makeNativeBadgeHelpers } from "./harness";

// Answers like HA's badge registry, so the probe settles correctly for both
// existing and non-existing types.
const helpers = makeNativeBadgeHelpers();

beforeEach(() => {
  resetBadgeVerdicts();
  (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers = async () =>
    helpers;
});
afterEach(() => resetBadgeVerdicts());

describe("native types", () => {
  it("starts unknown so the first paint is optimistic", () => {
    expect(badgeVerdict("entty")).toBe("unknown");
  });

  it("settles a real type to ok", async () => {
    const settled = new Promise<void>((r) => probeBadgeType("entity", r));
    await settled;
    expect(badgeVerdict("entity")).toBe("ok");
  });

  it("settles a type the frontend does not know to missing", async () => {
    const settled = new Promise<void>((r) => probeBadgeType("entty", r));
    await settled;
    expect(badgeVerdict("entty")).toBe("missing");
  });

  it("probes a type once however many rows ask", async () => {
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    await new Promise<void>((r) => probeBadgeType("entty", r));
    probeBadgeType("entty", () => {});
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("custom types", () => {
  it("is ok at once when the element is already defined", () => {
    customElements.define("already-here-badge", class extends HTMLElement {});
    probeBadgeType("custom:already-here-badge", () => {});
    expect(badgeVerdict("custom:already-here-badge")).toBe("ok");
  });

  it("is missing at once when the tag cannot be a custom element", () => {
    probeBadgeType("custom:nodash", () => {});
    expect(badgeVerdict("custom:nodash")).toBe("missing");
  });

  it("stays optimistic during the grace period, then turns missing", async () => {
    rstest.useFakeTimers();
    let settled = 0;
    probeBadgeType("custom:never-arrives", () => settled++);
    expect(badgeVerdict("custom:never-arrives")).toBe("unknown");
    rstest.advanceTimersByTime(1999);
    expect(badgeVerdict("custom:never-arrives")).toBe("unknown");
    rstest.advanceTimersByTime(1);
    expect(badgeVerdict("custom:never-arrives")).toBe("missing");
    expect(settled).toBe(1);
    rstest.useRealTimers();
  });

  it("recovers when the element arrives late, and cancels the timer", async () => {
    let settled = 0;
    probeBadgeType("custom:arrives-late", () => settled++);
    customElements.define("arrives-late", class extends HTMLElement {});
    await customElements.whenDefined("arrives-late");
    await Promise.resolve();
    expect(badgeVerdict("custom:arrives-late")).toBe("ok");
    expect(settled).toBe(1);
  });
});

describe("two callers for the same in-flight type", () => {
  it("both callbacks fire exactly once and the probe runs only once", async () => {
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    spy.mockClear(); // spyOn reuses the same wrapper across tests — reset counts
    let count1 = 0;
    let count2 = 0;
    const settled = new Promise<void>((r) =>
      probeBadgeType("entity", () => {
        count1++;
        r();
      }),
    );
    probeBadgeType("entity", () => {
      count2++;
    });
    await settled;
    expect(count1).toBe(1);
    expect(count2).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("badgeIsBroken", () => {
  // Failure text recorded against the defect (TEMP_DEFECT1, run against current code):
  // "expected 'expand' to be called 1 times, but got 0 times"
  // _formTarget() checked badgeVerdict === "missing" only; state-label is
  // statically refused and never probed, so its verdict stayed "unknown" and
  // the guard missed it. badgeIsBroken now consolidates both checks.
  it("is true for a native type outside CORE_BADGES without advancing timers or awaiting", () => {
    expect(badgeIsBroken("state-label")).toBe(true);
    expect(badgeIsBroken("power-total")).toBe(true);
  });

  it("is true for a non-existent type without advancing timers or awaiting", () => {
    expect(badgeIsBroken("entty")).toBe(true);
  });

  it("is false for a supported type before any probe", () => {
    expect(badgeIsBroken("entity")).toBe(false);
    expect(badgeIsBroken("shortcut")).toBe(false);
  });

  it("is false for a custom: type before its probe settles", () => {
    expect(badgeIsBroken("custom:never-arrived")).toBe(false);
  });

  it("is true for a custom: type once its probe settles to missing", async () => {
    // custom:nodash has no dash — probeBadgeType settles it synchronously.
    probeBadgeType("custom:nodash", () => {});
    expect(badgeIsBroken("custom:nodash")).toBe(true);
  });
});

describe("badgeTypeProblem", () => {
  it("is undefined for supported CORE_BADGES types", () => {
    expect(badgeTypeProblem("entity")).toBeUndefined();
    expect(badgeTypeProblem("shortcut")).toBeUndefined();
  });

  it("is undefined for any custom: type before its probe settles", () => {
    expect(badgeTypeProblem("custom:not-yet-defined")).toBeUndefined();
  });

  it("is undefined for a non-custom type before its probe settles", () => {
    // While the verdict is "unknown" (probe in flight), no category word yet —
    // better than retracting one a tick later.
    expect(badgeTypeProblem("state-label")).toBeUndefined();
    expect(badgeTypeProblem("entty")).toBeUndefined();
  });

  it("is 'unsupported' for a native type HA can build, once the probe settles", async () => {
    // state-label is in HA's registry but not in CORE_BADGES. The probe settles
    // to "ok" (HA can build it), so the word is "unsupported" — it exists, we
    // just do not offer it here.
    const settled = new Promise<void>((r) => probeBadgeType("state-label", r));
    await settled;
    expect(badgeTypeProblem("state-label")).toBe("unsupported");
    // Another native type HA offers but we do not:
    const settled2 = new Promise<void>((r) => probeBadgeType("power-total", r));
    await settled2;
    expect(badgeTypeProblem("power-total")).toBe("unsupported");
  });

  it("is 'unknown' for a type HA cannot build, once the probe settles", async () => {
    // entty names nothing — probe settles to "missing".
    const settled = new Promise<void>((r) => probeBadgeType("entty", r));
    await settled;
    expect(badgeTypeProblem("entty")).toBe("unknown");
  });

  it("is 'unknown' for a custom: type whose resource never loaded, once the probe settles", async () => {
    // custom:nodash has no dash — settles synchronously to missing.
    probeBadgeType("custom:nodash", () => {});
    expect(badgeTypeProblem("custom:nodash")).toBe("unknown");
  });
});
