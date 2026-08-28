import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import type { ResizeToolOptions } from "../../../card/tools/resize-tool";
import { createResizeTool } from "../../../card/tools/resize-tool";

describe("createResizeTool", () => {
  let root: HTMLElement;
  let surface: HTMLElement;
  let wrapperA: HTMLElement;
  let wrapperB: HTMLElement;
  let options: ResizeToolOptions;

  beforeEach(() => {
    root = document.createElement("div");
    surface = document.createElement("div");
    wrapperA = document.createElement("div");
    wrapperA.className = "item";
    wrapperA.dataset.index = "0";
    wrapperB = document.createElement("div");
    wrapperB.className = "item";
    wrapperB.dataset.index = "1";
    root.append(surface, wrapperA, wrapperB);
    document.body.append(root);

    surface.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    options = {
      getSurface: () => surface,
      getAnchor: () => "top-left",
      getPosition: () => ({ left: 10, top: 10 }),
      getConfig: (index) => (index === 0 || index === 1 ? { width: 20 } : undefined),
      onCommit: () => {},
    };
  });

  afterEach(() => document.body.replaceChildren());

  /**
   * Fires the synthetic pointer sequence that starts a resize gesture on the
   * named corner handle of a wrapper.  The wrapper and its surface must already
   * be in the DOM and the tool must already be attached to `root`.
   */
  const startGestureOn = (wrapper: HTMLElement, corner: string): void => {
    wrapper.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 30,
        width: 80,
        height: 40,
        right: 120,
        bottom: 70,
        x: 40,
        y: 30,
        toJSON: () => ({}),
      }) as DOMRect;
    wrapper.setPointerCapture = () => undefined;
    wrapper.releasePointerCapture = () => undefined;
    const handle = wrapper.querySelector(`.handle-${corner}`) as HTMLElement;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 120,
        clientY: 70,
        button: 0,
        bubbles: true,
      }),
    );
  };

  it("mounts handles on the selected wrapper and nowhere else", async () => {
    const tool = createResizeTool(options);
    tool.attach(root);
    tool.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(4);
    tool.render({ element: wrapperB, index: 1 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
    expect(wrapperB.querySelectorAll(".handle")).toHaveLength(4);
  });

  it("mounts nothing when there is no selection", async () => {
    const tool = createResizeTool(options);
    tool.attach(root);
    tool.render({ element: wrapperA, index: 0 });
    tool.render(undefined);
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
  });

  it("mounts nothing on an item the resize does not govern", async () => {
    const tool = createResizeTool({ ...options, getConfig: () => undefined });
    tool.attach(root);
    tool.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
  });

  it("leaves the handles alone while its own gesture is running", async () => {
    const tool = createResizeTool(options);
    tool.attach(root);
    tool.render({ element: wrapperA, index: 0 });
    const before = Array.from(wrapperA.querySelectorAll(".handle"));
    startGestureOn(wrapperA, "bottom-right");
    tool.render({ element: wrapperA, index: 0 });
    expect(Array.from(wrapperA.querySelectorAll(".handle"))).toEqual(before);
  });

  it("answers the hit test for its own handles, and for nothing else", async () => {
    const tool = createResizeTool(options);
    tool.attach(root);
    tool.render({ element: wrapperA, index: 0 });
    const handle = wrapperA.querySelector(".handle-bottom-right") as HTMLElement;
    expect(tool.hit(handle)?.corner).toBe("bottom-right");
    expect(tool.hit(wrapperA)).toBeUndefined();
  });
});
