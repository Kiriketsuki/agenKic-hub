---
name: council-fix
description: "One-command alias for the full council review pipeline. Runs a supervised adversarial council, produces council-result.json and fix-manifest.md, then writes a prioritised plan file to ~/.claude/plans for the human to implement. Just type /council-fix PR #123 or /council-fix [topic]. Triggers: \"council fix\", \"review and fix\", \"council-fix PR\", \"/council-fix\"."
---

## Context

This is a convenience alias that chains the council with a plan-file handoff:

```
/council-fix PR #42
       |
       v
/adversarial-council --supervised --skeptic
       |
       v
/council-supervisor (heartbeat, stall recovery, council-result.json, fix-manifest.md)
       |
       v
Plan file written to ~/.claude/plans/council-fix-<slug>-<date>.md
       |
       v
Human clears context, opens plan, implements findings in priority order.
```

No auto-applying of code. The council identifies and verifies findings; you implement them.

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

**HARD REQUIREMENT**: Invoke the adversarial-council skill via the `Skill` tool — do NOT run the debate inline as text. The skill will call `TeamCreate` and spawn real agents. If you write ADVOCATE/CRITIC/ARBITER sections yourself without calling `Skill`, you are doing it wrong. Stop and invoke the skill.

Invoke `/adversarial-council` with these defaults:

```
--motion "[constructed motion]"
--supervised
--skeptic
--n 2
--rounds 4
```

All other council options can still be appended by the user:

```
/council-fix PR #42 --n 3 --rounds 5 --model opus
/council-fix PR #42 --quick
```

### Step 3 -- Generate Plan File

After the council writes `council-result.json` and `fix-manifest.md`, generate a plan file at:

```
~/.claude/plans/council-fix-<motion-slug>-<YYYY-MM-DD>.md
```

The slug is derived from the motion text (lowercase, spaces to hyphens, truncated at 40 chars) — the same slug `council-supervisor` already computes internally.

Plan file content:

```markdown
# Plan: Address Council Findings — <motion>

## Context
Council verdict: <VERDICT> on <date>. <N> findings (<M> verified, <K> unverified, <P> phantom).
Motion: <motion text>
Source: .council/council-result.json

## Findings to Address

### Blockers (must fix before merge)
<findings with severity: critical/high AND verification: verified>
- [ ] **<description>** — `file:line`
  - Type: <type> | Severity: <severity>
  - Fix: <fix_description>
  - Citations: <cites>

### Non-blockers (address when possible)
<findings with severity: medium/low, OR verification: unverified>
- [ ] **<description>** — `file:line`
  - Type: <type> | Severity: <severity>
  - Fix: <fix_description>
  - Citations: <cites>

### Unverified / Phantom (investigate manually)
<findings with verification: phantom>
- [ ] **<description>** — flagged as phantom by verifier
  - Cite: <cites>
  - Action: read source to confirm finding is real before fixing

## Implementation Notes
- Conditions from verdict: <conditions, or "none">
- Suggested order: blockers first, then non-blockers, phantom investigation last
- Each fix should be its own commit (conventional commits format)
- Run tests after each change: <auto-detected test command, or "not detected — specify manually">

## Raw Data
- Council result: .council/council-result.json
- Fix manifest:   .council/fix-manifest.md
```

If there are no verified/unverified findings (all phantom), the Blockers and Non-blockers sections are omitted and a note is added: "No actionable findings. All findings were marked phantom after source verification."

### Step 4 -- Report

```
Council-Fix Complete: <target>

Council:  <VERDICT> (<N> findings: <M> verified, <K> unverified, <P> phantom)
Plan:     ~/.claude/plans/council-fix-<slug>-<date>.md
Raw:      .council/council-result.json

Next steps:
  1. /clear
  2. Open the plan file
  3. Implement findings in priority order (blockers first)
```

## Presets

| Preset | Expands to | Use case |
|:---|:---|:---|
| `--thorough` | `--n 3 --rounds 5 --model opus` | High-stakes PRs, architectural changes |
| `--quick` | `--n 1 --rounds 2 --model sonnet` | Small PRs, obvious changes |
| (default) | `--n 2 --rounds 4 --skeptic` | Standard review → plan handoff |

```
/council-fix PR #42 --thorough
/council-fix PR #42 --quick
```

## Edge Cases

- **PR has no code changes** (docs-only): Council runs normally, plan file still generated, but "No code changes to fix" note added to Implementation Notes.
- **PR is already merged**: Report "PR #N is already merged. Nothing to review." Stop.
- **No test framework detected**: Note "not detected — specify manually" in the plan's test command field.
- **All findings are phantom after verification**: Report "No actionable findings. PR looks good." Plan file is still written with a phantom-only section so the user has the record.
