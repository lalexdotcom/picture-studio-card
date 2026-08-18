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
export const haloStyles = (sizeVar: string): CSSResult => css`
  :host([halo]) .chrome {
    filter: ${unsafeCSS(haloFilter(sizeVar))};
  }
`;
