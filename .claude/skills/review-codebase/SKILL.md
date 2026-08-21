---
name: review-codebase
description: >
  Full multi-agent codebase health-check review — analyzes the ENTIRE tracked
  codebase (not a diff) across bugs, TypeScript type quality, security,
  robustness, architecture, internal conventions, ecosystem best practices,
  readability, performance, and test coverage. Make sure to trigger this
  whenever the user says "review codebase", "audit codebase", "full codebase
  review", "codebase health check", "/project:review-codebase", or asks for a
  comprehensive quality audit of an entire project, repo, or package rather
  than just recent changes. The review can be narrowed to a subset of axes on
  request (e.g. "only security and robustness", "--only types,security",
  "skip performance"). Distinct from review-before-merge, which only looks at a
  git diff before merging a branch — this skill always scans the full project
  and is not tied to a merge/branch workflow.
---

# Review Codebase

Multi-agent full-codebase review skill. Dispatches parallel agents across up
to 10 axes to produce a comprehensive health-check report. Scans the full
tracked codebase by default — no diff mode, no branch/merge framing. Meant to
be run periodically or on demand, not as a merge gate (use
`review-before-merge` for that).

**Usage**:
- `/review-codebase` — reviews the whole repo with all 10 axes.
- `/review-codebase <path>` (e.g. `/review-codebase packages/kyss-js` or
  `/review-codebase apps/driver`) — scopes the review to that package or
  directory only. Same axes, same report format, just a narrower file set. A
  path can also be inferred from a natural-language request naming a specific
  package or directory instead of a slash-command argument.
- `/review-codebase --only <axes>` — runs ONLY the named axes (comma-separated).
- `/review-codebase --skip <axes>` — runs all axes EXCEPT the named ones.
- Flags combine with a path in any order, e.g.
  `/review-codebase packages/kyss-js --only types,security` or
  `/review-codebase --skip performance,readability apps/driver`.
- Natural language works too: "review the codebase but only security and
  robustness", "audit driver, skip performance and readability".

Selecting a subset of axes is also the primary lever for controlling token
cost — a full 10-agent wave on a large monorepo is expensive; a targeted path
plus `--only` on the axes you care about is dramatically cheaper.

---

## Step 1 — Read project context

Before anything else, read:
- `CLAUDE.md` at the project root (conventions, patterns, stack) — always
  read the root one even if scoped to a subpackage, plus a path-scoped
  `CLAUDE.md` inside the target directory if one exists
- `AGENTS.md` if it exists (agent rules)
- `package.json` at the root, and either every workspace package (full
  scan) or just the targeted package (`$ARGUMENTS`, if provided) —
  dependencies here drive stack detection in Step 3
- The basic repo structure to identify the project type

These files define what "good code" means in THIS project. Do not assume
the stack — read it.

---

## Step 2 — Determine scope and selected axes

### Axis selection

The canonical axis IDs are:

```
bugs, types, security, robustness, architecture,
conventions, best-practices, readability, performance, test
```

Parse the invocation for axis flags, accepting common aliases and
normalizing them to the canonical IDs above:
- `type` / `typescript` → `types`
- `sec` → `security`
- `robust` / `concurrency` / `async` → `robustness`
- `arch` → `architecture`
- `conv` / `conventions` → `conventions`
- `bp` / `best practices` / `best-practice` → `best-practices`
- `read` / `comments` / `docs` → `readability`
- `perf` → `performance`
- `tests` / `testing` / `coverage` → `test`
- `bug` → `bugs`

Resolution rules:
- No flag → run **all 10 axes** (default).
- `--only a,b,c` (or natural-language "only …") → run exactly `{a, b, c}`.
- `--skip x,y` (or "skip …") → run all 10 axes minus `{x, y}`.
- If both are somehow given, `--only` wins and `--skip` is ignored (say so).
- If an axis name can't be normalized to a canonical ID, do NOT silently
  drop it — stop and tell the user which token was unrecognized and list the
  valid axis IDs, then ask whether to proceed with the recognized ones.
- If the resulting set is empty, ask for clarification rather than running
  nothing.

Record the final ordered list of selected axes — everything downstream
(agents launched, report header, agent-summary table, scoring, validated
points) operates on this set only.

### File scope

Check for a target path — either `$ARGUMENTS` from a direct
`/review-codebase <path>` invocation, or a package/directory named in a
natural-language request (strip out any recognized axis flags first so a flag
value isn't mistaken for a path).

**Targeted mode** (path given): resolve it against the workspace config
first (a package name like `kyss-js` should resolve to its actual path,
e.g. `packages/kyss-js`) — don't assume the argument is already a valid
relative path. Then:
```
git ls-files -- <resolved-path>
```
If the resolved path doesn't exist or matches nothing, say so and ask for
clarification instead of silently falling back to a full scan.

**Full mode** (no path given): list all tracked files:
```
git ls-files
```

For a pnpm/npm/yarn monorepo, also read the workspace config
(`pnpm-workspace.yaml`, `package.json#workspaces`) to identify individual
packages — needed both to resolve a targeted path and to chunk a full scan.

**Sizing check** (full mode only): if the codebase is large (rough
heuristic: more than ~150 source files, or an agent's input would clearly
blow its context), don't run agents on the whole repo in one pass. Instead:
- Split by workspace package (monorepo) or by top-level source directory
- Run the full selected-axis wave per chunk, sequentially or in batches
- Aggregate all findings into one final report, with a per-package/per-directory
  breakdown

If the codebase is small/medium, run every selected agent on the whole file
set in a single pass. A targeted-mode scan is normally small enough to skip
chunking entirely, even if the overall repo would need it.

---

## Step 3 — Detect stack & gather Best Practices references

*(Skip this step entirely if `best-practices` is not in the selected axes.)*

Parse dependencies from `package.json` (root + all workspaces), plus
telltale config files (`panda.config.ts`, `rstest.config.ts`,
`rsbuild.config.ts`, `react-router.config.ts`, etc.).

Check your available skills for anything matching the detected stack —
this project's own skill library already documents current best practices
for several parts of its stack (e.g. React, TanStack Query, Panda CSS,
Rstest, Better Auth, React Router, Rsbuild/Rspack plugin authoring, modern
CSS). If a relevant skill exists, treat its content as the primary,
authoritative reference for that part of the stack — it's more current and
more specific to this project's conventions than general training
knowledge.

For any stack element with no matching skill (e.g. a library or pattern
not covered by an installed skill), fall back on general knowledge of that
ecosystem's established best practices.

Build a short list: `<stack element> → <skill name | "general knowledge">`.
Pass this list to the Best Practices agent (Step 4, Agent 7) along with the
loaded reference content.

Test framework (only if `test` is selected): identify the test runner
generically from the same signals — `devDependencies` (e.g. `vitest`,
`jest`, `@rstest/core`, `mocha`, `ava`, `@playwright/test`), the `test`
script in `package.json`, a bare `node:test` import, and any runner config
file (`vitest.config.*`, `jest.config.*`, `rstest.config.*`, etc.). Do NOT
assume a specific runner — read it. Then check your available skills for one
matching the detected runner and, if found, pass BOTH its name and its
loaded content to the Test agent as its framework reference (same
primary-source rule as Best Practices). If no matching skill exists, pass
the detected runner name alone and let the agent rely on general knowledge.
This detection is a convenience for the orchestrator; the Test agent is also
told to confirm the runner itself from what it receives, so a wrong or
missing guess here is not fatal.

---

## Step 4 — Run selected agents in parallel

Launch every selected agent **simultaneously** via parallel sub-tasks (or in
batches per chunk if Step 2 required splitting). Only launch agents whose
axis is in the selected set. Each agent receives:
1. The scope content (the relevant file set)
2. The content of `CLAUDE.md`
3. Its specific system prompt (see below)
4. For the Best Practices agent only: the stack-to-reference mapping and
   loaded skill content from Step 3
5. For the Test agent only: the root `package.json` and any test-runner
   config files (so it can self-identify the runner), plus — if Step 3
   matched one — the name and loaded content of the runner's skill

**Model per agent**: each agent header below specifies a `model`. Pass it
explicitly as the `model` parameter of the sub-task invocation — an explicit
model on the invocation takes precedence over `CLAUDE_CODE_SUBAGENT_MODEL`,
which only fills in a default for sub-tasks that don't specify one. Do not
rely on the ambient default; set it per agent every time.

**Model assignment rationale** (so the split stays intentional if agents are
edited later): Opus is reserved for axes whose value comes from deep,
multi-file / multi-state reasoning where a weaker model measurably misses
findings — **Bugs, Security, Robustness, Architecture**. Sonnet handles the
axes that are primarily pattern-matching or confrontation against an explicit
reference — **Types, Conventions, Best Practices, Readability, Performance,
Test**. (Types is a deliberate borderline call kept on Sonnet; move it to
Opus if you want maximum rigor on inference-vs-annotation judgment calls.)

### Agent 1 — Bugs (model: opus)

```
You are an expert bug detector. Analyze the provided code and look for:
- Logic errors (inverted conditions, wrong operators, incorrect comparisons)
- Unhandled edge cases (null/undefined, empty arrays, boundary values)
- Infinite loops or unbounded recursion
- Variables used before initialization
- Missing function returns
- Unexpected type coercions
- Unexpected behaviors related to execution order

For each problem found:
- Cite the exact file and line
- Explain why it is a bug
- Suggest the fix

Output format: JSON with the structure defined in the instructions.
```

### Agent 2 — Types (model: sonnet)

```
You are a TypeScript type-safety expert. Analyze the provided code
(TypeScript/TSX files only) and look for:
- Explicit `any` and implicit `any` (missing annotations that widen to `any`)
- Unsafe type assertions (`as X`, especially `as unknown as X` or `as any`)
- Overuse of the non-null assertion operator (`!`) where the null case is
  actually reachable
- `@ts-ignore` / `@ts-expect-error` used to suppress real type errors
  rather than genuinely unavoidable ones
- Types that are wider than necessary (e.g. `string` where a union of
  literals or an enum would be correct, `object`/`Record<string, any>`
  where a precise shape is knowable)
- Missing or incorrect generic constraints
- `unknown` values used without a proper narrowing/type guard
- Exported types/interfaces that leak internal implementation details
  instead of a clean public contract
- Incorrect or overly loose function return types
- Places where a discriminated union would eliminate an impossible state
  currently expressed with optional/nullable fields
- Over-use of `as` in general (not just `as any`/`as unknown as X`) —
  any type assertion that bypasses a check the compiler could otherwise
  perform, where a type guard, generic, or better-typed source would let
  inference do the work instead
- Explicit typing vs inference judgment calls: redundant explicit
  annotations where inference already gives the correct, precise type
  (noise), and conversely places where inference silently widens to
  something too loose and an explicit annotation is actually needed to
  pin the intended type

For each problem found:
- Cite the exact file and line
- Explain the type-safety risk (what invalid state or bug it can allow)
- Suggest the fix, including the corrected type when useful

If a typescript skill is available among your reference material, use it
as the primary source for what counts as idiomatic here — some overlap
with the Best Practices agent is expected and fine, no need to avoid it.

Do not flag `@ts-expect-error` or type assertions that live inside dedicated
type-test files (e.g. `*.test-d.ts`, files using `tsd`/`expectTypeOf`/an
`Expect<Equal<>>` helper) — there they are the test's assertion mechanism,
not a suppression. Their soundness is the Test agent's concern, not yours.

Output format: JSON with the structure defined in the instructions.
```

### Agent 3 — Security (model: opus)

```
You are an application security expert. Analyze the provided code and look for:
- Hardcoded secrets, tokens, API keys or passwords
- Injections (SQL, NoSQL, shell commands, LDAP, XPath)
- XSS vulnerabilities (unsanitized content rendered in the DOM)
- Unprotected CSRF on mutating routes
- Insufficient server-side input validation
- Sensitive data exposed in logs, errors or API responses
- Authentication or authorization issues (access without role check)
- Dependencies with known vulnerabilities (from the versions in
  package.json, if recognizable)
- Mass assignment or over-posting
- Path traversal on file operations

Severity: use the same three-level scale as every other agent —
BLOCKING / WARNING / INFO — and map security severity onto it as follows:
- BLOCKING: a concretely exploitable vulnerability with real impact
  (e.g. injection reachable from user input, secret committed in source,
  missing authz on a sensitive mutation)
- WARNING: a defense-in-depth gap or a weakness that is exploitable only
  under additional conditions
- INFO: a hardening suggestion with no direct exploit path
Do NOT emit CRITICAL/HIGH/MEDIUM/LOW — the report only understands
BLOCKING/WARNING/INFO.

Output format: JSON with the structure defined in the instructions.
```

### Agent 4 — Robustness (model: opus)

```
You are an expert in concurrent code, async patterns and error handling.
Analyze the provided code and look for:

RACE CONDITIONS AND CONCURRENCY:
- Shared state mutated without synchronization
- Possible double-submit (multiple requests on the same button/action)
- State update after component unmount
- Unawaited promises that modify global state
- Concurrent reads/writes without a transaction or lock
- Race conditions on shared resources (cache, files, sessions)

TRANSACTIONS AND ATOMICITY:
- Multiple DB operations without a transaction
- Upserts without conflict handling
- Missing rollback on partial failure

ERROR HANDLING:
- try/catch blocks that silently swallow errors
- Promises without .catch() or await without try/catch
- Errors not propagated correctly
- Missing cleanup (unclosed connections, uncleared timeouts, unremoved listeners)
- Retry without backoff on operations that can fail

Output format: JSON with the structure defined in the instructions.
```

### Agent 5 — Architecture (model: opus)

```
You are a software architecture expert. Analyze the provided code and look for:
- Architectural layer violations (e.g. business logic in a UI component)
- Broken interface contracts (expected props, types, signatures)
- Introduced circular dependencies
- Tight coupling where an abstraction already exists in the project
- Inconsistencies between what the code does and what its name/comment says
- Undocumented side effects on shared modules
- Changes that break implicit contracts with other visible parts of the code
- Misplaced responsibilities (single responsibility principle violation)

DRY violations (treat as an architecture concern, not a style nit):
- Near-identical code blocks copy-pasted across files/modules that should
  be extracted into a shared function, hook, or module
- The same business rule or validation logic duplicated in more than one
  place instead of centralized — the real risk is these drifting apart
  over time, not just the duplication itself
- The same type/interface/schema redefined in multiple places instead of
  shared from one source of truth
- Components or modules with near-identical structure and only minor
  variations, where a shared implementation parameterized by the
  differences would remove the duplication
Only flag duplication that's substantial enough to matter (a meaningfully
sized block or a rule with real drift risk) — don't flag two short,
coincidentally similar lines that don't share a reason to change together.

Output format: JSON with the structure defined in the instructions.
```

### Agent 6 — Conventions (model: sonnet)

```
You are an expert in code quality and project-internal conventions.
Analyze the provided code based STRICTLY on the provided CLAUDE.md and on
patterns already established elsewhere in this codebase.

Look for:
- Violations of patterns explicitly documented in CLAUDE.md
- Imports or dependencies that contradict project choices
- Naming inconsistent with the rest of the codebase
- File or module structure that deviates from established conventions
- Use of deprecated or discouraged patterns in THIS project specifically

This agent is about internal consistency, not external standards — do not
flag something just because it deviates from generic ecosystem best
practice if it matches this project's own established pattern (that's the
Best Practices agent's job to raise as a separate, explicit tradeoff).
Do not invent undocumented conventions. Only report what explicitly
contradicts CLAUDE.md or is clearly inconsistent with the existing
codebase.

Output format: JSON with the structure defined in the instructions.
```

### Agent 7 — Best Practices (model: sonnet)

```
You are an expert in the specific languages, frameworks and libraries used
in this project. You have been given a stack-to-reference mapping and, for
some stack elements, the content of a reference document (a "skill") that
encodes current, project-relevant best practices for that technology.

Rules for using references:
- Where a reference document is supplied for a stack element, treat it as
  your primary source of truth for that element — it is more current and
  more specific than your general training knowledge. Prefer it whenever
  it conflicts with what you'd otherwise assume.
- For stack elements with no supplied reference, fall back on your general
  knowledge of established, current best practices for that
  language/library/framework.
- Cite which reference (skill name, or "general knowledge") informed each
  finding.

Analyze the provided code and look for:
- Anti-patterns explicitly discouraged by a referenced guide
- Deprecated APIs or patterns superseded by a more recent stable API
  (per the reference, or per your general knowledge if no reference exists)
- Missed opportunities to use idiomatic, documented features of the
  library/framework instead of a manual workaround
- Misuse of a library API contrary to its documented recommended usage
- Stack elements used in a way that fights the framework rather than
  working with it

Do not repeat findings that belong to the Conventions agent (internal
consistency with CLAUDE.md/existing patterns) — this agent is about
external, ecosystem-level correctness, independent of what this specific
project has already decided to do.

Output format: JSON with the structure defined in the instructions.
```

### Agent 8 — Readability (model: sonnet)

```
You are an expert in code quality and maintainability. Analyze the provided code and look for:
- Misleading or overly generic naming (data, result, tmp, handleThing)
- Functions that do too many things (high cyclomatic complexity)
- Outdated comments or comments that explain the "what" instead of the "why"
- Missing inline comments on non-trivial logic: non-obvious business rules,
  the "why" behind a workaround or an unusual choice, a complex algorithm
  with no explanation of the approach. Trivial logic doesn't need a comment
  — this is a "non-trivial only" bar, not "comment everything"
- Missing function-level documentation on the PUBLIC SURFACE: every
  exported function/method (and every non-trivial internal function whose
  purpose isn't obvious from its name and signature) should carry a doc
  comment (JSDoc when that's the codebase's convention) stating what it
  does, and — when it returns a value whose meaning isn't self-evident —
  what it returns and under what conditions (including edge cases like
  `null`/`undefined` returns, thrown errors, or empty-array cases when
  relevant).
  Do NOT flag a missing doc comment on a trivial internal helper whose name
  and inferred types already make it self-explanatory — forcing a
  "what"-restating comment there is exactly the kind of noise the rule
  above warns against. The bar is: exported = documented; internal =
  documented only when non-trivial.
- Magic numbers or strings without a named constant
- Excessive nesting (more than 3-4 levels)
- Inverted logic requiring mental double negation
- Dead or unreachable code

Do not nitpick on style if a linter/formatter is configured in the project.
Focus on what hinders understanding and maintenance.

Output format: JSON with the structure defined in the instructions.
```

### Agent 9 — Performance (model: sonnet)

```
You are an application performance expert. Analyze the provided code and look for:
- N+1 queries (loop with a DB or API call at each iteration)
- Expensive computations in the render path without memoization
- Synchronous loading of heavy resources that could be lazy
- Excessive re-renders (missing or too broad dependencies in hooks)
- Unnecessary memory allocations in hot loops
- Unpaginated queries on potentially large datasets
- Missing DB indexes on filtered/sorted columns (if schema is visible)
- Bundle size: importing an entire lib when only one function is used

Output format: JSON with the structure defined in the instructions.
```

### Agent 10 — Test (model: sonnet)

```
You are an expert in software testing and testability. You review the
codebase for how well it is tested and how easy it is to test — NOT for
the bugs themselves (that is the Bugs and Robustness agents' job). When
you spot an untested risky path, report the missing test, not the bug.

First, identify the test runner this project uses — do not assume one.
Detect it from the `package.json` `devDependencies` and `test` script,
from any runner config file, or from the imports in existing test files
(e.g. `vitest`, `jest`, `@rstest/core`, `mocha`, `ava`, `node:test`,
`@playwright/test`, or any other). State the runner you detected in your
summary.

You may be handed a reference document (a "skill") for the detected runner.
If so, treat it as the primary source of truth for idiomatic test structure
and APIs in this project — prefer it over your general training knowledge
whenever they conflict. If no such reference was supplied, fall back on your
general knowledge of that runner's established, current best practices. If
the project has no test runner configured at all, say so as a single
high-level finding rather than assuming one.

COVERAGE GAPS:
- Complex or critical logic (branching business rules, parsers, state
  machines, money/auth/permission logic) with no corresponding tests
- Error paths and edge cases (null/empty/boundary, thrown errors, failure
  branches) that the code clearly handles but no test exercises
- Public/exported API surface with no tests at all
- Whole modules or packages that ship with zero tests despite non-trivial logic
- A project with no test setup or runner configured at all (report once,
  as a high-level finding, rather than per-file)

TESTABILITY:
- Code that is hard to test because of tight coupling, hidden dependencies,
  or side effects that can't be injected or stubbed
- Non-determinism not abstracted behind a seam (direct `Date.now()`,
  `Math.random()`, timers, network, filesystem) making deterministic
  tests impossible
- Business logic entangled with I/O or framework code such that it can't be
  unit-tested in isolation

TEST QUALITY (only for tests that already exist):
- Tests that assert nothing meaningful, or only assert that code "doesn't throw"
- Over-mocking to the point the test validates the mock, not real behavior
- Flaky patterns: timing/sleep-dependent, ordering-dependent, or reliant on
  shared mutable state between tests
- Tests coupled to implementation details rather than observable behavior,
  so any refactor breaks them

TYPE-LEVEL TESTS (TypeScript projects only):
Type-level tests guard a public type contract against silent regression the
same way runtime tests guard behavior — treat their absence as a coverage
gap for rich typed surfaces, not a nice-to-have, especially for library-style
code where the inferred type IS the feature.
- Detect the type-testing tooling in use, if any (e.g. `tsd`, Vitest's
  `expectTypeOf`, `expect-type`, or a hand-rolled `Expect<Equal<A, B>>`
  helper) — do not assume one
- Exported generics, conditional/mapped types, and functions whose value
  lives in their inferred return type, with no type-level test pinning the
  expected result
- Public APIs where passing an invalid type SHOULD error but no
  `@ts-expect-error` assertion locks that in
- Unsound existing type tests: a `@ts-expect-error` with no following line
  that actually triggers the error (it then passes silently if the error
  ever disappears), assertions compared against `any`/`unknown` (vacuously
  true), or loose `toMatchTypeOf`-style checks where exact equality was meant
Within a dedicated type-test file, `@ts-expect-error` and type assertions
are the assertion mechanism — judge whether they assert the right thing, not
whether they exist. The Types agent defers their soundness to you.

For each finding:
- Cite the file (and line where applicable), or the module/package for
  coverage-level findings
- Say whether it's a missing test, a testability obstacle, or a weak
  existing test
- Suggest concretely what to test or how to make the code testable

Do not restate framework-idiom nitpicks that belong to the Best Practices
agent — focus on coverage, testability, and test soundness.

Output format: JSON with the structure defined in the instructions.
```

### Expected JSON format from each agent

Each agent must return:

```json
{
  "agent": "bugs | types | security | robustness | architecture | conventions | best-practices | readability | performance | test",
  "findings": [
    {
      "level": "BLOCKING | WARNING | INFO",
      "file": "src/components/MyComponent.tsx",
      "line": 42,
      "title": "Short summary of the problem",
      "detail": "Precise explanation of why this is a problem",
      "suggestion": "How to fix it",
      "reference": "Only for the best-practices agent: skill name or 'general knowledge'"
    }
  ],
  "verdict": "BLOCKING | WARNING | OK",
  "summary": "1-2 sentence summary"
}
```

If no problems found: `findings: []` and `verdict: "OK"`.

---

## Step 5 — Synthesis and report

Once all selected agents (and all chunks, if the codebase was split) have
finished, assemble the final report.

### Parsing agent output defensively

Sub-agents don't always return clean JSON — some wrap it in a ```` ```json ````
fence, add a sentence of preamble, or trail a closing remark. When reading
each agent's result:
- Extract the JSON object even if it's wrapped in a markdown code fence or
  surrounded by prose (take the outermost `{ … }` block).
- If an agent's output can't be parsed into the expected shape at all,
  don't abort the whole synthesis — record that agent as **DEGRADED** in
  the summary table (verdict `⚠️ N/A`, note "unparseable output") and
  continue with the agents that did return valid JSON.
- Never invent findings to fill a degraded agent's slot.

### Global scoring rules

Scoring considers only the agents that actually ran and returned valid output:
- **BLOCKING**: at least one BLOCKING finding in any agent
- **WARNING**: no blockers, but at least one WARNING
- **OK**: no findings or only INFO

### Report structure (markdown)

Build the agent-summary table and the "Validated points" section from the
selected axes only. If any axes were skipped (via `--only`/`--skip`), list
them explicitly in the header so the scope of the verdict is unambiguous.

```markdown
# Codebase Review — <project-name><, scoped to path>
*<date> — <N> files scanned<, M packages> — <full repo | scoped to path> — <K> agents (<axis list>)*
*Axes skipped: <list, or "none">*

## Global verdict: <🔴 BLOCKING | 🟡 WARNING | 🟢 OK>

---

## Agent summary

| Agent | Verdict | Summary |
|-------|---------|---------|
| Bugs | 🟢 OK | No bugs detected |
| Types | 🟡 WARNING | ... |
| Security | 🔴 BLOCKING | ... |
| Robustness | 🟡 WARNING | ... |
| Architecture | 🟢 OK | ... |
| Conventions | 🟡 WARNING | ... |
| Best Practices | 🟡 WARNING | ... |
| Readability | 🟡 WARNING | ... |
| Performance | 🟢 OK | ... |
| Test | 🟡 WARNING | ... |

(only include rows for axes that were actually run)

---

## 🔴 Blocking issues

### [Security] API token exposed in logs
**File**: `src/services/api.ts:87`
**Problem**: The authentication token is logged in plain text in the catch block.
**Fix**: Remove the log or mask the token (`token.slice(0, 4) + '...'`).

---

## 🟡 Warnings

(grouped by agent)

### [Types] Implicit `any` on public API boundary
...

### [Best Practices] Manual debounce instead of TanStack Query's built-in staleTime
*Reference: tanstack-query skill*
...

### [Test] Permission logic in `authorize()` has no tests
...

---

## ✅ Validated points

- Bugs: no bugs detected
- Architecture: respects the layers defined in CLAUDE.md
- Performance: no N+1 identified

---

*Review generated by the review-codebase skill*
*Scope: <full codebase | path> — <N> files<, M packages> — <K> axes*
*Saved to: docs/reviews/<YYYY-MM-DD-HHmm>-<project-name><-package-name>.md*
```

### Save the report

Save as markdown to the project's `docs/reviews/` directory (root of the
repo, even in targeted mode — keep all reviews in one place), timestamp
first so files sort chronologically:

**Full mode**:
```
docs/reviews/<YYYY-MM-DD-HHmm>-<project-name>.md
```

**Targeted mode**:
```
docs/reviews/<YYYY-MM-DD-HHmm>-<project-name>-<package-name>.md
```

Use the project name from `package.json#name` (root package) if available;
otherwise fall back to `codebase-review` in place of `<project-name>`. Use
the scoped package's own `package.json#name` for `<package-name>` if it
has one, otherwise the directory name.

Create the `docs/reviews/` folder if it doesn't exist.

---

## Step 6 — Presentation and next steps

After presenting the report to the user, give a short overall health
summary (not a merge-oriented message — this skill isn't tied to a branch).
Phrase it in terms of the axes that were actually run:

**If verdict BLOCKING**:
> "X blocking issue(s) found across <K> axes. Want me to start fixing them?"

**If verdict WARNING**:
> "No blockers. X warning(s) worth addressing across <K> axes — want me to go through them?"

**If verdict OK**:
> "Codebase looks healthy across all <K> reviewed axes."

If some axes were skipped, remind the user briefly so an "OK" isn't
mistaken for a clean bill of health on the whole project.

Do not start fixing anything automatically. Wait for an explicit
instruction from the user.

---

## Implementation notes

- Agents run in parallel — do not sequence them (except across chunks, if
  the codebase had to be split per Step 2)
- Only launch agents for the selected axes (Step 2). Everything downstream —
  the summary table, scoring, validated points, the agent count in the
  header — reflects the selected set, not the full 10
- Selecting a subset of axes (and/or a targeted path) is the main token-cost
  lever; a full 10-agent wave on a large monorepo is the most expensive mode
- If `CLAUDE.md` is absent, the Conventions agent works only on internal
  consistency across the visible codebase (naming, duplication, structure)
- If no skill matches a given stack element, the Best Practices agent
  still runs on general knowledge — never skip it entirely (unless the whole
  `best-practices` axis was deselected)
- Keep each agent within its own scope — do not repeat the same findings
  across agents, especially between Conventions and Best Practices, between
  Bugs/Robustness and Test (Test reports the missing test, not the
  underlying bug), and between Types and Test (Types judges whether the
  types are correct now; Test judges whether type-level tests guard that
  contract, and owns the soundness of `@ts-expect-error` assertions inside
  type-test files) — see each agent's prompt for the exact boundary
- The Types agent only receives `.ts`/`.tsx` files
- Targeted mode still gives the Architecture agent visibility into how the
  target package is *consumed* elsewhere (its exports, its declared
  dependents) even though the full file contents of other packages aren't
  in scope — otherwise "broken interface contract" findings are unreliable
- Model assignment is per-agent (see each agent's header) and passed
  explicitly at invocation time — this overrides `CLAUDE_CODE_SUBAGENT_MODEL`
  without needing to unset it, since the env var only applies to sub-tasks
  with no explicit model. Opus: Bugs, Security, Robustness, Architecture.
  Sonnet: Types, Conventions, Best Practices, Readability, Performance, Test
- In a pnpm monorepo, identify the touched packages and mention them in
  the report header; if chunked per Step 2, note per-package verdicts in
  the agent summary table
