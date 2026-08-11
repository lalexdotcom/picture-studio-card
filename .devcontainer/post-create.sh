#!/usr/bin/env bash
set -euo pipefail

sudo chown -R node:node /ai-tools

uv tool install -p 3.13 serena-agent@latest --prerelease=allow
uv tool install mempalace

claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install superpowers@claude-plugins-official --scope user

claude plugin marketplace add MemPalace/mempalace
claude plugin install mempalace@mempalace --scope user

claude mcp remove serena --scope user 2>/dev/null || true
claude mcp add serena --scope user -- serena start-mcp-server --context=claude-code --project-from-cwd

serena index --project-root "$PWD" 2>/dev/null || true
