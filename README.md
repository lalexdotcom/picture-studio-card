# Picture Studio

**Put badges and icons on a picture and drag them where they belong — right in the card editor, without writing a line of YAML.**

A floor plan, a photo, a camera view: pick an image, drop items on it, and place them with the mouse on the live preview. What you drag is what you get.

## The editor

![Adding a badge in the card editor and dragging it into place on a floor plan](docs/images/editor.gif)

## Badges

Once saved, they behave like anything else in Lovelace: tap one to toggle it, or open its more-info dialog.

![Badges on the floor plan being tapped on a dashboard, opening more-info dialogs](docs/images/demo.gif)

## Custom badges

Badges from other frontend plugins appear in the picker next to the built-in ones and render on the image just the same. That is the main reason this card exists.

![Adding a Mushroom template badge from the picker and dragging it onto the plan](docs/images/custom-badge.gif)

## Icons

A badge carries a pill, a label and one fixed size. When what you want on the
plan is an icon — and you want it big — add an **icon** item instead: the same
entity, name, icon and colour controls, without the pill.

You choose [how big it is](#icon-size) and [what it stands on](#chrome).

## Install

### Requirements

**Home Assistant 2026.6.0 or newer.** HACS enforces this and will refuse to install on an older version.

### HACS

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=lalexdotcom&repository=picture-studio-card&category=plugin)

Picture Studio is **not** in the default HACS catalog, so it has to be added as a custom repository. The button above does exactly that: HACS asks you to confirm, adds the repository, and opens its page. From there:

1. Choose **Download**.
2. Reload Home Assistant.
3. Hard-refresh your browser — **Ctrl + F5** on Windows/Linux, **Cmd + Shift + R** on Mac.

<details>
<summary>If the button does not work</summary>

HACS may not be installed yet, or your instance URL may not be registered with My Home Assistant. Add the repository by hand:

1. Open **HACS** in Home Assistant.
2. Open the **⋮** menu → **Custom repositories**.
3. Repository: `lalexdotcom/picture-studio-card` — Type: **Dashboard**.
4. **Add**, then open **Picture Studio** from the list, and download it as above.

One other case needs a manual step: a dashboard in YAML mode, where HACS cannot touch the resource list and says so. Add the resource yourself as described under **Manual install**, with `/hacsfiles/picture-studio-card/picture-studio.js` as the URL.

</details>

<details>
<summary>Manual install</summary>

1. Download `picture-studio.js` from the [latest release](https://github.com/lalexdotcom/picture-studio-card/releases/latest).
2. Copy it into your Home Assistant `www` directory — `config/www/picture-studio.js`. Create `www` if it does not exist.
3. Add it as a dashboard resource, in **Settings → Dashboards → ⋮ → Resources → Add resource**:
   ```yaml
   url: /local/picture-studio.js
   type: module
   ```
   In YAML mode, put the same two keys under `lovelace: resources:` in `configuration.yaml` instead.
4. Reload Home Assistant, then hard-refresh your browser.

Updating means repeating steps 1 and 2, then hard-refreshing. Appending a query string to the resource URL — `/local/picture-studio.js?v=2` — is the reliable way to defeat browser caching.

</details>

### Add the card

1. Edit your dashboard.
2. **Add card**.
3. Search for **Picture Studio**.
4. Pick the background image.
5. Add badges or icons, then drag them onto the image in the preview.
6. **Save**.

## Configuration

### Size and position

#### Anchor

An item's position is a pair of percentages, and the anchor decides which part of
the item they place.

- **Automatic** *(default)* — the anchor follows the coordinate.
- **Anchored** — the coordinates place the point you pick in the grid.

#### Icon size

An icon's size follows the **card**, not the screen: in a sections view a narrow
column gets a smaller icon than a wide one, and the same card on a phone scales
down with it. Three modes decide how closely:

- **Automatic** *(default)* — 8% of the card's width, never under 24px, never
  over 48px.
- **Adaptive** — the same, with your own ratio and your own bounds.
- **Fixed** — one size in pixels, which follows nothing.

### YAML reference

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
  - type: badge                  # family discriminant; required
    config:
      type: entity               # any Lovelace badge config
      entity: sensor.temperature
    position:
      top: 30%
      left: 60%
    anchor: center               # optional; defaults to "auto"
    visibility:                  # optional; absent or empty means always drawn
      - condition: state
        entity: input_boolean.show_badge
        state: "on"

  - type: element                # the other family
    config:
      type: state-icon           # the only element kind so far
      entity: light.salon
      icon: mdi:floor-lamp       # optional; the entity's state icon otherwise
      color: state               # state | none | a theme colour name
      name: Lampe du salon       # optional; shown as a tooltip
      show_entity_picture: false
      tap_action: { action: more-info }
      size:
        mode: auto               # auto | adaptive | fixed (absent => auto)
        ratio: 8                 # adaptive only — % of card width
        min: 24                  # adaptive only — px
        max: 48                  # adaptive only — px
        value: 48                # fixed only — px
      chrome:                    # optional; absent means no chrome
        theme: none              # none | auto | light | dark
        radius: 50               # % of the box — 50 is a disc, 0 a square
        opacity: 1               # the surface's opacity, 0-1
        content_ratio: 0.6       # share of the box taken by the icon, 0-1
    position:
      top: 45%
      left: 20%
```

`image` and `dark_mode_image` accept a plain path written by hand, or the object the editor's media picker stores once you browse or upload a picture:

```yaml
image:
  media_content_id: media-source://media_source/local/floorplan.png
  media_content_type: image/png
```

Both forms render identically; the editor displays either one.

#### Positions, anchors and sizes

An icon's `size.mode` is `auto`, `adaptive` or `fixed` — the three choices the
editor offers. `adaptive` reads `min`, `ratio` and `max`, `fixed` reads `value`,
and the numbers a mode does not use are kept as you left them.

`top` and `left` accept `30%` or a bare `30`. The editor writes the percent form
back and keeps two decimals, which is the precision dragging produces.

`anchor` is `auto` — the **Automatic** switch in the editor — or one of the
nine fixed points: `top-left`, `top-center`, `top-right`, `center-left`,
`center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`. An
absent `anchor` means `auto`. The value `proportional` is still read, for
configs written before 1.2.0, and normalises to `auto`.

Coordinates outside `0-100` are allowed and kept as written: under a fixed anchor
they are how you place an item deliberately over the edge. Dragging never creates
an overflow and never worsens one — an item already hanging off the edge can be
pulled back in but not pushed further out, and once fully inside it stays there.

#### Visibility

Every item takes an optional `visibility` list. The conditions are Home
Assistant's own — entity state, numeric state, screen size, time, user, zone,
and the `and` / `or` / `not` combinators — the same ones a card or a badge
accepts. The item is drawn when every entry in the list is met; an absent or
empty list means always drawn.

In the editor, items carrying conditions are marked in the preview, and each
item's form has a "Visibility" section with Home Assistant's condition editor
and its live "current visibility" banner.

The card's own visibility is native to Home Assistant and needs nothing from
this card: the Lovelace engine evaluates `config.visibility` on every card,
and the edit dialog's "Visibility" tab is generic to all cards.

#### Chrome

Anything drawn on a photograph competes with whatever the picture happens to
show. `chrome` gives an item a surface to stand on instead. Icons offer it
today; it is written to belong to an item rather than to one kind of item, so
other kinds can take it up as they arrive.

`theme` is the switch as well as the choice. `none` — the default, and what an
absent `chrome` means — draws nothing. `auto` uses the same background your
dashboard's cards use, so the surface follows your theme. `light` and `dark`
force one or the other, which is what you want when the picture is dark and the
theme is not, or the reverse.

`radius` is a percentage of the box: `50` is a disc, `0` a square, anything
between a rounded square. `opacity` fades the surface only — what stands on it
keeps its own colour. `content_ratio` is the share of the box the content takes:
`0.6` matches Home Assistant's own icons, and `1` makes the content fill the box
entirely, which turns the chrome into a frame around an entity picture rather
than a disc behind it.

The numbers are kept when you switch the surface back to `none`, so trying a
chrome out and turning it off costs you nothing.

Note that `size` is the size of the whole thing: switching a chrome on does not
make an item bigger, it makes what is inside it smaller. Nothing else about the
item changes — where it sits, how it drags and what it does when clicked are the
same with or without a surface.

#### YAML-only keys

The editor covers the keys you set every day: title, image, dark mode image, camera entity, camera view, state filter and dark mode filter. `entity`, `image_entity`, `state_image`, `aspect_ratio` and `filter` are set in YAML only. Field labels follow your Home Assistant interface language.

#### Card size

The card sizes itself to the image by default. If you resize it to a height the image does not fit, the image keeps its proportions and the part that no longer fits stays reachable by scrolling the card.

## Roadmap

Icons arrived in 1.2.0. Later versions will place more kinds of content on the image — labels, buttons — drawn to sit alongside today's Home Assistant cards rather than to reproduce anything older.

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
