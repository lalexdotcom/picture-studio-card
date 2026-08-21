import { afterEach, describe, expect, it } from "@rstest/core";
import { hasAction, isClickable } from "../../../card/item-actions";
import { PictureStudioStateIcon } from "../../../card/state-icon-element";
import { PictureStudioStateLabel } from "../../../card/state-label-element";
import { ICON_TAG, LABEL_TAG } from "../../../config";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "../../../element-size";

if (!customElements.get(ICON_TAG)) customElements.define(ICON_TAG, PictureStudioStateIcon);
if (!customElements.get(LABEL_TAG)) customElements.define(LABEL_TAG, PictureStudioStateLabel);

/**
 * A stand-in for the element Home Assistant injects. `bind` is what the card
 * tests for, so an instance without one is exactly the not-ready state seen on a
 * cold dashboard — HA injects it itself, and our first render can beat it there.
 */
class FakeActionHandler extends HTMLElement {}
if (!customElements.get("action-handler")) {
  customElements.define("action-handler", FakeActionHandler);
}

const placeHandler = (): FakeActionHandler => {
  const handler = document.createElement("action-handler") as FakeActionHandler;
  Object.defineProperty(handler, "bind", { value: undefined, configurable: true });
  document.body.append(handler);
  return handler;
};

/** Stands in for the real gesture machinery: one tap, one action, bound once. */
const wireHandler = (handler: FakeActionHandler): void => {
  const bound = new WeakSet<HTMLElement>();
  Object.defineProperty(handler, "bind", {
    configurable: true,
    value: (element: HTMLElement) => {
      if (bound.has(element)) return;
      bound.add(element);
      element.addEventListener("click", () => {
        element.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
      });
    },
  });
};

/**
 * The two kinds, each with the shape its own `setConfig` demands.
 *
 * The point of the table is that everything below runs against **both**. The
 * relay is one module now, but it was two copies until 2026-08-21 and a
 * double-dispatch bug had to be fixed in each — a test that covered only the icon
 * would have let the label regress alone, which is exactly what happened.
 */
const KINDS = [
  {
    name: "state-icon",
    tag: ICON_TAG,
    config: (extra: Record<string, unknown>) => ({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      entity: "light.a",
      ...extra,
    }),
  },
  {
    name: "state-label",
    tag: LABEL_TAG,
    config: (extra: Record<string, unknown>) => ({
      type: "state-label",
      size: DEFAULT_LABEL_SIZE,
      show: ["state"],
      entity: "light.a",
      ...extra,
    }),
  },
] as const;

const mount = async (
  kind: (typeof KINDS)[number],
  extra: Record<string, unknown> = {},
): Promise<HTMLElement & { updateComplete: Promise<unknown> }> => {
  const el = document.createElement(kind.tag) as HTMLElement & {
    setConfig: (c: unknown) => void;
    hass: unknown;
    updateComplete: Promise<unknown>;
  };
  el.setConfig(kind.config(extra));
  el.hass = {
    states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } },
    formatEntityName: () => "A",
    formatEntityState: () => "on",
  };
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("hasAction", () => {
  it("says no only to an absent action and to an explicit none", () => {
    expect(hasAction(undefined)).toBe(false);
    expect(hasAction({ action: "none" })).toBe(false);
    expect(hasAction({ action: "toggle" })).toBe(true);
  });

  it("reads an unreadable action as an action, and leaves the verdict to HA", () => {
    // Deliberate — see the note on hasAction. A stricter test here would make
    // such an item non-clickable, further from the intent than the status quo.
    expect(hasAction([] as never)).toBe(true);
    expect(hasAction("toggle" as never)).toBe(true);
  });
});

describe("isClickable", () => {
  it("is true when nothing is set, because HA's default is more-info", () => {
    expect(isClickable({})).toBe(true);
  });

  it("is false only when all three are explicitly none", () => {
    const none = { action: "none" };
    expect(isClickable({ tap_action: none })).toBe(false);
    expect(isClickable({ tap_action: none, hold_action: { action: "toggle" } })).toBe(true);
    expect(isClickable({ tap_action: none, double_tap_action: { action: "toggle" } })).toBe(true);
  });
});

for (const kind of KINDS) {
  describe(`the action relay, on ${kind.name}`, () => {
    it("marks the item clickable when no action is configured", async () => {
      expect((await mount(kind)).hasAttribute("clickable")).toBe(true);
    });

    it("drops the clickable mark when every action is none", async () => {
      const el = await mount(kind, {
        tap_action: { action: "none" },
        hold_action: { action: "none" },
        double_tap_action: { action: "none" },
      });
      expect(el.hasAttribute("clickable")).toBe(false);
    });

    it("relays an action event as hass-action carrying the item's config", async () => {
      const el = await mount(kind, { tap_action: { action: "toggle" } });
      const seen: CustomEvent[] = [];
      document.body.addEventListener("hass-action", (ev) => seen.push(ev as CustomEvent));

      el.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));

      expect(seen).toHaveLength(1);
      expect(seen[0]?.detail?.action).toBe("tap");
    });

    it("answers a tap while degraded, so a cold dashboard is not inert", async () => {
      placeHandler();
      const el = await mount(kind, { tap_action: { action: "toggle" } });

      const seen: CustomEvent[] = [];
      document.body.addEventListener("hass-action", (ev) => seen.push(ev as CustomEvent));
      el.click();

      expect(seen).toHaveLength(1);
    });

    it("answers a tap exactly once after the real handler arrives", async () => {
      const handler = placeHandler();
      const el = await mount(kind, { tap_action: { action: "toggle" } });

      // The handler is wired up, and the next render is what notices.
      wireHandler(handler);
      (el as unknown as { setConfig: (c: unknown) => void }).setConfig(
        kind.config({ tap_action: { action: "toggle" } }),
      );
      await el.updateComplete;

      const seen: CustomEvent[] = [];
      document.body.addEventListener("hass-action", (ev) => seen.push(ev as CustomEvent));
      el.click();

      // Two would mean the degraded listener stayed on beside the handler, and
      // the user's tap_action ran twice on one tap.
      expect(seen).toHaveLength(1);
    });
  });
}
