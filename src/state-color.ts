import type { HassEntity } from "./types";

/**
 * The colour an item takes from its entity — Home Assistant's own recipe,
 * rebuilt here.
 *
 * THIS IS A COPY OF NON-EXPORTED HOME ASSISTANT CODE, reconciled against build
 * **20260729.6**:
 *
 * - `src/common/entity/state_color.ts` — the token chain
 * - `src/common/entity/state_active.ts` — active vs inactive
 * - `src/common/entity/color/battery_color.ts` — the battery thresholds
 * - `src/data/group.ts` — `computeGroupDomain`
 * - `src/common/const.ts` — `TIMESTAMP_STATE_DOMAINS`
 * - `src/data/climate.ts` — `CLIMATE_HVAC_ACTION_TO_MODE`
 * - `src/components/entity/state-badge.ts` — how the pieces combine
 *
 * Copied because `window.loadCardHelpers()` exposes nine symbols, all dialogs
 * and element factories: no colour utility is reachable from a custom card.
 *
 * What makes the copy affordable is that **nothing here computes a colour**.
 * `stateColorCss` returns a chain of nested `var()` fallbacks and the theme
 * resolves it, so what we are duplicating is a token naming convention — the
 * one every published theme redefines, which is why it does not move lightly.
 * And it degrades rather than breaks: a domain Home Assistant adds and this
 * list misses falls through to `--state-active-color` / `--state-inactive-color`,
 * Home Assistant's own last resort. The colour goes less specific, never wrong.
 *
 * On a frontend bump, re-read the files above and reconcile.
 */

/** Domains Home Assistant colours by state. Anything else keeps the theme's own. */
const STATE_COLORED_DOMAIN = new Set([
  "alarm_control_panel",
  "alert",
  "automation",
  "binary_sensor",
  "calendar",
  "camera",
  "climate",
  "cover",
  "device_tracker",
  "fan",
  "group",
  "humidifier",
  "input_boolean",
  "lawn_mower",
  "light",
  "lock",
  "media_player",
  "person",
  "plant",
  "remote",
  "schedule",
  "script",
  "siren",
  "sun",
  "switch",
  "timer",
  "update",
  "vacuum",
  "valve",
  "water_heater",
  "weather",
]);

/** Domains whose state is a timestamp, so only availability decides "active". */
const TIMESTAMP_STATE_DOMAINS = new Set([
  "ai_task",
  "button",
  "conversation",
  "datetime",
  "event",
  "image",
  "infrared",
  "input_button",
  "notify",
  "radio_frequency",
  "scene",
  "stt",
  "tag",
  "tts",
  "wake_word",
]);

/** A thermostat is coloured by what it is doing, not by the mode it is set to. */
const CLIMATE_HVAC_ACTION_TO_MODE: Record<string, string> = {
  cooling: "cool",
  defrosting: "heat",
  drying: "dry",
  fan: "fan_only",
  heating: "heat",
  idle: "off",
  off: "off",
  preheating: "heat",
};

/**
 * The `ui_color` palette. Every name here resolves to `var(--<name>-color)`;
 * anything else is handed through as plain CSS, which is what lets a config say
 * `#ff0000` or `rebeccapurple`.
 */
const NAMED_COLORS = new Set([
  "primary",
  "accent",
  "disabled",
  "red",
  "pink",
  "purple",
  "deep-purple",
  "indigo",
  "blue",
  "light-blue",
  "cyan",
  "teal",
  "green",
  "light-green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "deep-orange",
  "brown",
  "light-grey",
  "grey",
  "dark-grey",
  "blue-grey",
  "black",
  "white",
  "primary-text",
  "secondary-text",
]);

const UNAVAILABLE = "unavailable";
const UNKNOWN = "unknown";
const OFF = "off";

const domainOf = (entityId: string): string => entityId.substring(0, entityId.indexOf("."));

/**
 * Home Assistant's `slugify`, reduced to what a state value can contain.
 * The upstream function also transliterates accents and Cyrillic; an entity
 * state is a machine value (`on`, `not_home`, `armed_away`), so the general
 * case would be dead weight. A state carrying anything else still slugs to
 * something usable, which is all this feeds: a token name.
 */
const slugifyState = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";

/** Whether the entity reads as "doing something", which picks the active token. */
export const stateActive = (stateObj: HassEntity, state?: string): boolean => {
  const domain = domainOf(stateObj.entity_id);
  const compareState = state !== undefined ? state : stateObj?.state;

  if (TIMESTAMP_STATE_DOMAINS.has(domain)) return compareState !== UNAVAILABLE;
  if (compareState === UNAVAILABLE || compareState === UNKNOWN) return false;
  // "off" is inactive everywhere except alert, where "idle" plays that part.
  if (compareState === OFF && domain !== "alert") return false;

  switch (domain) {
    case "alarm_control_panel":
      return compareState !== "disarmed";
    case "alert":
      return compareState !== "idle";
    case "cover":
      return compareState !== "closed";
    case "device_tracker":
    case "person":
      return compareState !== "not_home";
    case "lawn_mower":
      return !["docked", "paused"].includes(compareState);
    case "lock":
      return compareState !== "locked";
    case "media_player":
      return compareState !== "standby";
    case "vacuum":
      return !["idle", "docked", "paused"].includes(compareState);
    case "valve":
      return compareState !== "closed";
    case "plant":
      return compareState === "problem";
    case "group":
      return ["on", "home", "open", "locked", "problem"].includes(compareState);
    case "timer":
      return compareState === "active";
    case "camera":
      return compareState === "streaming";
  }
  return true;
};

/** A battery is coloured by how full it is, not by its state string. */
const batteryStateColorProperty = (state: string): string | undefined => {
  const value = Number(state);
  if (Number.isNaN(value)) return undefined;
  if (value >= 70) return "--state-sensor-battery-high-color";
  if (value >= 30) return "--state-sensor-battery-medium-color";
  return "--state-sensor-battery-low-color";
};

/** A group takes the colour of its members, but only when they agree. */
const groupDomain = (stateObj: HassEntity): string | undefined => {
  const entityIds: string[] = stateObj.attributes.entity_id ?? [];
  const domains = [...new Set(entityIds.map(domainOf))];
  return domains.length === 1 ? domains[0] : undefined;
};

/**
 * The token candidates, most specific first. The chain is the whole design:
 * a theme that defines none of them still lands on `--state-active-color`.
 */
const domainColorProperties = (
  domain: string,
  deviceClass: string | undefined,
  state: string,
  active: boolean,
): string[] => {
  const stateKey = slugifyState(state);
  const activeKey = active ? "active" : "inactive";
  const properties: string[] = [];
  if (deviceClass) properties.push(`--state-${domain}-${deviceClass}-${stateKey}-color`);
  properties.push(
    `--state-${domain}-${stateKey}-color`,
    `--state-${domain}-${activeKey}-color`,
    `--state-${activeKey}-color`,
  );
  return properties;
};

const stateColorProperties = (stateObj: HassEntity, state?: string): string[] | undefined => {
  const compareState = state !== undefined ? state : stateObj?.state;
  const domain = domainOf(stateObj.entity_id);
  const deviceClass = stateObj.attributes.device_class as string | undefined;

  if (domain === "sensor" && deviceClass === "battery") {
    const property = batteryStateColorProperty(compareState);
    if (property) return [property];
  }

  if (domain === "group") {
    const inner = groupDomain(stateObj);
    if (inner && STATE_COLORED_DOMAIN.has(inner)) {
      return domainColorProperties(inner, deviceClass, compareState, stateActive(stateObj, state));
    }
  }

  if (STATE_COLORED_DOMAIN.has(domain)) {
    return domainColorProperties(domain, deviceClass, compareState, stateActive(stateObj, state));
  }
  return undefined;
};

/** Nest the candidates into one `var()` chain, most specific outermost. */
const cssVariableChain = (properties: string[]): string | undefined =>
  properties.reduceRight<string | undefined>(
    (rest, variable) => `var(${variable}${rest ? `, ${rest}` : ""})`,
    undefined,
  );

/**
 * The state colour as a live CSS expression. Live matters: a resolved `rgb(…)`
 * would freeze the theme in place, while this follows a theme change with no
 * work of ours.
 */
export const stateColorCss = (stateObj: HassEntity, state?: string): string | undefined => {
  const compareState = state !== undefined ? state : stateObj?.state;
  if (compareState === UNAVAILABLE) return "var(--state-unavailable-color)";
  const properties = stateColorProperties(stateObj, state);
  return properties ? cssVariableChain(properties) : undefined;
};

/**
 * The dimming a lit bulb applies to its own colour. Excluded for `plant`,
 * whose `brightness` attribute measures light received, not light emitted.
 */
export const stateColorBrightness = (stateObj: HassEntity): string => {
  const brightness = stateObj.attributes.brightness;
  if (typeof brightness === "number" && domainOf(stateObj.entity_id) !== "plant") {
    // The floor is deliberate: a bulb at 1/255 still has to be visible.
    return `brightness(${(brightness + 245) / 5}%)`;
  }
  return "";
};

/**
 * What a `color` key resolves to, for any element kind — the same branch
 * `state-badge` takes, so an icon and a label standing beside each other agree.
 *
 * `undefined` means "name nothing": the caller leaves its own default in place,
 * which is what `none`, an inactive entity under a named colour, and an
 * uncoloured domain all have in common.
 */
export const itemColorCss = (
  stateObj: HassEntity | undefined,
  color: string | undefined,
): string | undefined => {
  if (!stateObj || !color || color === "none") return undefined;

  if (color !== "state") {
    // Home Assistant colours a named choice only while the entity is active —
    // which is exactly what the editor's own helper text promises.
    if (!stateActive(stateObj)) return undefined;
    return NAMED_COLORS.has(color) ? `var(--${color}-color)` : color;
  }

  // A thermostat overrides everything: it is coloured by what it is doing, and
  // an action outside the map means Home Assistant names no colour at all.
  const hvacAction = stateObj.attributes.hvac_action as string | undefined;
  if (hvacAction !== undefined) {
    const mode = CLIMATE_HVAC_ACTION_TO_MODE[hvacAction];
    return mode === undefined ? undefined : stateColorCss(stateObj, mode);
  }

  // A bulb reporting a colour wins over the domain's token: the item shows the
  // light's own colour, as every Home Assistant surface does.
  const rgb = stateObj.attributes.rgb_color as number[] | undefined;
  if (Array.isArray(rgb) && rgb.length === 3) return `rgb(${rgb.join(",")})`;

  return stateColorCss(stateObj);
};
