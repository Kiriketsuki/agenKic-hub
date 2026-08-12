---
name: context-resume
description: "Use when resuming work from a previous session handoff. Triggers: \"Resume from handoff\", \"Pick up where we left off\", \"Load the handoff\". Pass \"active\" to verify git state and read key files. Manually invoked."
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

## Harness Resolution

Resolve the active **agent harness**, not the model or provider. Pi using an OpenAI Codex model is still Pi.

Use the first matching row:

| Harness detection | Project directory | Global directory |
|---|---|---|
| `PI_CODING_AGENT=true` or `AI_AGENT=pi` | `{git-root}/.pi/handoffs/` | `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/handoffs/` |
| `AI_AGENT` starts with `codex` or `CODEX_THREAD_ID` is set | `{git-root}/.codex/handoffs/` | `${CODEX_HOME:-$HOME/.codex}/handoffs/` |
| `AI_AGENT` starts with `claude`, `CLAUDE_CODE_ENTRYPOINT` is set, or `CLAUDE_CONFIG_DIR` is set | `{git-root}/.claude/handoffs/` | `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/handoffs/` |
| No harness detected | `{git-root}/.agents/handoffs/` | `${AGENT_HOME:-$HOME/.agents}/handoffs/` |

Do not select a directory from the active model name or provider.

## Discovery Order

1. Check the resolved harness's project directory when inside a Git repository
2. Check the resolved harness's global directory
3. Compatibility fallback: check project then global handoff directories for `.agents`, `.pi`, `.codex`, and `.claude`, excluding locations already checked
4. If still nothing is found, inform the user — no handoff to resume

Native harness locations always win. Compatibility locations are read-only fallbacks for handoffs created before harness-aware storage.

Within the resolved directory, sort handoff files by name (lexicographic = chronological due to timestamp format). Exclude `progress.txt` and `overflow-*` files. Select the most recent unless a timestamp fragment is provided.

Fuzzy matching uses substring containment:
- Any fragment of the filename matches — timestamp (`14h30`), date (`2026-02-27`), or slug (`feature-x`)
- If multiple files match the fragment, select the most recent (lexicographically last filename)
- `/context-resume active` is special-cased: "active" is the mode flag, not a filename fragment

> **First Use**: The native harness handoff directory is created automatically by `context-handoff`. Until then, discovery proceeds through the global and compatibility locations above.

## Passive Mode (default)

No extra arguments, or only a timestamp argument.

1. Discover and read the handoff file
2. Present a structured briefing:
   - **Situation**: what was being built and why
   - **Current State**: branch, uncommitted files, test status
   - **Next Steps**: the concrete actions from the handoff
   - **Open Questions**: anything deferred or blocked
3. Ask whether the user wants to continue planning or start implementation. Use plan mode only when the active harness actually provides it.

Do not run any shell commands in passive mode.

## Active Mode (triggered by "active" argument)

Everything in passive mode, plus:

1. Run `git status` to compare actual uncommitted files vs handoff's documented state
2. Run `git log --oneline -5` to show recent commit context
3. Read each file listed in the handoff's **Key Files** section
4. Reconcile: note any drift between handoff state and current reality
   - Example: "Handoff documents 3 uncommitted files; git shows 5 — `config.py` and `utils.py` are new since handoff"
5. Present the reconciled picture and ask whether to continue planning or start implementation

## After Loading

After presenting the briefing, wait for the user to choose whether to:
- Continue planning (add steps or adjust the approach)
- Start implementation using the active harness's normal workflow

Do not assume Claude Code, a `superpowers:executing-plans` command, or a built-in plan mode exists.

## Quality Check on Load

After reading the handoff file, check for each required section by looking for its markdown header:
- `## Situation`
- `## Current State`
- `## Next Steps`

For each missing header, surface a warning before presenting the briefing:
> "This handoff is missing [Section Name]. The fresh context may need to ask clarifying questions before starting."

Do not refuse to load — present what exists and proceed.
