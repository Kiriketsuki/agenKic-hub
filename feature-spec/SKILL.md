---
name: feature-spec
description: Use when the user wants to create a new feature specification, start speccing a feature, or fill out a feature spec sheet. Triggers: "Spec a feature", "New feature spec", "Create spec", "/spec", "Start feature spec", "spec this out". Always invoke this skill when the user wants to define what a feature should do before building it — even casual phrasings like "let's spec this out", "write up the spec", "plan this feature", "define the feature", or just "spec it" should trigger this. The skill enters plan mode immediately, interviews the user conversationally section by section, and produces a filled feature_spec.md in the target repo's docs/specs/todo/ directory.
---

## Purpose

Produce a filled `[feature-name]-spec.md` in the target repo's `docs/specs/todo/` directory — the repo is the current working directory by default, or a path the caller/handoff specifies (e.g. a brand-new repo created for the feature); create `docs/specs/todo/` if missing — by interviewing the user section-by-section. Enter plan mode at the start and stay there — this is a planning exercise from first question to final file.

**Hard boundary**: this skill ends when the spec file is written and any downstream updates (daily note, PR) are fired. Do not begin implementation, do not suggest code changes, do not offer to "start on T1". The spec is the deliverable.

## Template

Bundled at `assets/template.md` (relative to this skill's directory).

---

## Handoff from Brainstorming

When invoked after the brainstorming skill, the conversation already contains a user-approved design with decisions about architecture, approach, scope, and trade-offs. **Do not re-interview what was already decided.** Instead:

1. Review the brainstorming conversation for confirmed decisions (feature name, user story, scope, architecture, components, data flow, error handling).
2. Pre-fill every template section you can from those decisions.
3. Only ask the user about sections that brainstorming did not cover (typically: acceptance scenarios, task breakdown, exit criteria, references).
4. Show the pre-filled sections for confirmation: "I've carried over X, Y, Z from our brainstorming -- does this look right?"

This avoids the frustrating pattern of re-asking questions the user already answered.

---

## Workflow

### Step 1: Enter Plan Mode + Read Context

- Call `EnterPlanMode` immediately — before saying anything else to the user.
- Scan the CWD for context: README, package.json, pyproject.toml, go.mod, existing specs, migration files, API route files — anything that reveals the stack, architecture, and domain vocabulary.
- Run `git branch --show-current` and `gh pr view --json number,title,body 2>/dev/null` to detect if the user is on a non-default branch with an open PR. Store branch name and PR number/body if found — you'll need them in Step 4. (Skip quietly if the target repo is not a git repo, e.g. a brand-new repo that has not been `git init`-ed.)
- Copy the bundled template (`assets/template.md` relative to this skill's directory) verbatim to `./docs/specs/todo/feature_spec.md` (create the directory if missing). This is the working draft you'll progressively fill in.
- **If following a brainstorming handoff**: immediately pre-fill sections from the approved design before starting the interview. Only interview for gaps.
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

#### 2.2 Success Condition

Ask: "In one sentence — when is this feature done? What's the verifiable state that means it shipped?"

This should be a completion-state sentence: "This feature is complete when [X]." It anchors every later decision — scope disputes, task prioritisation, exit criteria all refer back to this sentence. If the user's answer is vague ("when it works"), push for something testable ("when a user can do X and Y is true in the system").

If the user already stated something concrete in the overview, propose it and confirm rather than re-asking.

---

#### 2.3 Open Questions

Ask once: "Any known unknowns or blockers before we plan?" If the user has none, leave the table's placeholder row and move on. Don't labour this section.

---

#### 2.4 Scope (MoSCoW)

Ask for must-haves first. Each must-have needs a brief acceptance condition (what does "done" look like for that behaviour?).

Then ask together: "Anything lower priority — nice to have but not blocking launch?"

---

#### 2.5 Technical Plan

This is where CWD context pays off. Before asking anything:

- Identify affected files/modules from the repo structure and map them to "Affected Components".
- If there are database migration files or schema files, infer likely data model changes.
- If there are route or controller files, propose API contracts.
- Note any obvious external dependencies (auth providers, queues, third-party SDKs).

Present your inferences as a draft block and ask the user to confirm or correct. Then ask: "Any risks or unknowns on the technical side?" and populate the risks table together.

---

#### 2.6 Acceptance Scenarios

Propose Gherkin scenarios that map directly to the must-have scope items. Structure:

- One happy-path scenario per must-have behaviour.
- One failure/edge case scenario per must-have (ask the user what the expected failure behaviour is).
- Offer to add scenario outlines for parameterised cases if there are data-driven paths.

Show the draft scenarios, ask for corrections or additions.

---

#### 2.7 Task Breakdown

Derive implementation tasks from the acceptance scenarios and technical plan. Show a proposed table (T1, T1.1, T2 ...) with priority and dependencies. Ask:

- "Does this ordering look right?"
- "Anything missing, or anything here that's actually out of scope?"

---

#### 2.8 Exit Criteria

Pre-fill the standard items:

- All Must-Have scenarios pass in CI
- No regressions on related features
- API contracts match implementation

Ask: "Any domain-specific exit gates?" (e.g., performance benchmark, compliance sign-off, design review).

---

#### 2.9 References

Ask: "Any related specs, tickets, or docs I should link?" If none, omit the placeholder rows entirely.

---

### Step 3: Finalise the Spec

- Write the complete, filled spec to `./docs/specs/todo/feature_spec.md`.
- Rename it to `./docs/specs/todo/[kebab-case-feature-name]-spec.md`.
- Sign the bottom (above any existing `---`) with **your Clault Kiper signature for the model you are currently running as** — derive it, do NOT hardcode:
  ```
  ---
  *Authored by: Clault Kiper{S|O|H} {major.minor}*
  ```
  Suffix + version per `000-System/Agents/AGENTS.md`: Sonnet → `Clault KiperS 4.6`, Opus → `Clault KiperO 4.8`, Haiku → `Clault KiperH 4.5`. Use your own current model identity (e.g. running as Opus 4.8 → `Clault KiperO 4.8`). The spec file gets this signature; the Step 5 daily note does not (it is a shared, auto-generated note).
- Tell the user the final filename and path.

---

### Step 4: PR Description Update (if on a branch with an open PR)

If Step 1 found an open PR, spawn a **background** subagent for this — do not await it:

```
Update the GitHub PR description for PR #[number] in the current repo.

Replace the existing body with the following content (derived from the completed spec):

## Summary
[3-5 bullet points drawn from Must-Have scope items — what this PR will deliver]

## Spec
See `docs/specs/todo/[feature-name]-spec.md` for full acceptance criteria, technical plan, and task breakdown.

## Test plan
[Bulleted checklist drawn from the Acceptance Scenarios — one item per happy-path scenario, plus any edge cases]

Run: gh pr edit [number] --body "..."

Rules:
- Preserve any existing CI/automation badges or footers already in the PR body if present.
- No emojis.
```

### Step 5: Daily Note Update (Background Subagent)

Spawn a **background** subagent — fire and forget, do not await it. **Resolve two things yourself first** and substitute them as literals (do not make the subagent guess):

- **Link form** — check whether the spec file lives inside the vault (`/home/kiriketsuki/dev/obKidian/...`):
  - Inside the vault → use an Obsidian wikilink: `[[<feature-name>-spec]]`.
  - Outside the vault (e.g. a separate code repo) → a wikilink would dangle, so reference the spec by absolute path in backticks, and link a related in-vault note if one exists (e.g. `` `~/dev/Personal/foo/foo-spec.md` · see [[Some Related Note]] ``).
- **Today's daily note path**: `/home/kiriketsuki/dev/obKidian/500-Chronological-Logs/510-Personal/[YYYY]/[MMM]-[DD].md`.

Pass the subagent this task (substitute real values):

```
Today's date: [YYYY-MM-DD]
Daily note path: <resolved path above>

Goal: add ONE checkbox line recording that a feature was specced today — WITHOUT assuming any specific section exists (daily-note templates vary and change over time).

Line to add (already resolved by the caller — use verbatim):
  - [ ] Specced feature: <LINK> — [one-sentence description of what the feature does]

Placement (adaptive — never hardcode a single section name):
1. Read the note. Insert the line under the FIRST of these sections that exists, after any bullets already in it:
   "## Daily Focus" -> "## Key Objectives (Major Projects)" -> "## Key Objectives" -> "## Today's Plan" -> "## Log".
2. If none of those exist, create a "## Daily Focus" section placed immediately after the frontmatter / "## Summary" block and before the next "## " heading.
3. Never insert inside a fenced code block (e.g. a ```dataviewjs``` block).

Rules:
- No emojis.
- Do not modify any other content in the file.
- Do NOT add an author signature — the daily note is a shared, auto-generated note (morning-planner / the user / other skills all edit it), not an agent-authored note.
- If the daily note does not exist, do nothing and report that — it may not have been created yet (weekends, or before the morning-planner / /daily run); the main session can add the line later.
```

---

## Guidelines

- **Stay in plan mode throughout.** You entered it in Step 1 — don't exit until the skill is fully complete.
- **Do not begin implementation.** The skill ends when the spec is written and downstream updates are fired. Do not suggest starting on tasks, writing code, or making any implementation changes.
- **No emojis** anywhere: questions, file content, log entries.
- **Don't ask what you can read.** Repo context is free — spend it.
- **One topic per turn.** Long lists of questions kill momentum.
- **The spec lives in the target repo's `docs/specs/todo/`** — repo is CWD by default, or a caller/handoff-specified path. It is not copied back into the vault unless the vault itself is the target repo. (If the spec lands outside the vault, the Step 5 daily-note link references it by path, not a wikilink.)
- **Spec lifecycle**: `docs/specs/` buckets are `todo` (born here), `done` (moved on implementation merge, by implement-spec or merge-next), `superseded`, `obsolete`, and `archive` (pre-system legacy). See the repo's `docs/specs/README.md`.
- **Infer, show, confirm** — faster than blank-slate questions every time.
