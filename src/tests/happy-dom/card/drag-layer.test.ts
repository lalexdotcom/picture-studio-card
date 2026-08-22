import { afterEach, describe, expect, it } from "@rstest/core";
import {
  createDragController,
  DRAG_HOLD_MS,
  DRAG_THRESHOLD_PX,
  hasMoved,
  isDrag,
} from "../../../card/drag-layer";
import type { Position } from "../../../position";

/**
 * One file for one module, predicates and controller together. They were split
 * across two — the pure halves at the happy-dom root under a name matching
 * neither the module nor anything else — which is what a reader looking for
 * "the drag-layer tests" has to discover twice.
 *
 * The order below is the order the gesture asks them in: first "did this travel
 * far enough", then "was it a drag at all", then the controller that calls both.
 */

describe("hasMoved", () => {
  it("treats a still pointer as a click", () => {
    expect(hasMoved(0, 0)).toBe(false);
  });

  it("absorbs the tremor of a click", () => {
    expect(hasMoved(2, 2)).toBe(false);
    expect(hasMoved(-3, 1)).toBe(false);
  });

  it("counts travel past the threshold as a drag, in any direction", () => {
    expect(hasMoved(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(hasMoved(0, -(DRAG_THRESHOLD_PX + 1))).toBe(true);
    expect(hasMoved(-4, -4)).toBe(true);
  });

  it("treats the threshold as exceeded, not merely reached", () => {
    // The comparison is a strict greater-than, so landing exactly on the
    // threshold is still a click. isDrag has the same test for the hold; the
    // pair is what keeps a boundary from drifting by one on a refactor.
    expect(hasMoved(DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(hasMoved(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
  });

  it("measures the diagonal, not each axis on its own", () => {
    // 3-4-5: neither axis passes 4, the distance does.
    expect(hasMoved(3, 4)).toBe(true);
  });
});

/**
 * Distance answers "was this obviously a drag". It cannot answer the opposite
 * question — someone nudging a badge by one pixel means it, and the threshold
 * that protects a click from its own tremor was throwing that away. Time is
 * what tells the two apart: a tap is quick, a deliberate adjustment is not.
 */
describe("isDrag", () => {
  const QUICK = DRAG_HOLD_MS - 1;
  const HELD = DRAG_HOLD_MS;

  // The first argument is the gesture's own sticky verdict on distance: once
  // the travel passed the threshold it stays passed, so a drag that wanders far
  // and comes back near its start is still a drag.
  it("commits a frank drag immediately, without waiting out the hold", () => {
    expect(isDrag(true, 10, true)).toBe(true);
  });

  it("still commits a frank drag that ended where it began", () => {
    // The clamp can absorb the whole travel against an edge, and a long
    // round trip can land back on its start — the gesture was unambiguous
    // either way, and committing an unchanged position is harmless.
    expect(isDrag(true, 10, false)).toBe(true);
  });

  it("keeps a quick nudge inside the threshold a click", () => {
    expect(isDrag(false, QUICK, true)).toBe(false);
  });

  it("commits that same nudge once it was held", () => {
    expect(isDrag(false, HELD, true)).toBe(true);
  });

  it("commits nothing when a long hold moved the badge nowhere", () => {
    // A press-and-think, or a nudge the clamp swallowed at the edge: held long
    // enough, but there is no new position to store.
    expect(isDrag(false, HELD * 4, false)).toBe(false);
  });

  it("treats the hold as reached, not merely passed", () => {
    expect(isDrag(false, DRAG_HOLD_MS - 1, true)).toBe(false);
    expect(isDrag(false, DRAG_HOLD_MS, true)).toBe(true);
  });
});

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
  const selections: (number | undefined)[] = [];
  let clock = 0;

  const controller = createDragController({
    getIndexedWrapper: (target) => (target === item ? { element: item, index: 0 } : undefined),
    getSurface: () => surface,
    getAnchor: () => "top-left",
    onCommit: (index, position) => commits.push({ index, position }),
    onSelect: (index) => selections.push(index),
    now: () => clock,
  });
  controller.attach(root);

  // The target decides which branch the press takes: `item` is the only thing
  // getIndexedWrapper recognises, so a press on anything else is a press on the
  // picture — the deselect.
  const send = (
    type: string,
    clientX: number,
    clientY: number,
    target: HTMLElement = item,
  ): void => {
    target.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, clientX, clientY, button: 0, bubbles: true }),
    );
  };

  return {
    item,
    surface,
    commits,
    selections,
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

/**
 * The selection is a decision, and a decision belongs to the release. Announced
 * at pointerdown it opened the item's form — and scrolled the edit dialog to the
 * editor's top — while the finger was still on the badge. On a narrow screen the
 * preview is stacked above the form rather than set beside it, so grabbing an
 * item took the picture off the screen at the very moment it was needed.
 */
describe("when the selection is announced", () => {
  const FAR = DRAG_THRESHOLD_PX * 4;

  it("says nothing while the gesture is still under way", async () => {
    const { selections, send } = setup();
    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);

    expect(selections).toEqual([]);
  });

  it("selects the badge that was merely clicked", async () => {
    const { selections, send } = setup();
    send("pointerdown", 25, 15);
    send("pointerup", 25, 15);

    expect(selections).toEqual([0]);
  });

  it("selects the badge it has just dropped", async () => {
    const { commits, selections, send } = setup();
    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    send("pointerup", 25 + FAR, 15);

    expect(commits).toHaveLength(1);
    expect(selections).toEqual([0]);
  });

  it("selects nothing when the gesture is cancelled", async () => {
    // Same reasoning as the commit: the user never let go, so there is no
    // decision to read — and on a touch screen this is precisely the scroll
    // that started on a badge.
    const { selections, send } = setup();
    send("pointerdown", 25, 15);
    send("pointermove", 25 + FAR, 15);
    send("pointercancel", 25 + FAR, 15);

    expect(selections).toEqual([]);
  });
});

/**
 * A press that lands on the picture instead of a badge is the deselect, and it
 * waits for the release for the same reason the selection does.
 */
describe("a press on the picture", () => {
  it("clears the selection once it is released", async () => {
    const { selections, send, surface } = setup();
    send("pointerdown", 5, 5, surface);

    expect(selections).toEqual([]);

    send("pointerup", 5, 5, surface);

    expect(selections).toEqual([undefined]);
  });

  it("keeps the selection when the browser takes the gesture", async () => {
    // This path never calls preventDefault, so a touch on the picture can
    // become a scroll of the dialog. The user was scrolling, not closing the
    // form they had open.
    const { selections, send, surface } = setup();
    send("pointerdown", 5, 5, surface);
    send("pointercancel", 5, 5, surface);

    expect(selections).toEqual([]);
  });

  it("does not answer for the gesture that follows it", async () => {
    // Released off the card, so no pointerup ever reaches the listener. The
    // pending press must not outlive the next pointerdown.
    const { selections, send, surface } = setup();
    send("pointerdown", 5, 5, surface);

    send("pointerdown", 25, 15);
    send("pointerup", 25, 15);

    expect(selections).toEqual([0]);
  });
});
