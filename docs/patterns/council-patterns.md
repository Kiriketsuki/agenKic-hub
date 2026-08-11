# Council patterns

The adversarial council is a review pattern built on real spawned agents, not role-played prose. This article describes the roles, the debate protocol, and the discipline that keeps findings honest. The repo's [adversarial-council skill](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/adversarial-council/SKILL.md) implements it.

## The idea

A team of agents debates a motion: a decision, a plan, or a code change. Advocates argue for it. Critics argue against it. A Socratic questioner watches the live debate and probes any claim that skips its reasoning chain. An arbiter moderates and produces a structured recommendation: FOR, AGAINST, or CONDITIONAL, with cited rationale.

The questioner does not block the debate. It fires "Why?" at unsubstantiated claims in parallel, like a child asking "but why?" at the dinner table: relentless, parallel, and ultimately clarifying.

For code motions, all agents independently read the relevant files before the debate opens. Positions ground in what the code says, not what agents assume it says.

## Real agents only

The debate must run as real spawned agents on a shared team, never as sections of prose in one response. A single model writing ADVOCATE and CRITIC headers argues with itself and converges early. Separate agents with separate contexts do not.

## Role persistence

Every council agent (advocate, critic, questioner, arbiter) must:

- Maintain their assigned character for the entire debate.
- Not drift toward consensus prematurely.
- Not soften their position without a cited reason.

## Round protocol

Every message from a debate agent must:

1. Start with exactly one header: the agent's role name (for example, `## CRITIC`).
2. Address the previous turn before introducing new points.
3. Stay inside the round's scope. A rebuttal round is not a new argument round.

When rebutting a specific claim, name the agent, quote the claim verbatim, then present counter-evidence:

```
@ADVOCATE: "The cache layer adds no latency"
Counter: profiler output at cache.ts:142 shows 12ms overhead under load.
```

## Concession discipline

Once an agent concedes a point, it must not re-argue that point in a later round. Concessions are permanent within the debate. The arbiter notes concessions in the recommendation to prevent re-litigation.

## Evidence grounding

| Motion type | Citation required |
|:---|:---|
| Code | `file:line`, plus a verbatim code excerpt or test output |
| General | A named source: doc URL, RFC, benchmark paper, or named prior art |

The questioner challenges any claim that carries no citation. For code motions, every agent verifies a claim against the actual source before it enters any recommendation. The arbiter rejects any finding whose citation it cannot confirm.

## Arbiter obligations

The arbiter must:

1. Summarize what each agent conceded, not just what they argued.
2. Reflect questioner findings faithfully. Never upgrade an unsubstantiated claim to a finding.
3. Issue FOR, AGAINST, or CONDITIONAL with cited rationale, not editorial opinion.
4. Never invent findings to appear more thorough.
5. Audit scope before compiling findings. Each finding must be directly about the motion, and the concern must not pre-date the motion. Drop findings that fail either test.

## Critical discovery threshold

An out-of-scope finding survives only when it clears a high bar:

| Category | Bar | Examples |
|:---|:---|:---|
| Security | OWASP Top 10 or equivalent | SQL injection, auth bypass, exposed credentials, SSRF |
| Data loss | Corruption, silent deletion, unrecoverable state | Missing rollback, unguarded cascade delete |
| Compliance | Legal or regulatory blocker | Privacy-law violation, license incompatibility |

Nothing else qualifies. That excludes performance, code quality, feature ideas, style, and tech debt. A critical discovery is an informational note only, not a fix target.

## Related skills

- [council-supervisor](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/council-supervisor/SKILL.md) adds heartbeat monitoring, stall detection, and checkpointing around the debate.
- [council-fix](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/council-fix/SKILL.md) chains the council into a prioritised fix plan.
- [parallel-fix](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/parallel-fix/SKILL.md) races competing fixes for the findings in isolated worktrees.
