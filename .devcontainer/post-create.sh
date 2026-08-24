#!/usr/bin/env bash
set -euo pipefail

sudo chown -R node:node /ai-tools

uv tool install -p 3.13 "serena-agent==1.7.0" --prerelease=allow
uv tool install mempalace

claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install superpowers@claude-plugins-official --scope user

claude plugin marketplace add MemPalace/mempalace
claude plugin install mempalace@mempalace --scope user

claude mcp remove serena --scope user 2>/dev/null || true
claude mcp add serena --scope user -- serena start-mcp-server --context=claude-code --project-from-cwd

serena index --project-root "$PWD" 2>/dev/null || true

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
