import type { ElementConfig } from "../config";
import { ELEMENT_KINDS } from "../element-kinds";
import type { LocalizeFunc } from "../types";

export const elementCatalog = (): { type: string }[] =>
  Object.keys(ELEMENT_KINDS).map((type) => ({ type }));

/** Home Assistant already translates these, under picture-elements' own keys. */
export const elementLabel = (localize: LocalizeFunc, type: string): string =>
  localize(`ui.panel.lovelace.editor.card.picture-elements.element_types.${type}`) || type;

/**
 * The config a freshly dropped element is given. Every kind's own is declared in
 * `element-kinds.ts`, which the card side reads too; this only picks one.
 */
export const stubElementConfig = (type: string): ElementConfig => {
  const kind = (ELEMENT_KINDS as Record<string, { stub: () => ElementConfig }>)[type];
  if (!kind) throw new Error(`picture-studio: unknown element type "${type}"`);
  return kind.stub();
};
