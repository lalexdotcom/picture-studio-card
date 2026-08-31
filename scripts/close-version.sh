#!/usr/bin/env bash
#
# Close a version: drop the pre-release suffix, date the heading.
#
#   scripts/close-version.sh
#
# Step 6 of the shipping sequence in AGENTS.md § Branches, and the act that
# permits the stable release: until the `## <base>` heading exists, the release
# workflow has no section to publish and refuses. It is separate from
# `consolidate-changelog.sh` on purpose — the editorial pass happens between
# them, and this command is how the user says the pruning is done.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 0 ] || die "usage: ${0##*/}   (no arguments)"

cd "$(git rev-parse --show-toplevel)"

branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = main ] ||
	die "a version is closed from main, not from ${branch:-a detached HEAD}"

if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

current=$(jq -r .version package.json)
case "$current" in
*-*) ;;
*) die "package.json is on $current, which carries no pre-release suffix — there is nothing to close" ;;
esac

base="${current%%-*}"

top=$(awk '/^## / { print $2; exit }' CHANGELOG.md)
[ "$top" = "$current" ] ||
	die "the top section is $top and package.json is on $current — run scripts/consolidate-changelog.sh first"

# One section for the line, or the consolidation has not run. Checked rather
# than assumed: closing here would publish one beta's notes as the whole minor.
remaining=$(awk -v b="$base-" '/^## / && index($2, b) == 1 { print $2 }' CHANGELOG.md |
	grep -v "^$current\$" || true)
if [ -n "$remaining" ]; then
	echo "$remaining" | sed 's/^/  /' >&2
	die "these pre-release sections are still separate — run scripts/consolidate-changelog.sh first"
fi

date=$(date +%F)

awk -v v="$base" '
	!done && /"version":/ {
		sub(/"version": "[^"]*"/, "\"version\": \"" v "\"")
		done = 1
	}
	{ print }
' package.json >package.json.closing
mv package.json.closing package.json

# Field form ($2 == ver) rather than index($0, "## " ver " "): the latter needs
# a trailing space and silently skips a heading that carries no date.
awk -v ver="$current" -v new="## $base — $date" '
	!done && /^## / && $2 == ver { print new; done = 1; next }
	{ print }
' CHANGELOG.md >CHANGELOG.md.closing
mv CHANGELOG.md.closing CHANGELOG.md

cat <<EOF

Closed $base.

  package.json   $current -> $base
  CHANGELOG.md   ## $base — $date

Commit, then the push of main publishes it to every user of the card. Delete
next afterwards: until it is gone it still claims a version that has shipped,
and the release workflow will refuse any further pre-release of it.
EOF
