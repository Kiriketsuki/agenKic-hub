---
name: context-resume
description: Use when resuming work from a previous session handoff. Triggers: "Resume from handoff", "Pick up where we left off", "Load the handoff". Pass "active" to verify git state and read key files. Manually invoked.
---

# Context Resume

Load a handoff document and orient a fresh session to continue work.

## When to Use

The user asks to:
- "Resume from handoff"
- "Pick up where we left off"
- "Load the handoff"
- "context-resume [optional: timestamp] [optional: active]"

## Invocation Patterns

| Invocation | Behavior |
|---|---|
| `/context-resume` | Most recent handoff, passive mode |
| `/context-resume 2026-02-27` | Match by date fragment, passive |
| `/context-resume 14h30` | Match by time fragment, passive |
| `/context-resume active` | Most recent handoff, active mode |
| `/context-resume 2026-02-27 active` | Specific handoff + active mode |

Timestamp matching is fuzzy — any fragment of the filename timestamp works.

## Discovery Order

1. Walk up from `{cwd}` to git root, check `{git-root}/.claude/handoffs/`
2. If no repo or no handoffs found there, check `~/.claude/handoffs/`
3. If still nothing found, inform the user — no handoff to resume

Within the resolved directory, sort files by name (lexicographic = chronological due to timestamp format). Select the most recent unless a timestamp fragment is provided.

Fuzzy matching uses substring containment:
- Any fragment of the filename matches — timestamp (`14h30`), date (`2026-02-27`), or slug (`feature-x`)
- If multiple files match the fragment, select the most recent (lexicographically last filename)
- `/context-resume active` is special-cased: "active" is the mode flag, not a filename fragment

> **First Use**: The `.claude/handoffs/` directory is created automatically by the `context-handoff` skill when writing the first handoff. Until then, discovery falls through to `~/.claude/handoffs/`.

## Passive Mode (default)

No extra arguments, or only a timestamp argument.

1. Discover and read the handoff file
2. Present a structured briefing:
   - **Situation**: what was being built and why
   - **Current State**: branch, uncommitted files, test status
   - **Next Steps**: the concrete actions from the handoff
   - **Open Questions**: anything deferred or blocked
3. Enter plan mode — user decides whether to continue planning or move to implementation

Do not run any shell commands in passive mode.

## Active Mode (triggered by "active" argument)

Everything in passive mode, plus:

1. Run `git status` to compare actual uncommitted files vs handoff's documented state
2. Run `git log --oneline -5` to show recent commit context
3. Read each file listed in the handoff's **Key Files** section
4. Reconcile: note any drift between handoff state and current reality
   - Example: "Handoff documents 3 uncommitted files; git shows 5 — `config.py` and `utils.py` are new since handoff"
5. Enter plan mode with the reconciled picture

## After Loading

Always enter plan mode after presenting the briefing. The user will either:
- Continue planning (add steps, adjust approach)
- Approve the plan as-is and move to implementation via superpowers:executing-plans

## Quality Check on Load

After reading the handoff file, check for each required section by looking for its markdown header:
- `## Situation`
- `## Current State`
- `## Next Steps`

For each missing header, surface a warning before presenting the briefing:
> "This handoff is missing [Section Name]. The fresh context may need to ask clarifying questions before starting."

Do not refuse to load — present what exists and proceed.
