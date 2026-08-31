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
