# Model tiering

When a workflow fans out many subagents, do not let every agent inherit the main session's model. Assign a model tier explicitly, per role. Token spend concentrates in fan-out stages, and putting the top model there is what exhausts a session budget.

## Role to tier mapping

The tiers below use generic labels. Map them to your provider's models: a top reasoning model, a strong mid-tier model, and a cheap fast model.

| Role | Tier | Notes |
|:---|:---|:---|
| Thinker: workflow design, high-level synthesis, hard-to-diagnose root-causing | Top | Reserve for synthesis singletons and escalation only. |
| Orchestrator: coordination agents, plan and spec composers, arbiters, revision singletons | Top or strong mid | Also the default reviewer tier when a review needs depth. |
| Implementer: code writers, per-repo appliers, porters, mechanical API work | Mid | The fan-out tier. Most agent volume lives here. |
| Reviewer: adversarial lenses, verification panels | Top for subtle or high-risk changes. Mid for mechanical YAML and config verification. | |

## Escalation rule

Escalate an agent to the top tier only for high-level design or a hard-to-diagnose task. That means a root cause that survived a failed mid-tier attempt, cross-system reasoning, or the canonical fix others will copy.

Never put the top tier on a fan-out stage, such as N review lenses across rounds or per-repo appliers.

## In workflow scripts

```js
// Synthesis or hard-diagnosis singleton. Escalate.
const spec = await agent(synthPrompt, { schema: SPEC, model: 'top' })
// Coordination, arbitration, deep review. Orchestrator tier.
const verdict = await agent(arbiterPrompt, { schema: VERDICT, model: 'top' })
// Fan-out: implement, apply, port, mechanical verify.
const results = await parallel(repos.map(r => () =>
  agent(applyPrompt(r), { schema: APPLY, model: 'mid' })))
```

## Why this matters

The rule comes from a real failure. A 33-agent run once inherited the top model everywhere. It burned about 2M subagent tokens and hit the session limit. Review and apply fan-out on a mid-tier model is materially cheaper, with no observed quality loss on YAML and config work.
