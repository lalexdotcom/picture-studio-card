import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE } from "../config";
import { entitySuggestion } from "../suggestion";

describe("entitySuggestion", () => {
  it("suggests the card with the camera as background", () => {
    expect(entitySuggestion("camera.front_door")).toEqual({
      config: { type: CARD_TYPE, camera_image: "camera.front_door", items: [] },
    });
  });

  it("suggests the card with an image entity as background", () => {
    expect(entitySuggestion("image.floorplan")).toEqual({
      config: { type: CARD_TYPE, image_entity: "image.floorplan", items: [] },
    });
  });

  it("declines every other domain, including one this card could host as a badge", () => {
    expect(entitySuggestion("light.salon")).toBeNull();
    expect(entitySuggestion("sensor.temperature")).toBeNull();
    expect(entitySuggestion("person.alex")).toBeNull();
  });

  it("declines a malformed entity id rather than guessing", () => {
    expect(entitySuggestion("camera")).toBeNull();
    expect(entitySuggestion("")).toBeNull();
  });
});
