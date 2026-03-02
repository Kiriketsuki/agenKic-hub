---
name: context-handoff
description: Use when the user asks to prepare a handoff, switch context, create a plan for session continuity, or when context is getting long. Manually invoked.
---

# Context Handoff

Write plans that orient a fresh context to continue work. The plan file IS the handoff document.

## When to Use

The user asks to:
- "Prepare a handoff"
- "Write a plan so a fresh context can pick this up"
- "Context is getting long, let's hand off"
- "Drop into plan mode for continuity"

## Core Principle

**Compound, don't compact.** Automatic summarization loses nuance, decisions, and rationale. A handoff explicitly extracts what matters and writes it to a file that a fresh session reads at startup.

A good handoff orients a *fresh reader* who has never seen this conversation. Provide pointers to files (not summaries of file contents) and preserve decisions with their reasoning.

## Primary Mechanism: Plan Mode

Enter plan mode and write the plan file. The plan file is the handoff document. A fresh session loads this plan and has everything needed to continue.

For complex situations where the plan file isn't large enough, write overflow to `{handoffs-dir}/overflow-{slug}.md` and reference it from the plan. This is the exception, not the norm.

## File Location

Write the handoff file to the first location that resolves:

1. `{git-root}/.claude/handoffs/YYYY-MM-DD-HHhMM-{slug}.md`
2. `~/.claude/handoffs/YYYY-MM-DD-HHhMM-{slug}.md` (global fallback, no git repo)

**Slug**: short kebab-case label derived from current task (e.g., `feature-152-db-consolidation`, `fix-auth-timeout`).
**Timestamp format**: `2026-02-27-14h30` — lexicographic sort equals chronological sort.

Create the directory if it does not exist.

Append a brief entry to `progress.txt` in the same directory after writing the plan file.

## Plan Structure for Handoff

```
# [Descriptive Title of Current Work]

## Situation
What is being built/fixed/refactored and why. One paragraph max.
Reference the project, branch, and relevant task IDs.

## Current State
- Branch: `feature/xyz`
- Uncommitted changes: [list modified files, or "none"]
- Tests: [passing / failing because X / not yet run]
- What works: [concrete list]
- What's incomplete: [concrete list]

Document git state as it is. Handoffs often happen mid-work,
not at clean milestones.

## Key Files
Files the next session should read to orient itself:
- `path/to/file.py` — [why, 5 words max]
- `path/to/other.py` — [why]

3-8 files. Pointers, not summaries.

## Decisions Made
Choices a fresh context would otherwise re-litigate:
- Chose X over Y because [reason]
- Rejected Z approach because [reason]
- User preference: [specific preference expressed]

## Failed Approaches
What was tried and didn't work:
- Tried X: failed because [specific reason]
- Tried Y: [error message or outcome]

Prevents the next session from exploring dead ends.

## Active Constraints
Things not obvious from the code:
- "Tests take 3+ minutes, run targeted tests first"
- "User wants X pattern, not Y"
- "Don't modify module Z, refactored separately"

## Next Steps
Specific enough that a fresh context starts without clarifying questions.

1. [First concrete action with file path if relevant]
2. [Second concrete action]
3. [Third concrete action]

## Open Questions
Unresolved issues needing user input or investigation:
- [Question that blocked progress]
- [Decision deferred to next session]
```

## Safety Backup: progress.txt

After writing the plan, append a brief entry to `progress.txt` in the same handoffs directory.

```
## YYYY-MM-DD Handoff

### Decisions
- [Decision and rationale, one line each]

### Failed Approaches
- [What was tried and why it didn't work, one line each]

### Handoff Target
- Plan file: [plan filename or path]
- Branch: [branch name]

---
```

Keep this short. Its purpose is preventing drift on settled questions, not recapping the session.

## What Makes a Good Handoff

**Include:**
- File paths the next session should read
- Branch name and git state (committed, uncommitted, test status)
- Decisions with rationale
- Failed approaches with reasons
- Specific next actions
- User preferences expressed during the session

**Exclude:**
- Summaries of file contents (point to files, let the next session read them)
- Implementation details that exist in code
- Conversation history
- Completed work that doesn't affect next steps

## Size Guidance

Most handoffs fit in the plan file. Under 200 lines. Dense, not padded.

If the situation requires more (large refactor, many interrelated decisions), write overflow to `{handoffs-dir}/overflow-{slug}.md` and reference from the plan:

```
## Extended Context
See `.claude/handoffs/overflow-{slug}.md` for detailed architectural notes that
exceed what fits here.
```

## Quality Checklist

Before exiting plan mode, verify:

- [ ] A fresh context can start working without asking what to do
- [ ] Settled decisions documented with reasoning
- [ ] Failed approaches listed so they aren't re-explored
- [ ] Key files listed as paths, not described in prose
- [ ] Git state documented (branch, uncommitted changes, test status)
- [ ] User preferences from this session captured
- [ ] Open questions flagged
- [ ] Brief entry appended to progress.txt
- [ ] Handoff file written to correct location

## Anti-Patterns

### Narrative recap
Bad: "In this session we started by exploring the codebase, then we found..."
Good: [List decisions, state, and next steps directly]

### Summarizing file contents
Bad: "The presenter.py file contains a PresenterClass with methods for..."
Good: "Read `src/presenter.py` — calibration workflow state machine"

### Vague next steps
Bad: "Continue working on the feature"
Good: "Implement `_handle_frame_drop()` in `src/sync.py:142` — see decision about mutex vs debounce above"

### Over-documenting completed work
Bad: [Three paragraphs about what was finished]
Good: "Completed: intrinsic calibration presenter, tests passing on `feature/intrinsic`"

### Prescribing git cleanup
Bad: "Commit all changes and push before continuing"
Good: "3 files uncommitted (`presenter.py`, `view.py`, `test_presenter.py`), tests failing on incomplete `_validate()` method"
