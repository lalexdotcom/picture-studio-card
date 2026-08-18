/**
 * The halo: a hairline rim and a soft glow, drawn by `filter` so it traces the
 * rendered silhouette — the glyph when there is no chrome, the surface when
 * there is one.
 *
 * The icon stands on the user's picture, not on the theme's background, so its
 * contrast has to hold against an unknown image, which no theme token can
 * promise. Hence literal white and black here, and only here.
 *
 * The glow is tuned for the filled silhouette — a chrome's disc, or the square
 * an entity picture paints — because that is where these values lay the most
 * ink: at 60% the edge read as a dark ring on a light picture rather than as a
 * shadow, so the opacity came down to 20%.
 *
 * The blur is a share of the element's own size value rather than a length: a
 * fixed 3px was 12.5% of a 24px icon and 7.5% of a 40px one, which is why a
 * small icon wore the halo as a band. 6% comes to 1.4px at 24px, 2.4px at 40px
 * and 2.9px at 48px, and calc() resolves the token whatever it holds —
 * including a clamp()ed value that changes with the card's width. The white rim
 * is part of none of this: a hairline stays a hairline at every size.
 *
 * Both halves are exposed as variables so a dashboard can dial them without
 * forking the element.
 *
 * @param sizeVar the element's size custom property, e.g. "--psc-icon-size".
 *                The override tokens are derived from it by replacing the
 *                "-size" suffix, so each kind keeps its own public names.
 */
export const haloFilter = (sizeVar: string): string => {
  const base = sizeVar.replace(/-size$/, "");
  return (
    `drop-shadow(var(${base}-outline, 0 0 1px rgba(255, 255, 255, 0.4))) ` +
    `drop-shadow(var(${base}-glow, 0 0 calc(var(${sizeVar}) * 0.06) rgba(0, 0, 0, 0.2)))`
  );
};
