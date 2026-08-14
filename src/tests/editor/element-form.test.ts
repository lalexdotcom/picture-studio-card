import { afterEach, describe, expect, it } from "@rstest/core";
import { ELEMENT_FORM_TAG } from "../../config";
import {
  elementFormHelper,
  elementFormLabel,
  fromFormData,
  PictureStudioElementForm,
  stateIconSchema,
  stateIconSizeSchema,
  toFormData,
} from "../../editor/element-form";
import { DEFAULT_ICON_SIZE } from "../../element-size";

const base = { type: "state-icon" as const, size: DEFAULT_ICON_SIZE };
const localize = ((key: string) => `L:${key}`) as never;

/** Navigate a chain of keys through unknown values without using `any`. */
const get = (obj: unknown, ...keys: string[]): unknown => {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
};

const find = (schema: unknown[], name: string): Record<string, unknown> | undefined => {
  for (const entry of schema as Record<string, unknown>[]) {
    if (entry.name === name) return entry;
    const nested = entry.schema as unknown[] | undefined;
    const hit = nested && find(nested, name);
    if (hit) return hit;
  }
  return undefined;
};

describe("stateIconSchema", () => {
  it("puts the name first, then colour, icon, and picture in one grid", () => {
    const content = find(stateIconSchema(), "content");
    const names = (
      (content?.schema ?? []) as { name: string; schema?: { name: string }[] }[]
    ).flatMap((entry) => (entry.schema ? entry.schema.map((s) => s.name) : [entry.name]));
    expect(names.slice(0, 4)).toEqual(["name", "color", "icon", "show_entity_picture"]);
  });

  it("does not contain the size fields (they live in stateIconSizeSchema)", () => {
    expect(find(stateIconSchema(), "size_min")).toBeUndefined();
    expect(find(stateIconSchema(), "size_ratio")).toBeUndefined();
    expect(find(stateIconSchema(), "size_max")).toBeUndefined();
    expect(find(stateIconSchema(), "size_mode")).toBeUndefined();
    expect(find(stateIconSchema(), "size_value")).toBeUndefined();
  });

  it("offers hold and double tap as optional actions", () => {
    expect(find(stateIconSchema(), "hold_action")).toBeDefined();
    expect(find(stateIconSchema(), "double_tap_action")).toBeDefined();
  });
});

describe("stateIconSizeSchema", () => {
  // --- Fallback path (radioGroupAvailable = false, the default) ---
  it("auto: contains size_mode and no numeric fields (fallback path)", () => {
    const schema = stateIconSizeSchema("auto", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeUndefined();
    expect(find(schema, "size_min")).toBeUndefined();
    expect(find(schema, "size_max")).toBeUndefined();
    expect(find(schema, "size_value")).toBeUndefined();
  });

  it("adaptive: contains size_mode, size_ratio, size_min, size_max — no size_value (fallback path)", () => {
    const schema = stateIconSizeSchema("adaptive", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeDefined();
    expect(find(schema, "size_min")).toBeDefined();
    expect(find(schema, "size_max")).toBeDefined();
    expect(find(schema, "size_value")).toBeUndefined();
  });

  it("fixed: contains size_mode and size_value — no adaptive fields (fallback path)", () => {
    const schema = stateIconSizeSchema("fixed", localize, undefined);
    expect(find(schema, "size_mode")).toBeDefined();
    expect(find(schema, "size_value")).toBeDefined();
    expect(find(schema, "size_ratio")).toBeUndefined();
    expect(find(schema, "size_min")).toBeUndefined();
    expect(find(schema, "size_max")).toBeUndefined();
  });

  it("size_mode field uses a select with mode: list and three options", () => {
    const schema = stateIconSizeSchema("auto", localize, undefined);
    const field = find(schema, "size_mode");
    expect(get(field, "selector", "select", "mode")).toBe("list");
    const options = get(field, "selector", "select", "options");
    const values = Array.isArray(options)
      ? (options as Record<string, unknown>[]).map((o) => o.value)
      : undefined;
    expect(values).toEqual(["auto", "adaptive", "fixed"]);
  });

  // --- Radio-group path (radioGroupAvailable = true) ---
  it("omits size_mode when radioGroupAvailable is true (radio group path)", () => {
    expect(
      find(stateIconSizeSchema("auto", localize, undefined, true), "size_mode"),
    ).toBeUndefined();
    expect(
      find(stateIconSizeSchema("adaptive", localize, undefined, true), "size_mode"),
    ).toBeUndefined();
    expect(
      find(stateIconSizeSchema("fixed", localize, undefined, true), "size_mode"),
    ).toBeUndefined();
  });

  it("includes size_mode when radioGroupAvailable is false (fallback path)", () => {
    expect(
      find(stateIconSizeSchema("auto", localize, undefined, false), "size_mode"),
    ).toBeDefined();
    expect(
      find(stateIconSizeSchema("adaptive", localize, undefined, false), "size_mode"),
    ).toBeDefined();
    expect(
      find(stateIconSizeSchema("fixed", localize, undefined, false), "size_mode"),
    ).toBeDefined();
  });

  it("numeric rows per mode are unchanged regardless of radioGroupAvailable", () => {
    for (const rga of [true, false] as const) {
      const adaptive = stateIconSizeSchema("adaptive", localize, undefined, rga);
      expect(find(adaptive, "size_ratio")).toBeDefined();
      expect(find(adaptive, "size_min")).toBeDefined();
      expect(find(adaptive, "size_max")).toBeDefined();
      expect(find(adaptive, "size_value")).toBeUndefined();

      const fixed = stateIconSizeSchema("fixed", localize, undefined, rga);
      expect(find(fixed, "size_value")).toBeDefined();
      expect(find(fixed, "size_ratio")).toBeUndefined();

      const auto = stateIconSizeSchema("auto", localize, undefined, rga);
      expect(find(auto, "size_ratio")).toBeUndefined();
      expect(find(auto, "size_value")).toBeUndefined();
    }
  });

  it("every number field carries mode: box", () => {
    const adaptive = stateIconSizeSchema("adaptive", localize, undefined);
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "mode")).toBe("box");
    expect(get(find(adaptive, "size_min"), "selector", "number", "mode")).toBe("box");
    expect(get(find(adaptive, "size_max"), "selector", "number", "mode")).toBe("box");

    const fixed = stateIconSizeSchema("fixed", localize, undefined);
    expect(get(find(fixed, "size_value"), "selector", "number", "mode")).toBe("box");
  });
});

describe("PictureStudioElementForm — radio group change", () => {
  // Register a minimal stub so customElements.get("ha-radio-group") returns a
  // non-undefined value and the form takes the radio-group render path.
  // ha-radio-group renders nothing meaningful under happy-dom, so we assert on
  // what we pass it and what we emit, not on its rendered internals.
  if (!customElements.get("ha-radio-group")) {
    customElements.define("ha-radio-group", class extends HTMLElement {});
  }
  if (!customElements.get("ha-radio-option")) {
    customElements.define("ha-radio-option", class extends HTMLElement {});
  }
  if (!customElements.get(ELEMENT_FORM_TAG)) {
    customElements.define(ELEMENT_FORM_TAG, PictureStudioElementForm);
  }

  const hass = {
    localize: ((key: string) => `L:${key}`) as never,
    states: {},
  } as never;

  const mountForm = async (mode: "auto" | "adaptive" | "fixed") => {
    const el = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    el.hass = hass;
    el.element = { type: "state-icon", size: { ...DEFAULT_ICON_SIZE, mode } };
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("emits element-changed with the chosen mode and all other keys intact", async () => {
    const form = await mountForm("auto");
    const group = form.shadowRoot?.querySelector("ha-radio-group");
    expect(group).not.toBeNull();
    if (!group) return; // TypeScript guard; the assertion above already fails the test

    const events: CustomEvent[] = [];
    form.addEventListener("element-changed", (e) => events.push(e as CustomEvent));

    // Simulate ha-radio-group firing a change event with value "adaptive".
    // The handler reads ev.currentTarget.value, so we set it on the element
    // before dispatching.
    (group as HTMLElement & { value?: string }).value = "adaptive";
    group.dispatchEvent(new Event("change", { bubbles: true }));

    expect(events).toHaveLength(1);
    const detail = (events[0] as CustomEvent<{ element: { size: typeof DEFAULT_ICON_SIZE } }>)
      .detail;
    expect(detail.element.size.mode).toBe("adaptive");
    // All other keys must survive the mode change.
    expect(detail.element.size.min).toBe(DEFAULT_ICON_SIZE.min);
    expect(detail.element.size.max).toBe(DEFAULT_ICON_SIZE.max);
    expect(detail.element.size.value).toBe(DEFAULT_ICON_SIZE.value);
    expect(detail.element.size.ratio).toBe(DEFAULT_ICON_SIZE.ratio);
  });
});

describe("toFormData / fromFormData", () => {
  it("flattens the size into five fields", () => {
    expect(toFormData({ ...base, entity: "light.a" })).toEqual({
      type: "state-icon",
      entity: "light.a",
      size_mode: "auto",
      size_min: 40,
      size_ratio: 3.5,
      size_max: 70,
      size_value: 48,
    });
  });

  it("round-trips an adaptive size", () => {
    const config = {
      ...base,
      size: { mode: "adaptive" as const, min: 10, ratio: 1, max: 20, value: 48 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("round-trips a fixed size", () => {
    const config = {
      ...base,
      size: { mode: "fixed" as const, min: 40, ratio: 3.5, max: 70, value: 64 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("round-trips an auto size", () => {
    const config = {
      ...base,
      size: { mode: "auto" as const, min: 10, ratio: 1, max: 20, value: 32 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("switching back to auto keeps the numbers so unchecking restores them", () => {
    const config = {
      ...base,
      size: { mode: "adaptive" as const, min: 10, ratio: 1, max: 20, value: 48 },
    };
    const data = { ...toFormData(config), size_mode: "auto" };
    expect(fromFormData(config, data).size).toEqual({
      mode: "auto",
      min: 10,
      ratio: 1,
      max: 20,
      value: 48,
    });
  });

  it("degrades gracefully when non-schema keys are absent — normalizeIconSize supplies defaults", () => {
    // Documents what happens if the ha-form invariant (emitting the full .data
    // record) is ever broken: missing size fields become defaults, not a crash.
    const data = { type: "state-icon", entity: "light.a", size_mode: "fixed" };
    const result = fromFormData(base, data);
    expect(result.size.mode).toBe("fixed");
    expect(result.size.value).toBe(48); // DEFAULT_ICON_SIZE.value
    expect(result.size.min).toBe(40); // DEFAULT_ICON_SIZE.min
  });

  it("never lets a form field named type overwrite the kind", () => {
    expect(fromFormData(base, { ...toFormData(base), type: "nonsense" }).type).toBe("state-icon");
  });
});

describe("elementFormLabel", () => {
  it("uses Home Assistant's badge keys for colour and picture", () => {
    expect(elementFormLabel(localize, undefined, "color")).toBe(
      "L:ui.panel.lovelace.editor.badge.entity.color",
    );
  });

  it("uses the generic keys for everything Home Assistant knows", () => {
    expect(elementFormLabel(localize, undefined, "tap_action")).toBe(
      "L:ui.panel.lovelace.editor.card.generic.tap_action",
    );
  });

  it("uses ours only for the fields the catalogue has not got", () => {
    expect(elementFormLabel((() => "") as never, undefined, "size_ratio")).toBe("Ratio");
    expect(elementFormLabel((() => "") as never, undefined, "size_mode")).toBe("Size");
    expect(elementFormLabel((() => "") as never, undefined, "size_value")).toBe("Value");
  });
});

describe("elementFormHelper", () => {
  it("returns the HA colour helper text for the color field", () => {
    expect(elementFormHelper(localize, "color")).toBe(
      "L:ui.panel.lovelace.editor.badge.entity.color_helper",
    );
  });

  it("falls back to the English string when localize returns empty", () => {
    expect(elementFormHelper((() => "") as never, "color")).toBe(
      "Inactive state (for example, off or closed) will not be colored.",
    );
  });

  it("returns undefined for every other field", () => {
    expect(elementFormHelper(localize, "icon")).toBeUndefined();
    expect(elementFormHelper(localize, "name")).toBeUndefined();
    expect(elementFormHelper(localize, "tap_action")).toBeUndefined();
  });
});
