import { describe, expect, it } from "@rstest/core";
import { itemColorCss, stateActive, stateColorBrightness, stateColorCss } from "../../state-color";
import type { HassEntity } from "../../types";

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

  // The remaining domain branches, one test each. This function is a verbatim
  // copy of `stateActive` in home-assistant/frontend, which no custom card can
  // import — so a slip while transcribing it is permanent and silent, and shows
  // up only as an item painted with the wrong colour token. Each case pins the
  // sentinel that is inactive *and* a state that is active, because a branch
  // that always returned the same answer would satisfy either half alone.

  it("alarm_control_panel: only disarmed is inactive", () => {
    expect(stateActive(entity("alarm_control_panel.a", "disarmed"))).toBe(false);
    expect(stateActive(entity("alarm_control_panel.a", "armed_home"))).toBe(true);
    expect(stateActive(entity("alarm_control_panel.a", "triggered"))).toBe(true);
  });

  it("media_player: standby is inactive, playing and paused are not", () => {
    expect(stateActive(entity("media_player.a", "standby"))).toBe(false);
    expect(stateActive(entity("media_player.a", "playing"))).toBe(true);
    expect(stateActive(entity("media_player.a", "paused"))).toBe(true);
  });

  it("lawn_mower: docked and paused are inactive", () => {
    expect(stateActive(entity("lawn_mower.a", "docked"))).toBe(false);
    expect(stateActive(entity("lawn_mower.a", "paused"))).toBe(false);
    expect(stateActive(entity("lawn_mower.a", "mowing"))).toBe(true);
    expect(stateActive(entity("lawn_mower.a", "error"))).toBe(true);
  });

  it("vacuum: idle, docked and paused are inactive", () => {
    expect(stateActive(entity("vacuum.a", "idle"))).toBe(false);
    expect(stateActive(entity("vacuum.a", "docked"))).toBe(false);
    expect(stateActive(entity("vacuum.a", "paused"))).toBe(false);
    expect(stateActive(entity("vacuum.a", "cleaning"))).toBe(true);
    expect(stateActive(entity("vacuum.a", "returning"))).toBe(true);
  });

  it("valve: closed is inactive, like a cover", () => {
    expect(stateActive(entity("valve.a", "closed"))).toBe(false);
    expect(stateActive(entity("valve.a", "open"))).toBe(true);
    expect(stateActive(entity("valve.a", "opening"))).toBe(true);
  });

  it("plant: the branch is inverted — only `problem` is active", () => {
    // Every other domain names what is *in*active. A healthy plant is the
    // uninteresting state, so here the rule reads the other way round.
    expect(stateActive(entity("plant.a", "problem"))).toBe(true);
    expect(stateActive(entity("plant.a", "ok"))).toBe(false);
  });

  it("timer: only `active` is active — idle and paused are not", () => {
    expect(stateActive(entity("timer.a", "active"))).toBe(true);
    expect(stateActive(entity("timer.a", "idle"))).toBe(false);
    expect(stateActive(entity("timer.a", "paused"))).toBe(false);
  });

  it("camera: only `streaming` is active — recording is not", () => {
    expect(stateActive(entity("camera.a", "streaming"))).toBe(true);
    expect(stateActive(entity("camera.a", "recording"))).toBe(false);
    expect(stateActive(entity("camera.a", "idle"))).toBe(false);
  });

  it("group: an allow-list of five states, not a deny-list", () => {
    for (const state of ["on", "home", "open", "locked", "problem"]) {
      expect(stateActive(entity("group.a", state))).toBe(true);
    }
    expect(stateActive(entity("group.a", "closed"))).toBe(false);
    expect(stateActive(entity("group.a", "not_home"))).toBe(false);
    expect(stateActive(entity("group.a", "unlocked"))).toBe(false);
  });

  it("device_tracker follows person: not_home is the inactive one", () => {
    expect(stateActive(entity("device_tracker.a", "not_home"))).toBe(false);
    expect(stateActive(entity("device_tracker.a", "home"))).toBe(true);
    expect(stateActive(entity("device_tracker.a", "work"))).toBe(true);
  });

  it("a domain with no case of its own is active unless off, unknown or unavailable", () => {
    expect(stateActive(entity("sensor.a", "23.4"))).toBe(true);
    expect(stateActive(entity("switch.a", "on"))).toBe(true);
    expect(stateActive(entity("switch.a", "off"))).toBe(false);
  });

  it("`off` is decided before the switch, so it beats a case that would say active", () => {
    // The guard runs above the switch: a domain whose case would return true
    // for some other state still reads `off` as inactive. Alert is the single
    // exception, and it is asserted in the first test of this block.
    expect(stateActive(entity("plant.a", "off"))).toBe(false);
    expect(stateActive(entity("timer.a", "off"))).toBe(false);
    expect(stateActive(entity("camera.a", "off"))).toBe(false);
    expect(stateActive(entity("lawn_mower.a", "off"))).toBe(false);
  });

  it("unavailable and unknown beat every domain rule", () => {
    for (const domain of ["alarm_control_panel", "plant", "group", "camera", "cover"]) {
      expect(stateActive(entity(`${domain}.a`, "unavailable"))).toBe(false);
      expect(stateActive(entity(`${domain}.a`, "unknown"))).toBe(false);
    }
  });

  it("an explicit state argument is read instead of the entity's own", () => {
    // The card passes a state it has already resolved; the entity object is
    // still needed for its domain.
    const closed = entity("cover.a", "closed");
    expect(stateActive(closed)).toBe(false);
    expect(stateActive(closed, "open")).toBe(true);
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
