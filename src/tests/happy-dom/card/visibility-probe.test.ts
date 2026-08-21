import { describe, expect, it } from "@rstest/core";
import { PictureStudioVisibilityProbe } from "../../../card/visibility-probe";
import { PROBE_TAG, PROBE_TYPE } from "../../../config";

const mount = (): PictureStudioVisibilityProbe => {
  if (!customElements.get(PROBE_TAG)) {
    customElements.define(PROBE_TAG, PictureStudioVisibilityProbe);
  }
  return document.createElement(PROBE_TAG) as PictureStudioVisibilityProbe;
};

describe("the visibility probe's phantom card", () => {
  it("names its custom type after its tag", () => {
    expect(PROBE_TAG).toBe("picture-studio-visibility-probe");
    expect(PROBE_TYPE).toBe("custom:picture-studio-visibility-probe");
  });

  it("accepts any config, since it carries no options of its own", () => {
    const probe = mount();
    expect(() => probe.setConfig({ type: PROBE_TYPE })).not.toThrow();
    expect(() => probe.setConfig(undefined)).not.toThrow();
  });

  it("claims no height", () => {
    expect(mount().getCardSize()).toBe(0);
  });

  it("renders nothing", () => {
    const probe = mount();
    probe.setConfig({ type: PROBE_TYPE });
    document.body.append(probe);
    expect(probe.childNodes.length).toBe(0);
    expect(probe.shadowRoot).toBeNull();
    probe.remove();
  });
});
