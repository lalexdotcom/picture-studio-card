# Side Resize Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the selected image element four more resize handles, at the midpoints of its edges, each resizing one axis freely.

**Architecture:** The existing corner gesture is already written one axis at a time — `fixedPoint`, `edgeSlopes`, `sizeRange`, `requestedSize` and `edgeAt` all take a single axis' parameters. A side handle is therefore not a new gesture but the same gesture with **one axis switched off**: the per-axis descriptor `boolean` (which edge is grabbed) widens to `boolean | undefined`, where `undefined` means the axis asks for nothing, ratchets nothing, clamps nothing, and keeps its `pointerdown` size and leading edge for the whole gesture. Two consequences carry the rest of the feature: a side gesture is always `free` (so it commits a `height`), and an inert axis recommits its stored number verbatim instead of round-tripping through pixels.

**Tech Stack:** TypeScript, Lit (the card is a `LitElement`), rstest as the test runner, two lanes — `happy-dom` for arithmetic and DOM wiring, `playwright` for anything needing real layout. Biome for lint/format. `pnpm lint`, `pnpm typecheck` and `pnpm test` are three separate commands and CI runs all three.

**Spec:** `docs/superpowers/specs/2026-08-28-side-resize-handles-design.md` — read it before Task 1. It carries the reasoning; this plan carries the steps. The spec it amends is `docs/superpowers/specs/2026-08-26-image-resize-handles-design.md`.

## Global Constraints

- **Branch:** `feat/side-handles`, already cut from `next`, `branch.feat/side-handles.target = next`. Do not merge, do not push.
- **Version:** `1.6.0-beta.1` in `package.json`. **Never bump it.** The changelog heading stays `## 1.6.0 — unreleased`.
- **Changelog:** every user-visible change goes under `### Added` in the existing `## 1.6.0 — unreleased` section. Written for someone configuring the card, never about how the code got there.
- **Serena is primary for code.** Use `find_symbol` / `replace_symbol_body` / `replace_content` / `rename_symbol` on `.ts` files. Built-in Read/Edit are for `.md`, JSON and YAML only.
- **Every new test is run against the current code and seen to fail before the implementation is written.** This is the rule `9ef9a44` and `5c99960` each left behind on this line: a test that cannot vary stays green for weeks. A step in every task makes this explicit; do not skip it because the test "obviously" fails.
- **`pnpm test <file>` is a scoped run and never a baseline.** Only the delivery's full `pnpm test` updates the recorded figure in `mem:picture-studio/1.6.0-handoff` (last: 2026-08-28, 56 files, 1071 tests).
- **Commit after every task**, with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Commit message paragraphs are one line each — no hard wrapping.
- **The handle size** is the CSS variable `--psc-handle-size`, default `10px`. `RESIZE_FLOOR_PX` is `24` and **does not change** — see spec decision 7.

---

## File Structure

| File | Responsibility | Task |
| ---- | -------------- | ---- |
| `src/resize-box.ts` | The arithmetic, no DOM. Gains `Grip` (8 values), `gripAxes`, `isSideGrip`; loses `Corner` and `cornerGrabs`. | 1 |
| `src/card/resize-layer.ts` | The gesture controller. Gains the inert axis, the always-free side, the frozen height, the verbatim commit, the corrected change test. | 2, 3, 4 |
| `src/card/tools/resize-tool.ts` | Owns the handle nodes and the hit test. Gains four side grips and the `ratioIsForced` filter. | 1, 5 |
| `src/card/picture-studio-card.ts` | The card's stylesheet, where `.handle-*` lives. Gains four positioning rules. | 5 |
| `src/tests/happy-dom/resize-box.test.ts` | The arithmetic's suite. | 1 |
| `src/tests/happy-dom/card/resize-layer.test.ts` | The gesture's suite. Its `setup` gains a `grip` option. | 2, 3, 4 |
| `src/tests/happy-dom/card/tools.test.ts` | The tool's suite: what is mounted, and when. | 5 |
| `src/tests/playwright/resize.test.ts` | The real-layout lane. | 6 |
| `CHANGELOG.md`, `README.md` | What a user does. | 6 |

---

## Task 1: The vocabulary — `Corner` becomes `Grip`

A pure rename plus one new function. Nothing behaves differently at the end of this task: the tool still mounts four corner handles, so `gripAxes` never returns `undefined` at runtime yet. The point is to land the type change on its own, so the next task's diff is the mechanism and not the renaming.

**Files:**
- Modify: `src/resize-box.ts` (the `Corner` type and `cornerGrabs`, around lines 21 and 36)
- Modify: `src/card/resize-layer.ts` (the `Corner` import, `ResizeHit.corner`, the `cornerGrabs` call)
- Modify: `src/card/tools/resize-tool.ts` (`HANDLE_CORNERS`, the `dataset.corner` read, the `corner` property)
- Test: `src/tests/happy-dom/resize-box.test.ts`

**Interfaces:**
- Produces: `type Grip = "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right"`; `gripAxes(grip: Grip): { x: boolean | undefined; y: boolean | undefined }`; `isSideGrip(grip: Grip): boolean`; `ResizeHit { element: HTMLElement; index: number; grip: Grip }`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

In `src/tests/happy-dom/resize-box.test.ts`, replace the whole `describe("cornerGrabs", …)` block with:

```ts
describe("gripAxes", () => {
  it("reads each corner as a pair of per-axis edges", () => {
    expect(gripAxes("bottom-right")).toEqual({ x: true, y: true });
    expect(gripAxes("top-left")).toEqual({ x: false, y: false });
    expect(gripAxes("top-right")).toEqual({ x: true, y: false });
    expect(gripAxes("bottom-left")).toEqual({ x: false, y: true });
  });

  it("reports the axis a side grip does not straddle as inert", () => {
    // `undefined` is not `false`: an axis that is not asked which of its edges
    // was grabbed is an axis the gesture must leave exactly where it found it.
    expect(gripAxes("top")).toEqual({ x: undefined, y: false });
    expect(gripAxes("bottom")).toEqual({ x: undefined, y: true });
    expect(gripAxes("left")).toEqual({ x: false, y: undefined });
    expect(gripAxes("right")).toEqual({ x: true, y: undefined });
  });
});

describe("isSideGrip", () => {
  it("is true for the four midpoints and false for the four corners", () => {
    expect(["top", "right", "bottom", "left"].map((g) => isSideGrip(g as Grip))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(
      ["top-left", "top-right", "bottom-left", "bottom-right"].map((g) => isSideGrip(g as Grip)),
    ).toEqual([false, false, false, false]);
  });
});
```

Update the file's import block: drop `cornerGrabs`, add `type Grip`, `gripAxes`, `isSideGrip`.

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm test src/tests/happy-dom/resize-box.test.ts`
Expected: FAIL — `gripAxes` and `isSideGrip` are not exported by `src/resize-box.ts`.

- [ ] **Step 3: Widen the type and replace `cornerGrabs`**

In `src/resize-box.ts`, replace the `Corner` type and the `cornerGrabs` function with:

```ts
/** Which handle the pointer grabbed: a corner, or the midpoint of an edge. */
export type Grip =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/**
 * A grip read as a pair of per-axis edges.
 *
 * `true` / `false` says which edge of that axis the grip sits on — the whole
 * meaning the corner-only predecessor carried. **`undefined` is an inert
 * axis**: a side grip has nothing to say about the axis it does not straddle,
 * and the gesture leaves that axis exactly where `pointerdown` found it.
 *
 * A `Record<Grip, …>` rather than string arithmetic: adding a ninth grip then
 * fails to compile here, which is where the answer has to be decided.
 */
const GRIP_AXES: Record<Grip, { x: boolean | undefined; y: boolean | undefined }> = {
  "top-left": { x: false, y: false },
  top: { x: undefined, y: false },
  "top-right": { x: true, y: false },
  left: { x: false, y: undefined },
  right: { x: true, y: undefined },
  "bottom-left": { x: false, y: true },
  bottom: { x: undefined, y: true },
  "bottom-right": { x: true, y: true },
};

export const gripAxes = (grip: Grip): { x: boolean | undefined; y: boolean | undefined } =>
  GRIP_AXES[grip];

/** True for the four midpoints. Read off `gripAxes`, so there is one table. */
export const isSideGrip = (grip: Grip): boolean => {
  const axes = gripAxes(grip);
  return axes.x === undefined || axes.y === undefined;
};
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm test src/tests/happy-dom/resize-box.test.ts`
Expected: PASS.

- [ ] **Step 5: Follow the rename through the two consumers**

`src/card/resize-layer.ts`:
- the import from `"../resize-box"` takes `type Grip` and `gripAxes` in place of `type Corner` and `cornerGrabs`;
- `ResizeHit.corner: Corner` becomes `ResizeHit.grip: Grip`, and its doc comment, if any, says *which handle*, not *which corner*;
- `const grabs = cornerGrabs(hit.corner);` becomes `const grabs = gripAxes(hit.grip);`.

`src/card/tools/resize-tool.ts`:
- the import takes `type Grip`;
- `const HANDLE_CORNERS: Corner[] = [...]` becomes `const HANDLE_GRIPS: Grip[] = ["top-left", "top-right", "bottom-left", "bottom-right"];` — still four, the sides arrive in Task 5;
- in `hit`, `handle?.dataset.corner as Corner | undefined` becomes `handle?.dataset.grip as Grip | undefined`, the local is named `grip`, and the returned object is `{ element: wrapper, index: Number(index), grip }`;
- in `render`, the loop variable is `grip`, `handle.className = \`handle handle-${grip}\`` and `handle.dataset.grip = grip`.

Then search the whole tree for anything left behind:

```bash
grep -rn "cornerGrabs\|data-corner\|dataset\.corner\|\bCorner\b" src/ docs/superpowers/plans/
```

The only surviving hits must be in the two spec documents, which are historical records and are not edited.

- [ ] **Step 6: Fix the existing gesture suite's fixture**

`src/tests/happy-dom/card/resize-layer.test.ts` builds its `ResizeHit` by hand:

```ts
getHandle: (target) =>
  target === handle ? { element: wrapper, index: 0, corner: "bottom-right" } : undefined,
```

Change `corner:` to `grip:`. Nothing else in that file moves in this task.

- [ ] **Step 7: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all three clean; the test count is the baseline plus the one new `it` in `resize-box.test.ts` and minus none (the `cornerGrabs` block became `gripAxes` with one extra case).

```bash
git add -A src/
git commit -F - <<'EOF'
refactor(resize): a handle is a grip, and an axis can be inert

Eight handles are coming, so the type that names one is no longer a corner. Corner becomes Grip over the eight values and cornerGrabs becomes gripAxes, whose per-axis answer widens from boolean to boolean | undefined.

undefined is the new state and it is not false: false says the grip sits on this axis' leading edge, undefined says the grip has nothing to do with this axis at all. Nothing produces it yet — the tool still mounts four corners — so this commit changes no behaviour and exists to keep the next diff about the mechanism rather than about the renaming.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: The inert axis, and a side is free by construction

This is the mechanism. At the end of it a side grip resizes one axis correctly — the handles to grab are still absent, but the controller's own suite supplies grips directly through `getHandle`, so the gesture is fully testable here.

**Files:**
- Modify: `src/card/resize-layer.ts` (`AxisState.trailing`, `axis()`, `onPointerDown`, `sizeBounds`, `ratchet`, `apply`)
- Test: `src/tests/happy-dom/card/resize-layer.test.ts`

**Interfaces:**
- Consumes: `Grip`, `gripAxes`, `isSideGrip` from Task 1.
- Produces: no new export. `AxisState.trailing: boolean | undefined` is module-private.

- [ ] **Step 1: Give the gesture suite's `setup` a grip**

In `src/tests/happy-dom/card/resize-layer.test.ts`, add `grip?: Grip` to `setup`'s options, import `type Grip` from `"../../../resize-box"`, and use it:

```ts
getHandle: (target) =>
  target === handle
    ? { element: wrapper, index: 0, grip: options?.grip ?? "bottom-right" }
    : undefined,
```

The default keeps all twenty-one existing tests unchanged.

- [ ] **Step 2: Write the failing tests**

Append to `describe("createResizeController", …)`:

```ts
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
```

- [ ] **Step 3: Run them and watch every one fail**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: five failures. They fail because `gripAxes("bottom").x` is `undefined`, which the controller currently passes to `fixedPoint` as though it were `false` — so the x axis is treated as "leading edge grabbed" and the width tracks the pointer. Read the failure output and confirm that is what you see; a failure for a different reason means the fixture is wrong, not the code.

- [ ] **Step 4: Widen `AxisState` and the `axis` factory**

In `src/card/resize-layer.ts`:

```ts
  /**
   * Which edge of this axis the grip sits on — or `undefined` when the grip
   * does not straddle this axis at all.
   *
   * An inert axis asks for nothing, ratchets nothing and bounds nothing: its
   * `size` and `lead` keep their `pointerdown` values for the whole gesture,
   * which is what makes a side handle the same gesture with one axis off
   * rather than a second gesture.
   */
  trailing: boolean | undefined;
```

and the factory's parameter becomes `trailing: boolean | undefined`. Nothing else in `axis()` changes — `size` and `lead` already start at `size` and `origin`.

- [ ] **Step 5: Make the two per-axis helpers abstain**

```ts
  const sizeBounds = (a: AxisState, fraction: number | null): AxisBounds => {
    if (a.trailing === undefined) return OPEN_BOUNDS;
    const fixed = fixedPoint(a.origin, a.size0, a.trailing, fraction);
    // …unchanged…
  };

  const ratchet = (a: AxisState, fraction: number | null): void => {
    if (a.trailing === undefined) return;
    const fixed = fixedPoint(a.origin, a.size0, a.trailing, fraction);
    // …unchanged…
  };
```

- [ ] **Step 6: Freeze the inert axis' pixels at `pointerdown`**

In `onPointerDown`, replace the height block:

```ts
    hit.element.style.width = `${state.x.size0}px`;
    // An inert axis is written out in pixels so that nothing can move it. On x
    // that is what already happened; on y it is the freeze a side handle needs
    // — without it the height would follow the width through the image's own
    // ratio and an east/west drag would be indistinguishable from a corner.
    if ((state.hadHeight || state.y.trailing === undefined) && !state.forced) {
      hit.element.style.height = `${state.y.size0}px`;
    } else {
      hit.element.style.height = "";
    }
```

- [ ] **Step 7: Skip the inert axis in `apply`**

Inside `apply`, immediately after `state.clientY = clientY;`:

```ts
    const activeX = state.x.trailing !== undefined;
    const activeY = state.y.trailing !== undefined;

    // A side grip is free with no clause of its own: there is one degree of
    // freedom already, so there is no ratio left to lock and SHIFT has nothing
    // to free. `lockedScale` is therefore unreachable from a side grip by
    // structure rather than by a guard.
    const free = isSideGrip(state.hit.grip) || (shift && !state.forced);
```

Replace the block from `ratchet(state.x, fx);` down to the end of the `if (free) … else …` with:

```ts
    ratchet(state.x, fx);
    ratchet(state.y, fy);

    const px = clientX - surfaceBox.left;
    const py = clientY - surfaceBox.top;
    const fixedX = activeX
      ? fixedPoint(state.x.origin, state.x.size0, state.x.trailing as boolean, fx)
      : undefined;
    const fixedY = activeY
      ? fixedPoint(state.y.origin, state.y.size0, state.y.trailing as boolean, fy)
      : undefined;

    const wanted = {
      x: fixedX === undefined ? undefined : requestedSize(px, fixedX, state.x.trailing as boolean, fx),
      y: fixedY === undefined ? undefined : requestedSize(py, fixedY, state.y.trailing as boolean, fy),
    };
    const boundsX = sizeBounds(state.x, fx);
    const boundsY = sizeBounds(state.y, fy);
    const clamp = (v: number, b: AxisBounds): number => Math.min(Math.max(v, b.lo), b.hi);

    if (free) {
      // Two degrees of freedom, two independent clamps — exactly the drag. An
      // inert axis simply is not one of them.
      if (activeX) state.x.size = clamp(wanted.x ?? state.x.size, boundsX);
      if (activeY) state.y.size = clamp(wanted.y ?? state.y.size, boundsY);
    } else {
      // …the existing lockedScale branch, unchanged. Both axes are active here:
      // `free` is true for every side grip, so this branch is corners only.
    }
```

Then guard the two lead assignments at the end of `apply`:

```ts
    if (fixedX !== undefined) {
      state.x.lead = edgeAt(fixedX, state.x.size, state.x.trailing as boolean, fx).leading;
      el.style.left = `${state.x.lead}px`;
    }
    if (fixedY !== undefined) {
      state.y.lead = edgeAt(fixedY, state.y.size, state.y.trailing as boolean, fy).leading;
      el.style.top = `${state.y.lead}px`;
    }
```

The `el.style.width` write stays unconditional: an inert x writes back the same pixel value it already had, which keeps one code path and cannot drift.

The `stretched` line needs no change — `state.forced ? false : state.hadHeight || free` is already true for every side grip, since `free` is.

**On the `as boolean` casts:** they are the price of narrowing through a separate `activeX` boolean, and TypeScript cannot follow it. If they bother the reviewer, the alternative is to narrow inline with `state.x.trailing !== undefined ? … : …` at each call; do not introduce a non-null assertion (`!`), which the project does not use.

- [ ] **Step 8: Run the suite and watch it pass**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: PASS, all twenty-six. If one of the twenty-one pre-existing tests broke, the inert path has leaked into the corner path — fix that rather than the test.

- [ ] **Step 9: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A src/
git commit -F - <<'EOF'
feat(resize): one axis of the gesture can now be inert

A side handle is not a second gesture. The affine machinery is already written one axis at a time, so switching an axis off is the whole mechanism: it asks for nothing, ratchets nothing, bounds nothing, and keeps the size and leading edge pointerdown gave it.

Two things follow and neither needs a clause of its own. A side grip is free by construction, so SHIFT has nothing to free and lockedScale is unreachable from one by structure. And an inert axis has its pixels written out at pointerdown — on x that already happened, on y it is the freeze that stops the height following the width, without which an east/west drag would be a corner wearing another shape.

The floor stays on the active axis alone: an inert axis below it survives the gesture rather than being pushed up to it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: An inert axis commits verbatim what it had

The gesture draws correctly now and commits a number that made a round trip through pixels. This task makes the guarantee structural: a N/S gesture cannot move the item horizontally, because no horizontal number is recomputed.

**Files:**
- Modify: `src/card/resize-layer.ts` (`endGesture`)
- Test: `src/tests/happy-dom/card/resize-layer.test.ts`

**Interfaces:**
- Consumes: `AxisState.trailing: boolean | undefined` from Task 2.
- Produces: no new export.

- [ ] **Step 1: Write the failing tests**

```ts
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
  // A stretched item (height present) dragged by its RIGHT edge. The corner
  // path would scale the stored height by the width's own factor; a side grip
  // must leave it exactly as it is, because the axis did not move.
  const h = setup({ grip: "right", config: { width: 20, height: 13.33 } });
  h.send("pointerdown", 120, 50);
  h.send("pointermove", 200, 50);
  h.send("pointerup", 200, 50);

  expect(h.commits[0]?.box).toEqual({ width: 40, height: 13.33 });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: two failures — `width` comes back `20` instead of `20.01`, and the stored height comes back doubled (`26.66`) because the keep-ratio branch multiplies it by `x.size / x.size0`.

- [ ] **Step 3: Extract the committed height, then add the inert branch**

The height expression in `endGesture` is already a two-level ternary and this task adds a third. Lift it out of `endGesture`, above `createResizeController`'s `return`, as a module-private function — the file is the one being modified, and a fourth nested ternary is not a diff a reviewer can check:

```ts
/**
 * The height to commit, or `undefined` to leave the key out.
 *
 * Four cases, and the order matters: the inert one comes before the keep-ratio
 * one, because an east/west grip on a stretched item must NOT scale the stored
 * height — its axis did not move.
 */
const committedHeight = (
  s: ResizeState,
  surfaceHeight: number,
  stretched: boolean,
  scale: number,
): number | undefined => {
  // A forced ratio never renders a height, so the DOM cannot carry one. Scaled
  // by the width's own factor so the dormant box keeps its shape.
  if (!stretched) {
    return s.forced && s.storedHeight !== undefined
      ? Math.round(s.storedHeight * scale * 100) / 100
      : undefined;
  }
  // The vertical axis never moved: recommit what it had, or — when it had
  // nothing stored — the pixel height the gesture froze at pointerdown.
  if (s.y.trailing === undefined) {
    return s.storedHeight ?? percentOfContainer(s.y.size0, surfaceHeight);
  }
  // Keep-ratio with a pre-existing height: both stored percentages multiply by
  // the same factor. The pixel computation agrees in a real browser and
  // diverges when the stored height and the rendered one are out of sync,
  // which the suite deliberately provokes, so this formula is the canonical one.
  if (s.hadHeight && !s.lastFree && s.storedHeight !== undefined) {
    return Math.round(s.storedHeight * scale * 100) / 100;
  }
  return percentOfContainer(s.y.size, surfaceHeight);
};
```

`endGesture` then reads:

```ts
    const stretched = s.forced ? false : s.hadHeight || s.stretched;
    const scale = s.x.size / s.x.size0;
    const width =
      s.x.trailing === undefined ? s.storedWidth : percentOfContainer(s.x.size, surfaceBox.width);
    const height = committedHeight(s, surfaceBox.height, stretched, scale);
```

Move the long comments that sat inside the old ternary into `committedHeight`; do not leave two copies.

- [ ] **Step 4: Commit the position verbatim on an inert axis too**

```ts
    // An inert axis' coordinate is recommitted as the same number, not
    // recomputed: `toPercent` would answer within a hundredth of it and make
    // `moved` say yes to a gesture that moved nothing on that axis.
    const position: Position = {
      left:
        s.x.trailing === undefined
          ? s.position0.left
          : toPercent(s.x.lead, surfaceBox.width, s.x.size, axisOffset(s.anchor, "x")),
      top:
        s.y.trailing === undefined
          ? s.position0.top
          : toPercent(s.y.lead, surfaceBox.height, s.y.size, axisOffset(s.anchor, "y")),
    };
```

- [ ] **Step 5: Run the suite and watch it pass**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: PASS, all twenty-eight.

- [ ] **Step 6: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A src/
git commit -F - <<'EOF'
feat(resize): an inert axis recommits its stored number verbatim

percentOfContainer rounds through hundredths, so a number that makes a round trip through pixels can land a hundredth away from the one stored — and that is enough to make the change tests say yes to a gesture that moved nothing on that axis. Recommitting the stored number makes the guarantee structural instead: a north/south gesture cannot move the item horizontally, because no horizontal number is recomputed.

One case has nothing verbatim to recommit — an east/west grip on an item with no stored height — and it commits the pixel height frozen at pointerdown, which is the freeze itself rather than an exception to the rule.

The height's four cases came out of endGesture on the way: the inert branch would have made a fourth nested ternary, which is not a diff anyone can check.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: A gesture released where it began commits nothing

Spec decision 10. Without it, pressing and releasing an E/W handle without moving takes an image out of keep-ratio.

**Files:**
- Modify: `src/card/resize-layer.ts` (`endGesture`, the `boxChanged` line)
- Test: `src/tests/happy-dom/card/resize-layer.test.ts`

**Interfaces:**
- Consumes: `committedHeight` from Task 3.
- Produces: no new export.

- [ ] **Step 1: Write the failing tests**

```ts
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
  h.send("pointermove", 80, 70.04);
  h.send("pointerup", 80, 70.04);

  expect(h.commits).toHaveLength(1);
});
```

- [ ] **Step 2: Run them and watch the first two fail**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: the first two FAIL with one commit each, carrying a `height` the user did not ask for. The third should already pass; keep it — it is the guard against turning this fix into a pixel threshold, which spec decision 7 of the resize spec explicitly refused.

- [ ] **Step 3: Compare against the box at `pointerdown`, not against the config**

Replace the `boxChanged` line in `endGesture`:

```ts
    // The box as it stood at pointerdown, in the units it will be stored in:
    // the stored number where there is one, the measured pixel size where there
    // is not. Comparing to the CONFIG instead — which is what this line used to
    // do — makes a frozen height face an absent `storedHeight`, and a number is
    // not `undefined`, so a side gesture released on the spot would commit and
    // take the image out of keep-ratio.
    //
    // A candidate with no height is never a change: the only path that drops a
    // height an item had is the forced ratio, which commits on its own branch.
    const height0 = s.storedHeight ?? percentOfContainer(s.y.size0, surfaceBox.height);
    const boxChanged =
      box.width !== s.storedWidth || (box.height !== undefined && box.height !== height0);
```

- [ ] **Step 4: Run the suite and watch it pass**

Run: `pnpm test src/tests/happy-dom/card/resize-layer.test.ts`
Expected: PASS, all thirty-one.

- [ ] **Step 5: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A src/
git commit -F - <<'EOF'
fix(resize): a gesture released where it began commits nothing

The no-change test compared the candidate box to the stored config, which worked only while an absent height could mean nothing but an unchanged one. A side handle breaks that: pressing an east/west handle freezes a pixel height, releasing it on the spot faces an absent storedHeight, and a number is not undefined — so an image nobody resized left keep-ratio.

It now compares to the box as it stood at pointerdown: the stored number where there is one, the measured pixel size where there is not. Both express the same box in the units it will be stored in, which is what the rule always meant.

It fixes the corner too, where the same hole was reachable: grab, hold SHIFT, wander, come back, release used to freeze a height on an item that ended exactly where it started.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: Mount the four side handles

The gesture works; now it can be reached with a pointer.

**Files:**
- Modify: `src/card/tools/resize-tool.ts` (`HANDLE_GRIPS`, `render`)
- Modify: `src/card/picture-studio-card.ts` (the `.handle` CSS block, around lines 1355-1396)
- Test: `src/tests/happy-dom/card/tools.test.ts`

**Interfaces:**
- Consumes: `Grip` from Task 1, `ratioIsForced` from `src/image-box.ts`.
- Produces: DOM contract — a handle is `div.handle.handle-<grip>` with `data-grip="<grip>"`, a child of the item wrapper.

- [ ] **Step 1: Write the failing tests**

In `src/tests/happy-dom/card/tools.test.ts`, inside `describe("createResizeTool", …)`:

```ts
it("mounts eight handles: four corners and four edge midpoints", () => {
  const tool = createResizeTool(options);
  tool.attach(root);
  tool.render({ element: wrapperA, index: 0 });

  expect([...wrapperA.querySelectorAll(".handle")].map((n) => (n as HTMLElement).dataset.grip)).toEqual([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "top",
    "right",
    "bottom",
    "left",
  ]);
});

it("mounts the corners alone when the ratio is forced", () => {
  // A live camera cannot be stretched, so a side handle would be a control that
  // cannot act — a claim the item does not honour.
  const forced = {
    ...options,
    getConfig: () => ({ width: 20, camera_image: "camera.front", camera_view: "live" }) as never,
  };
  const tool = createResizeTool(forced);
  tool.attach(root);
  tool.render({ element: wrapperA, index: 0 });

  expect(
    [...wrapperA.querySelectorAll(".handle")].map((n) => (n as HTMLElement).dataset.grip),
  ).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
});

it("remounts when the same item stops forcing its ratio", () => {
  // `render` short-circuits on an unchanged element, so the set of grips has to
  // be part of what it compares — otherwise leaving Live never brings the side
  // handles back.
  let live = true;
  const switching = {
    ...options,
    getConfig: () =>
      (live
        ? { width: 20, camera_image: "camera.front", camera_view: "live" }
        : { width: 20 }) as never,
  };
  const tool = createResizeTool(switching);
  tool.attach(root);
  tool.render({ element: wrapperA, index: 0 });
  expect(wrapperA.querySelectorAll(".handle")).toHaveLength(4);

  live = false;
  tool.render({ element: wrapperA, index: 0 });
  expect(wrapperA.querySelectorAll(".handle")).toHaveLength(8);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test src/tests/happy-dom/card/tools.test.ts`
Expected: three failures — four handles where eight are wanted, and no remount.

- [ ] **Step 3: Mount the sides, filtered and reconciled**

In `src/card/tools/resize-tool.ts`:

```ts
import { ratioIsForced } from "../../image-box";

/** The four corners, in DOM order. */
const CORNER_GRIPS: Grip[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * The four edge midpoints, which resize one axis freely.
 *
 * Absent under a forced ratio: SHIFT is already inert there, so a side handle
 * would be a control that cannot act — a claim the item does not honour, and
 * a picture has nowhere to put the explanation the form's disabled checkbox
 * gets to carry.
 */
const SIDE_GRIPS: Grip[] = ["top", "right", "bottom", "left"];
```

and `render`:

```ts
    render(target: ToolTarget | undefined): void {
      if (controller.resizingIndex() !== undefined) return;
      const config = target ? options.getConfig(target.index) : undefined;
      const grips =
        config && !ratioIsForced(config) ? [...CORNER_GRIPS, ...SIDE_GRIPS] : CORNER_GRIPS;
      const key = grips.join(" ");
      // The set of grips is part of what identifies what is mounted, not only
      // the element: an item that stops forcing its ratio keeps the same
      // wrapper, and comparing elements alone would never bring the sides back.
      if (mounted === target?.element && mountedKey === key) return;
      unmount();
      if (!target || !config) return;
      for (const grip of grips) {
        const handle = document.createElement("div");
        handle.className = `handle handle-${grip}`;
        handle.dataset.grip = grip;
        target.element.append(handle);
      }
      mounted = target.element;
      mountedKey = key;
    },
```

Declare `let mountedKey: string | undefined;` beside `let mounted`, and clear it in `unmount()`.

- [ ] **Step 4: Add the four CSS rules**

In `src/card/picture-studio-card.ts`, after `.handle-bottom-right`:

```css
    /* A side handle is the same square as a corner — decided over a longer
       pill shape, so that eight handles read as one family. Centred on its
       edge like the corners, which is also why the floor did not have to move:
       the clearance bound is W >= 2 * handle size either way. */
    .handle-top,
    .handle-bottom {
      left: calc(50% - var(--psc-handle-size, 10px) / 2);
      cursor: ns-resize;
    }
    .handle-left,
    .handle-right {
      top: calc(50% - var(--psc-handle-size, 10px) / 2);
      cursor: ew-resize;
    }
    .handle-top {
      top: calc(var(--psc-handle-size, 10px) / -2);
    }
    .handle-bottom {
      bottom: calc(var(--psc-handle-size, 10px) / -2);
    }
    .handle-left {
      left: calc(var(--psc-handle-size, 10px) / -2);
    }
    .handle-right {
      right: calc(var(--psc-handle-size, 10px) / -2);
    }
```

- [ ] **Step 5: Update the floor's comment, which is now the only thing about it that changes**

In `src/resize-box.ts`, `RESIZE_FLOOR_PX`:

```ts
/**
 * The smallest box a gesture may produce, in pixels.
 *
 * Not an arbitrary guard: below roughly twice the handle's own size the handles
 * overlap and there is nothing left to grab. **Three handles now sit on each
 * edge and the bound is unchanged**, because a handle is centred ON its edge
 * rather than inset: two corners occupy `[-s/2, s/2]` and `[W-s/2, W+s/2]`, a
 * midpoint occupies `[W/2-s/2, W/2+s/2]`, and they stay clear while `W >= 2s`.
 *
 * The drag needs no equivalent — it cannot make an item disappear.
 */
export const RESIZE_FLOOR_PX = 24;
```

- [ ] **Step 6: Run the suite and watch it pass**

Run: `pnpm test src/tests/happy-dom/card/tools.test.ts`
Expected: PASS.

- [ ] **Step 7: Look at it in a browser before committing**

Not optional, and not covered by any test: this task changes what the card looks like. Build, deliver and look.

```bash
pnpm build
```

Then bump `?v=N` in `.ha/config/.storage/lovelace_resources` and restart the container — a hard reload does not reliably dislodge the cached build, and **never `rm -rf dist`**, which kills the bind mount and 404s every resource.

```bash
docker compose restart homeassistant
```

Check, on a selected image in the card editor: eight squares, four on the corners and four centred on the edges; the cursor is `ns-resize` on top and bottom and `ew-resize` on left and right; a live camera shows four. Report what you saw.

- [ ] **Step 8: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A src/
git commit -F - <<'EOF'
feat(resize): four side handles, hidden under a forced ratio

Same square as the corners rather than the longer pill shape first sketched, so that eight handles read as one family.

The set of grips is part of what identifies what is mounted, not only the element: an item that stops forcing its ratio keeps the same wrapper, and render short-circuits on an unchanged element — comparing elements alone would never bring the side handles back when a camera leaves Live.

The floor stays at 24 px against intuition, and only its comment changes. A handle is centred on its edge rather than inset, so two corners and a midpoint stay clear while the box is at least twice the handle's size — exactly the bound the corners alone already imposed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 6: The browser lane, the documentation, and the baseline

**Files:**
- Modify: `src/tests/playwright/resize.test.ts`
- Modify: `CHANGELOG.md` (the `### Added` list under `## 1.6.0 — unreleased`)
- Modify: `README.md` (the Image item paragraph, around line 293)
- Modify: `.serena/memories/picture-studio/1.6.0-handoff.md` (§ Test baseline)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing further tasks rely on.

- [ ] **Step 1: Write the failing browser test**

happy-dom has no layout, so the frozen height there is the stub's number rather than the image's. This is the one question only a real engine answers: an E/W drag on a keep-ratio image must leave the *drawn* height where it was, not let it follow the width.

In `src/tests/playwright/resize.test.ts`, following the file's own `armed` / `press` / `move` / `release` helpers:

```ts
it("an east/west drag keeps the drawn height while the width changes", async () => {
  // A 2:1 image at width 40 with no height: keep-ratio, so the height follows
  // the width — unless the side handle freezes it, which is the whole claim.
  const { wrapper } = await armed(imageCard("/local/wide-200x100.png", 40));
  const before = rectInLayer(wrapper);

  const handle = wrapper.querySelector(".handle-right") as HTMLElement;
  press(handle, before.left + before.width, before.top + before.height / 2);
  move(handle, before.left + before.width + 60, before.top + before.height / 2);

  const during = rectInLayer(wrapper);
  expect(during.width).toBeGreaterThan(before.width + 50);
  expect(during.height).toBeCloseTo(before.height, 1);

  release(handle);
});
```

Adapt the helper names and the image suffix to what `src/tests/playwright/harness.ts` and the file's existing four tests actually use — read them first rather than assuming. The `-<w>x<h>` suffix in the image path is what the harness's `HuiImageStub` reads to apply an aspect ratio.

- [ ] **Step 2: Run it against a targeted break and watch it fail**

The file's header records that each of its tests was verified this way. Do the same: temporarily make `onPointerDown` skip the freeze (`if (state.hadHeight && !state.forced)`), run the test, confirm it fails with the height tracking the width, then restore the line.

Run: `pnpm test src/tests/playwright/resize.test.ts`

- [ ] **Step 3: Run it against the real code and watch it pass**

Run: `pnpm test src/tests/playwright/resize.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the changelog entry**

Extend the existing first bullet under `### Added` — the corner handles and the side handles are one feature to a user, and two bullets would read as two:

```markdown
- Images can be resized directly on the picture: select one and drag any of its
  eight handles. The four **corners** keep the proportions as you drag — hold
  **Shift** to set the width and the height independently, and **Alt** to resize
  around the item's anchor instead of the opposite corner. The four handles at
  the **middle of each edge** change one dimension on its own, which is the other
  way to break the proportions; **Shift** does nothing there, since the gesture
  is already free. Breaking the proportions is what makes the picture stretch to
  fill its box; while they are kept, it keeps its own shape. A live camera keeps
  its proportions whatever you do, so it shows its four corners only.
```

- [ ] **Step 5: Update the README**

Replace the two sentences at `README.md:293-296` that say *"dragging any corner"*:

```markdown
Both can be set by dragging the image's handles in the card editor. Dragging a
**corner** saves `width` alone — the same as leaving `height` out, which keeps
the picture's own proportions; hold **Shift** to save both and stretch it. The
handle at the **middle of an edge** changes one dimension on its own and always
saves both, so it is the other way to stretch the picture. Hold **Alt** to resize
around the item's anchor instead of holding the opposite edge fixed. A live
camera shows its corners only: its proportions are not yours to set.
```

- [ ] **Step 6: Run the full suite and refresh the baseline**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

The run must report **every** test file — if it does not, it is not a baseline. Then update `§ Test baseline — 1.6 line` in `.serena/memories/picture-studio/1.6.0-handoff.md` with the new `testFiles` and `passedTests` figures and today's date, in the same breath as the run.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(resize): side handles, in the browser lane and in the docs

The playwright case is the one happy-dom cannot answer: with no layout, the frozen height there is the stub's number rather than the image's, so only a real engine can say that an east/west drag leaves the drawn height alone while the width moves. Verified against a targeted break first, as the file's other four tests were.

The changelog extends the existing bullet rather than adding one: to a user the corners and the sides are one feature, and two bullets would read as two.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Self-review against the spec

| Spec decision | Task |
| ------------- | ---- |
| 1 — the sides are the free channel | the feature as a whole |
| 2 — `Corner` becomes `Grip` | 1 |
| 3 — the tri-state axis | 1 (the type), 2 (the behaviour) |
| 4 — a side is free, SHIFT inert, ALT unchanged | 2 |
| 5 — a side drag leaves keep-ratio; E/W freezes the height | 2 |
| 6 — an inert axis commits verbatim | 3 |
| 7 — the floor stays at 24 | 5 (comment only) |
| 8 — hidden under `ratioIsForced` | 5 |
| 9 — crowding deferred | no task, by design |
| 10 — released where it began commits nothing | 4 |
| Testing § — the six discriminating cases | 2 (four), 4 (one), 5 (one), 6 (the browser one) |
| Versioning § — changelog under `Added`, no bump | 6 |

## Verification before the branch is called done

Beyond the three commands, which every task runs:

1. **A real Home Assistant session**, per the resize spec's own insistence — sub-project 1 was reviewed, green and ready to merge when a browser found four more bugs. Drive a side handle on a genuine image element, on a live camera, and on an item whose anchor is not `top-left`.
2. **A whole-branch review**, `next..HEAD`, which gates the merge.
