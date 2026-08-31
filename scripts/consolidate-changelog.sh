#!/usr/bin/env bash
#
# Merge every pre-release section of a line into one, on main, after the merge.
#
#   scripts/consolidate-changelog.sh
#
# Step 4 of the shipping sequence in AGENTS.md § Branches. It is deliberately
# NOT the step that closes the version: between this script and
# `close-version.sh` sits the editorial pass, and **the absence of the
# `## <base>` heading is what forbids the stable release** while it happens.
# Merging the two commands would throw that away.
#
# The section it writes says `unreleased`, and carries the number of the highest
# pre-release rather than a fresh one: the merged content IS that build's
# content, nothing was added since, and a new number would name a build that
# never existed. The text under it, however, has never been published in this
# form — hence `unreleased`.
#
# Requires `sort -V` (GNU coreutils) for SemVer ordering — the devcontainer
# and CI both supply it.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 0 ] || die "usage: ${0##*/}   (no arguments)"

cd "$(git rev-parse --show-toplevel)"

branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = main ] ||
	die "a line is consolidated on its way out, from main, not from ${branch:-a detached HEAD}"

if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

# Every `## <version>` heading whose version carries a pre-release suffix.
mapfile -t pre < <(awk '/^## [0-9]/ { print $2 }' CHANGELOG.md | grep -- '-' || true)
[ ${#pre[@]} -gt 0 ] || die "CHANGELOG.md has no pre-release section to consolidate"

highest=$(printf '%s\n' "${pre[@]}" | sort -V | tail -1)
base="${highest%%-*}"

# A dated stable section means this line has already shipped; consolidating
# again would fold published sections into a heading that is no longer open.
if awk -v b="$base" '/^## / && $2 == b { found = 1 } END { exit !found }' CHANGELOG.md; then
	die "CHANGELOG.md already has a section for $base — this line has shipped"
fi

mapfile -t members < <(printf '%s\n' "${pre[@]}" | grep "^$base-" | sort -V)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Oldest first: the entries read in the order the work happened.
for version in "${members[@]}"; do
	awk -v ver="$version" -v out="$work" '
		/^## / && $2 == ver { insec = 1; next }
		insec && /^## / { insec = 0 }
		!insec { next }
		/^### / { type = substr($0, 5); skipblank = 1; next }
		skipblank && /^$/ { skipblank = 0; next }
		skipblank { skipblank = 0 }
		type != "" { print >> (out "/" type) }
	' CHANGELOG.md
done

{
	echo "## $highest — unreleased"
	echo
	# AGENTS.md § Changelog rule 3 fixes this order, and it is not the order the
	# betas were written in.
	for type in Added Changed Fixed Removed Deprecated Security; do
		[ -s "$work/$type" ] || continue
		echo "### $type"
		echo
		# Each beta's subsection ends with a blank line, so the seams double up.
		awk 'NF { blank = 0; print; next } !blank { blank = 1; print }' "$work/$type"
	done
} >"$work/section"

# Everything above the first section heading: the title and its blank line.
awk '/^## / { exit } { print }' CHANGELOG.md >"$work/head"

# Every section that is not one of the members, in their original order.
awk -v list="$(printf '%s ' "${members[@]}")" '
	BEGIN { n = split(list, m, " "); for (i = 1; i <= n; i++) if (m[i] != "") drop[m[i]] = 1 }
	/^## / { seen = 1; skip = ($2 in drop) }
	seen && !skip
' CHANGELOG.md >"$work/tail"

cat "$work/head" "$work/section" "$work/tail" >CHANGELOG.md.consolidating
mv CHANGELOG.md.consolidating CHANGELOG.md

# Written, not inherited: the merge that brought the line onto main resolves
# package.json by hand, and resolving it the other way leaves main claiming a
# stable version against a pre-release section, which nothing else would catch.
awk -v v="$highest" '
	!done && /"version":/ {
		sub(/"version": "[^"]*"/, "\"version\": \"" v "\"")
		done = 1
	}
	{ print }
' package.json >package.json.consolidating
mv package.json.consolidating package.json

cat <<EOF

Consolidated ${#members[@]} sections into ## $highest — unreleased.

  merged        ${members[*]}
  package.json  $highest

Now prune it: an entry that fixes something this same version ADDED describes a
bug no user of a stable release ever met, and belongs to the beta's testers
rather than to $base's notes. Then close the version:

  scripts/close-version.sh
EOF
