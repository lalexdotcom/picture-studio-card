#!/usr/bin/env bash
#
# Put the session on the right line, from wherever it happens to be.
#
#   scripts/start-branch.sh fix                  # go to main, the stable line
#   scripts/start-branch.sh fix <name>           # ... and cut <name> from it
#   scripts/start-branch.sh feature              # go to next, the feature line
#   scripts/start-branch.sh feature <name>       # ... and cut <name> from it
#
# The name is optional on purpose: "I want to fix a bug on the stable version"
# is said before anyone knows what to call the branch. Without a name this only
# moves and checks; the branch is cut later, by the same script.
#
# What it really buys is the recorded target. `git config branch.<name>.target`
# is written here, at the one moment the answer is known for certain, and read
# back at the close. Deriving it later is guesswork: a branch cut from `main`
# and one cut from a freshly recreated `next` share the same merge-base with
# `main`, so no amount of history walking can tell them apart.

set -euo pipefail

die() {
	echo "error: $*" >&2
	exit 1
}

[ $# -ge 1 ] && [ $# -le 2 ] ||
	die "usage: ${0##*/} <fix|feature> [name]"

cd "$(git rev-parse --show-toplevel)"

kind="$1"
name="${2-}"

case "$kind" in
fix) base=main ;;
feature) base=next ;;
*) die "expected 'fix' or 'feature', got '$kind'" ;;
esac

# Nothing in flight is ever moved, stashed or discarded: switching lines is
# refused outright while the tree is dirty. Stashing would lose nothing either,
# but it moves work the caller did not ask to move, and finding it again is a
# step nobody remembers. Untracked files count — `--porcelain` already honours
# .gitignore, so what it reports is real work.
if [ -n "$(git status --porcelain)" ]; then
	git status --short >&2
	die "the working tree is not clean — commit or stash it; nothing here will move it for you"
fi

if ! git show-ref --verify --quiet "refs/heads/$base"; then
	if [ "$base" = next ]; then
		die "there is no feature line open. Open one first: scripts/open-prerelease.sh <minor>"
	fi
	die "$base does not exist locally"
fi

# Behind the remote is the one state worth refusing: the branch would be cut
# from a base that is already history. Ahead is normal here — the user pushes
# when they choose to.
#
# `git ls-remote` first and the sha compared by name afterwards, rather than
# reading `FETCH_HEAD`: a fetch that finds nothing leaves the *previous* fetch's
# FETCH_HEAD in place, and comparing against that would answer a question nobody
# asked.
remote_base=$(git ls-remote origin "refs/heads/$base" | cut -f1)
if [ -n "$remote_base" ]; then
	git fetch --no-tags --quiet origin "$base"
	local_base=$(git rev-parse "$base")
	if [ "$remote_base" != "$local_base" ]; then
		if git merge-base --is-ancestor "$local_base" "$remote_base"; then
			die "$base is behind origin/$base — pull before cutting work from it"
		elif ! git merge-base --is-ancestor "$remote_base" "$local_base"; then
			# `--is-ancestor` is false for *behind* and for *diverged* alike; this
			# second test is what keeps a diverged base from passing as ahead.
			die "$base and origin/$base have diverged — reconcile them before cutting work"
		fi
	fi
fi

if [ -z "$name" ]; then
	git switch --quiet "$base"
	version=$(jq -r .version package.json)
	echo "On $base, carrying $version — the $([ "$base" = main ] && echo stable || echo "pre-release") line."
	echo "Cut the branch when it has a name: ${0##*/} $kind <name>"
	exit 0
fi

git check-ref-format --branch "$name" >/dev/null 2>&1 ||
	die "'$name' is not a usable branch name"

! git show-ref --verify --quiet "refs/heads/$name" ||
	die "branch $name already exists — switch to it with: git switch $name"

git switch --quiet -c "$name" "$base"
git config "branch.$name.target" "$base"

version=$(jq -r .version package.json)
echo "On $name, cut from $base ($version). It merges back onto $base at the close."
