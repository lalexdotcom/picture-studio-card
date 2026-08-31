import { afterEach, describe, expect, it } from "@rstest/core";
import { createResizeController } from "../../../card/resize-layer";
import type { ImageBox, LiveCameraKeys } from "../../../image-box";
import type { Anchor, Position } from "../../../position";
import type { Grip } from "../../../resize-box";

/**
 * happy-dom performs no layout, so the wrapper's box is stubbed — and here the
 * stub has to be **dynamic**. In keep-ratio mode the controller writes a width
 * and reads the height back, exactly as a browser would resolve `height: auto`;
 * a fixed rect would answer the same height whatever the width, and every
 * keep-ratio assertion would pass for the wrong reason.
 */
const SURFACE = { width: 400, height: 300 };

const setup = (options?: {
  /** The item's box in surface pixels at pointerdown. */
  box?: { x: number; y: number; width: number; height: number };
  /** The intrinsic ratio the stubbed image holds while height is auto. */
  intrinsic?: number;
  config?: ImageBox & LiveCameraKeys;
  anchor?: Anchor;
  position?: Position;
  grip?: Grip;
}) => {
  const box = options?.box ?? { x: 40, y: 30, width: 80, height: 40 };
  const intrinsic = options?.intrinsic ?? 2; // width / height
  const config = options?.config ?? { width: 20 };

  const root = document.createElement("div");
  const surface = document.createElement("div");
  const wrapper = document.createElement("div");
  const handle = document.createElement("div");
  wrapper.append(handle);
  root.append(surface, wrapper);
  document.body.append(root);

  surface.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: SURFACE.width,
      height: SURFACE.height,
      right: SURFACE.width,
      bottom: SURFACE.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  /**
   * The wrapper's live box. Before the gesture writes anything it is the stored
   * one; once the gesture writes pixels it is what those pixels say — and an
   * empty height is resolved from the intrinsic ratio, which is the browser's
   * job and the one this stub has to do honestly.
   */
  wrapper.getBoundingClientRect = () => {
    const w = wrapper.style.width ? Number.parseFloat(wrapper.style.width) : box.width;
    const h = wrapper.style.height ? Number.parseFloat(wrapper.style.height) : w / intrinsic;
    const left = wrapper.style.left ? Number.parseFloat(wrapper.style.left) : box.x;
    const top = wrapper.style.top ? Number.parseFloat(wrapper.style.top) : box.y;
    return {
      left,
      top,
      width: w,
      height: h,
      right: left + w,
      bottom: top + h,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  };

  const commits: { index: number; box: ImageBox; position?: Position }[] = [];
  const stretches: (boolean | undefined)[] = [];

  const controller = createResizeController({
    getHandle: (target) =>
      target === handle
        ? { element: wrapper, index: 0, grip: options?.grip ?? "bottom-right" }
        : undefined,
    getSurface: () => surface,
    getAnchor: () => options?.anchor ?? "top-left",
    getPosition: () => options?.position ?? { left: 10, top: 10 },
    getConfig: () => config,
    onCommit: (index, b, position) => commits.push({ index, box: b, position }),
    onStretch: (_index, stretched) => stretches.push(stretched),
  });
  controller.attach(root);

  const send = (
    type: string,
    clientX: number,
    clientY: number,
    modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
    target: HTMLElement = handle,
  ): void => {
    target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        clientX,
        clientY,
        button: 0,
        bubbles: true,
        ...modifiers,
      }),
    );
  };

  const key = (type: "keydown" | "keyup", shiftKey: boolean): void => {
    window.dispatchEvent(new KeyboardEvent(type, { key: "Shift", shiftKey, bubbles: true }));
  };

  return { root, wrapper, handle, surface, commits, stretches, controller, send, key };
};

afterEach(() => document.body.replaceChildren());

describe("createResizeController", () => {
  it("keeps the ratio by default: the width follows the diagonal and the height is left auto", () => {
    // Box 80x40 at (40,30), bottom-right grabbed. The pointer asks for 160x40;
    // the lock projects that onto the 2:1 diagonal.
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 70);

    // kx = 2, ky = 1 -> k = (2*6400 + 1*1600) / 8000 = 1.8 -> width 144
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(144, 6);
    // Keep-ratio writes no height at all: the image holds the ratio itself.
    expect(h.wrapper.style.height).toBe("");
  });

  it("locks the ratio in pixels, not on the stored percentages", () => {
    // The trap of the whole design: width is a % of 400 and height a % of 300,
    // so a square box is NOT equal percentages. A non-square surface and a
    // non-square box are what make the two formulas disagree.
    const h = setup({ box: { x: 0, y: 0, width: 80, height: 40 }, intrinsic: 2 });
    h.send("pointerdown", 80, 40);
    h.send("pointermove", 160, 80);
    h.send("pointerup", 160, 80);

    const box = h.commits[0]?.box as ImageBox;
    // 160x80 in pixels -> 40% of 400 wide. Keep-ratio, so no height is stored.
    expect(box.width).toBeCloseTo(40, 6);
    expect("height" in box).toBe(false);
  });

  it("frees the ratio while SHIFT is down and writes both dimensions", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100, { shiftKey: true });

    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(160, 6);
    expect(Number.parseFloat(h.wrapper.style.height)).toBeCloseTo(70, 6);
  });

  it("re-locking clears the pixel height, so a released SHIFT commits no height", () => {
    // The silent failure this design spent the longest on: forgetting to clear
    // the height breaks nothing visible — it goes back to auto anyway — and
    // freezes an item the user left in keep-ratio.
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100, { shiftKey: true });
    expect(h.wrapper.style.height).not.toBe("");

    h.send("pointermove", 200, 100, { shiftKey: false });
    expect(h.wrapper.style.height).toBe("");

    h.send("pointerup", 200, 100, { shiftKey: false });
    const reLockedBox = h.commits[0]?.box as ImageBox;
    expect("height" in reLockedBox).toBe(false);
  });

  it("commits a height when SHIFT is down at the release", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100, { shiftKey: true });
    h.send("pointerup", 200, 100, { shiftKey: true });

    const box = h.commits[0]?.box as ImageBox;
    expect(box.height).toBeDefined();
  });

  it("rewrites an existing height even when the ratio was kept", () => {
    // Branch 2: the item is already stretched, and that stretch is preserved by
    // scaling both numbers rather than by leaving the height where it was.
    const h = setup({ config: { width: 20, height: 20 } });
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 70);
    h.send("pointerup", 200, 70);

    const box = h.commits[0]?.box as ImageBox;
    expect(box.height).toBeCloseTo(20 * 1.8, 6);
  });

  it("replays the last pointer position when SHIFT is toggled without a move", () => {
    // No pointermove will come, so the keyboard listener is the only thing that
    // can refresh the preview. The window is the target: under pointer capture
    // the element has no keyboard focus.
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100);
    const locked = h.wrapper.style.width;

    h.key("keydown", true);
    expect(h.wrapper.style.width).not.toBe(locked);
    expect(h.wrapper.style.height).not.toBe("");

    h.key("keyup", false);
    expect(h.wrapper.style.width).toBe(locked);
    expect(h.wrapper.style.height).toBe("");
  });

  it("stops at the surface, and one axis binding does not distort the other", () => {
    // A box against the right edge under a locked ratio: clamping the two axes
    // separately would keep growing the height while the width is pinned.
    const h = setup({ box: { x: 320, y: 0, width: 80, height: 40 }, intrinsic: 2 });
    h.send("pointerdown", 400, 40);
    h.send("pointermove", 900, 40);

    const w = Number.parseFloat(h.wrapper.style.width);
    expect(w).toBeCloseTo(80, 6); // already flush right; it cannot grow
    expect(h.wrapper.style.height).toBe("");
  });

  it("lets an item that already overflows be reduced but not pushed further out", () => {
    // The ratchet, which is `tighten` reused on an edge. A plain clamp would be
    // indistinguishable from it on an item that starts inside.
    const h = setup({ box: { x: 320, y: 0, width: 160, height: 80 }, intrinsic: 2 });
    h.send("pointerdown", 480, 80);
    h.send("pointermove", 560, 80); // further out
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(160, 6);

    h.send("pointermove", 420, 80); // back in
    // kx = 100/160 = 0.625, ky = 80/80 = 1.0 (y pointer hasn't moved).
    // k = (0.625·25600 + 1.0·6400) / 32000 = 0.7 → size = 112.
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(112, 6);

    h.send("pointermove", 560, 80); // and it cannot leave again
    // Ratchet tightened trailing to 432 (origin 320 + 112). k = 1.4 but
    // kBounds.hi = 112/160 = 0.7 → clamped, size stays at 112.
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(112, 6);
  });

  it("never goes below the floor", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 41, 31);
    expect(Number.parseFloat(h.wrapper.style.width)).toBeGreaterThanOrEqual(24);
  });

  it("under a forced ratio SHIFT is inert and no height is created", () => {
    const h = setup({ config: { width: 20, camera_image: "camera.a", camera_view: "live" } });
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100, { shiftKey: true });
    expect(h.wrapper.style.height).toBe("");

    h.send("pointerup", 200, 100, { shiftKey: true });
    const forcedBox = h.commits[0]?.box as ImageBox;
    expect("height" in forcedBox).toBe(false);
  });

  it("under a forced ratio a dormant height is scaled, never dropped", () => {
    const h = setup({
      config: { width: 20, height: 30, camera_image: "camera.a", camera_view: "live" },
    });
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 70);
    h.send("pointerup", 200, 70);

    const box = h.commits[0]?.box as ImageBox;
    // Width went 80 -> 144, so k = 1.8 and the dormant height follows it.
    expect(box.width).toBeCloseTo(36, 6);
    expect(box.height).toBeCloseTo(54, 6);
  });

  it("commits nothing when the rounded percentages did not change", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointerup", 120, 70);
    expect(h.commits).toHaveLength(0);
  });

  it("puts the verbatim declarations back when the gesture is cancelled", () => {
    const h = setup();
    h.wrapper.style.left = "10%";
    h.wrapper.style.top = "10%";
    h.wrapper.style.width = "20%";
    h.wrapper.style.maxHeight = "100%";
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100);
    h.send("pointercancel", 200, 100);

    expect(h.wrapper.style.left).toBe("10%");
    expect(h.wrapper.style.width).toBe("20%");
    expect(h.wrapper.style.maxHeight).toBe("100%");
    expect(h.commits).toHaveLength(0);
  });

  it("drops max-height for the length of the gesture", () => {
    // Otherwise the drag hits an invisible ceiling at the background's height.
    const h = setup();
    h.wrapper.style.maxHeight = "100%";
    h.send("pointerdown", 120, 70);
    expect(h.wrapper.style.maxHeight).toBe("");
  });

  it("announces the stretch so the card can push a transient fit mode", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100, { shiftKey: true });
    expect(h.stretches).toContain(true);

    // The release leaves it agreeing with the config it just committed, rather
    // than dropping it: the round trip takes frames, and an element reading its
    // old config would letterbox for exactly those frames.
    h.send("pointerup", 200, 100, { shiftKey: true });
    expect(h.stretches.at(-1)).toBe(true);
  });

  it("drops the override when the gesture commits nothing", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 100, { shiftKey: true });
    h.send("pointercancel", 200, 100, { shiftKey: true });
    expect(h.stretches.at(-1)).toBeUndefined();
  });

  it("ignores a press that is not on a handle", () => {
    const h = setup();
    h.send("pointerdown", 120, 70, {}, h.wrapper);
    expect(h.controller.resizingIndex()).toBeUndefined();
  });

  it("ignores a second pointer while a gesture is live", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    const width = h.wrapper.style.width;
    h.handle.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 2, clientX: 300, clientY: 300, bubbles: true }),
    );
    expect(h.wrapper.style.width).toBe(width);
  });

  it("a north/south grip writes a height and leaves the width and the left edge alone", () => {
    // Box 80x40 at (40,30) on a 400x300 surface, stored width 20 %. The pointer
    // drags the bottom edge from y=70 down to y=130: the height must follow and
    // NOTHING horizontal may move — not the drawn width, not the committed one,
    // not the position.
    const h = setup({ grip: "bottom" });
    h.send("pointerdown", 80, 70);
    h.send("pointermove", 200, 130);

    expect(h.wrapper.style.width).toBe("80px");
    expect(h.wrapper.style.left).toBe("40px");
    expect(h.wrapper.style.height).toBe("100px");

    h.send("pointerup", 200, 130);
    expect(h.commits).toHaveLength(1);
    // 100 px of a 300 px surface.
    expect(h.commits[0]?.box).toEqual({ width: 20, height: 33.33 });
  });

  it("an east/west grip freezes the height an item did not have", () => {
    // Stored config is keep-ratio (no height), and the stub resolves height from
    // width at a 2:1 intrinsic ratio. Dragging the right edge must NOT let the
    // height follow: 40 px is what the box had, 40 px is what it keeps.
    const h = setup({ grip: "right" });
    h.send("pointerdown", 120, 50);
    h.send("pointermove", 200, 50);

    expect(h.wrapper.style.width).toBe("160px");
    expect(h.wrapper.style.height).toBe("40px");
    expect(h.wrapper.getBoundingClientRect().height).toBe(40);

    h.send("pointerup", 200, 50);
    // 160 px of 400 wide, 40 px of 300 tall.
    expect(h.commits[0]?.box).toEqual({ width: 40, height: 13.33 });
  });

  it("ignores SHIFT on a side grip: the gesture is already free", () => {
    const h = setup({ grip: "right" });
    h.send("pointerdown", 120, 50);
    h.send("pointermove", 200, 50, { shiftKey: true });
    h.send("pointerup", 200, 50, { shiftKey: true });

    const held = setup({ grip: "right" });
    held.send("pointerdown", 120, 50);
    held.send("pointermove", 200, 50);
    held.send("pointerup", 200, 50);

    expect(h.commits[0]?.box).toEqual(held.commits[0]?.box);
  });

  it("resizes a side from the anchor under ALT, on the active axis only", () => {
    // Centre anchor: the box grows both ways on x, and y does not move at all.
    const h = setup({ grip: "right", anchor: "center", position: { left: 20, top: 20 } });
    h.send("pointerdown", 120, 50);
    h.send("pointermove", 160, 50, { altKey: true });

    // Fixed point is the box's own centre, x = 80. The pointer at 160 asks for a
    // half-width of 80, so the box is 160 wide and its left edge is at 0.
    expect(h.wrapper.style.width).toBe("160px");
    expect(h.wrapper.style.left).toBe("0px");
    expect(h.wrapper.style.top).toBe("30px");
  });

  it("stops the active axis at the floor and never pushes the inert one to it", () => {
    // A box 80 wide by 40 tall; the floor is 24. Dragging the bottom edge up past
    // the top must stop the HEIGHT at 24 and leave the width at 80 — the floor
    // belongs to the axis that moves.
    const h = setup({ grip: "bottom" });
    h.send("pointerdown", 80, 70);
    h.send("pointermove", 80, -100);

    expect(h.wrapper.style.height).toBe("24px");
    expect(h.wrapper.style.width).toBe("80px");
  });

  it("recommits an inert axis' stored numbers rather than a pixel round trip", () => {
    // The stored width (20.01 %) and the stubbed pixel box (80 px = exactly 20 %)
    // deliberately disagree: a round trip through percentOfContainer would answer
    // 20 and silently rewrite the user's number. The inert axis must not be
    // recomputed at all.
    const h = setup({ grip: "bottom", config: { width: 20.01 } });
    h.send("pointerdown", 80, 70);
    h.send("pointermove", 80, 130);
    h.send("pointerup", 80, 130);

    expect(h.commits[0]?.box.width).toBe(20.01);
    // Nothing horizontal moved, so no position is committed at all.
    expect(h.commits[0]?.position).toBeUndefined();
  });

  it("keeps a stored height unscaled when the vertical axis is inert", () => {
    // A stretched item (height present) dragged by its RIGHT edge. The stored
    // height (13.34 %) and the stubbed pixel height (40 px of 300 = 13.33 %)
    // are made to disagree on purpose — a fixture where they agree cannot tell
    // "recommit the stored number" from "round-trip through pixels". The corner
    // path would scale the stored height by the width's own factor; a side grip
    // must leave it exactly as it is, because the axis did not move.
    const h = setup({ grip: "right", config: { width: 20, height: 13.34 } });
    h.send("pointerdown", 120, 50);
    h.send("pointermove", 200, 50);
    h.send("pointerup", 200, 50);

    expect(h.commits[0]?.box).toEqual({ width: 40, height: 13.34 });
  });

  it("commits nothing when a side gesture is released where it began", () => {
    // The image is in keep-ratio (no stored height). Pressing an east/west handle
    // freezes a pixel height; releasing without moving must NOT commit it, or an
    // image nobody resized silently leaves keep-ratio.
    const h = setup({ grip: "right" });
    h.send("pointerdown", 120, 50);
    h.send("pointermove", 120, 50);
    h.send("pointerup", 120, 50);

    expect(h.commits).toHaveLength(0);
    // And the wrapper is back to the declarations pointerdown overwrote.
    expect(h.wrapper.style.height).toBe("");
  });

  it("commits nothing when a corner returns to its starting point under SHIFT", () => {
    const h = setup();
    h.send("pointerdown", 120, 70);
    h.send("pointermove", 200, 120, { shiftKey: true });
    h.send("pointermove", 120, 70, { shiftKey: true });
    h.send("pointerup", 120, 70, { shiftKey: true });

    expect(h.commits).toHaveLength(0);
    expect(h.wrapper.style.height).toBe("");
  });

  it("still commits a side gesture that moved by a single stored hundredth", () => {
    // The guard must not become a threshold: anything that changes the number
    // actually stored is a change.
    const h = setup({ grip: "bottom" });
    h.send("pointerdown", 80, 70);
    // 300 px tall surface, so 0.03 px is a hundredth of a percent.
    h.send("pointermove", 80, 70.03);
    h.send("pointerup", 80, 70.03);

    expect(h.commits).toHaveLength(1);
  });
});

describe("the ALT mode", () => {
  it("resizes around the anchor and never writes a position", () => {
    // Anchor centre: the box grows symmetrically, so the leading edge moves
    // outward by half of the growth and the commit carries no position.
    const h = setup({
      box: { x: 160, y: 130, width: 80, height: 40 },
      anchor: "center",
      position: { left: 50, top: 50 },
    });
    h.send("pointerdown", 240, 170);
    h.send("pointermove", 280, 170, { altKey: true });
    h.send("pointerup", 280, 170, { altKey: true });

    expect(h.commits[0]?.position).toBeUndefined();
  });

  it("refuses to grow an already-overflowing item on the axis that overflows", () => {
    // Growing from the anchor pushes BOTH edges out, and the ratchet forbids the
    // one that is already outside from going further.
    const h = setup({
      box: { x: -20, y: 0, width: 440, height: 220 },
      anchor: "center",
      position: { left: 50, top: 50 },
    });
    h.send("pointerdown", 420, 220);
    h.send("pointermove", 600, 220, { altKey: true });
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(440, 6);
  });
});
