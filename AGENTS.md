# Agent Operating Rules

## Pair Programming Protocol

1. User leads, agent follows. Wait for the explicit next step.
2. One step at a time. Do not preview future steps unless asked.
3. Be concise. No boilerplate, no over-engineering.
4. No trailing questions ("should I continue?"). Deliver and stop.
5. No unsolicited suggestions. Flag issues in one sentence; do not act.
6. Confirm before large changes (more than a few files or significant refactor).
7. When two approaches reach the same result, choose the non-destructive one —
   or ask first. Never pick a data-losing path (reset, drop, overwrite, force)
   when a data-preserving one exists.
8. No hollow praise or flattery ("Great idea!", "Excellent question!", etc.).
9. A question is answered, not acted on — even if it implies an action.
   Proposing is part of answering; changing anything is not. No edit, no
   dispatch, no commit without explicit validation.


## Branches

Two branches publish, and which one a piece of work belongs to is settled before
the branch is cut, not after.

| Branch | What lands there | `package.json` | What a push publishes |
| ------ | ---------------- | -------------- | --------------------- |
| `main` | bugfixes | `1.5.4` | a stable release, offered to every user |
| `next` | features | `1.6.0-beta.3` | a pre-release, offered only to users who turned on "Show beta versions" in HACS |

**Getting to the right line is `scripts/start-branch.sh`, and opening a
pre-release line is `scripts/open-prerelease.sh` — neither is a sequence of steps
to remember.**

```sh
scripts/start-branch.sh fix [name]        # main, the stable line
scripts/start-branch.sh feature [name]    # next, the feature line
scripts/open-prerelease.sh 1.6            # create next from main, on 1.6.0-beta.1
```

The name is optional because "I want to fix a bug on the stable version" is said
before anyone knows what to call the branch: without one, the script only moves
and checks. **Both refuse rather than repair, and neither ever moves work in
flight** — a dirty tree is a refusal, never a stash. The checks they hold are the
ones CI cannot see, because they happen before the first commit: the stray `v` in
a version, a changelog section that was never opened, a base branch that is
behind the remote, `next` cut from wherever HEAD happened to be.

**A branch's name says what the change is; the script's first argument says
which line it is cut from. The two are independent and must not be conflated.**
Every feature branch is named `feat/<name>`, a bugfix branch `fix/<name>`, and
housekeeping `chore/<name>`. The trap: `start-branch.sh feature` means "cut from
`next`", not "this is a feature" — a bug in something that only exists on `next`
is fixed on `next`, by that very command, and the branch is still a `fix/`. The
script therefore takes the name verbatim and cannot prefix it for you.

**A branch records where it merges, at the moment it is cut** — written by
`start-branch.sh` into `git config branch.<name>.target`, and read back at the
close. It is written down rather than recomputed because it cannot be
recomputed: a branch cut from `main` and one cut from a freshly recreated `next`
share the same merge-base with `main`, and no amount of history walking tells
them apart. A branch with no recorded target predates this and merges onto
`main`.

**`next` is not permanent.** It lives for one minor version: when that version is
ready it merges into `main` once, `main` releases it as a stable, and a *new*
`next` is cut from `main` for the minor after. An everlasting feature branch
makes the changelog and memory conflicts grow without bound; a branch that dies
every minor keeps them small enough to resolve without thinking.

**Shipping the line as a stable, in order** — it is the moment with the most
steps and the least practice:

1. **Back-merge `main` into `next` first**, so the review reads a diff of
   features and not of fixes it has already seen.
2. **Whole-branch review** of `next` → `main`. It gates the merge, as always.
3. **Merge `next` into `main`**, locally — a real merge, never a squash. The
   reconciliation step in `release.yml` asks whether `next` is an *ancestor*
   of the released commit; a squash establishes no ancestry and the release
   is refused with a message that reads as though nothing was merged.
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
7. **The user pushes `main`.** `prerelease` is false, the reconciliation step
   finds `next` already inside the commit, HACS moves `latest` and every user is
   offered `1.6.0` — beta testers included, for whom it reads as an upgrade.
8. **Delete `next`.** Until it is gone it still claims a version that has
   shipped, and the release workflow rightly refuses any further beta of it.
   `scripts/open-prerelease.sh` will say so and will not delete it for you.

**The traffic is asymmetric — `main` → `next` after every fix lands, `next` →
`main` once per minor.** The back-merge is neither optional nor deferred: it is
step 2 of the close, in the same session as the merge onto `main`, because what
it carries exists locally from that moment — the push only adds a tag. It costs
one conflict on `CHANGELOG.md` and `package.json`, and that conflict only grows
while it waits. Until it happens, a tester on `1.6.0-beta.3` sits *above*
`1.5.4` and does **not** have the fix; publishing a `beta.4` once the fix is
pushed is what delivers it to them.

## Closing a session

"On clôture" is an instruction, not a summary. It means, in order:

1. **Merge onto the branch the work was cut from**, locally, if the whole-branch
   review came back READY TO MERGE. If it did not, say so and stop — the merge
   is what the review gates. The target is read, never guessed:

   ```sh
   git config --get "branch.$(git branch --show-current).target"
   ```

   Nothing there means the branch predates the convention: it merges onto `main`.
2. **Back-merge `main` into `next`**, if `next` exists and the merge above landed
   on `main`. Here, not in some later session: what the back-merge carries are
   `main`'s commits, which exist locally the moment the merge is done. The push
   only adds a tag. Waiting for it would make the duty cross a session boundary
   with nothing to carry it across, and would let the conflict grow for no gain.

   **When it conflicts, and it will:** `package.json` keeps **`next`'s** version,
   the beta — never `main`'s. `CHANGELOG.md` keeps **both** sections. Resolving
   the version the other way leaves `next` on an unsuffixed version, which the
   release workflow then refuses at the push; the pipeline catches it, but late
   and puzzlingly.
3. **Update the project memory** so the next session resumes without
   re-deriving anything: where the work stands, what remains, and what would
   bite someone who picked it up cold — on the feature line, in that line's own
   handoff file and nowhere else, per § Project memory rule 8.
4. **Commit what is left.** Judge it: if the remaining diff is trivial —
   memory files, docs, a settled style — commit it without asking. If it is
   not, ask. Pushing is not part of closing — see below.

## Pushing

A push to a publishing branch publishes: CI runs, `release.yml` reads `version`
from `package.json`, cuts the tag and the GitHub release. From `main` that
release reaches every user of the card; from `next` it reaches only those who
turned beta versions on in HACS — a smaller audience, not a private one.

**Never push on your own initiative** — not to close a session, not to tidy up,
not because the branch is green. **Push when the user asks for it in so many
words**, and then push exactly what they asked for and nothing else: the one
branch they named, never `--tags`, never `--force`.

If the request is ambiguous — "on release", "publie" — say **which branch and
which version** the push will publish, and ask once. Being told to go ahead is
the answer; asking twice is not diligence.

## Project memory

The memory files under `.serena/memories/picture-studio/` are read at the start
of a session and believed. That is what makes them useful and what makes a
stale one expensive.

1. **Update the memory as part of the delivery, not at the close.** A commit
   that settles something and leaves the memory saying it is still owed has not
   finished. The close is a backstop, not the moment.
2. **A settled follow-up is struck through, never deleted.**
   `## ~~4. Its title~~ — DONE <date>`, plus a line naming what closed it. The
   numbering must never shift: comments, specs and the state file refer to
   entries by number. A struck entry also tells the next reader that the
   question was asked and answered, which a deleted one cannot.
3. **A memory is a claim; the repository is the evidence.** Confront one with
   `git log`, the file, or the remote before acting on it — above all any
   memory saying something is *owed*. When the two disagree, the repository
   wins and the memory gets fixed in the same breath.
4. **Write what would bite someone cold**, not a changelog of the session: the
   trap, the measurement, the decision that must not be re-litigated, and the
   reasoning behind a refusal. What a `git log` already says does not need
   saying twice.
5. **Never record a value a command gives in a second.** The open version, the
   published tag, how far `main` is from the remote, whether the changelog
   heading carries a date — all of it is one command away, and a stored copy
   can only drift. Record *where to look* and *how to read the answer*, never
   the answer.
6. **The exception is a figure that is expensive to derive** — the test count,
   the build size — and it comes with an obligation: whoever runs the **whole**
   suite, or a build, updates the recorded figure and its date in the same
   breath. A baseline nobody refreshes reads as authoritative and is quietly
   wrong, which is worse than having none.
7. **A scoped run never touches the baseline.** `pnpm test <file>` prints the
   same JSON shape as a full run — `"passedTests": 30` with nothing saying it
   was scoped — so the count from a single file will silently corrupt the
   record if it is copied in. The tell is `testFiles`: the baseline carries it
   next to the test count precisely so a partial run is recognisable. **If your
   run does not report every test file, it is not a baseline.** Scoped runs are
   the normal thing while working; the full run belongs to the delivery's
   verification, which is also when the memory is updated.
8. **One file, one owning branch — this is what keeps `next` affordable.**
   `state.md` and `follow-ups.md` belong to `main` and are never edited from
   `next`. `next` carries a handoff file of its own — `1.6.0-handoff.md`,
   following the `1.5.0-handoff.md` precedent — where its findings are written in
   plain prose. They are folded into `follow-ups.md`, **with numbers**, when
   `next` merges into `main`. Only one branch ever allocates a number, so rule
   2's numbering cannot drift. The trap this avoids is silent: two branches each
   appending a `## 17.` merge without a conflict and leave two entries numbered
   17, and git will not say a word. Because it is silent, it is also enforced —
   `.githooks/pre-commit` refuses such a commit from `next` or from any branch
   targeting it. A hook is not the guarantee CI is (`--no-verify` walks past it,
   and it lives only where `core.hooksPath` was set, which `post-create.sh`
   does), but it is read by everyone, where a rule is read by whoever thinks to
   look.
9. **Memory kept outside the repository does not merge, and is blind to the
   branch.** It is shared by `main` and `next` alike, so anything written from
   `next` must name that branch — otherwise it will be read during a `main`
   session as though it described the stable line.

## Language

ALWAYS use **French** language for chat. Everything else: **English**.

## Formatting

Run the project's linter/formatter after every modification if one is configured.

## Changelog and versioning

1. `CHANGELOG.md` is updated with every delivery. It is written **for users of
   the card**: what changes for someone configuring it. Anything about how the
   code got there belongs in the git history, not here.
2. A change that alters existing behaviour goes under `Changed`, and says so
   plainly — that is the section people read before upgrading.
3. **`Added` comes before `Changed`, in every version.** What is new is what a
   reader came for; what changed is what they check afterwards. The rest follow:
   `Fixed`, `Removed`, `Deprecated`, `Security`. The release workflow only ever
   anchors on the `## <version>` headings and copies everything until the next
   one, so the order of the `###` sections inside is ours to choose and cannot
   break a release.
4. **Never bump a version on your own initiative.** The bump happens only when
   the user asks for it in so many words.
5. One version, mirrored everywhere: the `CHANGELOG.md` heading, `version` in
   `package.json`, and the git tag of the release must agree. HACS installs
   from the GitHub release, so the tag is what users actually get.
   **Two versions are open at once, one per publishing branch, and that is not a
   divergence to repair.** `main` may sit on `1.5.4` while `next` sits on
   `1.6.0-beta.3`. Each branch mirrors its own; a session that "fixes" the
   difference breaks both.
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
   with `scripts/bump-prerelease.sh <identifier>` — the identifier is a
   decision, not an increment: `beta.8` and `rc.1` are both legitimate successors
   of `beta.7`, and only at the delivery is it known which is meant. The trap this avoids
   is silent: an entry written into the dated section of a published beta,
   pushed without a bump, gives a green CI and **no release at all**. The
   release job finds the tag already there, reports "nothing to release", and
   succeeds.
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

## Tooling — Serena (symbol-aware MCP)

Serena's symbolic tools are PRIMARY for code; built-in Read/Glob/Grep/Edit are
SECONDARY and must not touch code files when a Serena equivalent exists.

- Explore → `get_symbols_overview`; read a symbol → `find_symbol` (`include_body`);
  callers → `find_referencing_symbols`.
- Edit → `replace_symbol_body` / `insert_before_symbol` / `insert_after_symbol` /
  `replace_content`; rename/move/delete → `rename` / `move` / `safe_delete`.
- Built-in Read/Edit/Grep on code only as fallback (Serena failed or file
  unparseable). Read/Edit are fine for non-code (`.md`, JSON, YAML, TOML,
  config, lockfiles).
- Self-check before any Read/Glob/Grep/Edit on a code file: is there a Serena
  tool for this? If yes, switch — every time, not once per session.
- Subagents: every subagent prompt that touches code MUST carry this same rule.

## Onboarding — First Run

When starting on an unknown or fresh codebase, run a codebase tour before any
task:

1. `get_symbols_overview` on the root and key directories.
2. Populate Serena memory with: stack, entry points, conventions observed.
3. Report a one-paragraph summary to the user before proceeding.

Do not ask the user to describe the project — explore first, ask only what
cannot be inferred.

## Model & Effort Policy (binds superpowers § Model Selection)

Superpowers names tiers, never models. This is the binding mapping, and it
governs **every** subagent dispatch — superpowers or not.

| Tier     | `model` | `effort` |
| -------- | ------- | -------- |
| cheap    | haiku   | low      |
| standard | sonnet  | medium   |
| capable  | opus    | high     |

Use these short aliases, not full model IDs — the Agent tool's `model`
parameter only accepts `sonnet`, `opus`, `haiku`, `fable`. Full IDs belong in
`CLAUDE_CODE_SUBAGENT_MODEL`, aliases in dispatches.

- **Never dispatch a subagent without an explicit `model`.** An omitted model
  falls back to `CLAUDE_CODE_SUBAGENT_MODEL` — a default, not a decision.
- **Always pass `effort` too.** An omitted effort inherits the session level
  (`high`), cancelling most of the saving a cheap tier is chosen for.
- Tier choice follows superpowers § Model Selection: complete-spec task over
  1-2 files → cheap; multi-file integration, debugging, and all reviewers →
  standard (mid-tier is the floor — turn count beats token price);
  architecture, design, and the final whole-branch review → capable. Fix-loop
  rounds 4-5 escalate one tier above the implementer that got stuck.
