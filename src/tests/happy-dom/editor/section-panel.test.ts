import { afterEach, describe, expect, it } from "@rstest/core";
import { SECTION_TAG } from "../../../config";
import { PictureStudioSection } from "../../../editor/section-panel";
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

describe("expand()", () => {
  it("opens a closed panel and returns true", async () => {
    const el = await mount(); // closed by default (open = false)
    const result = await el.expand();
    const panel = el.shadowRoot?.querySelector("ha-expansion-panel") as {
      expanded?: boolean;
    } | null;
    expect(panel?.expanded).toBe(true);
    expect(result).toBe(true);
  });

  it("returns false when the panel is already open", async () => {
    const el = await mount({ open: true });
    const result = await el.expand();
    expect(result).toBe(false);
  });

  it("returns false when the panel is absent, without throwing", async () => {
    if (!customElements.get(SECTION_TAG)) customElements.define(SECTION_TAG, PictureStudioSection);
    const el = document.createElement(SECTION_TAG) as PictureStudioSection;
    // Not appended — no render, so shadow root has no panel yet.
    await expect(el.expand()).resolves.toBe(false);
  });

  it("remains open after a manual fold and a second expand() call", async () => {
    // This test guards the imperative approach: a binding-driven implementation
    // (this.open = true) passes the first expand() but fails the second because
    // Lit does not re-render when the bound value has not changed — the panel
    // stays shut after the manual fold.
    const el = await mount();
    await el.expand();
    // Fold the panel the way Home Assistant's click handler does.
    const panel = el.shadowRoot?.querySelector("ha-expansion-panel") as HTMLElement & {
      expanded?: boolean;
    };
    panel.expanded = false;
    await el.expand();
    expect(panel?.expanded).toBe(true);
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

  it("sets interpolate-size on ha-expansion-panel so the height transition works on a programmatic open", () => {
    const rules = cssRules(PictureStudioSection.styles);
    expect(rules.get("ha-expansion-panel")).toContain("interpolate-size: allow-keywords");
  });
});
