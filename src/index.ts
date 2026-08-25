import { PictureStudioHeading } from "./card/card-heading";
import { PictureStudioImage } from "./card/image-element";
import { PictureStudioCard } from "./card/picture-studio-card";
import { PictureStudioStateIcon } from "./card/state-icon-element";
import { PictureStudioStateLabel } from "./card/state-label-element";
import { PictureStudioVisibilityProbe } from "./card/visibility-probe";
import {
  CARD_TAG,
  EDITOR_TAG,
  ELEMENT_FORM_TAG,
  FORM_TAG,
  HEADING_SECTION_TAG,
  HEADING_TAG,
  ICON_TAG,
  IMAGE_TAG,
  LABEL_TAG,
  LIST_TAG,
  PICKER_TAG,
  PROBE_TAG,
  SECTION_TAG,
  VISIBILITY_SECTION_TAG,
} from "./config";
import { PictureStudioAnchorPicker } from "./editor/anchor-picker";
import { PictureStudioBadgeForm } from "./editor/badge-form";
import { PictureStudioBadgeList } from "./editor/badge-list";
import { PictureStudioElementForm } from "./editor/element-form";
import { PictureStudioHeadingSection } from "./editor/heading-section";
import { PictureStudioEditor } from "./editor/picture-studio-editor";
import { PictureStudioSection } from "./editor/section-panel";
import { PictureStudioVisibilitySection } from "./editor/visibility-section";
import { entitySuggestion } from "./suggestion";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureStudioCard);
}

if (!customElements.get(HEADING_TAG)) {
  customElements.define(HEADING_TAG, PictureStudioHeading);
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, PictureStudioEditor);
}

if (!customElements.get(LIST_TAG)) {
  customElements.define(LIST_TAG, PictureStudioBadgeList);
}

if (!customElements.get(FORM_TAG)) {
  customElements.define(FORM_TAG, PictureStudioBadgeForm);
}

if (!customElements.get(PICKER_TAG)) {
  customElements.define(PICKER_TAG, PictureStudioAnchorPicker);
}

if (!customElements.get(ICON_TAG)) customElements.define(ICON_TAG, PictureStudioStateIcon);
if (!customElements.get(IMAGE_TAG)) customElements.define(IMAGE_TAG, PictureStudioImage);
if (!customElements.get(LABEL_TAG)) customElements.define(LABEL_TAG, PictureStudioStateLabel);

if (!customElements.get(ELEMENT_FORM_TAG)) {
  customElements.define(ELEMENT_FORM_TAG, PictureStudioElementForm);
}

if (!customElements.get(PROBE_TAG)) {
  customElements.define(PROBE_TAG, PictureStudioVisibilityProbe);
}

if (!customElements.get(VISIBILITY_SECTION_TAG)) {
  customElements.define(VISIBILITY_SECTION_TAG, PictureStudioVisibilitySection);
}

if (!customElements.get(SECTION_TAG)) {
  customElements.define(SECTION_TAG, PictureStudioSection);
}

if (!customElements.get(HEADING_SECTION_TAG)) {
  customElements.define(HEADING_SECTION_TAG, PictureStudioHeadingSection);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Studio",
  description: "Place badges on an image and position them by dragging them on the live preview.",
  preview: true,
  // HA passes (hass, entityId); hass is unused — the domain is enough to decide,
  // and reading state would only make the answer flakier.
  getEntitySuggestion: (_hass, entityId) => entitySuggestion(entityId),
});
