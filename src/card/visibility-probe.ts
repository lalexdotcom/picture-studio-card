/**
 * The card a visibility probe carries inside it.
 *
 * A probe is a `hui-card` — Home Assistant's own implementation of the
 * `visibility` key — and `hui-card._updateVisibility` returns early when it has
 * no inner element, so a probe with no card evaluates nothing. This is that
 * card, and it is deliberately the cheapest object satisfying the contract: it
 * renders nothing, ignores `hass`, loads no chunk and opens no subscription.
 *
 * It is never pushed to `window.customCards`, so it cannot appear in the card
 * picker. A real Home Assistant card in this position would cost a chunk load, a
 * render and a `hass` propagation per item, for a card kept at `display: none`.
 */
export class PictureStudioVisibilityProbe extends HTMLElement {
  /**
   * Accepts anything. The config is ours, it carries only the type and the
   * conditions — which are read by the `hui-card` above, never here — and
   * `createCardElement` calls this with whatever it was handed.
   */
  setConfig(_config: unknown): void {}

  /** Home Assistant asks every card; nothing is drawn, so nothing is claimed. */
  getCardSize(): number {
    return 0;
  }
}
