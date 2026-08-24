# Image Element Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third element kind, `image` — a second background (image, camera, entity picture, state images, filters) placed anywhere on the card's background at a size the user gives it.

**Architecture:** The config gains an `ImageElementConfig` member of the `ElementConfig` union, carrying the background's vocabulary plus a two-number box in percent. A new `picture-studio-image` element mounts Home Assistant's `hui-image` **directly** — not `hui-image-element`, whose shadow root breaks a height chain — and passes it `fitMode`, the one property that makes an imposed height behave. The card writes the box onto the item wrapper through `_applyPositions`, the method that already owns that node's geometry. The editor reuses the card's own Background / Entity / Filters sections, which first have to be generalised off `PictureStudioConfig`.

**Tech Stack:** TypeScript, Lit, rslib, rstest (happy-dom + Chromium lanes), Biome. Home Assistant frontend `20260729.6`.

**Spec:** `docs/superpowers/specs/2026-08-24-image-element-design.md` — read it first. Every task below argues from a numbered decision in it.

## Global Constraints

- **Serena's symbolic tools are primary for code.** `get_symbols_overview` / `find_symbol` to read, `replace_symbol_body` / `insert_*_symbol` / `replace_content` to edit. Built-in Read/Edit only for `.md`, JSON, YAML. This binds every subagent.
- **Language:** chat in French, everything else — code, comments, commits, docs — in English.
- **`pnpm format` (Biome) after every modification.** It covers `src/**`, `*.ts`, `*.json` only; Markdown is untouched.
- **Never bump a version, never push.** Both happen only when the user asks in so many words.
- **`CHANGELOG.md` is written for users of the card**, under `## 1.6.0 — unreleased`, `Added` before `Changed`.
- **Branch:** `image-element`, cut from `next`, merges back onto `next`. Read the target with `git config --get branch.image-element.target` — never guess it.
- **`aspect_ratio` is the one background key an image element must not take** (spec, Config shape). Given one, `hui-image` builds its `.ratio` container — `height: 0` plus a padding box — which defeats the height the card imposes.
- **Never clamp `width` or `height` in the normalizer.** Positions have been unbounded since 1.2.0 and for a stated reason; the only guard is `> 0` (spec, decision 5).
- **Model/effort for any subagent dispatch:** cheap = haiku/low, standard = sonnet/medium, capable = opus/high. Never dispatch without both set explicitly.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `src/image-box.ts` | The two-number box: normalize it from raw config, serialize it back, and derive the three CSS declarations the card writes. Nothing else knows the percent rules. |
| `src/card/image-element.ts` | `picture-studio-image`: resolve the source, hand `hui-image` its eleven properties, draw the placeholder, relay actions. |
| `src/editor/image-form.ts` | The image kind's schemas and its form-data mapping, mirroring `state-icon-form.ts` / `state-label-form.ts`. |
| `src/tests/happy-dom/image-box.test.ts` | |
| `src/tests/happy-dom/card/image-element.test.ts` | |
| `src/tests/happy-dom/editor/image-form.test.ts` | |

**Modified**

| File | Change |
| --- | --- |
| `src/config.ts` | `ImageElementConfig`, the union member, `IMAGE_TAG`, the normalize branch, the kind gate, the `storedConfig` branch. |
| `src/card/picture-studio-card.ts` | Third branch in `_createChild`; the box written in `_applyPositions`; the pointer-events rule. |
| `src/card/state-icon-element.ts`, `state-label-element.ts` | Untouched. Named here so a reader knows they are deliberately not touched. |
| `src/editor/form-schemas.ts` | Generalised off `PictureStudioConfig`; an `aspect_ratio`-free variant of the background schema. |
| `src/editor/element-form.ts` | Split by kind: the component becomes the shell. |
| `src/editor/element-catalog.ts` | The third kind, its stub. |
| `src/editor/icons.ts` | `"image": "mdi:image-outline"`. |
| `src/strings.ts` | The keep-ratio pair, in English and French. |
| `CHANGELOG.md`, `README.md` | The user-facing story. |

---

## Task 1: The config — a third `ElementConfig` member

**Files:**
- Create: `src/image-box.ts`
- Create: `src/tests/happy-dom/image-box.test.ts`
- Modify: `src/config.ts`
- Test: `src/tests/happy-dom/config.test.ts`

**Interfaces:**
- Consumes: `parsePercent` from `src/position.ts`; `ImageSource`, `imagePath` from `src/config.ts`.
- Produces:
  - `ImageBox = { width: number; height?: number }`
  - `DEFAULT_IMAGE_WIDTH: 20`
  - `normalizeImageBox(raw: Record<string, unknown>): ImageBox`
  - `imageBoxStyle(box: ImageBox): { width: string; height: string; maxHeight: string }`
  - `ImageElementConfig` (see step 5), `IMAGE_TAG = "picture-studio-image"`

- [ ] **Step 1: Write the failing test for the box**

Create `src/tests/happy-dom/image-box.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { DEFAULT_IMAGE_WIDTH, imageBoxStyle, normalizeImageBox } from "../../image-box";

describe("normalizeImageBox", () => {
  test("a bare config takes the default width and keeps its ratio", () => {
    expect(normalizeImageBox({})).toEqual({ width: DEFAULT_IMAGE_WIDTH });
  });

  test("reads a number and a percent string alike", () => {
    expect(normalizeImageBox({ width: 40 })).toEqual({ width: 40 });
    expect(normalizeImageBox({ width: "40%" })).toEqual({ width: 40 });
  });

  test("an absent height IS the keep-ratio mode, and stays absent", () => {
    expect(normalizeImageBox({ width: 40 })).not.toHaveProperty("height");
    expect(normalizeImageBox({ width: 40, height: null })).not.toHaveProperty("height");
  });

  test("a height is kept when it parses", () => {
    expect(normalizeImageBox({ width: 40, height: 25 })).toEqual({ width: 40, height: 25 });
  });

  test("zero, negative and unreadable are not values — width falls back, height vanishes", () => {
    expect(normalizeImageBox({ width: 0 })).toEqual({ width: DEFAULT_IMAGE_WIDTH });
    expect(normalizeImageBox({ width: -5 })).toEqual({ width: DEFAULT_IMAGE_WIDTH });
    expect(normalizeImageBox({ width: "nonsense" })).toEqual({ width: DEFAULT_IMAGE_WIDTH });
    expect(normalizeImageBox({ width: 40, height: 0 })).toEqual({ width: 40 });
    expect(normalizeImageBox({ width: 40, height: -1 })).toEqual({ width: 40 });
  });

  test("above 100 is let through — the same rule positions follow", () => {
    expect(normalizeImageBox({ width: 250, height: 300 })).toEqual({ width: 250, height: 300 });
  });
});

describe("imageBoxStyle", () => {
  test("keep-ratio leaves the height to the browser and bounds it", () => {
    expect(imageBoxStyle({ width: 40 })).toEqual({
      width: "40%",
      height: "",
      maxHeight: "100%",
    });
  });

  test("an explicit height is written, and the clamp is released", () => {
    expect(imageBoxStyle({ width: 40, height: 25 })).toEqual({
      width: "40%",
      height: "25%",
      maxHeight: "",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/happy-dom/image-box.test.ts`
Expected: FAIL — `Cannot find module '../../image-box'`.

- [ ] **Step 3: Write `src/image-box.ts`**

```ts
import { parsePercent } from "./position";

/**
 * An image element's box, both numbers a percentage of the background: `width`
 * of its width, `height` of its height.
 *
 * **`height` absent IS the keep-ratio mode**, rendered as `height: auto` so the
 * browser holds the image's natural ratio exactly, for free, whatever the
 * background is. There is deliberately no boolean beside it: a checkbox *and* a
 * height would be two sources for one fact, and a hand-written YAML would
 * eventually make them contradict each other.
 *
 * The editor's checkbox is therefore derived, never stored — and it survives its
 * own removal: at sub-project 2 keep-ratio becomes the constrained default of the
 * corner handle, and nothing here changes.
 */
export interface ImageBox {
  width: number;
  height?: number;
}

/**
 * A fifth of the background: large enough to see and to grab, small enough not
 * to cover what is already placed.
 */
export const DEFAULT_IMAGE_WIDTH = 20;

/**
 * Neither number is bounded above, and that is the rule positions already
 * follow: `parsePercent` does not clamp, because clamping on the way out would
 * put an overflowing item back and rewrite the user's YAML.
 *
 * The one guard is `> 0`. A zero or negative box is not a value the user meant,
 * it is an element that cannot be drawn or grabbed.
 */
const positivePercent = (raw: unknown): number | undefined => {
  const value = parsePercent(raw, Number.NaN);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

export const normalizeImageBox = (raw: Record<string, unknown>): ImageBox => {
  const width = positivePercent(raw.width) ?? DEFAULT_IMAGE_WIDTH;
  const height = positivePercent(raw.height);
  // The key is omitted rather than set to undefined: `"height" in config` is the
  // predicate the form's checkbox and the card's fit mode both read.
  return height === undefined ? { width } : { width, height };
};

/**
 * The three declarations the card writes on the item wrapper.
 *
 * `max-height: 100%` applies in keep-ratio mode only, and it guards exactly one
 * thing: the image file's own ratio, which is the single input channel neither a
 * gesture's clamp nor the config's deliberate non-clamping can reach. A 1:10
 * banner at `width: 50` would otherwise make the card scroll five times its own
 * height from a value nobody typed wrong.
 *
 * It bounds the render, never the config — it stores nothing and undoes itself
 * the moment the width changes.
 */
export const imageBoxStyle = (
  box: ImageBox,
): { width: string; height: string; maxHeight: string } =>
  box.height === undefined
    ? { width: `${box.width}%`, height: "", maxHeight: "100%" }
    : { width: `${box.width}%`, height: `${box.height}%`, maxHeight: "" };
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test src/tests/happy-dom/image-box.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the config type and the tag, in `src/config.ts`**

Beside `LABEL_TAG`:

```ts
export const IMAGE_TAG = "picture-studio-image";
```

After `StateLabelConfig`, using `insert_after_symbol`:

```ts
/**
 * A picture placed on the picture — a second background, with a box of its own.
 *
 * Everything above `width` is Home Assistant's `hui-image` vocabulary, forwarded
 * to it verbatim. **`aspect_ratio` is deliberately absent**: given one,
 * `hui-image` builds its `.ratio` container (`height: 0` plus a padding box),
 * which defeats the height the card imposes. The two cannot coexist.
 *
 * `entity` and `image_entity` are different keys and read alike, so: `image_entity`
 * *is* the picture — an `image` or `camera` domain entity — while `entity` is the
 * state that selects an entry from `state_image` and `state_filter` and draws
 * nothing by itself. The card's own config carries both, in two sections, and
 * this mirrors it rather than inventing a clearer arrangement that would disagree.
 */
export interface ImageElementConfig extends ImageBox {
  type: "image";
  image?: ImageSource;
  dark_mode_image?: ImageSource;
  image_entity?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  entity?: string;
  state_image?: Record<string, string>;
  state_filter?: Record<string, string>;
  filter?: string;
  dark_mode_filter?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
```

Extend the union and the imports:

```ts
export type ElementConfig = StateIconConfig | StateLabelConfig | ImageElementConfig;
```

```ts
import { type ImageBox, normalizeImageBox } from "./image-box";
```

- [ ] **Step 6: Write the failing normalization and storage tests**

Append to `src/tests/happy-dom/config.test.ts`:

```ts
describe("image element", () => {
  const item = (config: Record<string, unknown>) => ({
    type: "element",
    position: { top: 10, left: 10 },
    config: { type: "image", ...config },
  });

  test("normalizes its box and keeps every passthrough key", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [item({ image: "/a.png", filter: "blur(2px)", state_image: { on: "/b.png" } })],
    });
    const element = config.items[0];
    expect(element.type).toBe("element");
    if (element.type !== "element" || element.config.type !== "image") throw new Error("shape");
    expect(element.config.width).toBe(DEFAULT_IMAGE_WIDTH);
    expect(element.config).not.toHaveProperty("height");
    expect(element.config.filter).toBe("blur(2px)");
    expect(element.config.state_image).toEqual({ on: "/b.png" });
  });

  test("an unreadable kind is still an unknown item, not an image", () => {
    const config = normalizeConfig({
      type: CARD_TYPE,
      items: [{ type: "element", position: {}, config: { type: "picture" } }],
    });
    expect(config.items[0].type).toBe("unknown");
  });

  test("round trips: the default width is omitted, an absent height stays absent", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, items: [item({ image: "/a.png" })] }),
    );
    const config = (stored.items as Record<string, unknown>[])[0].config as Record<string, unknown>;
    expect(config).not.toHaveProperty("width");
    expect(config).not.toHaveProperty("height");
    expect(config.image).toBe("/a.png");
  });

  test("round trips: a chosen box is written back", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, items: [item({ width: 40, height: 25 })] }),
    );
    const config = (stored.items as Record<string, unknown>[])[0].config as Record<string, unknown>;
    expect(config.width).toBe(40);
    expect(config.height).toBe(25);
  });

  test("round trips: an unknown key survives the commit", () => {
    const stored = storedConfig(
      normalizeConfig({ type: CARD_TYPE, items: [item({ future_key: "kept" })] }),
    );
    const config = (stored.items as Record<string, unknown>[])[0].config as Record<string, unknown>;
    expect(config.future_key).toBe("kept");
  });
});
```

Add `DEFAULT_IMAGE_WIDTH` to that file's imports from `../../image-box`.

- [ ] **Step 7: Run them and watch them fail**

Run: `pnpm test src/tests/happy-dom/config.test.ts`
Expected: FAIL — the kind is rejected, so the first item comes back as `unknown`.

- [ ] **Step 8: Wire the three branches in `src/config.ts`**

In `normalizeElementConfig`, before the closing `throw`:

```ts
  if (raw.type === "image") {
    return {
      ...raw,
      type: "image",
      ...normalizeImageBox(raw),
    } as ImageElementConfig;
  }
```

In `normalizeConfig`'s kind gate:

```ts
      if (kind !== "state-icon" && kind !== "state-label" && kind !== "image") {
        return unknown("element-type", typeof kind === "string" ? kind : undefined);
      }
```

In `storedConfig`, as a third branch before the `assertNever`:

```ts
      } else if (element.type === "image") {
        // No `common()` here: an image has no ElementSize and no halo. `rest`
        // carries every hui-image key untouched, which is what keeps a
        // hand-written `camera_view` alive across an editor commit.
        const { width, height, ...rest } = element;
        const config: Record<string, unknown> = { ...rest };
        if (width !== DEFAULT_IMAGE_WIDTH) config.width = width;
        if (height !== undefined) config.height = height;
        stored.config = config;
```

- [ ] **Step 9: Run the whole happy-dom lane**

Run: `pnpm test --project happy-dom`
Expected: PASS. `tsc` will also flag the two `assertNever` sites if a branch was missed — run `pnpm typecheck` and expect it clean.

- [ ] **Step 10: Format and commit**

```bash
pnpm format
git add src/image-box.ts src/config.ts src/tests/happy-dom/image-box.test.ts src/tests/happy-dom/config.test.ts
git commit -m "feat(config): the image element kind, and its box

Two numbers, both a percentage of the background. An absent height IS the
keep-ratio mode: there is no boolean beside it, because a checkbox and a
height would be two sources for one fact.

Neither number is bounded above — the rule positions have followed since
1.2.0, for the reason round2 gives. The only guard is > 0, since a zero box
is an element that cannot be drawn or grabbed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The element — `picture-studio-image`

**Files:**
- Create: `src/card/image-element.ts`
- Create: `src/tests/happy-dom/card/image-element.test.ts`

**Interfaces:**
- Consumes: `ImageElementConfig`, `imagePath` from `src/config.ts`; `hasAction`, `bindActions` from `src/card/item-actions.ts`; `interactionStyles` from `src/card/item-styles.ts`; `hassRenderChanged` from `src/has-changed.ts`.
- Produces:
  - `class PictureStudioImage extends LitElement` with `setConfig(config: ImageElementConfig)`, a `hass` accessor pair, and a reactive `editing: boolean`.
  - `imageSource(config: ImageElementConfig, hass: HomeAssistant | undefined): string | undefined`
  - `isImageClickable(config: ImageElementConfig): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/tests/happy-dom/card/image-element.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { PictureStudioImage, imageSource, isImageClickable } from "../../../card/image-element";
import type { ImageElementConfig } from "../../../config";
import { IMAGE_TAG } from "../../../config";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(IMAGE_TAG)) customElements.define(IMAGE_TAG, PictureStudioImage);

const hass = (states: Record<string, unknown> = {}): HomeAssistant =>
  ({ states, themes: { darkMode: false }, language: "en", localize: () => "" }) as HomeAssistant;

const mount = async (config: ImageElementConfig, h = hass(), editing = false) => {
  const el = document.createElement(IMAGE_TAG) as PictureStudioImage;
  el.editing = editing;
  el.setConfig(config);
  el.hass = h;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe("imageSource", () => {
  test("a plain path passes through", () => {
    expect(imageSource({ type: "image", width: 20, image: "/a.png" }, hass())).toBe("/a.png");
  });

  test("a media selector object is unwrapped, like the background's", () => {
    expect(
      imageSource({ type: "image", width: 20, image: { media_content_id: "/b.png" } }, hass()),
    ).toBe("/b.png");
  });

  test("image_entity becomes the proxy URL, state included as its cache-buster", () => {
    const h = hass({
      "image.door": { entity_id: "image.door", state: "2026-08-24", attributes: { access_token: "T" } },
    });
    expect(imageSource({ type: "image", width: 20, image_entity: "image.door" }, h)).toBe(
      "/api/image_proxy/image.door?token=T&state=2026-08-24",
    );
  });

  test("no token, no image — Home Assistant's own answer, mirrored", () => {
    const h = hass({ "image.door": { entity_id: "image.door", state: "x", attributes: {} } });
    expect(imageSource({ type: "image", width: 20, image_entity: "image.door" }, h)).toBeUndefined();
  });

  test("image_entity wins over image, as hui-image-element resolves it", () => {
    const h = hass({
      "image.door": { entity_id: "image.door", state: "s", attributes: { access_token: "T" } },
    });
    expect(
      imageSource({ type: "image", width: 20, image: "/a.png", image_entity: "image.door" }, h),
    ).toBe("/api/image_proxy/image.door?token=T&state=s");
  });
});

describe("isImageClickable", () => {
  test("absent means inert — unlike every other kind", () => {
    expect(isImageClickable({ type: "image", width: 20 })).toBe(false);
  });

  test("an explicit action makes it clickable", () => {
    expect(
      isImageClickable({ type: "image", width: 20, tap_action: { action: "more-info" } }),
    ).toBe(true);
    expect(
      isImageClickable({ type: "image", width: 20, hold_action: { action: "toggle" } }),
    ).toBe(true);
  });

  test("an explicit none is still inert", () => {
    expect(isImageClickable({ type: "image", width: 20, tap_action: { action: "none" } })).toBe(
      false,
    );
  });
});

describe("rendering", () => {
  test("keep-ratio asks hui-image to contain; an explicit height asks it to fill", async () => {
    const kept = await mount({ type: "image", width: 40, image: "/a.png" });
    expect(kept.renderRoot.querySelector("hui-image")).toBeTruthy();
    expect((kept.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe(
      "contain",
    );

    const sized = await mount({ type: "image", width: 40, height: 25, image: "/a.png" });
    expect((sized.renderRoot.querySelector("hui-image") as { fitMode?: string }).fitMode).toBe(
      "fill",
    );
  });

  test("every hui-image key is forwarded", async () => {
    const el = await mount({
      type: "image",
      width: 40,
      image: "/a.png",
      dark_mode_image: "/dark.png",
      camera_image: "camera.front",
      camera_view: "live",
      entity: "binary_sensor.door",
      state_image: { on: "/on.png" },
      state_filter: { off: "grayscale(1)" },
      filter: "blur(1px)",
      dark_mode_filter: "brightness(.7)",
    });
    const image = el.renderRoot.querySelector("hui-image") as Record<string, unknown>;
    expect(image.darkModeImage).toBe("/dark.png");
    expect(image.cameraImage).toBe("camera.front");
    expect(image.cameraView).toBe("live");
    expect(image.entity).toBe("binary_sensor.door");
    expect(image.stateImage).toEqual({ on: "/on.png" });
    expect(image.stateFilter).toEqual({ off: "grayscale(1)" });
    expect(image.filter).toBe("blur(1px)");
    expect(image.darkModeFilter).toBe("brightness(.7)");
  });

  test("sourceless: a placeholder while editing, nothing at all otherwise", async () => {
    const editing = await mount({ type: "image", width: 40 }, hass(), true);
    expect(editing.renderRoot.querySelector(".placeholder")).toBeTruthy();

    const viewing = await mount({ type: "image", width: 40 }, hass(), false);
    expect(viewing.renderRoot.querySelector(".placeholder")).toBeNull();
    expect(viewing.renderRoot.querySelector("hui-image")).toBeNull();
  });

  test("hui-image missing degrades to the placeholder, never to a blank item", async () => {
    // happy-dom has no Home Assistant, so hui-image is undefined here — which is
    // exactly the fallback path. The assertion is that we notice rather than
    // mounting an element that renders nothing.
    expect(customElements.get("hui-image")).toBeUndefined();
    const el = await mount({ type: "image", width: 40, image: "/a.png" }, hass(), true);
    expect(el.renderRoot.querySelector(".placeholder")).toBeTruthy();
  });

  test("the clickable attribute follows the config", async () => {
    const inert = await mount({ type: "image", width: 40, image: "/a.png" });
    expect(inert.hasAttribute("clickable")).toBe(false);

    const live = await mount({
      type: "image",
      width: 40,
      image: "/a.png",
      tap_action: { action: "more-info" },
    });
    expect(live.hasAttribute("clickable")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/happy-dom/card/image-element.test.ts`
Expected: FAIL — `Cannot find module '../../../card/image-element'`.

- [ ] **Step 3: Write `src/card/image-element.ts`**

```ts
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { type ImageElementConfig, imagePath } from "../config";
import { hassRenderChanged } from "../has-changed";
import type { HomeAssistant } from "../types";
import { bindActions, hasAction } from "./item-actions";
import { interactionStyles } from "./item-styles";

/**
 * Home Assistant's shared image renderer. **Not `hui-image-element`**, the
 * picture-elements wrapper: its own shadow root holds an unstyled `<div>` that
 * breaks the `height: 100%` chain, and nothing reaches that node from outside —
 * no `::part`, no custom property, no light-DOM selector. So it covers only one
 * of this element's two modes.
 *
 * `hui-image` itself is fine, and the difference is one property: `fitMode`,
 * which the wrapper never forwards and which we do. Measured on frontend
 * 20260729.6, in a real browser: given a definite height it fills it, and
 * `fitMode: "fill"` reaches the `<img>` as `object-fit: fill`.
 *
 * It is not on any public helper surface. Its availability is nonetheless not a
 * side effect of our background rendering — `window.loadCardHelpers` is
 * `Promise.all([s.e(33932), …])` and 33932 is this chunk, so the helper loads it
 * before resolving, whatever the card's config says. The card awaits
 * `loadCardHelpers()` before `_createChild` runs. The guard below is for the day
 * Home Assistant splits its chunks differently, which it may do without a
 * deprecation cycle.
 */
const HUI_IMAGE = "hui-image";

/**
 * The path `hui-image` should draw, resolving `image_entity` ourselves.
 *
 * `hui-image-element` did this and `hui-image` does not; the whole of Home
 * Assistant's `computeImageUrl` is the expression below, and it is the public
 * HTTP API. The `&state=` is a cache-buster, which is why the picture redraws
 * when the entity changes. The `undefined` on a missing token is mirrored too —
 * that is HA's own answer, not a degradation of ours.
 */
export const imageSource = (
  config: ImageElementConfig,
  hass: HomeAssistant | undefined,
): string | undefined => {
  if (config.image_entity) {
    const stateObj = hass?.states?.[config.image_entity];
    const token = (stateObj?.attributes as { access_token?: string } | undefined)?.access_token;
    if (!stateObj || !token) return undefined;
    return `/api/image_proxy/${config.image_entity}?token=${token}&state=${stateObj.state}`;
  }
  return imagePath(config.image);
};

/**
 * **The one place this kind disagrees with the other two.** `isClickable` in
 * `item-actions.ts` reads an absent `tap_action` as clickable, because Home
 * Assistant's default is more-info and a state-icon always has a subject to show
 * it for. An image has none: `entity` selects a state image, it is not what the
 * item is about, and more-info on nothing is an accident rather than a default.
 *
 * The failure is also asymmetric with size. A badge that needlessly catches the
 * pointer costs a few square pixels; a large image would swallow every click
 * over its whole surface, including those meant for the icons underneath it.
 */
export const isImageClickable = (config: ImageElementConfig): boolean =>
  hasAction(config.tap_action) ||
  hasAction(config.hold_action) ||
  hasAction(config.double_tap_action);

export class PictureStudioImage extends LitElement {
  static properties = {
    _config: { state: true },
    _hass: { state: true },
    editing: { type: Boolean },
  };

  declare _config?: ImageElementConfig;
  declare _hass?: HomeAssistant;
  declare editing: boolean;

  constructor() {
    super();
    this.editing = false;
    // The same relay the other two kinds use: an `action` event is re-dispatched
    // upward with the config attached, and Home Assistant decides what it means.
    this.addEventListener("action", (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      this.dispatchEvent(
        new CustomEvent("picture-studio-action", {
          detail: { config: this._config, action: detail?.action },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }

  setConfig(config: ImageElementConfig): void {
    this._config = config;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /**
   * The card hands every item every `hass` publication. `entity` is what makes
   * that parameter mean something here — a state image changes with it, and an
   * image element without one has nothing that a tick could have moved.
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("_config") || changed.has("editing") || !changed.has("_hass")) return true;
    return hassRenderChanged(
      changed.get("_hass") as HomeAssistant | undefined,
      this._hass,
      this._config?.entity ?? this._config?.image_entity,
    );
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;

    const src = imageSource(config, this._hass);
    const drawable = !!(src || config.camera_image || config.state_image);

    // Two ways to have nothing to draw, one answer. An <img> with no source
    // renders nothing at all — unlike a state-icon, which gets HA's own
    // missing-entity marker — so a fresh item would be invisible and impossible
    // to grab. The dashed box is what makes it selectable between being added
    // and being configured, and it is also where a broken path degrades to.
    if (!drawable || !customElements.get(HUI_IMAGE)) {
      return this.editing ? html`<div class="placeholder"></div>` : nothing;
    }

    return html`
      <hui-image
        .hass=${this._hass}
        .image=${src}
        .darkModeImage=${imagePath(config.dark_mode_image)}
        .cameraImage=${config.camera_image}
        .cameraView=${config.camera_view}
        .entity=${config.entity}
        .stateImage=${config.state_image}
        .stateFilter=${config.state_filter}
        .filter=${config.filter}
        .darkModeFilter=${config.dark_mode_filter}
        .fitMode=${config.height === undefined ? "contain" : "fill"}
      ></hui-image>
    `;
  }

  protected updated(changed: PropertyValues): void {
    const config = this._config;
    if (!config || !changed.has("_config")) return;
    this.toggleAttribute("clickable", isImageClickable(config));
    bindActions(this, config);
  }

  static styles = [
    interactionStyles,
    css`
      /* Every link of the chain is ours, which is the whole reason this element
         exists rather than a hui-image-element: the wrapper's box reaches the
         <img> because nothing unstyled sits between them. */
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      hui-image {
        display: block;
        width: 100%;
        height: 100%;
      }
      /* The aspect-ratio only applies when the height is auto — that is, in
         keep-ratio mode, where a sourceless item has no intrinsic height and
         would otherwise be a zero-pixel box nobody can grab. With an explicit
         height, `height: 100%` is definite and wins. */
      .placeholder {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        aspect-ratio: 3 / 2;
        border: 2px dashed var(--secondary-text-color, #888);
        border-radius: 4px;
      }
    `,
  ];
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test src/tests/happy-dom/card/image-element.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Format and commit**

```bash
pnpm format
git add src/card/image-element.ts src/tests/happy-dom/card/image-element.test.ts
git commit -m "feat(card): picture-studio-image, on hui-image directly

Not hui-image-element: an unstyled div in its shadow root breaks the
height chain, and nothing reaches that node from outside. hui-image itself
fills an imposed height, and the difference is one property the wrapper
never forwards — fitMode, which we set from the box.

image_entity is resolved here, since hui-image wants a path. The whole of
computeImageUrl is one expression against the public HTTP API, the missing
token answered with undefined exactly as HA answers it.

And one deliberate disagreement with the other kinds: an image with no
explicit action is inert. It has no implicit subject, and a large one would
otherwise swallow every click meant for the icons under it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The card draws it, and owns its box

**Files:**
- Modify: `src/card/picture-studio-card.ts` — `_createChild` (~line 637), `_applyPositions` (~line 783), `static styles`
- Modify: `src/index.ts` — register the tag
- Test: `src/tests/happy-dom/card/picture-studio-card.test.ts`

**Interfaces:**
- Consumes: `IMAGE_TAG` from `src/config.ts`; `imageBoxStyle` from `src/image-box.ts`; `isImageClickable` from `src/card/image-element.ts`.
- Produces: nothing new — this task makes an image element render from YAML.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/happy-dom/card/picture-studio-card.test.ts`, following that file's existing harness usage:

```ts
describe("image items", () => {
  test("the wrapper carries the box, and keep-ratio carries the clamp", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/bg.png",
      items: [
        {
          type: "element",
          position: { top: 50, left: 50 },
          config: { type: "image", image: "/a.png", width: 40 },
        },
      ],
    });
    const wrapper = card.renderRoot.querySelector(".item.element") as HTMLElement;
    expect(wrapper.style.width).toBe("40%");
    expect(wrapper.style.height).toBe("");
    expect(wrapper.style.maxHeight).toBe("100%");
  });

  test("an explicit height is written and releases the clamp", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/bg.png",
      items: [
        {
          type: "element",
          position: { top: 50, left: 50 },
          config: { type: "image", image: "/a.png", width: 40, height: 25 },
        },
      ],
    });
    const wrapper = card.renderRoot.querySelector(".item.element") as HTMLElement;
    expect(wrapper.style.width).toBe("40%");
    expect(wrapper.style.height).toBe("25%");
    expect(wrapper.style.maxHeight).toBe("");
  });

  test("the box never lands on a badge or on the other element kinds", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/bg.png",
      items: [
        {
          type: "element",
          position: { top: 10, left: 10 },
          config: { type: "state-icon", entity: "light.a" },
        },
      ],
    });
    const wrapper = card.renderRoot.querySelector(".item.element") as HTMLElement;
    expect(wrapper.style.width).toBe("");
    expect(wrapper.style.maxHeight).toBe("");
  });

  test("an inert image is marked so, and a clickable one is not", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/bg.png",
      items: [
        {
          type: "element",
          position: { top: 10, left: 10 },
          config: { type: "image", image: "/a.png" },
        },
        {
          type: "element",
          position: { top: 20, left: 20 },
          config: { type: "image", image: "/b.png", tap_action: { action: "more-info" } },
        },
      ],
    });
    const wrappers = card.renderRoot.querySelectorAll(".item.element");
    expect((wrappers[0] as HTMLElement).classList.contains("inert")).toBe(true);
    expect((wrappers[1] as HTMLElement).classList.contains("inert")).toBe(false);
  });

  test("the element is built, not a hole", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/bg.png",
      items: [
        {
          type: "element",
          position: { top: 10, left: 10 },
          config: { type: "image", image: "/a.png" },
        },
      ],
    });
    expect(card.renderRoot.querySelector(IMAGE_TAG)).toBeTruthy();
  });
});
```

Use whatever the file's existing mount helper is called; read the top of the file first and follow it rather than introducing `mountCard` if another name is already there.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/happy-dom/card/picture-studio-card.test.ts`
Expected: FAIL — no `picture-studio-image` in the layer, and the wrapper has no width.

- [ ] **Step 3: Add the third branch in `_createChild`**

```ts
    let tag: string | undefined;
    if (item.config.type === "state-label") tag = LABEL_TAG;
    else if (item.config.type === "state-icon") tag = ICON_TAG;
    else if (item.config.type === "image") tag = IMAGE_TAG;
```

- [ ] **Step 4: Write the box in `_applyPositions`**

Inside the existing `items.forEach`, after the `if (index === dragging) return;` guard and beside the three position writes:

```ts
      // The box, for the one kind that has one. It goes here rather than on the
      // element because `.item` is `width: max-content`, and a percentage width
      // on a child of a max-content box is cyclic — CSS resolves it as `auto`, so
      // an element sizing itself in % simply would not. The wrapper is ours.
      //
      // Inline style rather than a class: `wrapper.className` is the item
      // *family*, never the kind, so there is no `.item.image` to write a rule
      // against — and inventing one would add a second channel saying what the
      // config already says.
      if (item.type === "element" && item.config.type === "image") {
        const box = imageBoxStyle(item.config);
        wrapper.style.width = box.width;
        wrapper.style.height = box.height;
        wrapper.style.maxHeight = box.maxHeight;
        // Outside editing an image with no action must let clicks through: it is
        // large, and it sits over other items. The class rather than an inline
        // style so `.editing` can win it back.
        wrapper.classList.toggle("inert", !isImageClickable(item.config));
      }
```

- [ ] **Step 5: Add the pointer rule to `static styles`**

Beside the existing `.editing .item` rules:

```css
    /* An image with no action is transparent to pointers on a dashboard. Without
       this a large one swallows every click over its whole surface, including
       those meant for the items underneath it — a failure that does not exist
       for badges, which are small. While editing the wrapper keeps the pointer,
       like every other item, so it stays selectable and draggable. */
    .item.inert {
      pointer-events: none;
    }
    .editing .item.inert {
      pointer-events: auto;
    }
```

- [ ] **Step 6: Register the tag in `src/index.ts`**

Follow the file's existing registrations for `ICON_TAG` and `LABEL_TAG` exactly — same guard, same order.

- [ ] **Step 7: Run the lane and the typechecker**

Run: `pnpm test --project happy-dom && pnpm typecheck`
Expected: PASS, clean.

- [ ] **Step 8: Format and commit**

```bash
pnpm format
git add src/card/picture-studio-card.ts src/index.ts src/tests/happy-dom/card/picture-studio-card.test.ts
git commit -m "feat(card): draw the image element, and give it its box

The box is written on the wrapper, by the method that already owns that
node's geometry. It cannot live on the element: .item is width: max-content,
and a percentage width under a max-content parent is cyclic — CSS resolves
it as auto, so an element sizing itself in % would silently not.

Inline style rather than a class, because wrapper.className is the item
family and never the kind: there is no .item.image to write a rule against.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Generalise the card's sections off `PictureStudioConfig`

**Files:**
- Modify: `src/editor/form-schemas.ts`
- Test: `src/tests/happy-dom/editor/form-schemas.test.ts`

**Interfaces:**
- Produces:
  - `BackgroundKeys` — the structural type the schemas need: `{ camera_image?: string; image_entity?: string; image?: ImageSource; dark_mode_image?: ImageSource; camera_view?: "auto" | "live"; aspect_ratio?: string }`
  - `backgroundSchema(localize, config: BackgroundKeys, options?: { aspectRatio?: boolean }): FormSchema` — `aspectRatio` defaults to `true`, so the card is unchanged.
  - `backgroundData<T extends BackgroundKeys>(config: T): Record<string, unknown>` — unchanged behaviour.
  - `mergeBackground<T extends BackgroundKeys>(config: T, data: Record<string, unknown>, options?: { aspectRatio?: boolean }): T`
  - `entitySchema`, `filtersSchema` — already `localize`-only, unchanged.

**Why this task exists:** the image element reuses the card's own sections rather than duplicating four schemas. They are typed against `PictureStudioConfig` and `mergeBackground` returns one. Generalising is the real cost of that reuse, and it is smaller than four copies that drift.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/happy-dom/editor/form-schemas.test.ts`:

```ts
describe("generalised over any config carrying the background keys", () => {
  const localize = (() => "") as LocalizeFunc;

  test("aspect_ratio is offered by default, so the card is unchanged", () => {
    const names = backgroundSchema(localize, {}).map((f) => f.name);
    expect(names).toContain("aspect_ratio");
  });

  test("and is refused on request — an image element has a box of its own", () => {
    const names = backgroundSchema(localize, {}, { aspectRatio: false }).map((f) => f.name);
    expect(names).not.toContain("aspect_ratio");
    expect(names).toContain("image");
    expect(names).toContain("dark_mode_image");
    expect(names).toContain(PICTURE_ENTITY);
  });

  test("camera_view still appears only for a camera, whatever the config type", () => {
    const element = { type: "image" as const, width: 20, camera_image: "camera.front" };
    const names = backgroundSchema(localize, element, { aspectRatio: false }).map((f) => f.name);
    expect(names).toContain("camera_view");
  });

  test("merging an element config returns an element config, keys intact", () => {
    const element = { type: "image" as const, width: 40, height: 25, image: "/a.png" };
    const next = mergeBackground(element, { [PICTURE_ENTITY]: "camera.front" }, {
      aspectRatio: false,
    });
    expect(next.type).toBe("image");
    expect(next.width).toBe(40);
    expect(next.height).toBe(25);
    expect(next.camera_image).toBe("camera.front");
    expect(next).not.toHaveProperty("image_entity");
  });

  test("without the aspect_ratio field, merging never deletes an existing one", () => {
    // sectionMerge only touches keys the schema rendered. A hand-written
    // aspect_ratio on an image element does nothing, but it is the user's, and
    // storedConfig would otherwise drop it on the first commit.
    const element = { type: "image" as const, width: 40, aspect_ratio: "16:9" };
    const next = mergeBackground(element, {}, { aspectRatio: false });
    expect(next.aspect_ratio).toBe("16:9");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/happy-dom/editor/form-schemas.test.ts`
Expected: FAIL — `backgroundSchema` takes no third argument, and `mergeBackground` refuses a non-`PictureStudioConfig`.

- [ ] **Step 3: Generalise the four exports**

Replace the `PictureStudioConfig` parameter types with the structural one, and thread the option:

```ts
/**
 * The slice of a config the background section reads — the card's, and now an
 * image element's. Structural rather than a union of the two: the section does
 * not care what else the record carries, and a union would have to grow every
 * time a third consumer appears.
 */
export interface BackgroundKeys {
  image?: ImageSource;
  dark_mode_image?: ImageSource;
  image_entity?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  aspect_ratio?: string;
}

export const backgroundSchema = (
  localize: LocalizeFunc,
  config: BackgroundKeys,
  options: { aspectRatio?: boolean } = {},
): FormSchema => {
  const chosen = config.camera_image ?? config.image_entity;
  const isCamera = domainOf(chosen) === "camera";
  return [
    { name: "image", selector: imageSelector(localize) },
    { name: "dark_mode_image", selector: imageSelector(localize) },
    { name: PICTURE_ENTITY, selector: { entity: { domain: ["image", "camera"] } } },
    ...(isCamera ? [cameraViewField(localize)] : []),
    // The card's own background takes it; an image element must not. Given an
    // aspect_ratio, hui-image builds its `.ratio` container — height: 0 plus a
    // padding box — which defeats the height the card imposes on the wrapper.
    // Refused here rather than filtered by the caller, so the field cannot be
    // rendered by one path and dropped by another.
    ...(options.aspectRatio === false ? [] : [{ name: "aspect_ratio", selector: { text: {} } }]),
  ];
};
```

Extract the existing inline `camera_view` entry into a `cameraViewField(localize)` const so the array above stays readable; its body is the object that is there today, unchanged.

`backgroundData` becomes `<T extends BackgroundKeys>(config: T)` with the same body. `mergeBackground` becomes:

```ts
export const mergeBackground = <T extends BackgroundKeys>(
  config: T,
  data: Record<string, unknown>,
  options: { aspectRatio?: boolean } = {},
): T => {
  const schema = backgroundSchema(() => "", config, options);
  const { [PICTURE_ENTITY]: picked, ...fields } = data;
  const chosen = typeof picked === "string" && picked ? picked : undefined;
  const next = sectionMerge(schema, config as Record<string, unknown>, fields) as T;
  // …the existing three-branch body, unchanged…
  return next;
};
```

- [ ] **Step 4: Run the editor tests and watch them pass**

Run: `pnpm test --project happy-dom`
Expected: PASS. The card's own call sites pass no options, so `aspect_ratio` is still offered and every pre-existing assertion holds — that is the acceptance criterion for this task.

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Format and commit**

```bash
pnpm format
git add src/editor/form-schemas.ts src/tests/happy-dom/editor/form-schemas.test.ts
git commit -m "refactor(editor): the background sections, over any config that carries the keys

The image element reuses the card's own Background, Entity and Filters
sections rather than duplicating four schemas that would then drift. They
were typed against PictureStudioConfig; they are now structural.

One option comes with it: aspect_ratio is offered by default — so the card
is untouched — and refused for an image element, which has a box of its own
and whose height hui-image would defeat with its .ratio container.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Split `element-form.ts` by kind

**Files:**
- Modify: `src/editor/element-form.ts` (605 lines)
- Modify: `src/editor/state-icon-form.ts`, `src/editor/state-label-form.ts`
- Test: `src/tests/happy-dom/editor/element-form.test.ts` (839 lines) — **not modified**

**Interfaces:**
- Produces, in `src/editor/element-form.ts`:
  ```ts
  export interface KindForm<C extends ElementConfig> {
    toFormData(config: C): Record<string, unknown>;
    fromFormData(config: C, data: Record<string, unknown>): C;
    render(ctx: KindFormContext<C>): unknown;
  }
  export interface KindFormContext<C extends ElementConfig> {
    element: C;
    hass: HomeAssistant;
    data: Record<string, unknown>;
    label: (s: { name: string }) => string;
    helper: (s: { name: string }) => string | undefined;
    valueChanged: (ev: CustomEvent) => void;
    anchor: Anchor;
    visibility: unknown;
  }
  ```
- The shell keeps: the header, `go-back`, the `element-changed` dispatch, the `<picture-studio-visibility-section>`, and `static styles`.

**This is a pure refactor. The acceptance criterion is that the existing 839-line suite passes unchanged** — no new test is written, and any change to that file's assertions is a failure of this task, not a fix.

**Risk note for the implementer:** eight `isLabel ? … : …` branches, one `stateLabelIsTimeBased` call that is label-only, and a `radioGroupAvailable` / `switchAvailable` pair of lazy `customElements.get` checks that must stay lazy and stay at render time. Move them into the shell's context, not into the per-kind modules — the label and icon forms both read them.

- [ ] **Step 1: Establish the baseline**

Run: `pnpm test src/tests/happy-dom/editor/element-form.test.ts`
Expected: PASS. Record the test count; it must be identical at the end.

- [ ] **Step 2: Move the icon's body into `state-icon-form.ts`**

Add an `iconForm: KindForm<StateIconConfig>` export whose `toFormData` / `fromFormData` are the existing `iconToFormData` / `iconFromFormData`, and whose `render` is the `isLabel === false` side of every branch in the component's current `render()`, verbatim — same schemas, same order, same `ha-expansion-panel` structure, same icons.

- [ ] **Step 3: Run the suite**

Run: `pnpm test src/tests/happy-dom/editor/element-form.test.ts`
Expected: PASS, same count.

- [ ] **Step 4: Move the label's body into `state-label-form.ts`**

Same shape: `labelForm: KindForm<StateLabelConfig>`, taking the `isLabel === true` side, including the `stateLabelIsTimeBased` gate and the `label_empty_hint` warning marker.

- [ ] **Step 5: Reduce the component to the shell**

`_toData` and `_dispatch` become one lookup:

```ts
const FORMS = {
  "state-icon": iconForm,
  "state-label": labelForm,
} as const;

private _formFor(element: ElementConfig) {
  const form = (FORMS as Record<string, KindForm<never>>)[element.type];
  // No default. An unknown kind never reaches this form — normalizeElementConfig
  // raises first — and defaulting it to the icon would corrupt its config with
  // icon-only keys the day a fourth kind exists.
  if (!form) return assertNever(element as never, "element kind");
  return form;
}
```

- [ ] **Step 6: Run the suite, the lane and the typechecker**

Run: `pnpm test --project happy-dom && pnpm typecheck`
Expected: PASS with the same `element-form.test.ts` count as step 1, clean typecheck.

- [ ] **Step 7: Format and commit**

```bash
pnpm format
git add src/editor/element-form.ts src/editor/state-icon-form.ts src/editor/state-label-form.ts
git commit -m "refactor(editor): element-form, split by kind

605 lines branching eight times on isLabel. A third kind turns each of those
into a three-way ternary, in a file sub-project 2 will come straight back to.

Behaviour is unchanged and the existing 839-line suite is the proof: it was
not touched, and its count is the same before and after.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The image form, the catalogue, and the release notes

**Files:**
- Create: `src/editor/image-form.ts`
- Create: `src/tests/happy-dom/editor/image-form.test.ts`
- Modify: `src/editor/element-form.ts` (register the third kind), `src/editor/element-catalog.ts`, `src/editor/icons.ts`, `src/strings.ts`
- Modify: `CHANGELOG.md`, `README.md`

**Interfaces:**
- Consumes: `KindForm` / `KindFormContext` from Task 5; `backgroundSchema`, `backgroundData`, `mergeBackground`, `entitySchema`, `filtersSchema`, `PICTURE_ENTITY` from Task 4; `activeCard` from `src/broker.ts`.
- Produces: `imageForm: KindForm<ImageElementConfig>`, `KEEP_RATIO = "keep_ratio"`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/happy-dom/editor/image-form.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { PICTURE_ENTITY } from "../../../editor/form-schemas";
import { KEEP_RATIO, imageForm } from "../../../editor/image-form";
import type { ImageElementConfig } from "../../../config";

const base: ImageElementConfig = { type: "image", width: 40, image: "/a.png" };

describe("imageForm.toFormData", () => {
  test("keep_ratio is derived from the absence of a height, never stored", () => {
    expect(imageForm.toFormData(base)[KEEP_RATIO]).toBe(true);
    expect(imageForm.toFormData({ ...base, height: 25 })[KEEP_RATIO]).toBe(false);
  });

  test("the picture entity is the synthetic field, camera first", () => {
    expect(imageForm.toFormData({ ...base, image_entity: "image.door" })[PICTURE_ENTITY]).toBe(
      "image.door",
    );
    expect(
      imageForm.toFormData({ ...base, image_entity: "image.door", camera_image: "camera.hall" })[
        PICTURE_ENTITY
      ],
    ).toBe("camera.hall");
  });
});

describe("imageForm.fromFormData", () => {
  test("ticking keep_ratio removes the height key entirely", () => {
    const next = imageForm.fromFormData({ ...base, height: 25 }, {
      ...imageForm.toFormData({ ...base, height: 25 }),
      [KEEP_RATIO]: true,
    });
    expect(next).not.toHaveProperty("height");
  });

  test("clearing keep_ratio writes a height rather than leaving the key absent", () => {
    const next = imageForm.fromFormData(base, {
      ...imageForm.toFormData(base),
      [KEEP_RATIO]: false,
    });
    expect(typeof next.height).toBe("number");
    expect(next.height).toBeGreaterThan(0);
  });

  test("the synthetic field never reaches the config", () => {
    const next = imageForm.fromFormData(base, {
      ...imageForm.toFormData(base),
      [PICTURE_ENTITY]: "camera.hall",
    });
    expect(next).not.toHaveProperty(PICTURE_ENTITY);
    expect(next).not.toHaveProperty(KEEP_RATIO);
    expect(next.camera_image).toBe("camera.hall");
  });

  test("aspect_ratio is neither offered nor destroyed", () => {
    const withRatio = { ...base, aspect_ratio: "16:9" } as ImageElementConfig & {
      aspect_ratio: string;
    };
    const next = imageForm.fromFormData(withRatio, imageForm.toFormData(withRatio));
    expect((next as { aspect_ratio?: string }).aspect_ratio).toBe("16:9");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/tests/happy-dom/editor/image-form.test.ts`
Expected: FAIL — `Cannot find module '../../../editor/image-form'`.

- [ ] **Step 3: Write `src/editor/image-form.ts`**

The data mapping, which is what the test above pins:

```ts
import { activeCard } from "../broker";
import type { ImageElementConfig } from "../config";
import { DEFAULT_IMAGE_WIDTH } from "../image-box";
import { backgroundData, mergeBackground, PICTURE_ENTITY } from "./form-schemas";

/**
 * The checkbox is derived from `height === undefined` and is never stored: a
 * boolean beside a height would be two sources for one fact.
 *
 * It is also scaffolding. At sub-project 2 keep-ratio becomes the constrained
 * default of the corner handle and this field disappears — the config does not
 * change when it does, which is the argument that the config was right.
 */
export const KEEP_RATIO = "keep_ratio";

const NO_ASPECT_RATIO = { aspectRatio: false } as const;

/**
 * The height to write when the box is freed, measured rather than invented.
 *
 * Asking the preview is what stops the box jumping at the instant the checkbox
 * clears — the same route `reanchor` uses, and for the same reason: only the
 * card knows pixels. The fallback matters when no preview answers (a test, a
 * form opened before the card laid out): the item's own width, which gives a
 * square box rather than a collapsed one.
 */
const freedHeight = (config: ImageElementConfig): number =>
  activeCard()?.measureImageHeight?.(config) ?? config.width;

export const imageForm = {
  toFormData(config: ImageElementConfig): Record<string, unknown> {
    return {
      ...backgroundData(config),
      ...(config.entity !== undefined ? { entity: config.entity } : {}),
      ...(config.state_image !== undefined ? { state_image: config.state_image } : {}),
      ...(config.state_filter !== undefined ? { state_filter: config.state_filter } : {}),
      ...(config.filter !== undefined ? { filter: config.filter } : {}),
      ...(config.dark_mode_filter !== undefined
        ? { dark_mode_filter: config.dark_mode_filter }
        : {}),
      width: config.width,
      ...(config.height !== undefined ? { height: config.height } : {}),
      [KEEP_RATIO]: config.height === undefined,
      ...(config.tap_action !== undefined ? { tap_action: config.tap_action } : {}),
      ...(config.hold_action !== undefined ? { hold_action: config.hold_action } : {}),
      ...(config.double_tap_action !== undefined
        ? { double_tap_action: config.double_tap_action }
        : {}),
    };
  },

  fromFormData(
    config: ImageElementConfig,
    data: Record<string, unknown>,
  ): ImageElementConfig {
    const { [KEEP_RATIO]: keep, height, ...fields } = data;
    const next = mergeBackground(config, fields, NO_ASPECT_RATIO);
    const width = typeof fields.width === "number" && fields.width > 0 ? fields.width : config.width;
    if (keep === true) {
      const { height: _drop, ...kept } = { ...next, width };
      return kept as ImageElementConfig;
    }
    const chosen = typeof height === "number" && height > 0 ? height : freedHeight(config);
    return { ...next, width, height: chosen };
  },

  render(/* ctx */) {
    // See step 4.
  },
};
```

`mergeBackground` handles `PICTURE_ENTITY` and the camera branch; the remaining background/entity/filter keys ride through `sectionMerge` inside it, so nothing here re-implements them. `width` is read out explicitly because it is not a background key.

- [ ] **Step 4: Write the render, six sections**

Mirroring `state-icon-form.ts`'s render exactly — same `ha-expansion-panel` structure, same `.content` wrapper, same `PLACEMENT_ICON` — with these schemas:

| Panel | Icon | Schema |
| --- | --- | --- |
| Content | `mdi:image` | `backgroundSchema(hass.localize, element, { aspectRatio: false })` |
| Entity | `mdi:image-auto-adjust` | `entitySchema(hass.localize)` |
| Filters | `mdi:image-filter-black-white` | `filtersSchema(hass.localize)` |
| Size and position | `PLACEMENT_ICON` | the box fields below, then the `.separator`, then `<picture-studio-anchor-picker>` |
| Interactions | `mdi:gesture-tap` | `iconInteractionsSchema()` — the three action fields, shared verbatim |

The panel titles come from `localizeOwn(hass, "section_background" | "section_entity" | "section_filters" | "size_and_position")`; the first reads "Background" today, so **use a new `section_image` string** instead — "Image" / "Image" — added in step 6.

The box fields:

```ts
const boxSchema = (keepRatio: boolean): FormSchema => [
  { name: "width", selector: { number: { min: 1, mode: "box", step: 0.5, unit_of_measurement: "%" } } },
  { name: KEEP_RATIO, selector: { boolean: {} } },
  ...(keepRatio
    ? []
    : [
        {
          name: "height",
          selector: { number: { min: 1, mode: "box", step: 0.5, unit_of_measurement: "%" } },
        },
      ]),
];
```

- [ ] **Step 5: Register the kind**

`element-form.ts`: add `image: imageForm` to `FORMS`.
`element-catalog.ts`: `ELEMENT_KINDS = ["state-icon", "state-label", "image"] as const`, and in `stubElementConfig`:

```ts
  // No image: an image element with no source draws nothing at all, unlike a
  // state-icon, which gets HA's own missing-entity marker. The element's dashed
  // placeholder is what makes this state selectable and draggable.
  if (type === "image") return { type: "image", width: DEFAULT_IMAGE_WIDTH };
```

`icons.ts`: `"image": "mdi:image-outline"` in `ELEMENT_ICONS`.

- [ ] **Step 6: Add the strings, English and French**

In `src/strings.ts`, in both tables:

```ts
    section_image: "Image",
    keep_ratio: "Keep the image's proportions",
    keep_ratio_helper:
      "The height follows the picture. Clear it to set both dimensions and stretch the image.",
```

```ts
    section_image: "Image",
    keep_ratio: "Conserver les proportions de l'image",
    keep_ratio_helper:
      "La hauteur suit l'image. Décochez pour fixer les deux dimensions et étirer l'image.",
```

Then check `width` and `height` against `formLabel`'s three namespaces on the running instance before writing your own — Home Assistant may already have them, and a borrowed label is translated in every language.

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all clean, both lanes.

- [ ] **Step 8: Write the CHANGELOG and README entries**

`CHANGELOG.md`, under `## 1.6.0 — unreleased`, `### Added`:

```markdown
- A new item type, **Image**: a picture placed on the picture. It takes an image
  file, a different one for dark themes, a camera or an image entity, images that
  change with an entity's state, and CSS filters — the same choices the card's
  own background offers. You give it a width as a percentage of the background;
  its height either follows the picture's own proportions or is yours to set,
  which stretches it.
- Depth is the item list's order: an image placed above the icons in the list is
  drawn under them on the picture. Drag a row to change what covers what.
```

And a `Changed`-free note in `README.md`'s item table. Say the one thing a user would otherwise discover the hard way: **`aspect_ratio` is the single background setting an Image item does not take**, because it has a size of its own.

- [ ] **Step 9: Refresh the memory baseline**

`pnpm test` printed a `testFiles` count and a `passedTests` count for the **whole** suite. Update the recorded figure and its date in `mem:picture-studio/state` in the same breath — a baseline nobody refreshes reads as authoritative and is quietly wrong. Then update `mem:picture-studio/1.6.0-handoff` with what remains.

- [ ] **Step 10: Format and commit**

```bash
pnpm format
git add -A
git commit -m "feat(editor): the Image item, addable and editable

Six sections, four of them the card's own — Content, Entity, Filters — so
the vocabulary a user learned on the background is the vocabulary on an item.
aspect_ratio is the one that does not come across: an image item has a box of
its own, and hui-image would defeat it with its .ratio container.

The width, the keep-ratio checkbox and the height are scaffolding, and the
spec says so: sub-project 2 replaces them with handles. Clearing the checkbox
measures the height off the preview rather than inventing one, so the box
does not jump at the moment it is freed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Decisions 1 (Task 6, catalogue), 2 (Task 2), 3 (Task 1), 4 (Task 2, `fitMode`), 5 (Task 1, `imageBoxStyle`), 6 (Task 2, `darkModeImage` handed to `hui-image`), 7 (Task 3), 8 (Tasks 2 and 3), 9 (Task 2, placeholder), 10 (Task 6, `freedHeight`), 11 (Task 5), 12 (documented only — no code, correctly), 13 (Task 6, and stated in the commit), 14 (Task 1, the type comment), 15 (**not implemented** — see the gap below), 16 (out of scope, nothing to do).

**Gap found and accepted:** decision 15's hybrid-case warning — a dynamic background plus a distortion — has **no task**, because the distortion does not exist until sub-project 3. There is nothing to warn about yet. It stays in the spec's forward-compatibility contract and is not a plan omission. Recorded here so the next reader does not have to re-derive that.

**One interface this plan asks for and does not define:** `activeCard()?.measureImageHeight?.(config)` in Task 6 step 3. It is written optional-chained on purpose, and the fallback (`config.width`) is exercised by the test — so Task 6 is complete and green without it. Adding `measureImageHeight` to the card is a one-method follow-up that belongs with sub-project 2's handles, where the card already has to measure boxes. If the implementer wants it now, it reads `wrapper.getBoundingClientRect()` and the layer's, and returns the ratio as a percentage.

**Type consistency checked:** `ImageBox` is extended by `ImageElementConfig`, so `imageBoxStyle(item.config)` in Task 3 is structurally valid. `normalizeImageBox` returns `ImageBox` and is spread into the config in Task 1 step 8. `isImageClickable` is used in Tasks 2 and 3 under that one name. `KEEP_RATIO` and `PICTURE_ENTITY` are the only synthetic form fields and both are stripped in `fromFormData`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-image-element.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — tasks executed in this session, batched with checkpoints for review.
