# Prose Linting with kilint

kilint lints Markdown prose against the STE writing rules: short sentences,
active voice, no semicolons, no em-dashes, no contractions, no filler. The
tool lives in this repo at `skills/writing/kilint/`.

## Why lint prose

Agent-written prose drifts toward slop: long sentences, hedging, filler
phrases. kilint catches the form problems mechanically. A reviewer can
then focus on whether the content is true.

## Run it locally

Lint one file:

```bash
python3 skills/writing/kilint/bin/kilint docs/tips/hooks.md
```

Lint a directory:

```bash
python3 skills/writing/kilint/bin/kilint docs/
```

Score a before/after delta when you rewrite a document:

```bash
python3 skills/writing/kilint/bin/kilint --delta BEFORE.md AFTER.md
```

## Rule families

| Rule | id |
|---|---|
| Sentence length cap | `SEN001` |
| Paragraph length cap | `STR001` |
| No semicolon | `PUN001` |
| No em-dash | `PUN002` |
| No contraction | `WRD001` |
| Active voice | `VRB001` |
| No "-ing" main verb where a simple tense works | `VRB002` |
| No nominalization | `WRD006` |
| No phrasal verb | `WRD005` |
| No marketing adjective | `WRD003` |
| No filler phrase | `WRD004` |
| One name for one thing | `TRM001` |

Code blocks, verbatim quotes, and vendored trees are exempt. The routing
table in the shipped `kilint.toml` is the authority on exemptions.

## Score interpretation

kilint reports violations per 100 words.

- **Under about 1.5 violations per 100 words is clean.** Merge it.
- Above that, fix the flagged sentences and rerun.
- **Do not chase zero.** A score of zero usually means you rewrote correct
  sentences to dodge the linter. The score is a signal, not a target.

kilint fixes the form of slop, not the content. It cannot make a hollow
paragraph true. Review for accuracy separately.

## The CI gate

CI runs kilint on `docs/` for every PR. The gate fails the build when a
changed doc scores above the threshold. The workflow lives in
`.github/workflows/` and runs the same command you run locally, so a local
pass predicts a CI pass:

```bash
python3 skills/writing/kilint/bin/kilint docs/
```

Run this before you push any docs change.
