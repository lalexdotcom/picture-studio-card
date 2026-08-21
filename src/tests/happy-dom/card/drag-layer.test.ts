import { afterEach, describe, expect, it } from "@rstest/core";
import { createDragController, DRAG_THRESHOLD_PX } from "../../../card/drag-layer";
import type { Position } from "../../../position";

/**
 * happy-dom has no layout, so every box the controller reads is stubbed. That is
 * enough here: what these tests assert is which branch the gesture takes, not
 * where the badge lands — the coordinates themselves are the playwright lane's.
 */
const boxed = (el: HTMLElement, left: number, top: number, width: number, height: number): void => {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
};

const setup = () => {
  const root = document.createElement("div");
  const surface = document.createElement("div");
  const item = document.createElement("div");
  root.append(surface, item);
  document.body.append(root);

  boxed(surface, 0, 0, 200, 100);
  boxed(item, 20, 10, 20, 20);

  const commits: { index: number; position: Position }[] = [];
  let clock = 0;

  const controller = createDragController({
    getIndexedWrapper: (target) => (target === item ? { element: item, index: 0 } : undefined),
    getSurface: () => surface,
    getAnchor: () => "top-left",
    onCommit: (index, position) => commits.push({ index, position }),
    onSelect: () => undefined,
    now: () => clock,
  });
  controller.attach(root);

  const send = (type: string, clientX: number, clientY: number): void => {
    item.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, clientX, clientY, button: 0, bubbles: true }),
    );
  };

  return {
    item,
    commits,
    controller,
    send,
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * pointercancel is not a release. A scroll takeover, palm rejection or a browser
 * intervention ends the gesture without the user ever letting go, so whatever
 * the badge had reached under the pointer is not a position they chose.
 */
describe("a cancelled gesture", () => {
  const FAR = DRAG_THRESHOLD_PX * 4;

  it("commits the drag it would have committed on a release", async () => {
    // The control: same travel, ended properly. Without this the test below
    // could pass because the gesture never counted as a drag at all.
    const { commits, send } = setup();
    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    send("pointerup", 25 + FAR, 15);

    expect(commits).toHaveLength(1);
  });

  it("commits nothing when the same drag is cancelled instead", async () => {
    const { commits, send } = setup();
    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    send("pointercancel", 25 + FAR, 15);

    expect(commits).toHaveLength(0);
  });

  it("puts the badge back exactly where it was", async () => {
    const { item, send } = setup();
    item.style.left = "10%";
    item.style.top = "10%";
    item.style.transform = "translate(-10%, -10%)";

    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    // Mid-gesture the controller writes raw pixels; a cancel has to hand back
    // the exact declarations it replaced, because no setConfig is coming to
    // correct them.
    send("pointercancel", 25 + FAR, 15);

    expect(item.style.left).toBe("10%");
    expect(item.style.top).toBe("10%");
    expect(item.style.transform).toBe("translate(-10%, -10%)");
  });

  it("leaves no drag state behind, so the next gesture starts clean", async () => {
    const { commits, controller, send } = setup();
    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    send("pointercancel", 25 + FAR, 15);

    expect(controller.draggingIndex()).toBeUndefined();

    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    send("pointerup", 25 + FAR, 15);

    expect(commits).toHaveLength(1);
  });
});
