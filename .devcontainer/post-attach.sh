#!/usr/bin/env bash
# postAttachCommand, at every attach: VS Code's git credential relay only exists
# once attached. gh gets no relay of its own, so it is seeded with the token the
# host's helper returns for this clone's GitHub account (set by
# initializeCommand); re-running also picks up a token changed on the host.
# Non-fatal: git works without gh.
set -euo pipefail

request='protocol=https
host=github.com'
username=$(git config --get credential.https://github.com.username || true)
if [ -n "$username" ]; then
	request="$request
username=$username"
fi
token=$(printf '%s\n\n' "$request" | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p') || true
if [ -z "$token" ] || ! printf '%s' "$token" | gh auth login --hostname github.com --with-token; then
	echo "gh not authenticated: no host credential, or token lacks repo/read:org" >&2
fi
