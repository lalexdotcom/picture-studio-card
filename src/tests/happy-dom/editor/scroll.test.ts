import { afterEach, describe, expect, it } from "@rstest/core";
import {
  boxTop,
  dialogScroller,
  formScroller,
  layoutAncestors,
  scrollIntoNearest,
  scrollToStart,
} from "../../../editor/scroll";

/**
 * happy-dom lays nothing out, so every box here is *declared*: the overflow
 * comes from the inline style, the two heights that decide whether it overflows
 * are defined by hand, and rects are functions we install. What is guarded is
 * the rule that picks a container and the arithmetic of the write — never the
 * pixels, which belong to a real WebKit.
 */
const rect = (top: number, height: number): DOMRect =>
  ({
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    x: 0,
    y: top,
    width: 0,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

/** A box that declares `overflow-y: auto` and either overflows or does not. */
const scroller = (content: number, box: number): HTMLElement => {
  const el = document.createElement("div");
  el.style.overflowY = "auto";
  Object.defineProperty(el, "scrollHeight", { value: content, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: box, configurable: true });
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = v;
    },
    configurable: true,
  });
  el.getBoundingClientRect = () => rect(0, box);
  return el;
};

afterEach(() => document.body.replaceChildren());

describe("layoutAncestors", () => {
  it("crosses a slot, which parentNode does not", () => {
    // The editor is distributed into a slot by Home Assistant's dialog, so its
    // light-DOM parent is not the box that contains it on screen. A walk on
    // parentNode alone found only `html` and two rounds of measurement were
    // spent proving the instrument was looking at the wrong element.
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.id = "container";
    container.append(document.createElement("slot"));
    root.append(container);

    const child = document.createElement("span");
    host.append(child);
    document.body.append(host);
    // happy-dom populates `slot.assignedNodes()` but never writes the
    // assignment back to `element.assignedSlot`. Declared here for the same
    // reason every box in this file declares its geometry: the environment
    // does not compute it, and the walk under test reads it.
    const slot = root.querySelector("slot") as HTMLSlotElement;
    Object.defineProperty(child, "assignedSlot", { value: slot, configurable: true });

    const walk = [...layoutAncestors(child)].map((n) => n.id || n.localName);
    expect(walk).toContain("container");
    // And the logical walk, which is what we must NOT be doing, does not.
    const logical: string[] = [];
    for (let n: Node | null = child; n; n = n.parentNode) {
      if (n instanceof HTMLElement) logical.push(n.id || n.localName);
    }
    expect(logical).not.toContain("container");
  });
});

describe("formScroller — declared, not measured", () => {
  it("finds a declared container that does not overflow", () => {
    // Below 1000px `.element-editor` declares overflow-y:auto with nothing
    // bounding its height, so it never overflows and never scrolls. It is still
    // the form's container: an inert write to it is a no-op, which is the point.
    const outer = scroller(2000, 400);
    const inner = scroller(549, 549); // declared, inert
    const el = document.createElement("span");
    inner.append(el);
    outer.append(inner);
    document.body.append(outer);

    expect(formScroller(el)).toBe(inner);
  });

  it("is undefined when nothing above declares an overflow", () => {
    const el = document.createElement("span");
    document.body.append(el);
    expect(formScroller(el)).toBeUndefined();
  });
});

describe("dialogScroller — above the form's, and actually overflowing", () => {
  it("skips the form's container even when it overflows", () => {
    // At and above 1000px `.content` is a row with a height cap, so
    // `.element-editor` overflows and IS the form's scroller. Without the
    // "above" rule the same element would answer to both roles and the two
    // intentions would fight.
    const outer = scroller(2000, 400);
    const inner = scroller(1000, 400); // declared AND overflowing
    const el = document.createElement("span");
    inner.append(el);
    outer.append(inner);
    document.body.append(outer);

    expect(formScroller(el)).toBe(inner);
    expect(dialogScroller(el)).toBe(outer);
  });

  it("is undefined when nothing above the form's container overflows", () => {
    const outer = scroller(400, 400); // declared, inert
    const inner = scroller(1000, 400);
    const el = document.createElement("span");
    inner.append(el);
    outer.append(inner);
    document.body.append(outer);

    expect(dialogScroller(el)).toBeUndefined();
  });

  it("takes the page, which scrolls without declaring an overflow", () => {
    // On a phone the dialog is the page: measured on a real iPhone, the only
    // thing that scrolls is `html`, whose computed overflow-y is `visible`.
    const root = document.scrollingElement as HTMLElement;
    Object.defineProperty(root, "scrollHeight", { value: 2447, configurable: true });
    Object.defineProperty(root, "clientHeight", { value: 874, configurable: true });
    const el = document.createElement("span");
    document.body.append(el);
    expect(dialogScroller(el)).toBe(root);
  });
});

describe("the writes", () => {
  it("scrollToStart puts the target's top at the container's top", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(70, 30); // 70px below the box top
    container.append(target);
    document.body.append(container);

    scrollToStart(container, target);
    expect(container.scrollTop).toBe(190);
  });

  it("scrollIntoNearest leaves a target already inside alone", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(70, 30);
    container.append(target);
    document.body.append(container);

    scrollIntoNearest(container, target);
    expect(container.scrollTop).toBe(120);
  });

  it("scrollIntoNearest lifts a target that sits below the box", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(430, 30); // bottom 460, box ends 400
    container.append(target);
    document.body.append(container);

    scrollIntoNearest(container, target);
    expect(container.scrollTop).toBe(180); // 120 + (460 - 400)
  });

  it("scrollIntoNearest drops a target that sits above the box", () => {
    const container = scroller(2000, 400);
    container.scrollTop = 120;
    const target = document.createElement("span");
    target.getBoundingClientRect = () => rect(-50, 30);
    container.append(target);
    document.body.append(container);

    scrollIntoNearest(container, target);
    expect(container.scrollTop).toBe(70); // 120 + (-50 - 0)
  });

  it("measures the page from the viewport, not from its own rect", () => {
    // documentElement's rect.top is -scrollY, so using it as the box top would
    // double-count the scroll.
    const root = document.scrollingElement as HTMLElement;
    Object.defineProperty(root, "clientHeight", { value: 874, configurable: true });
    root.getBoundingClientRect = () => rect(-300, 2447);
    expect(boxTop(root)).toBe(0);
  });
});
