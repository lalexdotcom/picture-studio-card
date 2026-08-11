import { PictureBadgesCard } from "./card/picture-badges-card";
import { CARD_TAG, EDITOR_TAG, FORM_TAG, LIST_TAG } from "./config";
import { PictureBadgeForm } from "./editor/badge-form";
import { PictureBadgesList } from "./editor/badge-list";
import { PictureBadgesEditor } from "./editor/picture-badges-editor";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureBadgesCard);
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, PictureBadgesEditor);
}

if (!customElements.get(LIST_TAG)) {
  customElements.define(LIST_TAG, PictureBadgesList);
}

if (!customElements.get(FORM_TAG)) {
  customElements.define(FORM_TAG, PictureBadgeForm);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Badges",
  description: "An image with badges you position by drag and drop.",
  preview: true,
});
