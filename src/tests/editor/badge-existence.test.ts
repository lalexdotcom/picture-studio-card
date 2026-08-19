import { afterEach, beforeEach, describe, expect, it, rstest } from "@rstest/core";
import { badgeVerdict, probeBadgeType, resetBadgeVerdicts } from "../../editor/badge-existence";

const helpers = {
  createBadgeElement: (c: { type?: string }) =>
    document.createElement(
      c.type === "entity" || c.type === "shortcut" ? `hui-${c.type}-badge` : "hui-error-badge",
    ),
};

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
