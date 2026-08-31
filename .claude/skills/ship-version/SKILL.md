---
name: ship-version
description: >
  Ship a pre-release line as a stable version: consolidate its pre-release
  changelog sections, prune what only its testers ever saw, then close the
  version. Trigger whenever the user says "on sort la 1.6", "ship the line",
  "close the version", "publie la stable", or asks to turn the current beta or
  rc line into the stable release. Not for closing a session or a branch —
  that is AGENTS.md § Closing a session.
---

# Ship a version

The four steps below are steps 4 to 6 of `AGENTS.md` § Branches, and they run
**after** the back-merge, the whole-branch review and the merge of `next` into
`main`. If any of those three has not happened, say so and stop.

**The property this procedure protects:** between the consolidation and the
close, `package.json` carries a pre-release version and the top section carries
the same one. A push of `main` in that state is refused — a suffixed version
cannot be published from `main` — and `1.6.0` cannot be published either,
because its heading does not exist yet. **The heading is the safety catch, and
it appears only by the user's approval.** Never run the two scripts back to
back.

## 1. Consolidate

    scripts/consolidate-changelog.sh

It refuses rather than repairs. Report the refusal verbatim and stop.

## 2. Prune — the editorial pass

The beta sections were written for testers. The stable's section is read by
someone who has never run a beta, and every entry has to earn its place for
that reader.

Ask **one verifiable question** of every `Fixed` and `Changed` entry:

> Does its subject appear in this same version's `Added`?

- **Yes** → the feature has never shipped, so no user of a stable release ever
  met the bug. The entry belongs to the testers; propose cutting it.
- **No** → it fixed published behaviour. It stays.

Then read the `Added` entries against what actually ships: one written in an
early beta may describe behaviour a later beta changed. Propose the correction.

**Present every proposed cut and every proposed edit with its reason, and change
nothing until the user approves.** The consolidation has already removed the
per-beta headings, so git is the only remaining record of what you would be
deleting.

## 3. Close, once the user has approved

    scripts/close-version.sh

## 4. Report what is left to the user

The commit, the push of `main` — which is theirs to make, never yours — and the
deletion of `next` afterwards.
