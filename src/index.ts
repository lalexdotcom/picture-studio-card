import { PictureBadgesCard } from "./card/picture-badges-card";
import { CARD_TAG } from "./config";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureBadgesCard);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Badges",
  description: "An image with badges you position by drag and drop.",
  preview: true,
});
