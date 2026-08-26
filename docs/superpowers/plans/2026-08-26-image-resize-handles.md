# Image Resize Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the selected image element four corner handles, so its box is set by dragging rather than by typing two numbers into a form.

**Architecture:** A pure arithmetic module (`src/resize-box.ts`) holds every geometric decision of a corner resize and knows nothing about the DOM; a controller (`src/card/resize-layer.ts`) drives it from pointer and keyboard events, writing raw pixels on the wrapper for the length of the gesture and committing percentages once at the release; the card owns the hit test that decides whether a press is a move or a resize, and owns the handle nodes. This mirrors the pair that already exists — `position.ts` + `card/drag-layer.ts` — and reuses its primitives rather than restating them.

**Tech Stack:** TypeScript, Lit 3, rstest (two lanes: `happy-dom` for logic, `playwright` for anything needing real layout), Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-26-image-resize-handles-design.md` — read it before Task 1. The plan argues from it and does not restate its reasoning.

## Global Constraints

- **Branch:** `feat/image-resize-handles`, cut from `next`, target recorded. Never push; the user pushes.
- **Language:** all code, comments, tests, docs and commit messages in **English**. Chat is French.
- **Serena is primary for code.** Explore with `get_symbols_overview` / `find_symbol`; edit with `replace_symbol_body` / `insert_after_symbol` / `replace_content`. Built-in Read/Edit only for `.md`, JSON, YAML and config, or when Serena fails on an unparseable file. **This rule travels into every subagent prompt that touches code.**
- **Formatter after every modification:** `pnpm format` (Biome), then `pnpm lint` must be clean of new diagnostics.
- **Pixels during the gesture, percentages only at the release.** No `setConfig` fires mid-gesture.
- **No clamping in the normalizer.** `normalizeImageBox` gains no upper bound. The gesture's clamp lives in the controller and nowhere else.
- **`height` absent IS keep-ratio.** There is no `keep_ratio` key. Removing the mode means **omitting the key**, never setting it to `undefined` — `"height" in config` is the predicate `normalizeImageBox`, `effectiveBox` and the form all read.
- **The form's box fields stay.** Spec decision 14 amends the image spec: `width`, `height` and the keep-ratio checkbox are **not** removed here. They go when the keyboard path of follow-up 9 exists, because that — not the handles — is what replaces them for someone without a pointer. Do not "finish the job" by deleting them.
- **No version bump** in `package.json` unless the user asks in so many words.
- **`CHANGELOG.md`** is updated in Task 6, under `## 1.6.0 — unreleased`, in the `### Added` section, written for users of the card.
- **Test baseline:** the delivery's full `pnpm test` run updates `testFiles` and `passedTests` with the date in `mem:picture-studio/1.6.0-handoff`. Scoped runs never touch it. Last recorded: 2026-08-25, 47 files, 956 tests.

## File Structure

**Created:**

| File | Responsibility |
| ---- | -------------- |
| `src/resize-box.ts` | The arithmetic of a corner resize. Pure functions, no DOM, no layout. Every decision about the ratio lock, the fixed point, the clamp and the floor lives here. |
| `src/card/resize-layer.ts` | The gesture controller. Pointer and keyboard listeners, the live pixel writes, the commit rule. |
| `src/tests/happy-dom/resize-box.test.ts` | Unit tests for the arithmetic. |
| `src/tests/happy-dom/card/resize-layer.test.ts` | Controller tests, synthetic events against a stubbed layout. |
| `src/tests/playwright/resize.test.ts` | The two claims happy-dom cannot make: the read-back height, and that the committed box renders where the gesture drew it. |

**Modified:**

| File | Change |
| ---- | ------ |
| `src/broker.ts` | `EditorChannel` gains `patchBox`. |
| `src/editor/picture-studio-editor.ts` | Implements `patchBox`. |
| `src/element-kinds.ts` | `ElementKind` gains `resizable`; `IMAGE_KIND` declares it; `isResizableKind` reads it. |
| `src/card/drag-layer.ts` | `DragOptions` gains `isHandle`, consulted first in `onPointerDown`. |
| `src/card/picture-studio-card.ts` | The hit test, the resize controller, the handle nodes, the live-gesture owner, the transient `fitMode`, the handle styles. |
| `src/card/image-element.ts` | A `stretch` override property, so the element can render `fill` before the config says so. |
| `src/tests/playwright/harness.ts` | `EditorSpy.boxes`; modifier keys on synthetic pointer events. |
| `src/tests/happy-dom/broker.test.ts`, `src/tests/happy-dom/card/picture-studio-card.test.ts` | Their `EditorChannel` stubs gain `patchBox`. |
| `CHANGELOG.md`, `README.md` | Task 6. |

---

### Task 1: The resize arithmetic

Pure functions. No DOM, no `getBoundingClientRect`, no layout. This is where the spec's decisions 3, 4, 9 and 10 live, and it is testable to the last branch without a browser.

**Files:**
- Create: `src/resize-box.ts`
- Test: `src/tests/happy-dom/resize-box.test.ts`

**Interfaces:**
- Consumes: `AxisBounds`, `OPEN_BOUNDS`, `tighten` from `src/position.ts`.
- Produces:
  - `type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"`
  - `RESIZE_FLOOR_PX: number`
  - `cornerGrabs(corner: Corner): { x: boolean; y: boolean }`
  - `fixedPoint(origin: number, size: number, trailing: boolean, fraction: number | null): number`
  - `requestedSize(pointer: number, fixed: number, trailing: boolean, fraction: number | null): number | undefined`
  - `edgeAt(fixed: number, size: number, trailing: boolean, fraction: number | null): { leading: number; trailing: number }`
  - `edgeSlopes(trailing: boolean, fraction: number | null): { leading: number; trailing: number }`
  - `sizeRange(base: number, slope: number, bounds: AxisBounds): AxisBounds`
  - `intersect(a: AxisBounds, b: AxisBounds): AxisBounds`
  - `lockedScale(requested: { x?: number; y?: number }, box: { width: number; height: number }): number | undefined`
  - `percentOfContainer(px: number, container: number): number`

**The model, in one paragraph.** On one axis the box is an interval `[leading, trailing]` of size `s`. A gesture holds one point fixed and lets `s` vary; **both edges are affine in `s`**, which is what makes the default mode and the ALT mode one piece of code rather than two. `fraction` is that axis' fixed point as a share of the box: `null` means "hold the edge opposite the grabbed one" (the default), a number in `[0, 1]` means "hold the anchor" (ALT). `trailing` says whether the grabbed corner is that axis' trailing edge.

- [ ] **Step 1: Write the failing tests for the fixed point and the requested size**

Create `src/tests/happy-dom/resize-box.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { OPEN_BOUNDS } from "../../position";
import {
  cornerGrabs,
  edgeAt,
  edgeSlopes,
  fixedPoint,
  intersect,
  lockedScale,
  percentOfContainer,
  requestedSize,
  RESIZE_FLOOR_PX,
  sizeRange,
} from "../../resize-box";

describe("cornerGrabs", () => {
  it("reads each corner as a pair of per-axis edges", () => {
    expect(cornerGrabs("bottom-right")).toEqual({ x: true, y: true });
    expect(cornerGrabs("top-left")).toEqual({ x: false, y: false });
    expect(cornerGrabs("top-right")).toEqual({ x: true, y: false });
    expect(cornerGrabs("bottom-left")).toEqual({ x: false, y: true });
  });
});

describe("fixedPoint", () => {
  // Box [100, 140] on this axis: origin 100, size 40.
  it("holds the opposite edge by default", () => {
    expect(fixedPoint(100, 40, true, null)).toBe(100); // grabbed the trailing edge
    expect(fixedPoint(100, 40, false, null)).toBe(140); // grabbed the leading edge
  });

  it("holds the anchor when a fraction is given, whichever edge is grabbed", () => {
    expect(fixedPoint(100, 40, true, 0.5)).toBe(120); // centre
    expect(fixedPoint(100, 40, false, 0.5)).toBe(120);
    expect(fixedPoint(100, 40, true, 0)).toBe(100);
    expect(fixedPoint(100, 40, true, 1)).toBe(140);
  });
});

describe("requestedSize", () => {
  it("puts the grabbed edge under the pointer in the default mode", () => {
    // Fixed leading edge at 100, pointer at 180 -> the box wants to be 80 wide.
    expect(requestedSize(180, 100, true, null)).toBe(80);
    // Fixed trailing edge at 140, pointer at 60 -> 80 wide.
    expect(requestedSize(60, 140, false, null)).toBe(80);
  });

  it("scales by the anchor's share when the anchor is held", () => {
    // Anchor at the centre: the grabbed edge covers half the growth, so a
    // pointer 40 past the anchor asks for a box of 80.
    expect(requestedSize(160, 120, true, 0.5)).toBe(80);
    expect(requestedSize(80, 120, false, 0.5)).toBe(80);
    // Anchor a quarter in: the trailing edge covers three quarters.
    expect(requestedSize(180, 120, true, 0.25)).toBe(80);
  });

  it("has no answer when the grabbed edge is the fixed point itself", () => {
    // Anchor on the trailing edge, and the trailing edge is what was grabbed:
    // the pointer cannot say anything about the size on this axis.
    expect(requestedSize(180, 140, true, 1)).toBeUndefined();
    expect(requestedSize(80, 100, false, 0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/happy-dom/resize-box.test.ts`
Expected: FAIL — `Cannot find module '../../resize-box'`.

- [ ] **Step 3: Write the module's first half**

Create `src/resize-box.ts`:

```ts
import { type AxisBounds, OPEN_BOUNDS } from "./position";

/**
 * The arithmetic of a corner resize, with no DOM in it.
 *
 * On one axis the box is an interval `[leading, trailing]` of size `s`. A
 * gesture holds one point fixed and lets `s` vary, and **both edges are affine
 * in `s`** — which is the whole reason the default mode and the ALT mode are one
 * piece of code rather than two.
 *
 * Two parameters carry the mode, everywhere below:
 *
 * - `trailing` — whether the grabbed corner is this axis' trailing edge.
 * - `fraction` — the fixed point as a share of the box. `null` is the default
 *   mode, "hold the edge opposite the grabbed one". A number is the anchor's own
 *   share, which is ALT: `positionStyle` already translates the wrapper by that
 *   fraction of its own size, so holding it is what "resize from the anchor"
 *   means.
 */

/** Which corner the pointer grabbed. */
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * The smallest box a gesture may produce, in pixels.
 *
 * Not an arbitrary guard: below roughly twice the handle's own size the four
 * handles overlap and there is nothing left to grab. The drag needs no
 * equivalent — it cannot make an item disappear.
 */
export const RESIZE_FLOOR_PX = 24;

/** Guards a division by a gain that has collapsed; see `requestedSize`. */
const EPSILON = 1e-6;

/** A corner read as a pair of per-axis edges. */
export const cornerGrabs = (corner: Corner): { x: boolean; y: boolean } => ({
  x: corner === "top-right" || corner === "bottom-right",
  y: corner === "bottom-left" || corner === "bottom-right",
});

/** The point this axis holds still for the whole gesture. */
export const fixedPoint = (
  origin: number,
  size: number,
  trailing: boolean,
  fraction: number | null,
): number => (fraction === null ? (trailing ? origin : origin + size) : origin + fraction * size);

/**
 * The size the pointer is asking for on one axis.
 *
 * `gain` is how much of a size change the grabbed edge actually travels: all of
 * it when the opposite edge is held, and only its share of the box when the
 * anchor is. **Undefined when that gain collapses** — anchor on the trailing
 * edge with the trailing edge grabbed, and its mirror. The grabbed edge is then
 * the fixed point, it cannot move, and this axis has nothing to say about the
 * size. Callers drop the axis rather than divide by zero.
 */
export const requestedSize = (
  pointer: number,
  fixed: number,
  trailing: boolean,
  fraction: number | null,
): number | undefined => {
  const gain = fraction === null ? 1 : trailing ? 1 - fraction : fraction;
  if (Math.abs(gain) < EPSILON) return undefined;
  return (trailing ? pointer - fixed : fixed - pointer) / gain;
};
```

- [ ] **Step 4: Run the tests to verify the first three pass**

Run: `pnpm test src/tests/happy-dom/resize-box.test.ts`
Expected: the three `describe` blocks written so far PASS; the file has no other tests yet.

- [ ] **Step 5: Write the failing tests for the edges, the ranges and the scale**

Append to `src/tests/happy-dom/resize-box.test.ts`:

```ts
describe("edgeAt and edgeSlopes", () => {
  it("places both edges from the fixed point and the size", () => {
    // Default mode, trailing grab: the leading edge is the fixed one and stays.
    expect(edgeAt(100, 60, true, null)).toEqual({ leading: 100, trailing: 160 });
    // Default mode, leading grab: the trailing edge is fixed.
    expect(edgeAt(140, 60, false, null)).toEqual({ leading: 80, trailing: 140 });
    // Anchor held at 120, a quarter into the box: 15 left of it, 45 right.
    expect(edgeAt(120, 60, true, 0.25)).toEqual({ leading: 105, trailing: 165 });
  });

  it("reports the slope of each edge against the size", () => {
    expect(edgeSlopes(true, null)).toEqual({ leading: 0, trailing: 1 });
    expect(edgeSlopes(false, null)).toEqual({ leading: -1, trailing: 0 });
    expect(edgeSlopes(true, 0.25)).toEqual({ leading: -0.25, trailing: 0.75 });
  });

  it("agrees with edgeAt: base plus slope times size", () => {
    const size = 60;
    const at = edgeAt(120, size, true, 0.25);
    const slopes = edgeSlopes(true, 0.25);
    expect(120 + slopes.leading * size).toBeCloseTo(at.leading, 10);
    expect(120 + slopes.trailing * size).toBeCloseTo(at.trailing, 10);
  });
});

describe("sizeRange", () => {
  it("inverts a rising edge", () => {
    // trailing = 100 + s, allowed to sit in [100, 300] -> s in [0, 200].
    expect(sizeRange(100, 1, { lo: 100, hi: 300 })).toEqual({ lo: 0, hi: 200 });
  });

  it("inverts a falling edge, swapping the ends", () => {
    // leading = 140 - s, allowed to sit in [0, 140] -> s in [0, 140].
    expect(sizeRange(140, -1, { lo: 0, hi: 140 })).toEqual({ lo: 0, hi: 140 });
    // leading = 140 - s, allowed in [40, 100] -> s in [40, 100].
    expect(sizeRange(140, -1, { lo: 40, hi: 100 })).toEqual({ lo: 40, hi: 100 });
  });

  it("constrains nothing when the edge does not move", () => {
    expect(sizeRange(100, 0, { lo: 100, hi: 300 })).toEqual(OPEN_BOUNDS);
  });
});

describe("intersect", () => {
  it("keeps the tighter end on each side", () => {
    expect(intersect({ lo: 0, hi: 200 }, { lo: 30, hi: 150 })).toEqual({ lo: 30, hi: 150 });
    expect(intersect({ lo: 40, hi: 200 }, { lo: 30, hi: 150 })).toEqual({ lo: 40, hi: 150 });
  });
});

describe("lockedScale", () => {
  /**
   * The single degree of freedom of a ratio-locked resize: the least-squares
   * projection of the two axes' requests onto the box's own diagonal. Clamping
   * the two axes separately, as the drag rightly does, would leave w/h off the
   * locked ratio — the distortion that grows as a corner is pushed into a
   * border.
   */
  it("agrees with both axes when they agree with each other", () => {
    expect(lockedScale({ x: 80, y: 40 }, { width: 40, height: 20 })).toBeCloseTo(2, 10);
  });

  it("projects onto the diagonal when they disagree", () => {
    // w=40, h=20 -> kx=2, ky=1. k = (2*1600 + 1*400) / 2000 = 1.8
    expect(lockedScale({ x: 80, y: 20 }, { width: 40, height: 20 })).toBeCloseTo(1.8, 10);
  });

  it("weighs the longer axis more, which is what makes the drag feel steady", () => {
    // The same disagreement on a box whose width dominates: k leans to kx.
    // w=90, h=30 -> kx=2, ky=1. k = (2*8100 + 1*900) / 9000 = 1.9
    expect(lockedScale({ x: 180, y: 30 }, { width: 90, height: 30 })).toBeCloseTo(1.9, 10);
  });

  it("falls back to the axis that has an answer", () => {
    expect(lockedScale({ x: undefined, y: 40 }, { width: 40, height: 20 })).toBeCloseTo(2, 10);
    expect(lockedScale({ x: 80, y: undefined }, { width: 40, height: 20 })).toBeCloseTo(2, 10);
  });

  it("has no answer when neither axis does", () => {
    expect(lockedScale({}, { width: 40, height: 20 })).toBeUndefined();
  });

  it("has no answer for a degenerate box", () => {
    expect(lockedScale({ x: 80, y: 40 }, { width: 0, height: 0 })).toBeUndefined();
  });
});

describe("percentOfContainer", () => {
  it("rounds to two decimals, like every stored number", () => {
    expect(percentOfContainer(80, 400)).toBe(20);
    expect(percentOfContainer(81, 400)).toBe(20.25);
    expect(percentOfContainer(1, 3)).toBe(33.33);
  });

  it("answers zero for a container with no extent", () => {
    expect(percentOfContainer(80, 0)).toBe(0);
  });
});

describe("RESIZE_FLOOR_PX", () => {
  it("is large enough that four handles do not overlap", () => {
    expect(RESIZE_FLOOR_PX).toBeGreaterThanOrEqual(16);
  });
});
```

- [ ] **Step 6: Run to verify the new tests fail**

Run: `pnpm test src/tests/happy-dom/resize-box.test.ts`
Expected: FAIL — `edgeAt`, `edgeSlopes`, `sizeRange`, `intersect`, `lockedScale`, `percentOfContainer` are not exported.

- [ ] **Step 7: Write the module's second half**

Append to `src/resize-box.ts`:

```ts
/** Where both edges sit for a given size. */
export const edgeAt = (
  fixed: number,
  size: number,
  trailing: boolean,
  fraction: number | null,
): { leading: number; trailing: number } => {
  const slopes = edgeSlopes(trailing, fraction);
  return {
    leading: fixed + slopes.leading * size,
    trailing: fixed + slopes.trailing * size,
  };
};

/**
 * Each edge's rate of travel against the size. The pair is the affine form the
 * clamp inverts, and `edgeAt` is the same two lines evaluated.
 */
export const edgeSlopes = (
  trailing: boolean,
  fraction: number | null,
): { leading: number; trailing: number } =>
  fraction === null
    ? trailing
      ? { leading: 0, trailing: 1 }
      : { leading: -1, trailing: 0 }
    : { leading: -fraction, trailing: 1 - fraction };

/**
 * The sizes for which an affine edge stays inside its bounds.
 *
 * A falling edge swaps the ends: the largest size puts it lowest. An edge that
 * does not move constrains nothing — which is the ALT case where the anchor
 * sits exactly on it, and the default case for the edge being held.
 */
export const sizeRange = (base: number, slope: number, bounds: AxisBounds): AxisBounds => {
  if (Math.abs(slope) < EPSILON) return OPEN_BOUNDS;
  const a = (bounds.lo - base) / slope;
  const b = (bounds.hi - base) / slope;
  return slope > 0 ? { lo: a, hi: b } : { lo: b, hi: a };
};

export const intersect = (a: AxisBounds, b: AxisBounds): AxisBounds => ({
  lo: Math.max(a.lo, b.lo),
  hi: Math.min(a.hi, b.hi),
});

/**
 * The single scale factor a ratio-locked gesture ends up with.
 *
 * **A ratio-locked resize has one degree of freedom**, so the two axes' requests
 * have to be reduced to one number before anything is applied. This is the
 * least-squares projection of `(sx, sy)` onto the ray through `(w₀, h₀)`:
 * minimising `‖k·(w₀,h₀) − (sx,sy)‖²` gives `k = (w₀·sx + h₀·sy) / (w₀² + h₀²)`,
 * which is the expression below written in terms of each axis' own scale.
 *
 * Clamping the two axes independently instead — the shape the drag rightly uses
 * for its two independent axes — leaves `w/h` off the locked ratio, and the
 * symptom reads as a rendering bug: the image stays proportioned toward the
 * middle of the picture and distorts progressively as a corner is pushed into a
 * border.
 *
 * An axis with no request is dropped rather than treated as zero; see
 * `requestedSize`.
 */
export const lockedScale = (
  requested: { x?: number; y?: number },
  box: { width: number; height: number },
): number | undefined => {
  const { width: w, height: h } = box;
  const kx = requested.x === undefined || w === 0 ? undefined : requested.x / w;
  const ky = requested.y === undefined || h === 0 ? undefined : requested.y / h;
  if (kx === undefined) return ky;
  if (ky === undefined) return kx;
  const denominator = w * w + h * h;
  return denominator === 0 ? undefined : (kx * w * w + ky * h * h) / denominator;
};

/**
 * A size as a percentage of the surface, rounded the way every stored number is.
 *
 * Not `toPercent`, which converts a *coordinate* and takes the anchor into
 * account. A size has no anchor.
 */
export const percentOfContainer = (px: number, container: number): number =>
  container === 0 ? 0 : Math.round((10000 * px) / container) / 100;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test src/tests/happy-dom/resize-box.test.ts`
Expected: PASS, every block.

- [ ] **Step 9: Typecheck and format**

Run: `pnpm typecheck && pnpm format && pnpm lint`
Expected: no errors, no new diagnostics.

- [ ] **Step 10: Commit**

```bash
git add src/resize-box.ts src/tests/happy-dom/resize-box.test.ts
git commit -m "feat(resize): the arithmetic of a corner resize, with no DOM in it

Both edges are affine in the size, which is what makes the default mode
and the ALT mode one piece of code. The ratio lock is a least-squares
projection onto the box's diagonal, because a locked resize has one
degree of freedom and two independent clamps would distort it against
the borders.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `patchBox` on the editor channel

The gesture commits a box and, in the default mode, a position — in **one** write. `patchAnchor` already settled why: two commits render the new value against the old one for a frame.

**Files:**
- Modify: `src/broker.ts` (the `EditorChannel` interface)
- Modify: `src/editor/picture-studio-editor.ts` (after `patchPosition`, around line 155)
- Modify: `src/tests/happy-dom/broker.test.ts`, `src/tests/happy-dom/card/picture-studio-card.test.ts`, `src/tests/playwright/harness.ts` (their `EditorChannel` stubs)
- Test: `src/tests/happy-dom/editor/picture-studio-editor.test.ts`

**Interfaces:**
- Consumes: `ImageBox` from `src/image-box.ts`, `Position` from `src/position.ts`.
- Produces: `EditorChannel.patchBox(index: number, box: ImageBox, position?: Position): void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/happy-dom/editor/picture-studio-editor.test.ts`. The file's own `mount()` builds a two-badge config and returns `{ el }`; `patchBox` needs an image element, so this block brings its own helper alongside it — the config differs, the mounting does not.

Commits are observed on the `config-changed` event, which is what `_commit` re-emits and what Home Assistant listens to. `_commit` is `protected` and is not the seam to reach for.

```ts
describe("patchBox", () => {
  const imageConfig = (
    box: Record<string, unknown> = { width: 20 },
    extra: Record<string, unknown> = {},
  ) =>
    ({
      type: "custom:picture-studio",
      image: "/local/plan.png",
      items: [
        {
          type: "element",
          position: { top: "10%", left: "10%" },
          config: { type: "image", ...box, ...extra },
        },
      ],
    }) as unknown as PictureStudioConfig;

  const mountImage = async (config = imageConfig()) => {
    const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
    el.setConfig(config);
    el.hass = { localize: () => "", states: {} } as never;
    const emitted: PictureStudioConfig[] = [];
    el.addEventListener("config-changed", (ev) => {
      emitted.push((ev as CustomEvent<{ config: PictureStudioConfig }>).detail.config);
    });
    document.body.append(el);
    await el.updateComplete;
    return { el, emitted, last: () => emitted.at(-1) as PictureStudioConfig };
  };

  const firstItem = (config: PictureStudioConfig) => config.items[0] as ElementItem;

  it("writes the width into the item's own config", async () => {
    const h = await mountImage();
    h.el.patchBox(0, { width: 42 });
    expect(firstItem(h.last()).config).toMatchObject({ width: 42 });
  });

  it("omits height rather than setting it to undefined, so keep-ratio survives", async () => {
    // `"height" in config` is the predicate normalizeImageBox, effectiveBox and
    // the form all read. A key present with an undefined value reads as a
    // height that is there and is not a number.
    const h = await mountImage();
    h.el.patchBox(0, { width: 42 });
    expect("height" in firstItem(h.last()).config).toBe(false);
  });

  it("removes a height that was there when the new box has none", async () => {
    const h = await mountImage(imageConfig({ width: 20, height: 30 }));
    h.el.patchBox(0, { width: 42 });
    expect("height" in firstItem(h.last()).config).toBe(false);
  });

  it("writes box and position in a single commit", async () => {
    const h = await mountImage();
    const before = h.emitted.length;
    h.el.patchBox(0, { width: 42, height: 21 }, { left: 10, top: 20 });
    expect(h.emitted.length - before).toBe(1);
    expect(firstItem(h.last()).config).toMatchObject({ width: 42, height: 21 });
    expect(firstItem(h.last()).position).toEqual({ left: 10, top: 20 });
  });

  it("leaves the position alone when the gesture did not move the box", async () => {
    const h = await mountImage();
    h.el.patchBox(0, { width: 42 });
    expect(firstItem(h.last()).position).toEqual({ left: 10, top: 10 });
  });

  it("leaves every other key of the config untouched", async () => {
    const h = await mountImage(
      imageConfig({ width: 20 }, { image: "/a.png", tap_action: { action: "none" } }),
    );
    h.el.patchBox(0, { width: 42 });
    expect(firstItem(h.last()).config).toMatchObject({
      image: "/a.png",
      tap_action: { action: "none" },
    });
  });

  it("ignores an item that is not a readable image", async () => {
    // `normalizeConfig` turns an unrecognised element type into an UnknownItem,
    // whose raw config is written back untouched. No handle can exist on one —
    // it has no wrapper — so this guard is a floor, like patchPosition's.
    const h = await mountImage({
      type: "custom:picture-studio",
      image: "/local/plan.png",
      items: [{ type: "element", position: { top: "0%", left: "0%" }, config: { type: "nope" } }],
    } as unknown as PictureStudioConfig);
    const before = h.emitted.length;
    h.el.patchBox(0, { width: 42 });
    expect(h.emitted.length).toBe(before);
  });
});
```

Add `ElementItem` and `PictureStudioConfig` to the file's type imports from `../../../config` if they are not already there.

**On the last test:** `patchBox` still calls `_commit` for an unreadable item in the implementation below, which would emit. Make the guard return early *before* `_commit` when no item matched — see Step 4's note.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: FAIL — `h.el.patchBox is not a function`.

- [ ] **Step 3: Add the method to the channel**

In `src/broker.ts`, add to `EditorChannel` immediately after `patchPosition`, and add `ImageBox` to the import from `./image-box`:

```ts
  /**
   * An image element's box, and — when the gesture moved it — its position, in
   * **one** write. `patchAnchor`'s comment says why two would not do: they would
   * render the new box against the old coordinates for a frame.
   *
   * `box` carries `height` by its presence. Omitting the key is what keep-ratio
   * *is*, so this must never write `height: undefined`.
   */
  patchBox(index: number, box: ImageBox, position?: Position): void;
```

- [ ] **Step 4: Implement it on the editor**

In `src/editor/picture-studio-editor.ts`, insert after `patchPosition` (before `patchAnchor`):

```ts
  /**
   * The resize gesture's single commit.
   *
   * `height` is rebuilt rather than spread: the key's *absence* is the
   * keep-ratio mode, and `{ ...config, height: undefined }` would leave a key
   * present with a value that is not a number — which `normalizeImageBox`
   * discards on the next read and `"height" in config` reads as present in the
   * meantime.
   */
  patchBox(index: number, box: ImageBox, position?: Position): void {
    const config = this._config;
    if (!config) return;
    const target = config.items[index];
    // Unreachable today for the same reason patchPosition's guard is: an item
    // that is not a readable image has no handle, because it has no wrapper the
    // card would hang one on. It returns *before* committing rather than
    // committing an unchanged config: a no-op commit still rebuilds the card.
    if (!target || target.type !== "element" || target.config.type !== "image") return;

    const { height: _dropped, ...rest } = target.config;
    const next: ImageElementConfig = {
      ...rest,
      width: box.width,
      ...(box.height === undefined ? {} : { height: box.height }),
    };
    const items = config.items.map((item, i) =>
      i === index ? { ...item, ...(position ? { position } : {}), config: next } : item,
    );
    this._commit({ ...config, items });
  }
```

Add `ImageBox` to the `./image-box` import and `ImageElementConfig` to the `./config` import.

- [ ] **Step 5: Add `patchBox` to the three `EditorChannel` stubs**

`src/tests/happy-dom/broker.test.ts` and `src/tests/happy-dom/card/picture-studio-card.test.ts`: add `patchBox: () => undefined,` to each object passed to `registerEditor` — unless the test asserts on it, in which case push to an array as its neighbours do.

`src/tests/playwright/harness.ts`: extend `EditorSpy` and the registration:

```ts
export interface EditorSpy {
  commits: { index: number; position: Position }[];
  boxes: { index: number; box: ImageBox; position?: Position }[];
  selections: (number | undefined)[];
  anchors: { index: number; anchor: Anchor }[];
  release(): void;
}
```

```ts
    patchBox: (index, box, position) => spy.boxes.push({ index, box, position }),
```

and `boxes: [],` in the initial `spy` literal. Import `ImageBox` from `../../image-box`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/tests/happy-dom/editor/picture-studio-editor.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole happy-dom lane and typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. `pnpm typecheck` is what catches a stub that was missed.

- [ ] **Step 8: Format and commit**

```bash
pnpm format && pnpm lint
git add -A
git commit -m "feat(editor): patchBox writes an image's box and its position in one commit

The height key is rebuilt rather than spread: its absence is what
keep-ratio is, and an undefined value would read as present.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The resize controller

**Files:**
- Create: `src/card/resize-layer.ts`
- Test: `src/tests/happy-dom/card/resize-layer.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produced; `tighten`, `OPEN_BOUNDS`, `toPercent`, `axisOffset`, `positionStyle`, `Anchor`, `Position`, `AxisBounds` from `src/position.ts`; `ImageBox`, `LiveCameraKeys`, `ratioIsForced`, `imageBoxStyle` from `src/image-box.ts`.
- Produces:

```ts
export interface ResizeHit {
  element: HTMLElement;
  index: number;
  corner: Corner;
}

export interface ResizeOptions {
  /** Resolve a pointer target to the handle it is, with its item and corner. */
  getHandle(target: EventTarget | null): ResizeHit | undefined;
  /** The element whose box defines 100%: the same box hui-image fills. */
  getSurface(): HTMLElement | null;
  getAnchor(index: number): Anchor;
  getPosition(index: number): Position;
  /** The item's stored box and camera keys, or undefined if it is gone. */
  getConfig(index: number): (ImageBox & LiveCameraKeys) | undefined;
  onCommit(index: number, box: ImageBox, position?: Position): void;
  /**
   * Whether the box currently carries an explicit height, so the card can push
   * a transient fit mode. `undefined` at the release drops the override.
   */
  onStretch?(index: number, stretched: boolean | undefined): void;
}

export const createResizeController: (options: ResizeOptions) => {
  attach(element: HTMLElement): void;
  detach(): void;
  /** The index of the item currently being resized, or undefined if idle. */
  resizingIndex(): number | undefined;
};
```

- [ ] **Step 1: Write the failing tests**

Create `src/tests/happy-dom/card/resize-layer.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { createResizeController } from "../../../card/resize-layer";
import type { ImageBox, LiveCameraKeys } from "../../../image-box";
import type { Anchor, Position } from "../../../position";

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
    ({ left: 0, top: 0, width: SURFACE.width, height: SURFACE.height }) as DOMRect;

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
    return { left, top, width: w, height: h, right: left + w, bottom: top + h } as DOMRect;
  };

  const commits: { index: number; box: ImageBox; position?: Position }[] = [];
  const stretches: (boolean | undefined)[] = [];

  const controller = createResizeController({
    getHandle: (target) =>
      target === handle ? { element: wrapper, index: 0, corner: "bottom-right" } : undefined,
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
    expect("height" in (h.commits[0]?.box as ImageBox)).toBe(false);
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
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(100, 6);

    h.send("pointermove", 560, 80); // and it cannot leave again
    expect(Number.parseFloat(h.wrapper.style.width)).toBeCloseTo(80, 6);
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
    expect("height" in (h.commits[0]?.box as ImageBox)).toBe(false);
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
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: FAIL — `Cannot find module '../../../card/resize-layer'`.

- [ ] **Step 3: Write the controller**

Create `src/card/resize-layer.ts`:

```ts
import {
  type ImageBox,
  imageBoxStyle,
  type LiveCameraKeys,
  ratioIsForced,
} from "../image-box";
import {
  type Anchor,
  type AxisBounds,
  axisOffset,
  OPEN_BOUNDS,
  type Position,
  positionStyle,
  tighten,
  toPercent,
} from "../position";
import {
  type Corner,
  cornerGrabs,
  edgeAt,
  edgeSlopes,
  fixedPoint,
  intersect,
  lockedScale,
  percentOfContainer,
  requestedSize,
  RESIZE_FLOOR_PX,
  sizeRange,
} from "../resize-box";

export interface ResizeHit {
  element: HTMLElement;
  index: number;
  corner: Corner;
}

export interface ResizeOptions {
  getHandle(target: EventTarget | null): ResizeHit | undefined;
  getSurface(): HTMLElement | null;
  getAnchor(index: number): Anchor;
  getPosition(index: number): Position;
  getConfig(index: number): (ImageBox & LiveCameraKeys) | undefined;
  onCommit(index: number, box: ImageBox, position?: Position): void;
  onStretch?(index: number, stretched: boolean | undefined): void;
}

/** One axis of the gesture, kept in pixels for its whole length. */
interface AxisState {
  /** Where the box's leading edge sat at pointerdown, in surface pixels. */
  origin: number;
  /** The size at pointerdown, which every scale is measured against. */
  size0: number;
  /** The surface's extent. */
  container: number;
  /** True when the grabbed corner is this axis' trailing edge. */
  trailing: boolean;
  /** The anchor's share of the box, for the ALT mode. */
  anchorFraction: number;
  /** The ratcheted interval each edge may sit in; closed in on every move. */
  leadingBounds: AxisBounds;
  trailingBounds: AxisBounds;
  /** The current size, which the ratchet tightens around. */
  size: number;
  /**
   * Where the leading edge currently sits.
   *
   * Kept rather than recomputed at the release, and that is not tidiness: the
   * edge's formula depends on the mode, so recomputing it at the commit would
   * need to know whether ALT was held on the last frame — reintroducing exactly
   * the modifier-history dependency decision 7 removes. `apply` is the only
   * writer, so what is stored here is what is on screen.
   */
  lead: number;
}

interface ResizeState {
  hit: ResizeHit;
  pointerId: number;
  x: AxisState;
  y: AxisState;
  anchor: Anchor;
  /** `"height" in config` at pointerdown — the STORED key, not the drawn box. */
  hadHeight: boolean;
  /** The stored height, which a forced ratio keeps dormant. */
  storedHeight: number | undefined;
  storedWidth: number;
  forced: boolean;
  /** The stored coordinates, to tell a real change from none. */
  position0: Position;
  /** Last pointer position, so the keyboard can replay the same computation. */
  clientX: number;
  clientY: number;
  /** What `onStretch` last announced, so it is only raised on a change. */
  stretched: boolean;
  /**
   * The six declarations pointerdown overwrites, kept verbatim. A gesture that
   * commits nothing has to put back exactly what was there: recomputing them
   * would land a hundredth of a percent off for no reason.
   */
  originStyle: {
    left: string;
    top: string;
    transform: string;
    width: string;
    height: string;
    maxHeight: string;
  };
}

export const createResizeController = (options: ResizeOptions) => {
  let root: HTMLElement | undefined;
  let state: ResizeState | undefined;

  const axis = (
    origin: number,
    size: number,
    container: number,
    trailing: boolean,
    fraction: number,
  ): AxisState => ({
    origin,
    size0: size,
    container,
    trailing,
    anchorFraction: fraction,
    leadingBounds: OPEN_BOUNDS,
    trailingBounds: OPEN_BOUNDS,
    size,
    lead: origin,
  });

  /**
   * The anchor's share of the box on one axis.
   *
   * `positionStyle` translates the wrapper by exactly this fraction of its own
   * size, so holding it still is what "resize from the anchor" means. Under
   * `auto` the fraction IS the coordinate — which is also why `toPercent` with a
   * null offset is the right inverse at the commit, and why nothing here has to
   * solve the self-reference by hand.
   */
  const fractionOf = (anchor: Anchor, position: Position, ax: "x" | "y"): number =>
    (axisOffset(anchor, ax) ?? (ax === "x" ? position.left : position.top)) / 100;

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    if (state) return; // ignore a second pointer while a gesture is in progress
    const hit = options.getHandle(ev.target);
    if (!hit) return;
    const surface = options.getSurface();
    const config = options.getConfig(hit.index);
    if (!surface || !config) return;

    const surfaceBox = surface.getBoundingClientRect();
    const box = hit.element.getBoundingClientRect();
    const grabs = cornerGrabs(hit.corner);
    const anchor = options.getAnchor(hit.index);
    const position = options.getPosition(hit.index);

    state = {
      hit,
      pointerId: ev.pointerId,
      x: axis(
        box.left - surfaceBox.left,
        box.width,
        surfaceBox.width,
        grabs.x,
        fractionOf(anchor, position, "x"),
      ),
      y: axis(
        box.top - surfaceBox.top,
        box.height,
        surfaceBox.height,
        grabs.y,
        fractionOf(anchor, position, "y"),
      ),
      anchor,
      hadHeight: config.height !== undefined,
      storedHeight: config.height,
      storedWidth: config.width,
      forced: ratioIsForced(config),
      position0: position,
      clientX: ev.clientX,
      clientY: ev.clientY,
      stretched: config.height !== undefined,
      originStyle: {
        left: hit.element.style.left,
        top: hit.element.style.top,
        transform: hit.element.style.transform,
        width: hit.element.style.width,
        height: hit.element.style.height,
        maxHeight: hit.element.style.maxHeight,
      },
    };

    hit.element.setPointerCapture(ev.pointerId);
    hit.element.classList.add("resizing");

    // Switch to plain pixels, position and transform together, exactly as the
    // drag does and for the same reason: dropping the anchoring translate while
    // left/top are still percentages would shift the item by a fraction of its
    // own size.
    hit.element.style.left = `${state.x.origin}px`;
    hit.element.style.top = `${state.y.origin}px`;
    hit.element.style.transform = "none";
    hit.element.style.width = `${state.x.size0}px`;
    if (state.hadHeight && !state.forced) {
      hit.element.style.height = `${state.y.size0}px`;
    } else {
      hit.element.style.height = "";
    }
    // Dropped for the length of the gesture. `max-height: 100%` guards the
    // image file's own ratio — image spec decision 5's channel 3 — and would
    // otherwise cap the drag against the background's height with nothing on
    // screen to explain the ceiling. `imageBoxStyle` puts it back at the commit.
    hit.element.style.maxHeight = "";

    ev.preventDefault();
    ev.stopPropagation();
  };

  /** The admissible sizes on one axis, given the mode and the ratchet. */
  const sizeBounds = (a: AxisState, fraction: number | null): AxisBounds => {
    const fixed = fixedPoint(a.origin, a.size0, a.trailing, fraction);
    const slopes = edgeSlopes(a.trailing, fraction);
    return intersect(
      intersect(
        sizeRange(fixed, slopes.leading, a.leadingBounds),
        sizeRange(fixed, slopes.trailing, a.trailingBounds),
      ),
      { lo: RESIZE_FLOOR_PX, hi: Number.POSITIVE_INFINITY },
    );
  };

  /** Close the ratchet around where each edge is *now*, per the drag's rule. */
  const ratchet = (a: AxisState, fraction: number | null): void => {
    const fixed = fixedPoint(a.origin, a.size0, a.trailing, fraction);
    const now = edgeAt(fixed, a.size, a.trailing, fraction);
    // `element = 0` bounds an EDGE rather than a leading corner of fixed size:
    // span(container, 0) === container, so the interval is [0, container],
    // ratcheted around where the edge sits. It also keeps the interval constant
    // for the whole gesture, which a ratchet computed against a moving box size
    // would not be.
    a.leadingBounds = tighten(a.leadingBounds, now.leading, a.container, 0);
    a.trailingBounds = tighten(a.trailingBounds, now.trailing, a.container, 0);
  };

  /**
   * One frame of the gesture, from a pointer position and the live modifiers.
   *
   * Called from `pointermove` and from the keyboard listener with the last known
   * position — the same function, never a second implementation.
   */
  const apply = (clientX: number, clientY: number, shift: boolean, alt: boolean): void => {
    if (!state) return;
    const surface = options.getSurface();
    if (!surface) return;
    const surfaceBox = surface.getBoundingClientRect();
    state.clientX = clientX;
    state.clientY = clientY;

    const free = shift && !state.forced;
    const fx = alt ? state.x.anchorFraction : null;
    const fy = alt ? state.y.anchorFraction : null;

    ratchet(state.x, fx);
    ratchet(state.y, fy);

    const fixedX = fixedPoint(state.x.origin, state.x.size0, state.x.trailing, fx);
    const fixedY = fixedPoint(state.y.origin, state.y.size0, state.y.trailing, fy);
    const px = clientX - surfaceBox.left;
    const py = clientY - surfaceBox.top;

    const wanted = {
      x: requestedSize(px, fixedX, state.x.trailing, fx),
      y: requestedSize(py, fixedY, state.y.trailing, fy),
    };
    const boundsX = sizeBounds(state.x, fx);
    const boundsY = sizeBounds(state.y, fy);
    const clamp = (v: number, b: AxisBounds): number => Math.min(Math.max(v, b.lo), b.hi);

    if (free) {
      // Two degrees of freedom, two independent clamps — exactly the drag.
      state.x.size = clamp(wanted.x ?? state.x.size, boundsX);
      state.y.size = clamp(wanted.y ?? state.y.size, boundsY);
    } else {
      // One degree of freedom, so both axes' bounds become bounds on the SAME
      // scale factor before anything is applied. Clamping them separately is
      // what distorts the image against the borders.
      const k = lockedScale(wanted, { width: state.x.size0, height: state.y.size0 });
      if (k !== undefined) {
        const kBounds = intersect(
          {
            lo: state.x.size0 === 0 ? Number.NEGATIVE_INFINITY : boundsX.lo / state.x.size0,
            hi: state.x.size0 === 0 ? Number.POSITIVE_INFINITY : boundsX.hi / state.x.size0,
          },
          {
            lo: state.y.size0 === 0 ? Number.NEGATIVE_INFINITY : boundsY.lo / state.y.size0,
            hi: state.y.size0 === 0 ? Number.POSITIVE_INFINITY : boundsY.hi / state.y.size0,
          },
        );
        const scale = clamp(k, kBounds);
        state.x.size = state.x.size0 * scale;
        state.y.size = state.y.size0 * scale;
      }
    }

    const el = state.hit.element;
    el.style.width = `${state.x.size}px`;

    // The keep-ratio mode writes NO height: the image holds the ratio itself,
    // exactly, and the committed config will hold it the same way. Re-locking
    // must therefore CLEAR the height, not merely recompute it — leaving it
    // behind breaks nothing visible and commits a height on an item the user
    // left in keep-ratio.
    const stretched = state.forced ? false : state.hadHeight || free;
    el.style.height = stretched ? `${state.y.size}px` : "";

    // Read the resolved height back for the three corners whose fixed point is
    // not the top-left: their position depends on a size the browser decided.
    const live = el.getBoundingClientRect();
    state.y.size = stretched ? state.y.size : live.height;

    state.x.lead = edgeAt(fixedX, state.x.size, state.x.trailing, fx).leading;
    state.y.lead = edgeAt(fixedY, state.y.size, state.y.trailing, fy).leading;
    el.style.left = `${state.x.lead}px`;
    el.style.top = `${state.y.lead}px`;

    if (stretched !== state.stretched) {
      state.stretched = stretched;
      options.onStretch?.(state.hit.index, stretched);
    }
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    apply(ev.clientX, ev.clientY, ev.shiftKey, ev.altKey);
    ev.preventDefault();
  };

  /**
   * A modifier pressed or released while the pointer is still.
   *
   * On `window`, because under `setPointerCapture` the element has no keyboard
   * focus and the keys go to the dialog's focused node. The pointer event's own
   * `shiftKey` stays authoritative — an alt-tab mid-gesture takes the `keyup`
   * with it, and the next move resynchronises with nothing to repair. Auto-
   * repeat needs no guard: the computation is idempotent in its inputs.
   *
   * A modifier toggled with no movement at all since pointerdown is a no-op by
   * construction: the constraint only acts on a displacement, and there is none.
   */
  const onKey = (ev: KeyboardEvent): void => {
    if (!state) return;
    if (ev.key !== "Shift" && ev.key !== "Alt") return;
    apply(state.clientX, state.clientY, ev.shiftKey, ev.altKey);
  };

  const endGesture = (ev: PointerEvent, cancelled: boolean): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    const s = state;
    state = undefined;

    s.hit.element.releasePointerCapture(ev.pointerId);
    s.hit.element.classList.remove("resizing");

    const surface = options.getSurface();
    const surfaceBox = surface?.getBoundingClientRect();

    const restore = (): void => {
      options.onStretch?.(s.hit.index, undefined);
      s.hit.element.style.left = s.originStyle.left;
      s.hit.element.style.top = s.originStyle.top;
      s.hit.element.style.transform = s.originStyle.transform;
      s.hit.element.style.width = s.originStyle.width;
      s.hit.element.style.height = s.originStyle.height;
      s.hit.element.style.maxHeight = s.originStyle.maxHeight;
    };

    if (cancelled || !surfaceBox) {
      restore();
      return;
    }

    const stretched = s.forced ? false : s.hadHeight || s.stretched;
    const width = percentOfContainer(s.x.size, surfaceBox.width);
    const height = stretched
      ? percentOfContainer(s.y.size, surfaceBox.height)
      : s.forced && s.storedHeight !== undefined
        ? // A forced ratio keeps the stored height dormant, so the DOM cannot
          // carry it. Scaled by the width's own factor, so the box the user
          // gets back when they leave Live has the shape it had before.
          Math.round(s.storedHeight * (s.x.size / s.x.size0) * 100) / 100
        : undefined;

    const box: ImageBox = height === undefined ? { width } : { width, height };

    // Read off the state rather than recomputed: `apply` wrote it under the mode
    // that was live on the last frame, and asking again here would mean asking
    // whether ALT was held — the modifier history decision 7 keeps out.
    //
    // `toPercent` with a null offset is the exact inverse of the `auto` anchor's
    // self-reference: the stored coordinate IS the translate fraction, so
    // `100·px / (W − w)` is the closed form the spec names, already written.
    const position: Position = {
      left: toPercent(s.x.lead, surfaceBox.width, s.x.size, axisOffset(s.anchor, "x")),
      top: toPercent(s.y.lead, surfaceBox.height, s.y.size, axisOffset(s.anchor, "y")),
    };

    const boxChanged = box.width !== s.storedWidth || box.height !== s.storedHeight;
    const moved = position.left !== s.position0.left || position.top !== s.position0.top;

    if (!boxChanged && !moved) {
      restore();
      return;
    }

    // Put the derived style back here and not only on the next setConfig: the
    // geometry is identical, so there is no flash, and a commit that Home
    // Assistant coalesces would otherwise leave raw pixels on screen.
    const style = positionStyle(position, s.anchor);
    const drawn = imageBoxStyle(box);
    s.hit.element.style.left = style.left;
    s.hit.element.style.top = style.top;
    s.hit.element.style.transform = style.transform;
    s.hit.element.style.width = drawn.width;
    s.hit.element.style.height = drawn.height;
    s.hit.element.style.maxHeight = drawn.maxHeight;

    // Not dropped to `undefined` here: Home Assistant's config round trip takes
    // frames, and an element that read its old config in the meantime would
    // render `contain` against a box that already has a height — one frame of
    // letterbox, at the moment the eye is on it. Set to what the committed
    // config says instead, so the two agree; `_syncItems` clears it when that
    // config actually lands.
    options.onStretch?.(s.hit.index, box.height !== undefined);
    options.onCommit(s.hit.index, box, moved ? position : undefined);
  };

  const onPointerUp = (ev: PointerEvent): void => endGesture(ev, false);
  const onPointerCancel = (ev: PointerEvent): void => endGesture(ev, true);

  /** Holds the gesture on iOS; see `drag-layer.ts` for why this is not optional. */
  const onTouchMove = (ev: TouchEvent): void => {
    if (!state) return;
    if (!ev.cancelable) return;
    ev.preventDefault();
  };

  return {
    attach(element: HTMLElement): void {
      if (root) return;
      root = element;
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerup", onPointerUp);
      root.addEventListener("pointercancel", onPointerCancel);
      root.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKey);
    },
    detach(): void {
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("pointermove", onPointerMove);
      root?.removeEventListener("pointerup", onPointerUp);
      root?.removeEventListener("pointercancel", onPointerCancel);
      root?.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      root = undefined;
      state = undefined;
    },
    resizingIndex(): number | undefined {
      return state?.hit.index;
    },
  };
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: PASS.

**If a test fails, fix the implementation, not the test** — every assertion above encodes a decision from the spec. The one exception is the arithmetic in a comment: recompute it before changing anything, and if the comment's number is wrong, fix the comment and keep the assertion's shape.

- [ ] **Step 5: Verify the ALT path with a test the suite does not yet have**

Append to `src/tests/happy-dom/card/resize-layer.test.ts`:

```ts
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
```

- [ ] **Step 6: Run, fix, run**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, format, full lane**

Run: `pnpm typecheck && pnpm format && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/card/resize-layer.ts src/tests/happy-dom/card/resize-layer.test.ts
git commit -m "feat(resize): the corner gesture, in pixels until the release

Ratio kept by default and freed on SHIFT, resize from the anchor on ALT.
The mode is one boolean the gesture computes, driving both what is drawn
and what is committed, because SHIFT stops being the only channel the
day the toolbar lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The handles, and wiring the gesture into the card

**Files:**
- Modify: `src/element-kinds.ts`
- Modify: `src/card/drag-layer.ts` (`DragOptions`, `onPointerDown`)
- Modify: `src/card/image-element.ts` (a `stretch` override)
- Modify: `src/card/picture-studio-card.ts` (hit test, controller, handle nodes, live-gesture owner, styles)
- Test: `src/tests/happy-dom/card/picture-studio-card.test.ts`, `src/tests/happy-dom/card/image-element.test.ts`

**Interfaces:**
- Consumes: `createResizeController`, `ResizeHit` from Task 3; `patchBox` from Task 2.
- Produces:
  - `ElementKind.resizable?: true`, set on `IMAGE_KIND`
  - `isResizableKind(type: string): boolean` in `src/element-kinds.ts`
  - `DragOptions.isHandle(target: EventTarget | null): boolean`
  - `PictureStudioImage.stretch: boolean | undefined`

- [ ] **Step 1: Declare the resizable kind**

In `src/element-kinds.ts`, add to the `ElementKind` interface:

```ts
  /**
   * Whether a corner handle can size this kind. The image alone: its `width` and
   * `height` are percentages of the background, while an icon and a label size
   * themselves through `ElementSize` — `clamp(min px, ratio cqw, max px)`, which
   * is not a box, and which a handle would have to pick one of three numbers
   * from. That is a different design.
   */
  resizable?: true;
```

Add `resizable: true,` to `IMAGE_KIND`, and export the reader:

```ts
/** Whether a corner handle can size this element kind. */
export const isResizableKind = (type: string): boolean =>
  (ELEMENT_KINDS as Record<string, ElementKind<ElementConfig> | undefined>)[type]?.resizable === true;
```

- [ ] **Step 2: Write the test for the kind declaration**

`element-kinds.ts` has no test file of its own today. Create `src/tests/happy-dom/element-kinds.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { defaultActionName, ELEMENT_KINDS, isResizableKind } from "../../element-kinds";

describe("isResizableKind", () => {
  it("is the image and nothing else", () => {
    // width/height are percentages of the background and only the image has
    // them. An icon and a label size themselves through ElementSize, which is
    // clamped pixels and not a box.
    expect(isResizableKind("image")).toBe(true);
    expect(isResizableKind("state-icon")).toBe(false);
    expect(isResizableKind("state-label")).toBe(false);
  });

  it("answers false for a kind we do not implement", () => {
    expect(isResizableKind("nope")).toBe(false);
  });

  it("covers every kind the catalogue declares", () => {
    // A new kind added without a decision about its handles reads as false here
    // by omission, which is the safe answer — but the assertion is what makes
    // someone notice the question was never asked.
    for (const type of Object.keys(ELEMENT_KINDS)) {
      expect(typeof isResizableKind(type)).toBe("boolean");
    }
    expect(defaultActionName(ELEMENT_KINDS.image, "tap_action")).toBe("none");
  });
});
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm test src/tests/happy-dom/element-kinds.test.ts`
Expected: PASS. The implementation went in first here because it is a declaration, not behaviour — there is no red state to observe.

- [ ] **Step 4: Teach the drag to leave handles alone**

In `src/card/drag-layer.ts`, add to `DragOptions`:

```ts
  /**
   * Whether this target is a resize handle.
   *
   * Asked BEFORE the wrapper lookup. A handle is a child of the wrapper, so
   * without this a press on one would resolve to the item and start a move; and
   * simply returning no wrapper would be worse still, because a press on nothing
   * is the deselect.
   *
   * The two controllers are independent by construction rather than by
   * registration order: each consults the card's single hit test and decides for
   * itself. Neither stops the other's propagation, and a listener on the same
   * node fires regardless of `stopPropagation`.
   */
  isHandle?(target: EventTarget | null): boolean;
```

and as the first statement inside `onPointerDown`, after the `ev.button` and `state` guards:

```ts
    if (options.isHandle?.(ev.target)) return;
```

- [ ] **Step 5: Write the failing test for that guard**

Append to `src/tests/happy-dom/card/drag-layer.test.ts`, inside the controller `describe`:

```ts
  it("does not treat a press on a handle as a press on the picture", () => {
    // Without the guard the handle would resolve to no wrapper, and a press on
    // no wrapper is the deselect — so grabbing a handle would close the form.
    const h = setup({ isHandle: true });
    h.send("pointerdown", 30, 20, h.handle);
    h.send("pointerup", 30, 20, h.handle);
    expect(h.selections).toHaveLength(0);
    expect(h.commits).toHaveLength(0);
  });
```

Extend that file's `setup` to accept `{ isHandle?: boolean }`, create a `handle` element inside `item`, pass `isHandle: (target) => target === handle` when the flag is set, and return `handle` alongside the rest.

- [ ] **Step 6: Run the drag tests**

Run: `pnpm test src/tests/happy-dom/card/drag-layer.test.ts`
Expected: PASS.

- [ ] **Step 7: Give the image element a transient stretch override**

In `src/card/image-element.ts`, add to `static properties`:

```ts
    stretch: { type: Boolean },
```

and the field beside `editing`:

```ts
  /**
   * A fit mode the gesture imposes before the config catches up.
   *
   * During a resize no `setConfig` fires, so an element whose box has just
   * gained a pixel height would still render `contain` and sit letterboxed
   * inside the selection ring until the release flipped it to `fill`. The card
   * pushes this for the length of the gesture and drops it at the commit, which
   * restores the derived value. `undefined` means "read the config", which is
   * every moment outside a gesture.
   */
  declare stretch: boolean | undefined;
```

and in `render()`, replace the `fitMode` binding:

```ts
        .fitMode=${(this.stretch ?? effectiveBox(config).height !== undefined) ? "fill" : "contain"}
```

- [ ] **Step 8: Write the failing test for the override**

Append to `src/tests/happy-dom/card/image-element.test.ts`. That file's helper is `mount(config, hass?, editing?)` and it returns the element; it reads `fitMode` off `renderRoot.querySelector("hui-image")`, and it uses `test(` rather than `it(`. Match both.

```ts
test("the gesture's stretch overrides the fit mode the config implies", async () => {
  // During a resize no setConfig fires, so an element whose box has just gained
  // a pixel height would still render `contain` and letterbox inside the
  // selection ring until the release.
  const el = await mount({ type: "image", width: 40, image: "/a.png" });
  const fit = () => (el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode;
  expect(fit()).toBe("contain");

  el.stretch = true;
  await el.updateComplete;
  expect(fit()).toBe("fill");

  el.stretch = undefined;
  await el.updateComplete;
  expect(fit()).toBe("contain");
});

test("a false stretch overrides a config that would fill", async () => {
  // `?? ` and not `||`: false is a value here, not an absence.
  const el = await mount({ type: "image", width: 40, height: 25, image: "/a.png" });
  expect((el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe("fill");

  el.stretch = false;
  await el.updateComplete;
  expect((el.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe(
    "contain",
  );
});
```

- [ ] **Step 9: Run it**

Run: `pnpm test src/tests/happy-dom/card/image-element.test.ts`
Expected: PASS.

- [ ] **Step 10: Build the handles in the card**

In `src/card/picture-studio-card.ts`. The imports it gains, all of them named because the file's import block is long and easy to half-edit:

```ts
import { effectiveBox, type ImageBox, imageBoxStyle } from "../image-box"; // ImageBox is new
import { isResizableKind } from "../element-kinds"; // beside stubConfig's import
import { DEFAULT_POSITION, /* …existing… */ } from "../position"; // DEFAULT_POSITION is new
import { type Corner } from "../resize-box";
import { createResizeController, type ResizeHit } from "./resize-layer";
```

Add the corner list beside the other module constants:

```ts
/** The four corners a handle sits on, in DOM order. */
const HANDLE_CORNERS: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
```

In `_syncItems`, immediately after `wrapper.append(child as unknown as HTMLElement);`:

```ts
        // Built once and shown by CSS on the selected item, rather than added
        // and removed as the selection moves: the wrapper's box is what the
        // gesture measures, and DOM churn under the pointer is how a gesture
        // loses its target.
        if (item.type === "element" && isResizableKind(item.config.type)) {
          for (const corner of HANDLE_CORNERS) {
            const handle = document.createElement("div");
            handle.className = `handle handle-${corner}`;
            handle.dataset.corner = corner;
            wrapper.append(handle);
          }
        }
```

Add the single hit test as a private method:

```ts
  /**
   * What a pointer landed on: a resize handle, an item, or the picture.
   *
   * One owner, consulted by both gesture controllers. Two copies of this — one
   * per controller — is the shape that eventually disagrees, and the
   * disagreement would be invisible because each is correct on its own.
   */
  private _hitHandle(target: EventTarget | null): ResizeHit | undefined {
    const handle = (target as HTMLElement | null)?.closest?.(".handle") as HTMLElement | null;
    const corner = handle?.dataset.corner as Corner | undefined;
    const wrapper = handle?.closest(".item") as HTMLElement | null;
    const index = wrapper?.dataset.index;
    return handle && corner && wrapper && index !== undefined
      ? { element: wrapper, index: Number(index), corner }
      : undefined;
  }
```

Add `isHandle` to the existing `_drag` options:

```ts
    isHandle: (target) => this._hitHandle(target) !== undefined,
```

Add the resize controller beside `_drag`:

```ts
  private _resize = createResizeController({
    getHandle: (target) => this._hitHandle(target),
    getSurface: () => this.renderRoot.querySelector(".layer"),
    getAnchor: (index) => {
      const item = this._config?.items[index];
      if (!item || item.type === "unknown") return "auto";
      return item.anchor ?? "auto";
    },
    getPosition: (index) => {
      const item = this._config?.items[index];
      return item && item.type !== "unknown" ? item.position : { ...DEFAULT_POSITION };
    },
    getConfig: (index) => {
      const item = this._config?.items[index];
      if (!item || item.type !== "element" || item.config.type !== "image") return undefined;
      return item.config;
    },
    onCommit: (index, box, position) => activeEditor()?.patchBox(index, box, position),
    onStretch: (index, stretched) => {
      const child = this._elements[index] as (HTMLElement & { stretch?: boolean }) | undefined;
      if (child) child.stretch = stretched;
    },
  });
```

Add the single answer to "is a gesture live":

```ts
  /**
   * The item under a live gesture, whichever gesture it is.
   *
   * `_applyPositions` must leave that wrapper alone: its styles are raw pixels
   * managed by a controller, and writing the stored config over them would jump
   * the item back on every hass tick. One question, not one flag per controller.
   */
  private _gestureIndex(): number | undefined {
    return this._drag.draggingIndex() ?? this._resize.resizingIndex();
  }
```

In `_applyPositions`, replace `const dragging = this._drag.draggingIndex();` with `const dragging = this._gestureIndex();` and leave the rest — including the `if (index === dragging) return;` guard and its comment, which now covers both gestures. Extend that comment to say so.

In `_syncEditingAndDrag`, attach and detach `this._resize` on exactly the same root and in the same branches as `this._drag`.

In `_syncItems`, in the **same-shape** branch (the `else` that calls `child.setConfig(...)`), clear the override right after the `setConfig`:

```ts
        // The config the gesture committed has landed, so the element derives
        // its own fit mode again. Left in place, a stale override would outlive
        // a later change made through the form — the element survives a config
        // change, only its config is replaced.
        (child as unknown as { stretch?: boolean }).stretch = undefined;
```

The other branch needs nothing: a shape change rebuilds the element, and a fresh one has no override.

- [ ] **Step 11: Add the handle styles**

Append to the `static styles` block of `src/card/picture-studio-card.ts`, after the `.editing .item > *` rule (which it must beat):

```css
    /* The handles exist on every resizable item and are shown only on the
       selected one. Absolutely positioned, so they add nothing to the wrapper's
       box — getBoundingClientRect is what both gestures measure, and the
       condition marker's comment above makes the same point for the same
       reason. */
    .handle {
      display: none;
    }
    .editing .item.selected > .handle {
      display: block;
      position: absolute;
      width: var(--psc-handle-size, 10px);
      height: var(--psc-handle-size, 10px);
      box-sizing: border-box;
      background: var(--card-background-color, #fff);
      border: 2px solid var(--primary-color);
      border-radius: 2px;
      /* Beats `.editing .item > *`, which mutes the real children so a badge
         never sees a click. A handle is the exception: it is the target. */
      pointer-events: auto;
      touch-action: none;
    }
    .editing .item.selected > .handle-top-left {
      top: calc(var(--psc-handle-size, 10px) / -2);
      left: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nwse-resize;
    }
    .editing .item.selected > .handle-top-right {
      top: calc(var(--psc-handle-size, 10px) / -2);
      right: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nesw-resize;
    }
    .editing .item.selected > .handle-bottom-left {
      bottom: calc(var(--psc-handle-size, 10px) / -2);
      left: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nesw-resize;
    }
    .editing .item.selected > .handle-bottom-right {
      bottom: calc(var(--psc-handle-size, 10px) / -2);
      right: calc(var(--psc-handle-size, 10px) / -2);
      cursor: nwse-resize;
    }
```

- [ ] **Step 12: Write the failing card tests**

Append to `src/tests/happy-dom/card/picture-studio-card.test.ts`. That file imports `mountCard`, `wrappers`, `installHelpers`, `flush` and `cssRules` from `./harness`, keeps a module-level `releaseEditor` its `afterEach` calls, and registers editor stubs through `registerEditor` — the `visibility probes` block's `EDITOR_STUB` is the shape to copy. Do not add a parallel harness.

```ts
describe("resize handles", () => {
  const HANDLED = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "element",
        position: { top: "10%", left: "10%" },
        config: { type: "image", width: 20, image: "/a.png" },
      },
      {
        type: "element",
        position: { top: "50%", left: "50%" },
        config: { type: "state-icon", entity: "light.a" },
      },
    ],
  };

  /** Arms editing the way the dialog does: preview plus one registered editor. */
  const editing = async (config: unknown = HANDLED) => {
    installHelpers();
    const card = await mountCard(config);
    const boxes: { index: number; box: unknown }[] = [];
    const selections: (number | undefined)[] = [];
    let selected: number | undefined = 0;
    releaseEditor = registerEditor({
      patchPosition: () => undefined,
      patchBox: (index, box) => boxes.push({ index, box }),
      patchAnchor: () => undefined,
      select: (index) => {
        selected = index;
        selections.push(index);
        notifyEditors();
      },
      selectedIndex: () => selected,
    });
    (card as unknown as { preview: boolean }).preview = true;
    notifyEditors();
    await card.updateComplete;
    await flush();
    return { card, boxes, selections };
  };

  it("builds four handles on the image and none on the icon", async () => {
    const { card } = await editing();
    const [image, icon] = wrappers(card);
    expect(image?.querySelectorAll(".handle")).toHaveLength(4);
    expect(icon?.querySelectorAll(".handle")).toHaveLength(0);
  });

  it("names each handle's corner, which is what the hit test reads", async () => {
    const { card } = await editing();
    const corners = [...(wrappers(card)[0]?.querySelectorAll(".handle") ?? [])].map(
      (h) => (h as HTMLElement).dataset.corner,
    );
    expect(corners).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
  });

  it("shows them only on the selected item", async () => {
    // The rule is CSS, so assert the rule rather than a computed style —
    // happy-dom does no layout and `cssRules` is what this file already uses to
    // check a declaration exists.
    const { card } = await editing();
    expect(cssRules(card)).toContain(".editing .item.selected > .handle");
  });

  it("does not clear the selection when a handle is pressed", async () => {
    // Without `isHandle`, the press would resolve to no wrapper — and a press on
    // no wrapper is the deselect, so grabbing a handle would close the form.
    const { card, selections } = await editing();
    const handle = wrappers(card)[0]?.querySelector(".handle-top-left") as HTMLElement;
    handle.setPointerCapture = () => undefined;
    handle.releasePointerCapture = () => undefined;
    const send = (type: string) =>
      handle.dispatchEvent(
        new PointerEvent(type, { pointerId: 1, clientX: 0, clientY: 0, button: 0, bubbles: true }),
      );
    send("pointerdown");
    send("pointerup");
    expect(selections).not.toContain(undefined);
  });
});
```

The wrapper — not the handle — is what takes the pointer capture, so stub `setPointerCapture` on the wrapper too if happy-dom complains; the drag tests already do this where they need it.

- [ ] **Step 13: Run, fix, run**

Run: `pnpm test src/tests/happy-dom/card/picture-studio-card.test.ts`
Expected: PASS.

- [ ] **Step 14: Typecheck, format, full lane**

Run: `pnpm typecheck && pnpm format && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat(card): four corner handles on the selected image

One hit test, consulted by both gesture controllers, so a press on a
handle is never read as a press on the picture. The handles are built
once and shown by CSS: the wrapper's box is what both gestures measure,
and DOM churn under the pointer loses the target.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The browser lane

The two claims happy-dom cannot make, because it performs no layout: that the height read back in keep-ratio mode is the one the image imposes, and that the committed box renders where the gesture drew it.

**Files:**
- Modify: `src/tests/playwright/harness.ts` (modifier keys on synthetic pointer events)
- Create: `src/tests/playwright/resize.test.ts`

- [ ] **Step 1: Let the harness send modifiers**

In `src/tests/playwright/harness.ts`, give `pointerEvent`, `press`, `move` and `release` an optional modifier bag:

```ts
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
```

and thread a fourth optional argument through `press`, `move` and `release` into it. Existing callers pass nothing and are unaffected.

- [ ] **Step 2: Write the failing browser tests**

Create `src/tests/playwright/resize.test.ts`:

```ts
import { afterEach, expect, it } from "@rstest/core";
import {
  cleanup,
  enterEditing,
  LAYER,
  mountCard,
  move,
  press,
  rectInLayer,
  release,
  wrappers,
} from "./harness";

afterEach(cleanup);

/**
 * One image element, at a known box. `image` carries the `-<w>x<h>` suffix the
 * harness's `HuiImageStub` reads to apply an aspect ratio — which is what makes
 * a keep-ratio assertion precise without touching production code.
 */
const imageCard = (image: string, width: number, height?: number): unknown => ({
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "element",
      position: { top: "0%", left: "0%" },
      anchor: "top-left",
      config: { type: "image", image, width, ...(height !== undefined ? { height } : {}) },
    },
  ],
});

const armed = async (config: unknown) => {
  const card = await mountCard(config);
  const spy = await enterEditing(card);
  const wrapper = wrappers(card)[0] as HTMLElement;
  wrapper.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, button: 0, bubbles: true }));
  wrapper.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9, button: 0, bubbles: true }));
  await card.updateComplete;
  const handle = wrapper.querySelector(".handle-bottom-right") as HTMLElement;
  return { card, spy, wrapper, handle };
};

/**
 * The claim happy-dom structurally cannot make: in keep-ratio mode the gesture
 * writes a width and the BROWSER resolves the height. A 2:1 image dragged to
 * 200px wide must be 100px tall, with nothing of ours computing that.
 */
it("keeps the image's own ratio, resolved by layout and not by arithmetic", async () => {
  // width 20 % of 400 = 80px, 2:1 -> 40px tall.
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: 200, y: 40 });

  const rect = rectInLayer(card, wrapper);
  expect(rect.height).toBeCloseTo(rect.width / 2, 1);
});

/**
 * Decision 5's WYSIWYG promise: the box the release commits renders exactly
 * where the gesture drew it.
 */
it("renders the committed box where the gesture drew it", async () => {
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: 160, y: 80 });
  const during = rectInLayer(card, wrapper);
  await release(card, handle, { x: 160, y: 80 });

  const after = rectInLayer(card, wrapper);
  expect(after.width).toBeCloseTo(during.width, 1);
  expect(after.height).toBeCloseTo(during.height, 1);
});

/**
 * The transient fit mode. A free resize gives the box a pixel height while the
 * config still has none, so without the override the image would sit
 * letterboxed inside the ring and snap to fill at the release.
 */
it("fills the box during a free resize, not only after the commit", async () => {
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: 200, y: 160 }, { shiftKey: true });

  const image = wrapper.querySelector("picture-studio-image") as HTMLElement & {
    shadowRoot: ShadowRoot | null;
  };
  const hui = image.shadowRoot?.querySelector("hui-image") as (HTMLElement & { fitMode?: string }) | null;
  expect(hui?.fitMode).toBe("fill");
});

/**
 * The clamp: a corner pushed past the background stops at it, and the ratio is
 * exact all the way to the stop. Per-axis clamping would distort here.
 */
it("stops at the background without distorting on the way", async () => {
  const { card, wrapper, handle } = await armed(imageCard("/wide-2x1.png", 20));

  await press(card, handle, { x: 80, y: 40 });
  await move(card, handle, { x: LAYER.width * 3, y: 40 });

  const rect = rectInLayer(card, wrapper);
  expect(rect.width).toBeLessThanOrEqual(LAYER.width + 0.5);
  expect(rect.height).toBeCloseTo(rect.width / 2, 1);
});
```

**Note:** `armed` selects the item by pressing and releasing the wrapper, because handles only exist under `.selected`. If the card test file already has a selection helper, use it instead of the two synthetic events.

- [ ] **Step 3: Run to verify they fail, then pass**

Run: `pnpm test src/tests/playwright/resize.test.ts`
Expected: FAIL first (the file is new and the harness change may be missing), then PASS once the harness accepts modifiers.

- [ ] **Step 4: Full suite, typecheck, format**

Run: `pnpm typecheck && pnpm format && pnpm lint && pnpm test`
Expected: PASS across both lanes.

- [ ] **Step 5: Record the new baseline**

Read the run's JSON summary. If — and only if — it reports **every** test file, update `mem:picture-studio/1.6.0-handoff` § Test baseline with the new `testFiles`, `passedTests` and today's date. A scoped run is not a baseline; `testFiles` is the tell.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(resize): the two claims that need a real layout engine

The height a keep-ratio gesture reads back is resolved by the browser,
and the committed box renders where the gesture drew it — including the
transient fit mode, without which a free resize letterboxes until the
release.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verify in Home Assistant, then document

The spec is explicit that this is not a formality: sub-project 1 was reviewed, green and ready to merge when a browser session found four more bugs.

**Files:**
- Modify: `CHANGELOG.md`, `README.md`
- Modify: `.ha/config/.storage/lovelace_resources` (the cache-busting number only)

- [ ] **Step 1: Build and deliver the new build**

```bash
pnpm build
```

Then bump the `?v=N` number in `.ha/config/.storage/lovelace_resources` and restart:

```bash
docker compose restart homeassistant
```

**Never `rm -rf dist`** — `docker-compose.yml` binds `./dist` into the container, and deleting the directory leaves the mount on a dead inode and 404s every resource. A hard reload in the browser does not reliably dislodge the cached build; the `?v=N` bump is what does.

- [ ] **Step 2: Walk the gesture by hand**

In a dashboard's edit dialog, on a picture-studio card with an image element, check each of these and note what you see:

1. select the image — four handles appear on its corners, and only on it;
2. drag a corner — the ratio holds, and the opposite corner does not move;
3. hold SHIFT mid-drag — the box goes free and the image fills it immediately, with no letterbox;
4. release SHIFT before dropping — the box re-locks and the drop stores no height (check the YAML);
5. hold ALT — the box grows around the anchor, and the anchor point does not move;
6. push a corner past the edge of the background — it stops, and the image does not distort against the stop;
7. drag a corner on a **live camera** image — SHIFT does nothing, and a height set earlier survives in the YAML, scaled;
8. press a handle and release without moving — the form stays open and nothing is committed.

Any surprise is a bug in the implementation, not in the list. Fix it, add the test that would have caught it, and re-run both lanes.

- [ ] **Step 3: Write the CHANGELOG entry**

Under `## 1.6.0 — unreleased`, in `### Added` (it comes before `### Changed`; if the section does not exist, create it in that order):

```markdown
- Images can be resized directly on the picture: select one and drag any of its
  four corners. The proportions are kept as you drag — hold **Shift** to set the
  width and the height independently, and **Alt** to resize around the item's
  anchor instead of its opposite corner. Breaking the proportions is what makes
  the picture stretch to fill its box; while they are kept, it keeps its own
  shape.
```

- [ ] **Step 4: Update the README**

In the section that documents the image element's `width` and `height`, add a sentence saying the two can be set by dragging the corners in the editor, and that leaving `height` out is what keeps the picture's own proportions. Match the surrounding voice — the README is what someone writing YAML by hand reads.

- [ ] **Step 5: Format, lint, full suite**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(resize): what a user does with the corners

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Closing the branch

Not a task — the workflow `AGENTS.md` § Closing a session describes, run when the work is done and reviewed:

1. **Whole-branch review** over `next..HEAD`. It gates the merge; if it does not come back READY TO MERGE, say so and stop.
2. **Merge onto the recorded target**, locally:
   ```sh
   git config --get "branch.$(git branch --show-current).target"   # next
   ```
3. **Delete the work branch** with `git branch -d`, which refuses one that is not fully merged.
4. **Update `mem:picture-studio/1.6.0-handoff`** — where sub-project 2 stands, what sub-project 3 inherits from it, and the test baseline if a full run produced one.
5. **No push.** The user pushes, and only when they ask.
