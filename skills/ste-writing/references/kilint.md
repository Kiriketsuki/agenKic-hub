# Driving kilint from inside the skill

Resolve the executable before relying on it. Prefer an installed `kilint`, then the
public skills checkout shared by Claude Code, Codex, and OpenCode:

```bash
KILINT_BIN="$(command -v kilint 2>/dev/null || true)"
if [ -z "$KILINT_BIN" ]; then
  AGENKIC_SKILLS_ROOT="${AGENKIC_SKILLS_ROOT:-$HOME/.claude/skills/agenKic-hub}"
  KILINT_BIN="$AGENKIC_SKILLS_ROOT/kilint/bin/kilint"
fi
test -x "$KILINT_BIN"
```

If the executable is missing, see `../../kilint/SPEC.md` for the design. Fall back to
the Step 2 self-lint checklist in `SKILL.md` and say the automated score was not
available. Do not block the rewrite on it.

## Lint one file

```bash
python3 "$KILINT_BIN" --profile flavored /path/to/file.md
```

Omit `--profile` to let path routing in `kilint.toml` pick one automatically.

## Lint a diff (changed lines only)

kilint scores whole files, not diff hunks. To check only what changed, extract the new
content to a scratch file and lint that:

```bash
git -C /path/to/repo show HEAD:path/to/CHANGED.md > /tmp/scratch/changed.md
python3 "$KILINT_BIN" /tmp/scratch/changed.md
```

For a PR description itself, which is not a file in the repo, write it to a scratch
file first, then lint that file. See `pr-descriptions.md`.

## Score a delta (before vs after)

```bash
python3 "$KILINT_BIN" --delta /tmp/scratch/before.md /tmp/scratch/after.md
```

This is the primary workflow for this skill. Always score the delta, not only the
final text, so the report shows the rewrite actually helped.

## Pick a profile

| Profile | Use for | Max sentence words |
|---|---|---|
| `strict` | error messages, runbooks, procedures | 20 |
| `flavored` | PR descriptions, READMEs, docs (default) | 25 |
| `prose` | lecture notes, long-form writing with a voice | 35 |
| `off` | daily notes, personal logs -- skipped entirely | n/a |

```bash
python3 "$KILINT_BIN" --profile strict /path/to/error-messages.md
```

## Suppress a false positive inline

Next line only:

```
<!-- kilint-disable-next-line VRB001 -->
The retry queue is drained by a background worker on a fixed interval.
```

A region:

```
<!-- kilint-disable VRB001 -->
Several sentences that are correctly passive, describing a third-party API response.
<!-- kilint-enable VRB001 -->
```

Whole file: `<!-- kilint-disable-file -->` anywhere in the file, or a frontmatter
`kilint: off` block.

In source files, use the language's line-comment leader instead of an HTML comment, for
example `# kilint-disable-next-line WRD003` in Python or `// kilint-disable-file` in
TypeScript.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | clean, every file under its threshold, or `--no-fail` forced success |
| 1 | at least one file scored over its `fail_over` threshold |
| 2 | usage error, unreadable file, or bad config |

Check the exit code after linting, not only the printed score:

```bash
python3 "$KILINT_BIN" /path/to/file.md
echo "exit: $?"
```
