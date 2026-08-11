import { PictureBadgesCard } from "./card/picture-badges-card";
import { CARD_TAG, EDITOR_TAG } from "./config";
import { PictureBadgesEditor } from "./editor/picture-badges-editor";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureBadgesCard);
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, PictureBadgesEditor);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Badges",
  description: "An image with badges you position by drag and drop.",
  preview: true,
});
