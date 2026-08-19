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


## Closing a session

"On clôture" is an instruction, not a summary. It means, in order:

1. **Merge onto `main`**, locally, if the whole-branch review came back
   READY TO MERGE. If it did not, say so and stop — the merge is what the
   review gates.
2. **Update the project memory** so the next session resumes without
   re-deriving anything: where the work stands, what remains, and what would
   bite someone who picked it up cold.
3. **Commit what is left.** Judge it: if the remaining diff is trivial —
   memory files, docs, a settled style — commit it without asking. If it is
   not, ask. Pushing is still never yours.

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
4. At each delivery, **ask whether this is a version bump**, and which one.
   Never decide it alone.
5. One version, mirrored everywhere: the `CHANGELOG.md` heading, `version` in
   `package.json`, and the git tag of the release must agree. HACS installs
   from the GitHub release, so the tag is what users actually get.
6. The bump lands with the release, not before: while work is in progress the
   heading reads `unreleased` and `package.json` still names the last shipped
   version.

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
