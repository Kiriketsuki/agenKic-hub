---
name: critique-loop
description: A single entry point to build a scoring rubric, run an independent critique and revision loop, or do both. Use when the user invokes critique-loop, asks to build a rubric through critique-loop, iterate until a score passes, or configure a quality loop. Supports thresholds, round limits, reviewer count, weights, acceptance gates, time limits, and early stopping. Do not turn a one-off review into a revision loop without user intent.
---

# Critique Loop

Run in the current task. Use subagents for independent evaluation. The Python helper validates inputs and calculates decisions. It does not spawn agents or revise artifacts.

## Choose an action

Treat these as natural-language actions, not shell commands:

| Invocation | Action |
|---|---|
| `$critique-loop build rubric` | Create a rubric and stop. |
| `$critique-loop run` | Run the critique and revision loop. |
| `$critique-loop build and run` | Create a rubric, then run the loop. |

Accept equivalent wording such as "build-rubric", "create a rubric", "critique loop", and "do both".
An explicit action takes precedence over earlier task context. A rubric-only request never authorizes artifact changes or review rounds.

If the action is clear from the request, proceed without a menu.
If the user invokes only `$critique-loop`, offer three choices through the available user-input tool:

1. Build rubric.
2. Run critique loop.
3. Build rubric and run.

If no input tool exists, ask the same choice in one concise question. Wait for a choice before starting dependent work.

For **Build rubric**, read [Rubric Builder](../rubric-builder/SKILL.md), create its outputs, and return their links. Skip the loop sections below.
For **Run critique loop**, reuse the selected or task-local rubric. If none exists, create one through Rubric Builder, state that assumption, then continue.
For **Build rubric and run**, use Rubric Builder first, then continue below with the resulting rubric.
Resolve companion paths from this skill directory. Keep `$rubric-builder` available as an optional standalone shortcut.

## Configure once

1. Identify the artifact, audience, task, editable scope, and available evidence. Apply repository instructions and preserve user originals.
2. Reuse the user's rubric. If it is vague or absent, use [Rubric Builder](../rubric-builder/SKILL.md). Preserve any requested scoring system.
3. Resolve settings from the current user request, explicit config file, then [defaults.json](references/defaults.json), in that order.
4. State the threshold, pass rule, and round limit briefly. Ask only for missing information that materially changes the task. Routine defaults need no confirmation.
5. Read [contracts.md](references/contracts.md). Create a new task-local `.critique/<run-id>/` with `config.json`, `rubric.json`, `brief.md`, and `state.json`. Use another writable artifact directory if project rules require it. Keep run data outside installed skills.
6. Validate config and rubric. Freeze their content hashes and acceptance rule throughout the run.

```sh
python <skill-dir>/scripts/evaluate.py validate --config <run>/config.json --rubric <run>/rubric.json
```

Default: 3 total review rounds, 1 fresh reviewer per round, at least 8 in every dimension, and all acceptance gates pass.

`max_rounds` includes the first evaluation. Three rounds permit two revisions after the baseline. Interpret "five retries" as six rounds. Do not infer an infinite budget from "until it passes". State the finite default. "Above 8" means `gt`. "At least 8" means `gte`.

## Run each round

1. **Prepare a reviewable pass.** Complete the authorized initial artifact, or use existing work as round 1. Later, fix the highest-impact evidenced issues. Complete applicable checks before critique.
2. **Capture evidence.** Save a recoverable artifact version, renders, source excerpts, and measurements as appropriate. Record limitations and excluded scope. Reviewers inspect the actual work.
3. **Freeze a snapshot.** Copy or export inputs into `round-01/` and create a manifest. Include every file needed to support scores. For live applications, capture version, viewport, procedure, and results. A URL alone does not freeze changing content.

```sh
python <skill-dir>/scripts/evaluate.py snapshot --files <artifact> <evidence-file> --output <round>/snapshot.json
```

4. **Spawn independent reviewers.** Use [reviewer-prompt.md](references/reviewer-prompt.md). Start new subagents without inherited conversation, such as `fork_turns="none"`. Give the brief, frozen rubric, snapshot, relevant constraints, and output path. Each reviewer scores the complete rubric. Lenses change attention, not coverage.
5. Exclude self-scores, desired totals, prior reviews, pass number, stopping threshold, and preferred verdict from reviewer prompts. Never ask agents to "give 8". Inherit the model unless the user explicitly selects another.
6. Run reviewers concurrently where slots allow, or sequentially within the round. The producer can prepare unrelated documentation but cannot edit reviewed inputs. Do not create user-visible tasks for reviewers.
7. Collect every review and preserve originals. Permit one format-only correction by the same reviewer. Never replace a low-scoring reviewer or repeat grading without a material revision or new evidence.
8. **Calculate the decision.** Run the evaluator. It checks snapshot hashes, rubric identity, reviewer count, evidence fields, arithmetic, and gates. Never round a score into a pass.

```sh
python <skill-dir>/scripts/evaluate.py evaluate --config <run>/config.json --rubric <run>/rubric.json --snapshot <round>/snapshot.json --reviews <round>/review-01.json --output <round>/result.json
```

9. Report dimension scores and the next changes briefly. Record scores, gaps, paths, and changes in `state.json`. Preserve the best complete version using contracts.md.
10. Stop if the evaluator passes. Otherwise apply the stop rules, then revise within the authorized scope.

## Stop and resume

- `passed`: Every configured score condition and acceptance gate passes with sufficient evidence.
- `max_rounds`: All rounds are consumed. Do not extend the budget or lower the threshold to claim success.
- `time_limit`: The configured elapsed-time budget expired. Check before expensive actions and after completion. This soft limit does not kill processes.
- `stalled`: The configured number of consecutive revisions lacks sufficient improvement. Use the comparison rule in contracts.md.
- `blocked`: Required tools, independent agents, or essential evidence remain unavailable after reasonable recovery. Self-review never counts as independent critique.
- `interrupted`: Persist the last fully reviewed snapshot, pending work, and rounds consumed. Resume only when config, rubric, scope, and snapshot identities match.

If the user changes the rubric or acceptance rule, create a new run with a predecessor ID. Do not present its scores as comparable.

Keep the best artifact recoverable when a later pass regresses. Never silently revert shared source changes. Link the best version and state whether the current workspace differs.

Permission to iterate does not authorize deployment, publication, messages to others, purchases, or destructive changes.

## Deliver

Link the artifact, rubric, and scorecard. Show a short table of rounds and dimension scores, the exact stop reason, and unresolved limits. Distinguish estimates from measured usability or performance. A passing prototype rubric does not establish production readiness.

## Resources

- [contracts.md](references/contracts.md): config, rubric, review JSON, and state semantics.
- [reviewer-prompt.md](references/reviewer-prompt.md): independent reviewer instructions.
- [defaults.json](references/defaults.json): starting settings.
- [autoconnect-rubric.json](references/autoconnect-rubric.json): mapping dimensions and original criterion weights with prototype anchors.
- [evaluate.py](scripts/evaluate.py): validation, snapshots, and scoring. Requires Python 3.10 or later, with no third-party packages.
