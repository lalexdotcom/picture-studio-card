import { describe, expect, test } from "@rstest/core";
import type { ImageElementConfig } from "../../../config";
import { PICTURE_ENTITY } from "../../../editor/form-schemas";
import { imageForm, KEEP_RATIO } from "../../../editor/image-form";

const base: ImageElementConfig = { type: "image", width: 40, image: "/a.png" };

describe("imageForm.toFormData", () => {
  test("keep_ratio is derived from the absence of a height, never stored", () => {
    expect(imageForm.toFormData(base)[KEEP_RATIO]).toBe(true);
    expect(imageForm.toFormData({ ...base, height: 25 })[KEEP_RATIO]).toBe(false);
  });

  test("the picture entity is the synthetic field, camera first", () => {
    expect(imageForm.toFormData({ ...base, image_entity: "image.door" })[PICTURE_ENTITY]).toBe(
      "image.door",
    );
    expect(
      imageForm.toFormData({ ...base, image_entity: "image.door", camera_image: "camera.hall" })[
        PICTURE_ENTITY
      ],
    ).toBe("camera.hall");
  });
});

describe("imageForm.fromFormData", () => {
  test("ticking keep_ratio removes the height key entirely", () => {
    const next = imageForm.fromFormData(
      { ...base, height: 25 },
      {
        ...imageForm.toFormData({ ...base, height: 25 }),
        [KEEP_RATIO]: true,
      },
    );
    expect(next).not.toHaveProperty("height");
  });

  test("clearing keep_ratio writes a height rather than leaving the key absent", () => {
    const next = imageForm.fromFormData(base, {
      ...imageForm.toFormData(base),
      [KEEP_RATIO]: false,
    });
    expect(typeof next.height).toBe("number");
    expect(next.height).toBeGreaterThan(0);
  });

  test("the synthetic field never reaches the config", () => {
    const next = imageForm.fromFormData(base, {
      ...imageForm.toFormData(base),
      [PICTURE_ENTITY]: "camera.hall",
    });
    expect(next).not.toHaveProperty(PICTURE_ENTITY);
    expect(next).not.toHaveProperty(KEEP_RATIO);
    expect(next.camera_image).toBe("camera.hall");
  });

  test("aspect_ratio is neither offered nor destroyed", () => {
    const withRatio = { ...base, aspect_ratio: "16:9" } as ImageElementConfig & {
      aspect_ratio: string;
    };
    const next = imageForm.fromFormData(withRatio, imageForm.toFormData(withRatio));
    expect((next as { aspect_ratio?: string }).aspect_ratio).toBe("16:9");
  });
});
