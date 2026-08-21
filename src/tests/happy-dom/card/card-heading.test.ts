import { afterEach, beforeAll, describe, expect, it } from "@rstest/core";
import { PictureStudioHeading } from "../../../card/card-heading";
import { HEADING_TAG } from "../../../config";
import type { HomeAssistant } from "../../../types";
import { cssRules } from "./harness";

const hass = { states: {}, language: "en", localize: () => "" } as unknown as HomeAssistant;

const mount = async (heading: Record<string, unknown>): Promise<PictureStudioHeading> => {
  if (!customElements.get(HEADING_TAG)) customElements.define(HEADING_TAG, PictureStudioHeading);
  const el = document.createElement(HEADING_TAG) as PictureStudioHeading;
  el.hass = hass;
  el.heading = heading;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

beforeAll(() => {
  // The component guards on customElements.get, and happy-dom defines no Home
  // Assistant tag. Without this stub the badge assertions would pass against a
  // row that was never rendered — a test that cannot distinguish the defect.
  if (!customElements.get("hui-heading-badge")) {
    customElements.define("hui-heading-badge", class extends HTMLElement {});
  }
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-heading", () => {
  it("renders the title as text", async () => {
    const el = await mount({ title: "Office" });
    expect(el.shadowRoot?.querySelector("p")?.textContent).toBe("Office");
  });

  it("binds the icon as a property, not an attribute", async () => {
    const el = await mount({ icon: "mdi:desk" });
    const icon = el.shadowRoot?.querySelector("ha-icon") as { icon?: string } | null;
    expect(icon?.icon).toBe("mdi:desk");
  });

  it("draws no icon when none is configured", async () => {
    const el = await mount({ title: "Office" });
    expect(el.shadowRoot?.querySelector("ha-icon")).toBeNull();
  });

  it("creates one hui-heading-badge per badge, with its config", async () => {
    const badges = [
      { type: "entity", entity: "sensor.a" },
      { type: "entity", entity: "sensor.b" },
    ];
    const el = await mount({ badges });
    const rendered = el.shadowRoot?.querySelectorAll("hui-heading-badge");
    expect(rendered?.length).toBe(2);
    expect((rendered![1] as unknown as { config?: unknown }).config).toEqual(badges[1]);
  });

  it("renders no badge row when the list is empty", async () => {
    const el = await mount({ title: "Office", badges: [] });
    expect(el.shadowRoot?.querySelector(".badges")).toBeNull();
  });

  it("keeps the title box from squeezing the badges away", async () => {
    const rules = cssRules(PictureStudioHeading.styles);
    expect(rules[".content:not(:only-child)"]?.["flex"]).toBe(
      "1 0 var(--psc-heading-title-min-width, 150px)",
    );
    expect(rules[".badges"]?.["flex"]).toBe("0 1 auto");
  });

  it("uses the card header's own padding, not the heading card's", async () => {
    const rules = cssRules(PictureStudioHeading.styles);
    expect(rules[".container"]?.["padding"]).toBe(
      "var(--ha-space-3) var(--ha-space-4) var(--ha-space-4)",
    );
  });

  it("sizes the title between the card header and the heading card", async () => {
    const rules = cssRules(PictureStudioHeading.styles);
    expect(rules[".content"]?.["font-size"]).toBe(
      "var(--psc-heading-title-font-size, var(--ha-font-size-xl))",
    );
  });
});
