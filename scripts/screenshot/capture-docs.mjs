// Records the README's gifs against the local Home Assistant.
//
//   node scripts/screenshot/capture-docs.mjs             # both scenes
//   node scripts/screenshot/capture-docs.mjs dashboard   # one of them
//   node scripts/screenshot/capture-docs.mjs --keep      # keep the intermediate webm
//
// The dashboard it films is created by scripts/screenshot/setup-capture-dashboard.mjs.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { login, seed, dark, HA } from "./ha-session.mjs";
import { installCursor } from "./cursor.mjs";

const DASHBOARD = "picture-studio-capture";
const OUT_DIR = process.env.OUT_DIR ?? "docs/images";
const KEEP = process.argv.includes("--keep");
const GIF_WIDTH = Number(process.env.GIF_WIDTH ?? 800);
const GIF_FPS = Number(process.env.GIF_FPS ?? 12);

/* ---------------------------------------------------------------- ffmpeg -- */

/**
 * Playwright's own ffmpeg is built with `--disable-everything` and has no gif
 * muxer, so it cannot serve here. Any full build will do; this looks for one
 * in the places a devcontainer tends to have it, ending with the tarball
 * `ffmpeg-static` leaves in its download cache.
 */
function resolveFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  for (const candidate of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (existsSync(candidate)) return candidate;
  }
  const staticPkg = "node_modules/ffmpeg-static/ffmpeg";
  if (existsSync(staticPkg)) return staticPkg;

  const cache = join(homedir(), ".cache", "ffmpeg-static-nodejs");
  if (existsSync(cache)) {
    for (const file of readdirSync(cache).filter((f) => f.endsWith(".body"))) {
      const raw = readFileSync(join(cache, file));
      if (raw[0] !== 0x1f || raw[1] !== 0x8b) continue; // not gzip
      const bin = join(mkdtempSync(join(tmpdir(), "ffmpeg-")), "ffmpeg");
      writeFileSync(bin, gunzipSync(raw), { mode: 0o755 });
      try {
        execFileSync(bin, ["-version"], { stdio: "ignore" });
        return bin;
      } catch {
        /* wrong architecture — keep looking */
      }
    }
  }
  throw new Error(
    "no usable ffmpeg found. Set FFMPEG=/path/to/ffmpeg, or `pnpm add -D ffmpeg-static`.",
  );
}

/**
 * webm → gif, through a per-clip palette: 256 colours chosen from the clip
 * itself. `stats_mode=diff` weights the palette towards what moves, and
 * `diff_mode=rectangle` lets the encoder rewrite only the rectangle that
 * changed — on a mostly still floor plan that is most of the file size.
 * The dither is coarse on purpose: finer patterns look better frozen and
 * cost megabytes in motion, because every frame then differs everywhere.
 */
function toGif(ffmpeg, webm, gif, { width = GIF_WIDTH, fps = GIF_FPS, from = 0, crop } = {}) {
  const chain = [
    `fps=${fps}`,
    // VP8 leaves a faint noise over every pixel, so no two frames are ever
    // identical and the gif ends up rewriting the whole plan 12 times a
    // second. Denoising first, then dropping the frames that really did not
    // change, is what keeps this a two-megabyte file instead of an eight.
    "hqdn3d=2:2:8:8",
    crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : null,
    `scale=${width}:-1:flags=lanczos`,
    // frac is deliberately tiny: a moving cursor covers ~0.3% of the frame,
    // and anything coarser drops it and freezes the pointer mid-glide.
    "mpdecimate=hi=1536:lo=320:frac=0.001",
  ].filter(Boolean).join(",");
  execFileSync(ffmpeg, [
    "-y", "-i", webm,
    // Accurate seek, after decoding: Playwright's webm carries no duration,
    // and a seek before -i lands wherever the nearest keyframe is.
    ...(from > 0 ? ["-ss", from.toFixed(2)] : []),
    "-vf",
    `${chain},split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    "-loop", "0",
    // The decimated stream is variable-rate by nature; a gif carries a delay
    // per frame, so the pauses survive as pauses.
    "-fps_mode", "vfr",
    gif,
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

/* ----------------------------------------------------------- HA services -- */

const call = (token, domain, service, data) =>
  fetch(`${HA}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => {
    if (!r.ok) throw new Error(`${domain}.${service} → ${r.status}`);
  });

/* --------------------------------------------------------------- motion -- */

/** Where the mouse is, so a glide knows where it starts. */
const pointer = { x: 40, y: 700 };

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Moves the mouse the way a hand would: accelerating, then settling. */
async function glide(page, x, y, ms = 700) {
  const from = { ...pointer };
  const frames = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= frames; i++) {
    const t = ease(i / frames);
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
    await page.waitForTimeout(16);
  }
  pointer.x = x;
  pointer.y = y;
}

const pause = (page, ms) => page.waitForTimeout(ms);

/** A click that reads on video: settle, press, release. */
async function tap(page, ms = 90) {
  await page.mouse.down();
  await pause(page, ms);
  await page.mouse.up();
}

/** A press long enough for Home Assistant to call it a hold (500 ms). */
async function hold(page, ms = 900) {
  await page.mouse.down();
  await pause(page, ms);
  await page.mouse.up();
}

const raise = (page) => page.evaluate(() => window.__cursor?.raise());

/**
 * Blacks out everything behind a modal. The dialog is in the top layer, so a
 * plain fixed element lands under it and over the dashboard: the take keeps
 * the dialog's own edges and shadow — it still reads as a dialog — and loses
 * both the distraction and the photograph that no gif palette compresses.
 */
const blackout = (page) =>
  page.evaluate(() => {
    if (document.getElementById("__blackout")) return;
    const el = document.createElement("div");
    el.id = "__blackout";
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      background: "#0a0a0c",
      zIndex: "2147483000",
      pointerEvents: "none",
    });
    document.body.appendChild(el);
  });

const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Glides to the middle of whatever the locator resolves to, then clicks it. */
async function glideTo(page, locator, ms = 480) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  // The form is taller than the dialog: what the take reaches for may still
  // be below the fold.
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error(`nothing to glide to: ${locator}`);
  const { x, y } = centre(box);
  await glide(page, x, y, ms);
  return { x, y };
}

async function clickOn(page, locator, { ms = 480, settle = 160 } = {}) {
  await glideTo(page, locator, ms);
  await pause(page, settle);
  await tap(page);
}

/**
 * Drags an item across the preview. The press has to be held before the first
 * move: the card commits a gesture on a held pointer and treats a bare click
 * as "put it back".
 */
async function dragTo(page, locator, x, y, ms = 750) {
  await glideTo(page, locator, 520);
  await pause(page, 220);
  await page.mouse.down();
  await pause(page, 360);
  await glide(page, x, y, ms);
  await pause(page, 260);
  await page.mouse.up();
}

/** An item of whichever menu is open — never a section header of the same name. */
const menuItem = (page, label) =>
  page
    .locator("ha-dropdown-item, ha-md-menu-item, ha-list-item, mwc-list-item, [role='menuitem']")
    .filter({ hasText: label, visible: true })
    .first();

/** The arrow that leaves an item's form and returns to the list. */
const back = (page) =>
  page
    // Home Assistant's own sub-editor (a heading badge) puts a chevron in its
    // header; our item form uses an arrow of its own.
    .locator("hui-sub-element-editor ha-icon-button, ha-icon[icon='mdi:arrow-left']")
    .filter({ visible: true })
    .first();

/** Puts the mouse somewhere neutral, and tells the bookkeeping where it is. */
async function park(page, x, y) {
  await page.mouse.move(x, y);
  pointer.x = x;
  pointer.y = y;
}

/**
 * Types into the entity picker and clicks the suggestion whose label matches.
 * Clicking rather than pressing Enter, because a keypress does not show up in
 * a recording — and matching on the label, because the list is filtered but
 * not always down to one row.
 */
async function pickEntity(page, search, label = search) {
  const picker = page.locator("hui-dialog-edit-card ha-entity-picker").first();
  await clickOn(page, picker, { ms: 500 });
  await pause(page, 350);
  await page.keyboard.type(search, { delay: 45 });
  await pause(page, 700);
  const option = page
    .locator("ha-combo-box-item, vaadin-combo-box-item, ha-list-item, mwc-list-item, [role='option']")
    .filter({ hasText: label, visible: true })
    .first();
  await clickOn(page, option, { ms: 400, settle: 150 });
  await pause(page, 600);
}

/* --------------------------------------------------------------- scenes -- */

/** Per-scene encoding: the editor is text, and text survives fewer frames
 * better than it survives fewer pixels. */
const ENCODING = {
  dashboard: { fps: 12, width: 800 },
  editor: { fps: 10, width: 800 },
};

const SCENES = {
  /**
   * The card as a user meets it: a floor plan carrying every kind of item,
   * one tap that switches a light, one press that opens its more-info.
   */
  async dashboard({ page, token, mark }) {
    await call(token, "light", "turn_off", { entity_id: "light.ceiling_lights" });
    await call(token, "light", "turn_on", {
      entity_id: "light.living_room_rgbww_lights",
      brightness_pct: 71,
      rgbww_color: [255, 160, 60, 180, 120],
    });

    await page.goto(`${HA}/${DASHBOARD}/0`);
    await page.waitForSelector("picture-studio", { timeout: 20000 });
    await dark(page);
    // Everything before this is Home Assistant booting: the take starts here.
    await pause(page, 1800);
    mark();
    await pause(page, 700);

    // Tap: the open-space ceiling light comes on.
    const icon = await page.locator("picture-studio picture-studio-state-icon").first().boundingBox();
    await glide(page, ...Object.values(centre(icon)), 800);
    await pause(page, 450);
    await tap(page);
    await pause(page, 1600);

    // Hold: the lounge badge opens its more-info.
    const badge = await page
      .locator("picture-studio ha-badge")
      .filter({ hasText: "Lounge" })
      .first()
      .boundingBox();
    await glide(page, ...Object.values(centre(badge)), 800);
    await pause(page, 350);
    await hold(page);
    await page.waitForSelector("ha-more-info-dialog", { state: "attached", timeout: 10000 });
    await pause(page, 600);
    await raise(page);
    await pause(page, 2200);

    // Close it, and leave the plan on screen for a beat.
    const close = await page.locator("ha-more-info-dialog ha-icon-button").first().boundingBox();
    await glide(page, ...Object.values(centre(close)), 800);
    await pause(page, 250);
    await tap(page);
    await pause(page, 1000);
  },

  /**
   * The editor: what can be added, where it lands, and the two ways of
   * placing it — dragging it, and choosing the corner it hangs from. Then the
   * header, which is Home Assistant's own heading badges.
   */
  async editor({ page, mark }) {
    await page.goto(`${HA}/${DASHBOARD}/0?edit=1`);
    await page.waitForSelector("hui-card-options", { timeout: 20000 });
    await dark(page);
    await pause(page, 1000);
    await page.locator("hui-card-options ha-button", { hasText: "Edit" }).first().click();
    await page.waitForSelector("hui-dialog-edit-card", { state: "attached", timeout: 15000 });
    await pause(page, 2400);
    await blackout(page);
    await raise(page);

    // Set the stage off camera: Background folded away, the item list open,
    // its Add button in view.
    await page.getByText("Background", { exact: true }).first().click();
    await pause(page, 500);
    await page.getByText("Items", { exact: true }).first().click();
    await pause(page, 700);
    const items = page.locator("picture-studio-section").filter({ hasText: "Items" }).first();
    const add = items.locator("ha-button").filter({ hasText: "Add" }).last();
    await add.scrollIntoViewIfNeeded();
    await pause(page, 500);
    await park(page, 240, 620);
    mark();
    await pause(page, 300);

    // What the card can hold.
    await clickOn(page, add);
    await pause(page, 1000);
    await clickOn(page, menuItem(page, "Badges: Entity"), { ms: 420 });
    await pause(page, 600);
    await pickEntity(page, "Break", "Break room");

    // It lands in the middle of the plan; drag it where it belongs.
    const item = page.locator("hui-dialog-edit-card picture-studio .item.selected").first();
    const plan = await page.locator("hui-dialog-edit-card picture-studio hui-image").first().boundingBox();
    await dragTo(page, item, plan.x + plan.width * 0.28, plan.y + plan.height * 0.26);
    await pause(page, 500);

    // The other half of placing an item: which corner it hangs from.
    await clickOn(page, page.getByText("Position", { exact: true }).first());
    await pause(page, 700);
    await clickOn(page, page.locator("picture-studio-anchor-picker button").nth(8), { ms: 450 });
    await pause(page, 700);
    await dragTo(page, item, plan.x + plan.width * 0.71, plan.y + plan.height * 0.66);
    await pause(page, 600);

    // The header: a badge of Home Assistant's own, in the card's title row.
    await clickOn(page, back(page), { ms: 420 });
    await pause(page, 350);
    await clickOn(page, page.getByText("Items", { exact: true }).first(), { ms: 420 });
    await pause(page, 300);
    await clickOn(page, page.getByText("Heading", { exact: true }).first(), { ms: 420 });
    await pause(page, 500);
    await clickOn(page, page.locator("ha-button").filter({ hasText: "Add badge" }).first());
    await pause(page, 600);
    await clickOn(page, menuItem(page, "Entity"), { ms: 450 });
    await pause(page, 700);
    await pickEntity(page, "Reception", "Reception");
    await pause(page, 900);

    // Nothing here is meant to be kept.
    await clickOn(page, page.locator("ha-button").filter({ hasText: "Cancel" }).first());
    await pause(page, 600);
  },
};

/* ----------------------------------------------------------------- main -- */

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const scenes = wanted.length ? wanted : Object.keys(SCENES);
for (const name of scenes) {
  if (!SCENES[name]) {
    throw new Error(`unknown scene "${name}" (have: ${Object.keys(SCENES).join(", ")})`);
  }
}

const ffmpeg = resolveFfmpeg();
const tokens = await login();
mkdirSync(OUT_DIR, { recursive: true });
const videoDir = mkdtempSync(join(tmpdir(), "capture-"));

for (const name of scenes) {
  const browser = await chromium.launch();
  try {
    // The card editor is a fixed 1024 px wide. Filming it in a frame barely
    // wider keeps the dialog the subject — and keeps its menus, which open
    // leftwards from the buttons at the form's edge, inside the picture.
    const viewport = name === "editor" ? { width: 1120, height: 720 } : { width: 1440, height: 836 };
    const context = await browser.newContext({
      viewport,
      // Home Assistant's service worker takes control while a lazily-imported
      // dialog is loading and reloads the page under us; blocking it is the
      // difference between a more-info dialog and a blank restart mid-take.
      serviceWorkers: "block",
      recordVideo: { dir: videoDir, size: viewport },
      colorScheme: "dark",
    });
    await seed(context, tokens);
    await installCursor(context);
    const startedAt = Date.now();
    const page = await context.newPage();
    pointer.x = 40;
    pointer.y = viewport.height - 60;

    // Where the useful part of the recording begins, in seconds.
    let from = 0;
    const mark = () => { from = Math.max(0, (Date.now() - startedAt) / 1000 - 0.4); };
    await SCENES[name]({ page, token: tokens.access_token, viewport, mark });

    const video = page.video();
    await context.close();
    const webm = await video.path();
    const gif = join(OUT_DIR, `${name}.gif`);
    toGif(ffmpeg, webm, gif, { from, ...ENCODING[name] });
    if (!KEEP) rmSync(webm, { force: true });
    console.log(`${gif}  (${(readFileSync(gif).length / 1024 / 1024).toFixed(2)} MB)`);
  } finally {
    // A scene that throws — a selector that moved, Home Assistant restarting —
    // would otherwise leave Chromium running until node exits.
    await browser.close().catch(() => {});
  }
}
if (!KEEP) rmSync(videoDir, { recursive: true, force: true });
else console.log(`webm kept in ${videoDir}`);
