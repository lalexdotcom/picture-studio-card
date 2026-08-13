# Configurable item anchor — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CSS translate that anchors a placed badge a per-item choice
(`anchor`), instead of always deriving it from the badge's own coordinates.

**Architecture:** All the arithmetic lands in `src/position.ts`, which is pure
and fully unit-tested; every other file becomes a caller. `config.ts` learns to
read and write the key, `drag-layer.ts` receives the anchor through an injected
callback and gains ratcheting drag bounds, the card renders with it and
recomputes coordinates when it changes, and a small standalone Lit component in
the editor lets the user pick it.

**Tech Stack:** TypeScript, Lit 3 (bundled, `static properties`, no
decorators), rstest for unit tests (node, **no DOM environment**), Biome for
lint and format, rslib for the single-file bundle.

## Global Constraints

Copied from `docs/superpowers/specs/2026-08-12-item-anchor-design.md` and
`AGENTS.md`. Every task's requirements implicitly include this section.

- **Serena's symbolic tools are primary for code.** `get_symbols_overview` /
  `find_symbol` to read, `replace_symbol_body` / `insert_after_symbol` /
  `replace_content` to edit. Built-in Read/Edit only for `.md`, JSON, YAML, or
  when Serena fails on a file.
- **No TypeScript decorators.** Lit components use `static properties` plus
  `declare` fields, as every existing component does.
- **Single-file build.** Never introduce a dynamic `import()`.
- **Lit is bundled**, never read off a Home Assistant prototype.
- **A badge's `config` is opaque.** Never read, validate, reorder or rewrite it.
- **No new user-facing string unless Home Assistant has no key for it.** This
  feature adds exactly two, in `src/strings.ts`, `en` and `fr`.
- **Comments explain why, not what**, and match the density of the file being
  edited. The existing files are heavily commented on decisions and silent on
  mechanics; match that.
- After every task: `pnpm lint`, `pnpm typecheck`, `pnpm test` must all pass
  before the commit.
- Chat with the user in French; code, comments, docs and commit messages in
  English.

**The ten anchor values, verbatim** — used in several tasks, never re-derive
them:

| `anchor` | x offset | y offset |
| --- | --- | --- |
| `proportional` *(default)* | the coordinate itself | the coordinate itself |
| `top-left` | 0 | 0 |
| `top-center` | 50 | 0 |
| `top-right` | 100 | 0 |
| `center-left` | 0 | 50 |
| `center` | 50 | 50 |
| `center-right` | 100 | 50 |
| `bottom-left` | 0 | 100 |
| `bottom-center` | 50 | 100 |
| `bottom-right` | 100 | 100 |

---

## File Structure

| File | Change | Responsibility after the change |
| --- | --- | --- |
| `src/position.ts` | modify | All anchor arithmetic: the vocabulary, the px↔% maps, re-anchoring, the ratcheting drag bounds. Stays pure — no DOM, no HA. |
| `src/tests/position.test.ts` | modify | Covers all of the above. |
| `src/config.ts` | modify | Reads `anchor` off YAML, writes it back, omits it at the default. |
| `src/tests/config.test.ts` | modify | Covers the round trip. |
| `src/editor/badge-items.ts` | modify | A new badge is created with the default anchor. |
| `src/tests/editor/badge-items.test.ts` | modify | Covers it. |
| `src/card/drag-layer.ts` | modify | Gesture only. Gains `getAnchor` and the two `AxisBounds`; still knows nothing about HA. |
| `src/card/picture-studio-card.ts` | modify | Renders with the anchor; recomputes coordinates when it changes. |
| `src/broker.ts` | modify | `EditorChannel` gains `patchAnchor`. |
| `src/editor/anchor-picker.ts` | **create** | The 3×3 grid plus the proportional switch. Emits `anchor-changed`. Knows nothing about the config or HA beyond `hass` for its two labels. |
| `src/editor/badge-form.ts` | modify | Hosts the picker above the badge's own form. |
| `src/editor/picture-studio-editor.ts` | modify | `patchAnchor(index, anchor)`, and passes the current anchor down. |
| `src/strings.ts` | modify | Two new keys. |
| `src/index.ts` | modify | Registers the picker's custom element. |
| `README.md` | modify | Documents `anchor`. |

---

### Task 1: Anchor vocabulary, unbounded percentages, anchor-aware geometry

Everything here is pure arithmetic in one file. The two call sites are updated
with a literal `"proportional"` so the build stays green; Task 4 replaces those
literals with the real value.

**Files:**
- Modify: `src/position.ts`
- Modify: `src/card/drag-layer.ts:1`, `:144-147`, `:152`
- Modify: `src/card/picture-studio-card.ts:295`
- Test: `src/tests/position.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Anchor = "proportional" | "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right"`
  - `const DEFAULT_ANCHOR: Anchor`
  - `const ANCHOR_OFFSETS: Record<Exclude<Anchor, "proportional">, { x: number; y: number }>`
  - `parseAnchor(raw: unknown): Anchor`
  - `axisOffset(anchor: Anchor, axis: "x" | "y"): number | null`
  - `toPx(percent: number, container: number, element: number, offset: number | null): number`
  - `toPercent(px: number, container: number, element: number, offset: number | null): number`
  - `reanchor(position: Position, from: Anchor, to: Anchor, container: { width: number; height: number }, element: { width: number; height: number }): Position`
  - `positionStyle(p: Position, anchor: Anchor): { top: string; left: string; transform: string }`
  - `parsePercent` and `percentString` keep their signatures and stop clamping.
  - `clampPercent` is **removed**.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/tests/position.test.ts` with the following. Three
existing blocks change meaning (`parsePercent`, `percentString`, `toPercent`),
the `clampPercent` block goes away, and four blocks are new. `clampPx` keeps
its block for now — Task 2 removes it.

```ts
import { describe, expect, it } from "@rstest/core";
import {
  ANCHOR_OFFSETS,
  axisOffset,
  clampPx,
  DEFAULT_ANCHOR,
  DEFAULT_POSITION,
  parseAnchor,
  parsePercent,
  percentString,
  positionStyle,
  reanchor,
  storedPosition,
  toPercent,
  toPx,
} from "../position";

describe("parsePercent", () => {
  it("takes a plain number", () => {
    expect(parsePercent(30, 50)).toBe(30);
  });

  it("takes the percent notation, quoted or not — YAML gives us a string either way", () => {
    expect(parsePercent("30%", 50)).toBe(30);
    expect(parsePercent("60.5%", 50)).toBe(60.5);
    expect(parsePercent("30", 50)).toBe(30);
  });

  it("keeps an out-of-range value, which a fixed anchor makes meaningful", () => {
    expect(parsePercent(150, 50)).toBe(150);
    expect(parsePercent("-20%", 50)).toBe(-20);
  });

  it("falls back on anything it cannot read", () => {
    expect(parsePercent(undefined, 50)).toBe(50);
    expect(parsePercent("left", 50)).toBe(50);
    expect(parsePercent({}, 50)).toBe(50);
    expect(parsePercent(Number.NaN, 50)).toBe(50);
  });
});

describe("percentString", () => {
  it("drops trailing zeros", () => {
    expect(percentString(30)).toBe("30%");
    expect(percentString(30.5)).toBe("30.5%");
  });

  it("keeps the two decimals a drag produces, and no more", () => {
    expect(percentString(30.42)).toBe("30.42%");
    expect(percentString(30.4567)).toBe("30.46%");
  });

  it("writes an out-of-range value through — a bound here would put the item back", () => {
    expect(percentString(150)).toBe("150%");
    expect(percentString(-1)).toBe("-1%");
  });
});

describe("storedPosition", () => {
  it("writes both coordinates as percentages", () => {
    expect(storedPosition({ top: 30, left: 60.5 })).toEqual({ top: "30%", left: "60.5%" });
  });
});

describe("parseAnchor", () => {
  it("takes any of the nine fixed names", () => {
    expect(parseAnchor("top-left")).toBe("top-left");
    expect(parseAnchor("center")).toBe("center");
    expect(parseAnchor("bottom-right")).toBe("bottom-right");
  });

  it("takes the proportional keyword", () => {
    expect(parseAnchor("proportional")).toBe("proportional");
  });

  it("falls back to the default on anything else", () => {
    expect(parseAnchor(undefined)).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor("middle")).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor(42)).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor({})).toBe(DEFAULT_ANCHOR);
  });

  it("does not mistake an inherited property for an anchor", () => {
    expect(parseAnchor("toString")).toBe(DEFAULT_ANCHOR);
    expect(parseAnchor("constructor")).toBe(DEFAULT_ANCHOR);
  });

  it("defaults to proportional, so no existing config moves", () => {
    expect(DEFAULT_ANCHOR).toBe("proportional");
  });
});

describe("ANCHOR_OFFSETS", () => {
  it("holds the nine fixed anchors and nothing else", () => {
    expect(Object.keys(ANCHOR_OFFSETS).sort()).toEqual([
      "bottom-center",
      "bottom-left",
      "bottom-right",
      "center",
      "center-left",
      "center-right",
      "top-center",
      "top-left",
      "top-right",
    ]);
  });

  it("reads the corners and the middle off the name", () => {
    expect(ANCHOR_OFFSETS["top-left"]).toEqual({ x: 0, y: 0 });
    expect(ANCHOR_OFFSETS.center).toEqual({ x: 50, y: 50 });
    expect(ANCHOR_OFFSETS["bottom-right"]).toEqual({ x: 100, y: 100 });
    expect(ANCHOR_OFFSETS["top-right"]).toEqual({ x: 100, y: 0 });
    expect(ANCHOR_OFFSETS["center-left"]).toEqual({ x: 0, y: 50 });
  });
});

describe("axisOffset", () => {
  it("splits a fixed anchor into its two components", () => {
    expect(axisOffset("bottom-left", "x")).toBe(0);
    expect(axisOffset("bottom-left", "y")).toBe(100);
  });

  it("returns null for proportional, whose offset is the coordinate itself", () => {
    expect(axisOffset("proportional", "x")).toBeNull();
    expect(axisOffset("proportional", "y")).toBeNull();
  });
});

describe("toPx", () => {
  it("spreads a proportional coordinate over the free span", () => {
    expect(toPx(0, 200, 40, null)).toBe(0);
    expect(toPx(50, 200, 40, null)).toBe(80);
    expect(toPx(100, 200, 40, null)).toBe(160);
  });

  it("offsets a fixed anchor by a fraction of the item's own size", () => {
    // top-left: the coordinate is the leading edge.
    expect(toPx(50, 200, 40, 0)).toBe(100);
    // center: pulled back by half the item.
    expect(toPx(50, 200, 40, 50)).toBe(80);
    // right: pulled back by the whole item.
    expect(toPx(50, 200, 40, 100)).toBe(60);
  });

  it("lets a fixed anchor overflow, which is the whole point", () => {
    expect(toPx(100, 200, 40, 0)).toBe(200);
  });
});

describe("toPercent", () => {
  it("inverts the proportional map", () => {
    expect(toPercent(0, 200, 40, null)).toBe(0);
    expect(toPercent(80, 200, 40, null)).toBe(50);
    expect(toPercent(160, 200, 40, null)).toBe(100);
  });

  it("inverts the fixed map", () => {
    expect(toPercent(100, 200, 40, 0)).toBe(50);
    expect(toPercent(80, 200, 40, 50)).toBe(50);
    expect(toPercent(60, 200, 40, 100)).toBe(50);
  });

  it("rounds to two decimals", () => {
    expect(toPercent(37, 200, 40, null)).toBe(23.13);
  });

  it("no longer bounds its result, so an overflow survives the round trip", () => {
    expect(toPercent(200, 200, 40, 0)).toBe(100);
    expect(toPercent(220, 200, 40, 0)).toBe(110);
    expect(toPercent(-20, 200, 40, 0)).toBe(-10);
  });

  it("returns 0 when a proportional item is as wide as its container", () => {
    expect(toPercent(0, 200, 200, null)).toBe(0);
  });

  it("returns 0 when the container has no width", () => {
    expect(toPercent(10, 0, 40, 50)).toBe(0);
  });
});

describe("toPx / toPercent round trip", () => {
  const anchors = [
    "proportional",
    "top-left",
    "top-center",
    "top-right",
    "center-left",
    "center",
    "center-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ] as const;

  it("returns the coordinate it was given, for every anchor", () => {
    for (const anchor of anchors) {
      const offset = axisOffset(anchor, "x");
      expect(toPercent(toPx(42.5, 400, 100, offset), 400, 100, offset)).toBe(42.5);
    }
  });

  it("survives an out-of-range coordinate under a fixed anchor", () => {
    expect(toPercent(toPx(130, 400, 100, 50), 400, 100, 50)).toBe(130);
  });
});

describe("reanchor", () => {
  // 400 x 400 container, 100 x 100 item.
  const container = { width: 400, height: 400 };
  const element = { width: 100, height: 100 };

  it("leaves the item exactly where it is", () => {
    // proportional 100/100 puts the item's leading edge at 300px.
    // Under top-left, 300px is 75%.
    expect(reanchor({ top: 100, left: 100 }, "proportional", "top-left", container, element)).toEqual(
      { top: 75, left: 75 },
    );
  });

  it("is exact for an item that already overflows", () => {
    // top-left 100% puts the leading edge at 400px, 100px past the edge.
    // Under center that is 112.5%, and the item does not move.
    expect(reanchor({ top: 100, left: 100 }, "top-left", "center", container, element)).toEqual({
      top: 112.5,
      left: 112.5,
    });
  });

  it("is a no-op when the anchor does not change", () => {
    expect(reanchor({ top: 30, left: 45 }, "center", "center", container, element)).toEqual({
      top: 30,
      left: 45,
    });
  });

  it("treats the two axes independently", () => {
    const wide = { width: 400, height: 200 };
    const item = { width: 100, height: 50 };
    // x: 300px under top-left is 75%. y: 150px under top-left is 75%.
    expect(reanchor({ top: 100, left: 100 }, "proportional", "top-left", wide, item)).toEqual({
      top: 75,
      left: 75,
    });
  });
});

describe("positionStyle", () => {
  it("derives a proportional translate from the coordinates themselves", () => {
    expect(positionStyle({ top: 30, left: 45 }, "proportional")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-45%, -30%)",
    });
  });

  it("anchors flush to the bottom-right at 100, under proportional", () => {
    expect(positionStyle({ top: 100, left: 100 }, "proportional")).toEqual({
      top: "100%",
      left: "100%",
      transform: "translate(-100%, -100%)",
    });
  });

  it("pins the translate under a fixed anchor, whatever the coordinates", () => {
    expect(positionStyle({ top: 30, left: 45 }, "center")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-50%, -50%)",
    });
    expect(positionStyle({ top: 90, left: 10 }, "center")).toEqual({
      top: "90%",
      left: "10%",
      transform: "translate(-50%, -50%)",
    });
  });

  it("emits no translate at all for top-left", () => {
    expect(positionStyle({ top: 30, left: 45 }, "top-left")).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-0%, -0%)",
    });
  });
});

describe("clampPx", () => {
  it("keeps a value inside the free span", () => {
    expect(clampPx(30, 200, 40)).toBe(30);
  });

  it("clamps below zero to zero", () => {
    expect(clampPx(-10, 200, 40)).toBe(0);
  });

  it("clamps to the far edge, which is container minus element", () => {
    expect(clampPx(500, 200, 40)).toBe(160);
  });

  it("collapses to zero when the element fills the container", () => {
    expect(clampPx(50, 200, 200)).toBe(0);
  });
});

describe("DEFAULT_POSITION", () => {
  it("is the center", () => {
    expect(DEFAULT_POSITION).toEqual({ top: 50, left: 50 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/position.test.ts`
Expected: FAIL — the import of `ANCHOR_OFFSETS`, `axisOffset`, `DEFAULT_ANCHOR`,
`parseAnchor`, `reanchor` and `toPx` cannot be resolved.

- [ ] **Step 3: Rewrite `src/position.ts`**

Use Serena. `replace_symbol_body` for each existing symbol,
`insert_after_symbol` for the new ones, `safe_delete_symbol` for `clampPercent`.
The file ends up like this — the header comment changes too, because the
sentence it opens with is no longer true unconditionally:

```ts
/**
 * Positions are percentages, and the anchor decides what they are a percentage
 * *of*. Under `proportional` — the default, and the only behaviour there used to
 * be — the anchor follows the coordinate: 0 is flush with the top-left corner,
 * 50 centered, 100 flush with the bottom-right, so a coordinate inside 0-100
 * cannot overflow at any container size. Every fixed anchor pins the translate
 * instead, which is what makes `left: 50%` mean "this item's centre sits at the
 * middle of the image" — and makes overflow expressible.
 */
export interface Position {
  top: number;
  left: number;
}

export const DEFAULT_POSITION: Position = { top: 50, left: 50 };

/** How a position is written back to YAML: "30%" reads better than 30. */
export interface StoredPosition {
  top: string;
  left: string;
}

/** Where the item's own box is pinned to its coordinates. */
export type Anchor =
  | "proportional"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const DEFAULT_ANCHOR: Anchor = "proportional";

/** Each fixed anchor as a percentage of the item's own size, per axis. */
export const ANCHOR_OFFSETS: Record<Exclude<Anchor, "proportional">, { x: number; y: number }> = {
  "top-left": { x: 0, y: 0 },
  "top-center": { x: 50, y: 0 },
  "top-right": { x: 100, y: 0 },
  "center-left": { x: 0, y: 50 },
  center: { x: 50, y: 50 },
  "center-right": { x: 100, y: 50 },
  "bottom-left": { x: 0, y: 100 },
  "bottom-center": { x: 50, y: 100 },
  "bottom-right": { x: 100, y: 100 },
};

/**
 * Read a stored anchor. `Object.hasOwn` and not `in`: every object literal
 * inherits `toString`, and `"toString" in ANCHOR_OFFSETS` is true.
 */
export const parseAnchor = (raw: unknown): Anchor => {
  if (raw === "proportional") return "proportional";
  return typeof raw === "string" && Object.hasOwn(ANCHOR_OFFSETS, raw)
    ? (raw as Anchor)
    : DEFAULT_ANCHOR;
};

/** One component of an anchor. `null` is proportional: the offset is the coordinate. */
export const axisOffset = (anchor: Anchor, axis: "x" | "y"): number | null =>
  anchor === "proportional" ? null : ANCHOR_OFFSETS[anchor][axis];

/**
 * Read a stored coordinate. A hand-written config may say 30, "30" or "30%";
 * anything else — a missing key, a typo, an object — falls back rather than
 * placing the badge somewhere arbitrary.
 *
 * Out-of-range values pass through. A fixed anchor makes them meaningful, and
 * clamping here would silently rewrite what someone typed — the same reason we
 * serialise percent strings back instead of normalising them away.
 */
export const parsePercent = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;
  if (typeof raw !== "string") return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
};

/** Two decimals is the precision the drag produces; trailing zeros never appear. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Keeping the drag's precision means a gesture survives the round trip
 * untouched. No bound here either: it would put an overflowing item back on the
 * way out, undoing what parsePercent just let through.
 */
export const percentString = (value: number): string => `${round2(value)}%`;

export const storedPosition = (position: Position): StoredPosition => ({
  top: percentString(position.top),
  left: percentString(position.left),
});

/** The travel available to the element inside the container, never negative. */
const span = (container: number, element: number): number => Math.max(0, container - element);

/** Clamp a pixel offset to the free span. */
export const clampPx = (px: number, container: number, element: number): number =>
  Math.min(Math.max(px, 0), span(container, element));

/** Coordinate to the pixel offset of the item's leading edge. */
export const toPx = (
  percent: number,
  container: number,
  element: number,
  offset: number | null,
): number =>
  offset === null
    ? (span(container, element) * percent) / 100
    : (container * percent) / 100 - (element * offset) / 100;

/**
 * The inverse of toPx. Both degenerate cases answer 0: a proportional item as
 * large as its container has nowhere to go, and a container of zero has no
 * scale to express anything against.
 */
export const toPercent = (
  px: number,
  container: number,
  element: number,
  offset: number | null,
): number => {
  if (offset === null) {
    const free = span(container, element);
    return free === 0 ? 0 : round2((100 * px) / free);
  }
  return container === 0 ? 0 : round2((100 * (px + (element * offset) / 100)) / container);
};

/**
 * Re-express a position under a different anchor without moving the item.
 * Exact in every case, including an item that already overflows, because
 * percentages are unbounded.
 */
export const reanchor = (
  position: Position,
  from: Anchor,
  to: Anchor,
  container: { width: number; height: number },
  element: { width: number; height: number },
): Position => ({
  left: toPercent(
    toPx(position.left, container.width, element.width, axisOffset(from, "x")),
    container.width,
    element.width,
    axisOffset(to, "x"),
  ),
  top: toPercent(
    toPx(position.top, container.height, element.height, axisOffset(from, "y")),
    container.height,
    element.height,
    axisOffset(to, "y"),
  ),
});

/** Derive the CSS. Never stored — always computed from the stored numbers. */
export const positionStyle = (
  p: Position,
  anchor: Anchor,
): { top: string; left: string; transform: string } => ({
  top: `${p.top}%`,
  left: `${p.left}%`,
  transform: `translate(-${axisOffset(anchor, "x") ?? p.left}%, -${axisOffset(anchor, "y") ?? p.top}%)`,
});
```

Note `?? p.left` and not `|| p.left`: `axisOffset` legitimately returns `0` for
`top-left`, and `0 || x` would swallow it.

- [ ] **Step 4: Fix the two call sites so the build still compiles**

In `src/card/picture-studio-card.ts`, line 295:

```ts
      const style = positionStyle(item.position, "proportional");
```

In `src/card/drag-layer.ts`, lines 144-147 and 152:

```ts
    const position: Position = {
      left: toPercent(x, surface.width, width, null),
      top: toPercent(y, surface.height, height, null),
    };
```

```ts
    const style = positionStyle(position, "proportional");
```

These literals are placeholders that Task 4 replaces with the item's real
anchor. They are deliberate: they keep every intermediate commit compiling and
green.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS. If `typecheck` still reports `clampPercent`, grep for a
caller the plan missed: `grep -rn clampPercent src`.

- [ ] **Step 6: Commit**

```bash
git add src/position.ts src/tests/position.test.ts src/card/drag-layer.ts src/card/picture-studio-card.ts
git commit -m "feat: anchor vocabulary and anchor-aware geometry

Percentages stop being clamped, in all three of parsePercent, percentString
and toPercent: a bound left in any one of them puts an overflowing item back.
That is what makes a fixed anchor expressible, and it makes reanchor exact.

Callers pass a literal proportional for now; the real value arrives with the
config key."
```

---

### Task 2: Ratcheting drag bounds

The flat clamp handles an out-of-bounds start badly: pointerdown records the
real pixels, then the first pointermove snaps the item inside and the grabbed
point is no longer under the cursor. Fixed anchors make that state reachable,
so the bound has to become a ratchet.

**Files:**
- Modify: `src/position.ts` (add the bounds, remove `clampPx`)
- Modify: `src/card/drag-layer.ts:1`, `:33-49`, `:79-88`, `:114-131`
- Test: `src/tests/position.test.ts`

**Interfaces:**
- Consumes: `span` (private to `position.ts`) from Task 1.
- Produces:
  - `interface AxisBounds { lo: number; hi: number }`
  - `const OPEN_BOUNDS: AxisBounds`
  - `tighten(bounds: AxisBounds, current: number, container: number, element: number): AxisBounds`
  - `advance(raw: number, current: number, bounds: AxisBounds, container: number, element: number): { px: number; bounds: AxisBounds }`
  - `clampPx` is **removed**.

- [ ] **Step 1: Write the failing tests**

In `src/tests/position.test.ts`, delete the `describe("clampPx")` block and its
import, and add these two blocks in its place:

```ts
describe("tighten", () => {
  // container 200, element 40 -> span 160.
  it("closes open bounds onto the span when the item is inside", () => {
    expect(tighten(OPEN_BOUNDS, 80, 200, 40)).toEqual({ lo: 0, hi: 160 });
  });

  it("widens only on the side the item overflows", () => {
    expect(tighten(OPEN_BOUNDS, 220, 200, 40)).toEqual({ lo: 0, hi: 220 });
    expect(tighten(OPEN_BOUNDS, -30, 200, 40)).toEqual({ lo: -30, hi: 160 });
  });

  it("never widens bounds that are already closed", () => {
    expect(tighten({ lo: 0, hi: 160 }, 999, 200, 40)).toEqual({ lo: 0, hi: 160 });
    expect(tighten({ lo: 0, hi: 160 }, -999, 200, 40)).toEqual({ lo: 0, hi: 160 });
  });

  it("collapses to a point when the element fills the container", () => {
    expect(tighten(OPEN_BOUNDS, 0, 200, 200)).toEqual({ lo: 0, hi: 0 });
  });
});

describe("advance", () => {
  // container 200, element 40 -> span 160.
  it("behaves as a flat clamp from the first move, for an item that starts inside", () => {
    const first = advance(500, 80, OPEN_BOUNDS, 200, 40);
    expect(first.px).toBe(160);
    expect(first.bounds).toEqual({ lo: 0, hi: 160 });
    expect(advance(-10, first.px, first.bounds, 200, 40).px).toBe(0);
  });

  it("lets an item that starts outside travel inward but not further out", () => {
    // Starts at 220, which is 60px past the far edge.
    const out = advance(300, 220, OPEN_BOUNDS, 200, 40);
    expect(out.px).toBe(220); // the ask was further out; the ceiling holds it
    expect(out.bounds).toEqual({ lo: 0, hi: 220 });

    const inward = advance(190, out.px, out.bounds, 200, 40);
    expect(inward.px).toBe(190);
    expect(inward.bounds).toEqual({ lo: 0, hi: 220 });
  });

  it("ratchets the ceiling down to where the item now is", () => {
    let state = advance(300, 220, OPEN_BOUNDS, 200, 40); // hi 220
    state = advance(190, state.px, state.bounds, 200, 40); // now at 190
    state = advance(999, state.px, state.bounds, 200, 40); // asks to fly right
    expect(state.px).toBe(190);
    expect(state.bounds.hi).toBe(190);
  });

  it("latches at the span once the item is back inside, and cannot leave again", () => {
    let state = advance(300, 220, OPEN_BOUNDS, 200, 40);
    state = advance(100, state.px, state.bounds, 200, 40); // fully inside
    expect(state.bounds).toEqual({ lo: 0, hi: 160 });
    state = advance(999, state.px, state.bounds, 200, 40);
    expect(state.px).toBe(160);
  });

  it("ratchets the floor the same way on the near side", () => {
    let state = advance(-100, -30, OPEN_BOUNDS, 200, 40);
    expect(state.px).toBe(-30);
    state = advance(-5, state.px, state.bounds, 200, 40);
    state = advance(-999, state.px, state.bounds, 200, 40);
    expect(state.px).toBe(-5);
  });
});
```

Update the import at the top of the file: drop `clampPx`, add `advance`,
`OPEN_BOUNDS` and `tighten`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/position.test.ts`
Expected: FAIL — `advance`, `OPEN_BOUNDS` and `tighten` cannot be resolved.

- [ ] **Step 3: Add the bounds to `src/position.ts` and remove `clampPx`**

Replace the `clampPx` export with:

```ts
/** The pixel interval a drag may move within, on one axis. */
export interface AxisBounds {
  lo: number;
  hi: number;
}

/** A gesture starts unbounded; the first pointermove closes these in. */
export const OPEN_BOUNDS: AxisBounds = {
  lo: Number.NEGATIVE_INFINITY,
  hi: Number.POSITIVE_INFINITY,
};

/**
 * Close the bounds around where the item currently is. The interval only ever
 * shrinks toward [0, span]: an item that already overflows can be pulled back
 * but never pushed further out, and once it is inside it cannot leave again.
 */
export const tighten = (
  bounds: AxisBounds,
  current: number,
  container: number,
  element: number,
): AxisBounds => ({
  lo: Math.max(bounds.lo, Math.min(0, current)),
  hi: Math.min(bounds.hi, Math.max(span(container, element), current)),
});

/**
 * One pointermove. Tightening around `current` rather than around the position
 * the pointer is asking for is what makes the ceiling stick to where the item
 * *is* instead of following the cursor out of the image.
 */
export const advance = (
  raw: number,
  current: number,
  bounds: AxisBounds,
  container: number,
  element: number,
): { px: number; bounds: AxisBounds } => {
  const next = tighten(bounds, current, container, element);
  return { px: Math.min(Math.max(raw, next.lo), next.hi), bounds: next };
};
```

- [ ] **Step 4: Use them in `src/card/drag-layer.ts`**

Import line 1 becomes:

```ts
import {
  advance,
  type AxisBounds,
  OPEN_BOUNDS,
  type Position,
  positionStyle,
  toPercent,
} from "../position";
```

Add two fields to `DragState`, after `y`:

```ts
  /** Per-axis travel limits, closed in on the first pointermove. */
  boundsX: AxisBounds;
  boundsY: AxisBounds;
```

In `onPointerDown`, add to the `state = { … }` literal, after `y`:

```ts
      boundsX: OPEN_BOUNDS,
      boundsY: OPEN_BOUNDS,
```

Replace the two `clampPx` assignments in `onPointerMove` with:

```ts
    const nextX = advance(
      ev.clientX - state.surface.left - state.grabX,
      state.x,
      state.boundsX,
      state.surface.width,
      state.width,
    );
    const nextY = advance(
      ev.clientY - state.surface.top - state.grabY,
      state.y,
      state.boundsY,
      state.surface.height,
      state.height,
    );
    state.x = nextX.px;
    state.boundsX = nextX.bounds;
    state.y = nextY.px;
    state.boundsY = nextY.bounds;
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/position.ts src/tests/position.test.ts src/card/drag-layer.ts
git commit -m "feat: ratchet the drag bounds instead of clamping flat

A fixed anchor makes an out-of-bounds start reachable, and the flat clamp
snapped the item inside on the first move, leaving the grabbed point away
from the cursor for the rest of the gesture.

Bounds are now per axis and computed live in pointermove, never at
pointerdown: they start open and each move closes them around where the
item is. An overflowing item can be pulled back but not pushed further
out, and once inside it cannot leave again. A press with no movement
computes no bounds at all."
```

---

### Task 3: The `anchor` key in the config

Nothing consumes the value yet — the card and the drag layer still pass their
`"proportional"` literals. This task is only about reading and writing it.

**Files:**
- Modify: `src/config.ts:13-17` (`PictureItem`), `:71-104` (`normalizeConfig`), `:112-115` (`storedConfig`)
- Modify: `src/editor/badge-items.ts:1-15`
- Test: `src/tests/config.test.ts`, `src/tests/editor/badge-items.test.ts`

**Interfaces:**
- Consumes: `Anchor`, `DEFAULT_ANCHOR`, `parseAnchor` from Task 1.
- Produces: `PictureItem` gains a required `anchor: Anchor`, declared between
  `position` and `config` so the serialised key order reads
  `type, position, anchor, config`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/config.test.ts` (add `parseAnchor`'s neighbours to the
existing imports as needed — `normalizeConfig` and `storedConfig` are already
imported there):

```ts
describe("anchor", () => {
  const base = { type: "custom:picture-studio", image: "/local/a.png" };
  const badge = { type: "entity", entity: "light.salon" };

  it("defaults a missing anchor to proportional", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    });
    expect(config.items[0]?.anchor).toBe("proportional");
  });

  it("reads a fixed anchor", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, anchor: "center", config: badge }],
    });
    expect(config.items[0]?.anchor).toBe("center");
  });

  it("falls back rather than trusting an unrecognised value", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, anchor: "middle", config: badge }],
    });
    expect(config.items[0]?.anchor).toBe("proportional");
  });

  it("omits the key on the way out when it is the default", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    });
    const stored = storedConfig(config) as { items: Record<string, unknown>[] };
    expect(Object.hasOwn(stored.items[0] ?? {}, "anchor")).toBe(false);
  });

  it("writes the key on the way out when it is not", () => {
    const config = normalizeConfig({
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, anchor: "center", config: badge }],
    });
    const stored = storedConfig(config) as { items: Record<string, unknown>[] };
    expect(stored.items[0]?.anchor).toBe("center");
  });

  it("leaves a config that uses no anchor byte-identical across the round trip", () => {
    const raw = {
      ...base,
      items: [{ type: "badge", position: { top: "30%", left: "45%" }, config: badge }],
    };
    expect(storedConfig(normalizeConfig(raw))).toEqual(raw);
  });

  it("keeps an out-of-range coordinate across the round trip", () => {
    const raw = {
      ...base,
      items: [{ type: "badge", position: { top: "-10%", left: "130%" }, anchor: "center", config: badge }],
    };
    expect(storedConfig(normalizeConfig(raw))).toEqual(raw);
  });
});
```

In `src/tests/editor/badge-items.test.ts`, the `addItem` assertion now has to
expect the anchor. Find the test that checks the new item's shape and add
`anchor: "proportional"` to the expected object; if it asserts with `toEqual`
on the whole item, the test fails until Step 3.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/config.test.ts src/tests/editor/badge-items.test.ts`
Expected: FAIL — `config.items[0].anchor` is `undefined`, and the round-trip
assertions report an extra or missing key.

- [ ] **Step 3: Add the key**

`src/config.ts`, import line 1:

```ts
import {
  type Anchor,
  DEFAULT_POSITION,
  parseAnchor,
  type Position,
  parsePercent,
  storedPosition,
} from "./position";
```

`PictureItem`:

```ts
export interface PictureItem {
  type: "badge";
  position: Position;
  /**
   * What the coordinates are anchored to. Always set in memory; omitted from
   * the stored config at its default, so an existing YAML never gains a key it
   * did not have.
   */
  anchor: Anchor;
  config: BadgeConfig;
}
```

In `normalizeConfig`, the returned item literal:

```ts
    return {
      type: "badge" as const,
      position: normalizePosition(entry.position),
      anchor: parseAnchor(entry.anchor),
      config: entry.config as BadgeConfig,
    };
```

`storedConfig`:

```ts
export const storedConfig = (config: PictureStudioConfig): Record<string, unknown> => ({
  ...config,
  items: config.items.map((item) => {
    const stored: Record<string, unknown> = {
      ...item,
      position: storedPosition(item.position),
    };
    // The default is the absence of the key, so a config that never used an
    // anchor comes back exactly as it went in.
    if (item.anchor === "proportional") delete stored.anchor;
    return stored;
  }),
});
```

`src/editor/badge-items.ts`, the import and `addItem`:

```ts
import { DEFAULT_ANCHOR, DEFAULT_POSITION } from "../position";
```

```ts
/** A new badge lands centered and proportional, ready to be dragged. */
export const addItem = (items: PictureItem[], badge: BadgeConfig): PictureItem[] => [
  ...items,
  { type: "badge", position: { ...DEFAULT_POSITION }, anchor: DEFAULT_ANCHOR, config: badge },
];
```

Also update the file's header comment, which names the triple:

```ts
/**
 * Every operation moves a {type, position, anchor, config} item as a unit, which
 * is what makes reordering change stacking order without disturbing any
 * position. None of them mutates its input: Home Assistant freezes the config
 * we are handed.
 */
```

- [ ] **Step 4: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS. `typecheck` will point at any other place that builds a
`PictureItem` literal; there should be none besides `badge-items.ts` and the
tests.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/editor/badge-items.ts src/tests/config.test.ts src/tests/editor/badge-items.test.ts
git commit -m "feat: read and write the item anchor

Always set in memory, omitted from the stored config at its default, so a
YAML that never used an anchor comes back byte-identical and no
anchor: proportional gets sown into it on the first drag."
```

---

### Task 4: Render and drag with the real anchor

This is the task that makes the feature work end to end from YAML. The editor
still cannot set the key; the card and the drag now honour it.

**Files:**
- Modify: `src/card/drag-layer.ts:19-31` (`DragOptions`), `:140-152` (`onPointerUp`)
- Modify: `src/card/picture-studio-card.ts:12` (import), `:46-56` (drag options), `:295`
- Test: `src/tests/position.test.ts` — already covers the arithmetic; no new
  test file. See the note below.

**Interfaces:**
- Consumes: `Anchor`, `axisOffset`, `positionStyle`, `toPercent` from Task 1;
  `PictureItem.anchor` from Task 3.
- Produces: `DragOptions` gains `getAnchor(index: number): Anchor`.

**On testing:** `rstest` runs on node with no DOM, and `drag-layer` is covered
only through the pure functions it delegates to — `hasMoved` is the existing
precedent. The behaviour this task adds is entirely `toPercent` with an offset
and `positionStyle` with an anchor, both already tested in Task 1. Wiring is
left to review and to the browser pass. Do not add a jsdom dependency for it.

- [ ] **Step 1: Add `getAnchor` to `DragOptions`**

```ts
interface DragOptions {
  /** Resolve a pointer target to the wrapper it belongs to, with its index. */
  getIndexedWrapper(target: EventTarget | null): Hit | undefined;
  /** The element whose box defines 100%: the same box hui-image fills. */
  getSurface(): HTMLElement | null;
  /**
   * The anchor the item at this index is stored with. Read at pointerup rather
   * than captured at pointerdown: it is the only thing that decides how the
   * pixels the gesture produced turn back into coordinates, and reading it late
   * keeps the controller free of any copy of the config.
   */
  getAnchor(index: number): Anchor;
  onCommit(index: number, position: Position): void;
  /**
   * Raised on pointerdown: with an index when a badge was hit, so grabbing one
   * selects it as surely as clicking it, and with undefined when the press
   * landed on the image, which clears the selection.
   */
  onSelect(index: number | undefined): void;
}
```

Import `type Anchor` and `axisOffset` from `../position` at the top of the file.

- [ ] **Step 2: Use it in `onPointerUp`**

Replace the position derivation and the style restore:

```ts
    const anchor = options.getAnchor(hit.index);
    const position: Position = {
      left: toPercent(x, surface.width, width, axisOffset(anchor, "x")),
      top: toPercent(y, surface.height, height, axisOffset(anchor, "y")),
    };

    // Restore the derived style here and not only on the next setConfig: a drag
    // that ends where it started produces no config change, so no setConfig
    // would come back, and the badge would stay in raw pixels with no transform.
    // Same geometry either way, so there is no flash.
    const style = positionStyle(position, anchor);
```

- [ ] **Step 3: Supply it from the card**

In `src/card/picture-studio-card.ts`, the drag options literal gains, after
`getSurface`:

```ts
    getAnchor: (index) => this._config?.items[index]?.anchor ?? "proportional",
```

And line 295 drops its literal:

```ts
      const style = positionStyle(item.position, item.anchor);
```

- [ ] **Step 4: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS. `grep -rn '"proportional"' src/card` should now return only
the fallback inside `getAnchor`.

- [ ] **Step 5: Verify it by hand in the browser**

Run: `pnpm build && pnpm ha:up` (the container serves `dist/` at
`/local/picture-studio/picture-studio.js`; hard-reload the dashboard).
Edit a card's YAML to give one badge `anchor: center` and another
`anchor: top-left`, then:
- both sit where the formulas say (`center` at `50/50` is dead centre;
  `top-left` at `0/0` has its own top-left corner on the image's);
- dragging either one still tracks the cursor and commits a sane percentage;
- give a third badge `anchor: top-left` with `left: 100%` — it overflows to the
  right, and grabbing it lets you pull it back in but not further out.

- [ ] **Step 6: Commit**

```bash
git add src/card/drag-layer.ts src/card/picture-studio-card.ts
git commit -m "feat: render and drag with the item's own anchor

getAnchor is read at pointerup rather than captured at pointerdown: it is
the only thing deciding how the gesture's pixels become coordinates, and
reading it late keeps the drag controller free of any copy of the config."
```

---

### Task 5: Keep the item still when its anchor changes

Same coordinates under a different anchor mean different pixels. Only the card
knows pixels, so the recomputation lives there and goes back out through the
channel that already exists.

**Files:**
- Modify: `src/card/picture-studio-card.ts:38-43` (fields), `:238-278`
  (`_syncBadges`), `:280-300` (`_applyPositions`)
- Test: `src/tests/position.test.ts` — `reanchor` is already covered by Task 1.

**Interfaces:**
- Consumes: `Anchor`, `reanchor` from Task 1; `activeEditor().patchPosition`
  from `src/broker.ts`, unchanged.
- Produces: nothing other tasks depend on.

**The trigger, and its one guard.** The card compares the anchor it last
rendered each wrapper with against the config's. That diff is indexed, and
`_syncBadges` does **not** rebuild the wrappers when only the order changed
between badges of the same type — so a reorder of two same-type badges with
different anchors would look exactly like an anchor change and recompute from
the wrong "from" value. The guard: recompute only when the anchor changed **and
the position did not**. An anchor flip never moves the coordinates; a reorder
always brings the other item's coordinates along. The residual case — two
same-type badges stacked at the identical position with different anchors, then
reordered — is rare and a single drag undoes it.

- [ ] **Step 1: Add the two memories the trigger reads**

In the private fields, after `_renderedTypes`:

```ts
  /** The anchor each wrapper was last rendered with; the reanchor trigger. */
  private _renderedAnchors: Anchor[] = [];
  /** The coordinates each wrapper was last rendered with; the reorder guard. */
  private _renderedPositions: Position[] = [];
```

Add `type Anchor`, `type Position` and `reanchor` to the existing
`import … from "../position"`. `PictureItem` is already imported from
`../config`, and `activeEditor` from `../broker`.

- [ ] **Step 2: Reset them whenever the wrappers are rebuilt**

In `_syncBadges`, inside the `if (!sameShape)` branch, next to
`this._wrappers = []`:

```ts
      this._renderedAnchors = [];
      this._renderedPositions = [];
```

Fresh wrappers have no previous anchor, so `_applyPositions` finds `undefined`
and skips the recomputation — which is what makes adding, removing and
type-changing reorders inert.

- [ ] **Step 3: Recompute in `_applyPositions`**

Replace the body of the `items.forEach` callback with:

```ts
    items.forEach((item, index) => {
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      // The selection mark is a class rather than a Lit binding because the
      // wrappers are built imperatively, and it is set outside the drag guard
      // below: the badge being dragged is precisely the selected one.
      wrapper.classList.toggle("selected", this.editing && index === this.selected);
      // Leave the badge under the cursor alone: its styles are live pixels
      // managed by the drag controller. Writing the stored config position over
      // them would jump the badge back toward its pre-drag location on every
      // hass tick. Once the drag ends, onPointerUp restores the derived style
      // and the next _applyPositions then matches it exactly — no flash.
      if (index === dragging) return;

      const position = this._reanchored(item, index, wrapper) ?? item.position;
      this._renderedAnchors[index] = item.anchor;
      this._renderedPositions[index] = position;

      const style = positionStyle(position, item.anchor);
      wrapper.style.top = style.top;
      wrapper.style.left = style.left;
      wrapper.style.transform = style.transform;
    });
```

- [ ] **Step 4: Add the recomputation itself**

Insert a new private method after `_applyPositions`:

```ts
  /**
   * The item's coordinates re-expressed under its new anchor, or undefined if
   * there is nothing to do. Returning the position instead of only committing
   * it lets the caller render it on this same pass, so the item never shows at
   * the pre-recomputation place for a frame.
   *
   * Guarded on the position being unchanged as well: the diff is indexed, and
   * _syncBadges keeps the wrappers when only the order changed between badges
   * of the same type, so a reorder would otherwise look like an anchor change
   * and recompute from the wrong anchor. An anchor flip never moves the
   * coordinates; a reorder always brings the other item's along.
   */
  private _reanchored(
    item: PictureItem,
    index: number,
    wrapper: HTMLElement,
  ): Position | undefined {
    const from = this._renderedAnchors[index];
    if (!this.editing || from === undefined || from === item.anchor) return undefined;

    const rendered = this._renderedPositions[index];
    if (
      rendered === undefined ||
      rendered.top !== item.position.top ||
      rendered.left !== item.position.left
    ) {
      return undefined;
    }

    const layer = this._layer;
    if (!layer) return undefined;

    const container = layer.getBoundingClientRect();
    const element = wrapper.getBoundingClientRect();
    const position = reanchor(item.position, from, item.anchor, container, element);

    // Record before committing: the round trip that comes back then finds the
    // anchors equal and does nothing. This ordering is what guarantees
    // termination even if the arithmetic above is wrong.
    this._renderedAnchors[index] = item.anchor;
    activeEditor()?.patchPosition(index, position);
    return position;
  }
```

`getBoundingClientRect()` returns a `DOMRect`, which structurally satisfies
`{ width, height }`, so it can be passed to `reanchor` directly. The caller
records `_renderedPositions[index]` from the value returned, so this method does
not touch it.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 6: Verify it by hand in the browser**

Run: `pnpm build`, hard-reload. With the editor's YAML tab open on a card with
one badge:
- flip its `anchor` from absent to `center` and back — the badge must not move,
  and the `position` values in the YAML must change each time to compensate;
- flip the anchor on a badge that overflows — it must not move either, and the
  new coordinates may leave `0-100`;
- reorder two same-type badges with different anchors in the list — neither may
  jump.

- [ ] **Step 7: Commit**

```bash
git add src/card/picture-studio-card.ts
git commit -m "feat: keep an item still when its anchor changes

Same coordinates under a different anchor are different pixels. Only the
card knows pixels, so it recomputes and pushes the result back through
patchPosition, recording the new anchor before committing so the round
trip terminates.

Guarded on the position being unchanged too: the diff is indexed and
_syncBadges keeps the wrappers on a same-type reorder, which would
otherwise look identical to an anchor flip."
```

---

### Task 6: The anchor picker component

A standalone Lit element. It knows the ten values and nothing else — no config,
no Home Assistant beyond the `hass` it needs to localize its two labels.

**Files:**
- Create: `src/editor/anchor-picker.ts`
- Modify: `src/strings.ts:10-13`
- Modify: `src/config.ts` (a tag constant), `src/index.ts` (registration)
- Test: `src/tests/strings.test.ts`

**Interfaces:**
- Consumes: `Anchor`, `ANCHOR_OFFSETS` from Task 1; `localizeOwn` from
  `src/strings.ts`.
- Produces:
  - `export const PICKER_TAG = "picture-studio-anchor-picker"` in `src/config.ts`
  - `class PictureStudioAnchorPicker` with properties `hass?: HomeAssistant`
    and `anchor?: Anchor`
  - event `anchor-changed`, `bubbles` and `composed`, detail `{ anchor: Anchor }`

**On design:** the intent is to look like Lovelace's own controls, but it cannot
reuse them — `ha-control-select`, the closest match, appears in a single lazy
chunk of the shipped frontend, so the card cannot rely on it being defined
(checked against the container's bundle on 2026.8.1). Build the grid from plain
buttons dressed in HA's tokens, and use `ha-formfield` + `ha-switch` for the
toggle, both of which are used broadly enough to be present. Expect to tune the
look after seeing it in the browser.

- [ ] **Step 1: Write the failing test for the two strings**

Append to `src/tests/strings.test.ts`. The file already defines a `hass()`
helper at the top — `const hass = (over: Partial<HomeAssistant>): HomeAssistant
=> ({ language: "en", localize: () => "", ...over }) as HomeAssistant;` — so use
it, and add no imports:

```ts
describe("anchor strings", () => {
  it("serves the anchor labels in English", () => {
    expect(localizeOwn(undefined, "anchor")).toBe("Anchoring");
    expect(localizeOwn(undefined, "anchor_proportional")).toBe("Proportional");
  });

  it("serves them in French", () => {
    expect(localizeOwn(hass({ language: "fr" }), "anchor")).toBe("Ancrage");
    expect(localizeOwn(hass({ language: "fr" }), "anchor_proportional")).toBe("Proportionnel");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/tests/strings.test.ts`
Expected: FAIL — `"anchor"` is not assignable to `StringKey`.

- [ ] **Step 3: Add the two strings**

`src/strings.ts`:

```ts
const STRINGS = {
  en: {
    stacking_hint: "The last badges in the list are drawn on top.",
    anchor: "Anchoring",
    anchor_proportional: "Proportional",
  },
  fr: {
    stacking_hint: "Les derniers badges de la liste sont au-dessus.",
    anchor: "Ancrage",
    anchor_proportional: "Proportionnel",
  },
} as const;
```

- [ ] **Step 4: Add the tag constant**

`src/config.ts`, with the other tags:

```ts
export const PICKER_TAG = "picture-studio-anchor-picker";
```

- [ ] **Step 5: Write the component**

Create `src/editor/anchor-picker.ts`:

```ts
import { css, html, LitElement } from "lit";
import { type Anchor, ANCHOR_OFFSETS } from "../position";
import { localizeOwn } from "../strings";
import type { HomeAssistant } from "../types";

/** Row-major, so the grid reads the way it looks. */
const CELLS = Object.keys(ANCHOR_OFFSETS) as Exclude<Anchor, "proportional">[];

/**
 * Picks the anchor: a 3x3 grid for the nine fixed values, and a switch for
 * `proportional`, which has no place on the grid because it is not a point.
 *
 * The grid is hand-built rather than an ha-control-select: that component lives
 * in a lazily loaded chunk of the frontend, so a custom card cannot rely on the
 * tag being defined. The tokens below are HA's, so it still follows the theme.
 *
 * Nine cells and no nine labels — which is the reason this is a grid and not a
 * select, since Home Assistant has no translation key for an anchor name and
 * every string we invent is one we have to maintain in every language.
 */
export class PictureStudioAnchorPicker extends LitElement {
  static properties = {
    hass: { attribute: false },
    anchor: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare anchor?: Anchor;

  private _emit(anchor: Anchor): void {
    this.dispatchEvent(
      new CustomEvent("anchor-changed", {
        detail: { anchor },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected render() {
    const anchor = this.anchor ?? "proportional";
    const proportional = anchor === "proportional";
    return html`
      <div class="label">${localizeOwn(this.hass, "anchor")}</div>
      <div class="grid" ?disabled=${proportional}>
        ${CELLS.map(
          (cell) => html`
            <button
              type="button"
              class=${cell === anchor ? "cell selected" : "cell"}
              .disabled=${proportional}
              aria-label=${cell}
              aria-pressed=${cell === anchor}
              @click=${() => this._emit(cell)}
            ></button>
          `,
        )}
      </div>
      <ha-formfield .label=${localizeOwn(this.hass, "anchor_proportional")}>
        <ha-switch
          .checked=${proportional}
          @change=${(ev: Event) =>
            this._emit((ev.target as HTMLInputElement).checked ? "proportional" : "center")}
        ></ha-switch>
      </ha-formfield>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .label {
      color: var(--secondary-text-color);
      font-size: 0.85rem;
      margin-bottom: var(--ha-space-2, 8px);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--ha-space-1, 4px);
      width: max-content;
      padding: var(--ha-space-1, 4px);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 12px);
    }
    .grid[disabled] {
      opacity: 0.5;
    }
    .cell {
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: var(--secondary-background-color);
      cursor: pointer;
    }
    .cell:disabled {
      cursor: default;
    }
    .cell.selected {
      background: var(--primary-color);
    }
  `;
}
```

Turning the switch **off** has to pick some fixed anchor; `center` is the one
that reads as "the obvious fixed anchor" and matches the picture-elements
idiom. Say so if you change it.

- [ ] **Step 6: Register it**

`src/index.ts`, following the existing pattern exactly:

```ts
import { PictureStudioAnchorPicker } from "./editor/anchor-picker";
```

```ts
if (!customElements.get(PICKER_TAG)) {
  customElements.define(PICKER_TAG, PictureStudioAnchorPicker);
}
```

with `PICKER_TAG` added to the existing `./config` import.

- [ ] **Step 7: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/editor/anchor-picker.ts src/strings.ts src/config.ts src/index.ts src/tests/strings.test.ts
git commit -m "feat: add the anchor picker component

A 3x3 grid plus a proportional switch. Hand-built rather than an
ha-control-select, which lives in a lazily loaded frontend chunk a custom
card cannot rely on. Nine cells and no nine labels: HA has no key for an
anchor name, and a grid needs none."
```

---

### Task 7: Wire the picker into the editor

**Files:**
- Modify: `src/editor/badge-form.ts:18-24` (properties), `:93-114` (render)
- Modify: `src/editor/picture-studio-editor.ts:68-73` (next to `patchPosition`), `:156-191` (render)
- Modify: `src/broker.ts:8-17` (`EditorChannel`)
- Test: none — this is wiring between Lit components, and there is no DOM
  environment. Verified in the browser at Step 5.

**Interfaces:**
- Consumes: `PictureStudioAnchorPicker` and its `anchor-changed` event from
  Task 6; `PictureItem.anchor` from Task 3.
- Produces: `EditorChannel.patchAnchor(index: number, anchor: Anchor): void`.

- [ ] **Step 1: Declare `patchAnchor` on the channel**

`src/broker.ts`, in `EditorChannel`, after `patchPosition`:

```ts
  patchAnchor(index: number, anchor: Anchor): void;
```

with `import type { Anchor, Position } from "./position";` at the top.

It goes on the channel next to `patchPosition` even though no card calls it
today: the two are the same kind of write, and splitting them would leave the
interface describing half of what an editor can be asked to change.

- [ ] **Step 2: Implement it on the editor**

`src/editor/picture-studio-editor.ts`, right after `patchPosition`:

```ts
  patchAnchor(index: number, anchor: Anchor): void {
    const config = this._config;
    if (!config) return;
    const items = config.items.map((item, i) => (i === index ? { ...item, anchor } : item));
    this._commit({ ...config, items });
  }
```

Import `type Anchor` from `../position`.

- [ ] **Step 3: Pass the anchor into the badge form and handle the event**

In `render()`, the `editing` branch:

```ts
      return html`
        <picture-studio-badge-form
          .hass=${hass}
          .badge=${editing.config}
          .anchor=${editing.anchor}
          @badge-changed=${this._badgeChanged}
          @anchor-changed=${this._anchorChanged}
          @go-back=${() => this.select(undefined)}
        ></picture-studio-badge-form>
      `;
```

And a handler right after `_badgeChanged`, which is an arrow field taking a
typed `CustomEvent` and stopping it — same shape:

```ts
  private _anchorChanged = (ev: CustomEvent<{ anchor: Anchor }>): void => {
    ev.stopPropagation();
    if (this._editingIndex === undefined) return;
    this.patchAnchor(this._editingIndex, ev.detail.anchor);
  };
```

`patchAnchor` already guards on `this._config`, so this handler does not repeat
that check — unlike `_badgeChanged`, which commits directly.

- [ ] **Step 4: Host the picker in the badge form**

`src/editor/badge-form.ts` — properties gain `anchor`:

```ts
  static properties = {
    hass: { attribute: false },
    badge: { attribute: false },
    anchor: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare badge?: BadgeConfig;
  declare anchor?: Anchor;
```

and `render()` places the picker between the header and the badge's own form —
the anchor belongs to our wrapper, not to the badge, so it cannot go inside the
badge's form:

```ts
      <div class="header">
        <ha-icon-button
          .label=${"Back"}
          .path=${BACK_PATH}
          @click=${() =>
            this.dispatchEvent(new CustomEvent("go-back", { bubbles: true, composed: true }))}
        ></ha-icon-button>
        <span class="title">${this.badge.type}</span>
      </div>
      <picture-studio-anchor-picker
        .hass=${this.hass}
        .anchor=${this.anchor}
      ></picture-studio-anchor-picker>
      <div class="form"></div>
```

Add to `static styles`:

```css
    picture-studio-anchor-picker {
      margin: 16px 0;
    }
```

Import `type Anchor` from `../position`. The `anchor-changed` event bubbles and
is composed, so the form needs no handler of its own — it passes straight
through to the editor.

- [ ] **Step 5: Verify it in the browser**

Run: `pnpm build`, hard-reload, open a card's editor and a badge's form:
- the grid shows, disabled, with the proportional switch on, for a badge that
  has no anchor;
- turning the switch off selects `center` and the badge does not move;
- clicking each of the nine cells moves nothing and writes the matching value
  in the YAML tab;
- the selected cell survives closing and reopening the form;
- both labels are in the dashboard's language.

Note anything that looks wrong next to Lovelace's own controls — tuning the
look is expected, and is the reason this shipped before the polish.

- [ ] **Step 6: Commit**

```bash
git add src/broker.ts src/editor/picture-studio-editor.ts src/editor/badge-form.ts
git commit -m "feat: let the badge form set the anchor

The picker sits above the badge's own form: the anchor belongs to our
wrapper, not to the badge, so it cannot go inside a form we treat as
opaque. patchAnchor joins patchPosition on the editor channel — the same
kind of write, and splitting them would leave the interface describing
half of what an editor can be asked to change."
```

---

### Task 8: Document the key

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the final config shape from Task 3.
- Produces: nothing.

- [ ] **Step 1: Add the key to the config example**

`README.md`, in the `## Configuration` block, lines 94-101 currently read:

```yaml
items:
  - type: badge                  # family discriminant; defaults to "badge" when omitted
    config:
      type: entity               # any Lovelace badge config
      entity: sensor.temperature
    position:
      top: 30%     # 0 = flush top, 50 = centered, 100 = flush bottom
      left: 60%    # 0 = flush left, 50 = centered, 100 = flush right
```

Replace them with:

```yaml
items:
  - type: badge                  # family discriminant; defaults to "badge" when omitted
    config:
      type: entity               # any Lovelace badge config
      entity: sensor.temperature
    position:
      top: 30%     # see Position anchoring below
      left: 60%
    anchor: center               # optional; defaults to "proportional"
```

The per-line meaning moves into the section below, because it now depends on
the anchor and no longer fits in a trailing comment.

- [ ] **Step 2: Rewrite the `### Position anchoring` section**

Lines 114-118 currently claim a badge can never overflow and that an
out-of-range value is clamped. Both are now wrong. Replace the whole section —
heading included — with:

```markdown
### Position anchoring

`top` and `left` are percentages, and `anchor` decides what they are a
percentage *of*.

`proportional` is the default and the historical behaviour: the anchor follows
the coordinate, the same semantics as CSS `background-position`. At `0` the
badge's edge sits flush against the top-left corner, at `50` the badge is
centered, at `100` its edge sits flush against the bottom-right. It is the only
mode in which a coordinate inside `0-100` **cannot overflow the image**,
whatever the badge size or image dimensions.

The nine fixed values — `top-left`, `top-center`, `top-right`, `center-left`,
`center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right` — pin
the anchor instead. `left: 50%` with `anchor: center` puts the badge's own
centre at the middle of the image, which is what picture-elements' usual
`translate(-50%, -50%)` does.

Coordinates outside `0-100` are allowed and kept as written: under a fixed
anchor they are the way to place a badge deliberately over the edge. Dragging
never creates an overflow and never worsens one — a badge already hanging off
the edge can be pulled back in but not pushed further out, and once fully
inside it stays there. Changing a badge's anchor in the editor does not move it
either: the coordinates are recomputed so the pixels stay the same.

Write the coordinates as `30%` or as a bare `30` — both are accepted, and the
editor writes the percent form back. Two decimals are kept, which is the
precision dragging produces.
```

- [ ] **Step 3: Check the result**

Run: `pnpm lint`
Expected: PASS. Then re-read the surrounding sections: `### YAML-only keys`
follows immediately, and the new text must not repeat what it says about the
editor's coverage.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the item anchor"
```

---

## After the plan

The picker's visual tuning is deliberately left to a pass after Task 7's
browser check, and two follow-ups are parked in the spec's "Out of scope" until
then: a **reset** button back to `50 / 50 / proportional`, and a read-out of
`top` / `left` in the badge form.

Update `.serena/memories/picture-studio/state.md` before closing the branch: the
"Decisions that must not be re-litigated" entry on proportional anchoring is now
only the default rather than the whole story, and the `[0, 100]` clamp described
under "Percent strings in the stored config" is gone.
