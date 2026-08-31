import { execFileSync } from "node:child_process";
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

// Run through the same command the script uses so test and script share one
// clock and one timezone — new Date().toISOString() is UTC and diverges in any
// zone east or west of it.
const today = execFileSync("date", ["+%F"], { encoding: "utf8" }).trim();

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
    expect(repo.read("CHANGELOG.md")).toContain("unreleased");
  });

  it("refuses when the top section is not the version package.json is on", () => {
    const repo = makeRepo({ version: "1.6.0-beta.2", changelog: consolidated });

    const result = repo.run("close-version.sh");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("consolidate-changelog.sh");
    expect(repo.read("package.json")).toContain('"version": "1.6.0-beta.2"');
    expect(repo.read("CHANGELOG.md")).toContain("unreleased");
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
    const onNextResult = onNext.run("close-version.sh");
    expect(onNextResult.status).not.toBe(0);
    expect(onNextResult.stderr).toContain("from main");

    const dirty = makeRepo({ version: "1.6.0-beta.3", changelog: consolidated, dirty: true });
    const result = dirty.run("close-version.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not clean");
    expect(dirty.read("CHANGELOG.md")).toContain("unreleased");
    expect(dirty.read("package.json")).toContain('"version": "1.6.0-beta.3"');
  });
});
