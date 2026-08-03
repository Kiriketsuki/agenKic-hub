# kilint - build spec

`kilint` is Jovian's own anti-slop prose linter. It is inspired by the ASD-STE100
experiment in `reference/` but it is not that tool and must not copy its code. The
reference implementation is a 120-line heuristic script; kilint is a configurable,
testable package with profiles, path routing, suppression, comment-aware source
linting, and delta scoring.

Read `reference/README.md`, `reference/experiment-results.md` and
`reference/before-after-samples.md` for the background. Read `reference/ste-lint.py`
only to understand which heuristics were tested - do not copy its structure, its
regexes verbatim, or its output format.

## Design goals

1. **Configurable, not opinionated by hardcode.** Every word list, threshold, and
   severity is overridable in TOML. The defaults encode Jovian's house style.
2. **The delta is the signal.** A single absolute score is weak evidence. First-class
   support for scoring two texts and reporting the change.
3. **No false-positive tax.** A linter that cries wolf on his daily notes gets
   uninstalled. Path routing and profiles must make personal writing exempt by default.
4. **Form only.** kilint checks the FORM of prose. It cannot judge truth or substance.
   Say so in the README. Never auto-fix text.
5. **Stdlib only.** Python 3.11+, `tomllib` from stdlib. No third-party runtime deps.
   `pytest` for tests only.

## Layout

```
000-System/Scripts/kilint/
  kilint/
    __init__.py        # __version__, public lint() API
    __main__.py        # python -m kilint
    cli.py             # argument parsing, exit codes, orchestration
    config.py          # TOML load, discovery, merge, profile resolution, path routing
    profiles.py        # built-in profile definitions
    rules.py           # rule registry + every rule implementation
    text.py            # segmentation, masking, frontmatter, suppression directives
    source.py          # comment/docstring extraction for code files
    report.py          # table / json / github / summary renderers, delta rendering
  tests/
    test_text.py test_rules.py test_config.py test_source.py
    test_cli.py test_report.py test_delta.py
    fixtures/*.md fixtures/*.py fixtures/*.ts
  kilint.toml          # shipped default config (the house style)
  README.md
  kilint               # executable shim: #!/usr/bin/env python3 -> cli.main()
  reference/           # the episode kit, read-only, never imported
```

## Text pipeline (text.py)

Order matters. Each stage must preserve line/column offsets so violations can be
reported at real positions. Use a masking approach: replace masked spans with spaces
of equal length rather than deleting them.

1. Split YAML frontmatter (`---` fenced, first line only). Parse it for a `kilint:`
   key without a YAML dependency - accept a minimal inline form documented below.
2. Mask fenced code blocks (``` and ~~~, any info string), indented code blocks
   (4-space, only when not inside a list), inline code spans (`` ` `` and ``` `` ```),
   HTML blocks, HTML comments (but read directives out of them first), math (`$$`).
3. Mask URLs, bare autolinks, markdown link *targets* (keep link text), image alts,
   footnote definitions, and reference definitions.
4. Mask markdown table delimiter rows; keep cell text as prose.
5. Strip leading heading markers, list bullets, numbered-list markers, blockquote `>`.
6. Sentence segmentation: split on `.!?:` followed by whitespace + capital/digit/quote.
   Protect: abbreviations (`e.g.`, `i.e.`, `etc.`, `vs.`, `Dr.`, `No.`, `Fig.`),
   decimals, version strings, ellipses, and `file.md:12` style refs.
7. Word count: tokens matching `[A-Za-z][A-Za-z0-9'’\-/]*` plus bare numbers.

A **block** is a paragraph, a list, a heading, or a table. Rules that operate on
paragraphs must treat a list as one block but must NOT count each list item as a
sentence for the long-paragraph rule - this is the documented false positive in
`reference/experiment-results.md` where STE's short sentences were penalised. Fix it:
`STR001` counts sentences only in true prose paragraphs, and its default cap is
sentence-count AND word-count based (a paragraph trips only if it exceeds both).

## Rules (rules.py)

Every rule is an object with: `id`, `name`, `category`, `default_severity`,
`explain` (2-4 sentences, printed by `--explain`), `suggest` (short fix hint shown in
output), and a `check(doc, cfg) -> list[Violation]`.

`Violation`: `rule_id, line, col, severity, message, excerpt, suggestion`.

Registry maps id -> rule. `--list-rules` prints id, name, category, default severity.

### Sentence and structure

| id | name | default | notes |
|---|---|---|---|
| `SEN001` | long-sentence | error | over `max_sentence_words`. Report actual count. |
| `SEN002` | compound-instruction | warn | imperative sentence containing `, and ` / ` and then ` / ` then ` joining two verb phrases. Off in `prose`. |
| `STR001` | long-paragraph | warn | prose paragraph over `max_paragraph_sentences` AND `max_paragraph_words`. Lists exempt. |
| `STR002` | condition-after-command | info | sentence starting with an imperative verb and ending in a trailing `if ...` / `when ...` clause. STE wants the condition first. Off by default outside `strict`. |

### Punctuation

| id | name | default | notes |
|---|---|---|---|
| `PUN001` | semicolon | error | outside code. |
| `PUN002` | em-dash | error | `—` and `–`. House rule: never. Suggest spaced hyphen or a split sentence. |
| `PUN003` | exclamation | warn | outside quoted speech. |
| `PUN004` | smart-quotes | info | `“ ” ‘ ’` in technical prose. Off by default. |

### Words

| id | name | default | notes |
|---|---|---|---|
| `WRD001` | contraction | error | `don't`, `you've`, `it's`. Handles both `'` and `’`. |
| `WRD002` | long-word | error | word-list: `utilize/leverage/facilitate/ensure/prior to/subsequent to/obtain/demonstrate/additionally/furthermore/moreover/commence/initiate/in order to/due to the fact that/a variety of/in the event that/whilst/amongst/numerous/myriad/plethora/aforementioned/comprehensive`. Message must name the short replacement. |
| `WRD003` | marketing-adjective | error | `seamless/robust/powerful/cutting-edge/effortless/world-class/next-generation/revolutionary/blazing/lightning-fast/battle-tested/enterprise-grade/best-in-class/state-of-the-art/game-changing/turnkey/supercharge/unlock/unleash/empower/delightful/elegant`. |
| `WRD004` | filler-phrase | error | `it is important to note/it should be noted/it is worth noting/please note that/as mentioned/as noted above/needless to say/at the end of the day/when it comes to`. |
| `WRD005` | phrasal-verb | warn | `spin up/spin down/reach out/dive into/kick off/roll out/tear down/ramp up/circle back/drill down/take a look at`. Suggest the plain verb. |
| `WRD006` | nominalization | warn | `perform an analysis`, `carry out a review`, `make use of`, `provide support for`, and `<word>tion/ment/ance/ence of` patterns. |
| `WRD007` | emoji | error | any emoji codepoint. Enforces the vault's no-emoji rule. |
| `WRD008` | vague-quantifier | info | `several/various/a number of/some amount of` in technical claims. Off by default. |

Word-list rules must be **word-boundary and case-insensitive**, must not fire inside
masked spans, and must not match substrings (`ensure` must not match `ensures` twice,
`unlock` must not match `unlocked` unless the list says so - support a trailing `*`
in list entries to opt into prefix matching).

### Verbs

| id | name | default | notes |
|---|---|---|---|
| `VRB001` | passive-voice | error | `be`-verb + past participle. Must support an `allow` list of adjectival participles that are not really passive (`is based on`, `is required`, `is available`, `is related to`, `is known as`, `is located`, `is designed to`, `is intended`, `is supported`, `is deprecated`). Default allow list ships with those. |
| `VRB002` | ing-main-verb | warn | `be`-verb + `-ing` where a simple tense works. Allow `is going to`? No - flag it. |
| `VRB003` | modal-stack | warn | two or more of `may/might/could/should/would/can` + `help/try/attempt` in one sentence, or `may help to`. |

### Terminology

| id | name | default | notes |
|---|---|---|---|
| `TRM001` | inconsistent-term | error when configured | driven by `[terminology]` in config: `canonical = ["alias", "alias"]`. Fires on any alias. Empty by default, so it never fires unless the user configures it. This is STE's "one name for one thing". |

## Scoring

- `score = sum(weight[severity] * count) * 100 / words`. Default weights:
  `error 1.0, warn 0.6, info 0.25`. Weights configurable under `[weights]`.
- Report `score`, `words`, `sentences`, raw `violations` count, and a per-category
  breakdown.
- **Never report a score for texts under `min_words` (default 40).** Print `n/a
  (too short)` instead. This is the documented noise problem with short outputs in
  `reference/experiment-results.md`. Violations are still listed; only the normalised
  score is suppressed.

## Profiles (profiles.py)

Four built-ins. A profile sets thresholds and per-rule severity overrides
(`"off"` disables).

- `strict` - procedures, runbooks, error messages, migration steps.
  `max_sentence_words 20`, `max_paragraph_sentences 6`, `max_paragraph_words 120`,
  all rules on, `STR002` on, `SEN002` on, threshold `0.8`.
- `flavored` - READMEs, PR bodies, docs, release notes. **The default.**
  `max_sentence_words 25`, `max_paragraph_sentences 8`, `max_paragraph_words 160`,
  `WRD006`/`WRD005` warn, `STR002` off, threshold `1.5`.
- `prose` - lecture notes, long-form explanation, anything with a voice.
  `max_sentence_words 35`, only `PUN002 WRD003 WRD004 WRD007 SEN001` active,
  everything else off, threshold `3.0`.
- `off` - no rules run; the file is skipped and reported as skipped.

Profiles are extensible: `[profiles.myname]` in config creates or overrides one,
and `extends = "flavored"` inherits.

## Config (config.py)

Discovery order, first hit wins for the file, then merged shallow-to-deep:

1. `--config PATH`
2. `$KILINT_CONFIG`
3. nearest `.kilint.toml` walking up from the linted file to the filesystem root
4. `~/.config/kilint/config.toml`
5. the shipped `kilint.toml` next to the package

Later entries are the base; earlier entries override. Merge is deep for tables,
replace for arrays, except `extend_*` keys which append.

```toml
default_profile = "flavored"
min_words = 40
fail_over = 1.5          # exit 1 when score exceeds; null disables

[weights]
error = 1.0
warn = 0.6
info = 0.25

[rules]
PUN002 = "error"          # severity override, or "off"
WRD008 = "warn"

[words]
extend_marketing = ["frictionless", "bleeding-edge"]
replace_long_word = []    # replacing a list wholesale
allow_passive = ["is scheduled"]

[terminology]
"pull request" = ["PR", "merge request"]

[[paths]]
glob = "**/journal/**"
profile = "off"

[[paths]]
glob = "**/docs/**/*.md"
profile = "flavored"
```

Path routing: `[[paths]]` entries are evaluated in order, **last match wins**, matched
against the path relative to the config file's directory, then against the absolute
path. Support `**`, `*`, `?` via `fnmatch` on a normalised POSIX path.

### Shipped defaults (`kilint.toml`) - the house style

Personal-writing exemptions, profile `off`: journals, daily notes, diaries,
`**/reference/**`, `**/node_modules/**`, and `**/.git/**`.
Profile `prose`: lectures, essays, and digital-garden content.
Profile `strict`: `**/ERROR*.md`, `**/runbook*.md`, `**/RUNBOOK*.md`, `**/migrations/**`.
Everything else: `flavored`.

## Suppression (text.py)

- File level: `<!-- kilint-disable-file -->` anywhere, or frontmatter `kilint: off`.
- Frontmatter: a `kilint:` block supporting `profile: strict` and
  `disable: [VRB001, SEN001]`. Parse it with a small hand-rolled reader; do not add a
  YAML dependency.
- Next line: `<!-- kilint-disable-next-line VRB001,SEN001 -->` (omit ids to disable all).
- Region: `<!-- kilint-disable VRB001 -->` ... `<!-- kilint-enable VRB001 -->`.
- In source files the same directives work behind any line-comment leader:
  `# kilint-disable-next-line WRD003`, `// kilint-disable-file`.
- Unknown rule ids in a directive are a warning on stderr, not a crash.

## Source files (source.py)

When the target is a code file, lint **only** comments and docstrings. Never lint code,
identifiers, or string literals other than docstrings.

- `.py` - use the stdlib `tokenize` module. Take `COMMENT` tokens and module/class/function
  docstrings (a `STRING` token that is the first statement of its block). Accurate, no regex.
- `.js .jsx .ts .tsx .go .rs .java .c .h .cpp .hpp .cs .swift .kt .scala` - a small
  state-machine scanner that tracks string/char/template literals and regex-ish contexts
  well enough to avoid false comments inside strings. `//` and `/* */`, plus `///` and `/** */`.
- `.sh .bash .zsh .py-adjacent .toml .yaml .yml` - `#` comments, respecting quotes.
- `.lua` - `--` and `--[[ ]]`.
- Unknown extension: refuse with a clear message unless `--as markdown|text|source` is given.

Comment prose gets the resolved profile but with two forced adjustments, because
comments are terse by nature:
- `SEN001` cap raised by config key `comment_sentence_bonus` (default +10 words).
- `STR001` off.
- A comment shorter than `comment_min_words` (default 6) is skipped entirely.

Rationale for the README: docstrings and public API comments benefit from the
discipline. A three-word `# why this is weird` note does not.

## CLI (cli.py)

```
kilint [PATHS...] [options]

  (no PATHS)              read stdin, lint as markdown
  --profile NAME          force a profile, ignoring path routing
  --config PATH
  --as {markdown,text,source,auto}   default auto (by extension)
  --select IDS            only these rules (comma-separated)
  --ignore IDS            drop these rules
  --explain ID            print the rule's rationale and exit
  --list-rules            print the registry and exit
  --format {table,json,github,summary}   default table
  --delta OLD NEW         score two files and report the change; ignores fail_over
  --baseline REF          compare each path against its content at a git ref
  --fail-over N           override the failure threshold
  --no-fail               always exit 0
  --quiet                 only the summary line
  --version
```

Exit codes: `0` clean or `--no-fail`; `1` at least one file over threshold; `2` usage
error, unreadable file, or bad config.

Directory arguments are walked, honouring path routing and skipping `off` files. Only
`.md`, `.markdown`, `.txt` and the known source extensions are collected.

## Output (report.py)

Table format, one block per file. Colour only when stdout is a TTY and `NO_COLOR` is
unset. No emoji anywhere. Example shape:

```
000-System/Scripts/kilint/README.md            flavored   score 1.18  (169 words, 2 violations)
  14:8   error  PUN002  em-dash: "cache — fluxcache"      -> split the sentence or use a comma
  22:1   warn   VRB001  passive voice: "is read by"       -> name the actor: "the parser reads"

2 files, 341 words, score 1.44/100w   threshold 1.5   PASS
```

`--format json` emits a stable schema: `{version, files: [{path, profile, words,
sentences, score, violations: [...], skipped}], summary: {...}}`.

`--format github` emits `::error file=...,line=...,col=...::MSG` annotation lines.

Delta output:

```
before  4.19/100w  (191 words, 8 violations)
after   1.18/100w  (169 words, 2 violations)
delta   -72%       6 violations removed, 0 added
        gone:  PUN002 x4, WRD003 x2, SEN001 x2
        new:   none
```

## Tests (pytest, target 80%+ coverage)

Write tests from this spec. Cover at minimum:

- **text.py**: fenced/inline code masking preserves offsets; frontmatter split; URL and
  link-target masking; abbreviation-safe sentence splitting; list items not counted as
  paragraph sentences; word counting.
- **rules.py**: one positive and one negative case per rule id. Negative cases must
  include the known false-positive traps: `is based on` (not passive), `ensure` inside
  a code span (not flagged), an em-dash inside a fenced block (not flagged), `unlocked`
  not matching `unlock`, a numbered list of 9 short steps not tripping `STR001`.
- **config.py**: discovery order, deep merge, `extends`, `extend_*` append semantics,
  last-match-wins path routing, unknown key rejection.
- **source.py**: Python docstring and comment extraction via `tokenize`; a `//` inside a
  JS string literal is not treated as a comment; short comments skipped.
- **cli.py**: exit codes 0/1/2; `--select`/`--ignore`; stdin; `--explain`; directory walk.
- **report.py**: json schema stability; github annotation format; no colour when piped.
- **delta**: gone/new classification is correct.

Add a regression fixture pair built from the real baseline-vs-STE README text quoted in
`reference/before-after-samples.md` (`fixtures/hero_baseline.md`, `fixtures/hero_ste.md`).
Assert the direction and rough magnitude only: the STE version must score materially
lower (at least 50% lower). Do not assert kilint reproduces the reference tool's exact
numbers - kilint has different rules and weights, so the numbers will differ by design.

## README.md for the package

Cover: what it is, the one-line install/alias, usage for each surface (PR body, docs,
error message, code comments), the config reference, the rule table, suppression, the
delta workflow, exit codes, and an honest limitations section that states plainly that
kilint checks form and cannot judge whether the text is true or useful. Credit the
ASD-STE100 spec (asd-ste100.org) and the episode kit in `reference/` as the source of the
idea and the experiment that motivated it.

## Hard constraints

- No emojis, in code, output, or docs.
- No em-dashes in any prose written for this project. Use a spaced hyphen or a new sentence.
- Do not copy code or regex bodies from `reference/ste-lint.py`.
- Never mutate the user's text. There is no `--fix`.
- Absolute paths in any shell examples that would run from a hook.
- Every module under 400 lines. Split if larger.
