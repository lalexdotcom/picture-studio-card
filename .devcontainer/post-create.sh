#!/usr/bin/env bash
# postCreateCommand: project setup. Agent tooling goes in on-create.sh.
set -euo pipefail

# remoteEnv does not reach lifecycle scripts (see devcontainer.json).
export PATH="$HOME/.local/bin:$PATH"

# There is no top-level `serena index` and no `--project-root` flag. When it
# creates .serena/project.yml, `project index` asks about each extra language it
# detects; the n's decline them. A bare `yes n` would die of SIGPIPE, which
# pipefail turns into a failure.
printf 'n\n%.0s' {1..100} | serena project index "$PWD"

# Hooks are not versioned by git and not shared by a clone, so the repository
# keeps them in `.githooks/` and points git at them here. See that directory for
# what they guard and what they cannot.
git config core.hooksPath .githooks

pnpm install

# Install Playwright browsers + OS deps for rstest browser mode.
# Scoped to chromium: the card ships to Home Assistant, whose frontend is
# Chromium-based everywhere it matters, and the browser-mode tests only
# assert our own rendering. Saves ~200 MB and tens of seconds per rebuild
# vs the default, which installs all three browser families.
# `playwright` is an *optional* peer of `@rstest/browser`, so pnpm never
# installs it on its own — it is declared in devDependencies instead, and
# `pnpm exec` therefore resolves the version the lockfile pins. `pnpm dlx`
# would fetch Playwright's latest and download browsers the pinned runtime
# cannot launch. https://rstest.rs/guide/browser-mode
pnpm exec playwright install --with-deps chromium
