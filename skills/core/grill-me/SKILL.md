---
name: grill-me
description: "Interrogates a plan, an idea or a decision until no branch is left open, then writes a brief.md decision record and stops. Walks the decision tree round by round and gives a recommended answer for every question. Does not present a design and does not chain into feature-spec. Use when the user says 'grill me', 'grill-me', 'grill this', 'interrogate this', 'poke holes in this' or 'stress-test this plan' and wants decisions, not a spec. For a grill that ends in an approved design and a feature-spec handoff, use brainstorm-grill instead."
attribution: "Based on the brainstorm-grill skill in this repository, which adapts the grill-me skill by Matt Pocock (https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)."
model: opus
---

# Grill Me

Interrogate the plan until every decision has an answer. Then write the answers down as a `brief.md` decision record and stop.

This skill is the decisions-only front door. It is one of the three front doors that tutki decision D9 names: brainstorm, grill-me and the tutki kickoff. Its sibling `brainstorm-grill` uses the same protocol, then presents a design and hands off to feature-spec. Use grill-me when the user wants the decisions settled and recorded, with no design and no spec.

<HARD-GATE>
Do not write code, scaffold a project, or take any build action. The only file this skill writes is the brief. Grilling is interrogation, not implementation.
</HARD-GATE>

## Checklist

Create a task for each item and complete them in order:

1. **Explore context.** Read the files, docs, recent commits and existing patterns. Answer from the repo every question that the repo can answer.
2. **Scope check.** If the request holds several independent subjects, say so. Decompose, then grill the first one.
3. **Grill the decision tree.** Work round by round along the frontier. Every question carries a recommended answer.
4. **Read the decisions back.** State the full set of decisions in one short list and confirm that none is open.
5. **Write the brief.** Write `brief.md` in the C1 format to the folder the user names, then stop.

## The Grilling Protocol

**Map the decision tree first.** Before the first question, list the decisions the plan needs and how they depend on each other. The **frontier** is the set of decisions whose prerequisites are all settled. Each answer prunes branches and moves the frontier outward.

**Ask through AskUserQuestion, always with a recommendation.** Each open decision becomes one question:

- `question`: the decision, framed in concrete terms.
- `header`: a short tag of 12 characters or fewer, such as "Storage" or "Scope".
- `options`: 2 to 4 candidate answers. **Option 1 is your recommendation.** Its label ends in " (Recommended)". Its description gives the reason, grounded in the repo, the limits or the goal. The other options are the live alternatives, each with its trade-off.
- `multiSelect: false`: a decision resolves to one answer.

For an open-ended decision, make option 1 the recommended testable definition. When the choice is between concrete artifacts, such as layouts, API shapes or code, put a short mockup in each option's `preview` field.

**Ask the whole frontier as one round.** Put every decision whose prerequisites are settled into one AskUserQuestion call. The tool takes up to 4 questions, so a larger frontier splits into calls in a row, most constraining first. Never put a decision in the same round as one of its prerequisites.

**Resolve dependencies before you descend.** When an answer opens sub-decisions, settle those before you return to sibling branches. Track what is settled. Never reopen a closed branch, and never leave one dangling.

**Push back on vague answers.** "When it works", "something simple" and "the usual" are not answers. Turn each one into a testable statement on the spot, for example: "'Works' means a user can do X and Y holds in the system. Correct?"

**Probe the gaps.** Ask about failure modes, edge cases, concurrency, empty or huge or malformed input, the rollback path, and the real success metric. Name each unexamined assumption, and make the user defend it or drop it.

**Explore instead of asking.** If the code answers a question, read the code. Spawn a subagent for an environment fact and keep grilling the rest of the frontier while it runs.

**Stop when every branch has an answer.** Relentless does not mean endless. When you can state every decision with no open question, stop grilling.

## Writing the Brief

Ask once where the brief goes, unless the user already said. Recommend `docs/brief.md` in the target repo, or a vault folder for work that spans repos. If a `brief.md` already exists there, ask whether to replace it or to write `brief-<id>.md` next to it.

Write the brief in the C1 format that tutki checks with `tutki check brief`:

```markdown
---
record: brief
id: short-name
mode: interrogate
exit: none
status: approved
approved_by: user
date: YYYY-MM-DD
repos: [owner/repo]
level: L0
---

# Short name

## Problem

## Goals and Non-Goals

## Decisions

| ID | Decision | Reason | Source |
|---|---|---|---|
| D1 | ... | ... | user |

## Alternatives Weighed

## Constraints

## Assumptions and Open Questions
```

Rules for the brief:

- Keep the six sections in this order. None may be empty.
- Give each settled decision one `D<n>` row. `Source` is `user` when the user chose it, or `user, recommendation accepted` when the user took option 1.
- Put every option the user rejected under `## Alternatives Weighed`, with the reason.
- Put each question that stays open under `## Assumptions and Open Questions`, and say whether it blocks.
- Set `status: approved` and `approved_by: user` only after the read-back in checklist step 4. Otherwise use `status: draft`.
- Set `exit: none`. Set `exit` to `feature-spec` or `loop` only when the user asks for that next step. Add `## Loop Hints` only when `exit` is `loop`.
- Write the prose in STE: short sentences, active voice, no em-dash, no semicolon, no contraction.

After you write the file, tell the user its path and stop. Do not start a spec, a plan or code. If the user wants a spec next, they can run feature-spec on the brief.

## Key Principles

- **Grill the frontier round by round.** Never batch a decision with its own prerequisite.
- **Every question carries your recommendation.** Ask through AskUserQuestion, with the recommendation as option 1.
- **Resolve dependencies in order.** Settle the most constraining decisions first.
- **No vague answer survives.** Turn each one into a testable statement.
- **Explore the repo before you ask.**
- **Stop at the brief.** The brief is the deliverable.
