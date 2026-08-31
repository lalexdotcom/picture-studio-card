import { afterEach, describe, expect, it } from "@rstest/core";
import { captureRatio, pictureKey, recallRatio, resetRatioMemory } from "../../picture-ratio";

afterEach(resetRatioMemory);

/** A `hui-image` stand-in whose open shadow root holds an `<img>`. */
const huiImageWith = (natural: { w: number; h: number } | undefined): Element => {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  if (natural) {
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: natural.w });
    Object.defineProperty(img, "naturalHeight", { value: natural.h });
    shadow.append(img);
  }
  return host;
};

describe("pictureKey", () => {
  it("names an entity by its id, never by its URL", () => {
    // entity_picture carries a token that rotates; the ratio does not. Keying on
    // the URL would forget the shape every time the token turned over.
    expect(pictureKey({ camera_image: "camera.front" })).toBe("camera:camera.front");
    expect(pictureKey({ image_entity: "image.doorbell" })).toBe("entity:image.doorbell");
  });

  it("names a file by its path, through the media selector's wrapper", () => {
    expect(pictureKey({ image: "/local/plan.png" })).toBe("file:/local/plan.png");
  });

  it("follows hui-image's own precedence when a config carries several", () => {
    // camera_image beats image_entity beats image, which is the order
    // `hui-image` itself arbitrates in — measured on frontend 20260729.6.
    expect(
      pictureKey({ camera_image: "camera.front", image_entity: "image.a", image: "/local/p.png" }),
    ).toBe("camera:camera.front");
    expect(pictureKey({ image_entity: "image.a", image: "/local/p.png" })).toBe("entity:image.a");
  });

  it("has nothing to say about a config with no picture", () => {
    expect(pictureKey({})).toBeUndefined();
  });
});

describe("the ratio memo", () => {
  it("remembers a settled picture and hands it back in hui-image's spelling", () => {
    captureRatio("file:/local/plan.png", huiImageWith({ w: 1500, h: 1761 }));
    expect(recallRatio("file:/local/plan.png")).toBe("1500x1761");
  });

  it("outlives the element it was measured on", () => {
    // The whole point: Home Assistant destroys the card on every config change,
    // so the memo is what a rebuilt element has instead of a measurement.
    const first = huiImageWith({ w: 800, h: 600 });
    captureRatio("file:/local/a.png", first);
    first.remove();
    expect(recallRatio("file:/local/a.png")).toBe("800x600");
  });

  it("corrects itself when the picture at a key turns out to be another shape", () => {
    captureRatio("file:/local/a.png", huiImageWith({ w: 800, h: 600 }));
    captureRatio("file:/local/a.png", huiImageWith({ w: 400, h: 900 }));
    expect(recallRatio("file:/local/a.png")).toBe("400x900");
  });

  it("remembers nothing rather than something wrong", () => {
    // An image that has not loaded reports 0, and a keyless config or a missing
    // element must not write an entry a later mount would trust.
    captureRatio("file:/local/a.png", huiImageWith({ w: 0, h: 0 }));
    captureRatio("file:/local/b.png", huiImageWith(undefined));
    captureRatio("file:/local/c.png", null);
    captureRatio(undefined, huiImageWith({ w: 10, h: 10 }));
    expect(recallRatio("file:/local/a.png")).toBeUndefined();
    expect(recallRatio("file:/local/b.png")).toBeUndefined();
    expect(recallRatio("file:/local/c.png")).toBeUndefined();
    expect(recallRatio(undefined)).toBeUndefined();
  });
});
