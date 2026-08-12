# Picture Studio

A Home Assistant Lovelace card: place badges on an image and position them by **dragging them on the live preview**, inside the normal card editor.

## Requirements

**Home Assistant 2026.5.0 or newer.** HACS enforces this and will refuse to
install on an older version. The floor comes from the `shortcut` badge, which
the picker offers and which Home Assistant only started shipping in 2026.5.

## Installation

### Recommended: HACS

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=lalexdotcom&repository=picture-studio-card&category=plugin)

Picture Studio is **not** in the default HACS catalog, so it has to be added as a custom repository. The button above does exactly that: HACS asks you to confirm, adds the repository, and opens its page.

If the button does not work — HACS not installed yet, or your instance URL not registered with My Home Assistant — add it by hand:

1. Open **HACS** in Home Assistant.
2. Open the **⋮** menu → **Custom repositories**.
3. Repository: `lalexdotcom/picture-studio-card` — Type: **Dashboard**.
4. **Add**, then open **Picture Studio** from the list.

From there, whichever way you got to the repository page:

1. Choose **Download**.
2. Reload Home Assistant.
3. Hard-refresh your browser — **Ctrl + F5** on Windows/Linux, **Cmd + Shift + R** on Mac.

HACS registers the dashboard resource itself, `/hacsfiles/picture-studio-card/picture-studio.js`. The one exception is a dashboard in YAML mode, where HACS cannot touch the resource list and says so; add it yourself as described in step 3 of **Manual install**, with that same `/hacsfiles/…` URL.

Then add the card:

1. Edit your dashboard.
2. **Add card**.
3. Search for **Picture Studio**.
4. Pick the background image.
5. Add badges, then drag them onto the image in the preview.
6. **Save**.

### Manual install

1. Download `picture-studio.js` from the [latest release](https://github.com/lalexdotcom/picture-studio-card/releases/latest).
2. Copy it into your Home Assistant `www` directory — `config/www/picture-studio.js`. Create `www` if it does not exist.
3. Add it as a dashboard resource, in **Settings → Dashboards → ⋮ → Resources → Add resource**:
   ```yaml
   url: /local/picture-studio.js
   type: module
   ```
   In YAML mode, put the same two keys under `lovelace: resources:` in `configuration.yaml` instead.
4. Reload Home Assistant, then hard-refresh your browser.
5. Add the card to a dashboard, as above.

Updating means repeating steps 1 and 2, then hard-refreshing. Appending a query string to the resource URL — `/local/picture-studio.js?v=2` — is the reliable way to defeat browser caching.

## Configuration

```yaml
type: custom:picture-studio
# One of image, image_entity or camera_image is required
image: /local/floorplan.png
image_entity: image.floorplan      # optional, an image or person entity instead of image
camera_image: camera.front_door   # optional, instead of image
camera_view: auto                  # optional: "auto" | "live"
entity: light.living_room          # optional — required for state_image / state_filter
state_image:                       # optional: entity-state → image URL map (needs entity)
  "on": /local/on.png
  "off": /local/off.png
state_filter:                      # optional: entity-state → CSS filter map (needs entity)
  "off": brightness(0.5)
dark_mode_image: /local/floorplan-dark.png   # optional
dark_mode_filter: brightness(0.7)  # optional CSS filter applied in dark mode
aspect_ratio: "16:9"               # optional, e.g. "16:9" or "1:1"
filter: brightness(0.9)            # optional CSS filter
title: My floorplan                # optional card header
items:
  - type: badge                  # family discriminant; defaults to "badge" when omitted
    config:
      type: entity               # any Lovelace badge config
      entity: sensor.temperature
    position:
      top: 30      # 0 = flush top, 50 = centered, 100 = flush bottom
      left: 60     # 0 = flush left, 50 = centered, 100 = flush right
```

`image` and `dark_mode_image` accept a plain path written by hand, or the object the editor's media picker stores once you browse or upload a picture:

```yaml
image:
  media_content_id: media-source://media_source/local/floorplan.png
  media_content_type: image/png
```

Both forms render identically; the editor displays either one.

### Position anchoring

`top` and `left` are numbers from **0 to 100** and use proportional anchoring — the same semantics as CSS `background-position`. At `0` the badge's edge sits flush against the top-left corner; at `50` the badge is centered; at `100` the badge's edge sits flush against the bottom-right corner. A badge therefore **can never overflow the image**, regardless of badge size or image dimensions.

### YAML-only keys

The editor covers the keys you set every day: title, image, dark mode image, camera entity, camera view, state filter and dark mode filter. `entity`, `image_entity`, `state_image`, `aspect_ratio` and `filter` are set in YAML only. Field labels follow your Home Assistant interface language.

### Card size

The card sizes itself to the image by default. If you resize it to a height the image does not fit, the image keeps its proportions and the part that no longer fits stays reachable by scrolling the card.

### Custom badges

Badges from other frontend plugins appear in the picker next to the built-in ones and render on the image just the same. That is the main reason this card exists.

## Development

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0`
- pnpm
- Docker (Docker-in-Docker is supported in the devcontainer)

### Start the dev build watcher

```bash
pnpm dev
```

### Start the local Home Assistant instance

```bash
pnpm run ha:up
```

The container mounts `dist/` into Home Assistant's `/config/www/picture-studio-card/`, so every build is immediately served at:

```
http://localhost:8123/local/picture-studio-card/picture-studio.js
```

Port 8123 is forwarded by the devcontainer (`forwardPorts`). If it is not forwarded automatically, forward it manually from the Ports panel.

### Register the Lovelace resource (one-time manual step)

1. Open <http://localhost:8123> and complete the onboarding wizard to create your account.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**.
3. URL: `/local/picture-studio-card/picture-studio.js?v=1` — Type: **JavaScript module**.
4. Reload the page.

This step persists in the `.ha/config` volume and only needs to be done once.

### Cache busting

If HA serves a stale bundle after a rebuild, increment the `?v=` query parameter in the resource URL and reload.

### Other commands

```bash
pnpm run ha:logs   # follow Home Assistant logs
pnpm run ha:down   # stop the container
pnpm build         # production build into dist/
pnpm test          # run the test suite (src/tests/)
pnpm lint          # Biome check
pnpm format        # Biome check --write
pnpm typecheck     # tsc --noEmit
```
