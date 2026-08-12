---
name: kilint
user-invocable: true
argument-hint: "[path] [--profile strict|flavored|prose]"
description: >
  Lint prose for AI-slop patterns without rewriting it. Checks sentence length,
  passive voice, filler, marketing adjectives, punctuation, terminology, and
  structure in Markdown, text, code comments, and docstrings. Triggers: "kilint
  this", "lint this writing", "check this prose", "score this writing", "find AI
  slop", "/kilint". Use ste-writing when the user also wants a rewrite.
---

# kilint

Use kilint to measure the form of prose. It never edits text and cannot judge whether
the text is true, complete, or useful.

## Resolve the executable

Prefer an installed `kilint`, then the public skills checkout shared by Claude Code,
Codex, and OpenCode:

```bash
KILINT_BIN="$(command -v kilint 2>/dev/null || true)"
if [ -z "$KILINT_BIN" ]; then
  AGENKIC_SKILLS_ROOT="${AGENKIC_SKILLS_ROOT:-$HOME/.claude/skills/agenKic-hub}"
  KILINT_BIN="$AGENKIC_SKILLS_ROOT/kilint/bin/kilint"
fi
test -x "$KILINT_BIN"
```

If the executable is unavailable, report that clearly. Do not invent a score.

## Pick a profile

| Profile | Use for |
|---|---|
| `strict` | Error messages, runbooks, procedures, migration instructions |
| `flavored` | PR descriptions, READMEs, docs, release notes |
| `prose` | Essays, lecture notes, and long-form writing that keeps a voice |
| `off` | Skip the file entirely |

Omit `--profile` when project path routing should choose the profile.

## Run the lint

One file:

```bash
python3 "$KILINT_BIN" --profile flavored /path/to/file.md
```

Changed content against a Git baseline:

```bash
python3 "$KILINT_BIN" --baseline HEAD /path/to/file.md
```

Before and after:

```bash
python3 "$KILINT_BIN" --delta /tmp/before.md /tmp/after.md
```

For pasted prose, write it to a scratch file or pass it on stdin. Do not add the
scratch file to the user's repository.

## Report

Report the profile, score, violation count, and the rule IDs that matter most. Explain
that lower scores are cleaner. Preserve kilint's exit meaning:

- `0`: clean, report-only delta, or `--no-fail`
- `1`: score exceeded the selected threshold
- `2`: usage, config, or file error

Do not rewrite the text unless the user asks. If they want a rewrite, use
`ste-writing`, then run `kilint --delta` to show the change.
