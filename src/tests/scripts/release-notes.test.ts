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
    expect(result.stdout).not.toContain("\n## ");
  });

  it("never mistakes 1.6.1 for 1.6.10", () => {
    const repo = makeRepo({ version: "1.6.1", changelog: file });

    expect(repo.run("release-notes.sh", "1.6.1").stdout).toContain("One.");
    expect(repo.run("release-notes.sh", "1.6.1").stdout).not.toContain("Ten.");
    expect(repo.run("release-notes.sh", "1.6.1").stdout).not.toContain("Not out yet");
  });

  it("never mistakes 1.6.0 for 1.6.0-beta.1", () => {
    const changelog =
      "# Changelog\n\n## 1.6.0-beta.1 — 2026-09-01\n\n### Added\n\n- An image item.\n";
    const repo = makeRepo({ version: "1.6.0", changelog });

    const result = repo.run("release-notes.sh", "1.6.0");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no section");
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
      changelog:
        "# Changelog\n\n## 1.6.2 — 2026-10-05\n\n## 1.6.1 — 2026-09-25\n\n### Fixed\n\n- One.\n",
    });

    const result = repo.run("release-notes.sh", "1.6.2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("empty");
  });
});
