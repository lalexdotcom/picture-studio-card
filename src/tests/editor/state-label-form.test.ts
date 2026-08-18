import { describe, expect, it } from "@rstest/core";
import { DEFAULT_LABEL_CHROME } from "../../chrome";
import type { StateLabelConfig } from "../../config";
import { labelFromFormData, labelSchema, labelToFormData } from "../../editor/state-label-form";
import { DEFAULT_LABEL_SIZE } from "../../element-size";

const base: StateLabelConfig = {
  type: "state-label",
  entity: "sensor.a",
  size: DEFAULT_LABEL_SIZE,
};

const names = (schema: unknown[]): string[] =>
  schema.flatMap((row) => {
    const r = row as { name?: string; schema?: unknown[] };
    return r.schema ? names(r.schema) : r.name ? [r.name] : [];
  });

describe("labelSchema", () => {
  it("keeps the half of the badge form the icon left behind", () => {
    expect(names(labelSchema())).toEqual([
      "entity",
      "name",
      "displayed_elements",
      "state_content",
      "color",
      "tap_action",
      "hold_action",
      "double_tap_action",
    ]);
  });

  it("offers no state colour, and no `No color` trap it cannot honour", () => {
    const color = JSON.stringify(labelSchema());
    expect(color).toContain('"default_color":"none"');
    expect(color).toContain('"include_none":true');
    expect(color).not.toContain("include_state");
  });
});

describe("labelToFormData", () => {
  it("flattens the two displayed parts into one multi-select", () => {
    expect(
      labelToFormData({ ...base, show_name: true, show_state: true }).displayed_elements,
    ).toEqual(["name", "state"]);
    expect(labelToFormData(base).displayed_elements).toEqual([]);
  });

  it("shows the chrome numbers even when the chrome is off, so unchecking loses nothing", () => {
    const data = labelToFormData({
      ...base,
      chrome: { ...DEFAULT_LABEL_CHROME, radius: 8, padding: 10 },
    });
    expect(data.chrome_enabled).toBe(false);
    expect(data.chrome_radius).toBe(8);
    expect(data.chrome_padding).toBe(10);
  });

  it("rounds every number so a slider cannot leave a fraction behind", () => {
    const data = labelToFormData({
      ...base,
      chrome: {
        ...DEFAULT_LABEL_CHROME,
        theme: "auto",
        radius: 12.5,
        opacity: 0.615,
        padding: 7.4,
      },
    });
    expect(data.chrome_radius).toBe(13);
    expect(data.chrome_opacity).toBe(62);
    expect(data.chrome_padding).toBe(7);
  });

  it("carries the halo as its own checkbox", () => {
    expect(labelToFormData(base).halo_enabled).toBe(false);
    expect(labelToFormData({ ...base, halo: true }).halo_enabled).toBe(true);
  });
});

describe("labelFromFormData", () => {
  const round = (data: Record<string, unknown>) =>
    labelFromFormData(base, { ...labelToFormData(base), ...data });

  it("splits the multi-select back into two booleans", () => {
    expect(round({ displayed_elements: ["state"] })).toMatchObject({
      show_name: false,
      show_state: true,
    });
    expect(round({ displayed_elements: [] })).toMatchObject({
      show_name: false,
      show_state: false,
    });
  });

  it("never lets the form rename the kind", () => {
    expect(round({ type: "state-icon" }).type).toBe("state-label");
  });

  it("stores `none` as the theme when the box is unchecked, keeping every number", () => {
    const off = labelFromFormData(
      { ...base, chrome: { ...DEFAULT_LABEL_CHROME, theme: "auto", radius: 9 } },
      { ...labelToFormData(base), chrome_enabled: false, chrome_radius: 9 },
    );
    expect(off.chrome?.theme).toBe("none");
    expect(off.chrome?.radius).toBe(9);
  });

  it("omits the chrome entirely when there never was one and the box is off", () => {
    expect(round({ chrome_enabled: false }).chrome).toBeUndefined();
  });

  it("writes the halo as a plain boolean", () => {
    expect(round({ halo_enabled: true }).halo).toBe(true);
    expect(round({ halo_enabled: false }).halo).toBe(false);
  });

  it("converts percent back to 0-1 for opacity", () => {
    const on = round({ chrome_enabled: true, chrome_opacity: 62 });
    expect(on.chrome?.opacity).toBeCloseTo(0.62, 5);
  });
});
