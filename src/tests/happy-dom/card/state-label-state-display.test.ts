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

/** No friendly_name at all — the branch that falls back to the object id. */
const NAMELESS = {
  entity_id: "light.break_room",
  state: "on",
  attributes: { color_mode: "hs" },
};

/**
 * `hass.formatEntityName(stateObj, name)`, transcribed rather than approximated.
 *
 * A stub that is merely close enough is worse than none here: the whole point of
 * this file is that our element and a native badge agree, and both agree by
 * calling this function. A fake that rounds off its edges would let a
 * disagreement about those edges pass. Read out of the shipped frontend, build
 * 20260729.6, modules 24783 and 58933:
 *
 *     Y: e => e.slice(e.indexOf(".") + 1)                    // computeObjectId
 *     (e, t) => void 0 === t.friendly_name
 *       ? computeObjectId(e).replace(/_/g, " ")
 *       : (t.friendly_name ?? "").toString()                 // computeStateName
 *
 * and, one level up, `if ("string" == typeof t) return t; if (!t) return
 * computeStateName(…)`. Two edges follow from that and neither is obvious: a
 * name given as the empty string is returned **as the empty string**, it does
 * not fall through to the friendly name; and an entity with no friendly name at
 * all falls back to its object id with underscores turned into spaces.
 */
const formatEntityName = (
  stateObj: { entity_id: string; attributes: Record<string, unknown> },
  name?: unknown,
): string => {
  if (typeof name === "string") return name;
  const friendly = stateObj.attributes.friendly_name;
  return friendly === undefined
    ? stateObj.entity_id.slice(stateObj.entity_id.indexOf(".") + 1).replace(/_/g, " ")
    : String(friendly ?? "");
};

const hass = {
  states: { "light.a": STATE_OBJ, "light.break_room": NAMELESS },
  formatEntityName,
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

/**
 * The fake above is only worth having if it is faithful, so its two
 * non-obvious edges are asserted rather than assumed. Both are Home Assistant's
 * behaviour, and both apply identically to a native badge — which is the parity
 * this file exists to hold.
 */
describe("the name HA would compute, at its edges", () => {
  it("falls back to the object id, spaces for underscores, when there is no friendly name", async () => {
    const el = await mount({ entity: "light.break_room", state_content: ["name"] });
    expect(display(el)?.name).toBe("break room");
  });

  it("returns an empty name as empty rather than falling through to the friendly one", async () => {
    // `if ("string" == typeof t) return t` — the empty string is a string, so it
    // wins. state-display then drops the `name` entry, because its own guard is
    // `"name" === t && this.name` and "" is falsy. A badge does exactly the same.
    const el = await mount({ entity: "light.a", name: "", state_content: ["name"] });
    expect(display(el)?.name).toBe("");
  });

  it("still prefers a real name over the friendly one", async () => {
    const el = await mount({ entity: "light.break_room", name: "Ma lampe" });
    expect(display(el)?.name).toBe("Ma lampe");
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
