import type { ElementConfig } from "../config";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "../element-size";
import { DEFAULT_IMAGE_WIDTH } from "../image-box";
import type { LocalizeFunc } from "../types";

/** The kinds we implement. A new one is added here and nowhere else. */
export const ELEMENT_KINDS = ["state-icon", "state-label", "image"] as const;

export const elementCatalog = (): { type: string }[] => ELEMENT_KINDS.map((type) => ({ type }));

/** Home Assistant already translates these, under picture-elements' own keys. */
export const elementLabel = (localize: LocalizeFunc, type: string): string =>
  localize(`ui.panel.lovelace.editor.card.picture-elements.element_types.${type}`) || type;

/**
 * No entity is chosen: a badge gets one from its class's getStubConfig, we have
 * no equivalent, and attaching an arbitrary entity to a new icon would be worse
 * than the state-badge's own missing marker while the user picks one.
 */
export const stubElementConfig = (type: string): ElementConfig => {
  if (type === "state-icon") return { type: "state-icon", size: { ...DEFAULT_ICON_SIZE } };
  if (type === "state-label") {
    // A label with nothing shown is an invisible item: showing the state is the
    // only stub that renders something the moment it is dropped.
    return { type: "state-label", show: ["state"], size: { ...DEFAULT_LABEL_SIZE } };
  }
  // No image: an image element with no source draws nothing at all, unlike a
  // state-icon, which gets HA's own missing-entity marker. The element's dashed
  // placeholder is what makes this state selectable and draggable.
  if (type === "image") return { type: "image", width: DEFAULT_IMAGE_WIDTH };
  throw new Error(`picture-studio: unknown element type "${type}"`);
};
