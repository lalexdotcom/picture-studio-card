# Picture Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `custom:picture-badges`, a Lovelace card that renders an image with Home Assistant badges placed on it, positioned by dragging them on the live preview inside the card-edit dialog.

**Architecture:** Three units in one bundle. The **card** renders `hui-image` plus one wrapper per badge created by `createBadgeElement`. The **editor** owns the canonical config and delegates badge add/edit to Home Assistant's native badge dialogs. A module-scope **broker** carries drag results from card to editor; everything flowing back goes through Home Assistant (`config-changed` → `setConfig`). Positions are percentages with proportional anchoring, so a badge can never overflow the image.

**Tech Stack:** TypeScript, Lit (bundled), Rslib (build), Rstest (unit tests), Biome (lint/format), pnpm, Home Assistant in Docker via docker-in-docker.

**Spec:** [`docs/superpowers/specs/2026-08-11-picture-badges-design.md`](../specs/2026-08-11-picture-badges-design.md)

## Global Constraints

Every task's requirements implicitly include this section.

- Card type is `custom:picture-badges`. Custom element tags: `picture-badges` (card), `picture-badges-editor` (editor), `picture-badges-list` (list sub-component).
- Rslib: `format: "esm"`, `bundle: true`, **`autoExternal: false`**, `syntax: "es2022"`, `output.target: "web"`, single file at `dist/picture-badges.js`.
- Lit is **bundled**. Never read Lit off a Home Assistant prototype.
- **Do not** add `custom-card-helpers`. Declare the interfaces we need in `src/types.ts`.
- **Do not use TypeScript decorators.** Use Lit's `static properties = {...}`. This avoids depending on SWC decorator configuration entirely. (This supersedes the spec's §8 note about enabling decorators.)
- A badge config is **opaque**: never read, validate, or rewrite its contents.
- Positions are **numbers 0–100**, never strings. The `%` suffix and `transform: translate(...)` are derived at render time and **never stored**.
- No `z-index` anywhere. Stacking follows DOM order, which follows list order.
- Run `pnpm lint` after every modification (project rule in `AGENTS.md`).
- Code, comments, file contents: **English**. Chat with the user: **French**.
- Node engine floor from the toolchain: `^20.19.0 || >=22.12.0`. The devcontainer ships Node 24.

## Verified facts (do not re-verify)

These were confirmed against `home-assistant/frontend@dev` while writing the spec:

- `createBadgeElement(config)` routes `custom:` types through `_customCreate`, so any badge in `window.customBadges` renders with no code of ours. A missing one yields `hui-error-badge` with a 2 s grace period.
- `hui-image` properties are camelCase: `hass`, `entity`, `image`, `stateImage`, `cameraImage`, `cameraView`, `aspectRatio`, `filter`, `stateFilter`, `darkModeImage`, `darkModeFilter`, `fitMode`.
- `showCreateBadgeDialog` / `showEditBadgeDialog` are `fireEvent(el, "show-dialog", …)`. Both funnel into the caller's `saveConfig`, receiving a whole Lovelace config produced by `addBadge` (append) or `replaceBadge` (constant index).
- `ha-sortable` wraps SortableJS. Attributes `handle-selector`, `draggable-selector`, `filter`, `group`, `disabled`; events `item-moved` (`{oldIndex,newIndex}`), `item-added`, `item-removed`, `drag-start`, `drag-end`.

Where the spec's §10 verification tasks landed: **#1** (`hui-image` casing) is
settled above. **#2** and **#3** (the shim satisfying `findLovelaceContainer`,
and `show-dialog` reaching the dialog manager) are exercised in Task 6. **#4**
(`ha-sortable` defined) moves into Task 6's pre-flight. **#5** (`preview` in both
contexts) is exercised in Task 7. **#6** (does Home Assistant pass `lovelace` to
our editor) is **moot**: the native dialogs receive our own shim, so nothing we
do depends on it. The editor declares the property and ignores it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` | The handful of Home Assistant interfaces we declare ourselves |
| `src/position.ts` | px ↔ % conversion, clamping, style derivation — **pure, unit-tested** |
| `src/config.ts` | Config shape, defaults, normalisation, stub config |
| `src/broker.ts` | Editor registry and the card→editor channel |
| `src/card/picture-badges-card.ts` | `hui-image`, badge children, hass propagation, lifecycle |
| `src/card/drag-layer.ts` | Pointer capture, live pixel nudge, commit on release |
| `src/editor/native-dialogs.ts` | Lovelace shim construction and absorption — **pure, unit-tested** |
| `src/editor/background-schema.ts` | `ha-form` schema for the background section |
| `src/editor/badge-list.ts` | `ha-sortable` rows, add button |
| `src/editor/picture-badges-editor.ts` | Hub: `_commit` / `_reemit` / `_applying` |
| `src/index.ts` | Registration: `customElements.define`, `window.customCards` |

---

## Task 1: Toolchain and the positioning module

Sets up the whole build and test loop, then proves it end to end by driving out `position.ts` with tests. The setup is folded into this task because `position.ts` is what needs it.

**Files:**
- Create: `package.json`, `tsconfig.json`, `rslib.config.ts`, `rstest.config.ts`, `biome.json`, `.gitignore` (modify)
- Create: `src/position.ts`
- Test: `src/position.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Position { top: number; left: number }`
  - `const DEFAULT_POSITION: Position` — `{ top: 50, left: 50 }`
  - `clampPx(px: number, container: number, element: number): number`
  - `toPercent(px: number, container: number, element: number): number`
  - `positionStyle(p: Position): { top: string; left: string; transform: string }`

- [ ] **Step 1: Initialise the package and install dependencies**

```bash
cd /workspaces/ha-extra-picture-elements
pnpm init
pnpm pkg set name="picture-badges" version="0.1.0" type="module" private=true
pnpm pkg set description="Home Assistant Lovelace card: an image with badges you position by drag and drop"
pnpm add lit
pnpm add -D @rslib/core @rstest/core @biomejs/biome typescript
pnpm biome init
```

- [ ] **Step 2: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true,
    "useDefineForClassFields": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["src", "*.ts"]
}
```

`rslib.config.ts`:

```ts
import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: {
    entry: { "picture-badges": "./src/index.ts" },
  },
  lib: [
    {
      format: "esm",
      bundle: true,
      autoExternal: false,
      syntax: "es2022",
      dts: false,
    },
  ],
  output: {
    target: "web",
    distPath: { root: "dist" },
    cleanDistPath: false,
  },
});
```

`rstest.config.ts`:

```ts
import { defineConfig } from "@rstest/core";

export default defineConfig({
  include: ["src/**/*.test.ts"],
});
```

Append to `.gitignore`:

```
node_modules/
dist/
.ha/
```

- [ ] **Step 3: Add the scripts**

```bash
pnpm pkg set scripts.dev="rslib build --watch"
pnpm pkg set scripts.build="rslib build"
pnpm pkg set scripts.test="rstest run"
pnpm pkg set scripts.lint="biome check ."
pnpm pkg set scripts.format="biome check --write ."
```

- [ ] **Step 4: Write the failing test**

`src/position.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { DEFAULT_POSITION, clampPx, positionStyle, toPercent } from "./position";

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

describe("toPercent", () => {
  it("maps the left edge to 0", () => {
    expect(toPercent(0, 200, 40)).toBe(0);
  });

  it("maps the far edge to 100", () => {
    expect(toPercent(160, 200, 40)).toBe(100);
  });

  it("maps the midpoint of the free span to 50", () => {
    expect(toPercent(80, 200, 40)).toBe(50);
  });

  it("rounds to two decimals", () => {
    expect(toPercent(37, 200, 40)).toBe(23.13);
  });

  it("returns 0 when the element is as wide as the container", () => {
    expect(toPercent(0, 200, 200)).toBe(0);
  });

  it("never leaves the 0-100 range even for out-of-bounds input", () => {
    expect(toPercent(-50, 200, 40)).toBe(0);
    expect(toPercent(9999, 200, 40)).toBe(100);
  });
});

describe("positionStyle", () => {
  it("derives percentages and a proportional translate", () => {
    expect(positionStyle({ top: 30, left: 45 })).toEqual({
      top: "30%",
      left: "45%",
      transform: "translate(-45%, -30%)",
    });
  });

  it("anchors flush to the bottom-right at 100", () => {
    expect(positionStyle({ top: 100, left: 100 })).toEqual({
      top: "100%",
      left: "100%",
      transform: "translate(-100%, -100%)",
    });
  });
});

describe("DEFAULT_POSITION", () => {
  it("is the centre", () => {
    expect(DEFAULT_POSITION).toEqual({ top: 50, left: 50 });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./position`.

- [ ] **Step 6: Write the implementation**

`src/position.ts`:

```ts
/**
 * Positions use proportional anchoring, the semantics of CSS background-position:
 * 0 is flush with the top-left corner, 50 is centred, 100 is flush with the
 * bottom-right corner. This makes overflow structurally impossible at any
 * container size, with no runtime clamping.
 */
export interface Position {
  top: number;
  left: number;
}

export const DEFAULT_POSITION: Position = { top: 50, left: 50 };

/** The travel available to the element inside the container, never negative. */
const span = (container: number, element: number): number =>
  Math.max(0, container - element);

/** Clamp a pixel offset to the free span. */
export const clampPx = (px: number, container: number, element: number): number =>
  Math.min(Math.max(px, 0), span(container, element));

/**
 * Convert a pixel offset to a proportional percentage.
 * Degenerate case: an element as large as its container has nowhere to go.
 */
export const toPercent = (px: number, container: number, element: number): number => {
  const free = span(container, element);
  if (free === 0) return 0;
  const ratio = (100 * px) / free;
  return Math.round(Math.min(Math.max(ratio, 0), 100) * 100) / 100;
};

/** Derive the CSS. Never stored — always computed from the stored numbers. */
export const positionStyle = (
  p: Position,
): { top: string; left: string; transform: string } => ({
  top: `${p.top}%`,
  left: `${p.left}%`,
  transform: `translate(-${p.left}%, -${p.top}%)`,
});
```

- [ ] **Step 7: Run the tests and the linter**

Run: `pnpm test && pnpm lint`
Expected: all tests PASS, lint clean.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json rslib.config.ts rstest.config.ts biome.json .gitignore src/position.ts src/position.test.ts
git commit -m "feat: toolchain and proportional positioning module"
```

---

## Task 2: Bundle entry and the Home Assistant dev environment

Produces the first artefact that actually loads inside Home Assistant. The card is a placeholder here — the point of this task is to prove the whole loop (build → volume → Lovelace resource → browser) before any real logic depends on it.

**Files:**
- Create: `src/types.ts`, `src/index.ts`, `docker-compose.yml`, `README.md`
- Modify: `.devcontainer/devcontainer.json`, `package.json`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `src/types.ts`: `HomeAssistant`, `BadgeConfig`, `LovelaceCardEditor`, `CardHelpers`, and the `Window` augmentation for `loadCardHelpers` / `customCards` / `customBadges`
  - A loadable bundle at `dist/picture-badges.js` registering the `picture-badges` element

- [ ] **Step 1: Write the Home Assistant type declarations**

`src/types.ts`:

```ts
import type { HassEntity } from "home-assistant-js-websocket";

/** Only the slice of hass we actually touch. */
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  themes: { darkMode: boolean };
  language: string;
  locale: unknown;
  [key: string]: unknown;
}

/** A Lovelace badge config. Opaque: we never read or rewrite its contents. */
export interface BadgeConfig {
  type?: string;
  [key: string]: unknown;
}

/** The synthetic Lovelace config we hand to the native badge dialogs. */
export interface LovelaceShim {
  views: { badges: BadgeConfig[] }[];
  [key: string]: unknown;
}

export interface LovelaceBadgeElement extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: BadgeConfig): void;
}

export interface CardHelpers {
  createBadgeElement(config: BadgeConfig): LovelaceBadgeElement;
}

export interface CustomBadgeEntry {
  type: string;
  name?: string;
}

declare global {
  interface Window {
    loadCardHelpers(): Promise<CardHelpers>;
    customCards?: {
      type: string;
      name: string;
      description?: string;
      preview?: boolean;
      documentationURL?: string;
    }[];
    customBadges?: CustomBadgeEntry[];
  }
}
```

Then install the one type-only dependency:

```bash
pnpm add -D home-assistant-js-websocket
```

- [ ] **Step 2: Write the placeholder card and registration**

`src/index.ts`:

```ts
import { LitElement, css, html } from "lit";
import type { HomeAssistant } from "./types";

const CARD_TAG = "picture-badges";

class PictureBadgesCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: { type: string };

  setConfig(config: { type: string }): void {
    this._config = config;
  }

  getCardSize(): number {
    return 4;
  }

  render() {
    return html`<ha-card><p>picture-badges loaded</p></ha-card>`;
  }

  static styles = css`
    p {
      padding: 16px;
      margin: 0;
    }
  `;
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureBadgesCard);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Badges",
  description: "An image with badges you position by drag and drop.",
  preview: true,
});
```

- [ ] **Step 3: Write the Docker environment**

`docker-compose.yml`:

```yaml
services:
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    container_name: picture-badges-ha
    volumes:
      - ./.ha/config:/config
      - ./dist:/config/www/picture-badges:ro
    ports:
      - "8123:8123"
    restart: unless-stopped
```

Add the scripts. `ha:up` creates both directories first, so Docker does not create them root-owned:

```bash
pnpm pkg set scripts."ha:up"="mkdir -p dist .ha/config && docker compose up -d"
pnpm pkg set scripts."ha:down"="docker compose down"
pnpm pkg set scripts."ha:logs"="docker compose logs -f homeassistant"
```

- [ ] **Step 4: Forward the Home Assistant port**

In `.devcontainer/devcontainer.json`, add a top-level key next to `"mounts"`:

```json
	"forwardPorts": [8123],
```

VS Code picks this up on reload; no container rebuild is needed. If the port is not forwarded, forward 8123 manually from the Ports panel.

- [ ] **Step 5: Build and start Home Assistant**

```bash
pnpm build
pnpm run ha:up
pnpm run ha:logs   # wait for "Home Assistant initialized", then Ctrl-C
```

Expected: `dist/picture-badges.js` exists; Home Assistant answers on http://localhost:8123.

- [ ] **Step 6: Complete onboarding and register the resource**

This is manual and happens once; the `.ha/config` volume persists it.

1. Open http://localhost:8123 and create the account.
2. Go to Settings → Dashboards → ⋮ → Resources → Add resource.
3. URL: `/local/picture-badges/picture-badges.js?v=1` — Type: JavaScript module.
4. Reload the page.

- [ ] **Step 7: Verify the card loads**

1. Open a dashboard, enter edit mode, click Add card.
2. Search for "Picture Badges" — it must appear in the list with a preview.
3. Add it. The card must show "picture-badges loaded".

Expected: the card appears in the picker and renders. If it does not, check the browser console for a module load error, and bump `?v=` if a stale bundle is cached.

- [ ] **Step 8: Write the README**

`README.md` must cover: what the card does, install via HACS (placeholder section, filled in Task 8), and a "Development" section documenting `pnpm dev`, `pnpm run ha:up`, the resource URL, the `?v=` cache trick, and that onboarding is a one-time manual step.

- [ ] **Step 9: Commit**

```bash
pnpm lint
git add src/types.ts src/index.ts docker-compose.yml README.md package.json pnpm-lock.yaml .devcontainer/devcontainer.json .gitignore
git commit -m "feat: bundle entry and local Home Assistant dev environment"
```

---

## Task 3: Config shape and normalisation

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Interfaces:**
- Consumes: `Position`, `DEFAULT_POSITION` from `src/position.ts`; `BadgeConfig` from `src/types.ts`
- Produces:
  - `const CARD_TAG = "picture-badges"`, `const EDITOR_TAG = "picture-badges-editor"`, `const LIST_TAG = "picture-badges-list"`, `const CARD_TYPE = "custom:picture-badges"`
  - `interface PictureBadgeItem { badge: BadgeConfig; position: Position }`
  - `interface PictureBadgesConfig` with `type`, the `hui-image` passthrough keys, and `badges: PictureBadgeItem[]`
  - `normaliseConfig(raw: unknown): PictureBadgesConfig` — throws on invalid input
  - `stubConfig(): PictureBadgesConfig`

- [ ] **Step 1: Write the failing test**

`src/config.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { CARD_TYPE, normaliseConfig, stubConfig } from "./config";

describe("normaliseConfig", () => {
  it("keeps a well-formed config intact", () => {
    const raw = {
      type: CARD_TYPE,
      image: "/local/plan.png",
      badges: [{ badge: { type: "entity", entity: "light.a" }, position: { top: 30, left: 45 } }],
    };
    expect(normaliseConfig(raw)).toEqual(raw);
  });

  it("defaults a missing badges list to empty", () => {
    expect(normaliseConfig({ type: CARD_TYPE, image: "/local/plan.png" }).badges).toEqual([]);
  });

  it("centres an item with no position", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      badges: [{ badge: { type: "entity", entity: "light.a" } }],
    });
    expect(out.badges[0]?.position).toEqual({ top: 50, left: 50 });
  });

  it("passes hui-image keys through untouched", () => {
    const out = normaliseConfig({
      type: CARD_TYPE,
      camera_image: "camera.front",
      camera_view: "live",
      aspect_ratio: "16:9",
      fit_mode: "contain",
      filter: "blur(2px)",
      dark_mode_image: "/local/night.png",
      state_image: { on: "/local/on.png" },
      badges: [],
    });
    expect(out.camera_image).toBe("camera.front");
    expect(out.camera_view).toBe("live");
    expect(out.aspect_ratio).toBe("16:9");
    expect(out.fit_mode).toBe("contain");
    expect(out.filter).toBe("blur(2px)");
    expect(out.dark_mode_image).toBe("/local/night.png");
    expect(out.state_image).toEqual({ on: "/local/on.png" });
  });

  it("never mutates the input", () => {
    const raw = { type: CARD_TYPE, badges: [{ badge: { type: "entity" } }] };
    const snapshot = JSON.parse(JSON.stringify(raw));
    normaliseConfig(raw);
    expect(raw).toEqual(snapshot);
  });

  it("rejects a non-object config", () => {
    expect(() => normaliseConfig(null)).toThrow();
    expect(() => normaliseConfig("nope")).toThrow();
  });

  it("rejects a badges value that is not an array", () => {
    expect(() => normaliseConfig({ type: CARD_TYPE, badges: {} })).toThrow();
  });

  it("rejects an item whose badge is missing", () => {
    expect(() => normaliseConfig({ type: CARD_TYPE, badges: [{ position: { top: 1, left: 2 } }] }))
      .toThrow();
  });
});

describe("stubConfig", () => {
  it("has the card type and an empty badge list", () => {
    const stub = stubConfig();
    expect(stub.type).toBe(CARD_TYPE);
    expect(stub.badges).toEqual([]);
  });

  it("has an image so the gallery preview is not an empty frame", () => {
    expect(stubConfig().image).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Write the implementation**

`src/config.ts`:

```ts
import { DEFAULT_POSITION, type Position } from "./position";
import type { BadgeConfig } from "./types";

export const CARD_TAG = "picture-badges";
export const EDITOR_TAG = "picture-badges-editor";
export const LIST_TAG = "picture-badges-list";
export const CARD_TYPE = "custom:picture-badges";

/** One placed badge: opaque content plus the position we own. */
export interface PictureBadgeItem {
  badge: BadgeConfig;
  position: Position;
}

export interface PictureBadgesConfig {
  type: string;
  /** hui-image passthrough, snake_case as it appears in YAML. */
  image?: string;
  camera_image?: string;
  camera_view?: "auto" | "live";
  state_image?: Record<string, string>;
  dark_mode_image?: string;
  aspect_ratio?: string;
  filter?: string;
  fit_mode?: "cover" | "contain" | "fill";
  badges: PictureBadgeItem[];
}

const STUB_IMAGE = "https://demo.home-assistant.io/stub_config/floorplan.png";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalisePosition = (raw: unknown): Position => {
  if (!isRecord(raw)) return { ...DEFAULT_POSITION };
  const top = typeof raw.top === "number" ? raw.top : DEFAULT_POSITION.top;
  const left = typeof raw.left === "number" ? raw.left : DEFAULT_POSITION.left;
  return { top, left };
};

/**
 * Validate and fill in defaults. Returns a fresh object: the config handed to
 * setConfig is frozen by Home Assistant and must never be mutated.
 */
export const normaliseConfig = (raw: unknown): PictureBadgesConfig => {
  if (!isRecord(raw)) {
    throw new Error("picture-badges: config must be an object");
  }
  const rawBadges = raw.badges ?? [];
  if (!Array.isArray(rawBadges)) {
    throw new Error("picture-badges: `badges` must be a list");
  }

  const badges = rawBadges.map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.badge)) {
      throw new Error(`picture-badges: badges[${index}] must have a \`badge\` object`);
    }
    return {
      badge: entry.badge as BadgeConfig,
      position: normalisePosition(entry.position),
    };
  });

  return { ...(raw as Omit<PictureBadgesConfig, "badges">), badges };
};

export const stubConfig = (): PictureBadgesConfig => ({
  type: CARD_TYPE,
  image: STUB_IMAGE,
  badges: [],
});
```

- [ ] **Step 4: Run the tests and the linter**

Run: `pnpm test && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: config shape, normalisation and stub"
```

---

## Task 4: Card rendering

Replaces the placeholder from Task 2 with the real card: `hui-image` background, one wrapper per badge, hass propagation, and a lifecycle that does not rebuild children needlessly.

**Files:**
- Create: `src/card/picture-badges-card.ts`
- Modify: `src/index.ts` (drop the placeholder class, import and register the real one)

**Interfaces:**
- Consumes: `normaliseConfig`, `stubConfig`, `CARD_TAG`, `PictureBadgesConfig`, `PictureBadgeItem` from `src/config.ts`; `positionStyle` from `src/position.ts`; `HomeAssistant`, `LovelaceBadgeElement` from `src/types.ts`
- Produces:
  - `class PictureBadgesCard extends LitElement` with public `hass`, `preview`, `setConfig`, `getCardSize`
  - Protected surface later tasks use: `editing: boolean` property, and a `.layer` element holding one `.item` wrapper per badge with `data-index`

- [ ] **Step 1: Write the card**

`src/card/picture-badges-card.ts`:

```ts
import { LitElement, css, html, nothing } from "lit";
import {
  type PictureBadgeItem,
  type PictureBadgesConfig,
  normaliseConfig,
  stubConfig,
} from "../config";
import { positionStyle } from "../position";
import type { HomeAssistant, LovelaceBadgeElement } from "../types";

export class PictureBadgesCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    editing: { type: Boolean },
    _config: { state: true },
  };

  declare preview: boolean;
  declare editing: boolean;
  declare _config?: PictureBadgesConfig;

  private _hass?: HomeAssistant;
  private _elements: LovelaceBadgeElement[] = [];
  private _wrappers: HTMLElement[] = [];
  private _renderedTypes: string[] = [];

  constructor() {
    super();
    this.preview = false;
    this.editing = false;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    for (const el of this._elements) {
      el.hass = hass;
    }
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  static getStubConfig(): PictureBadgesConfig {
    return stubConfig();
  }

  /** Must be idempotent: Home Assistant reuses the preview instance. */
  setConfig(config: unknown): void {
    this._config = normaliseConfig(config);
  }

  getCardSize(): number {
    return 4;
  }

  protected updated(): void {
    this._syncBadges();
  }

  private get _layer(): HTMLElement | null {
    return this.renderRoot.querySelector(".layer");
  }

  /**
   * Rebuild children only when the list of badge types changed; otherwise push
   * the new config into the instances in place. This is what lets an in-flight
   * drag survive a config round-trip.
   */
  private async _syncBadges(): Promise<void> {
    const layer = this._layer;
    const items = this._config?.badges ?? [];
    if (!layer) return;

    const types = items.map((item) => String(item.badge.type ?? ""));
    const sameShape =
      types.length === this._renderedTypes.length &&
      types.every((t, i) => t === this._renderedTypes[i]);

    if (!sameShape) {
      const helpers = await window.loadCardHelpers();
      layer.replaceChildren();
      this._elements = [];
      this._wrappers = [];

      items.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "item";
        wrapper.dataset.index = String(index);

        const badge = helpers.createBadgeElement(item.badge);
        if (this._hass) badge.hass = this._hass;
        wrapper.append(badge);
        layer.append(wrapper);

        this._elements.push(badge);
        this._wrappers.push(wrapper);
      });
      this._renderedTypes = types;
    } else {
      items.forEach((item, index) => {
        const badge = this._elements[index];
        if (!badge) return;
        badge.setConfig(item.badge);
        if (this._hass) badge.hass = this._hass;
      });
    }

    this._applyPositions(items);
  }

  private _applyPositions(items: PictureBadgeItem[]): void {
    items.forEach((item, index) => {
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      const style = positionStyle(item.position);
      wrapper.style.top = style.top;
      wrapper.style.left = style.left;
      wrapper.style.transform = style.transform;
    });
  }

  protected render() {
    const config = this._config;
    if (!config) return nothing;

    return html`
      <ha-card>
        <div class="root ${this.editing ? "editing" : ""}">
          <hui-image
            .hass=${this._hass}
            .image=${config.image}
            .cameraImage=${config.camera_image}
            .cameraView=${config.camera_view}
            .stateImage=${config.state_image}
            .darkModeImage=${config.dark_mode_image}
            .aspectRatio=${config.aspect_ratio}
            .filter=${config.filter}
            .fitMode=${config.fit_mode}
          ></hui-image>
          <div class="layer"></div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }
    /* .root holds only hui-image in normal flow, so the drag surface matches
       the image's aspect ratio exactly. */
    .root {
      position: relative;
    }
    hui-image {
      display: block;
      width: 100%;
    }
    /* The layer is transparent to pointers; only the wrappers catch them, so
       the image stays clickable between badges. */
    .layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .item {
      position: absolute;
      pointer-events: auto;
    }
    /* While editing, the wrapper keeps the pointer and the badge never sees a
       click, so tapping a badge cannot toggle a light. */
    .editing .item {
      cursor: grab;
      touch-action: none;
    }
    .editing .item > * {
      pointer-events: none;
    }
  `;
}
```

- [ ] **Step 2: Register it from the entry point**

Replace the placeholder class in `src/index.ts` with:

```ts
import { PictureBadgesCard } from "./card/picture-badges-card";
import { CARD_TAG } from "./config";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, PictureBadgesCard);
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Picture Badges",
  description: "An image with badges you position by drag and drop.",
  preview: true,
});
```

- [ ] **Step 3: Verify in Home Assistant**

Run: `pnpm build`, then reload the dashboard (bump `?v=` on the resource if the bundle is cached).

Edit the card in YAML mode and paste:

```yaml
type: custom:picture-badges
image: https://demo.home-assistant.io/stub_config/floorplan.png
badges:
  - badge:
      type: entity
      entity: sun.sun
    position:
      top: 20
      left: 20
  - badge:
      type: entity
      entity: sun.sun
    position:
      top: 100
      left: 100
```

Expected:
- the floorplan renders and the card has no horizontal scrollbar;
- the first badge sits near the top-left, the second is **flush inside** the bottom-right corner with nothing clipped;
- clicking a badge opens more-info (editing is off);
- resizing the browser keeps both badges inside the image.

- [ ] **Step 4: Commit**

```bash
pnpm lint
git add src/card/picture-badges-card.ts src/index.ts
git commit -m "feat: render hui-image background and positioned badges"
```

---

## Task 5: Broker and editor hub

The editor becomes the config authority. Badge management comes in Task 6; this task delivers the background form, the config circulation loop, and the broker the drag layer will use.

**Files:**
- Create: `src/broker.ts`, `src/editor/background-schema.ts`, `src/editor/picture-badges-editor.ts`
- Test: `src/broker.test.ts`
- Modify: `src/index.ts` (register the editor tag), `src/card/picture-badges-card.ts` (add `getConfigElement`)

**Interfaces:**
- Consumes: `PictureBadgesConfig`, `normaliseConfig`, `EDITOR_TAG`, `CARD_TYPE` from `src/config.ts`; `Position` from `src/position.ts`
- Produces:
  - `interface EditorChannel { patchPosition(index: number, position: Position): void }`
  - `registerEditor(channel: EditorChannel): () => void`
  - `activeEditor(): EditorChannel | undefined`
  - `class PictureBadgesEditor extends LitElement implements EditorChannel` with `hass`, `setConfig`, and the protected `_commit(next: PictureBadgesConfig): void`
  - `BACKGROUND_SCHEMA`, `backgroundData(config)`, `mergeBackground(config, data)`

- [ ] **Step 1: Write the failing broker test**

`src/broker.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import { activeEditor, registerEditor } from "./broker";

const channel = () => ({ patchPosition: () => undefined });

describe("broker", () => {
  it("has no active editor when none is registered", () => {
    expect(activeEditor()).toBeUndefined();
  });

  it("returns the sole registered editor", () => {
    const ch = channel();
    const off = registerEditor(ch);
    expect(activeEditor()).toBe(ch);
    off();
  });

  it("returns undefined once the editor unregisters", () => {
    const off = registerEditor(channel());
    off();
    expect(activeEditor()).toBeUndefined();
  });

  it("returns undefined when several editors are registered, rather than guessing", () => {
    const offA = registerEditor(channel());
    const offB = registerEditor(channel());
    expect(activeEditor()).toBeUndefined();
    offA();
    offB();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./broker`.

- [ ] **Step 3: Write the broker**

`src/broker.ts`:

```ts
import type { Position } from "./position";

/** The single card → editor hop. Everything coming back goes through Home Assistant. */
export interface EditorChannel {
  patchPosition(index: number, position: Position): void;
}

const editors = new Set<EditorChannel>();

export const registerEditor = (channel: EditorChannel): (() => void) => {
  editors.add(channel);
  return () => {
    editors.delete(channel);
  };
};

/**
 * The active editor, if exactly one is mounted.
 *
 * This also discriminates the card-picker gallery from the edit dialog: Home
 * Assistant sets `preview` in both, but only the dialog mounts an editor, so the
 * drag layer stays inert in the gallery with no extra signal.
 */
export const activeEditor = (): EditorChannel | undefined =>
  editors.size === 1 ? [...editors][0] : undefined;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Write the background form schema**

`src/editor/background-schema.ts`:

```ts
import type { PictureBadgesConfig } from "../config";

/** Rewritten by hand: picture-entity's schema is a private constant, not retrievable. */
export const BACKGROUND_SCHEMA = [
  { name: "image", selector: { text: {} } },
  { name: "camera_image", selector: { entity: { filter: { domain: "camera" } } } },
  {
    name: "camera_view",
    selector: { select: { options: ["auto", "live"], mode: "dropdown" } },
  },
  { name: "aspect_ratio", selector: { text: {} } },
  {
    name: "fit_mode",
    selector: { select: { options: ["cover", "contain", "fill"], mode: "dropdown" } },
  },
] as const;

export type BackgroundData = Pick<
  PictureBadgesConfig,
  "image" | "camera_image" | "camera_view" | "aspect_ratio" | "fit_mode"
>;

export const backgroundData = (config: PictureBadgesConfig): BackgroundData => ({
  image: config.image,
  camera_image: config.camera_image,
  camera_view: config.camera_view,
  aspect_ratio: config.aspect_ratio,
  fit_mode: config.fit_mode,
});

/** Keys the form leaves empty are dropped, so they do not linger in the YAML. */
export const mergeBackground = (
  config: PictureBadgesConfig,
  data: BackgroundData,
): PictureBadgesConfig => {
  const next: PictureBadgesConfig = { ...config, ...data };
  for (const key of ["image", "camera_image", "camera_view", "aspect_ratio", "fit_mode"] as const) {
    if (next[key] === undefined || next[key] === "") delete next[key];
  }
  return next;
};
```

- [ ] **Step 6: Write the editor hub**

`src/editor/picture-badges-editor.ts`:

```ts
import { LitElement, html, nothing } from "lit";
import { type EditorChannel, registerEditor } from "../broker";
import { CARD_TYPE, type PictureBadgesConfig, normaliseConfig } from "../config";
import type { Position } from "../position";
import type { HomeAssistant } from "../types";
import {
  BACKGROUND_SCHEMA,
  type BackgroundData,
  backgroundData,
  mergeBackground,
} from "./background-schema";

export class PictureBadgesEditor extends LitElement implements EditorChannel {
  static properties = {
    hass: { attribute: false },
    lovelace: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare lovelace?: unknown;
  declare _config?: PictureBadgesConfig;

  private _unregister?: () => void;
  /** Guards against a native child's config-changed echoing our own push. */
  private _applying = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._unregister = registerEditor(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unregister?.();
    this._unregister = undefined;
  }

  setConfig(config: unknown): void {
    this._config = normaliseConfig(config);
  }

  /** The single card → editor entry point. */
  patchPosition(index: number, position: Position): void {
    const config = this._config;
    if (!config) return;
    const badges = config.badges.map((item, i) => (i === index ? { ...item, position } : item));
    this._commit({ ...config, badges });
  }

  /** Convergence point: drag, dialogs and forms all end here. */
  protected _commit(next: PictureBadgesConfig): void {
    this._config = next;
    this._reemit(next);
  }

  /** Sole exit toward Home Assistant. */
  private _reemit(config: PictureBadgesConfig): void {
    if (this._applying) return;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: { ...config, type: CARD_TYPE } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _backgroundChanged = (ev: CustomEvent<{ value: BackgroundData }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    this._commit(mergeBackground(this._config, ev.detail.value));
  };

  protected render() {
    const config = this._config;
    if (!config || !this.hass) return nothing;

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${backgroundData(config)}
        .schema=${BACKGROUND_SCHEMA}
        .computeLabel=${(s: { name: string }) => s.name.replace(/_/g, " ")}
        @value-changed=${this._backgroundChanged}
      ></ha-form>
    `;
  }
}
```

- [ ] **Step 7: Wire the editor to the card and register it**

In `src/card/picture-badges-card.ts`, add to the class:

```ts
  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TAG);
  }
```

Do **not** make this an `async` method that awaits `import("../editor/picture-badges-editor")`. `src/index.ts` already imports the editor statically in order to register it, so the element is defined before any card instance exists and the dynamic import buys nothing — but it does make rspack split the bundle, leaving `picture-badges.js` with a static `import … from "./612.js"`. Since releases ship only `picture-badges.js`, that chunk would be missing and the module would die at its first line, taking the card down with it, not just the editor.

and extend its config import to include `EDITOR_TAG`: `import { EDITOR_TAG, normaliseConfig, stubConfig, ... } from "../config";`. The card does not need `CARD_TAG` — registration lives in `src/index.ts`.

In `src/index.ts`, add:

```ts
import { PictureBadgesEditor } from "./editor/picture-badges-editor";
import { EDITOR_TAG } from "./config";

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, PictureBadgesEditor);
}
```

- [ ] **Step 8: Verify in Home Assistant**

Run: `pnpm build`, reload, edit the card.

Expected:
- the visual editor opens with the background fields instead of raw YAML;
- typing an image path updates the preview live;
- clearing a field removes the key from the YAML tab rather than leaving `image: ""`;
- no infinite loop, no console error.

- [ ] **Step 9: Commit**

```bash
pnpm lint && pnpm test
git add src/broker.ts src/broker.test.ts src/editor/background-schema.ts src/editor/picture-badges-editor.ts src/card/picture-badges-card.ts src/index.ts
git commit -m "feat: editor hub, broker and background form"
```

---

## Task 6: Badge list with the native dialogs

**Files:**
- Create: `src/editor/native-dialogs.ts`, `src/editor/badge-list.ts`
- Test: `src/editor/native-dialogs.test.ts`
- Modify: `src/editor/picture-badges-editor.ts`, `src/index.ts`

**Interfaces:**
- Consumes: `PictureBadgeItem` from `src/config.ts`; `BadgeConfig`, `LovelaceShim` from `src/types.ts`; `DEFAULT_POSITION` from `src/position.ts`
- Produces:
  - `buildShim(items: PictureBadgeItem[]): LovelaceShim`
  - `absorb(previous: PictureBadgeItem[], next: BadgeConfig[]): PictureBadgeItem[]`
  - `moveItem(items: PictureBadgeItem[], from: number, to: number): PictureBadgeItem[]`
  - `removeItem(items: PictureBadgeItem[], index: number): PictureBadgeItem[]`
  - `showCreateBadgeDialog(el: HTMLElement, params)`, `showEditBadgeDialog(el: HTMLElement, params)`
  - `class PictureBadgesList extends LitElement` — property `.items`, `.hass`; events `item-moved` (`{oldIndex,newIndex}`), `item-removed` (`{index}`), `item-edit` (`{index}`), `item-add`

- [ ] **Pre-flight: confirm the native badge dialogs are reachable**

This is the one real risk in the plan, and it is cheap to settle before writing
code. `showCreateBadgeDialog` normally ships a `dialogImport` pointing at an
internal module we cannot import. We rely on the dialog element already being
registered, so check whether it is.

With a dashboard in edit mode, run in the browser console:

```js
[...document.querySelectorAll("*")], // force nothing; just inspect the registry
console.log(
  !!customElements.get("hui-dialog-create-badge"),
  !!customElements.get("hui-dialog-edit-badge"),
  !!customElements.get("ha-sortable"),
);
```

Check it twice: once right after a fresh page load with the card-edit dialog
open, and once after adding a badge to a view through the native UI.

- **Both true on a fresh load** → proceed as written.
- **Only true after using the native badge UI** → the chunk is lazy. Add a
  warm-up in the editor's `firstUpdated`: fire `show-dialog` for
  `hui-dialog-create-badge` once and close it immediately, or gate the "Add
  badge" button behind `customElements.whenDefined` with a 2 s timeout and a
  clear message. Record which was chosen in the README.
- **Never true** → stop and report. The fallback is an `object` selector in
  `ha-form` for badge configs, which loses the native picker and is a separate
  design decision, not a silent substitution.

- [ ] **Step 1: Write the failing test**

`src/editor/native-dialogs.test.ts`:

```ts
import { describe, expect, it } from "@rstest/core";
import type { PictureBadgeItem } from "../config";
import { absorb, buildShim, moveItem, removeItem } from "./native-dialogs";

const item = (entity: string, top: number, left: number): PictureBadgeItem => ({
  badge: { type: "entity", entity },
  position: { top, left },
});

describe("buildShim", () => {
  it("exposes bare badge configs under a single view", () => {
    const shim = buildShim([item("light.a", 10, 20), item("light.b", 30, 40)]);
    expect(shim.views).toHaveLength(1);
    expect(shim.views[0]?.badges).toEqual([
      { type: "entity", entity: "light.a" },
      { type: "entity", entity: "light.b" },
    ]);
  });

  it("hides positions from the native dialogs entirely", () => {
    expect(JSON.stringify(buildShim([item("light.a", 10, 20)]))).not.toContain("position");
  });
});

describe("absorb", () => {
  it("keeps positions when a badge is replaced at a constant index", () => {
    const previous = [item("light.a", 10, 20), item("light.b", 30, 40)];
    const out = absorb(previous, [
      { type: "entity", entity: "light.a" },
      { type: "entity", entity: "light.CHANGED" },
    ]);
    expect(out[1]?.badge).toEqual({ type: "entity", entity: "light.CHANGED" });
    expect(out[1]?.position).toEqual({ top: 30, left: 40 });
    expect(out[0]?.position).toEqual({ top: 10, left: 20 });
  });

  it("centres a badge appended by the picker", () => {
    const out = absorb([item("light.a", 10, 20)], [
      { type: "entity", entity: "light.a" },
      { type: "custom:mushroom-template-badge", entity: "light.b" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]?.position).toEqual({ top: 50, left: 50 });
  });

  it("passes a custom badge config through untouched", () => {
    const custom = { type: "custom:mushroom-template-badge", content: "{{ x }}", nested: { a: 1 } };
    const out = absorb([], [custom]);
    expect(out[0]?.badge).toEqual(custom);
  });

  it("returns an empty list for an empty result", () => {
    expect(absorb([item("light.a", 10, 20)], [])).toEqual([]);
  });
});

describe("moveItem", () => {
  it("moves a pair as a unit, so reordering never disturbs positions", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20), item("light.c", 30, 30)];
    const out = moveItem(items, 0, 2);
    expect(out.map((i) => i.badge.entity)).toEqual(["light.b", "light.c", "light.a"]);
    expect(out[2]).toEqual(items[0]);
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const items = [item("light.a", 10, 10)];
    expect(moveItem(items, 0, 5)).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20)];
    moveItem(items, 0, 1);
    expect(items.map((i) => i.badge.entity)).toEqual(["light.a", "light.b"]);
  });
});

describe("removeItem", () => {
  it("drops the pair at the index", () => {
    const items = [item("light.a", 10, 10), item("light.b", 20, 20)];
    expect(removeItem(items, 0)).toEqual([items[1]]);
  });

  it("does not mutate the input", () => {
    const items = [item("light.a", 10, 10)];
    removeItem(items, 0);
    expect(items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./native-dialogs`.

- [ ] **Step 3: Write the implementation**

`src/editor/native-dialogs.ts`:

```ts
import type { PictureBadgeItem } from "../config";
import { DEFAULT_POSITION } from "../position";
import type { BadgeConfig, LovelaceShim } from "../types";

/**
 * The native badge dialogs think in whole Lovelace configs at a view path. We
 * hand them a synthetic one holding only our badges, and read the result back.
 * Positions never enter the shim, so the native form cannot see or damage them.
 */
export const buildShim = (items: PictureBadgeItem[]): LovelaceShim => ({
  views: [{ badges: items.map((item) => item.badge) }],
});

/**
 * Re-pair badges with positions after a dialog wrote back.
 *
 * Index alignment is safe because the only mutations Home Assistant applies are
 * addBadge (appends) and replaceBadge (constant index). Delete and reorder never
 * take this path — they are ours, see moveItem and removeItem.
 */
export const absorb = (
  previous: PictureBadgeItem[],
  next: BadgeConfig[],
): PictureBadgeItem[] =>
  next.map((badge, index) => ({
    badge,
    position: previous[index]?.position ?? { ...DEFAULT_POSITION },
  }));

export const moveItem = (
  items: PictureBadgeItem[],
  from: number,
  to: number,
): PictureBadgeItem[] => {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const out = [...items];
  const [moved] = out.splice(from, 1);
  if (moved) out.splice(to, 0, moved);
  return out;
};

export const removeItem = (items: PictureBadgeItem[], index: number): PictureBadgeItem[] =>
  items.filter((_, i) => i !== index);

interface BadgeDialogParams {
  lovelaceConfig: LovelaceShim;
  saveConfig: (config: LovelaceShim) => void;
  path: [number];
}

const showDialog = (element: HTMLElement, dialogTag: string, dialogParams: unknown): void => {
  element.dispatchEvent(
    new CustomEvent("show-dialog", {
      detail: { dialogTag, dialogImport: undefined, dialogParams },
      bubbles: true,
      composed: true,
    }),
  );
};

export const showCreateBadgeDialog = (element: HTMLElement, params: BadgeDialogParams): void =>
  showDialog(element, "hui-dialog-create-badge", params);

export const showEditBadgeDialog = (
  element: HTMLElement,
  params: BadgeDialogParams & { badgeIndex: number },
): void => showDialog(element, "hui-dialog-edit-badge", params);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Write the list component**

`src/editor/badge-list.ts`:

```ts
import { LitElement, css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PictureBadgeItem } from "../config";
import type { HomeAssistant } from "../types";

const label = (item: PictureBadgeItem): string => {
  const badge = item.badge as { entity?: string; type?: string; name?: string };
  return badge.name ?? badge.entity ?? badge.type ?? "badge";
};

export class PictureBadgesList extends LitElement {
  static properties = {
    hass: { attribute: false },
    items: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare items: PictureBadgeItem[];

  constructor() {
    super();
    this.items = [];
  }

  private _fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  protected render() {
    return html`
      <p class="hint">Lower in the list is drawn on top.</p>
      <ha-sortable
        handle-selector=".handle"
        @item-moved=${(ev: CustomEvent<{ oldIndex: number; newIndex: number }>) => {
          ev.stopPropagation();
          this._fire("item-moved", ev.detail);
        }}
      >
        <div class="rows">
          ${repeat(
            this.items,
            (_item, index) => index,
            (item, index) => html`
              <div class="row">
                <div class="handle">
                  <ha-svg-icon .path=${"M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z"}></ha-svg-icon>
                </div>
                <span class="label">${label(item)}</span>
                <ha-icon-button
                  .label=${"Edit"}
                  .path=${"M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"}
                  @click=${() => this._fire("item-edit", { index })}
                ></ha-icon-button>
                <ha-icon-button
                  .label=${"Delete"}
                  .path=${"M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"}
                  @click=${() => this._fire("item-removed", { index })}
                ></ha-icon-button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
      <ha-button @click=${() => this._fire("item-add")}>Add badge</ha-button>
    `;
  }

  static styles = css`
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin: 8px 0;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .handle {
      cursor: grab;
      display: flex;
      color: var(--secondary-text-color);
    }
    .label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}
```

- [ ] **Step 6: Wire the list into the editor**

In `src/editor/picture-badges-editor.ts`, add the imports:

```ts
import { LIST_TAG } from "../config";
import {
  absorb,
  buildShim,
  moveItem,
  removeItem,
  showCreateBadgeDialog,
  showEditBadgeDialog,
} from "./native-dialogs";
import "./badge-list";
```

Add these handlers to the class:

```ts
  /** Both dialogs hand back a whole Lovelace config; keep only the badges. */
  private _absorb = (next: { views: { badges?: unknown[] }[] }): void => {
    const config = this._config;
    if (!config) return;
    const badges = (next.views[0]?.badges ?? []) as BadgeConfig[];
    this._commit({ ...config, badges: absorb(config.badges, badges) });
  };

  private _dialogParams() {
    return {
      lovelaceConfig: buildShim(this._config?.badges ?? []),
      saveConfig: this._absorb,
      path: [0] as [number],
    };
  }

  private _addBadge = (): void => {
    showCreateBadgeDialog(this, this._dialogParams());
  };

  private _editBadge = (ev: CustomEvent<{ index: number }>): void => {
    showEditBadgeDialog(this, { ...this._dialogParams(), badgeIndex: ev.detail.index });
  };

  private _moveBadge = (ev: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    const config = this._config;
    if (!config) return;
    this._commit({
      ...config,
      badges: moveItem(config.badges, ev.detail.oldIndex, ev.detail.newIndex),
    });
  };

  private _removeBadge = (ev: CustomEvent<{ index: number }>): void => {
    const config = this._config;
    if (!config) return;
    this._commit({ ...config, badges: removeItem(config.badges, ev.detail.index) });
  };
```

Import `BadgeConfig` from `../types`, and extend `render()` so the list follows the form:

```ts
      <picture-badges-list
        .hass=${this.hass}
        .items=${config.badges}
        @item-add=${this._addBadge}
        @item-edit=${this._editBadge}
        @item-moved=${this._moveBadge}
        @item-removed=${this._removeBadge}
      ></picture-badges-list>
```

Use the `LIST_TAG` constant in the registration, not the literal, in `src/index.ts`:

```ts
import { PictureBadgesList } from "./editor/badge-list";
import { LIST_TAG } from "./config";

if (!customElements.get(LIST_TAG)) {
  customElements.define(LIST_TAG, PictureBadgesList);
}
```

- [ ] **Step 7: Verify in Home Assistant**

Run: `pnpm build`, reload, edit the card.

Expected:
- "Add badge" opens the **native** badge picker, including a "Custom" section if any custom-badge library is installed;
- picking a badge opens its native form; saving adds it **centred** on the image;
- the pencil reopens the native form for that badge and saving keeps its position;
- the trash removes the right row;
- dragging a row by its handle reorders the list, and a row moved lower is drawn **on top** on the preview, with every position unchanged;
- a "Saved" toast appears when a dialog closes. This is the known, accepted verruca — not a bug.

If the picker does not open, check the console: this exercises verification tasks 2 and 3 from the spec (the shim satisfying `findLovelaceContainer`, and `show-dialog` reaching the dialog manager). If `ha-sortable` is undefined, apply the warm-up noted in spec §10.4.

- [ ] **Step 8: Commit**

```bash
pnpm lint && pnpm test
git add src/editor/native-dialogs.ts src/editor/native-dialogs.test.ts src/editor/badge-list.ts src/editor/picture-badges-editor.ts src/index.ts
git commit -m "feat: badge list backed by the native badge dialogs"
```

---

## Task 7: The drag layer

The only part with no native equivalent, and the reason the project exists.

**Files:**
- Create: `src/card/drag-layer.ts`
- Modify: `src/card/picture-badges-card.ts`

**Interfaces:**
- Consumes: `clampPx`, `toPercent`, `Position` from `src/position.ts`; `activeEditor` from `src/broker.ts`
- Produces:
  - `createDragController(options: { getIndexedWrapper: (target: EventTarget | null) => { element: HTMLElement; index: number } | undefined; getSurface: () => HTMLElement | null; onCommit: (index: number, position: Position) => void }): { attach(root: HTMLElement): void; detach(): void }`

- [ ] **Step 1: Write the drag controller**

`src/card/drag-layer.ts`:

```ts
import { type Position, clampPx, positionStyle, toPercent } from "../position";

interface Hit {
  element: HTMLElement;
  index: number;
}

interface DragOptions {
  /** Resolve a pointer target to the wrapper it belongs to, with its index. */
  getIndexedWrapper(target: EventTarget | null): Hit | undefined;
  /** The element whose box defines 100%: the same box hui-image fills. */
  getSurface(): HTMLElement | null;
  onCommit(index: number, position: Position): void;
}

interface DragState {
  hit: Hit;
  pointerId: number;
  /** Offset of the pointer inside the badge, so it does not jump on grab. */
  grabX: number;
  grabY: number;
  surface: DOMRect;
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Pixel-precise while dragging, percentages only on release.
 *
 * During pointermove we mutate the node's own style directly: no config
 * round-trip, no latency, and a setConfig arriving mid-gesture cannot corrupt
 * it. One commit per drag, not per frame.
 */
export const createDragController = (options: DragOptions) => {
  let root: HTMLElement | undefined;
  let state: DragState | undefined;

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const hit = options.getIndexedWrapper(ev.target);
    const surface = options.getSurface();
    if (!hit || !surface) return;

    const box = hit.element.getBoundingClientRect();
    const surfaceBox = surface.getBoundingClientRect();

    state = {
      hit,
      pointerId: ev.pointerId,
      grabX: ev.clientX - box.left,
      grabY: ev.clientY - box.top,
      surface: surfaceBox,
      width: box.width,
      height: box.height,
      x: box.left - surfaceBox.left,
      y: box.top - surfaceBox.top,
    };

    // Survive the cursor leaving the surface.
    hit.element.setPointerCapture(ev.pointerId);
    hit.element.style.cursor = "grabbing";
    // Neutralise the stored transform so left/top are plain pixels while dragging.
    hit.element.style.transform = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;

    state.x = clampPx(
      ev.clientX - state.surface.left - state.grabX,
      state.surface.width,
      state.width,
    );
    state.y = clampPx(
      ev.clientY - state.surface.top - state.grabY,
      state.surface.height,
      state.height,
    );

    state.hit.element.style.left = `${state.x}px`;
    state.hit.element.style.top = `${state.y}px`;
    ev.preventDefault();
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (!state || ev.pointerId !== state.pointerId) return;
    const { hit, x, y, surface, width, height } = state;
    state = undefined;

    hit.element.releasePointerCapture(ev.pointerId);
    hit.element.style.cursor = "";

    const position: Position = {
      left: toPercent(x, surface.width, width),
      top: toPercent(y, surface.height, height),
    };

    // Restore the derived style here and not only on the next setConfig: a drag
    // that ends where it started produces no config change, so no setConfig
    // would come back, and the badge would stay in raw pixels with no transform.
    // Same geometry either way, so there is no flash.
    const style = positionStyle(position);
    hit.element.style.left = style.left;
    hit.element.style.top = style.top;
    hit.element.style.transform = style.transform;

    options.onCommit(hit.index, position);
  };

  return {
    attach(element: HTMLElement): void {
      if (root) return;
      root = element;
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerup", onPointerUp);
      root.addEventListener("pointercancel", onPointerUp);
    },
    detach(): void {
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("pointermove", onPointerMove);
      root?.removeEventListener("pointerup", onPointerUp);
      root?.removeEventListener("pointercancel", onPointerUp);
      root = undefined;
      state = undefined;
    },
  };
};
```

- [ ] **Step 2: Wire it into the card**

In `src/card/picture-badges-card.ts`, add the imports:

```ts
import { activeEditor } from "../broker";
import { createDragController } from "./drag-layer";
```

Add the field and the sync, and drive `editing` from `preview` plus the broker:

```ts
  private _drag = createDragController({
    getIndexedWrapper: (target) => {
      const wrapper = (target as HTMLElement | null)?.closest?.(".item") as HTMLElement | null;
      const index = wrapper?.dataset.index;
      return wrapper && index !== undefined
        ? { element: wrapper, index: Number(index) }
        : undefined;
    },
    getSurface: () => this.renderRoot.querySelector(".layer"),
    onCommit: (index, position) => activeEditor()?.patchPosition(index, position),
  });

  /**
   * Editing means: shown as a preview AND an editor is mounted. `preview` alone
   * is also true in the card-picker gallery, where no editor exists — so the
   * broker discriminates the two with no extra signal.
   */
  private _syncEditing(): void {
    const editing = this.preview && activeEditor() !== undefined;
    if (editing === this.editing) return;
    this.editing = editing;
  }
```

Extend `updated()`:

```ts
  protected updated(): void {
    this._syncEditing();
    const layer = this._layer;
    if (this.editing && layer) {
      this._drag.attach(layer);
    } else {
      this._drag.detach();
    }
    this._syncBadges();
  }
```

and release the listeners on teardown:

```ts
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._drag.detach();
  }
```

- [ ] **Step 3: Verify in Home Assistant**

Run: `pnpm build`, reload, edit a card holding two badges.

Expected:
- dragging a badge on the preview moves it under the cursor with no lag and no jump on grab;
- releasing writes `position` into the YAML tab, in whole percentages with at most two decimals, and the badge does not shift on release;
- a badge cannot be dragged outside the image on any side, and stops flush with the edge;
- clicking a badge during editing does **not** open more-info nor toggle anything;
- narrowing the browser keeps every badge inside the image;
- in the Add-card gallery, the preview is **not** draggable and clicking it does not throw;
- outside editing, clicking a badge opens more-info as usual.

- [ ] **Step 4: Commit**

```bash
pnpm lint && pnpm test
git add src/card/drag-layer.ts src/card/picture-badges-card.ts
git commit -m "feat: drag positioning on the live preview"
```

---

## Task 8: Packaging for HACS

**Files:**
- Create: `hacs.json`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: the built `dist/picture-badges.js`
- Produces: a repository installable through HACS as a Lovelace plugin

- [ ] **Step 1: Write the HACS manifest**

`hacs.json`:

```json
{
  "name": "Picture Badges",
  "filename": "picture-badges.js",
  "render_readme": true
}
```

- [ ] **Step 2: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 3: Write the release workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/picture-badges.js
```

- [ ] **Step 4: Complete the README**

Fill the install section: add the repository to HACS as a Lovelace plugin, install, then add the resource `/hacsfiles/picture-badges/picture-badges.js` as a JavaScript module. Document the YAML options — every `hui-image` passthrough key, and the `badges[].badge` / `badges[].position` shape — and state that positions are numbers 0–100 with proportional anchoring, so 100/100 sits flush in the bottom-right corner.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all pass, `dist/picture-badges.js` present.

- [ ] **Step 6: Commit**

```bash
git add hacs.json .github/workflows/ci.yml .github/workflows/release.yml README.md
git commit -m "chore: HACS packaging and CI"
```

---

## Deferred to v1.1

Not in this plan, listed so nobody re-derives them: grid snapping, keyboard nudge and selection, multi-selection, resizing badges, importing an existing `picture-elements` config, suppressing the native "Saved" toast, and a standalone `custom:badge-element` for native `picture-elements` cards.
