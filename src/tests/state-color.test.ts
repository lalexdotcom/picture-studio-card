import { describe, expect, it } from "@rstest/core";
import { itemColorCss, stateActive, stateColorBrightness, stateColorCss } from "../state-color";
import type { HassEntity } from "../types";

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({ entity_id, state, attributes }) as unknown as HassEntity;

// Every expectation below is a literal. The chain is the contract with every
// theme in the ecosystem, so a test that rebuilt it from the same helper would
// pass while the contract broke.
describe("stateColorCss", () => {
  it("names the domain state, then the domain's active token, then the global one", () => {
    expect(stateColorCss(entity("light.a", "on"))).toBe(
      "var(--state-light-on-color, var(--state-light-active-color, var(--state-active-color)))",
    );
  });

  it("switches the whole chain to inactive when the entity is off", () => {
    expect(stateColorCss(entity("light.a", "off"))).toBe(
      "var(--state-light-off-color, var(--state-light-inactive-color, var(--state-inactive-color)))",
    );
  });

  it("puts the device class first, so a motion sensor beats a plain one", () => {
    expect(stateColorCss(entity("binary_sensor.a", "on", { device_class: "motion" }))).toBe(
      "var(--state-binary_sensor-motion-on-color, var(--state-binary_sensor-on-color, var(--state-binary_sensor-active-color, var(--state-active-color))))",
    );
  });

  it("answers the unavailable token alone, whatever the domain", () => {
    expect(stateColorCss(entity("light.a", "unavailable"))).toBe("var(--state-unavailable-color)");
  });

  it("names nothing for a domain Home Assistant does not colour", () => {
    expect(stateColorCss(entity("sensor.a", "21.5"))).toBeUndefined();
  });

  it("colours a battery by its level rather than by its state", () => {
    const battery = (level: string) =>
      stateColorCss(entity("sensor.a", level, { device_class: "battery" }));
    expect(battery("80")).toBe("var(--state-sensor-battery-high-color)");
    expect(battery("50")).toBe("var(--state-sensor-battery-medium-color)");
    expect(battery("10")).toBe("var(--state-sensor-battery-low-color)");
    // Not a number: falls back to the ordinary path, which sensor has none of.
    expect(battery("unknown")).toBeUndefined();
  });

  it("borrows the members' domain when a group agrees, and its own when it does not", () => {
    const lights = entity("group.a", "on", { entity_id: ["light.x", "light.y"] });
    expect(stateColorCss(lights)).toBe(
      "var(--state-light-on-color, var(--state-light-active-color, var(--state-active-color)))",
    );
    const mixed = entity("group.a", "on", { entity_id: ["light.x", "lock.y"] });
    expect(stateColorCss(mixed)).toBe(
      "var(--state-group-on-color, var(--state-group-active-color, var(--state-active-color)))",
    );
  });

  it("slugs a multi-word state into the token name", () => {
    expect(stateColorCss(entity("alarm_control_panel.a", "armed away"))).toContain(
      "--state-alarm_control_panel-armed_away-color",
    );
  });
});

describe("stateActive", () => {
  it("reads the domains whose inactive state is not `off`", () => {
    expect(stateActive(entity("cover.a", "closed"))).toBe(false);
    expect(stateActive(entity("cover.a", "open"))).toBe(true);
    expect(stateActive(entity("lock.a", "locked"))).toBe(false);
    expect(stateActive(entity("person.a", "not_home"))).toBe(false);
    expect(stateActive(entity("alert.a", "idle"))).toBe(false);
    // "off" is still active for an alert: it means acknowledged, not over.
    expect(stateActive(entity("alert.a", "off"))).toBe(true);
  });

  it("treats unknown as inactive and a timestamp domain as active until unavailable", () => {
    expect(stateActive(entity("light.a", "unknown"))).toBe(false);
    expect(stateActive(entity("button.a", "2026-08-18T10:00:00+00:00"))).toBe(true);
    expect(stateActive(entity("button.a", "unavailable"))).toBe(false);
  });
});

describe("stateColorBrightness", () => {
  it("dims a bulb by its own brightness, with a floor that keeps it visible", () => {
    expect(stateColorBrightness(entity("light.a", "on", { brightness: 255 }))).toBe(
      "brightness(100%)",
    );
    expect(stateColorBrightness(entity("light.a", "on", { brightness: 128 }))).toBe(
      "brightness(74.6%)",
    );
    expect(stateColorBrightness(entity("light.a", "on", { brightness: 1 }))).toBe(
      "brightness(49.2%)",
    );
  });

  it("leaves a plant alone: its brightness is light received, not emitted", () => {
    expect(stateColorBrightness(entity("plant.a", "ok", { brightness: 50 }))).toBe("");
  });

  it("answers nothing when the entity reports no brightness", () => {
    expect(stateColorBrightness(entity("light.a", "on"))).toBe("");
  });
});

describe("itemColorCss", () => {
  it("names nothing for `none`, for an absent colour and for an absent entity", () => {
    expect(itemColorCss(entity("light.a", "on"), "none")).toBeUndefined();
    expect(itemColorCss(entity("light.a", "on"), undefined)).toBeUndefined();
    expect(itemColorCss(undefined, "state")).toBeUndefined();
  });

  it("maps a palette name onto Home Assistant's own variable", () => {
    expect(itemColorCss(entity("light.a", "on"), "red")).toBe("var(--red-color)");
  });

  it("passes an unknown value through as plain CSS", () => {
    expect(itemColorCss(entity("light.a", "on"), "#abcdef")).toBe("#abcdef");
  });

  it("drops a named colour on an inactive entity, as the editor's helper promises", () => {
    expect(itemColorCss(entity("light.a", "off"), "red")).toBeUndefined();
  });

  it("shows a bulb's own colour rather than the domain token", () => {
    expect(itemColorCss(entity("light.a", "on", { rgb_color: [255, 0, 0] }), "state")).toBe(
      "rgb(255,0,0)",
    );
  });

  it("colours a thermostat by what it is doing, and nothing by an action it cannot map", () => {
    expect(itemColorCss(entity("climate.a", "heat", { hvac_action: "cooling" }), "state")).toBe(
      "var(--state-climate-cool-color, var(--state-climate-active-color, var(--state-active-color)))",
    );
    expect(
      itemColorCss(entity("climate.a", "heat", { hvac_action: "wat" }), "state"),
    ).toBeUndefined();
  });
});
