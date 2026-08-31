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
