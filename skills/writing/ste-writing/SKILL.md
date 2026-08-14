---
name: ste-writing
description: "Rewrite prose that reads like AI output into a controlled house style, then score it with kilint to prove the delta improved. Covers PR descriptions, READMEs and docs, error messages, and code comments/docstrings -- never code, identifiers, or command syntax. Triggers: \"make this not sound like AI\", \"rewrite this clearly\", \"de-slop this\", \"clean up this PR description\", \"STE this\", \"/ste-writing\", \"make the docs plain\", \"lint my writing\", \"check this for slop\"."
---

# ste-writing

Rewrites prose into ASD-STE100-flavored Simplified Technical English to remove AI slop:
stacked parentheticals, marketing adjectives, passive voice, filler, and em dashes. This
fixes the FORM of the text only. It cannot make a false or hollow paragraph true -- say so
if the input has that problem instead of polishing it away.

Applies to: PR descriptions, READMEs and docs, error messages, docstrings, and public API
comments. Does not apply to: code, identifiers, command syntax, marketing copy, or
anything that needs a voice. Lecture notes, essays, journals, and personal reflections
need a voice. Do not rewrite those surfaces unless the user explicitly asks for
controlled technical prose. See `references/kilint.md`.

## Step 1 -- pick the surface and its profile

| Surface | Reference | Profile | Sentence cap |
|---|---|---|---|
| PR description | `references/pr-descriptions.md` | flavored | 25 words |
| README / docs | `references/documentation.md` | flavored | 25 words |
| Error message | `references/error-messages.md` | strict | 20 words |
| Docstring / public API comment | `references/code-comments.md` | flavored, relaxed cap | +10 words |
| Inline "why this is weird" comment | `references/code-comments.md` | exempt | needs voice |

## Step 2 -- apply the rules

WORDS -- one name for one thing. Prefer the short common word:

| Write this | Not this |
|---|---|
| `use` | `utilize`, `leverage` |
| `help` | `facilitate` |
| `make sure` | `ensure` |
| `before`, `after` | `prior to`, `subsequent to` |
| `also` | `additionally`, `furthermore`, `moreover` |

Delete marketing adjectives: `seamless`, `robust`, `powerful`, `cutting-edge`,
`effortless`, `world-class`, `next-generation`, `revolutionary`.

VERBS -- active voice. Write `the parser reads the file`, not
`the file is read by the parser`. Use a verb for an action. Write `analyze the log`,
not `perform an analysis of the log`. No stacked auxiliaries, and no `-ing` main verb
where a simple tense works.

SENTENCES -- one instruction per sentence. No contractions. No semicolons. Write two
sentences instead. No em dashes or en dashes anywhere. Use a spaced hyphen, or split
the sentence.

STRUCTURE -- one topic per paragraph. For steps, a numbered list, one action per item,
condition before command.

Full rule rationale and per-severity defaults live in the kilint rule table:
`../kilint/SPEC.md` in the public skills repository. This skill applies the same house
style that kilint scores.

## Step 3 -- run kilint and report the delta

Resolve the executable first. Prefer an installed `kilint`, then the public skills
checkout used by Claude Code, Codex, and OpenCode:

```bash
KILINT_BIN="$(command -v kilint 2>/dev/null || true)"
if [ -z "$KILINT_BIN" ]; then
  AGENKIC_SKILLS_ROOT="${AGENKIC_SKILLS_ROOT:-$HOME/.claude/skills/agenKic-hub}"
  KILINT_BIN="$AGENKIC_SKILLS_ROOT/kilint/bin/kilint"
fi
test -x "$KILINT_BIN"
```

Save the original text and the rewrite to two scratch files, then score both:

```bash
python3 "$KILINT_BIN" --delta /tmp/scratch/before.md /tmp/scratch/after.md
```

Use `--profile strict` for error messages. Use `--profile flavored` for everything
else. It is the default. For a single file:

```bash
python3 "$KILINT_BIN" --profile flavored /path/to/file.md
```

If the executable is missing, do not block the rewrite. Run the Step 2 rules by hand
as a self-lint checklist, and say that the automated score was not available. The full
command reference for diffs, suppression, and exit codes lives in
`references/kilint.md`.

## Step 4 -- report

Deliver the rewrite as the requested text, with no preamble folded into it. Then report
the score on its own line, in this shape:

```
before  X.XX/100w  (N words, V violations)
after   Y.YY/100w  (M words, W violations)
delta   -Z%         V-W violations removed
```

If kilint was unavailable, report which Step 2 rules the rewrite fixed instead of a
score.
