# changelog per pre-release — design

Date: 2026-08-31 · Target: the release tooling, on `main` (see decision 9)

## Goal

Give **every published artefact its own changelog section**, pre-releases
included, so that the notes of `1.6.0-beta.2` say what changed since
`1.6.0-beta.1` and nothing else — and consolidate those sections into the
stable's section, by hand and under review, when the minor ships.

Two invariants, in the words they were asked in:

- `next` publishes releases carrying **only what changed since the previous
  release on that line** — or since `main`'s last stable, for the first
  pre-release after `next` was cut.
- `main` publishes coherent releases, each carrying the changelog between it and
  the release before it.

`main` already satisfies its invariant and **nothing about `main`'s day-to-day
changes here**: it has always had one section per released version. Only the
pre-release line and the moment of shipping a minor are affected.

## Why not the cheaper answer

The delta could be *derived* rather than written: compare the `## 1.6.0` section
at the previous tag with the same section now, and publish the entries that
appeared. One step in `release.yml`, no convention change, nothing to
consolidate.

It was rejected for a reason that outweighs its cost, and the current file is
the evidence. In `## 1.6.0` today, **five of the six `Fixed` entries describe
bugs no user of a stable release could ever have met** — the resize handles, the
image element, its cameras — because the feature they belong to has never
shipped. Only "editing a card no longer makes the picture jump" is a fix to
published behaviour. Someone upgrading `1.5.3` → `1.6.0` would read that the
eight resize handles sat slightly inside their outline, having never had a
handle.

A derived delta does not touch that. The problem is not created by per-beta
sections; it exists now, and one section per minor makes it **invisible rather
than absent**. The two audiences differ — the tester really did meet those bugs,
the stable's user never will — and a section per artefact is what lets that
difference be written down. The consolidation is where it gets written.

## Decisions

### 1. One section per published artefact, and the same rule on both lines

`## 1.6.0-beta.3 — 2026-09-04`, `## 1.5.4 — 2026-09-01`. A section under work
reads `— unreleased`; replacing that word with a date is the act that publishes,
on `next` exactly as on `main`.

Sections stay ordered by descending version, which remains descending date:
`1.6.0-beta.2`, `1.6.0-beta.1`, `1.5.4`. The back-merge's conflict rule in
`AGENTS.md` § Closing a session is unaffected — `CHANGELOG.md` keeps **both**
sides, `package.json` keeps `next`'s — because both sides still add sections at
the top of the file.

This replaces `AGENTS.md` § Changelog rules 6 and 7, whose "one section per
minor" is the thing being changed. The argument those rules made — that the
final section would otherwise have to be rewritten as the union of every beta —
is answered, not dismissed: the rewrite is now a named step with a script and a
review, and decision 5 is what it costs.

### 2. A published section is frozen

Once a pre-release is out, its section is history: it says what its testers were
told. Work that changes what an earlier beta described gets a **new entry in the
current section**, never an edit to the old one.

This is what loads the consolidation, and it is the price of the invariant. The
alternative — retouching a published section — would make the file disagree with
the release notes GitHub has already frozen.

### 3. The next section opens at the first delivery that follows, not at the publication

After `beta.7` is published there is no open section. The first delivery that
needs a changelog entry opens the next one — and only then, because **only then
is the identifier known**: the next pre-release may be `beta.8` or it may be
`rc.1`, and that is a decision, not an increment (decision 4).

**This costs a silent failure, and it must be written down.** Writing an entry
into the dated section of `beta.7` without bumping, then pushing, gives a green
CI and **no release at all**: the release job finds `v1.6.0-beta.7` already
tagged, reports "nothing to release", and succeeds. Nothing anywhere says the
work was not published.

CI cannot catch it — the state is indistinguishable from a legitimate no-op
push. The mitigations are that opening the next pre-release is one command, that
`AGENTS.md` names it at the point where deliveries are described, and that the
command refuses rather than repairs.

### 4. The pre-release identifier is an argument, never an increment

`beta.8` and `rc.1` are both legitimate successors of `beta.7`, and no script can
know which one is meant. Every place that opens a pre-release takes the
identifier from the caller.

Two consequences run through the rest of this design: the consolidation must
gather **every** pre-release of the base version and not only `beta.*`, and it
must order them by **SemVer precedence rather than by string comparison** —
`beta.10` after `beta.9`, `rc.1` after `beta.7`.

### 5. The close: consolidate, prune, then close

The shipping sequence in `AGENTS.md` § Branches keeps its first three steps and
gains the rest:

1. back-merge `main` into `next`
2. whole-branch review of `next` → `main`
3. merge `next` into `main`, locally, a real merge
4. **consolidate**: every `## 1.6.0-<pre>` section becomes one section headed by
   the **highest** of them (decision 6), and `package.json` is *written* to that
   same version rather than inherited from the merge resolution
5. **prune**: the editorial pass, proposed with reasons and applied only on the
   user's approval (decision 11)
6. **close**: the suffix leaves `package.json`, the heading becomes
   `## 1.6.0 — <date>`
7. push `main`, then delete `next`

Nothing is visible outside the machine before step 7: `main` is not pushed until
the close is done.

### 6. The consolidated section keeps the highest **published** number

`## 1.6.0-beta.7`, not a fresh `## 1.6.0-beta.8`. The merged content *is*
beta.7's content — nothing was added since — so a new number would name a build
that never existed, and someone would eventually look for its tag.

The cost is that the section briefly carries a number whose GitHub notes,
frozen, say something else. It lasts as long as the pruning, on an unpushed
branch, seen by nobody.

### 7. The absence of `## 1.6.0` is the safety catch

This is the property the whole shape buys, and it is why steps 4 and 6 are
separate. Between them, `package.json` says `1.6.0-beta.7` and the top section
says `## 1.6.0-beta.7`:

- a push of `main` in that state is refused by a guard that already exists — a
  suffixed version cannot be published from `main`;
- and `1.6.0` cannot be published either, because **its section does not exist
  yet**.

The heading becomes the catch, one level above the date that plays that role
today, and it appears only by the deliberate act of step 6. Whoever changes
these scripts must keep steps 4 and 6 separate; merging them into one command
throws this away.

### 8. What `release.yml` becomes

- **The changelog step matches the exact version**, not its base. One rule for
  both branches: the section for the version being published must exist, be
  non-empty, and no longer say `unreleased`.
- **The inverted pre-release catch is deleted.** It exists only because a
  pre-release had no section of its own; with decision 1 it has one, and the
  rule above covers it.
- **A direct check replaces what that catch protected** — a beta of a version
  whose stable already shipped, from a `next` that was never recreated: refuse
  `X.Y.Z-<pre>` when the release `vX.Y.Z` already exists. Asked of the tags
  rather than inferred from a heading's date.
- **The branch/version agreement stays untouched.** It is what makes the
  consolidation state of decision 7 unpublishable, on top of what it already
  guards.
- **The `main` reconciliation step stays untouched.**

### 9. `release.yml` runs from the default branch, which fixes the order of the work

Verified against GitHub's documentation: a `workflow_run` workflow "will only
trigger a workflow run if the workflow file exists on the default branch", and
the copy that executes is that branch's — whatever branch CI ran on.

So the workflow change has **no effect until it is on `main` and pushed**. If the
convention landed on `next` first, a beta push would be judged by `main`'s old
job, which looks for `## 1.6.0` and would refuse for want of a section.

The order is therefore forced, and the spec is written on a branch cut from
`main` for that reason. Everything here — `AGENTS.md`, the scripts, the skill,
`release.yml` — lands on `main` and reaches `next` by the back-merge that
`AGENTS.md` already owes after every fix. Only the reshaping of `next`'s own
`## 1.6.0` section into `## 1.6.0-beta.1` happens on `next`.

Pushing that to `main` publishes nothing: `main` is on `1.5.3` and `v1.5.3` is
already tagged, so the release job's gate reports "nothing to release" and ends
green. Confirm rather than trust — `jq -r .version package.json` on `main` and
`git ls-remote --tags origin`.

### 10. Two scripts and one skill

- `scripts/bump-prerelease.sh <identifier>` — decision 3's command, and the one
  used most: it writes `package.json` to `1.6.0-<identifier>` and inserts
  `## 1.6.0-<identifier> — unreleased`. It refuses off `next`, refuses while a
  section is still open, and refuses an identifier that does not follow the
  current one by SemVer precedence. This is a **distinct moment** from
  `open-prerelease.sh`, which opens the line itself by cutting `next` from
  `main`; sharing one script between the two would make the frequent act carry
  the rare one's checks.
- `scripts/consolidate-changelog.sh` — step 4. Deterministic, and in the idiom
  of the two scripts already there: it refuses rather than repairs. Dirty tree,
  wrong branch, no pre-release section, a version already closed — each is a
  refusal naming its reason.
- `scripts/close-version.sh` — step 6. Separate because the user's approval
  separates them (decision 7).
- `.claude/skills/ship-version/` — the procedure. It runs the first script,
  performs the editorial pass, presents it, and runs the second only once
  approved. Named `ship-version` and not anything in "close", which would
  collide with `AGENTS.md` § Closing a session.

`scripts/open-prerelease.sh` changes too: its hard-coded `-beta.1` becomes the
caller's identifier, and its closing message states today's rule — "every beta
from now on is a bump of package.json alone" — which decision 1 replaces.

### 11. What makes the pruning reliable rather than a matter of taste

The skill asks one **verifiable** question of every `Fixed` and `Changed` entry:
*does its subject appear in this same version's `Added`?*

- Yes → the feature has never shipped, so no user of a stable release ever met
  the bug. The entry belongs to the beta's testers and is dropped.
- No → it fixed published behaviour. It stays.

On the six entries in `## 1.6.0` today, that single question decides all six
correctly.

Two obligations come with it. **Nothing is cut silently**: the consolidation has
already removed the per-beta headings, so git is the only remaining record, and
every proposed cut is shown with its reason and applied only on approval — which
is `AGENTS.md` rule 9 where it matters most. And **pruning is not only
deletion**: an `Added` entry written in `beta.1` may describe behaviour a later
beta changed, so the pass also reports the entries that no longer describe what
ships.

### 12. Verification

The scripts are bash and get exercised on a throwaway clone with fabricated
changelogs, one case per refusal and one per trap: `beta.10` against `beta.9`,
an `rc` after betas, a missing section, an already-closed version, a dirty tree.

`release.yml` cannot be unit-tested, but its changelog step is pure text
processing: it is simulated locally against the real file, as the current one
was on 2026-08-31 before the first beta push. `actionlint` runs in CI and
covers the YAML and the shell.

### 13. Migration

`next` currently carries `## 1.6.0 — unreleased` and has published nothing. Its
first section simply becomes `## 1.6.0-beta.1 — unreleased`, and there is no
history to convert.

**If `1.6.0-beta.1` is pushed before this work lands**, the retrofit is one
heading: the published section becomes `## 1.6.0-beta.1 — <its date>` and the
next delivery opens `beta.2`. Nothing else changes, because the sections are the
same text either way.
