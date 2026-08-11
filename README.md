# Picture Badges

A Home Assistant Lovelace card that displays an image with badges you position by drag and drop.

## Requirements

**Home Assistant 2025.12.0 or newer.** HACS enforces this and will refuse to
install on an older version.

The floor comes from `ha-dropdown`, the component behind the "Add badge" button,
which arrived with Home Assistant's move to Web Awesome in 2025.12. Everything
else the card relies on — view badges, `window.customBadges`, per-badge config
forms — has been available since 2024.8.

## Installation

### HACS

1. In Home Assistant, open **HACS → ⋮ → Custom repositories**.
2. Add `https://github.com/my-lalex/ha-extra-picture-elements` as a **Lovelace** plugin.
3. Search for **Picture Badges** and install it.
4. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**.
5. URL: `/hacsfiles/picture-badges/picture-badges.js` — Type: **JavaScript module**.
6. Reload the page.

## Configuration

```yaml
type: custom:picture-badges
# One of image or camera_image is required
image: /local/floorplan.png
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
title: My floorplan                # optional tooltip on the image
tap_action:                        # optional — any Lovelace action config
  action: navigate
  navigation_path: /lovelace
hold_action:                       # optional
  action: more-info
double_tap_action:                 # optional
  action: none
items:
  - type: badge                  # family discriminant; defaults to "badge" when omitted
    config:
      type: entity               # any Lovelace badge config
      entity: sensor.temperature
    position:
      top: 30      # 0 = flush top, 50 = centred, 100 = flush bottom
      left: 60     # 0 = flush left, 50 = centred, 100 = flush right
```

### Position anchoring

`top` and `left` are numbers from **0 to 100** and use proportional anchoring — the same semantics as CSS `background-position`. At `0` the badge's edge sits flush against the top-left corner; at `50` the badge is centred; at `100` the badge's edge sits flush against the bottom-right corner. A badge therefore **can never overflow the image**, regardless of badge size or image dimensions. This is different from `picture-elements`, where `top`/`left` mark the badge's centre point.

### Custom badges

Any badge registered in `window.customBadges` by another frontend plugin appears automatically in the badge picker and renders on the card. That is the primary use-case for this card.

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

The container mounts `dist/` into Home Assistant's `/config/www/picture-badges/`, so every build is immediately served at:

```
http://localhost:8123/local/picture-badges/picture-badges.js
```

Port 8123 is forwarded by the devcontainer (`forwardPorts`). If it is not forwarded automatically, forward it manually from the Ports panel.

### Register the Lovelace resource (one-time manual step)

1. Open <http://localhost:8123> and complete the onboarding wizard to create your account.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**.
3. URL: `/local/picture-badges/picture-badges.js?v=1` — Type: **JavaScript module**.
4. Reload the page.

This step persists in the `.ha/config` volume and only needs to be done once.

### Cache busting

If HA serves a stale bundle after a rebuild, increment the `?v=` query parameter in the resource URL and reload.

### Other commands

```bash
pnpm run ha:logs   # follow Home Assistant logs
pnpm run ha:down   # stop the container
pnpm build         # production build into dist/
pnpm test          # run the test suite
pnpm lint          # lint and type-check
```
