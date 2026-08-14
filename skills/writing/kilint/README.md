# kilint

kilint reads prose and reports the patterns that make writing sound generated.
It catches long sentences, passive voice, marketing adjectives, filler phrases,
and em-dashes. It is configurable and path aware. It knows the difference
between a runbook and a lecture note.

It checks the form of prose. It cannot judge whether the text is true or useful.
See [Limitations](#limitations).

kilint never edits your text. There is no `--fix`.

## Install

Python 3.11 or later. No third-party runtime dependencies.

```sh
ln -sf "$PWD/bin/kilint" "$HOME/.local/bin/kilint"
```

Or run it in place, with no symlink:

```sh
python3 ./bin/kilint README.md
```

Or as a module, once the package directory is on `PYTHONPATH`:

```sh
PYTHONPATH="$PWD" python3 -m kilint README.md
```

The spec asks for the shim at the top of the package directory. A directory
named `kilint` already sits there, so the shim lives at `bin/kilint`.

## Usage

```
kilint [PATHS...] [options]

  (no PATHS)              read stdin, lint as markdown
  --profile NAME          force a profile, ignoring path routing
  --config PATH           use this config file first
  --as {markdown,text,source,auto}   default auto, by extension
  --select IDS            only these rules, comma separated
  --ignore IDS            drop these rules
  --explain ID            print the rule's rationale and exit
  --list-rules            print the registry and exit
  --format {table,json,github,summary}   default table
  --delta OLD NEW         score two files and report the change
  --baseline REF          compare each path against its content at a git ref
  --fail-over N           override the failure threshold
  --no-fail               always exit 0
  --quiet                 only the summary line
  --version
```

kilint walks directory arguments. It collects only `.md`, `.markdown`, `.txt`,
and the known source extensions. It reports a file routed to the `off` profile
as skipped.

### A pull request body

```sh
gh pr view 42 --json body -q .body | kilint --profile flavored
```

### Docs and READMEs

```sh
kilint README.md
```

### An error message or a runbook

Short, high-stakes text. Use the strict profile.

```sh
kilint --profile strict docs/runbook-failover.md
```

### Code comments and docstrings

Point kilint at a source file and it lints only comments and docstrings. Code,
identifiers, and ordinary string literals are never read.

```sh
kilint kilint/rules.py
```

Python uses the stdlib `tokenize` module, so a `#` inside a string is not a
comment. The C-like scanner tracks string and template literals and regex
literals, so a `//` inside a JavaScript string is not a comment either.

Comments get two forced adjustments, because comments are terse by nature. The
`SEN001` cap rises by `comment_sentence_bonus` (default 10 words) and `STR001`
is off. kilint skips a comment shorter than `comment_min_words` (default 6). A
docstring or a public API comment benefits from the discipline. A three-word
note about why one line is odd does not.

## Profiles

A profile sets thresholds and per-rule severity. `"off"` disables a rule.

| profile | for | sentence cap | paragraph caps | threshold |
|---|---|---|---|---|
| `strict` | procedures, runbooks, error messages, migration steps | 20 | 6 sentences and 120 words | 0.8 |
| `flavored` | READMEs, PR bodies, docs, release notes (the default) | 25 | 8 sentences and 160 words | 1.5 |
| `prose` | lecture notes, long-form explanation, anything with a voice | 35 | 12 sentences and 400 words | 3.0 |
| `off` | skip the file entirely | n/a | n/a | n/a |

`strict` turns every rule on, including `STR002` and `SEN002`. `flavored` turns
`STR002`, `PUN004`, and `WRD008` off. `prose` runs only `SEN001`, `PUN002`,
`WRD003`, `WRD004`, and `WRD007`.

Define your own with `[profiles.NAME]` and inherit with `extends`.

## Rules

Run `kilint --list-rules` for the registry and `kilint --explain ID` for the
rationale behind any one of them.

| id | name | category | default |
|---|---|---|---|
| `SEN001` | long-sentence | sentence | error |
| `SEN002` | compound-instruction | sentence | warn |
| `STR001` | long-paragraph | structure | warn |
| `STR002` | condition-after-command | structure | info |
| `PUN001` | semicolon | punctuation | error |
| `PUN002` | em-dash | punctuation | error |
| `PUN003` | exclamation | punctuation | warn |
| `PUN004` | smart-quotes | punctuation | info |
| `WRD001` | contraction | words | error |
| `WRD002` | long-word | words | error |
| `WRD003` | marketing-adjective | words | error |
| `WRD004` | filler-phrase | words | error |
| `WRD005` | phrasal-verb | words | warn |
| `WRD006` | nominalization | words | warn |
| `WRD007` | emoji | words | error |
| `WRD008` | vague-quantifier | words | info |
| `VRB001` | passive-voice | verbs | error |
| `VRB002` | ing-main-verb | verbs | warn |
| `VRB003` | modal-stack | verbs | warn |
| `TRM001` | inconsistent-term | terminology | error when configured |

Notes on the ones that surprise people:

- `STR001` trips only when a paragraph exceeds both the sentence cap and the
  word cap. List items never count as paragraph sentences. A numbered list of
  nine short steps is good writing, not a long paragraph.
- `VRB001` ships an allow list of adjectival participles, so `is based on`,
  `is required`, and `is available` do not fire. The shipped `kilint.toml` adds
  predicate adjectives such as `is set` and `is broken` on top. Extend it with
  `words.extend_allow_passive`. An entry that starts with a be-word covers every
  be-word, so `is broken` also covers `are broken` and `was broken`.
- `VRB002` has the same mechanism under `words.allow_progressive`, for stative
  `-ing` adjectives such as `is missing` and `is pending`.
- `VRB003` fires on two modals next to each other, as in `may possibly`. One
  modal per clause is fine, so a sentence with two clauses does not fire.
- `SEN002` fires only when a real imperative verb follows the joiner, and never
  on a serial list such as `a, b, and c`. Add your own verbs with
  `words.extend_imperative_verbs`.
- `WRD006` uses a closed list under `words.nominalizations`, not a
  `tion/ment/ance/ence` suffix rule. A suffix rule also catches plain nouns such
  as `instance of`, which have no plain verb to swap in.
- `TRM001` stays silent until you fill in `[terminology]`. It never fires on a
  default install.
- Word-list rules are word-boundary and case-insensitive. They never fire
  inside code spans, code fences, inline math, link targets, or URLs. They do not
  match substrings, so `unlocked` never matches a shorter entry. Add a trailing
  `*` to an entry to opt into prefix matching.
- Word-list rules and `WRD001` skip a quoted mention and a negative example, the
  same way `PUN003` skips a quoted exclamation. A glossary that bans `"utilize"`
  is not using the word.

## Scoring

```
score = sum(weight[severity] * count) * 100 / words
```

Default weights are `error 1.0`, `warn 0.6`, `info 0.25`. Lower is cleaner.

A score is never reported for a text under `min_words` (default 40). kilint
prints `n/a (too short)` instead. Per-100-word rates are noise on short outputs,
which the reference experiment documented on 17-word to 31-word deprecation
notices. kilint still lists every violation. It hides only the score.

## Config

Discovery order. The first hit wins for the file. kilint then merges all of
them shallow to deep, and an earlier entry overrides a later one.

1. `--config PATH`
2. `$KILINT_CONFIG`
3. the nearest `.kilint.toml`, walking up from the linted file
4. `~/.config/kilint/config.toml`
5. the shipped `kilint.toml` next to the package

Tables merge, arrays replace, and any key named `extend_*` appends instead of
replacing. Unknown top-level keys and unknown word lists are a config error and
exit 2.

```toml
default_profile = "flavored"
min_words = 40
fail_over = 1.5          # exit 1 when the score exceeds this; omit to use the profile threshold
comment_sentence_bonus = 10
comment_min_words = 6

[weights]
error = 1.0
warn = 0.6
info = 0.25

[rules]
PUN002 = "error"          # severity override, or "off"
WRD008 = "warn"

[words]
extend_marketing = ["frictionless", "bleeding-edge"]
replace_long_word = []    # replace a list wholesale
allow_passive = ["is scheduled"]

[terminology]
"pull request" = ["PR", "merge request"]

[profiles.house]
extends = "flavored"
max_sentence_words = 22

[profiles.house.rules]
VRB002 = "off"

[[paths]]
glob = "**/journal/**"
profile = "off"

[[paths]]
glob = "**/docs/**/*.md"
profile = "flavored"
```

### Path routing

kilint reads `[[paths]]` entries in order and the **last match wins**. Globs
support `**`, `*`, and `?`. kilint matches them against the path relative to the
config root, then against the absolute path. The config root is the directory of
the nearest `.kilint.toml`, or the repository root above the file when no
project config exists.

The shipped defaults route journals, diaries, daily notes, references, dependencies,
and Git internals to `off`. They route lectures, essays, and digital-garden content to
`prose`, and route error docs, runbooks, and migrations to `strict`. Everything else
gets `flavored`. Add project-specific paths in the nearest `.kilint.toml`.

## Suppression

File level, anywhere in the file:

```html
<!-- kilint-disable-file -->
```

Or in frontmatter:

```yaml
---
kilint: off
---
```

Frontmatter also takes a small block. A hand-rolled reader parses it, so there
is no YAML dependency:

```yaml
---
kilint:
  profile: strict
  disable: [VRB001, SEN001]
---
```

Next line, with or without rule ids:

```html
<!-- kilint-disable-next-line VRB001,SEN001 -->
```

A region:

```html
<!-- kilint-disable VRB001 -->
prose that VRB001 must not read
<!-- kilint-enable VRB001 -->
```

In source files the same directives work behind any line comment leader, for
example `# kilint-disable-next-line WRD003` or `// kilint-disable-file`.

Directives inside a fenced code block are documentation and do nothing, which is
why this README can show them. An unknown rule id in a directive is a warning on
stderr, not a crash.

## The delta workflow

A single absolute score is weak evidence. The change between two versions of the
same text is the signal. Lint a draft, rewrite it, then lint it again.

```sh
kilint --delta /tmp/draft-v1.md /tmp/draft-v2.md
```

```
before  4.19/100w  (191 words, 8 violations)
after   1.18/100w  (169 words, 2 violations)
delta   -72%       6 violations removed, 0 added
        gone:  PUN002 x4, WRD003 x2, SEN001 x2
        new:   none
```

`--delta` always exits 0. It reports, it does not gate.

To compare a file against its committed version instead:

```sh
kilint --baseline HEAD README.md
```

## Output

`--format table` is the default and prints one block per file. kilint adds
colour only when stdout is a TTY and `NO_COLOR` is unset. There is no emoji
anywhere.

`--format json` emits a stable schema: `{version, schema, files: [{path,
profile, words, sentences, score, threshold, skipped, reason, categories,
violations}], summary}`.

`--format github` emits `::error file=...,line=...,col=...::MSG` annotation
lines for CI.

`--format summary` and `--quiet` print only the final line.

## Exit codes

| code | meaning |
|---|---|
| 0 | clean, or `--no-fail`, or `--delta` |
| 1 | at least one file scored over its threshold |
| 2 | usage error, unreadable file, or bad config |

## Limitations

kilint checks form. It cannot judge whether the text is true, complete, or
useful. A paragraph can score 0.00 and still be wrong, hollow, or a lie. The
rules are heuristics, not a parser. Passive voice detection works on patterns
and imperative detection works on a verb list. Both miss cases, and both catch a
few that a careful editor would keep. That is what `--ignore`, the severity
overrides, and the suppression directives are for.

kilint is not a certified ASD-STE100 checker. The judgment rules of the standard
need a human. This covers the mechanical subset, which is where the slop lives.

Comment linting reads comments and docstrings only. It will not tell you that a
comment is stale or wrong, only that it reads badly.

## Credit

The idea and the experiment that motivated it come from ASD-STE100, the
Simplified Technical English standard first published in 1986 for aerospace
maintenance documentation. The specification is free at
[asd-ste100.org](https://asd-ste100.org).

The episode kit lives in `reference/`. It holds the distilled STE writing skill, the
120-line heuristic linter that started this, and the cross-model experiment results.
This tool is a different one, with different rules and different weights. Its numbers
will not match the reference linter's numbers, by design.
