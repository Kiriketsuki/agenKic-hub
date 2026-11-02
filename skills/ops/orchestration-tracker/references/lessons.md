# Tracker lessons

Each lesson names the failure and the rule it left. SKILL.md states the rules.
This file keeps the reason behind each one.

## Page build

**A regex port deleted the stylesheet.** A port script ran
`re.sub(r"/\* Layout: a dependency graph[^\n]*", "...", t)` to change a CSS comment.
The pattern matched to the end of the line, so it also ate the closing `*/`. The
comment then ran on to the next `*/`, and the browser threw away every rule in
between. The page showed as plain text with no style. Rule: fill `{{TOKEN}}`
placeholders with an exact string replace (`scripts/page.py fill`). Change any
other page text with the Edit tool and the whole old string. Never regex-replace a
whole line of CSS. Run `page.py check` before every publish. It counts `/*` against
`*/` and `{` against `}` in each `<style>` and parses each script with node.

**A dark OS turned every page blue.** The page had a `prefers-color-scheme: dark`
block. It switched the page to the dark palette for any viewer with a dark OS. The
user wanted the light palette. Rule: light on bare `:root`, dark only under
`:root[data-theme="dark"]`. `page.py check` refuses a dark media block.

**Sections are goal-specific.** An earlier page had an extra collection for items
the team could test in person. A later port dropped it. Rule: the template carries
the seven standard sections only. Add a section only when the user asks for it, and
add its collection to the data model table in SKILL.md.

## Status

**"Waiting on 1" hid finished code.** The page derived "Waiting on N" from every
open dependency. A scenario looked stuck, but the team had merged all of its code.
The user wanted to see coding progress. Rule: a card is Done when its code merged.
A scenario with all code merged is Code complete. Open non-coding steps go in
`next`, not in `status`.

**Stale cards made the tracker lie.** A card stayed Waiting long after its report
went out. Rule: every sweep lists the open cards and closes the finished,
superseded and postponed ones.

**A sweep missed a user ruling.** A setting changed early in the morning, and the
next sweep did not carry it. Rule: read the timeline and the decision log before a
sweep writes anything.

## Data writes

**The local mirror fell behind.** Other sessions edited cards that the local mirror
file did not have. Rule: diff the mirror against a fresh read before a push. Never
overwrite a newer tracker status with the mirror. `if_version` on every write
enforces this.

**Note-only queue entries could not replay.** Some queued entries said "copy from
the other artifact". The other account could not read that artifact. Rule: queue
full documents (`build_seed.py --inline`), never a pointer to data.

**Arrays update whole.** An `update` on an array field such as `points` or `log`
replaces the whole array. Rule: read the doc, append, then write the full array
with `if_version`.

## Accounts

**Writes refused after an account change.** The trackers moved between accounts
several times. An artifact is visible only to its owner account until the user
shares it by hand. Invited editors from another organization can view a page but
cannot write its data from Claude Code. Rule: on a refused write, suspect the
account split first. Queue the writes, tell the user which account owns the page,
and flush oldest first when access returns.

## Process

**Another agent cannot make artifacts.** The orchestrator asked a second coding
agent for screenshots for a review page. The user ruled that artifacts are Claude
work. Rule: Claude or a Claude subagent builds and publishes every tracker. Other
sessions report progress, and the orchestrator writes it to the db.

**Render loops waste the session.** Rule: one screenshot at most after the first
publish, then trust the db list counts.

**Target dates.** One tracker carried `eta_start` and `eta_end` for a while,
because the user asked for estimates. The template does not draw them. Rule: no
target dates on cards unless the user asks for estimates.
