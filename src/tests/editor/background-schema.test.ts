import { describe, expect, it } from "@rstest/core";
import type { PictureStudioConfig } from "../../config";
import { CARD_TYPE } from "../../config";
import {
  type BackgroundData,
  backgroundData,
  backgroundLabel,
  backgroundSchema,
  mergeBackground,
} from "../../editor/background-schema";
import type { LocalizeFunc } from "../../types";

/** Echoes the key back, so a test can assert which key was asked for. */
const echo: LocalizeFunc = (key) => key;
/** HA returns "" for a key it does not know. */
const missing: LocalizeFunc = () => "";

const config = (over: Partial<PictureStudioConfig> = {}): PictureStudioConfig => ({
  type: CARD_TYPE,
  items: [],
  ...over,
});

describe("backgroundSchema", () => {
  const fields = backgroundSchema(echo)[0].schema;

  it("mirrors picture-elements' field list, minus theme", () => {
    expect(fields.map((f) => f.name)).toEqual([
      "title",
      "image",
      "dark_mode_image",
      "camera_image",
      "camera_view",
      "state_filter",
      "dark_mode_filter",
    ]);
  });

  it("titles the expandable section with HA's own key", () => {
    expect(backgroundSchema(echo)[0].title).toBe(
      "ui.panel.lovelace.editor.card.picture-elements.card_options",
    );
  });

  it("localises the camera_view options instead of showing raw values", () => {
    const cameraView = fields.find((f) => f.name === "camera_view");
    expect(cameraView?.selector.select.options).toEqual([
      {
        value: "auto",
        label: "ui.panel.lovelace.editor.card.generic.camera_view_options.auto",
      },
      {
        value: "live",
        label: "ui.panel.lovelace.editor.card.generic.camera_view_options.live",
      },
    ]);
  });
});

describe("backgroundLabel", () => {
  it("reads the generic namespace by default", () => {
    expect(backgroundLabel(echo, "camera_image")).toBe(
      "ui.panel.lovelace.editor.card.generic.camera_image",
    );
  });

  it("reads the picture-elements namespace for the three keys HA puts there", () => {
    for (const name of ["dark_mode_image", "state_filter", "dark_mode_filter"]) {
      expect(backgroundLabel(echo, name)).toBe(
        `ui.panel.lovelace.editor.card.picture-elements.${name}`,
      );
    }
  });

  it("falls back to the raw field name when the key is unknown", () => {
    expect(backgroundLabel(missing, "camera_image")).toBe("camera_image");
  });
});

describe("backgroundData", () => {
  it("wraps a plain path so the media selector can display it", () => {
    const data = backgroundData(config({ image: "/local/plan.png" }));
    expect(data.image).toEqual({ media_content_id: "/local/plan.png" });
  });

  it("wraps dark_mode_image the same way", () => {
    const data = backgroundData(config({ dark_mode_image: "/local/night.png" }));
    expect(data.dark_mode_image).toEqual({ media_content_id: "/local/night.png" });
  });

  it("leaves a value the picker already wrote untouched", () => {
    const picked = { media_content_id: "media-source://x", metadata: { title: "Plan" } };
    expect(backgroundData(config({ image: picked })).image).toBe(picked);
  });

  it("exposes only the form's keys", () => {
    const data = backgroundData(
      config({ title: "Plan", image: "/local/plan.png", entity: "light.a", filter: "blur(1px)" }),
    );
    expect(Object.keys(data).sort()).toEqual([
      "camera_image",
      "camera_view",
      "dark_mode_filter",
      "dark_mode_image",
      "image",
      "state_filter",
      "title",
    ]);
    expect(data.title).toBe("Plan");
  });
});

describe("mergeBackground", () => {
  it("drops keys the form left empty", () => {
    const next = mergeBackground(config({ title: "Plan" }), {
      title: "",
      image: undefined,
    } as BackgroundData);
    expect("title" in next).toBe(false);
    expect("image" in next).toBe(false);
  });

  it("leaves YAML-only keys untouched", () => {
    const next = mergeBackground(config({ entity: "light.a", aspect_ratio: "16:9" }), {
      image: "/local/plan.png",
    } as BackgroundData);
    expect(next.entity).toBe("light.a");
    expect(next.aspect_ratio).toBe("16:9");
    expect(next.image).toBe("/local/plan.png");
  });
});
