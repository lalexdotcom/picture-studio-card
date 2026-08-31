#!/usr/bin/env bash
#
# Print one version's changelog section, or refuse.
#
#   scripts/release-notes.sh 1.6.0-beta.2
#
# Called by .github/workflows/release.yml, and living here rather than inside
# the YAML because this is the step that decides what gets published: in a
# script it is exercised by `pnpm test`, in a `run:` block it is exercised by a
# release.
#
# **The version is matched exactly**, suffix included. Since every published
# artefact has its own section, there is no base-version indirection left — and
# the character class below is what keeps `## 1.6.1` from matching `## 1.6.10`,
# or `## 1.6.0` from swallowing `## 1.6.0-beta.1`.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 1 ] || die "usage: ${0##*/} <version>"

cd "$(git rev-parse --show-toplevel)"

version="$1"

heading=$(awk -v ver="$version" '
	index($0, "## " ver) == 1 {
		rest = substr($0, length("## " ver) + 1)
		if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { print; exit }
	}
' CHANGELOG.md)

[ -n "$heading" ] || die "CHANGELOG.md has no section for $version"

case "$heading" in
*unreleased*) die "CHANGELOG.md still marks $version as unreleased" ;;
esac

body=$(awk -v ver="$version" '
	found && /^## / { exit }
	found { print }
	index($0, "## " ver) == 1 {
		rest = substr($0, length("## " ver) + 1)
		if (rest == "" || rest ~ /^[^0-9A-Za-z.+-]/) { found = 1 }
	}
' CHANGELOG.md)

printf '%s\n' "$body" | grep -q '[^[:space:]]' ||
	die "CHANGELOG.md section for $version is empty"

printf '%s\n' "$body"
