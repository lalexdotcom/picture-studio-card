# picture-studio — follow-ups

What is parked, not what is done. `picture-studio/state` describes the card as it
stands; this file holds what has been asked for and not yet designed. An entry
here is a starting point for a brainstorm, never a decision already taken.

Kept separate because the two age differently: the state file is rewritten as the
card changes, this one grows and empties.

---

## 1. A chrome around a state-icon

**Asked for on 2026-08-14, targeted at 1.3.0.**

Draw a shape behind the icon — a disc, `border-radius: 100%` — so an icon on a
busy photograph reads against its own surface instead of against the picture.
The current answer to that problem is the rim-and-glow filter added in 1.2.0
(`--psc-icon-outline` / `--psc-icon-glow`). **Settled on 2026-08-14: the filter
moves onto the chrome, which carries only a fill.** So the disc gets the rim and
the halo that the glyph has today, and has no border of its own — which also
disposes of the naming worry below: what was called a "border" is the filter's
rim, not a CSS border.

**The load-bearing detail, in the user's words: the size and the action apply to
the chrome, not to the icon.** So:

- `size` comes to mean the chrome's box, and the glyph becomes a proportion of
  it. **This knowingly reopens a 1.2.0 decision** — the spec says "One value
  drives the whole visual footprint … Home Assistant's own 24/40 glyph-to-box
  ratio is not reproduced — the production setting reasons about the glyph, and
  two numbers for one size would be two numbers to tune." With a chrome, that
  ratio is exactly what is needed. Re-open it deliberately, do not contradict it
  in passing: either a fixed inner ratio, or a second number the user tunes.
- the hit target, the hover grow, the `clickable` attribute and the
  `action-handler` binding move to the chrome. The drag and the anchoring measure
  the wrapper, so they follow on their own — but check the clamp against a box
  that is suddenly larger than the glyph.
- the 1.2.0 drop-shadows would then trace the chrome's silhouette rather than the
  glyph's, which is probably an improvement and is certainly a change.

**Naming is open, and `border` is probably the wrong word** — a CSS border is the
line, while what is described is a filled shape with a radius. Candidates worth
weighing: `chrome`, `shape`, `backdrop`, `surface`. Whatever it is called, it will
be a key inside `config`, so the element's config gains a sub-object the way
`size` did.

**Prior art to copy, but not to depend on.** The tile card draws exactly this:
`ha-tile-icon` with `--tile-icon-color` (the state colour) and
`--tile-icon-border-radius` (pill by default, square for images, and
`--ha-border-radius-sm` for a media player's artwork). Its background is the
state colour at low opacity, which is why a tile reads on any theme. **But
`ha-tile-icon` is defined in exactly one chunk of the shipped frontend — the tile
card's own — so it is the least available component looked at so far.** Draw the
shape ourselves with the same idea, and take their tokens rather than their
element. `state-badge` also already exposes `--state-badge-border-radius`,
defaulting to 50%, which may do part of the job for free.

**Questions for the brainstorm:**

- On or off by default? A chrome changes every existing icon if it defaults on.
- Does its colour follow the entity's state, like a tile, or is it configured?
- What happens to an icon with no chrome — does it keep the filter it has today,
  or does the filter become the chrome's alone? (Answered for the chrome case,
  open for the bare one.)

**Settled already:** the release is **1.3.0**, not 1.2.1 — a new config option is
additive. And the rim and halo belong to the chrome, which is a fill and nothing
else.
</content>
</invoke>
