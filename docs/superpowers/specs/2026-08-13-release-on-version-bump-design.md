# Release on version bump — design

Status: approved 2026-08-13. Concerns CI only; no card behaviour changes.

## Problem

Releasing is manual and the manual steps are the ones that go wrong. `v1.0.0`
was tagged on a tree whose `package.json` still said `0.1.0`, because the tag
and the version are written by two different hands at two different moments,
and nothing checks that they agree.

`release.yml` today listens on `release: published`, builds, and attaches
`dist/picture-studio.js` to the release someone created by hand. Since `dist/`
is git-ignored, that asset is the only thing HACS can install — so everything
upstream of it is load-bearing and unverified.

AGENTS.md § Changelog and versioning already states the rules: one version
mirrored across the `CHANGELOG.md` heading, `package.json`, and the git tag;
the bump lands with the release, not before. They are discipline. This design
makes them a control.

## What triggers a release

**The version in `package.json` has no tag yet.** That single test replaces
every other notion of "is this a release commit".

The rejected alternative was diffing `package.json` between `HEAD` and `HEAD~1`
and releasing when it changed. It has a silent failure mode: a push containing
the bump commit *plus* a later commit only runs the workflow at the tip, where
`HEAD~1` no longer shows the bump — no release, no error. Testing the tag is
idempotent instead: it publishes at most once per version, and a push that
should have released but did not gets picked up by the next push.

What makes this safe is the AGENTS.md rule itself: while work is in progress,
`package.json` names the last shipped version, whose tag exists. So the whole
development period sits in the no-op branch.

## Shape: two workflows, one direction

`ci.yml` validates. `release.yml` consumes its verdict and its artefact. The
validation has a single source, and so does the published byte.

### `ci.yml`

Unchanged triggers (`push: main`, `pull_request`) and unchanged checks. One
step is added at the end of the job:

```yaml
- uses: actions/upload-artifact@v4
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  with:
    name: bundle
    path: dist/picture-studio.js
    retention-days: 7
```

Pull requests run every check and upload nothing; only pushes to `main` — the
only runs that can lead to a release — produce the artefact.

`workflow_call` with `inputs` was rejected for this: it would turn `ci.yml`
into a workflow *called* by another, which is exactly the coupling the
`workflow_run` shape avoids.

### `release.yml`

Rewritten. The `release: published` trigger is **removed**, not kept alongside.
A release created by hand in the GitHub UI bypasses every control below — no
CHANGELOG section required, no tag pinned to the commit carrying the version.
That is the door the `v1.0.0` bug came through. Re-releasing, if it is ever
needed, means deleting the tag and pushing again; a `workflow_dispatch` can be
added the day a real need appears.

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
```

The job is guarded by:

```yaml
if: >
  github.event.workflow_run.conclusion == 'success' &&
  github.event.workflow_run.head_branch == 'main'
```

Both conditions are required. `workflow_run` fires when CI *completes*,
whatever the outcome, and `ci.yml` also runs on pull requests — without the
filter, a red PR build would start the release job.

## The two values that carry across

A `workflow_run` job does not run on the commit that triggered it. GitHub
starts a fresh job positioned at the **tip of the default branch**; `github.sha`
is that tip, not the validated commit. Everything the job needs about the run
that woke it must be read from the event payload:

| Value | Used for |
| --- | --- |
| `github.event.workflow_run.head_sha` | `checkout` ref **and** `target_commitish` |
| `github.event.workflow_run.id` | the run to download the bundle from |

Both uses of `head_sha` matter, and missing either reintroduces the original
bug in a new place:

- Without it on `checkout`, the job reads `package.json` and `CHANGELOG.md`
  from whatever is at the tip of `main` — a different commit as soon as someone
  pushes while the job is queued.
- Without it on `target_commitish`, `softprops/action-gh-release` creates the
  tag from the default branch tip. **The tag would land on a tree that announces
  a different version** — precisely the `v1.0.0` failure, produced by
  automation this time.

The resulting property: the published file, the tagged commit and the announced
version all come from one CI run. None of the three is rebuilt or re-derived
somewhere else.

## The job, step by step

Ordered on one principle: everything that can fail locally fails before
anything touches the outside world. When the job fails, nothing has been
created — no tag, no draft release, no half-written state. Fixing and pushing
again is a clean second attempt.

1. **Checkout** at `head_sha`.
2. **Read the version** — `jq -r .version package.json`.
3. **Does the tag exist?** Ask GitHub (`gh api repos/…/git/ref/tags/vX.Y.Z`),
   not the local clone: it is the same authority that will reject a duplicate
   later, and it does not depend on which tags the checkout happened to fetch.
   **If it exists the job succeeds and does nothing.** This is the outcome of
   almost every push to `main`.
4. **Extract the CHANGELOG section** for the version into a file. Fails on any
   of: section absent, heading still reading `unreleased`, empty body.
5. **Download the artefact** from `workflow_run.id`.
6. **Create the tag and the release** in one call.

```yaml
permissions:
  contents: write      # create the tag and the release
  actions: read        # download an artefact from another run

concurrency:
  group: release
  cancel-in-progress: false
```

`cancel-in-progress: false` — two closely spaced pushes serialise rather than
interleave; a release is not something to cancel halfway.

### Extracting the CHANGELOG section

Inline in the YAML. Keeping it as a tested pure function in `src/` was
considered and rejected: it is the only step carrying logic, but it is also
five lines of shell, and the deliberate failure rehearsal below exercises it
for real.

Requirements on the snippet, which do not go away for being untested:

- Match `^## X.Y.Z` where the version is taken literally — `1.1.0` must not
  match a `1.1.0-rc` heading.
- The body runs to the next `^## ` heading, **or to end of file** when the
  section is the last one.
- Written to a file and passed via `body_path`, not inlined through an
  environment variable — the body is multi-line prose.

### Downloading the artefact

```yaml
- uses: actions/download-artifact@v4
  with:
    name: bundle
    run-id: ${{ github.event.workflow_run.id }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    path: .
```

`run-id` plus `github-token` is what lifts the action's default scope, which
only reaches artefacts of the current run. The name must match the one
`ci.yml` uploads under. `path: .` puts `picture-studio.js` in the working
directory, which is what the `files:` entry below refers to.

### Creating the release

```yaml
- uses: softprops/action-gh-release@v2
  with:
    tag_name: v${{ steps.version.outputs.version }}
    target_commitish: ${{ github.event.workflow_run.head_sha }}
    body_path: release-notes.md
    generate_release_notes: true
    files: picture-studio.js
```

`body` and `generate_release_notes` compose: the supplied body is **prepended**
to GitHub's generated notes (verified in the action's README). So the release
page reads as the CHANGELOG section — written for users of the card — followed
by GitHub's "What's Changed" commit and contributor list. Auto-generated notes
alone were rejected: they expose the git history, which AGENTS.md says belongs
in git and not in the changelog.

The API creates the tag together with the release; if the call fails, neither
exists.

## Outcomes

| Situation | Result |
| --- | --- |
| CI red, or not on `main` | Job never starts |
| Tag already present (the ordinary case) | Silent success, nothing published |
| CHANGELOG has no section, or still says `unreleased` | **Loud failure**, red mark on the commit, nothing published |
| New version, CHANGELOG in order | Tag on the right tree, release published with the asset |

The third row is the point. A version can no longer ship without the changelog
that describes it.

## Out of scope, deliberately

- **Prereleases.** A version containing `-` is not marked `prerelease: true`.
- **A `workflow_dispatch` escape hatch.** Adding either is a few lines the day
  there is a real need.

## Verification

A workflow cannot be tested locally. The three paths are exercised for real, in
order:

1. **The no-op path, for free**, on the very push that installs the workflow:
   `package.json` says `1.0.0`, `v1.0.0` exists, the job must go green having
   published nothing.
2. **The failure path, deliberately**, when shipping 1.1.0: bump
   `package.json` while leaving the CHANGELOG heading at `unreleased`. Expected:
   red, nothing published. It costs one red mark on `main` and proves the guard
   guards.
3. **The nominal path**: fix the heading to `## 1.1.0 — <date>`, push, and
   1.1.0 ships through the chain. The mechanism's first real release.

### The one open question

Whether `GITHUB_TOKEN` with `actions: read` suffices to download an artefact
from another run of the same repository, or whether a PAT is required. The
action's README illustrates the case with a PAT, but does not say the built-in
token is excluded for a same-repository run.

If it does not suffice, step 5 fails before anything is published — the answer
arrives as a red build, not as a release missing its asset.

## Why one workflow was not enough, and why it is not two jobs either

An earlier sketch split this in two: a workflow that tags and creates the
release, and the existing one listening on `release: published` to build and
attach. **That cannot work.** A release created with the default
`GITHUB_TOKEN` does not trigger workflows listening on `release: published`.
The build would never run and the release would ship with no asset — a silent
failure leaving HACS nothing to install.

The `workflow_run` shape sidesteps this entirely: nothing here listens for a
release, because this chain is what creates them.
