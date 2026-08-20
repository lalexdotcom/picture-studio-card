import { type CSSResult, css } from "lit";

/**
 * Shared adornment styles for the section headers that put a count pill and a
 * glyph beside their title. Consumed by both PictureStudioEditor (Items) and
 * PictureStudioVisibilitySection, whose shadow roots are separate — a rule
 * shared by inheritance would require a common ancestor, so each consumer
 * includes this block in its own styles array instead.
 *
 * Order in the event slot: glyph first, count second. The pill sits further
 * from the title than the glyph, so its margin is larger.
 *
 * Using <span class="count"> rather than <ha-label dense> removes one
 * dependency on a Home Assistant element being defined — an undefined custom
 * element renders nothing at all, silently.
 */
export const headerAdornments: CSSResult = css`
  .count {
    font-size: var(--ha-font-size-xs);
    font-weight: var(--ha-font-weight-bold);
    color: var(--primary-text-color);
    /* Fallback for browsers without color-mix support; the mix overrides it everywhere it
       is understood. 12% is an eye value — turn it first if the pill reads too faint or strong. */
    background: var(--ha-color-fill-neutral-normal-resting);
    background: color-mix(in srgb, var(--input-fill-color) 88%, var(--primary-text-color) 12%);
    border-radius: var(--ha-border-radius-pill, 9999px);
    padding: 0 var(--ha-space-2);
    line-height: var(--ha-space-5);
    margin-inline-start: var(--ha-space-3, 12px);
  }
`;
