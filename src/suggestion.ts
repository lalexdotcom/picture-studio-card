import { CARD_TYPE, type PictureStudioConfig } from "./config";

/** What HA's card picker expects back from a suggestion provider. */
export interface CardSuggestion {
  label?: string;
  config: PictureStudioConfig;
}

/**
 * Offered in the card picker's entity-first flow. HA calls this for every custom
 * card, groups what comes back under its own heading, and swallows a throw.
 *
 * Only camera and image entities get an answer: they are the two that can *be*
 * the background. This card has no primary entity, so suggesting it for, say, a
 * light would be noise in a list meant to be short. Returning null is how every
 * core provider declines.
 */
export const entitySuggestion = (entityId: string): CardSuggestion | null => {
  const [domain, objectId] = entityId.split(".");
  // A bare "camera" is not an entity id; decline rather than build a config
  // around something that will never resolve.
  if (!objectId) return null;

  if (domain === "camera") {
    return { config: { type: CARD_TYPE, camera_image: entityId, items: [] } };
  }
  if (domain === "image") {
    return { config: { type: CARD_TYPE, image_entity: entityId, items: [] } };
  }
  return null;
};
