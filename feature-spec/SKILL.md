---
name: feature-spec
description: Use when the user wants to create a new feature specification, start speccing a feature, or fill out a feature spec sheet. Triggers: "Spec a feature", "New feature spec", "Create spec", "/spec", "Start feature spec", "spec this out". Always invoke this skill when the user wants to define what a feature should do before building it — even casual phrasings like "let's spec this out", "write up the spec", "plan this feature", "define the feature", or just "spec it" should trigger this. The skill enters plan mode immediately, interviews the user conversationally section by section, and produces a filled feature_spec.md in the current working directory.
---

## Purpose

Produce a filled `[feature-name]-spec.md` in the current working directory by interviewing the user section-by-section. Enter plan mode at the start and stay there — this is a planning exercise from first question to final file.

**Hard boundary**: this skill ends when the spec file is written and any downstream updates (daily note, PR) are fired. Do not begin implementation, do not suggest code changes, do not offer to "start on T1". The spec is the deliverable.

## Template

Bundled at `assets/template.md` (relative to this skill's directory).

---

## Workflow

### Step 1: Enter Plan Mode + Read Context

- Call `EnterPlanMode` immediately — before saying anything else to the user.
- Scan the CWD for context: README, package.json, pyproject.toml, go.mod, existing specs, migration files, API route files — anything that reveals the stack, architecture, and domain vocabulary.
- Run `git branch --show-current` and `gh pr view --json number,title,body 2>/dev/null` to detect if the user is on a non-default branch with an open PR. Store branch name and PR number/body if found — you'll need them in Step 5.
- Copy the bundled template (`assets/template.md` relative to this skill's directory) verbatim to `./feature_spec.md` in CWD. This is the working draft you'll progressively fill in.
- Keep a mental working state of what's been confirmed so you don't re-ask.

### Step 2: Interview — Section by Section

Work through each section in order. The golden rule: **read first, ask second**. If the repo context answers the question, fill it in and show the user what you wrote ("I've assumed X — correct?"). Only ask outright when you genuinely don't know.

Keep questions focused — one topic per turn. No form dumps.

---

#### 2.1 Overview

Gather: feature name, user story (role / capability / business outcome), problem statement, explicit out-of-scope exclusions.

- Infer the domain and likely roles from the codebase (e.g., if it's a SaaS app with user tables, the role is probably "user" or "admin").
- Ask for the feature name first — every subsequent question can be framed around it.
- The problem statement should be 1–2 sentences: what breaks or is missing without this feature? Often the user's original request already contains this — extract it rather than asking.
- Out-of-scope: prompt with "anything explicitly not included in this?" — if the user draws a blank, suggest 1–2 reasonable exclusions based on what you know and ask them to confirm.

Once confirmed, derive the kebab-case output filename: `[feature-name]-spec.md`.

---

#### 2.2 Open Questions

Ask once: "Any known unknowns or blockers before we plan?" If the user has none, leave the table's placeholder row and move on. Don't labour this section.

---

#### 2.3 Scope (MoSCoW)

Ask for must-haves first. Each must-have needs a brief acceptance condition (what does "done" look like for that behaviour?).

Then ask together: "Anything lower priority — nice to have but not blocking launch?"

---

#### 2.4 Technical Plan

This is where CWD context pays off. Before asking anything:

- Identify affected files/modules from the repo structure and map them to "Affected Components".
- If there are database migration files or schema files, infer likely data model changes.
- If there are route or controller files, propose API contracts.
- Note any obvious external dependencies (auth providers, queues, third-party SDKs).

Present your inferences as a draft block and ask the user to confirm or correct. Then ask: "Any risks or unknowns on the technical side?" and populate the risks table together.

---

#### 2.5 Acceptance Scenarios

Propose Gherkin scenarios that map directly to the must-have scope items. Structure:

- One happy-path scenario per must-have behaviour.
- One failure/edge case scenario per must-have (ask the user what the expected failure behaviour is).
- Offer to add scenario outlines for parameterised cases if there are data-driven paths.

Show the draft scenarios, ask for corrections or additions.

---

#### 2.6 Task Breakdown

Derive implementation tasks from the acceptance scenarios and technical plan. Show a proposed table (T1, T1.1, T2 …) with priority and dependencies. Ask:

- "Does this ordering look right?"
- "Anything missing, or anything here that's actually out of scope?"

---

#### 2.7 Exit Criteria

Pre-fill the standard items:

- All Must-Have scenarios pass in CI
- No regressions on related features
- API contracts match implementation

Ask: "Any domain-specific exit gates?" (e.g., performance benchmark, compliance sign-off, design review).

---

#### 2.8 References

Ask: "Any related specs, tickets, or docs I should link?" If none, omit the placeholder rows entirely.

---

### Step 3: Finalise the Spec

- Write the complete, filled spec to `./feature_spec.md`.
- Rename it to `./[kebab-case-feature-name]-spec.md`.
- Sign the bottom (above any existing `---`):
  ```
  ---
  *Authored by: Clault KiperS 4.6*
  ```
- Tell the user the final filename and path.

---

### Step 4: PR Description Update (if on a branch with an open PR)

If Step 1 found an open PR, spawn a **background** subagent for this — do not await it:

```
Update the GitHub PR description for PR #[number] in the current repo.

Replace the existing body with the following content (derived from the completed spec):

## Summary
[3–5 bullet points drawn from Must-Have scope items — what this PR will deliver]

## Spec
See `[feature-name]-spec.md` in the branch root for full acceptance criteria, technical plan, and task breakdown.

## Test plan
[Bulleted checklist drawn from the Acceptance Scenarios — one item per happy-path scenario, plus any edge cases]

Run: gh pr edit [number] --body "..."

Rules:
- Preserve any existing CI/automation badges or footers already in the PR body if present.
- No emojis.
```

### Step 5: Daily Note Update (Background Subagent)

Spawn a **background** subagent — fire and forget, do not await it. Pass it this exact task (substitute real values):

```
Today's date: [YYYY-MM-DD]
Daily note path: /home/kiriketsuki/dev/obKidian/500-Chronological-Logs/510-Personal/[YYYY]/[MMM]-[DD].md

Append the following line under the `## Daily Focus` section (create the section if missing, place it before `## End of Day` if that section exists, otherwise append at end of file):
  - [ ] Specced feature: [[[kebab-case-feature-name]-spec]] — [one-sentence description of what the feature does]

Rules:
- No emojis.
- Do not modify any other content in the file.
- If the file does not exist, do nothing.
- Append `*Authored by: Clault KiperS 4.6*` at the very end of the file only if it is not already there.
```

---

## Guidelines

- **Stay in plan mode throughout.** You entered it in Step 1 — don't exit until the skill is fully complete.
- **Do not begin implementation.** The skill ends when the spec is written and downstream updates are fired. Do not suggest starting on tasks, writing code, or making any implementation changes.
- **No emojis** anywhere: questions, file content, log entries.
- **Don't ask what you can read.** Repo context is free — spend it.
- **One topic per turn.** Long lists of questions kill momentum.
- **The spec stays in CWD only.** It is not saved back to the vault.
- **Infer, show, confirm** — faster than blank-slate questions every time.
