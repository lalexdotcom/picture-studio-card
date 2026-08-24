#!/usr/bin/env bash
#
# Open a pre-release line: create `next` from `main`, carrying <minor>-beta.1.
#
#   scripts/open-prerelease.sh 1.6
#
# **It refuses; it never repairs.** Every check below stands for a way this has
# gone, or would go, wrong — and each of those ends in a release that cannot be
# taken back. A refusal naming the reason is always worth more than a fix nobody
# asked for.
#
# Why a script rather than a rule in AGENTS.md: a rule is a habit, and this
# project has already decided a habit is not a guarantee. The checks that matter
# here happen *before* the first commit, where CI cannot see them.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -eq 1 ] || die "usage: ${0##*/} <minor>   e.g. ${0##*/} 1.6"

cd "$(git rev-parse --show-toplevel)"

arg="$1"

# The `v` belongs to the git tag and to nothing else. Left in package.json it
# yields a `vv1.6.0-beta.1` tag and a base version of `v1.6.0`, which matches no
# changelog heading — a failure surfacing two pushes away from the mistake.
case "$arg" in
v*) die "drop the leading v — the tag carries it, package.json does not" ;;
esac

if [[ "$arg" =~ ^[0-9]+\.[0-9]+$ ]]; then
	base="$arg.0"
elif [[ "$arg" =~ ^[0-9]+\.[0-9]+\.0$ ]]; then
	base="$arg"
else
	die "expected a minor version, got '$arg' — 1.6 or 1.6.0, never 1.6.5: a line opens at .0"
fi

version="$base-beta.1"

# Nothing in flight is moved, stashed or discarded. This script switches
# branches and rewrites two files; a dirty tree is a refusal, never a stash.
if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

# `git tag -l` is not the authority here and has already caught a session: this
# clone has never fetched the tags the release workflow creates, so the local
# list runs several releases behind. Always the remote.
if git ls-remote --exit-code --tags origin "refs/tags/v$base" >/dev/null 2>&1; then
	die "v$base is already published — a pre-release of it can no longer be opened"
fi

# Three states, three different answers. Only the first is a plain redirection;
# the other two are decisions that are not this script's to take.
next_ref=""
if git show-ref --verify --quiet refs/heads/next; then
	next_ref=next
elif git ls-remote --exit-code --heads origin next >/dev/null 2>&1; then
	git fetch --no-tags --quiet origin next
	next_ref=FETCH_HEAD
fi

if [ -n "$next_ref" ]; then
	next_version=$(git show "$next_ref:package.json" | jq -r .version)
	next_base="${next_version%%-*}"

	echo "next already exists, carrying $next_version." >&2

	# "Already shipped" and "still in flight" look identical from the branch
	# alone — both are a `next` on `1.6.0-beta.3`. The remote tag is what tells
	# them apart, and telling a caller to "ship it first" when it shipped a week
	# ago is the kind of wrong answer that costs an hour.
	if git ls-remote --exit-code --tags origin "refs/tags/v$next_base" >/dev/null 2>&1; then
		die "the $next_base line has already shipped as v$next_base — next simply outlived it. Deleting a branch is destructive, so say so explicitly: git branch -d next && git push origin --delete next, then run this again."
	fi

	if [ "$next_version" = "$next_base" ]; then
		die "that is a stable version, so next was never recreated after its release. Deleting and recreating a branch is destructive — say so explicitly."
	elif [ "$next_base" = "$base" ]; then
		die "the $base line is already open. Switch to it: git switch next"
	else
		die "next holds the $next_base line, not $base. Ship it or abandon it before opening another."
	fi
fi

# `next` is cut from `main` whatever branch this is run from. Cutting from HEAD
# would bake unmerged work into the feature line, silently and permanently.
#
# `git ls-remote` first and the sha compared by name afterwards, rather than
# reading `FETCH_HEAD`: a fetch that finds nothing leaves the *previous* fetch's
# FETCH_HEAD in place, and comparing against that answers a question nobody
# asked.
remote_main=$(git ls-remote origin refs/heads/main | cut -f1)
[ -n "$remote_main" ] || die "origin has no main branch"
git fetch --no-tags --quiet origin main
local_main=$(git rev-parse main)

if [ "$remote_main" != "$local_main" ]; then
	if git merge-base --is-ancestor "$local_main" "$remote_main"; then
		die "main is behind origin/main — pull before opening a line from it"
	fi
	# Ahead is the normal state here: the user pushes when they choose to, so
	# main routinely sits in front of the remote. Worth saying, not refusing.
	ahead=$(git rev-list --count "$remote_main..$local_main")
	echo "note: main is $ahead commit(s) ahead of origin/main; next starts from the local tip."
fi

main_version=$(git show main:package.json | jq -r .version)
newest=$(printf '%s\n%s\n' "$main_version" "$base" | sort -V | tail -1)
if [ "$newest" != "$base" ] || [ "$main_version" = "$base" ]; then
	die "$base is not ahead of main's $main_version"
fi

git switch --quiet -c next main

# Where a branch merges is written down at the moment it is cut, never derived
# later: a branch cut from `main` and one cut from a freshly recreated `next`
# share the same merge-base with `main`, so the answer cannot be recomputed.
git config "branch.next.target" main

# A targeted substitution rather than `jq`, which would reformat the whole file.
sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$version\"/" package.json
[ "$(jq -r .version package.json)" = "$version" ] ||
	die "package.json was not rewritten as expected — check it by hand"

# Opening a version is both files or neither. `package.json` alone fails CI at
# the first push with "no section for $base", which is late and puzzling.
awk -v heading="## $base — unreleased" '
	!inserted && /^## / { print heading; print ""; inserted = 1 }
	{ print }
	END { if (!inserted) { print heading; print "" } }
' CHANGELOG.md >CHANGELOG.md.opening
mv CHANGELOG.md.opening CHANGELOG.md

git add package.json CHANGELOG.md
git commit --quiet -m "chore: open $version"

cat <<EOF

Opened $version on next, cut from main.

  package.json   $main_version -> $version
  CHANGELOG.md   ## $base — unreleased
  branch target  main

Pushing next publishes a pre-release, offered only to HACS users who turned on
"Show beta versions". Every beta from now on is a bump of package.json alone:
the heading keeps saying "unreleased" until $base ships as a stable from main,
and the release workflow refuses a beta of a heading that carries a date.
EOF
