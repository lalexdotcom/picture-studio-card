// Shared plumbing for the documentation captures: log in to the local Home
// Assistant, hand Chromium a session, and put the frontend in the state the
// captures assume (dark theme, no sidebar).
const HA = process.env.HA_URL ?? "http://localhost:8123";
const USER = process.env.HA_USER ?? "Card";
const PASS = process.env.HA_PASS ?? "card";
const CLIENT_ID = `${HA}/`;

const post = async (path, body, form = false) => {
  const res = await fetch(`${HA}${path}`, {
    method: "POST",
    headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

/** Runs the login flow and returns what the frontend keeps in `hassTokens`. */
export async function login() {
  const flow = await post("/auth/login_flow", {
    client_id: CLIENT_ID,
    handler: ["homeassistant", null],
    redirect_uri: CLIENT_ID,
  });
  const step = await post(`/auth/login_flow/${flow.flow_id}`, {
    client_id: CLIENT_ID,
    username: USER,
    password: PASS,
  });
  if (step.type !== "create_entry") throw new Error(`login refused: ${JSON.stringify(step)}`);
  const tokens = await post(
    "/auth/token",
    { grant_type: "authorization_code", code: step.result, client_id: CLIENT_ID },
    true,
  );
  return {
    ...tokens,
    hassUrl: HA,
    clientId: CLIENT_ID,
    expires: Date.now() + tokens.expires_in * 1000,
  };
}

/**
 * Seeds localStorage before the first script runs: the session, so the
 * frontend never shows the login form, and a hidden sidebar, so the crop does
 * not have to dodge it.
 */
export async function seed(context, tokens) {
  await context.addInitScript(
    ([t]) => {
      localStorage.setItem("hassTokens", JSON.stringify(t));
      localStorage.setItem("dockedSidebar", JSON.stringify("always_hidden"));
    },
    [tokens],
  );
}

/** Dark theme, applied the way the profile page does it. */
export async function dark(page) {
  await page.evaluate(() => {
    document.querySelector("home-assistant").dispatchEvent(
      new CustomEvent("settheme", { detail: { dark: true }, bubbles: true, composed: true }),
    );
  });
}

export { HA };
