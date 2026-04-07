---
name: council-fix
description: >
  One-command alias for the full council-to-fix pipeline. Runs a supervised adversarial
  council with heartbeat monitoring, then auto-remediates findings via parallel fix agents
  in isolated worktrees. Just type /council-fix PR #123 or /council-fix [topic].
  Triggers: "council fix", "review and fix", "council-fix PR", "/council-fix".
---

## Context

This is a convenience alias that chains three skills with sensible defaults:

```
/council-fix PR #42
       |
       v
/adversarial-council --supervised --chain-fix --skeptic
       |
       v
/council-supervisor (heartbeat, stall recovery, council-result.json)
       |
       v
/parallel-fix --from-council .council/council-result.json
       |
       v
Winning fix applied, tests passing, done.
```

No flags to remember. Just `/council-fix` and a target.

By default, the full pipeline runs (council -> fix). To stop after the council and
hand the fix list off to another agent or system, use `--manifest-only`:

```
/council-fix PR #42 --manifest-only
```

This runs the supervised council, writes `council-result.json` AND a human/agent-readable
`fix-manifest.md`, then stops. No auto-fix. Hand the manifest to Codex, Cursor, Devin,
another Claude session, or any agent that can read markdown task lists.

## Triggers

- `/council-fix PR #123` or `/council-fix #123`
- `/council-fix [topic or motion text]`
- "council fix this PR"
- "review and fix PR 42"
- "council-fix the auth module"

## Workflow

### Step 1 -- Parse Target

Determine what to review:

**PR reference** (`PR #N`, `#N`, or a GitHub PR URL):
1. Fetch the PR diff: `gh pr diff N`
2. Fetch the PR description: `gh pr view N`
3. Construct the motion: "Merge PR #N: [PR title]"
4. Set `SCAN_TARGETS` from the changed files in the diff
5. Set `DIFF_CONTEXT` from the diff output

**Topic or motion text** (anything else):
1. Use the text as the motion directly
2. If ambiguous, ask one clarifying question

### Step 2 -- Invoke the Pipeline

Invoke `/adversarial-council` with these defaults:

```
--motion "[constructed motion]"
--supervised
--chain-fix
--skeptic              (recommended for code review -- more critics than advocates)
--n 2                  (2 advocates, 2 critics in skeptic mode)
--rounds 4
```

The `--supervised` flag triggers Step 0 in the council skill, which delegates to
`/council-supervisor`. The `--chain-fix` flag tells the supervisor to auto-invoke
`/parallel-fix` after the verdict.

All other council options can still be appended by the user:

```
/council-fix PR #42 --n 3 --rounds 5 --model opus
/council-fix PR #42 --manifest-only
```

If `--manifest-only` is set, do NOT pass `--chain-fix` to the council. Pass only
`--supervised`. After the council completes, proceed to Step 3 (manifest generation)
and stop.

### Step 2b -- Generate Fix Manifest (always)

After the council writes `council-result.json`, generate `.council/fix-manifest.md`:

```markdown
# Fix Manifest -- PR #[N]: [title]

Council verdict: [VERDICT] | [date] | [N] findings ([M] verified)

## Fixes Required

### 1. [finding description]
- **File**: `path/to/file.ext`
- **Line**: [N]
- **Type**: [bug/improvement/hardening/security]
- **Severity**: [critical/high/medium/low]
- **Verification**: [verified/unverified]
- **Fix**: [fix_description]
- **Citations**: `file:line`, `file:line`

### 2. [next finding...]
...

## Conditions
- [any merge conditions from the verdict]

## Test Command
[auto-detected test command, or "not detected -- specify manually"]

## Raw Data
council-result.json: .council/council-result.json
```

This manifest is designed to be copy-pastable into any agent's prompt. Each fix is
self-contained with file, line, description, and recommended action.

If `--manifest-only`: report the manifest path and stop. Do not invoke parallel-fix.
```
Council complete. Verdict: [VERDICT]. [N] findings.
Fix manifest: .council/fix-manifest.md
JSON data:    .council/council-result.json

Hand these to your preferred agent or fix tool.
```

### Step 3 -- Report

The pipeline reports its own progress at each stage. When complete, this skill
adds a final summary:

```
Council-Fix Complete: PR #42

Council:  CONDITIONAL (3 findings, 2 verified)
Fix:      2/3 findings remediated (minimal patch strategy)
          1 finding needs manual review [UNVERIFIED]
Tests:    All passing
Result:   .council/council-result.json

Next: review the diff, then push when ready.
```

## Presets

The user can also pass named presets instead of individual flags:

| Preset | Expands to | Use case |
|:---|:---|:---|
| `--thorough` | `--n 3 --rounds 5 --model opus` | High-stakes PRs, architectural changes |
| `--quick` | `--n 1 --rounds 2 --model sonnet` | Small PRs, obvious changes |
| `--manifest-only` | `--supervised` (no `--chain-fix`) | Stop after verdict, output fix list for external agents |
| (default) | `--n 2 --rounds 4 --skeptic --chain-fix` | Standard code review with auto-fix |

```
/council-fix PR #42 --thorough
/council-fix PR #42 --quick
/council-fix PR #42 --manifest-only    # review only, hand fixes to Codex/Cursor/etc
```

## Edge Cases

- **PR has no code changes** (docs-only): Skip parallel-fix, report council verdict only
- **PR is already merged**: Report "PR #N is already merged. Nothing to review."
- **No test framework detected**: Council runs normally but parallel-fix asks for test command
- **All findings are PHANTOM after verification**: Report "No actionable findings. PR looks good."
  and skip parallel-fix
