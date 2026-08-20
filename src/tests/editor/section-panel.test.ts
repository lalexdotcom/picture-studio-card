import { afterEach, describe, expect, it } from "@rstest/core";
import { SECTION_TAG } from "../../config";
import { PictureStudioSection } from "../../editor/section-panel";
import { cssRules } from "../card/harness";

const mount = async (props: Partial<PictureStudioSection> = {}): Promise<PictureStudioSection> => {
  if (!customElements.get(SECTION_TAG)) customElements.define(SECTION_TAG, PictureStudioSection);
  const el = document.createElement(SECTION_TAG) as PictureStudioSection;
  Object.assign(el, { label: "Background", icon: "mdi:image", ...props });
  document.body.append(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("picture-studio-section", () => {
  it("renders an outlined expansion panel", async () => {
    const el = await mount();
    expect(el.shadowRoot?.querySelector("ha-expansion-panel")?.hasAttribute("outlined")).toBe(true);
  });

  it("puts the label in the header slot as a heading", async () => {
    const el = await mount();
    const header = el.shadowRoot?.querySelector('[slot="header"]');
    expect(header?.textContent?.trim()).toBe("Background");
    expect(header?.getAttribute("role")).toBe("heading");
    expect(header?.getAttribute("aria-level")).toBe("3");
  });

  it("binds the icon as a property in the leading-icon slot", async () => {
    const el = await mount();
    const icon = el.shadowRoot?.querySelector('[slot="leading-icon"]') as { icon?: string } | null;
    expect(icon?.icon).toBe("mdi:image");
  });

  it("forwards an adornment into the event slot, not icons", async () => {
    const el = await mount();
    const forwarded = el.shadowRoot?.querySelector('slot[name="event"]');
    // ha-expansion-panel renders leading-icon → header → event → chevron → icons,
    // so anything in `icons` lands after the chevron.
    expect(forwarded?.getAttribute("slot")).toBe("event");
  });

  it("is closed unless asked to be open", async () => {
    expect(
      (await mount()).shadowRoot?.querySelector("ha-expansion-panel")?.hasAttribute("expanded"),
    ).toBe(false);
    expect(
      (await mount({ open: true })).shadowRoot
        ?.querySelector("ha-expansion-panel")
        ?.hasAttribute("expanded"),
    ).toBe(true);
  });
});

describe("CSS rules", () => {
  it("gives .content vertical padding", () => {
    const rules = cssRules(PictureStudioSection.styles);
    expect(rules.get(".content")).toContain("padding: var(--ha-space-3)");
  });

  it("neutralises ha-expansion-panel's default 0 8px content padding", () => {
    const rules = cssRules(PictureStudioSection.styles);
    expect(rules.get("ha-expansion-panel")).toContain("--expansion-panel-content-padding: 0");
  });
});
