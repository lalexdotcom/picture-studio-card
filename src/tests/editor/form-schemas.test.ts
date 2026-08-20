import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE, type PictureStudioConfig } from "../../config";
import {
  backgroundData,
  backgroundSchema,
  entitySchema,
  filtersSchema,
  headingSchema,
  mergeBackground,
} from "../../editor/form-schemas";
import type { LocalizeFunc } from "../../types";

const echo: LocalizeFunc = (key) => key;
const config = (over: Partial<PictureStudioConfig> = {}): PictureStudioConfig =>
  ({ type: CARD_TYPE, items: [], ...over }) as PictureStudioConfig;

const names = (schema: readonly { name: string }[]) => schema.map((f) => f.name);

describe("backgroundSchema", () => {
  it("hides camera_view when no entity is chosen", () => {
    expect(names(backgroundSchema(echo, config()))).toEqual([
      "image",
      "dark_mode_image",
      "picture_entity",
      "aspect_ratio",
    ]);
  });

  it("hides camera_view for an image entity", () => {
    const schema = backgroundSchema(echo, config({ image_entity: "image.plan" }));
    expect(names(schema)).not.toContain("camera_view");
  });

  it("shows camera_view for a camera, right after the entity field", () => {
    const schema = backgroundSchema(echo, config({ camera_image: "camera.door" }));
    expect(names(schema)).toEqual([
      "image",
      "dark_mode_image",
      "picture_entity",
      "camera_view",
      "aspect_ratio",
    ]);
  });

  it("bounds the entity field to image and camera", () => {
    const field = backgroundSchema(echo, config())[2] as {
      selector: { entity: { domain: string[] } };
    };
    expect(field.selector.entity.domain).toEqual(["image", "camera"]);
  });
});

describe("the other three schemas", () => {
  it("lists the heading fields", () => {
    expect(names(headingSchema(echo))).toEqual(["title", "icon"]);
  });

  it("lists the filters, both as object selectors", () => {
    const schema = filtersSchema(echo);
    expect(names(schema)).toEqual(["filter", "dark_mode_filter"]);
    // An object selector renders ha-yaml-editor: a code editor, which is what a
    // CSS filter chain deserves. HA already does this for dark_mode_filter.
    for (const field of schema) {
      expect((field as { selector: Record<string, unknown> }).selector).toHaveProperty("object");
    }
  });

  it("lists the entity fields with the entity first", () => {
    expect(names(entitySchema(echo))).toEqual(["entity", "state_image", "state_filter"]);
  });
});

describe("backgroundData", () => {
  it("shows the camera when both keys are set, because the camera renders", () => {
    const data = backgroundData(
      config({ camera_image: "camera.door", image_entity: "image.plan" }),
    );
    expect(data.picture_entity).toBe("camera.door");
  });

  it("shows the image entity when it is alone", () => {
    expect(backgroundData(config({ image_entity: "image.plan" })).picture_entity).toBe(
      "image.plan",
    );
  });

  it("wraps a plain image path for the media selector", () => {
    expect(backgroundData(config({ image: "/local/p.png" })).image).toEqual({
      media_content_id: "/local/p.png",
    });
  });

  it("passes an already-object-valued image through unchanged, metadata included", () => {
    const picked = {
      media_content_id: "media-source://media_source/local/p.png",
      metadata: { title: "p.png" },
    };
    expect(backgroundData(config({ image: picked })).image).toBe(picked);
  });

  it("passes an already-object-valued dark_mode_image through unchanged", () => {
    const picked = {
      media_content_id: "media-source://media_source/local/night.png",
      metadata: { title: "night.png" },
    };
    expect(backgroundData(config({ dark_mode_image: picked })).dark_mode_image).toBe(picked);
  });
});

describe("mergeBackground", () => {
  it("writes a camera and clears the image entity", () => {
    const next = mergeBackground(config({ image_entity: "image.plan" }), {
      picture_entity: "camera.door",
    });
    expect(next.camera_image).toBe("camera.door");
    expect("image_entity" in next).toBe(false);
  });

  it("writes an image entity and clears the camera AND its view", () => {
    const next = mergeBackground(config({ camera_image: "camera.door", camera_view: "live" }), {
      picture_entity: "image.plan",
    });
    expect(next.image_entity).toBe("image.plan");
    expect("camera_image" in next).toBe(false);
    expect("camera_view" in next).toBe(false);
  });

  it("clears camera_view even when ha-form submits it alongside the new entity", () => {
    // The camera_view dropdown is visible while a camera is selected; ha-form
    // includes it in the value-changed payload. sectionMerge writes it back into
    // next, so the dispatch's own delete is the only thing that removes it.
    const next = mergeBackground(config({ camera_image: "camera.door", camera_view: "live" }), {
      picture_entity: "image.plan",
      camera_view: "live",
    });
    expect(next.image_entity).toBe("image.plan");
    expect("camera_image" in next).toBe(false);
    expect("camera_view" in next).toBe(false);
  });

  it("clearing the field clears all three", () => {
    const next = mergeBackground(
      config({ camera_image: "camera.door", camera_view: "auto", image_entity: "image.plan" }),
      { picture_entity: "" },
    );
    expect("camera_image" in next).toBe(false);
    expect("camera_view" in next).toBe(false);
    expect("image_entity" in next).toBe(false);
  });

  it("never stores the synthetic key", () => {
    const next = mergeBackground(config(), { picture_entity: "camera.door" });
    expect("picture_entity" in next).toBe(false);
  });

  it("keeps camera_view while the entity is still a camera", () => {
    const next = mergeBackground(config({ camera_image: "camera.door", camera_view: "live" }), {
      picture_entity: "camera.door",
      camera_view: "live",
    });
    expect(next.camera_view).toBe("live");
  });

  it("stores the media selector value as written; the card unwraps at render", () => {
    const next = mergeBackground(config(), { image: { media_content_id: "/local/p.png" } });
    expect(next.image).toEqual({ media_content_id: "/local/p.png" });
  });
});
