// The view the documentation captures are filmed on. It is created once and
// then left alone: the gifs are re-shot against it, so anything that moves in
// here changes what the README shows. Positions are percentages of
// office-plan.jpg (1800x900), read off the plan itself.
const badge = (entity, position, config = {}) => ({
  type: "badge",
  position,
  config: { type: "entity", entity, ...config },
});

const icon = (entity, position, config = {}) => ({
  type: "element",
  position,
  config: { type: "state-icon", entity, ...config },
});

const label = (entity, position, config = {}) => ({
  type: "element",
  position,
  config: { type: "state-label", entity, ...config },
});

export const CAPTURE_CARD = {
  type: "custom:picture-studio",
  heading: {
    title: "Office",
    icon: "mdi:office-building",
    badges: [
      { type: "entity", entity: "sensor.outside_humidity" },
      { type: "entity", entity: "sensor.total_energy_kwh" },
      { type: "entity", entity: "climate.ecobee" },
    ],
  },
  image: "/local/demo/office-plan.jpg",
  items: [
    // Open space — the tap target: a chromed icon big enough to read the
    // colour change when the light comes on.
    icon("light.ceiling_lights", { top: "30%", left: "47%", anchor: "center" }, {
      tap_action: { action: "toggle" },
      halo: true,
      size: { mode: "fixed", value: 44 },
      chrome: { theme: "auto", radius: 50, opacity: 0.85, content_ratio: 0.62 },
    }),
    // Lounge — the hold target, and a more-info worth showing (brightness,
    // colour wheel).
    badge("light.living_room_rgbww_lights", { top: "88%", left: "76%", anchor: "center" }, {
      show_name: true,
      hold_action: { action: "more-info" },
      tap_action: { action: "toggle" },
    }),
    badge("sensor.outside_temperature", { top: "10%", left: "50%", anchor: "center" }),
    badge("climate.hvac", { top: "49%", left: "68%", anchor: "center" }, { show_name: true }),
    badge("binary_sensor.movement_backyard", { top: "67%", left: "63%", anchor: "center" }),
    icon("lock.front_door", { top: "60%", left: "58%", anchor: "center" }, {
      size: { mode: "fixed", value: 34 },
      chrome: { theme: "dark", radius: 50, opacity: 0.8, content_ratio: 0.6 },
    }),
    icon("light.bed_light", { top: "18%", left: "23%", anchor: "center" }, {
      tap_action: { action: "toggle" },
      size: { mode: "fixed", value: 34 },
      chrome: { theme: "auto", radius: 50, opacity: 0.8, content_ratio: 0.6 },
    }),
    icon("climate.heatpump", { top: "55%", left: "13%", anchor: "center" }, {
      size: { mode: "fixed", value: 34 },
      chrome: { theme: "auto", radius: 12, opacity: 0.8, content_ratio: 0.6 },
    }),
    icon("light.entrance_color_white_lights", { top: "80%", left: "36%", anchor: "center" }, {
      size: { mode: "fixed", value: 34 },
      chrome: { theme: "auto", radius: 50, opacity: 0.8, content_ratio: 0.6 },
    }),
    icon("light.office_rgbw_lights", { top: "36%", left: "86%", anchor: "center" }, {
      size: { mode: "fixed", value: 34 },
      chrome: { theme: "auto", radius: 50, opacity: 0.8, content_ratio: 0.6 },
    }),
    label("sensor.power_consumption", { top: "52%", left: "89%", anchor: "center" }, {
      show: ["name", "state"],
      chrome: { theme: "dark", pill: true, opacity: 0.8, padding: 8 },
    }),
    label("sensor.carbon_dioxide", { top: "27%", left: "66%", anchor: "center" }, {
      show: ["name", "state"],
      chrome: { theme: "dark", pill: true, opacity: 0.8, padding: 8 },
    }),
  ],
};

// A panel view, alone on its dashboard: the card fills the frame and the
// toolbar carries no tabs.
export const CAPTURE_VIEW = {
  type: "panel",
  cards: [CAPTURE_CARD],
};
