# Release on version bump — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a GitHub release automatically when a commit reaches `main`
carrying a `version` in `package.json` that has no tag yet, refusing to ship a
version the `CHANGELOG.md` does not describe.

**Architecture:** Two workflows, one direction. `ci.yml` keeps its checks and
gains a conditional artefact upload of `dist/picture-studio.js`. `release.yml`
is rewritten to trigger on `workflow_run` from CI, and reads the validated
commit's sha and run id from the event payload — so the published file, the
tagged commit and the announced version all come from one CI run.

**Tech Stack:** GitHub Actions, `actions/checkout@v4`,
`actions/upload-artifact@v4`, `actions/download-artifact@v4`,
`softprops/action-gh-release@v2`, `gh` CLI and `jq` (both preinstalled on
`ubuntu-latest`), `mawk`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-release-on-version-bump-design.md`.
  Every requirement there binds every task here.
- **No card behaviour changes.** This plan touches `.github/workflows/` only.
  No file under `src/`, no dependency, no `package.json` edit.
- **`head_sha` is used twice and both matter**: as the `checkout` ref and as
  `target_commitish`. Missing either reintroduces the `v1.0.0` bug (a tag on a
  tree announcing a different version).
- **Never interpolate `${{ }}` inside a `run:` block.** Pass values through
  `env:` and read them as shell variables.
- **Do not add** prerelease handling, `workflow_dispatch`, or a
  `release: published` trigger. All three are explicitly out of scope.
- The `workflows: [CI]` filter matches `ci.yml`'s `name: CI` field. If either
  is renamed, both must be.
- Branch: `ci/release-on-version-bump`, already created, already carrying the
  spec commit `531e3c0`.

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Modify — one step appended to `jobs.check.steps` | Validate every push and PR; on `main` pushes only, publish the built bundle as an artefact |
| `.github/workflows/release.yml` | Rewrite in full | Consume CI's verdict and artefact; tag and release when the version is new |

Nothing else is created or modified.

## A note on testing, honestly

A workflow cannot be run locally. Only one step carries logic — the CHANGELOG
extraction — and it is plain `awk`, so it is developed against fixtures in
Task 2 before it is embedded. `mawk 1.3.4` in this devcontainer is the same
`awk` `ubuntu-latest` provides, so those fixture runs are faithful.

Everything else is declarative glue whose first real test is Task 3. There is
no local YAML linter here (no `actionlint`, no PyYAML, no `yaml` package);
GitHub parses the workflow on push and reports a syntax error as a failed run.

---

### Task 1: Publish the built bundle from CI

**Files:**
- Modify: `.github/workflows/ci.yml` — append one step to `jobs.check.steps`,
  after the existing `- run: pnpm build` (currently line 22)

**Interfaces:**
- Consumes: nothing.
- Produces: a workflow artefact named **`bundle`** containing
  `picture-studio.js` at its root, uploaded only on pushes to `main`. Task 2
  downloads it by that exact name.

- [ ] **Step 1: Append the upload step**

Add to the end of `jobs.check.steps` in `.github/workflows/ci.yml`:

```yaml
      - uses: actions/upload-artifact@v4
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        with:
          name: bundle
          path: dist/picture-studio.js
          retention-days: 14
```

The `if:` is what keeps pull requests from uploading: they run every check and
produce nothing. Only pushes to `main` — the only runs that can lead to a
release — produce the artefact.

- [ ] **Step 2: Confirm nothing else in the file moved**

Run: `git diff .github/workflows/ci.yml`

Expected: a single added hunk of six lines at the end of the file. No change to
the `name`, `on`, or any existing `- run:` line. If anything else differs,
revert and redo the edit.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: publish the built bundle as an artefact on main

The release workflow attaches the file HACS installs. Building it a second
time there would publish a byte nobody tested; uploading it here lets the
release attach the exact artefact that passed the checks.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Rewrite the release workflow

**Files:**
- Rewrite: `.github/workflows/release.yml` (currently 25 lines, triggered on
  `release: published`)
- Fixtures (throwaway, not committed): write them under the session scratchpad

**Interfaces:**
- Consumes: the `bundle` artefact from Task 1; `github.event.workflow_run`
  fields `conclusion`, `head_branch`, `head_sha`, `id`.
- Produces: a git tag `vX.Y.Z` and a GitHub release with
  `dist/picture-studio.js` attached as `picture-studio.js`.

- [ ] **Step 1: Write the fixtures the extraction must satisfy**

Six cases. Create two fixture files in the scratchpad directory:

`fx-prefix.md`:

```markdown
# Changelog

## 1.1.0-rc.1 — 2026-08-20

Must never be picked for version 1.1.0.

## 1.1.0 — 2026-08-25

The real 1.1.0 section.

## 1.0.0 — 2026-08-12

Older.
```

`fx-empty.md`:

```markdown
# Changelog

## 2.0.0 — 2026-09-01

## 1.0.0 — 2026-08-12

Older.
```

Expected outcomes:

| Version | File | Expected |
| --- | --- | --- |
| `1.0.0` | the repo's real `CHANGELOG.md` | succeeds; body is the two-line initial-release paragraph (last section, no `##` after it) |
| `1.1.0` | the repo's real `CHANGELOG.md` | **fails** — heading still says `unreleased` |
| `9.9.9` | the repo's real `CHANGELOG.md` | **fails** — no section |
| `1.1.0` | `fx-prefix.md` | succeeds with the `2026-08-25` section, **not** the `-rc.1` one |
| `1.1.0-rc.1` | `fx-prefix.md` | succeeds; body stops at the next `##` |
| `2.0.0` | `fx-empty.md` | **fails** — empty body |

- [ ] **Step 2: Run the extraction against all six, as a standalone script**

Write this to `extract.sh` in the scratchpad and `chmod +x` it. This is the
exact logic that goes into the workflow; proving it here is the only test it
will get before it is live.

```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="$1"; FILE="$2"

heading=$(awk -v ver="$VERSION" '
  index($0, "## " ver) == 1 {
    rest = substr($0, length("## " ver) + 1)
    if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { print; exit }
  }
' "$FILE")

if [ -z "$heading" ]; then
  echo "ERROR: no section for $VERSION" >&2; exit 1
fi

case "$heading" in
  *unreleased*) echo "ERROR: $VERSION still marked unreleased" >&2; exit 1 ;;
esac

awk -v ver="$VERSION" '
  found && /^## / { exit }
  found { print }
  index($0, "## " ver) == 1 {
    rest = substr($0, length("## " ver) + 1)
    if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { found = 1 }
  }
' "$FILE" > notes.md

if ! grep -q '[^[:space:]]' notes.md; then
  echo "ERROR: section for $VERSION is empty" >&2; exit 1
fi

echo "OK: $heading"
```

Run each case:

```bash
./extract.sh 1.0.0 /workspaces/ha-extra-picture-elements/CHANGELOG.md && cat notes.md
./extract.sh 1.1.0 /workspaces/ha-extra-picture-elements/CHANGELOG.md; echo "exit=$?"
./extract.sh 9.9.9 /workspaces/ha-extra-picture-elements/CHANGELOG.md; echo "exit=$?"
./extract.sh 1.1.0 fx-prefix.md && cat notes.md
./extract.sh 1.1.0-rc.1 fx-prefix.md && cat notes.md
./extract.sh 2.0.0 fx-empty.md; echo "exit=$?"
```

Expected: the table above, exactly. The three failures must print their own
message and `exit=1`.

Why it is written this way, so it is not "simplified" later: the heading is
matched with `index()` and a `substr()` on the character that follows, **not**
with a regex built from the version — a version is full of `.`, which is a
regex metacharacter, and `1.1.0` as a regex matches `1.1.0-rc.1`'s prefix. The
body rules are ordered so the two `found` rules come **before** the rule that
sets `found`, which is what keeps the heading line itself out of the body.

- [ ] **Step 3: Write the workflow**

Replace the entire contents of `.github/workflows/release.yml` with:

```yaml
name: Release

on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions:
  contents: write
  actions: read

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.head_branch == 'main'
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      - name: Read the version
        id: version
        run: echo "version=$(jq -r .version package.json)" >> "$GITHUB_OUTPUT"

      - name: Is this version already released?
        id: gate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          set -euo pipefail
          if gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/v$VERSION" >/dev/null 2>&1; then
            echo "v$VERSION is already tagged — nothing to release."
            echo "release=false" >> "$GITHUB_OUTPUT"
          else
            echo "v$VERSION has no tag — releasing."
            echo "release=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Extract the changelog section
        if: steps.gate.outputs.release == 'true'
        env:
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          set -euo pipefail

          heading=$(awk -v ver="$VERSION" '
            index($0, "## " ver) == 1 {
              rest = substr($0, length("## " ver) + 1)
              if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { print; exit }
            }
          ' CHANGELOG.md)

          if [ -z "$heading" ]; then
            echo "::error::CHANGELOG.md has no section for $VERSION"
            exit 1
          fi

          case "$heading" in
            *unreleased*)
              echo "::error::CHANGELOG.md still marks $VERSION as unreleased"
              exit 1
              ;;
          esac

          awk -v ver="$VERSION" '
            found && /^## / { exit }
            found { print }
            index($0, "## " ver) == 1 {
              rest = substr($0, length("## " ver) + 1)
              if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { found = 1 }
            }
          ' CHANGELOG.md > release-notes.md

          if ! grep -q '[^[:space:]]' release-notes.md; then
            echo "::error::CHANGELOG.md section for $VERSION is empty"
            exit 1
          fi

          echo "Release notes taken from: $heading"

      - uses: actions/download-artifact@v4
        if: steps.gate.outputs.release == 'true'
        with:
          name: bundle
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path: .

      - uses: softprops/action-gh-release@v2
        if: steps.gate.outputs.release == 'true'
        with:
          tag_name: v${{ steps.version.outputs.version }}
          target_commitish: ${{ github.event.workflow_run.head_sha }}
          name: v${{ steps.version.outputs.version }}
          body_path: release-notes.md
          generate_release_notes: true
          files: picture-studio.js
```

- [ ] **Step 4: Re-read the file against four traps**

Read the file back and confirm each, one at a time:

1. `ref:` on the checkout is `github.event.workflow_run.head_sha` — **not**
   `github.sha`. A `workflow_run` job starts at the tip of the default branch;
   `github.sha` is that tip, not the validated commit.
2. `target_commitish:` is the same `head_sha`. Without it the tag is created
   from the default branch tip, landing on a tree that may announce a different
   version.
3. The job `if:` tests **both** `conclusion == 'success'` and
   `head_branch == 'main'`. `workflow_run` fires on every CI completion,
   including failed ones and pull requests.
4. No `run:` block contains `${{ }}`. Every value arrives through `env:`.

- [ ] **Step 5: Confirm the old trigger is gone**

Run: `grep -n "release:\|published" .github/workflows/release.yml`

Expected: **exactly one** line — `  release:`, the job key under `jobs:`. No
`on: release:` block, and no occurrence of `published` anywhere. If `published`
appears at all, the old trigger survived the rewrite.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release on a version bump instead of by hand

The release is now created by the chain rather than listening for one. CI
validates and uploads the bundle; this job wakes on its success, and publishes
only when the version in package.json has no tag yet — which makes the bump
itself the trigger, and makes the tag land on the tree that carries the
version. It refuses to ship a version CHANGELOG.md does not describe, or still
marks unreleased.

The release: published trigger is removed rather than kept: a release made by
hand bypasses both checks, and that is how v1.0.0 came to point at a tree
announcing 0.1.0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Merge, push, and verify the no-op path live

**Files:** none modified. This task is a verification.

**Interfaces:**
- Consumes: Tasks 1 and 2, both committed on `ci/release-on-version-bump`.
- Produces: the chain live on `main`, with its harmless path observed.

**Why this cannot happen earlier:** a `workflow_run` trigger only fires when
the workflow file is on the **default branch**. Nothing in Task 2 can run while
it sits on a feature branch. Merging is the test.

- [ ] **Step 1: Confirm the starting state**

Run:

```bash
git status --short && jq -r .version package.json && git tag -l 'v1.0.0'
```

Expected: clean tree, `1.0.0`, and `v1.0.0`. These three facts are what make
the first live run a no-op: the version in `package.json` already has its tag.

- [ ] **Step 2: Merge to `main`, no fast-forward**

```bash
git checkout main
git merge --no-ff ci/release-on-version-bump -m "Merge branch 'ci/release-on-version-bump'"
```

`--no-ff` matches how `feat/item-anchor` was integrated.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Watch CI, then the release job**

Open the repository's Actions tab. Expected, in order:

1. **CI** runs on the push and goes green. Its summary lists an artefact named
   `bundle` — this is Task 1's first real proof.
2. **Release** starts on CI's completion — proof that `workflow_run` fires and
   that the `name: CI` filter matches.
3. The `Is this version already released?` step logs
   `v1.0.0 is already tagged — nothing to release.`
4. Every step after it is **skipped**.
5. The job is **green**, and no new release or tag exists.

If Release never starts, the `workflows: [CI]` filter does not match `ci.yml`'s
`name:`, or the file was not on `main` when CI finished.

- [ ] **Step 5: Confirm nothing was published**

Run:

```bash
git fetch --tags && git tag -l
```

Expected: `v1.0.0` and nothing else. The repository's Releases page still shows
one release.

- [ ] **Step 6: Delete the merged branch**

```bash
git branch -d ci/release-on-version-bump
```

---

## What this plan deliberately does not verify

Two of the spec's three verification paths cannot be exercised here, and
inventing a way to fake them would prove nothing.

- **The failure path** (bumped version, CHANGELOG still `unreleased`) and **the
  nominal path** (the real release) both require bumping `package.json` — which
  per AGENTS.md § Changelog and versioning happens *with* a release, and is
  never decided alone.
- 1.1.0 additionally waits on the performance follow-up, which is slated for
  the same version.

So both are exercised **when 1.1.0 ships**, in that order: bump with the
heading left at `unreleased` and expect a red build with nothing published,
then correct the heading to `## 1.1.0 — <date>` and expect the release.

## Amendment, after Task 3 — purging the artefact

Added on `main` after the three tasks were merged and the no-op path was
observed green, at the user's request. `release.yml` gains a final
`if: success()` step that deletes the `bundle` artefact of the triggering run,
and `permissions` moves from `actions: read` to `actions: write`. The retention
in `ci.yml` goes from 3 days to 14: the purge is now the cleanup, so the
retention only has to outlive a *failed* release job, and its size is bounded
by the failure rate rather than the push rate.

Unlike the two paths deferred below, **this one is verified immediately**: the
no-op path reaches the purge step (skipped steps do not make `success()`
false), so the very push that lands this change exercises it. Expected: CI
green with a `bundle` artefact, the release job green, its purge step logging
`Purged bundle artefact <id>`, and the run's artefact list empty afterwards.

**One residual unknown, stated so it is not forgotten:** whether
`GITHUB_TOKEN` with `actions: read` suffices to download an artefact from
another run of the same repository, or whether a PAT is needed. The no-op path
of Task 3 exits before the download step, and so does the failure rehearsal —
so this is answered only on the nominal path. If it turns out insufficient, the
step fails **before** anything is published, and the fix is a repository secret
holding a PAT with `actions: read` swapped into `github-token:`.
