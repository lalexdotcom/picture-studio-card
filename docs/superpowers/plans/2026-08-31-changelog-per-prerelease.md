# Changelog per pre-release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every published artefact its own changelog section — pre-releases included — and make the stable's section a reviewed consolidation of them.

**Architecture:** Four small bash scripts, each owning one moment (open the next pre-release, consolidate, close, extract release notes), plus a skill that runs the closing three around a human editorial pass. `release.yml` stops reasoning about base versions and calls the extraction script. Every script refuses rather than repairs, following `scripts/start-branch.sh` and `scripts/open-prerelease.sh`.

**Tech Stack:** bash + awk + jq (the two existing scripts' toolset), rstest for the tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-changelog-per-prerelease-design.md` — read it first; every decision number referenced below lives there.

## Global Constraints

- **Branch:** all of this lands on `main`, from `chore/changelog-per-prerelease` (already cut). Spec decision 9: a `workflow_run` job executes the copy of the workflow on the **default branch**, so the change has no effect until it is on `main`.
- **No CHANGELOG entry for this work.** It changes nothing for a user of the card. `AGENTS.md` § Changelog rule 1.
- **No version bump.** `AGENTS.md` § Changelog rule 4.
- **Scripts refuse, never repair.** A dirty tree is a refusal, never a stash. Every refusal names its reason on stderr and exits non-zero.
- **Section order in `CHANGELOG.md`:** descending version. Subsection order inside a section: `Added`, `Changed`, `Fixed`, `Removed`, `Deprecated`, `Security` (`AGENTS.md` § Changelog rule 3).
- **`sort -V` is the ordering authority** for pre-release identifiers (`beta.10` after `beta.9`, `rc.1` after `beta.7`). It is GNU coreutils in the devcontainer and in CI.
- **`awk` rewrites `package.json`, never `jq`** — `jq` reformats the whole file. Copy the idiom from `scripts/open-prerelease.sh:143-150`.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/bump-prerelease.sh` | Open the next pre-release section on `next` (the frequent act) |
| `scripts/consolidate-changelog.sh` | Merge every pre-release section of a base into one, on `main` |
| `scripts/close-version.sh` | Strip the suffix, date the heading — the act that permits the stable release |
| `scripts/release-notes.sh` | Print one version's section, or refuse; called by `release.yml` |
| `scripts/open-prerelease.sh` | *Modified*: the identifier becomes an argument; closing message restated |
| `.github/workflows/release.yml` | *Modified*: exact-version extraction, inverted catch deleted, stable-already-out check added |
| `.claude/skills/ship-version/SKILL.md` | The closing procedure: consolidate → prune → close |
| `src/tests/scripts/harness.ts` | Throwaway git repositories for the script tests |
| `src/tests/scripts/*.test.ts` | One file per script |
| `rstest.config.ts` | *Modified*: a third project, `scripts` |
| `AGENTS.md` | *Modified*: § Changelog rules 6-7, § Branches ship sequence |
| `.serena/memories/picture-studio/state.md` | *Modified*: what would bite someone cold |

**One deviation from the spec, flagged for approval:** the spec named two scripts and a skill; this plan adds a fourth script, `release-notes.sh`. The step that decides what gets published is 40 lines of shell inside YAML, where nothing can test it; moving it to a script makes spec decision 12 ("its extraction is pure text: it is simulated locally") a test rather than a habit. Reject this and Task 5 folds the same logic back into the workflow untested.

---

### Task 1: The script test harness, and `bump-prerelease.sh`

**Files:**
- Create: `src/tests/scripts/harness.ts`
- Create: `src/tests/scripts/bump-prerelease.test.ts`
- Create: `scripts/bump-prerelease.sh`
- Modify: `rstest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeRepo(options): Fixture` and `Fixture.run(script, ...args): {status, stdout, stderr}`, `Fixture.read(path): string`, used by every later task. CLI: `scripts/bump-prerelease.sh <identifier>`.

- [ ] **Step 1: Add the third rstest project**

`rstest.config.ts`, after the `playwright` project (keep the existing comments intact):

```ts
    {
      // The release scripts are bash, and what they guarantee is a set of
      // refusals. Each test builds a throwaway git repository, runs the real
      // script against it and asserts on its exit status and on the files it
      // leaves — which is spec decision 12's "throwaway clone", automated so it
      // runs on every push rather than when someone remembers.
      name: "scripts",
      include: ["src/tests/scripts/**/*.test.ts"],
    },
```

- [ ] **Step 2: Write the harness**

`src/tests/scripts/harness.ts`:

```ts
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The repository under test — rstest runs from its root. */
const ROOT = process.cwd();

export interface Result {
  status: number;
  stdout: string;
  stderr: string;
}

export interface Fixture {
  dir: string;
  run: (script: string, ...args: string[]) => Result;
  read: (file: string) => string;
}

export interface RepoOptions {
  /** The branch the fixture ends up on. Created if it is not `main`. */
  branch?: string;
  version: string;
  changelog: string;
  /** Left uncommitted, so a test can exercise the dirty-tree refusal. */
  dirty?: boolean;
}

const created: string[] = [];

export const makeRepo = (options: RepoOptions): Fixture => {
  const dir = mkdtempSync(join(tmpdir(), "psc-scripts-"));
  created.push(dir);

  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  };

  git("init", "--initial-branch=main", "--quiet");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");

  writeFileSync(join(dir, "package.json"), `{\n  "version": "${options.version}"\n}\n`);
  writeFileSync(join(dir, "CHANGELOG.md"), options.changelog);
  // The real scripts, not a copy of their logic: `git rev-parse --show-toplevel`
  // inside the fixture resolves here, so they read the fixture's files.
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  git("add", "-A");
  git("commit", "--quiet", "-m", "fixture");

  if (options.branch && options.branch !== "main") git("checkout", "--quiet", "-b", options.branch);
  if (options.dirty) writeFileSync(join(dir, "dirt.txt"), "uncommitted\n");

  return {
    dir,
    run: (script, ...args): Result => {
      try {
        const stdout = execFileSync("bash", [join(dir, "scripts", script), ...args], {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        return { status: 0, stdout, stderr: "" };
      } catch (error) {
        const e = error as { status?: number; stdout?: string; stderr?: string };
        return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
      }
    },
    read: (file): string => readFileSync(join(dir, file), "utf8"),
  };
};

/** Call from afterEach: a leaked fixture is megabytes and a confusing next run. */
export const cleanupRepos = (): void => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
};

/** A changelog with one published section, the state after a beta ships. */
export const published = (version: string, date = "2026-09-01"): string =>
  `# Changelog\n\n## ${version} — ${date}\n\n### Added\n\n- A thing.\n\n## 1.5.3 — 2026-08-23\n\n### Fixed\n\n- An old thing.\n`;
```

- [ ] **Step 3: Write the failing tests**

`src/tests/scripts/bump-prerelease.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanupRepos, makeRepo, published } from "./harness";

afterEach(cleanupRepos);

describe("bump-prerelease.sh", () => {
  it("opens the next section and moves package.json with it", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.1",
      changelog: published("1.6.0-beta.1"),
    });

    const result = repo.run("bump-prerelease.sh", "beta.2");

    expect(result.status).toBe(0);
    expect(repo.read("package.json")).toContain('"version": "1.6.0-beta.2"');
    // Inserted above every existing section, and open.
    expect(repo.read("CHANGELOG.md")).toContain("## 1.6.0-beta.2 — unreleased");
    expect(repo.read("CHANGELOG.md").indexOf("## 1.6.0-beta.2")).toBeLessThan(
      repo.read("CHANGELOG.md").indexOf("## 1.6.0-beta.1"),
    );
  });

  it("takes an rc as readily as a beta — the identifier is a decision", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.9",
      changelog: published("1.6.0-beta.9"),
    });

    expect(repo.run("bump-prerelease.sh", "rc.1").status).toBe(0);
    expect(repo.read("package.json")).toContain('"version": "1.6.0-rc.1"');
  });

  it("orders by SemVer precedence, not by string", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.9",
      changelog: published("1.6.0-beta.9"),
    });

    // "beta.10" < "beta.9" as strings; the script must not believe that.
    expect(repo.run("bump-prerelease.sh", "beta.10").status).toBe(0);
    expect(repo.read("package.json")).toContain('"version": "1.6.0-beta.10"');
  });

  it("refuses to go backwards", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.3",
      changelog: published("1.6.0-beta.3"),
    });

    const result = repo.run("bump-prerelease.sh", "beta.2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("only ever moves forward");
  });

  it("refuses while a section is still open", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.2",
      changelog: "# Changelog\n\n## 1.6.0-beta.2 — unreleased\n\n### Added\n\n- A thing.\n",
    });

    const result = repo.run("bump-prerelease.sh", "beta.3");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("still has an open section");
  });

  it("refuses off next", () => {
    const repo = makeRepo({ version: "1.6.0-beta.1", changelog: published("1.6.0-beta.1") });

    const result = repo.run("bump-prerelease.sh", "beta.2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("published from next");
  });

  it("refuses a dirty tree, and moves nothing", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.1",
      changelog: published("1.6.0-beta.1"),
      dirty: true,
    });

    const result = repo.run("bump-prerelease.sh", "beta.2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not clean");
    expect(repo.read("package.json")).toContain('"version": "1.6.0-beta.1"');
  });

  it("refuses an identifier that is not pre-release text", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.1",
      changelog: published("1.6.0-beta.1"),
    });

    expect(repo.run("bump-prerelease.sh", "1.7.0").status).not.toBe(0);
    expect(repo.run("bump-prerelease.sh", "beta 2").status).not.toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test src/tests/scripts/bump-prerelease.test.ts`
Expected: every case fails — the script does not exist, so `bash` exits 127.

- [ ] **Step 5: Write the script**

`scripts/bump-prerelease.sh`, then `chmod +x scripts/bump-prerelease.sh`:

```bash
#!/usr/bin/env bash
#
# Open the next pre-release section on the feature line.
#
#   scripts/bump-prerelease.sh beta.2
#   scripts/bump-prerelease.sh rc.1
#
# **The identifier is an argument and never an increment.** `beta.8` and `rc.1`
# are both legitimate successors of `beta.7`, and only the caller knows which is
# meant — which is also why the section is opened at the first delivery that
# follows a publication rather than at the publication itself.
#
# Why a script: the failure it prevents is silent. Writing an entry into the
# dated section of a published beta and pushing gives a green CI and **no
# release at all** — the release job finds the tag already there, reports
# "nothing to release", and succeeds. Nothing anywhere says the work was never
# published.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 1 ] || die "usage: ${0##*/} <identifier>   e.g. ${0##*/} beta.2"

cd "$(git rev-parse --show-toplevel)"

identifier="$1"
# SemVer pre-release text: dot-separated alphanumerics and hyphens. Rejecting
# anything else here keeps a typo from becoming a tag nobody can delete.
case "$identifier" in
"" | -* | *[!A-Za-z0-9.-]*) die "not pre-release text: '$identifier' — try beta.2 or rc.1" ;;
*.*) ;;
*) die "not pre-release text: '$identifier' — try beta.2 or rc.1" ;;
esac

branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = next ] ||
	die "pre-releases are published from next, not from ${branch:-a detached HEAD}"

if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

current=$(jq -r .version package.json)
case "$current" in
*-*) ;;
*) die "package.json is on $current, which carries no pre-release suffix — next publishes pre-releases only" ;;
esac

base="${current%%-*}"
version="$base-$identifier"

[ "$version" != "$current" ] || die "package.json is already on $version"

# `sort -V` is the ordering authority: beta.10 follows beta.9, which a string
# comparison gets backwards, and rc follows beta.
highest=$(printf '%s\n%s\n' "$current" "$version" | sort -V | tail -1)
[ "$highest" = "$version" ] ||
	die "$identifier does not follow ${current#*-} — a pre-release only ever moves forward"

# The top section is the newest. If it is still open, opening another would
# leave two, and the release would publish the wrong one.
open=$(awk '/^## / { print; exit }' CHANGELOG.md)
case "$open" in
*unreleased*) die "CHANGELOG.md still has an open section (${open#\#\# }) — publish it before opening another" ;;
esac

# awk rather than `jq`, which would reformat the whole file, and rather than
# `sed -i "0,/re/s//.../"`, whose address-zero form is a GNU extension that BSD
# sed rejects outright — bypassing this script's own refusal path.
awk -v v="$version" '
	!done && /"version":/ {
		sub(/"version": "[^"]*"/, "\"version\": \"" v "\"")
		done = 1
	}
	{ print }
' package.json >package.json.bumping
mv package.json.bumping package.json
[ "$(jq -r .version package.json)" = "$version" ] ||
	die "package.json was not rewritten as expected — check it by hand"

awk -v heading="## $version — unreleased" '
	!inserted && /^## / { print heading; print ""; inserted = 1 }
	{ print }
	END { if (!inserted) { print heading; print "" } }
' CHANGELOG.md >CHANGELOG.md.bumping
mv CHANGELOG.md.bumping CHANGELOG.md

cat <<EOF

Opened $version on next.

  package.json   $current -> $version
  CHANGELOG.md   ## $version — unreleased

Everything delivered from now on is written under that heading. Replacing
"unreleased" with a date is what publishes it, and it is the last thing done
before the push.
EOF
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/tests/scripts/bump-prerelease.test.ts`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add rstest.config.ts src/tests/scripts/harness.ts src/tests/scripts/bump-prerelease.test.ts scripts/bump-prerelease.sh
git commit -m "feat(scripts): open the next pre-release section, and a lane that tests the scripts"
```

---

### Task 2: `consolidate-changelog.sh`

**Files:**
- Create: `scripts/consolidate-changelog.sh`
- Create: `src/tests/scripts/consolidate-changelog.test.ts`

**Interfaces:**
- Consumes: `makeRepo`, `cleanupRepos` from Task 1's harness.
- Produces: CLI `scripts/consolidate-changelog.sh` (no arguments). Leaves one section `## <base>-<highest> — unreleased` and `package.json` on `<base>-<highest>`.

- [ ] **Step 1: Write the failing tests**

`src/tests/scripts/consolidate-changelog.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanupRepos, makeRepo } from "./harness";

afterEach(cleanupRepos);

/** Three published betas, the state of `main` right after `next` is merged. */
const threeBetas = `# Changelog

## 1.6.0-beta.3 — 2026-09-10

### Fixed

- The handles sat inside their ring.

## 1.6.0-beta.2 — 2026-09-05

### Added

- A tool picker.

### Fixed

- A camera left Live without its picture.

## 1.6.0-beta.1 — 2026-09-01

### Added

- An image item.

## 1.5.3 — 2026-08-23

### Fixed

- An old thing.
`;

describe("consolidate-changelog.sh", () => {
  it("merges every pre-release section of the base into the highest one", () => {
    const repo = makeRepo({ version: "1.6.0-beta.3", changelog: threeBetas });

    const result = repo.run("consolidate-changelog.sh");
    expect(result.status).toBe(0);

    const out = repo.read("CHANGELOG.md");
    // One section for the line, headed by the highest, and open again: the text
    // under it has never been published in this form.
    expect(out).toContain("## 1.6.0-beta.3 — unreleased");
    expect(out).not.toContain("## 1.6.0-beta.2");
    expect(out).not.toContain("## 1.6.0-beta.1");
    // Older sections are untouched.
    expect(out).toContain("## 1.5.3 — 2026-08-23");

    // Subsections in the canonical order, whatever order the betas used.
    expect(out.indexOf("### Added")).toBeLessThan(out.indexOf("### Fixed"));
    // Entries in the order they happened, oldest beta first.
    expect(out.indexOf("An image item")).toBeLessThan(out.indexOf("A tool picker"));
    expect(out.indexOf("A camera left Live")).toBeLessThan(out.indexOf("sat inside their ring"));
    // Nothing is lost.
    for (const entry of [
      "An image item",
      "A tool picker",
      "A camera left Live",
      "sat inside their ring",
    ]) {
      expect(out).toContain(entry);
    }
  });

  it("writes package.json to the highest rather than trusting the merge", () => {
    // A plausible mis-resolution of the merge conflict: main's own version won.
    const repo = makeRepo({ version: "1.5.3", changelog: threeBetas });

    expect(repo.run("consolidate-changelog.sh").status).toBe(0);
    expect(repo.read("package.json")).toContain('"version": "1.6.0-beta.3"');
  });

  it("orders by SemVer precedence: beta.10 is the highest, not beta.9", () => {
    const repo = makeRepo({
      version: "1.6.0-beta.10",
      changelog: `# Changelog

## 1.6.0-beta.10 — 2026-09-20

### Fixed

- Ten.

## 1.6.0-beta.9 — 2026-09-15

### Fixed

- Nine.
`,
    });

    expect(repo.run("consolidate-changelog.sh").status).toBe(0);
    expect(repo.read("CHANGELOG.md")).toContain("## 1.6.0-beta.10 — unreleased");
    expect(repo.read("CHANGELOG.md").indexOf("Nine")).toBeLessThan(
      repo.read("CHANGELOG.md").indexOf("Ten"),
    );
  });

  it("an rc outranks every beta", () => {
    const repo = makeRepo({
      version: "1.6.0-rc.1",
      changelog: `# Changelog

## 1.6.0-rc.1 — 2026-09-20

### Fixed

- Late.

## 1.6.0-beta.7 — 2026-09-15

### Added

- Early.
`,
    });

    expect(repo.run("consolidate-changelog.sh").status).toBe(0);
    expect(repo.read("CHANGELOG.md")).toContain("## 1.6.0-rc.1 — unreleased");
  });

  it("refuses when there is nothing to consolidate", () => {
    const repo = makeRepo({
      version: "1.5.3",
      changelog: "# Changelog\n\n## 1.5.3 — 2026-08-23\n\n### Fixed\n\n- A thing.\n",
    });

    const result = repo.run("consolidate-changelog.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no pre-release section");
  });

  it("refuses when the stable section already exists", () => {
    const repo = makeRepo({
      version: "1.6.0-beta.1",
      changelog: `# Changelog

## 1.6.0 — 2026-09-30

### Added

- Shipped already.

## 1.6.0-beta.1 — 2026-09-01

### Added

- A thing.
`,
    });

    const result = repo.run("consolidate-changelog.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("already has a section");
  });

  it("refuses off main, and refuses a dirty tree", () => {
    const onNext = makeRepo({ branch: "next", version: "1.6.0-beta.3", changelog: threeBetas });
    expect(onNext.run("consolidate-changelog.sh").stderr).toContain("from main");

    const dirty = makeRepo({ version: "1.6.0-beta.3", changelog: threeBetas, dirty: true });
    const result = dirty.run("consolidate-changelog.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not clean");
    expect(dirty.read("CHANGELOG.md")).toContain("## 1.6.0-beta.2");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/scripts/consolidate-changelog.test.ts`
Expected: all fail, `bash` exits 127 — no such script.

- [ ] **Step 3: Write the script**

`scripts/consolidate-changelog.sh`, then `chmod +x`:

```bash
#!/usr/bin/env bash
#
# Merge every pre-release section of a line into one, on main, after the merge.
#
#   scripts/consolidate-changelog.sh
#
# Step 4 of the shipping sequence in AGENTS.md § Branches. It is deliberately
# NOT the step that closes the version: between this script and
# `close-version.sh` sits the editorial pass, and **the absence of the
# `## <base>` heading is what forbids the stable release** while it happens.
# Merging the two commands would throw that away.
#
# The section it writes says `unreleased`, and carries the number of the highest
# pre-release rather than a fresh one: the merged content IS that build's
# content, nothing was added since, and a new number would name a build that
# never existed. The text under it, however, has never been published in this
# form — hence `unreleased`.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 0 ] || die "usage: ${0##*/}   (no arguments)"

cd "$(git rev-parse --show-toplevel)"

branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = main ] ||
	die "a line is consolidated on its way out, from main, not from ${branch:-a detached HEAD}"

if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

# Every `## <version>` heading whose version carries a pre-release suffix.
mapfile -t pre < <(awk '/^## [0-9]/ { print $2 }' CHANGELOG.md | grep -- '-' || true)
[ ${#pre[@]} -gt 0 ] || die "CHANGELOG.md has no pre-release section to consolidate"

highest=$(printf '%s\n' "${pre[@]}" | sort -V | tail -1)
base="${highest%%-*}"

# A dated stable section means this line has already shipped; consolidating
# again would fold published sections into a heading that is no longer open.
if awk -v b="$base" '/^## / && $2 == b { found = 1 } END { exit !found }' CHANGELOG.md; then
	die "CHANGELOG.md already has a section for $base — this line has shipped"
fi

mapfile -t members < <(printf '%s\n' "${pre[@]}" | grep "^$base-" | sort -V)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Oldest first: the entries read in the order the work happened.
for version in "${members[@]}"; do
	awk -v ver="$version" -v out="$work" '
		index($0, "## " ver " ") == 1 { insec = 1; next }
		insec && /^## / { insec = 0 }
		!insec { next }
		/^### / { type = substr($0, 5); next }
		type != "" { print >> (out "/" type) }
	' CHANGELOG.md
done

{
	echo "## $highest — unreleased"
	echo
	# AGENTS.md § Changelog rule 3 fixes this order, and it is not the order the
	# betas were written in.
	for type in Added Changed Fixed Removed Deprecated Security; do
		[ -s "$work/$type" ] || continue
		echo "### $type"
		echo
		# Each beta's subsection ends with a blank line, so the seams double up.
		awk 'NF { blank = 0; print; next } !blank { blank = 1; print }' "$work/$type"
	done
} >"$work/section"

# Everything above the first section heading: the title and its blank line.
awk '/^## / { exit } { print }' CHANGELOG.md >"$work/head"

# Every section that is not one of the members, in their original order.
awk -v list="$(printf '%s ' "${members[@]}")" '
	BEGIN { n = split(list, m, " "); for (i = 1; i <= n; i++) if (m[i] != "") drop[m[i]] = 1 }
	/^## / { seen = 1; skip = ($2 in drop) }
	seen && !skip
' CHANGELOG.md >"$work/tail"

cat "$work/head" "$work/section" "$work/tail" >CHANGELOG.md.consolidating
mv CHANGELOG.md.consolidating CHANGELOG.md

# Written, not inherited: the merge that brought the line onto main resolves
# package.json by hand, and resolving it the other way leaves main claiming a
# stable version against a pre-release section, which nothing else would catch.
awk -v v="$highest" '
	!done && /"version":/ {
		sub(/"version": "[^"]*"/, "\"version\": \"" v "\"")
		done = 1
	}
	{ print }
' package.json >package.json.consolidating
mv package.json.consolidating package.json

cat <<EOF

Consolidated ${#members[@]} sections into ## $highest — unreleased.

  merged        ${members[*]}
  package.json  $highest

Now prune it: an entry that fixes something this same version ADDED describes a
bug no user of a stable release ever met, and belongs to the beta's testers
rather than to $base's notes. Then close the version:

  scripts/close-version.sh
EOF
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/tests/scripts/consolidate-changelog.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/consolidate-changelog.sh src/tests/scripts/consolidate-changelog.test.ts
git commit -m "feat(scripts): consolidate a line's pre-release sections into one"
```

---

### Task 3: `close-version.sh`

**Files:**
- Create: `scripts/close-version.sh`
- Create: `src/tests/scripts/close-version.test.ts`

**Interfaces:**
- Consumes: the harness; the state `consolidate-changelog.sh` leaves.
- Produces: CLI `scripts/close-version.sh` (no arguments). Leaves `package.json` on the base version and `## <base> — <today>`.

- [ ] **Step 1: Write the failing tests**

`src/tests/scripts/close-version.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanupRepos, makeRepo } from "./harness";

afterEach(cleanupRepos);

/** What consolidate-changelog.sh leaves behind. */
const consolidated = `# Changelog

## 1.6.0-beta.3 — unreleased

### Added

- An image item.

## 1.5.3 — 2026-08-23

### Fixed

- An old thing.
`;

const today = new Date().toISOString().slice(0, 10);

describe("close-version.sh", () => {
  it("strips the suffix and dates the heading — the two acts that publish", () => {
    const repo = makeRepo({ version: "1.6.0-beta.3", changelog: consolidated });

    const result = repo.run("close-version.sh");

    expect(result.status).toBe(0);
    expect(repo.read("package.json")).toContain('"version": "1.6.0"');
    expect(repo.read("CHANGELOG.md")).toContain(`## 1.6.0 — ${today}`);
    expect(repo.read("CHANGELOG.md")).not.toContain("beta.3");
  });

  it("refuses while pre-release sections are still separate", () => {
    const repo = makeRepo({
      version: "1.6.0-beta.3",
      changelog: `# Changelog

## 1.6.0-beta.3 — unreleased

### Fixed

- A thing.

## 1.6.0-beta.2 — 2026-09-05

### Added

- Another.
`,
    });

    const result = repo.run("close-version.sh");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("consolidate-changelog.sh");
    expect(repo.read("package.json")).toContain('"version": "1.6.0-beta.3"');
  });

  it("refuses when the top section is not the version package.json is on", () => {
    const repo = makeRepo({ version: "1.6.0-beta.2", changelog: consolidated });

    const result = repo.run("close-version.sh");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("consolidate-changelog.sh");
  });

  it("refuses a version that carries no suffix — there is nothing to close", () => {
    const repo = makeRepo({
      version: "1.6.0",
      changelog: "# Changelog\n\n## 1.6.0 — 2026-09-30\n\n### Added\n\n- A thing.\n",
    });

    const result = repo.run("close-version.sh");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no pre-release suffix");
  });

  it("refuses off main, and refuses a dirty tree", () => {
    const onNext = makeRepo({ branch: "next", version: "1.6.0-beta.3", changelog: consolidated });
    expect(onNext.run("close-version.sh").stderr).toContain("from main");

    const dirty = makeRepo({ version: "1.6.0-beta.3", changelog: consolidated, dirty: true });
    const result = dirty.run("close-version.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not clean");
    expect(dirty.read("CHANGELOG.md")).toContain("unreleased");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/scripts/close-version.test.ts`
Expected: all fail — no such script.

- [ ] **Step 3: Write the script**

`scripts/close-version.sh`, then `chmod +x`:

```bash
#!/usr/bin/env bash
#
# Close a version: drop the pre-release suffix, date the heading.
#
#   scripts/close-version.sh
#
# Step 6 of the shipping sequence in AGENTS.md § Branches, and the act that
# permits the stable release: until the `## <base>` heading exists, the release
# workflow has no section to publish and refuses. It is separate from
# `consolidate-changelog.sh` on purpose — the editorial pass happens between
# them, and this command is how the user says the pruning is done.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 0 ] || die "usage: ${0##*/}   (no arguments)"

cd "$(git rev-parse --show-toplevel)"

branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = main ] ||
	die "a version is closed on main, not on ${branch:-a detached HEAD}"

if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

current=$(jq -r .version package.json)
case "$current" in
*-*) ;;
*) die "package.json is on $current, which carries no pre-release suffix — there is nothing to close" ;;
esac

base="${current%%-*}"

top=$(awk '/^## / { print $2; exit }' CHANGELOG.md)
[ "$top" = "$current" ] ||
	die "the top section is $top and package.json is on $current — run scripts/consolidate-changelog.sh first"

# One section for the line, or the consolidation has not run. Checked rather
# than assumed: closing here would publish one beta's notes as the whole minor.
remaining=$(awk -v b="$base-" '/^## / && index($2, b) == 1 { print $2 }' CHANGELOG.md |
	grep -v "^$current\$" || true)
if [ -n "$remaining" ]; then
	echo "$remaining" | sed 's/^/  /' >&2
	die "these pre-release sections are still separate — run scripts/consolidate-changelog.sh first"
fi

date=$(date +%F)

awk -v v="$base" '
	!done && /"version":/ {
		sub(/"version": "[^"]*"/, "\"version\": \"" v "\"")
		done = 1
	}
	{ print }
' package.json >package.json.closing
mv package.json.closing package.json

awk -v old="## $current" -v new="## $base — $date" '
	!done && index($0, old) == 1 { print new; done = 1; next }
	{ print }
' CHANGELOG.md >CHANGELOG.md.closing
mv CHANGELOG.md.closing CHANGELOG.md

cat <<EOF

Closed $base.

  package.json   $current -> $base
  CHANGELOG.md   ## $base — $date

Commit, then the push of main publishes it to every user of the card. Delete
next afterwards: until it is gone it still claims a version that has shipped,
and the release workflow will refuse any further pre-release of it.
EOF
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/tests/scripts/close-version.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/close-version.sh src/tests/scripts/close-version.test.ts
git commit -m "feat(scripts): close a version, which is what permits its release"
```

---

### Task 4: `release-notes.sh`

**Files:**
- Create: `scripts/release-notes.sh`
- Create: `src/tests/scripts/release-notes.test.ts`

**Interfaces:**
- Consumes: the harness.
- Produces: CLI `scripts/release-notes.sh <version>` — prints the section body on stdout, refuses on stderr. Task 5's workflow calls it.

- [ ] **Step 1: Write the failing tests**

`src/tests/scripts/release-notes.test.ts`:

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanupRepos, makeRepo } from "./harness";

afterEach(cleanupRepos);

const file = `# Changelog

## 1.6.10 — 2026-10-01

### Fixed

- Ten.

## 1.6.1 — 2026-09-25

### Fixed

- One.

## 1.6.0-beta.2 — unreleased

### Added

- Not out yet.

## 1.6.0-beta.1 — 2026-09-01

### Added

- An image item.
`;

describe("release-notes.sh", () => {
  it("prints the section of the exact version and nothing else", () => {
    const repo = makeRepo({ version: "1.6.0-beta.1", changelog: file });

    const result = repo.run("release-notes.sh", "1.6.0-beta.1");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("An image item");
    expect(result.stdout).not.toContain("Not out yet");
    expect(result.stdout).not.toContain("## ");
  });

  it("never mistakes 1.6.1 for 1.6.10", () => {
    const repo = makeRepo({ version: "1.6.1", changelog: file });

    expect(repo.run("release-notes.sh", "1.6.1").stdout).toContain("One.");
    expect(repo.run("release-notes.sh", "1.6.1").stdout).not.toContain("Ten.");
  });

  it("refuses a section still marked unreleased", () => {
    const repo = makeRepo({ version: "1.6.0-beta.2", changelog: file });

    const result = repo.run("release-notes.sh", "1.6.0-beta.2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unreleased");
  });

  it("refuses a version with no section at all", () => {
    const repo = makeRepo({ version: "1.7.0", changelog: file });

    const result = repo.run("release-notes.sh", "1.7.0");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no section");
  });

  it("refuses an empty section", () => {
    const repo = makeRepo({
      version: "1.6.2",
      changelog: "# Changelog\n\n## 1.6.2 — 2026-10-05\n\n## 1.6.1 — 2026-09-25\n\n### Fixed\n\n- One.\n",
    });

    const result = repo.run("release-notes.sh", "1.6.2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("empty");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/scripts/release-notes.test.ts`
Expected: all fail — no such script.

- [ ] **Step 3: Write the script**

`scripts/release-notes.sh`, then `chmod +x`:

```bash
#!/usr/bin/env bash
#
# Print one version's changelog section, or refuse.
#
#   scripts/release-notes.sh 1.6.0-beta.2
#
# Called by .github/workflows/release.yml, and living here rather than inside
# the YAML because this is the step that decides what gets published: in a
# script it is exercised by `pnpm test`, in a `run:` block it is exercised by a
# release.
#
# **The version is matched exactly**, suffix included. Since every published
# artefact has its own section, there is no base-version indirection left — and
# the character class below is what keeps `## 1.6.1` from matching `## 1.6.10`,
# or `## 1.6.0` from swallowing `## 1.6.0-beta.1`.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 1 ] || die "usage: ${0##*/} <version>"

cd "$(git rev-parse --show-toplevel)"

version="$1"

heading=$(awk -v ver="$version" '
	index($0, "## " ver) == 1 {
		rest = substr($0, length("## " ver) + 1)
		if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { print; exit }
	}
' CHANGELOG.md)

[ -n "$heading" ] || die "CHANGELOG.md has no section for $version"

case "$heading" in
*unreleased*) die "CHANGELOG.md still marks $version as unreleased" ;;
esac

body=$(awk -v ver="$version" '
	found && /^## / { exit }
	found { print }
	index($0, "## " ver) == 1 {
		rest = substr($0, length("## " ver) + 1)
		if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { found = 1 }
	}
' CHANGELOG.md)

printf '%s\n' "$body" | grep -q '[^[:space:]]' ||
	die "CHANGELOG.md section for $version is empty"

printf '%s\n' "$body"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/tests/scripts/release-notes.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/release-notes.sh src/tests/scripts/release-notes.test.ts
git commit -m "feat(scripts): the release notes come from a script the tests can reach"
```

---

### Task 5: `release.yml` — exact version, one catch gone, one added

**Files:**
- Modify: `.github/workflows/release.yml` (the "Extract the changelog section" step, and a new step after "The branch and the version must agree")

**Interfaces:**
- Consumes: `scripts/release-notes.sh <version>` from Task 4.
- Produces: nothing later tasks read.

- [ ] **Step 1: Replace the extraction step**

Delete the whole `- name: Extract the changelog section` step — its base-version derivation, its `unreleased` catch and its inverted catch all go — and put this in its place:

```yaml
      - name: Extract the changelog section
        if: steps.gate.outputs.release == 'true'
        env:
          VERSION: ${{ steps.version.outputs.version }}
        # Every published artefact has its own section, so this is an exact
        # match and there is no base-version indirection left. The script
        # refuses an absent section, an empty one, and one still marked
        # `unreleased` — the catch that keeps an in-progress version from being
        # shipped by an accidental push. It lives in scripts/ so `pnpm test`
        # exercises it; see scripts/release-notes.sh.
        run: scripts/release-notes.sh "$VERSION" > release-notes.md
```

- [ ] **Step 2: Add the replacement for the inverted catch**

Immediately after the `- name: The branch and the version must agree` step:

```yaml
      # What the changelog's inverted catch used to infer from a heading's date,
      # asked directly of the tags. A pre-release of a version that is already
      # out can only come from a `next` that was never recreated from `main`
      # after its line shipped — publishing betas of a version users already
      # have. The check is skipped for a stable, which is what `contains` does
      # here.
      - name: A pre-release of a version already out is a stale next
        if: >
          steps.gate.outputs.release == 'true' &&
          contains(steps.version.outputs.version, '-')
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          set -euo pipefail

          base="${VERSION%%-*}"

          if gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/v$base" >/dev/null 2>&1; then
            echo "::error::v$base is already released, so $VERSION can only come from a next that was never recreated"
            exit 1
          fi

          echo "v$base is not out; $VERSION is a pre-release of it."
```

- [ ] **Step 3: Lint the workflow the way CI does**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color`
Expected: exit 0, no output.

- [ ] **Step 4: Simulate the extraction against the real file**

Run:
```bash
jq -r .version package.json
scripts/release-notes.sh "$(jq -r .version package.json)" | head -5
```
Expected: on `main` at `1.5.3`, the `### Fixed` bullets of `## 1.5.3 — 2026-08-23`. This is the same simulation spec decision 12 asks for, done by hand once against the file the workflow will read.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(release): publish the section of the exact version, and ask the tags what the date used to imply"
```

---

### Task 6: `open-prerelease.sh` takes the identifier

**Files:**
- Modify: `scripts/open-prerelease.sh:44` and its closing message (lines 173-178)
- Create: `src/tests/scripts/open-prerelease.test.ts`

**Interfaces:**
- Consumes: the harness.
- Produces: CLI `scripts/open-prerelease.sh <minor> [identifier]`.

**Deviation from spec decision 4, flagged:** the identifier defaults to `beta.1`. The spec's rule — "the identifier is an argument, never an increment" — is about *succession*, which cannot be guessed; the first pre-release of a line conventionally is `beta.1`, and requiring it to be typed would be noise on the one call that is never ambiguous. The argument is accepted so that a line can open on `rc.1`.

- [ ] **Step 1: Write the failing tests**

`src/tests/scripts/open-prerelease.test.ts`. The script's own refusals (remote state, branch positions) are not re-tested here; this covers the new argument and the message.

```ts
import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanupRepos, makeRepo } from "./harness";

afterEach(cleanupRepos);

describe("open-prerelease.sh", () => {
  it("rejects an identifier that is not pre-release text, before touching anything", () => {
    const repo = makeRepo({
      version: "1.5.3",
      changelog: "# Changelog\n\n## 1.5.3 — 2026-08-23\n\n### Fixed\n\n- A thing.\n",
    });

    const result = repo.run("open-prerelease.sh", "1.6", "1.6.0");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("pre-release text");
    expect(repo.read("package.json")).toContain('"version": "1.5.3"');
  });

  it("still refuses a leading v on the minor", () => {
    const repo = makeRepo({
      version: "1.5.3",
      changelog: "# Changelog\n\n## 1.5.3 — 2026-08-23\n\n### Fixed\n\n- A thing.\n",
    });

    const result = repo.run("open-prerelease.sh", "v1.6");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("drop the leading v");
  });

  it("takes at most two arguments", () => {
    const repo = makeRepo({
      version: "1.5.3",
      changelog: "# Changelog\n\n## 1.5.3 — 2026-08-23\n\n### Fixed\n\n- A thing.\n",
    });

    expect(repo.run("open-prerelease.sh", "1.6", "beta.1", "extra").status).not.toBe(0);
    expect(repo.run("open-prerelease.sh").status).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/tests/scripts/open-prerelease.test.ts`
Expected: the first and third cases fail (the script takes exactly one argument today and would refuse the two-argument form with a usage error mentioning neither "pre-release text" nor accepting the valid call); the second passes already.

- [ ] **Step 3: Change the argument handling**

In `scripts/open-prerelease.sh`, replace the usage guard:

```bash
[ $# -ge 1 ] && [ $# -le 2 ] ||
	die "usage: ${0##*/} <minor> [identifier]   e.g. ${0##*/} 1.6   or   ${0##*/} 1.6 rc.1"
```

and, after `arg="$1"`, add:

```bash
# The identifier is the caller's, because a line does not have to open on a
# beta. It defaults to beta.1: unlike a *successor*, which nobody can guess,
# the first pre-release of a line has a conventional name.
identifier="${2-beta.1}"
case "$identifier" in
"" | -* | *[!A-Za-z0-9.-]*) die "not pre-release text: '$identifier' — try beta.1 or rc.1" ;;
*.*) ;;
*) die "not pre-release text: '$identifier' — try beta.1 or rc.1" ;;
esac
```

Then line 44 becomes:

```bash
version="$base-$identifier"
```

- [ ] **Step 4: Rewrite the closing message**

The last paragraph of the heredoc states the rule this work replaces. Replace it with:

```
Pushing next publishes a pre-release, offered only to HACS users who turned on
"Show beta versions". Everything delivered from now on is written under
## $version, and replacing "unreleased" with a date is what publishes it.

The NEXT pre-release opens at the first delivery that follows a publication,
with the identifier you choose:

  scripts/bump-prerelease.sh beta.2
  scripts/bump-prerelease.sh rc.1
```

Also change the heading the script inserts, from the base version to the full one:

```bash
awk -v heading="## $version — unreleased" '
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/tests/scripts/open-prerelease.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/open-prerelease.sh src/tests/scripts/open-prerelease.test.ts
git commit -m "feat(scripts): a line may open on any pre-release identifier"
```

---

### Task 7: The `ship-version` skill

**Files:**
- Create: `.claude/skills/ship-version/SKILL.md`

**Interfaces:**
- Consumes: `scripts/consolidate-changelog.sh`, `scripts/close-version.sh`.
- Produces: nothing later tasks read.

- [ ] **Step 1: Write the skill**

`.claude/skills/ship-version/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Check the skill is discoverable**

Run: `ls .claude/skills/ && head -5 .claude/skills/ship-version/SKILL.md`
Expected: `review-codebase` and `ship-version`; the frontmatter opens with `---` and `name: ship-version`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/ship-version/SKILL.md
git commit -m "feat(skills): shipping a line is a procedure, and its editorial pass has a rule"
```

---

### Task 8: `AGENTS.md`

**Files:**
- Modify: `AGENTS.md` § Branches (the shipping sequence, step 4), § Changelog (rules 6 and 7)

**Interfaces:** none.

- [ ] **Step 1: Rewrite § Changelog rule 6**

Replace the whole of rule 6 — from "**The bump opens the version, it does not close it.**" to the end of that rule — with:

```markdown
6. **The bump opens the version, it does not close it.** When the user calls for
   a new version, `package.json` and the `CHANGELOG.md` heading both take the
   new number straight away, and the heading's date reads `unreleased`:

   ```
   ## 1.6.0 — unreleased
   ```

   Everything delivered from then on is written under that heading. Replacing
   `unreleased` with a real date is the act that releases the version, and it is
   the last thing done, not the first.

   **Every published artefact has its own section, pre-releases included** —
   `## 1.6.0-beta.2 — 2026-09-05` sits above `## 1.6.0-beta.1 — 2026-09-01` —
   so the notes of a beta say what changed since the build its testers are
   running, and nothing else. The rule is the same on both lines; only the
   suffix differs.

   **A published section is frozen.** Work that changes what an earlier
   pre-release described gets a new entry in the current section, never an edit
   to the old one: the release notes GitHub has published cannot be rewritten,
   and a file that disagrees with them is worse than a repetition.

   **The next section opens at the first delivery that follows a publication**,
   with `scripts/bump-prerelease.sh <identifier>` — and only then, because only
   then is it known whether the next pre-release is a `beta.8` or an `rc.1`.
   The trap this avoids is silent: an entry written into the dated section of a
   published beta, pushed without a bump, gives a green CI and **no release at
   all**. The release job finds the tag already there, reports "nothing to
   release", and succeeds.
```

- [ ] **Step 2: Rewrite § Changelog rule 7**

Replace the whole of rule 7 with:

```markdown
7. **The date is the safety catch, and the release workflow enforces it.** Its
   changelog step refuses to publish while the section for the version in
   `package.json` still says `unreleased`, and refuses just as flatly when that
   version has no section at all. So an in-progress version cannot be shipped by
   an accidental push, and the catch is a property of the pipeline rather than a
   habit anyone has to remember. One rule, both branches: the section is matched
   on the **exact** version, suffix included.

   Two guards stand beside it. A suffixed version cannot be published from
   `main` and an unsuffixed one cannot be published from `next` — that one
   exists because forgetting the `-beta` suffix is the only mistake here that
   cannot be taken back, since it sends a feature build to every user as a
   stable release. And a pre-release of a version that is **already released**
   is refused outright: it can only come from a `next` that was never recreated
   after its line shipped.
```

- [ ] **Step 3: Rewrite the shipping sequence in § Branches**

Replace step 4 of the numbered list ("**Close the version, and only when the user asks for it**: …") with:

```markdown
4. **Consolidate the line's sections into one, and only when the user asks for
   it**: `scripts/consolidate-changelog.sh` merges every `## 1.6.0-<pre>`
   section into one headed by the highest of them, still `unreleased`, and
   writes `package.json` to that same version rather than trusting how the merge
   resolved it.
5. **Prune it.** Those sections were written for testers. An entry that fixes
   something this same version *added* describes a bug no user of a stable
   release ever met, and does not belong in `1.6.0`'s notes. The `ship-version`
   skill does this pass and proposes every cut with its reason; nothing is cut
   without the user's approval.
6. **Close the version**: `scripts/close-version.sh` drops the suffix from
   `package.json` and dates the heading — `## 1.6.0 — 2026-09-30`. **Until that
   heading exists the stable cannot be published**, which is what makes the
   pruning a gate rather than a good intention.
```

and renumber the two steps that followed (the push, then deleting `next`) to 7 and 8.

- [ ] **Step 4: Verify the file still reads as one document**

Run: `grep -n "^[0-9]\." AGENTS.md | sed -n '1,40p'`
Expected: the shipping sequence numbers run 1 to 8 with no repeat, and § Changelog's rules run 1 to 7.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): a section per published artefact, and the two steps that shipping a line gains"
```

---

### Task 9: The memory, and the full verification

**Files:**
- Modify: `.serena/memories/picture-studio/state.md`

**Interfaces:** none.

- [ ] **Step 1: Add the section to the memory**

`state.md` belongs to `main`, and this branch targets `main`, so the pre-commit hook allows it. Add, after the release/versioning material:

```markdown
## One changelog section per published artefact — 2026-08-31

Spec: `docs/superpowers/specs/2026-08-31-changelog-per-prerelease-design.md`.
`AGENTS.md` § Changelog rules 6-7 are the contract; this is what would bite.

**`release.yml` runs from the default branch.** A `workflow_run` job always
executes the copy of the workflow on `main`, whatever branch CI ran on. A
release change that sits only on `next` does nothing at all — verified against
GitHub's documentation, and the reason this work landed on `main` first.

**The silent failure the scripts exist to prevent:** an entry written into the
dated section of a published pre-release, pushed without a bump, gives a green
CI and no release. The gate finds the tag already there, reports "nothing to
release", and succeeds. Nothing says the work was never published.

**Consolidating and closing are two commands on purpose.** Between them, the
`## 1.6.0` heading does not exist, and that absence is what forbids the stable
release while the pruning is read. Merging them into one script throws the
guarantee away — see spec decision 7 before touching either.

**`sort -V` is the ordering authority** in all three scripts: `beta.10` follows
`beta.9`, which a string comparison gets backwards, and `rc` follows `beta`.

**The pruning has a verifiable question**, which is what keeps it from being a
matter of taste: does the entry's subject appear in this same version's
`Added`? If yes, the feature never shipped, so no user of a stable release met
the bug. On the six `Fixed` entries of `1.6.0` as they stood on 2026-08-31, that
question decided all six correctly.
```

- [ ] **Step 2: Run everything CI runs, in CI's order**

Run:
```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: all exit 0. `pnpm test` now reports **three** projects; record the new `testFiles` and `passedTests` figures — the baseline in `state.md` § The green baseline must be refreshed in the same breath, per `AGENTS.md` § Project memory rule 6.

- [ ] **Step 3: Refresh the baseline**

In `state.md` § The green baseline, replace the measured table row and the date with what Step 2 printed.

- [ ] **Step 4: Commit**

```bash
git add .serena/memories/picture-studio/state.md
git commit -m "chore(memory): what would bite whoever touches the release scripts next"
```

---

### Task 10: Reshape `next`'s own section (after this lands on `main`)

**Files:**
- Modify (on `next`, not on this branch): `CHANGELOG.md`

**Interfaces:** none.

**This task runs only after** the work above is merged onto `main`, `main` is pushed — which publishes nothing, since `main` is on `1.5.3` and `v1.5.3` is already tagged — and `main` is back-merged into `next`, which `AGENTS.md` § Closing a session already owes.

- [ ] **Step 1: Rename the open section on `next`**

On `next`, with a clean tree: `## 1.6.0 — unreleased` becomes `## 1.6.0-beta.1 — unreleased`, matching `package.json`'s `1.6.0-beta.1`. Nothing else changes — no beta has been published on this line, so there is no history to convert.

- [ ] **Step 2: Check the workflow would accept it**

Run: `scripts/release-notes.sh 1.6.0-beta.1`
Expected: it refuses, naming `unreleased` — which is correct and is the catch working. Replacing `unreleased` with the date is what the user does at the moment they choose to publish.

- [ ] **Step 3: Commit on `next`**

```bash
git add CHANGELOG.md
git commit -m "chore(changelog): the open section carries the pre-release it belongs to"
```

---

## Self-Review

**Spec coverage.** Decision 1 → Tasks 6, 8, 10. Decision 2 → Task 8. Decision 3 → Task 1, Task 8. Decision 4 → Tasks 1, 2, 6. Decision 5 → Tasks 2, 3, 7, 8. Decision 6 → Task 2. Decision 7 → Tasks 2, 3, 7, 9. Decision 8 → Tasks 4, 5. Decision 9 → Global Constraints, Tasks 9, 10. Decision 10 → Tasks 1-4, 6, 7. Decision 11 → Task 7. Decision 12 → Tasks 1-4, 6, Task 9 step 2. Decision 13 → Task 10.

**Placeholders.** None: every step carries the file content or the command it needs.

**Type consistency.** `makeRepo`, `cleanupRepos`, `published` and `Fixture.run/read` are defined in Task 1 and used with those names in Tasks 2, 3, 4 and 6. The script names in the skill (Task 7), in `AGENTS.md` (Task 8) and in `open-prerelease.sh`'s message (Task 6) match the files created in Tasks 1-4.

**One thing the review removed rather than recorded:** the harness first carried a `write` and a `commitAll` no test used. They were speculative, so they are gone; a task that needs a second commit adds them then.
