// Creates (or refreshes) the dashboard the documentation gifs are filmed on.
// A dashboard of its own, with a single panel view: no tabs in the toolbar, and
// nothing here moves unless this file is edited.
//
//   node scripts/screenshot/setup-capture-dashboard.mjs [--force]
//
// Without --force an existing dashboard is left untouched.
import { chromium } from "playwright";
import { login, seed, HA } from "./ha-session.mjs";
import { CAPTURE_VIEW } from "./capture-view.mjs";

export const DASHBOARD = "picture-studio-capture";
const FORCE = process.argv.includes("--force");

const tokens = await login();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 776 } });
await seed(context, tokens);
const page = await context.newPage();
await page.goto(`${HA}/lovelace/0`);
await page.waitForSelector("home-assistant", { timeout: 20000 });
await page.waitForTimeout(1500);

const result = await page.evaluate(async ([urlPath, view, force]) => {
  const hass = document.querySelector("home-assistant").hass;
  const boards = await hass.callWS({ type: "lovelace/dashboards/list" });
  const existing = boards.find((b) => b.url_path === urlPath);
  if (existing && !force) return "kept";
  if (!existing) {
    await hass.callWS({
      type: "lovelace/dashboards/create",
      url_path: urlPath,
      title: "Capture",
      icon: "mdi:camera",
      mode: "storage",
      require_admin: false,
      show_in_sidebar: false,
    });
  }
  await hass.callWS({
    type: "lovelace/config/save",
    url_path: urlPath,
    config: { views: [view] },
  });
  return existing ? "refreshed" : "created";
}, [DASHBOARD, CAPTURE_VIEW, FORCE]);

console.log(result);
await browser.close();
