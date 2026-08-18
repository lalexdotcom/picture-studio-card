import { describe, expect, it } from "@rstest/core";
import { hassRenderChanged } from "../has-changed";
import type { HomeAssistant } from "../types";

const state = (id: string, value: string) =>
  ({ entity_id: id, state: value, attributes: {} }) as never;

// Shared references on purpose: Home Assistant replaces the whole hass object on
// every tick while keeping these identical, and identity is exactly what the
// helper compares. Rebuilding them per call would make every tick look changed —
// which is the mistake this fixture exists to avoid making in the tests too.
const BASE = {
  entities: {},
  themes: { darkMode: false },
  locale: { language: "fr" },
  localize: () => "",
  formatEntityState: () => "",
  formatEntityName: () => "",
  connected: true,
  config: { state: "RUNNING" },
};
const STATES = { "light.a": state("light.a", "on"), "light.b": state("light.b", "off") };

const hass = (over: Record<string, unknown> = {}): HomeAssistant =>
  ({ ...BASE, states: STATES, ...over }) as unknown as HomeAssistant;

describe("hassRenderChanged", () => {
  it("renders when there is nothing to compare against", () => {
    expect(hassRenderChanged(undefined, hass(), "light.a")).toBe(true);
  });

  it("turns away a tick that moved another entity", () => {
    const before = hass();
    // What Home Assistant publishes when light.b changes: a new hass, the same
    // state object for light.a.
    const after = hass({
      states: { ...before.states, "light.b": state("light.b", "on") },
    });
    expect(hassRenderChanged(before, after, "light.a")).toBe(false);
  });

  it("renders when our own entity's state object is replaced", () => {
    const before = hass();
    const after = hass({ states: { ...before.states, "light.a": state("light.a", "off") } });
    expect(hassRenderChanged(before, after, "light.a")).toBe(true);
  });

  // Each of these changes what the element draws without touching the state
  // object, which is the entire reason the list exists.
  it("renders on anything the state object does not carry", () => {
    const before = hass();
    const cases: Record<string, unknown>[] = [
      { connected: false },
      { themes: { darkMode: true } },
      { locale: { language: "en" } },
      { localize: () => "x" },
      { formatEntityState: () => "x" },
      { formatEntityName: () => "x" },
      { config: { state: "STOPPED" } },
      { entities: { "light.a": { display_precision: 2 } } },
    ];
    for (const over of cases) {
      expect(hassRenderChanged(before, hass(over), "light.a")).toBe(true);
    }
  });

  it("stops at the shared fields when the element names no entity", () => {
    const before = hass();
    const moved = hass({ states: { ...before.states, "light.a": state("light.a", "off") } });
    expect(hassRenderChanged(before, moved, undefined)).toBe(false);
    expect(hassRenderChanged(before, hass({ connected: false }), undefined)).toBe(true);
  });
});
