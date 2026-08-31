#!/usr/bin/env bash
#
# Open the next pre-release section on the feature line.
#
#   scripts/bump-prerelease.sh beta.2
#   scripts/bump-prerelease.sh rc.1
#
# **The identifier is an argument and never an increment.** `beta.8` and `rc.1`
# are both legitimate successors of `beta.7`, and only the caller knows which is
# meant — which is also why the section is opened at the first delivery that
# follows a publication rather than at the publication itself.
#
# Why a script: the failure it prevents is silent. Writing an entry into the
# dated section of a published beta and pushing gives a green CI and **no
# release at all** — the release job finds the tag already there, reports
# "nothing to release", and succeeds. Nothing anywhere says the work was never
# published.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 1 ] || die "usage: ${0##*/} <identifier>   e.g. ${0##*/} beta.2"

cd "$(git rev-parse --show-toplevel)"

identifier="$1"
# SemVer pre-release text: dot-separated alphanumerics and hyphens. Rejecting
# anything else here keeps a typo from becoming a tag nobody can delete.
case "$identifier" in
"" | -* | *[!A-Za-z0-9.-]*) die "not pre-release text: '$identifier' — try beta.2 or rc.1" ;;
*.*) ;;
*) die "not pre-release text: '$identifier' — try beta.2 or rc.1" ;;
esac

branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = next ] ||
	die "pre-releases are published from next, not from ${branch:-a detached HEAD}"

if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

current=$(jq -r .version package.json)
case "$current" in
*-*) ;;
*) die "package.json is on $current, which carries no pre-release suffix — next publishes pre-releases only" ;;
esac

base="${current%%-*}"
version="$base-$identifier"

[ "$version" != "$current" ] || die "package.json is already on $version"

# `sort -V` is the ordering authority: beta.10 follows beta.9, which a string
# comparison gets backwards, and rc follows beta.
highest=$(printf '%s\n%s\n' "$current" "$version" | sort -V | tail -1)
[ "$highest" = "$version" ] ||
	die "$identifier does not follow ${current#*-} — a pre-release only ever moves forward"

# The top section is the newest. If it is still open, opening another would
# leave two, and the release would publish the wrong one.
open=$(awk '/^## / { print; exit }' CHANGELOG.md)
case "$open" in
*unreleased*) die "CHANGELOG.md still has an open section (${open#\#\# }) — publish it before opening another" ;;
esac

# awk rather than `jq`, which would reformat the whole file, and rather than
# `sed -i "0,/re/s//.../"`, whose address-zero form is a GNU extension that BSD
# sed rejects outright — bypassing this script's own refusal path.
awk -v v="$version" '
	!done && /"version":/ {
		sub(/"version": "[^"]*"/, "\"version\": \"" v "\"")
		done = 1
	}
	{ print }
' package.json >package.json.bumping
mv package.json.bumping package.json
[ "$(jq -r .version package.json)" = "$version" ] ||
	die "package.json was not rewritten as expected — check it by hand"

awk -v heading="## $version — unreleased" '
	!inserted && /^## / { print heading; print ""; inserted = 1 }
	{ print }
	END { if (!inserted) { print heading; print "" } }
' CHANGELOG.md >CHANGELOG.md.bumping
mv CHANGELOG.md.bumping CHANGELOG.md

cat <<EOF

Opened $version on next.

  package.json   $current -> $version
  CHANGELOG.md   ## $version — unreleased

Everything delivered from now on is written under that heading. Replacing
"unreleased" with a date is what publishes it, and it is the last thing done
before the push.
EOF
