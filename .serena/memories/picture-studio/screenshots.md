# The README's gifs, and how to shoot them again

Everything the README shows in motion is recorded by `scripts/screenshot/`, against
the local Home Assistant, in a real Chromium. Nothing is hand-recorded any more;
the `.mov` files under `captures/` are the retired originals. See `mem:picture-studio/state`
for the project itself.

## What it produces

| File | Scene | Length | Size |
| --- | --- | --- | --- |
| `docs/images/dashboard.gif` | the card on a dashboard: a tap toggles a light, a long press opens a more-info | ~14 s | ~2.1 MB |
| `docs/images/editor.gif` | the card editor: Add menu, entity, drag, re-anchor, drag, heading badge | ~35 s | ~3.2 MB |

`demo.gif` and `custom-badge.gif` were removed in the same pass — the "Custom badges"
section of the README keeps its text and lost its picture, deliberately.

## Running it

Two commands, in this order. Home Assistant must be up (`pnpm ha:up`) and `dist/`
built (`pnpm build`), because the card the film shows is the one mounted at
`/local/picture-studio-card/`.

```
node scripts/screenshot/setup-capture-dashboard.mjs      # idempotent; --force rewrites
node scripts/screenshot/capture-docs.mjs                 # both scenes -> docs/images/
node scripts/screenshot/capture-docs.mjs dashboard --keep # one scene, keep the webm
```

Environment: `HA_URL` (default `http://localhost:8123`), `HA_USER` / `HA_PASS`
(default `Card` / `card` — the dev account of the local instance), `OUT_DIR`
(default `docs/images`), `GIF_WIDTH`, `GIF_FPS`, `FFMPEG`.

Authentication is the frontend's own flow: `/auth/login_flow` → code →
`/auth/token`, and the result is written into `localStorage.hassTokens` by an
init script, alongside `dockedSidebar: "always_hidden"`. No token is stored in
the repo.

## The dashboard being filmed

A dashboard of its own, `picture-studio-capture`, one panel view, so the toolbar
carries **no tabs** and the card fills the frame. Its content is the literal in
`scripts/screenshot/capture-view.mjs` — that file is the source of truth, the
stored config is a copy. Change the file, re-run the setup with `--force`.

`.ha/` is git-ignored, so on a fresh clone the dashboard does not exist and the
setup script must be run first. `dashboard-test` is untouched by all of this and
must stay that way: its views hold the deliberately broken items used as error
fixtures, which is exactly what a screenshot must never show.

Side effects worth knowing: the scenes toggle real demo entities
(`light.ceiling_lights`, `light.living_room_rgbww_lights`), and each one calls
`dark(page)`, which **flips the HA account to the dark theme for good** — the
`settheme` event saves to user data, it is not per-session.

That call is not decoration. The context is created with `colorScheme: "dark"`,
but that is only the browser's media preference, and Home Assistant follows the
theme stored on the profile instead: a fresh instance has `theme: {dark: false}`
and would film the whole thing in light mode. The two together are what make the
result reproducible.

## ffmpeg

Playwright ships an ffmpeg built `--disable-everything`: vp8 in, png out, and
**no gif muxer** — it cannot do this job. `resolveFfmpeg()` looks for a full
build in order: `$FFMPEG`, `/usr/bin`, `/usr/local/bin`,
`node_modules/ffmpeg-static/ffmpeg`, and finally the gzipped binary that
`ffmpeg-static` leaves in `~/.cache/ffmpeg-static-nodejs/*.body`, which it
gunzips to a temp dir and version-checks before trusting.

That cache is what makes this work today with no install and no network. If a
devcontainer rebuild wipes it, either `pnpm add -D ffmpeg-static` (the resolver
already looks there) or point `FFMPEG` at any full build. `apt install ffmpeg`
also works and was deliberately not chosen.

## Two traps that cost an afternoon

**Home Assistant's service worker reloads the page under you.** Opening any
lazily-imported dialog — more-info, the card editor — fetches a new chunk, the
service worker takes control, and the frontend reloads itself. No console error,
no failed request: the dialog simply never appears. The fix is
`newContext({ serviceWorkers: "block" })`. The console then logs one
`navigator.serviceWorker` TypeError at startup, which is harmless.

**A dialog in the top layer covers the cursor.** Both dialogs are native
`<dialog>` elements, so no z-index reaches over them. The overlay is a `popover`
(also top layer) and `window.__cursor.raise()` re-shows it after a dialog opens,
which puts it back on top.

## The cursor

`scripts/screenshot/cursor.mjs` injects one, because Chromium draws no pointer in
a recording. MDI's `cursor-default` and `cursor-pointer`, white with a dark
outline and a drop shadow, chosen over a screenshot of a real cursor so the
result is OS-agnostic.

It **follows the real pointer** — it listens to `pointermove`/`down`/`up` rather
than being driven in parallel, so it cannot drift out of sync with what
Playwright actually clicked. The glyph swaps to the hand wherever the CSS under
the tip says `cursor: pointer`. Note `document.elementFromPoint` stops at a shadow
host: `kindAt()` descends shadow roots until it reaches the deepest element, and
reads `cursor` there — the property inherits, so that element already carries it.

## Framing

- **Dashboard: 1440×836, no crop.** 56 px of toolbar + a 780 px card (60 heading +
  720 image, the plan being 2:1) is exactly 836, so the frame is toolbar-plus-card
  with nothing left over. The more-info dialog centres in that viewport and fits.
- **Editor: 1120×720, no crop.** The card editor is a fixed 1024 px wide whatever
  the viewport, so a frame barely wider makes the dialog the subject — and, more
  importantly, its menus open leftwards from buttons at the form's left edge and
  would spill outside a wider frame. At 1120 they clamp inside the picture.
- The editor scene paints a **blackout**: a fixed div under the top layer, over the
  dashboard. The dialog keeps its own edges and shadow, so it still reads as a
  dialog, and the photograph behind it — which no gif palette compresses — is gone.
  It cut that gif from 4.1 MB to 3.1 MB.

## The encoding, and why each knob is there

```
fps=N, hqdn3d=2:2:8:8, scale=W:-1:lanczos, mpdecimate=hi=1536:lo=320:frac=0.001,
palettegen=stats_mode=diff:max_colors=128, paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle
-loop 0 -fps_mode vfr
```

- **hqdn3d** first. VP8 leaves faint noise on every pixel, so no two frames are
  ever identical and the gif rewrites the whole plan on every frame. Denoising is
  what makes the next filter work at all.
- **mpdecimate with a tiny `frac`.** It drops frames that did not really change,
  which is most of a dwell. `frac=0.001` is not a typo: a moving cursor covers
  ~0.3 % of the frame, and anything coarser (the usual 0.02–0.05) drops it and
  freezes the pointer mid-glide. Requires `-fps_mode vfr` so the pauses survive
  as per-frame delays.
- **`dither=bayer:bayer_scale=5`.** Finer dithering looks better frozen and costs
  megabytes in motion, since every frame then differs everywhere. `dither=none`
  was not smaller; `sierra2_4a` was 2× larger.
- Measured on the dashboard scene: 8.5 MB naive → 4.1 MB with fps/colour tuning →
  2.1 MB with denoise + decimate.

The clip is trimmed with `-ss` **after** `-i` (accurate seek; Playwright's webm
carries no duration, so a seek before `-i` lands on an arbitrary keyframe). The
offset comes from `mark()`, which each scene calls when the boot is over and the
take really begins.

## Editing a scene

Scenes live in the `SCENES` map of `capture-docs.mjs`; the name is the output
file name. Per-scene fps and width are in `ENCODING`. Anything before `mark()` is
staging and gets trimmed away — use it to open dialogs and fold sections.

Helpers: `glide` (eased mouse motion, ~16 ms steps), `clickOn`, `dragTo`, `park`
(re-syncs the pointer bookkeeping after a raw `locator.click`), `pickEntity`,
`menuItem`, `back`, `pause`.

Hard-won selector facts about Home Assistant's own UI:

- **A drag must hold before it moves.** The card commits a gesture on a held
  pointer and treats a bare click as "put it back", so `dragTo` presses, waits
  ~360 ms, then moves.
- Menu entries are `ha-dropdown-item` and there are always hidden ones elsewhere
  in the document; filter `{ visible: true }` or you will click a menu that is
  closed.
- Section headers are reached by `getByText("Items", { exact: true })`; clicking
  the `picture-studio-section` itself hits its body, not its summary.
- Two different back buttons: HA's own sub-editor (a heading badge) uses
  `hui-sub-element-editor ha-icon-button`; our item form uses
  `ha-icon[icon='mdi:arrow-left']`.
- The entity picker is driven by typing and then **clicking** the matching
  suggestion — Enter selects too, but a keypress does not show up in a recording.
- `glideTo` calls `scrollIntoViewIfNeeded`: the form is taller than the dialog and
  Playwright cannot click a point outside the viewport.

## Not covered

`scripts/` is outside `biome.json`'s `includes` (`src/**`, `*.ts`, `*.json`), so
these files are neither linted nor formatted by `pnpm lint`. Left as-is on
purpose; adding them is a one-line config change if it ever matters.
