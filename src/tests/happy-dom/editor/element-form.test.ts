import { afterEach, beforeAll, describe, expect, it } from "@rstest/core";
import type { StateIconConfig, StateLabelConfig } from "../../../config";
import { ELEMENT_FORM_TAG } from "../../../config";
import {
  appearanceToggleSchema,
  elementFormHelper,
  elementFormLabel,
  PictureStudioElementForm,
} from "../../../editor/element-form";
import {
  iconChromeSchema as chromeSchema,
  iconFromFormData as fromFormData,
  iconSchema as stateIconSchema,
  iconSizeSchema as stateIconSizeSchema,
  themeModeTitle,
  iconToFormData as toFormData,
} from "../../../editor/state-icon-form";
import { labelToFormData } from "../../../editor/state-label-form";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "../../../element-size";
import { cssRules } from "../card/harness";

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

  it("size_ratio has no mode: box and spans 1 to 100", () => {
    const adaptive = stateIconSizeSchema("adaptive", localize, undefined);
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "mode")).toBeUndefined();
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "min")).toBe(1);
    expect(get(find(adaptive, "size_ratio"), "selector", "number", "max")).toBe(100);
  });

  it("adaptive pixel bounds (size_min, size_max) keep mode: box", () => {
    const adaptive = stateIconSizeSchema("adaptive", localize, undefined);
    expect(get(find(adaptive, "size_min"), "selector", "number", "mode")).toBe("box");
    expect(get(find(adaptive, "size_max"), "selector", "number", "mode")).toBe("box");
  });

  it("fixed size_value is a slider from 10 to 128", () => {
    const fixed = stateIconSizeSchema("fixed", localize, undefined);
    expect(get(find(fixed, "size_value"), "selector", "number", "mode")).toBeUndefined();
    expect(get(find(fixed, "size_value"), "selector", "number", "min")).toBe(8);
    expect(get(find(fixed, "size_value"), "selector", "number", "max")).toBe(128);
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
    // Content is [0]; Size and position is [1]; Appearance is [2].
    const sizePanel = form.shadowRoot?.querySelectorAll("ha-expansion-panel")[1];
    const group = sizePanel?.querySelector("ha-radio-group");
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
    const first = events[0];
    if (!first) throw new Error("expected one element-changed event");
    const detail = (
      first as CustomEvent<{ element: { type: string; size: typeof DEFAULT_ICON_SIZE } }>
    ).detail;
    // The kind travels with the rest: the card rewrites the whole config on every
    // editor commit, so an element that lost its `type` would be erased from the
    // user's YAML rather than merely rendered wrong.
    expect(detail.element.type).toBe("state-icon");
    expect(detail.element.size.mode).toBe("adaptive");
    // All other keys must survive the mode change.
    expect(detail.element.size.min).toBe(DEFAULT_ICON_SIZE.min);
    expect(detail.element.size.max).toBe(DEFAULT_ICON_SIZE.max);
    expect(detail.element.size.value).toBe(DEFAULT_ICON_SIZE.value);
    expect(detail.element.size.ratio).toBe(DEFAULT_ICON_SIZE.ratio);
  });

  it("renders Size and position before Appearance", async () => {
    const form = await mountForm("auto");
    const headers = [...(form.shadowRoot?.querySelectorAll('[slot="header"]') ?? [])].map((el) =>
      el.textContent?.trim(),
    );
    // localize is stubbed as `L:${key}`, so the Appearance title arrives as the
    // borrowed Home Assistant key rather than as a translated word.
    expect(headers).toEqual([
      "L:ui.panel.lovelace.editor.card.generic.content",
      "Size and position",
      "L:ui.panel.lovelace.editor.card.map.appearance",
    ]);
  });
});

describe("toFormData / fromFormData", () => {
  it("flattens size and chrome into flat fields", () => {
    expect(toFormData({ ...base, entity: "light.a" })).toEqual({
      type: "state-icon",
      entity: "light.a",
      size_mode: "auto",
      size_min: 24,
      size_ratio: 8,
      size_max: 48,
      size_value: 48,
      halo_enabled: false,
      chrome_enabled: false,
      chrome_theme: "auto",
      chrome_radius: 50,
      chrome_opacity: 100,
      chrome_content_ratio: 60,
    });
  });

  it("round-trips an adaptive size", () => {
    // halo: false — fromFormData always emits a concrete boolean (not undefined).
    const config = {
      ...base,
      halo: false as const,
      size: { mode: "adaptive" as const, min: 10, ratio: 1, max: 20, value: 48 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("round-trips a fixed size", () => {
    // ratio is 4 (integer) — a non-integer would be rounded by toFormData and
    // not equal config.size.ratio on the way back. That rounding is deliberate:
    // hand-written sub-step values are rounded on the first editor commit.
    // halo: false — fromFormData always emits a concrete boolean (not undefined).
    const config = {
      ...base,
      halo: false as const,
      size: { mode: "fixed" as const, min: 40, ratio: 4, max: 70, value: 64 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("round-trips an auto size", () => {
    // halo: false — fromFormData always emits a concrete boolean (not undefined).
    const config = {
      ...base,
      halo: false as const,
      size: { mode: "auto" as const, min: 10, ratio: 1, max: 20, value: 32 },
    };
    expect(fromFormData(config, toFormData(config))).toEqual(config);
  });

  it("carries the halo as its own checkbox", () => {
    expect(toFormData(base).halo_enabled).toBe(false);
    expect(toFormData({ ...base, halo: true }).halo_enabled).toBe(true);
  });

  it("writes the halo as a plain boolean", () => {
    expect(fromFormData(base, { ...toFormData(base), halo_enabled: true }).halo).toBe(true);
    expect(fromFormData(base, { ...toFormData(base), halo_enabled: false }).halo).toBe(false);
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
    // Read from the constant, not restated: a test that copies a default stops
    // guarding it the day the default moves, and starts failing instead.
    expect(result.size.value).toBe(DEFAULT_ICON_SIZE.value);
    expect(result.size.min).toBe(DEFAULT_ICON_SIZE.min);
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

  it("labels the two fields whose generic key does not exist", () => {
    const localize = ((key: string) =>
      ({
        "ui.panel.lovelace.editor.badge.entity.displayed_elements": "Éléments affichés",
        "ui.panel.lovelace.editor.badge.entity.state_content": "Contenu de l'état",
      })[key] ?? "") as never;
    expect(elementFormLabel(localize, undefined, "displayed_elements")).toBe("Éléments affichés");
    expect(elementFormLabel(localize, undefined, "state_content")).toBe("Contenu de l'état");
  });
});

describe("elementFormHelper", () => {
  it("returns the HA colour helper text for the color field", () => {
    expect(elementFormHelper(localize, undefined, "color")).toBe(
      "L:ui.panel.lovelace.editor.badge.entity.color_helper",
    );
  });

  it("falls back to the English string when localize returns empty", () => {
    expect(elementFormHelper((() => "") as never, undefined, "color")).toBe(
      "Inactive state (for example, off or closed) will not be colored.",
    );
  });

  it("returns the halo helper string for halo_enabled", () => {
    expect(elementFormHelper(localize, undefined, "halo_enabled")).toBe(
      "Adds a shadow and a light rim so the element stays readable on any picture.",
    );
  });

  it("returns undefined for every other field", () => {
    expect(elementFormHelper(localize, undefined, "icon")).toBeUndefined();
    expect(elementFormHelper(localize, undefined, "name")).toBeUndefined();
    expect(elementFormHelper(localize, undefined, "tap_action")).toBeUndefined();
  });
});

describe("chrome fields", () => {
  it("flattens the chrome into the form data", () => {
    const data = toFormData({
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      chrome: { theme: "dark", radius: 12, opacity: 0.8, content_ratio: 0.5 },
    });
    expect(data.chrome_enabled).toBe(true);
    expect(data.chrome_theme).toBe("dark");
    expect(data.chrome_radius).toBe(12);
    expect(data.chrome_opacity).toBe(80);
    expect(data.chrome_content_ratio).toBe(50);
    expect(data).not.toHaveProperty("chrome");
  });

  it("flattens the defaults when the element has no chrome", () => {
    const data = toFormData({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    expect(data.chrome_enabled).toBe(false);
    expect(data.chrome_radius).toBe(50);
    expect(data.chrome_opacity).toBe(100);
    expect(data.chrome_content_ratio).toBe(60);
  });

  it("round-trips 0.6 (the repeating binary that motivated Math.round) without floating-point drift", () => {
    const config = {
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      chrome: { theme: "auto", radius: 25, opacity: 0.6, content_ratio: 0.6 },
    } as StateIconConfig;
    const data = toFormData(config);
    expect(data.chrome_opacity).toBe(60);
    expect(data.chrome_content_ratio).toBe(60);
    const next = fromFormData(config, data);
    expect(next.chrome?.opacity).toBe(0.6);
    expect(next.chrome?.content_ratio).toBe(0.6);
  });

  it("shows auto in the theme control while the box is unchecked — none is never offered", () => {
    const data = toFormData({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    expect(data.chrome_theme).toBe("auto");
  });

  it("turns the box on into the auto surface", () => {
    const config = { type: "state-icon", size: DEFAULT_ICON_SIZE } as StateIconConfig;
    const next = fromFormData(config, { ...toFormData(config), chrome_enabled: true });
    expect(next.chrome).toEqual({
      theme: "auto",
      radius: 50,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("rebuilds the chrome from the flat record", () => {
    const config = { type: "state-icon", size: DEFAULT_ICON_SIZE } as StateIconConfig;
    const next = fromFormData(config, {
      ...toFormData(config),
      chrome_enabled: true,
      chrome_theme: "dark",
      chrome_radius: 8,
    });
    expect(next.chrome).toEqual({
      theme: "dark",
      radius: 8,
      opacity: 1,
      content_ratio: 0.6,
    });
  });

  it("keeps every number when the box is unchecked", () => {
    const config = {
      type: "state-icon",
      size: DEFAULT_ICON_SIZE,
      chrome: { theme: "dark", radius: 8, opacity: 0.5, content_ratio: 0.4 },
    } as StateIconConfig;
    const next = fromFormData(config, { ...toFormData(config), chrome_enabled: false });
    expect(next.chrome).toEqual({
      theme: "none",
      radius: 8,
      opacity: 0.5,
      content_ratio: 0.4,
    });
  });
});

describe("the chrome schema", () => {
  const localize = ((key: string) => key) as never;

  it("never owns chrome_theme — the theme control is hand-rendered in element-form", () => {
    expect(JSON.stringify(chromeSchema(localize))).not.toContain("chrome_theme");
  });

  it("shows the three numbers", () => {
    const json = JSON.stringify(chromeSchema(localize));
    expect(json).toContain("chrome_radius");
    expect(json).toContain("chrome_opacity");
    expect(json).toContain("chrome_content_ratio");
  });

  it("puts both toggles in one shared schema, rendered above the chrome controls", () => {
    const json = JSON.stringify(appearanceToggleSchema());
    expect(json).toContain("chrome_enabled");
    expect(json).toContain("halo_enabled");
  });
});

describe("the theme mode labels", () => {
  it("takes Home Assistant's own wording for this option", () => {
    const localize = ((key: string) =>
      key === "ui.panel.lovelace.editor.card.map.theme_mode" ? "Mode du thème" : "") as never;
    expect(themeModeTitle(localize)).toBe("Mode du thème");
  });

  it("falls back to English if the key ever goes away", () => {
    expect(themeModeTitle((() => "") as never)).toBe("Theme mode");
  });
});

describe("PictureStudioElementForm — pill-row CSS", () => {
  it("lays the row out as a three-column grid: switch, separator, radius", () => {
    const rule = cssRules(PictureStudioElementForm.styles).get(".pill-row");
    expect(rule).toContain("display: grid");
    expect(rule).toContain("grid-template-columns: max-content max-content 1fr");
  });

  it("leaves the row's spacing to the separator, as the anchor section does", () => {
    const rule = cssRules(PictureStudioElementForm.styles).get(".pill-row");
    // A gap here would add to the separator's own margins and put the two
    // controls twice as far apart as the anchor section's divider does.
    expect(rule).not.toContain("gap:");
  });

  it("hides both separator and radius with visibility when the pill is on", () => {
    // :last-child would only hide the radius; :nth-child(n+2) covers both the
    // separator (child 2) and the radius (child 3).
    const rule = cssRules(PictureStudioElementForm.styles).get(
      ".pill-row[data-pill] > :nth-child(n+2)",
    );
    expect(rule).toContain("visibility: hidden");
  });

  it("gives .pill-control a flex row with a 16px gap between label and switch", () => {
    const rule = cssRules(PictureStudioElementForm.styles).get(".pill-control");
    expect(rule).toContain("display: flex");
    expect(rule).toContain("align-items: center");
    expect(rule).toContain("gap: var(--ha-space-4, 16px)");
  });

  it("draws .pill-separator as a vertical line matching .separator's colour and thickness", () => {
    const rule = cssRules(PictureStudioElementForm.styles).get(".pill-separator");
    expect(rule).toContain("border-inline-start: 1px solid var(--divider-color)");
    // 12px is the transposition of .separator's 12px top/bottom margin.
    expect(rule).toContain("margin: 0 var(--ha-space-3, 12px)");
    // align-self: stretch gives it height — an empty div with only a side
    // border has no intrinsic height and would be invisible without this.
    expect(rule).toContain("align-self: stretch");
  });

  it("gives .pill-label the section-label typography without a bottom margin", () => {
    // .section-label has margin-block-end: 0.5em for its stacked role above a
    // control. That margin shifts the text off-centre in a flex row beside a
    // switch. .pill-label carries the same colour/weight/line-height but omits
    // the margin so align-items: center on .pill-control can do its job.
    const rule = cssRules(PictureStudioElementForm.styles).get(".pill-label");
    expect(rule).toContain("color: var(--wa-form-control-label-color)");
    expect(rule).toContain("font-weight: var(--wa-form-control-label-font-weight)");
    expect(rule).toContain("line-height: var(--wa-form-control-label-line-height)");
    expect(rule).not.toContain("margin");
  });
});

// ── Pill switch render path tests ─────────────────────────────────────────────
//
// happy-dom does not register HA's components, so ha-switch is absent by
// default and the form takes the fallback branch.  The hand-rendered branch is
// exercised by the second describe, which registers a stub via beforeAll — a
// timing that guarantees the fallback describe's tests still run without the
// stub, then the stub lands just before the hand-rendered tests start.

describe("PictureStudioElementForm — pill switch — fallback", () => {
  // ha-switch is NOT registered here.  This describe must appear before the
  // hand-rendered describe so its tests execute while the stub is still absent.

  const hass = {
    localize: ((key: string) => `L:${key}`) as never,
    states: {},
  } as never;

  const mountLabelWithChrome = async (): Promise<PictureStudioElementForm> => {
    const el = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    el.hass = hass;
    el.element = {
      type: "state-label",
      size: DEFAULT_LABEL_SIZE,
      show: ["state"],
      chrome: { theme: "auto", radius: 50, pill: false, opacity: 1, padding: 6 },
    } as StateLabelConfig;
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("ha-switch is not registered when this test runs", () => {
    // Guards the ordering contract: if this assertion fails, the fallback branch
    // is not being tested — the stub arrived early and both describes exercise
    // the hand-rendered path.
    expect(customElements.get("ha-switch")).toBeUndefined();
  });

  it("renders ha-form for the pill when ha-switch is absent", async () => {
    const form = await mountLabelWithChrome();
    // Content is [0], Size and position is [1], Appearance is [2].
    const panel = form.shadowRoot?.querySelectorAll("ha-expansion-panel")[2];
    const pillRow = panel?.querySelector(".pill-row");
    expect(pillRow).not.toBeNull();
    // Fallback: both children are ha-form (pill + radius).  In the hand-rendered
    // branch only one ha-form remains (radius only), so the count discriminates.
    expect(pillRow?.querySelectorAll("ha-form").length).toBe(2);
    expect(pillRow?.querySelector("ha-switch")).toBeNull();
  });
});

describe("PictureStudioElementForm — pill switch — hand-rendered", () => {
  // Register a minimal stub so customElements.get("ha-switch") returns a
  // non-undefined value and the form takes the hand-rendered path.
  // beforeAll runs just before this describe's first test, which is after every
  // test in the fallback describe above — preserving the ordering contract.
  beforeAll(() => {
    if (!customElements.get("ha-switch")) {
      customElements.define("ha-switch", class extends HTMLElement {});
    }
  });

  const hass = {
    localize: ((key: string) => `L:${key}`) as never,
    states: {},
  } as never;

  const mountLabelWithChrome = async (pill: boolean = false): Promise<PictureStudioElementForm> => {
    const el = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    el.hass = hass;
    el.element = {
      type: "state-label",
      size: DEFAULT_LABEL_SIZE,
      show: ["state"],
      chrome: { theme: "auto", radius: 50, pill, opacity: 1, padding: 6 },
    } as StateLabelConfig;
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders .pill-control with ha-switch when ha-switch is registered", async () => {
    const form = await mountLabelWithChrome();
    // Content is [0], Size and position is [1], Appearance is [2].
    const panel = form.shadowRoot?.querySelectorAll("ha-expansion-panel")[2];
    const pillControl = panel?.querySelector(".pill-control");
    expect(pillControl).not.toBeNull();
    expect(pillControl?.querySelector("ha-switch")).not.toBeNull();
    // The first child is .pill-control, not an ha-form fallback.
    const pillRow = panel?.querySelector(".pill-row");
    expect(pillRow?.firstElementChild?.tagName.toLowerCase()).toBe("div");
  });

  it("binds .checked to the current chrome_pill value", async () => {
    type CheckableEl = HTMLElement & { checked?: boolean };

    const formOff = await mountLabelWithChrome(false);
    const panelOff = formOff.shadowRoot?.querySelectorAll("ha-expansion-panel")[2];
    const cbOff = panelOff?.querySelector(".pill-control ha-switch") as CheckableEl | null;
    expect(cbOff).not.toBeNull();
    if (!cbOff) return;
    expect(cbOff.checked).toBe(false);
    document.body.replaceChildren();

    const formOn = await mountLabelWithChrome(true);
    const panelOn = formOn.shadowRoot?.querySelectorAll("ha-expansion-panel")[2];
    const cbOn = panelOn?.querySelector(".pill-control ha-switch") as CheckableEl | null;
    expect(cbOn).not.toBeNull();
    if (!cbOn) return;
    expect(cbOn.checked).toBe(true);
  });

  it("emits element-changed with chrome_pill toggled and all other keys intact", async () => {
    type CheckableEl = HTMLElement & { checked?: boolean };
    const form = await mountLabelWithChrome(false);
    const events: CustomEvent[] = [];
    form.addEventListener("element-changed", (e) => events.push(e as CustomEvent));

    // Content is [0], Size and position is [1], Appearance is [2].
    const panel = form.shadowRoot?.querySelectorAll("ha-expansion-panel")[2];
    const cb = panel?.querySelector(".pill-control ha-switch") as CheckableEl | null;
    expect(cb).not.toBeNull();
    if (!cb) return;

    // Simulate ha-switch firing a change event; _pillChanged reads .checked.
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));

    expect(events).toHaveLength(1);
    const first = events[0];
    if (!first) throw new Error("expected one element-changed event");
    const changed = first as CustomEvent<{ element: StateLabelConfig }>;
    expect(changed.detail.element.type).toBe("state-label");
    expect(changed.detail.element.chrome?.pill).toBe(true);
    // The chrome theme must survive the toggle — _pillChanged merges onto the
    // full record, it does not invent new keys.
    expect(changed.detail.element.chrome?.theme).toBe("auto");
  });
});

// ── Content panel and warning marker ─────────────────────────────────────────
//
// The Content section is now our own ha-expansion-panel (index 0 in the shadow
// root). These tests assert its structure and the marker that appears when a
// state-label's show list is empty — the same signal badge-list.ts shows on
// the item row, so a user can follow it from the list into the form.

describe("PictureStudioElementForm — content panel", () => {
  // ELEMENT_FORM_TAG and ha-radio-group/ha-radio-option are already registered
  // by the earlier describe blocks in this file (module-level ifs).

  const hass = {
    localize: ((key: string) => `L:${key}`) as never,
    states: {},
  } as never;

  const mountForm = async (
    element: StateLabelConfig | StateIconConfig,
  ): Promise<PictureStudioElementForm> => {
    const el = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    el.hass = hass;
    el.element = element;
    document.body.append(el);
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  // --- Panel structure (both kinds) ---

  it("content panel has the right title for a state-icon", async () => {
    const form = await mountForm({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    const header = panel?.querySelector('[slot="header"]');
    expect(header?.textContent?.trim()).toBe("L:ui.panel.lovelace.editor.card.generic.content");
  });

  it("content panel has mdi:text-short as its leading icon for a state-icon", async () => {
    const form = await mountForm({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    const leadingIcon = panel?.querySelector('[slot="leading-icon"]');
    expect(leadingIcon?.getAttribute("icon")).toBe("mdi:text-short");
  });

  it("content panel has the right title for a state-label", async () => {
    const config: StateLabelConfig = {
      type: "state-label",
      size: DEFAULT_LABEL_SIZE,
      show: ["state"],
    };
    const form = await mountForm(config);
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    const header = panel?.querySelector('[slot="header"]');
    expect(header?.textContent?.trim()).toBe("L:ui.panel.lovelace.editor.card.generic.content");
  });

  it("content panel has mdi:text-short as its leading icon for a state-label", async () => {
    const config: StateLabelConfig = {
      type: "state-label",
      size: DEFAULT_LABEL_SIZE,
      show: ["state"],
    };
    const form = await mountForm(config);
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    const leadingIcon = panel?.querySelector('[slot="leading-icon"]');
    expect(leadingIcon?.getAttribute("icon")).toBe("mdi:text-short");
  });

  // --- Warning marker ---

  it("marker is present for a state-label with show: []", async () => {
    const config: StateLabelConfig = { type: "state-label", size: DEFAULT_LABEL_SIZE, show: [] };
    const form = await mountForm(config);
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    const marker = panel?.querySelector('[slot="event"]');
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute("icon")).toBe("mdi:alert-outline");
  });

  it("marker is absent for a state-label with show: ['state']", async () => {
    const config: StateLabelConfig = {
      type: "state-label",
      size: DEFAULT_LABEL_SIZE,
      show: ["state"],
    };
    const form = await mountForm(config);
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    expect(panel?.querySelector('[slot="event"]')).toBeNull();
  });

  it("marker is absent for a state-icon, which has no show list", async () => {
    const form = await mountForm({ type: "state-icon", size: DEFAULT_ICON_SIZE });
    const panel = form.shadowRoot?.querySelector("ha-expansion-panel");
    expect(panel?.querySelector('[slot="event"]')).toBeNull();
  });

  // --- Warning marker CSS ---

  it("marker CSS carries warning colour and 16px icon size", () => {
    const rule = cssRules(PictureStudioElementForm.styles).get('ha-icon[slot="event"]');
    expect(rule).toContain("color: var(--warning-color)");
    expect(rule).toContain("--mdc-icon-size: 16px");
  });

  // --- Field preservation (the load-bearing invariant) ---
  //
  // Every ha-form gets the SAME complete .data. ha-form merges the changed
  // field onto .data and re-emits the whole thing, so each form emits a
  // complete record and _valueChanged can merge without losing anything. The
  // tests below simulate that protocol and verify the output is complete.

  it("editing the entity form emits a complete config — show list is not lost", async () => {
    const labelConfig: StateLabelConfig = {
      type: "state-label",
      entity: "sensor.temperature",
      show: ["state"],
      size: DEFAULT_LABEL_SIZE,
    };
    const form = await mountForm(labelConfig);
    const events: CustomEvent[] = [];
    form.addEventListener("element-changed", (e) => events.push(e as CustomEvent));

    // Simulate ha-form: it emits the full .data it was given, with one field
    // changed. Entity is the only schema field, but .data holds everything.
    const data = labelToFormData(labelConfig);
    const entityForm = form.shadowRoot?.querySelectorAll("ha-form")[0];
    entityForm?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { ...data, entity: "light.kitchen" } },
        bubbles: true,
      }),
    );

    expect(events).toHaveLength(1);
    const result = (events[0] as CustomEvent<{ element: StateLabelConfig }>).detail.element;
    expect(result.type).toBe("state-label");
    expect(result.entity).toBe("light.kitchen");
    // The show list must survive — it lives in the content form's schema but
    // the entity form emits the full .data so nothing is dropped.
    expect(result.show).toEqual(["state"]);
    expect(result.size.mode).toBe(DEFAULT_LABEL_SIZE.mode);
  });

  it("editing the interactions form emits a complete config — entity and show survive", async () => {
    const labelConfig: StateLabelConfig = {
      type: "state-label",
      entity: "sensor.temperature",
      show: ["state"],
      size: DEFAULT_LABEL_SIZE,
    };
    const form = await mountForm(labelConfig);
    const events: CustomEvent[] = [];
    form.addEventListener("element-changed", (e) => events.push(e as CustomEvent));

    // Interactions form is the third ha-form in DOM order:
    // [0] entity, [1] content-inner, [2] interactions.
    const data = labelToFormData(labelConfig);
    const interactionsForm = form.shadowRoot?.querySelectorAll("ha-form")[2];
    interactionsForm?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: {
          value: {
            ...data,
            tap_action: { action: "navigate", navigation_path: "/lovelace" },
          },
        },
        bubbles: true,
      }),
    );

    expect(events).toHaveLength(1);
    const result = (events[0] as CustomEvent<{ element: StateLabelConfig }>).detail.element;
    expect(result.type).toBe("state-label");
    expect(result.entity).toBe("sensor.temperature");
    expect(result.show).toEqual(["state"]);
    expect(result.tap_action).toEqual({ action: "navigate", navigation_path: "/lovelace" });
  });
});
