import { PictureStudioCard } from "./card/picture-studio-card";
import { CARD_TAG, EDITOR_TAG, FORM_TAG, LIST_TAG, PICKER_TAG } from "./config";
import { PictureStudioAnchorPicker } from "./editor/anchor-picker";
import { PictureStudioBadgeForm } from "./editor/badge-form";
import { PictureStudioBadgeList } from "./editor/badge-list";
import { PictureStudioEditor } from "./editor/picture-studio-editor";
import { entitySuggestion } from "./suggestion";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureStudioCard);
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
