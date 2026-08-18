import { type CSSResult, css, unsafeCSS } from "lit";
import { haloFilter } from "../halo";

/**
 * The chrome's surface: what it is made of, and how much of the picture shows
 * through it. Shared by every element kind, because the theme and the opacity
 * mean the same thing whatever the item is — only the shape around them (a
 * disc, a pill, a padding) belongs to the kind.
 *
 * The fill sits on a pseudo-element so its opacity is its own: fading the
 * surface must not fade what stands on it. `border-radius: inherit` is what
 * lets each kind decide the shape without this rule knowing it.
 */
export const chromeFillStyles: CSSResult = css`
  :host([chrome]) .chrome::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--psc-chrome-fill);
    opacity: var(--psc-chrome-opacity, 1);
  }
`;

/**
 * The halo, bound to the kind's own size token — an icon scales it on its box,
 * a label on its body, and the recipe itself lives in one place either way.
 *
 * Opt-in since 1.4.0: unconditional until then. The shape and the clipping are
 * NOT here — they belong to the chrome, and conflating the two is what once
 * clipped every chromeless icon into a circle.
 */
/**
 * The pointer feedback, one recipe for every element kind — which is what makes
 * an icon and a label standing on the same picture answer the mouse the same
 * way.
 *
 * Two treatments, and which one applies is decided by what the item is made of
 * rather than by a setting. **With a chrome**, there is a surface to tint, so it
 * takes a veil of the item's own colour — Home Assistant's badge recipe, whose
 * ripple is 4% of the badge's colour and 12% while pressed. **Without a chrome**,
 * there is nothing to tint: a glyph or a line of text on a photograph, where a
 * 4% veil is invisible. So the item grows instead, the affordance it carried
 * from 1.2.0.
 *
 * `will-change` is on the growing case alone, and it is not an optimisation:
 * under `anchor: auto` an item is placed by `translate(-left%, -top%)` of its
 * own box, which lands on a fractional pixel, and a scale animation that is
 * re-rasterized every frame snaps to the pixel grid differently each time. Promoting
 * the layer makes the browser rasterize once and composite — the jump the user
 * saw in a panel view at exactly 50% / 50% goes away.
 *
 * The veil is deliberately independent of `--psc-chrome-opacity`: a translucent
 * chrome must not mute the answer to the mouse. Both opacities sit behind tokens
 * so a dashboard can push them without forking the card.
 *
 * No guard for edit mode: the card already sets
 * `.editing .item > * { pointer-events: none }`, so no hover reaches an element
 * while the editor is open.
 */
export const interactionStyles: CSSResult = css`
  :host([clickable]) {
    cursor: pointer;
  }
  /* The veil. Present whenever a chrome is, transparent until the mouse arrives,
     so only its opacity animates — nothing to re-rasterize. */
  :host([chrome]) .chrome::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--psc-item-color, var(--psc-inactive-color));
    opacity: 0;
    transition: opacity 120ms ease-out;
    pointer-events: none;
  }
  :host([chrome][clickable]:hover) .chrome::after {
    opacity: var(--psc-hover-opacity, 0.04);
  }
  :host([chrome][clickable]:active) .chrome::after {
    opacity: var(--psc-pressed-opacity, 0.12);
  }
  /* The grow, for the chromeless item only. Scale goes on the host — the card's
     wrapper carries translate(…) and must not be touched; 50% 50% is the default
     transform-origin, so the item scales from its own centre whatever its
     anchor. */
  :host([clickable]:not([chrome])) {
    transition: transform 120ms ease-out;
    will-change: transform;
  }
  :host([clickable]:not([chrome]):hover) {
    transform: scale(1.08);
  }
`;

export const haloStyles = (sizeVar: string): CSSResult => css`
  :host([halo]) .chrome {
    filter: ${unsafeCSS(haloFilter(sizeVar))};
  }
`;
