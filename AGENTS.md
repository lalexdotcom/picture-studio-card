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


## Language

ALWAYS use **French** language for chat. Everything else: **English**.

## Formatting

Run the project's linter/formatter after every modification if one is configured.

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
