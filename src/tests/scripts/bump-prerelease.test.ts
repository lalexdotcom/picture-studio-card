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

  it("refuses when package.json carries no pre-release suffix", () => {
    // The state next is in right after being recreated from main and before
    // open-prerelease.sh has run: the version has no suffix yet.
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0",
      changelog: published("1.5.3"),
    });

    const result = repo.run("bump-prerelease.sh", "beta.1");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("carries no pre-release suffix");
  });

  it("refuses an identifier that is not pre-release text", () => {
    const repo = makeRepo({
      branch: "next",
      version: "1.6.0-beta.1",
      changelog: published("1.6.0-beta.1"),
    });

    const version = repo.run("bump-prerelease.sh", "1.7.0");
    expect(version.status).not.toBe(0);
    expect(version.stderr).toContain("not pre-release text");

    const space = repo.run("bump-prerelease.sh", "beta 2");
    expect(space.status).not.toBe(0);
    expect(space.stderr).toContain("not pre-release text");
  });
});
