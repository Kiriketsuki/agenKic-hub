---
name: goal-writer
description: >-
  Draft or improve a Codex goal from a task, spec, or rough objective.
  Use when the user asks to write a goal, tighten completion criteria,
  turn a task into /goal, or invokes goal-writer.
  Produces a goal the user can paste, with evidence requirements and clear limits.
  Drafts only unless the user explicitly requests activation.
---

# Goal Writer

Turn the user's intent into a compact, verifiable goal. Preserve decisions from the conversation and supplied specs.
This skill works in Claude and Codex. Claude can prepare text for Codex without native goal tools.

## Foundation

A goal suits work with an uncertain path and a verifiable finish.
Use an ordinary prompt for a small edit or single answer.

Cover six elements:

| Element | Required content |
| --- | --- |
| Outcome | The end state that counts as success |
| Evidence | Tests, measurements, sources, or artifacts that show success |
| Constraints | Behavior and quality that must remain intact |
| Boundaries | Allowed files, repositories, tools, data, and resources |
| Iteration | How evidence guides the next attempt |
| Blocker | When progress needs outside input and what to report |

These principles derive from [Using Goals in Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex), consulted on 2026-09-11.
The workflow and examples below apply those principles to skill use.

## Workflow

1. Read the request and relevant context.
   Inspect referenced specs and nearby test or benchmark definitions when available.
   Do not perform the underlying implementation while drafting.
2. Identify the intended deliverable and supported acceptance conditions.
   Preserve user thresholds. Never invent a performance target, test command, dataset, or existing baseline.
3. Resolve gaps from available files before asking questions.
   Ask one grouped question only when missing details materially affect the draft.
   Otherwise state reasonable assumptions outside the goal.
   Use visible placeholders for unresolved acceptance decisions. Label such output as a draft that needs input.
4. Write the goal with the template below.
   Keep necessary detail and remove empty clauses.
   Define observable results without prescribing every implementation step.
5. Check the draft against the quality gate.
   Read [examples.md](references/examples.md) for worked examples when needed.
6. Return one goal in a fenced text block.
   Follow it with only material assumptions or unresolved inputs.
   Save a file only when the user requests one or supplies an output path.

## Draft template

```text
/goal [Deliverable and acceptance condition]. Demonstrate success with [named checks and evidence]. Preserve [required behavior]. Limit work to [scope and resources]. After each attempt, record the result and choose an experiment that addresses the remaining failure. When available approaches cannot resolve a blocker, report attempted approaches, evidence, missing input, and the next feasible step.
```

Replace every bracket before calling a draft ready to use.
For simple goals, combine related clauses. Do not expand the draft into a feature specification.

## Evidence rules

- Tie each acceptance condition to a check and a pass condition.
- Verify command names against project configuration. Treat unverified commands as proposed checks.
- For benchmarks, identify the workload, environment, baseline, and measurement method when they affect comparison.
- For flaky tests, define repeated runs and failure recording. One passing rerun does not establish reliability.
- For artifacts, name the required content and the inspection method. File existence alone rarely proves quality.
- Keep acceptance conditions fixed during iteration. Do not permit weaker tests or smaller workloads to manufacture success.
- When the target needs discovery, draft a bounded investigation first. Its deliverable should resolve the missing acceptance decision.

For research, specify a claim ledger with sources, methods, results, and uncertainty.
Distinguish direct reproduction, approximation, indirect support, and unavailable evidence.
An audit may finish with unresolved claims only when its agreed deliverable permits them.
Missing evidence cannot satisfy a goal that requires exact reproduction.

## Activation and runtime boundaries

Writing a goal does not activate it. Do not call goal tools merely because this skill runs.
If the user also explicitly requests activation, use the available runtime tools and their current contract.
Inspect existing goal state first. Do not overwrite an unfinished goal or silently clear it.

If goal tools are unavailable, return the text for the user to paste into a compatible Codex session.
Do not claim that Claude supports Codex lifecycle commands or that a printed command created persistent state.
Check current local capabilities before giving version-specific setup advice.

Set a token budget only when the user explicitly supplies one.
Do not convert time limits into token budgets or guess budget flags.
Follow runtime rules for completion and blocker status, including any required repeated blocker audits.
Leave pause, resume, clear, and budget transitions to the user or runtime.

Goals belong to their thread. Budget exhaustion is not success.
Completion requires evidence. A failed attempt should inform another feasible attempt rather than trigger a premature blocker claim.

## Quality gate

Before returning the draft, confirm:

- The outcome describes a result the user requested.
- Every required result has observable evidence and a pass condition.
- All six elements appear, with detail proportionate to the task.
- Scope allows necessary investigation without granting unrelated authority.
- Unknown facts remain visible instead of becoming invented requirements.
- The iteration clause supports learning without weakening acceptance conditions.
- The blocker clause requests evidence and an actionable next input.
- The response distinguishes a draft from an active goal.
- No budget, publication, deployment, or other external action exceeds the user's authorization.
