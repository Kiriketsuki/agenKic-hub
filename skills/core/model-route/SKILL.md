---
name: model-route
description: >
  Recommend the model tier (haiku, sonnet, opus) and effort level for a task based on
  its role, complexity and cost sensitivity. Use when the user wants to know which
  model to use, wants to save tokens, or is about to start a long or expensive task.
  Triggers: "which model should I use", "model route", "is this worth Opus",
  "save tokens", "model recommendation", "/model-route".
origin: ECC (adapted)
---

## Routing Heuristic

Assign the tier by the role the agent plays, not by the main-loop model.

| Model | Use When |
|:---|:---|
| **opus** | Synthesis singletons, arbiters, plan and spec composers, high-level design, and hard-to-diagnose root causes. Also deep review of a subtle or high-risk change. |
| **sonnet** | Implementers and fan-out: code writers, per-repo appliers, porters, mechanical review lenses, routine multi-file edits. Most agent volume lives here. |
| **haiku** | Cheap mechanical reads only: formatting, simple lookups, log parsing, regex generation, single-file edits with a clear spec. |

Fable is unavailable. Do not recommend it. Use opus as the top tier.

Never put opus on a fan-out stage, such as N review lenses across rounds or per-repo
appliers. Token spend concentrates there and hits the session limit.

Escalate an agent to opus when a sonnet attempt failed on the root cause, when the
task needs cross-system reasoning, or when the result becomes the canonical fix that
others copy.

## Effort

Pair the tier with an effort level. Lower the effort for fan-out.

| Effort | Use When |
|:---|:---|
| `low` | Fan-out workers, mechanical reads, lookups |
| `medium` | Routine implementation and routine review |
| `high` | Default for design, planning and non-trivial debugging |
| `xhigh` | Hard root-causing, high-risk review, canonical fixes |
| `max` | Rare. One-off decisions where being wrong is expensive |

## Decision Factors

- **Role**: synthesis and arbitration = opus; implementation and fan-out = sonnet; mechanical reads = haiku
- **Reversibility**: irreversible actions (git push, file deletes, schema changes) warrant opus
- **Ambiguity**: clear spec = haiku or sonnet; vague or conflicting requirements = opus
- **Blast radius**: single file = haiku or sonnet; repo-wide design = opus
- **Budget sensitivity**: if the user signals cost concern, bias toward sonnet and lower effort

## Output Format

When invoked, produce:

```
Recommended: [haiku / sonnet / opus]
Effort: [low / medium / high / xhigh / max]
Confidence: [high / medium / low]
Reason: [one sentence]
Fallback: [model] if [condition]
```

## Related

Use `/agent-route` to pick the agent type. Use this skill to pick the model and
effort for that agent. The two skills work as a pair.

## Usage

```
/model-route "refactor the logging module"
/model-route "design a new data model" --budget low
/model-route  # describe current task context and get a recommendation
```
