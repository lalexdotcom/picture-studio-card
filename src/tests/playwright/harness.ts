import { notifyEditors, registerEditor } from "../../broker";
import { PictureStudioImage } from "../../card/image-element";
import { PictureStudioCard } from "../../card/picture-studio-card";
import { PictureStudioStateIcon } from "../../card/state-icon-element";
import { PictureStudioStateLabel } from "../../card/state-label-element";
import { DEFAULT_TOOL, type ToolId } from "../../card/tools/tool";
import { CARD_TAG, ICON_TAG, IMAGE_TAG, LABEL_TAG } from "../../config";
import type { ImageBox } from "../../image-box";
import type { Anchor, Position } from "../../position";

/**
 * The happy-dom harness fakes children that only count calls, because there is
 * no layout to measure. Here the opposite is true and the sizes ARE the test:
 * every assertion in this lane is a number the browser computed. So the stubs
 * below are dimensioned, and the numbers are round on purpose — 10% of 400 is
 * 40px, not 39.996 — which lets the tests read as arithmetic instead of as
 * tolerances.
 *
 * Changing LAYER or BADGE changes every expected value in this lane. They are
 * exported so tests derive from them rather than repeating literals.
 */
export const LAYER = { width: 400, height: 300 };
export const BADGE = { width: 40, height: 20 };

/**
 * Stands in for a badge or the background element, with a size. Home Assistant
 * is not loaded in this browser, so its elements are undefined — and an
 * undefined custom element is `display: inline` with no box, which would make
 * every measurement below zero.
 */
export class SizedChild extends HTMLElement {
  config: unknown;
  #hass: unknown;

  /** The card configures the background explicitly, so this has to exist. */
  setConfig(config: unknown): void {
    this.config = config;
  }

  set hass(value: unknown) {
    this.#hass = value;
  }

  get hass(): unknown {
    return this.#hass;
  }

  connectedCallback(): void {
    // The card's own `.background { width: 100% }` wins on width; only the
    // height has to come from here, since a stub has no intrinsic aspect ratio.
    const isBackground = this.classList.contains("background");
    this.style.display = "block";
    this.style.height = `${isBackground ? LAYER.height : BADGE.height}px`;
    if (!isBackground) this.style.width = `${BADGE.width}px`;
  }
}

/**
 * `ha-card` carries `height: 100%; overflow-y: auto` from the card's styles.
 * Left undefined it stays inline, those rules do nothing, and `.root` never
 * gets a box — so this stub is load-bearing, not decoration.
 */
export class StubHaCard extends HTMLElement {
  connectedCallback(): void {
    this.style.display = "block";
  }
}

/**
 * Stands in for `hui-image`, which is not loaded in this browser. The stub
 * derives its height from its width using the image's aspect ratio, the way the
 * real `<img>` inside `hui-image` does. That is what makes keep-ratio mode
 * testable: when the wrapper has `height: auto` and `max-height: 100%`, the
 * stub's ratio determines the wrapper's natural height, and the clamp can then
 * be asserted against.
 *
 * The ratio comes from the image path by harness convention: a path containing
 * `-<w>x<h>` (e.g. `/banner-1x10.png`) uses that ratio; anything else keeps the
 * 16:9 default (the same fallback the real hui-image applies). That lets one test
 * drive a wide image and another a tall banner without the production element
 * learning a test-only property.
 */
export class HuiImageStub extends HTMLElement {
  #image: string | undefined;
  #container: HTMLElement | undefined;

  /**
   * Mirrors the real `hui-image`'s shadow-root `.container` behaviour, measured
   * on HA frontend 20260729.6:
   *   - When no `aspectRatio` is given, hui-image hard-codes 56.25 % padding-bottom
   *     (16:9). The camera served 600 × 410, overflowing the box by 72.5 px.
   *   - When `aspectRatio = "WxH"` is set, the padding-bottom becomes (h/w)×100 %.
   *
   * The guard in `applyLiveCameraRatio` reads `padding-bottom / offsetWidth` from
   * this container. The browser-lane ratio assertion reads the resulting layout
   * height. Modelled from a real browser; not invented.
   *
   * **Async shadow DOM** — measured on HA frontend 20260729.6:
   * `PictureStudioImage.updated()` fires before `hui-image` has settled its own
   * shadow DOM on the first render. A synchronous stub cannot reproduce this at
   * all: the container appears in a microtask (`updateComplete`), not in the
   * constructor. Images whose path carries no `-WxH` suffix keep 56.25 % (the
   * real hui-image default); the old stub used 1:1 for those, which was an
   * artefact of its simplified logic.
   */
  readonly updateComplete: Promise<boolean> = new Promise<boolean>((resolve) => {
    queueMicrotask(() => {
      this.#buildShadow();
      resolve(true);
    });
  });

  #buildShadow(): void {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    // width: 100% ensures padding-bottom resolves against the host's width —
    // how the real .container is laid out inside hui-image's shadow.
    style.textContent = ".container { width: 100%; box-sizing: border-box; }";
    this.#container = document.createElement("div");
    this.#container.className = "container";
    // 16:9 fallback: hui-image's hard-coded default before any ratio is derived.
    this.#container.style.paddingBottom = "56.25%";
    shadow.append(style, this.#container);
    // Apply any ratio that was set via .image before the shadow was ready.
    this.#applyRatioFromImage();
  }

  /** The card passes the resolved image path as a Lit property. */
  set image(value: string | undefined) {
    this.#image = value;
    this.#applyRatioFromImage();
  }

  /**
   * Mirrors hui-image's public `aspectRatio` property (e.g. "600x410").
   * Setting it switches the container's padding-bottom from the 16:9 default
   * to the supplied ratio — exactly what the real hui-image does once
   * `parseAspectRatio` resolves the string.
   *
   * Called only after `await hui-image.updateComplete` in `applyLiveCameraRatio`,
   * so `#container` is always defined by the time this setter fires in practice.
   * The early-return guard covers any future caller that does not await.
   */
  set aspectRatio(value: string | undefined) {
    const container = this.#container;
    if (!container) return;
    if (!value) {
      container.style.paddingBottom = "56.25%";
      return;
    }
    const parts = value.split("x");
    const wStr = parts[0];
    const hStr = parts[1];
    const w = wStr !== undefined ? parseFloat(wStr) : 0;
    const h = hStr !== undefined ? parseFloat(hStr) : 0;
    if (w > 0 && h > 0) {
      container.style.paddingBottom = `${(100 * h) / w}%`;
    }
  }

  connectedCallback(): void {
    this.style.display = "block";
  }

  #applyRatioFromImage(): void {
    // If the image path has no ratio suffix, keep the current padding-bottom
    // (the 16:9 default for cameras without a static image, which is correct).
    if (!this.#image || !this.#container) return;
    const match = /[-](\d+)x(\d+)/.exec(this.#image);
    if (!match) return;
    const wStr = match[1];
    const hStr = match[2];
    const w = wStr !== undefined ? parseInt(wStr, 10) : 0;
    const h = hStr !== undefined ? parseInt(hStr, 10) : 0;
    if (w > 0 && h > 0) {
      this.#container.style.paddingBottom = `${(100 * h) / w}%`;
    }
  }
}

export const HUI_IMAGE_TAG = "hui-image";

export const FAKE_TAG = "sized-child";

const define = (tag: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
};

const makeChild = (config: unknown): SizedChild => {
  const el = document.createElement(FAKE_TAG) as SizedChild;
  el.config = config;
  return el;
};

export const installHelpers = (): void => {
  neutralisePointerCapture();
  define(FAKE_TAG, SizedChild);
  define(HUI_IMAGE_TAG, HuiImageStub);
  define("ha-card", StubHaCard);
  define(CARD_TAG, PictureStudioCard);
  define(IMAGE_TAG, PictureStudioImage);
  define(ICON_TAG, PictureStudioStateIcon);
  define(LABEL_TAG, PictureStudioStateLabel);
  (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => ({
    createHuiElement: makeChild,
    createBadgeElement: makeChild,
  });
};

/** Settles Lit's update queue, the sync methods' awaits, and one layout frame. */
export const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
};

const hosts: HTMLElement[] = [];
const releases: (() => void)[] = [];

/**
 * Mounts into a fixed-width box rather than the document body: `.root` is a
 * size container and the background is `width: 100%`, so the card is as wide as
 * whatever holds it. Pinning that width is what makes the layer exactly
 * LAYER.width and the percentages exact.
 */
export const mountCard = async (config: unknown, hass?: unknown): Promise<PictureStudioCard> => {
  installHelpers();
  const host = document.createElement("div");
  host.style.width = `${LAYER.width}px`;
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  document.body.append(host);
  hosts.push(host);

  const card = document.createElement(CARD_TAG) as PictureStudioCard;
  card.setConfig(config);
  // Set hass before appending so the card's first render sees it and propagates
  // it to items. This exercises the first-render timing path: hui-image is
  // freshly created, its shadow DOM is not yet settled (updateComplete resolves
  // one microtask later), and applyLiveCameraRatio must await it to act correctly.
  if (hass !== undefined) (card as unknown as { hass: unknown }).hass = hass;
  host.append(card);
  await card.updateComplete;
  await flush();
  return card;
};

/**
 * Every test mounts, and a test may mount twice: reanchor is asked before the
 * new anchor is written, so proving it moves nothing means measuring the old
 * card and the new one side by side — which is what Home Assistant does, since
 * it rebuilds the element on every config change.
 */
export const cleanup = (): void => {
  for (const h of hosts) h.remove();
  hosts.length = 0;
  // A leaked editor makes activeEditor() see two and arm nothing, so the next
  // test would fail for a reason that has nothing to do with what it asserts.
  for (const release of releases) release();
  releases.length = 0;
};

export const root = (card: PictureStudioCard): ParentNode =>
  card.renderRoot as unknown as ParentNode;

export const layer = (card: PictureStudioCard): HTMLElement =>
  root(card).querySelector(".layer") as HTMLElement;

export const wrappers = (card: PictureStudioCard): HTMLElement[] =>
  Array.from(root(card).querySelectorAll(".item")) as HTMLElement[];

/** A rect in the layer's own coordinates, which is what positions are relative to. */
export const rectInLayer = (
  card: PictureStudioCard,
  el: Element,
): { top: number; left: number; width: number; height: number } => {
  const base = layer(card).getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return {
    top: box.top - base.top,
    left: box.left - base.left,
    width: box.width,
    height: box.height,
  };
};

export const centerInLayer = (card: PictureStudioCard, el: Element): { x: number; y: number } => {
  const r = rectInLayer(card, el);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * Pointer capture needs a real input device: `setPointerCapture` throws
 * NotFoundError for a pointerId no physical pointer owns, and rstest 0.11.9's
 * browser mode exposes no driver for trusted events (`@rstest/browser` exports
 * only createBrowserExecutor and validateBrowserConfig). So the capture calls
 * are neutralised.
 *
 * This is the one thing in this lane that is not real, and it is worth being
 * precise about what it costs: we no longer prove that a gesture survives the
 * cursor leaving the surface. Everything the capture was protecting still runs
 * for real — the rects, the clamp, the pixels written each move, the commit.
 */
const neutralisePointerCapture = (): void => {
  HTMLElement.prototype.setPointerCapture = function setPointerCapture(): void {};
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(): void {};
};

/** What the drag sent to the editor, which is the card's only way out. */
export interface EditorSpy {
  commits: { index: number; position: Position }[];
  boxes: { index: number; box: ImageBox; position?: Position }[];
  selections: (number | undefined)[];
  anchors: { index: number; anchor: Anchor }[];
  release(): void;
  // The active tool mirrors what the real editor holds. The card reads it on
  // every _syncEditing call; without it the card throws on entering edit mode.
  activeTool: ToolId;
}

/**
 * Arms the drag, the way the edit dialog does: `preview` on the card plus
 * exactly one registered editor. `editing` is derived, never assigned — setting
 * it directly would test a state the card cannot actually be in.
 */
export const enterEditing = async (card: PictureStudioCard): Promise<EditorSpy> => {
  const spy: EditorSpy = {
    commits: [],
    boxes: [],
    selections: [],
    anchors: [],
    release: () => undefined,
    activeTool: DEFAULT_TOOL,
  };
  let selected: number | undefined;
  const off = registerEditor({
    patchPosition: (index, position) => spy.commits.push({ index, position }),
    patchBox: (index, box, position) => spy.boxes.push({ index, box, position }),
    patchAnchor: (index, anchor) => spy.anchors.push({ index, anchor }),
    select: (index) => {
      selected = index;
      spy.selections.push(index);
      notifyEditors();
    },
    selectedIndex: () => selected,
    tool: () => spy.activeTool,
    setTool: (tool) => {
      spy.activeTool = tool;
    },
  });
  spy.release = off;
  releases.push(off);

  (card as unknown as { preview: boolean }).preview = true;
  notifyEditors();
  await card.updateComplete;
  await flush();
  return spy;
};

const POINTER_ID = 1;

const pointerEvent = (
  type: string,
  clientX: number,
  clientY: number,
  modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): PointerEvent =>
  new PointerEvent(type, {
    clientX,
    clientY,
    pointerId: POINTER_ID,
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" ? 0 : 1,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...modifiers,
  });

/**
 * The three beats of a gesture, in layer coordinates, kept separate because the
 * interesting claims are mid-gesture: the badge moves in raw pixels while the
 * pointer is down, and the condition marker has to have already flipped by the
 * time the release happens.
 */
export const press = async (
  card: PictureStudioCard,
  target: HTMLElement,
  at: { x: number; y: number },
  modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): Promise<void> => {
  const base = layer(card).getBoundingClientRect();
  target.dispatchEvent(pointerEvent("pointerdown", base.left + at.x, base.top + at.y, modifiers));
  await flush();
};

export const move = async (
  card: PictureStudioCard,
  target: HTMLElement,
  to: { x: number; y: number },
  modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): Promise<void> => {
  const base = layer(card).getBoundingClientRect();
  target.dispatchEvent(pointerEvent("pointermove", base.left + to.x, base.top + to.y, modifiers));
  await flush();
};

export const release = async (
  card: PictureStudioCard,
  target: HTMLElement,
  at: { x: number; y: number },
  modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): Promise<void> => {
  const base = layer(card).getBoundingClientRect();
  target.dispatchEvent(pointerEvent("pointerup", base.left + at.x, base.top + at.y, modifiers));
  await flush();
};

/** press, every move, then release at the last point. */
export const drag = async (
  card: PictureStudioCard,
  target: HTMLElement,
  path: { x: number; y: number }[],
): Promise<void> => {
  const [start, ...rest] = path;
  if (!start) throw new Error("a gesture needs at least one point");
  await press(card, target, start);
  for (const point of rest) await move(card, target, point);
  await release(card, target, rest.at(-1) ?? start);
};

/**
 * Home Assistant's design tokens, which the page normally supplies. Without
 * them `var(--ha-space-2)` resolves to nothing, the declaration is invalid at
 * computed-value time, and getComputedStyle reports the property's initial
 * value — so a padding regression and a missing token would look identical.
 * The values are plausible rather than exact: no assertion reads them, they
 * only have to be present and equal wherever they are consumed.
 */
export const HA_TOKENS: Record<string, string> = {
  "--ha-font-size-xs": "12px",
  "--ha-font-weight-bold": "700",
  "--primary-text-color": "#212121",
  "--ha-color-fill-neutral-normal-resting": "#e0e0e0",
  "--input-fill-color": "#f5f5f5",
  "--ha-border-radius-pill": "9999px",
  "--ha-space-2": "8px",
  "--ha-space-3": "12px",
  "--ha-space-5": "20px",
  "--state-inactive-color": "#44739e",
};

export const installHaTokens = (): void => {
  for (const [name, value] of Object.entries(HA_TOKENS)) {
    document.documentElement.style.setProperty(name, value);
  }
};

/** Puts a standalone element on the page, tracked so cleanup takes it away. */
export const attach = async <T extends HTMLElement>(el: T): Promise<T> => {
  installHaTokens();
  const box = document.createElement("div");
  box.style.width = `${LAYER.width}px`;
  document.body.append(box);
  hosts.push(box);
  box.append(el);
  await (el as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
  await flush();
  return el;
};

/** One badge at `position`, under `anchor`, plus any extra item keys. */
export const configWith = (
  position: { top: string; left: string },
  anchor?: string,
  extra?: Record<string, unknown>,
): unknown => ({
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "badge",
      position,
      ...(anchor ? { anchor } : {}),
      ...extra,
      config: { type: "entity", entity: "light.a" },
    },
  ],
});
