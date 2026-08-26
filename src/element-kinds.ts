import type {
  ElementConfig,
  ImageElementConfig,
  StateIconConfig,
  StateLabelConfig,
} from "./config";
import { DEFAULT_ICON_SIZE, DEFAULT_LABEL_SIZE } from "./element-size";
import { DEFAULT_IMAGE_WIDTH } from "./image-box";
import type { ElementActions } from "./types";

/**
 * What a kind of element *is*, declared once: the config a fresh one is given,
 * and the actions it means when the user's config says nothing.
 *
 * It lives at the root rather than under `editor/` because both sides read it
 * and neither may import the other — `card/` never imports `editor/`, and the
 * reverse holds too. `image-box.ts` and its `ratioIsForced` are the precedent.
 *
 * Three places read it, and they must never disagree:
 *
 * - each element's `setConfig`, which merges `defaultActions` into the config it
 *   stores. That is where the merge belongs and not in a helper: `relayActions`
 *   hands the stored object itself to Home Assistant's `handleAction`, so the
 *   cursor, the gesture binding and what actually runs all read one object.
 *   Home Assistant's own elements do the same — `hui-image-element.setConfig`
 *   defaults a missing action to more-info, which is why the card has to pin
 *   `none` on the background;
 * - `stubElementConfig`, for the `stub` half;
 * - the forms, which **derive** their `ui_action` `default_action` from it and
 *   never merge. Merging in the editor would write these keys back into the
 *   user's config on the next save, which is exactly what nobody wants: the
 *   selector displays a default, it does not store one.
 */
export interface ElementKind<C extends ElementConfig> {
  stub: () => C;
  /**
   * Optional, and its absence is a decision rather than an omission: it
   * *delegates* to Home Assistant, whose default for a missing `tap_action` is
   * more-info. Writing that default out would say the same thing today and stop
   * following it the day Home Assistant changes.
   */
  defaultActions?: ElementActions;
  /**
   * Whether a corner handle can size this kind. The image alone: its `width` and
   * `height` are percentages of the background, while an icon and a label size
   * themselves through `ElementSize` — `clamp(min px, ratio cqw, max px)`, which
   * is not a box, and which a handle would have to pick one of three numbers
   * from. That is a different design.
   */
  resizable?: true;
}

/**
 * No entity is chosen: a badge gets one from its class's getStubConfig, we have
 * no equivalent, and attaching an arbitrary entity to a new icon would be worse
 * than the state-badge's own missing marker while the user picks one.
 */
export const STATE_ICON_KIND: ElementKind<StateIconConfig> = {
  stub: () => ({ type: "state-icon", size: { ...DEFAULT_ICON_SIZE } }),
};

export const STATE_LABEL_KIND: ElementKind<StateLabelConfig> = {
  // A label with nothing shown is an invisible item: showing the state is the
  // only stub that renders something the moment it is dropped.
  stub: () => ({ type: "state-label", show: ["state"], size: { ...DEFAULT_LABEL_SIZE } }),
};

export const IMAGE_KIND: ElementKind<ImageElementConfig> = {
  // No image: an image element with no source draws nothing at all, unlike a
  // state-icon, which gets HA's own missing-entity marker. The element's dashed
  // placeholder is what makes this state selectable and draggable.
  stub: () => ({ type: "image", width: DEFAULT_IMAGE_WIDTH }),
  /**
   * The one kind that does not delegate. An icon or a label always draws an
   * entity, so Home Assistant's more-info default is honest for them; a picture
   * may be pure decoration, and offering a cursor for a more-info that opens
   * nothing is what someone reported after clicking an image and watching
   * nothing happen.
   */
  defaultActions: { tap_action: { action: "none" } },
  resizable: true,
};

/** The kinds we implement. A new one is added here and nowhere else. */
export const ELEMENT_KINDS = {
  "state-icon": STATE_ICON_KIND,
  "state-label": STATE_LABEL_KIND,
  image: IMAGE_KIND,
} satisfies Record<string, ElementKind<ElementConfig>>;

/**
 * What a form's `ui_action` selector should DISPLAY for a slot the config leaves
 * empty. Home Assistant's own defaults are the fallback, and this is the only
 * copy of them we keep: a missing `tap_action` behaves as more-info, a missing
 * hold or double-tap as nothing at all.
 */
export const defaultActionName = (
  kind: ElementKind<ElementConfig>,
  slot: keyof ElementActions,
): string => kind.defaultActions?.[slot]?.action ?? (slot === "tap_action" ? "more-info" : "none");

/**
 * The config an element is stored with: what the user wrote, over what its kind
 * means by silence. Per key, so a user who sets only `hold_action` keeps the
 * kind's `tap_action` default.
 *
 * Spread keeps a key whose value is `undefined`, so `{ tap_action: undefined }`
 * would erase the default rather than fall back to it. Nothing reaches here that
 * way — YAML yields absence or `null`, and `ui_action` emits whole objects — but
 * the type permits it, so an internal caller building a config by hand should
 * omit the key rather than set it to `undefined`.
 */
export const withDefaultActions = <C extends ElementConfig>(kind: ElementKind<C>, config: C): C =>
  kind.defaultActions ? { ...kind.defaultActions, ...config } : config;

/** Whether a corner handle can size this element kind. */
export const isResizableKind = (type: string): boolean =>
  (ELEMENT_KINDS as Record<string, ElementKind<ElementConfig> | undefined>)[type]?.resizable ===
  true;
