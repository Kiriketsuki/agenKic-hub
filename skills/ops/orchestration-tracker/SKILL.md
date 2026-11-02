---
name: orchestration-tracker
user-invocable: true
argument-hint: "[new <goal>|update|sweep|page]"
description: "Build and run an orchestration tracker: one Claude Artifact page per long-running goal. The page draws a left-to-right dependency graph of cards in lanes, with status chips, progress bars, who is doing what, the cards in progress, where each part stands, an hour-by-hour timeline and a checklist. It renders only from its db capability, and the orchestrator updates it with ArtifactData, never by republishing. Triggers: \"make a tracker\", \"tracking artifact\", \"tracker like the variation runs one\", \"set up a tracker for <goal>\", \"update the tracker\", \"tracker sweep\", \"/orchestration-tracker\"."
---

# orchestration-tracker

## Purpose

The orchestrator session keeps one tracker page per long-running goal. The user
reads it to see the real state of the work. This skill makes a new tracker in
minutes and keeps it true.

**Hard boundary.** Data changes go through ArtifactData. Republish the page only
when the page itself changes.

## Known trackers

Keep a small table of your trackers in your own notes. For each one, record the
artifact URL, the owner account and the local home folder.

The page uses one fixed schema (nodes, checks, live, timeline). A tracker with a
different schema, such as a queue or deploy desk, is outside this skill.

## Files

| File | Use |
|---|---|
| `assets/tracker-template.html` | The page with `{{TOKEN}}` placeholders |
| `scripts/page.py` | `fill` makes a page from a goal config. `check` tests a page before publish |
| `scripts/build_seed.py` | Turns a goal config into doc files and batch `writes` lists |
| `examples/example-release.json` | A neutral goal config you copy and edit |
| `references/lessons.md` | The failures behind the rules below |

## Data model

The page reads four collections. Field names are fixed, because the page code
reads them.

| Collection | Doc id | Fields |
|---|---|---|
| `nodes` | card slug | `id`, `label`, `lane`, `owner`, `reviewer`, `status`, `deps` (ids), `kind`, `ref`, `next`, `note`, `order`, optional `progress` (0 to 100), `worker`, `step` |
| `checks` | `r1`, `c1` | `order`, `text`, `sub` (list) |
| `live` | `l1` | `group` (`prod`, `main` or `epic`), `name`, `version`, `where`, `has` (list), `missing` (list), `order` |
| `timeline` | `dYYYYMMDD-HH00` | `day` ("Mon 2 Nov"), `dayOrder` (20261102), `hour` ("09:00"), `order` (900), `text`, `points` (list) |

- `status` is one of: Not started, In progress, In review, Waiting, Blocked,
  Code complete, Done, Postponed, Superseded, Out of scope.
- `kind` is `piece`, `step` or `scenario`. A `scenario` card draws in the final
  milestone column. The page also draws `stop` as a safety STOP card.
- `lane` must match one entry of the page's LANES list.
- The page derives "Ready now" and "Waiting on N" from `deps`. Never write
  either one as a status.

## Status rules

- A card is **Done** when its code merged into main, or into the epic when the
  goal works on epics. An open deploy or test run does not hold it back.
- A scenario card whose code is all merged is **Code complete**. The page counts Code
  complete as done for the cards that need it.
- Put the open non-coding steps in `next`, not in `status`.
- **Postponed**, **Superseded** and **Out of scope** are closed states. They never
  block another card.
- No target dates on cards, unless the user asks for estimates.

## Workflow A: a new tracker

1. **Pick a slug and a home.** Use `<tracker-home>/<slug>/`, a folder you keep outside the session scratchpad. A
   session scratchpad disappears with the session, so it is not a home.
2. **Write the goal config.** Copy `examples/example-release.json` to
   `<home>/goal.json`. Change `page`, `lanes`, `nodes`, `checks`, `live` and
   `timeline`. Give `storage_key` a new value such as `<slug>-graph-v1`. Set
   `owner_prefixes` to the session name prefix, for example `build-`.
3. **Fill the page.**
   `python3 <skill>/scripts/page.py fill <home>/goal.json <home>/page.html`.
   The script stops on a missing token, an unsafe value or a failed check.
4. **Build the seed.**
   `python3 <skill>/scripts/build_seed.py <home>/goal.json <home>/seed`. It refuses
   a bad status, kind, lane, dependency or cycle. Fix each STE warning it prints.
5. **Quickstart.** Call Artifact `action: "quickstart"` with `intent: "other"`
   once for the new tracker. Follow the page contract it returns.
6. **Load `artifact-capabilities`.** Load it before you pass `capabilities`.
7. **First publish.** Publish `<home>/page.html` with
   `capabilities: {"db": {}}`, one `icon` word such as `chart`, and a one-sentence
   `description`. The page calls `window.claude.use("db")` at load and shows a
   message when it returns null.
8. **Seed.** For each `<home>/seed/writes-NN.json`, call ArtifactData
   `action: "batch"` with that list as `writes`. Each file holds at most 50
   writes. New docs need no `if_version`.
9. **Verify.** Run one ArtifactData `list` per collection and compare the counts
   with the build output. Look at one screenshot at most. Do not loop on renders.
10. **Record it.** Add the URL and the owner account to the Known trackers table,
    to `goal.json` as `"artifact"`, and to the tracker hub memory.

## Workflow B: updates and sweeps

**Read before you write.** Every write to an existing doc carries `if_version`
from a fresh read. Use `list` with `out_dir` for a whole collection. Use `query`
with `{"where": [["id", "in", [...]]]}` for many cards at once. On a version
conflict, re-read that doc and redo the write.

**Card updates.** Use `update` with only the changed fields. An array field
(`deps`, `points`, `sub`) replaces whole, so read it, change it, and send it all.

**Progress.**
- When a session or the orchestrator starts a card, set `progress`, `worker` and
  `step`. The card then shows a bar and joins "Being worked on now".
- Raise `progress` as steps land, and change `step` to the current step.
- When work stops short of Done, remove the bar with
  `{"progress": {"__delete__": true}}`.

**Timeline.** Write one `timeline` doc per active hour, in your local time. The
`text` says what happened in one sentence. The `points` list the merges,
decisions and blockers.

**Sweep.** At each sweep, do these steps in order:
1. Read the timeline and the decision log
   (`<tracker-home>/decisions-*.md`). Note each user ruling.
2. List every card that is not Done.
3. Set Done on each card whose code merged. Set Code complete on each scenario whose
   code is all merged.
4. Close each stale card as Superseded, Postponed or Out of scope.
5. Refresh each `next` line that no longer says the real next step.
6. Fix `progress` on cards that stopped.
7. Write the timeline doc for the hour.
8. Send all of these writes in one batch.

To rebuild many docs from a config, pass a versions map:
`build_seed.py goal.json out --versions versions.json --only nodes`. The map is
`{"nodes/<id>": <version>}` from a fresh list.

## Workflow C: page changes

1. Change `goal.json` and run `page.py fill` again. For a change that no token
   covers, edit `page.html` with the Edit tool and the full old string.
2. Never regex-replace a whole line in CSS. See `references/lessons.md`.
3. Run `python3 <skill>/scripts/page.py check <home>/page.html`. It must pass.
4. Publish with the same `file_path` and no `capabilities` field. Leaving the
   field out keeps the db capability. Leave out `icon` too.
5. When LANES change, bump the `storage_key` suffix, so saved lane filters reset.
6. For a tracker from an earlier session, call Artifact `read` first, then
   publish with its `url`.

## Accounts and the pending queue

Artifacts belong to one account. With two accounts, an artifact published on one
is invisible to the other until the user shares it by hand.

When the server refuses a read or a write:
1. Suspect the account split first. Tell the user which account owns the page.
2. Build the writes with `build_seed.py ... --inline`, or write inline batch
   entries by hand. Queue entries hold full data, never a pointer to other data.
3. Save them as
   `<home>/pending-tracker-writes/<YYYY-MM-DD-HH00>-for-<artifact id>.json`.
4. When access returns, flush the queue oldest first. Fold the queued ops into one
   write per doc, pin each to a fresh version, and send them in batches of 50.
5. Move each flushed file to `<home>/pending-tracker-writes-flushed/`.

Never republish a new copy to get around a refusal without telling the user that
the old link stops working for them.

## Design rules

- Use your design system artifact. Copy its token values into the template's
  `:root` blocks.
- Light paper palette on bare `:root` with `color-scheme: light`. Dark palette only
  under `:root[data-theme="dark"]`. No `prefers-color-scheme: dark` block.
- A status shows as a mark shape plus a colour token. Text stays ink.
- The accent marks focus and active work only: progress fills, the pulse dot and
  the latest timeline hour.
- Keep the template JS and CSS as they are. Change goal text through tokens.

## Writing rules

All page copy and all card text follow STE `flavored` mode:
- Short sentences, 25 words at most. Active voice. Name the actor.
- No em-dash, no semicolon, no contraction.
- One name for one thing. Use the same card label in every field.
- `next` says the next action and who takes it.

## Never

- Republish the page to change data.
- Write to an existing doc without `if_version`.
- Write "Waiting on N" as a status.
- Overwrite a newer tracker status with a local mirror.
- Ask another coding agent for tracker screenshots or pages. Claude builds every artifact.
- Publish, delete or pin an artifact the user did not ask for.
