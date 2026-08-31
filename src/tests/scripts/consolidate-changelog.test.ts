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
