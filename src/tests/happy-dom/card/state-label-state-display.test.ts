import { afterEach, describe, expect, it } from "@rstest/core";
import { PictureStudioStateLabel } from "../../../card/state-label-element";
import { LABEL_TAG, type StateLabelConfig } from "../../../config";
import { DEFAULT_LABEL_SIZE } from "../../../element-size";

/**
 * Its own file because the registry states are contradictory: the suite in
 * `state-label-element.test.ts` asserts the fallback taken when `state-display`
 * is **undefined**, and `customElements.define` cannot be undone. Registering the
 * stub below at module scope would silently retire that test's whole premise.
 *
 * What is asserted here is a **contract with Home Assistant's own entity badge**.
 * Our label and a native badge must put the same text on the picture for the same
 * `state_content` — an item is not supposed to read differently depending on
 * which of the two the user happened to reach for.
 */

/** Records what the element was handed, which is the whole contract. */
class StubStateDisplay extends HTMLElement {
  hass?: unknown;
  stateObj?: unknown;
  content?: unknown;
  timeFormat?: unknown;
  name?: unknown;
}
if (!customElements.get("state-display")) {
  customElements.define("state-display", StubStateDisplay);
}
if (!customElements.get(LABEL_TAG)) customElements.define(LABEL_TAG, PictureStudioStateLabel);

const STATE_OBJ = {
  entity_id: "light.a",
  state: "on",
  attributes: { friendly_name: "Break room", color_mode: "hs" },
};

/**
 * Mirrors `hass.formatEntityName(stateObj, name)`: the override wins, otherwise
 * the friendly name. Distinguishable on purpose, so a test can tell which one
 * travelled.
 */
const hass = {
  states: { "light.a": STATE_OBJ },
  formatEntityName: (stateObj: { attributes: Record<string, unknown> }, name?: unknown) =>
    typeof name === "string" && name ? name : (stateObj.attributes.friendly_name as string),
  formatEntityState: () => "71%",
  formatEntityAttributeValue: () => "HS",
};

const mount = async (config: Partial<StateLabelConfig>) => {
  const el = document.createElement(LABEL_TAG) as PictureStudioStateLabel;
  el.setConfig({ type: "state-label", size: DEFAULT_LABEL_SIZE, show: ["state"], ...config });
  el.hass = hass as never;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const display = (el: PictureStudioStateLabel) =>
  el.shadowRoot?.querySelector("state-display") as StubStateDisplay | null;

afterEach(() => {
  document.body.replaceChildren();
});

describe("what the label hands to state-display", () => {
  it("passes a name, which is what makes a `name` entry render at all", async () => {
    // The defect this pins: state-display renders a `name` entry as `this.name`
    // and only if `this.name` is set. Without it, it looks for an attribute
    // called `name`, finds none, returns undefined — and render() drops the
    // entry with .filter(Boolean). A `[name, color_mode]` content silently
    // became "HS" while the native badge beside it read "Break room · HS".
    const el = await mount({ entity: "light.a", state_content: ["name", "color_mode"] });
    expect(display(el)?.name).toBe("Break room");
  });

  it("prefers the item's own name over the entity's, as the badge does", async () => {
    const el = await mount({
      entity: "light.a",
      name: "Ma lampe",
      state_content: ["name", "color_mode"],
    });
    expect(display(el)?.name).toBe("Ma lampe");
  });

  it("hands over every other property the native badge hands over", async () => {
    // Read out of the shipped frontend, build 20260729.6, chunk 34564:
    //   <state-display .stateObj .hass .content=${config.state_content}
    //                  .timeFormat=${config.time_format} .name=${o}>
    // Five properties. Missing one is invisible until a config uses it, which is
    // exactly how `.name` went unnoticed.
    const el = await mount({
      entity: "light.a",
      state_content: ["name", "color_mode"],
      time_format: "24",
    });
    const stub = display(el);
    expect(stub?.stateObj).toBe(STATE_OBJ);
    expect(stub?.hass).toBe(hass);
    expect(stub?.content).toEqual(["name", "color_mode"]);
    expect(stub?.timeFormat).toBe("24");
    expect(stub?.name).toBe("Break room");
  });

  it("leaves content undefined when none is configured, so HA picks its default", async () => {
    const el = await mount({ entity: "light.a" });
    expect(display(el)?.content).toBeUndefined();
    // The name still travels: HA's default content may itself mention the name.
    expect(display(el)?.name).toBe("Break room");
  });
});

describe("the name reads the same wherever it appears", () => {
  it("gives the same text to the name row and to a `name` state entry", async () => {
    // The user's rule: for the same config, Name and State must agree on their
    // content. One element showing "Break room" in its name row and nothing for
    // the `name` entry of its state was the visible half of that disagreement.
    const el = await mount({
      entity: "light.a",
      show: ["name", "state"],
      state_content: ["name"],
    });
    const row = el.shadowRoot?.querySelector(".name")?.textContent?.trim();
    expect(row).toBe("Break room");
    expect(display(el)?.name).toBe(row);
  });

  it("keeps them in step when the item overrides the name", async () => {
    const el = await mount({
      entity: "light.a",
      name: "Ma lampe",
      show: ["name", "state"],
      state_content: ["name"],
    });
    const row = el.shadowRoot?.querySelector(".name")?.textContent?.trim();
    expect(row).toBe("Ma lampe");
    expect(display(el)?.name).toBe(row);
  });
});
