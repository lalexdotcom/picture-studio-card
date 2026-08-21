import { describe, expect, it } from "@rstest/core";
import {
  CARD_TAG,
  EDITOR_TAG,
  ELEMENT_FORM_TAG,
  FORM_TAG,
  HEADING_SECTION_TAG,
  HEADING_TAG,
  ICON_TAG,
  LABEL_TAG,
  LIST_TAG,
  PICKER_TAG,
  PROBE_TAG,
  SECTION_TAG,
  VISIBILITY_SECTION_TAG,
} from "../../config";
import "../../index";

/**
 * Every custom element we ship must be registered when `index.ts` is imported.
 * A missing entry here means the element silently renders nothing in production
 * even though it appears in the DOM — there is no browser error, no warning,
 * just invisible boxes.
 *
 * HA's own elements (hui-heading-badge, hui-heading-badges-editor, ha-form, …)
 * must NOT appear in this list; they are HA's responsibility.
 */
describe("custom element registration (src/index.ts)", () => {
  const OUR_TAGS = [
    CARD_TAG,
    HEADING_TAG,
    EDITOR_TAG,
    LIST_TAG,
    FORM_TAG,
    PICKER_TAG,
    ICON_TAG,
    LABEL_TAG,
    ELEMENT_FORM_TAG,
    PROBE_TAG,
    VISIBILITY_SECTION_TAG,
    SECTION_TAG,
    HEADING_SECTION_TAG,
  ] as const;

  for (const tag of OUR_TAGS) {
    it(`registers <${tag}>`, () => {
      expect(customElements.get(tag)).toBeDefined();
    });
  }
});
