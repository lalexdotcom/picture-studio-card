import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import { createDistortTool } from "../../../card/tools/distort-tool";
import type { ResizeToolOptions } from "../../../card/tools/resize-tool";
import { createResizeTool } from "../../../card/tools/resize-tool";

/**
 * Creates the DOM scaffolding and base options both tool suites need.
 * Each suite calls this in its own beforeEach so the fixtures are fresh
 * and independent.
 */
function makeBaseFixtures() {
  const root = document.createElement("div");
  const surface = document.createElement("div");
  const wrapperA = document.createElement("div");
  wrapperA.className = "item";
  wrapperA.dataset.index = "0";
  const wrapperB = document.createElement("div");
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

  const options: ResizeToolOptions = {
    getSurface: () => surface,
    getAnchor: () => "top-left",
    getPosition: () => ({ left: 10, top: 10 }),
    getConfig: (index) => (index === 0 || index === 1 ? { width: 20 } : undefined),
    onCommit: () => {},
  };

  return { root, surface, wrapperA, wrapperB, options };
}

describe("createResizeTool", () => {
  let root: HTMLElement;
  let wrapperA: HTMLElement;
  let wrapperB: HTMLElement;
  let options: ResizeToolOptions;

  beforeEach(() => {
    const f = makeBaseFixtures();
    root = f.root;
    wrapperA = f.wrapperA;
    wrapperB = f.wrapperB;
    options = f.options;
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
    // The gesture guard must be tested with render(undefined): calling render
    // with the same element hits the `mounted === target.element` short-circuit
    // first, which would mask the gesture guard. render(undefined) bypasses
    // that short-circuit and directly exercises the gesture guard.
    //
    // toEqual compares structurally in happy-dom, so it cannot distinguish
    // freshly built nodes from the originals. Each handle is asserted with toBe
    // (reference identity), so a rebuild — which the guard must prevent — is
    // detectable even when the two sets look identical.
    const tool = createResizeTool(options);
    tool.attach(root);
    tool.render({ element: wrapperA, index: 0 });
    const before = Array.from(wrapperA.querySelectorAll(".handle")) as HTMLElement[];
    startGestureOn(wrapperA, "bottom-right");
    // Without the gesture guard, render(undefined) would call unmount() and
    // strip the handles from wrapperA. The guard must prevent that.
    tool.render(undefined);
    const after = Array.from(wrapperA.querySelectorAll(".handle")) as HTMLElement[];
    expect(after).toHaveLength(before.length);
    before.forEach((node, i) => {
      expect(after[i]).toBe(node);
    });
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

describe("createDistortTool", () => {
  let root: HTMLElement;
  let wrapperA: HTMLElement;
  let options: ResizeToolOptions;
  let commits: unknown[][];

  beforeEach(() => {
    const f = makeBaseFixtures();
    root = f.root;
    wrapperA = f.wrapperA;
    commits = [];
    options = {
      ...f.options,
      onCommit: (...args) => {
        commits.push(args);
      },
    };
  });

  afterEach(() => document.body.replaceChildren());

  it("draws nothing, hits nothing, and commits nothing", async () => {
    const tool = createDistortTool();
    tool.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
    expect(tool.hit(wrapperA)).toBeUndefined();
    tool.attach(root);
    root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(commits).toHaveLength(0);
  });

  it("takes the handles away when it becomes active, and gives them back", async () => {
    const resize = createResizeTool(options);
    const distort = createDistortTool();
    resize.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(4);
    resize.detach();
    distort.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(0);
    // Prove the return path: detach distort, re-attach and re-render resize.
    distort.detach();
    resize.attach(root);
    resize.render({ element: wrapperA, index: 0 });
    expect(wrapperA.querySelectorAll(".handle")).toHaveLength(4);
  });
});
