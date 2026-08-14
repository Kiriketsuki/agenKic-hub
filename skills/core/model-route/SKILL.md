---
name: model-route
description: >
  Recommend the optimal model tier (Haiku/Sonnet/Opus) for a task based on complexity
  and cost sensitivity. Use when the user wants to know which model to use, wants to
  save tokens, or is about to start a long/expensive task.
  Triggers: "which model should I use", "model route", "is this worth Opus",
  "save tokens", "model recommendation", "/model-route".
origin: ECC (adapted)
---

## Routing Heuristic

| Model | Use When |
|:---|:---|
| **Haiku** | Deterministic, low-risk mechanical tasks: formatting, simple lookups, single-file edits with clear spec, log parsing, regex generation |
| **Sonnet** | Default for implementation, refactors, multi-file edits, routine project operations, code review, skill execution |
| **Opus** | Architecture decisions, deep ambiguous requirements, adversarial review, unfamiliar codebases, anything where being wrong is expensive |

## Decision Factors

- **Reversibility**: irreversible actions (git push, file deletes, schema changes) warrant Opus
- **Ambiguity**: clear spec = Haiku/Sonnet; vague or conflicting requirements = Opus
- **Blast radius**: single file = Haiku; repo-wide = Sonnet/Opus depending on complexity
- **Stakes**: personal note = Haiku; production code = Sonnet; architecture = Opus
- **Budget sensitivity**: if user signals cost concern, bias toward Haiku/Sonnet

## Output Format

When invoked, produce:

```
Recommended: [Model]
Confidence: [high/medium/low]
Reason: [one sentence]
Fallback: [Model] if [condition]
```

## Usage

```
/model-route "refactor the logging module"
/model-route "design a new data model" --budget low
/model-route  # describe current task context and get a recommendation
```
