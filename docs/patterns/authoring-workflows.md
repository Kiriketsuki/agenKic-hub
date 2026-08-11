# Authoring Workflow scripts

The Workflow tool runs a plain JavaScript orchestration script in a sandboxed loop. The script sequences subagents, checks their structured returns, and loops until a convergence condition holds. This article distills the authoring patterns from the scripts in this repo's [`workflows/`](https://github.com/Kiriketsuki/agenKic-sKills/tree/main/workflows) directory.

Read alongside: [`council-loop.mjs`](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/council-loop.mjs), [`feature-loop.mjs`](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/feature-loop.mjs), [`ultracode-fix.mjs`](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/ultracode-fix.mjs), and [`autofix-swarm.mjs`](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/autofix-swarm.mjs).

## The runtime contract

A workflow script is a pure coordinator. `autofix-swarm.mjs` states the contract most explicitly:

- The first statement is a pure-literal `export const meta`.
- The orchestrator body does zero real I/O. No `fs`, no `child_process`, no git, no `Date.now()`, no `Math.random()`.
- The body only sequences the injected primitives: `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`, and `workflow()`. It reads schema-validated returns, branches, and loops.
- Every world-touching action, such as running tests or committing, happens inside an `agent()` prompt. Those agents hold the real tools.

This split keeps the orchestrator deterministic and resumable. The agents do the work. The script decides what happens next.

## The meta block

`meta` declares the workflow's name, a description, and its phases. The harness uses it for progress display and discovery.

```js
export const meta = {
  name: 'ultracode-fix',
  description: 'Fix a task: sonnet explores, plan, implement, review loop',
  phases: [
    { title: 'Explore', detail: 'scout the codebase when the plan needs context' },
    { title: 'Plan', detail: 'produce a task-list fix plan' },
    { title: 'Implement', detail: 'apply each plan task' },
    { title: 'Review', detail: 'review, request fixes, loop until approved' },
  ],
}
```

Inside the body, call `phase('Plan')` when a phase begins. `autofix-swarm.mjs` adds a `whenToUse` field so a router can pick the workflow without reading its source.

## Defensive args

The harness may pass `args` as an object, a JSON string, or a bare task string. Every workflow here parses defensively at the top:

```js
let A = {}
if (args && typeof args === 'object') A = args
else if (typeof args === 'string' && args.trim()) {
  try { A = JSON.parse(args) } catch { A = { task: args } }
}
```

Then derive named constants with defaults: `const TEST = A.testCmd || 'npm test'`. Clamp numeric knobs to safe ranges, as `autofix-swarm.mjs` does with `maxIterations` (3 to 6) and `fanout` (2 to 3).

## agent() with schemas

`agent(prompt, opts)` spawns one subagent and returns its result. Pass a JSON Schema in `opts.schema` to get a validated object back instead of prose. `ultracode-fix.mjs` builds its whole loop on two schemas:

```js
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['approved', 'findings'],
  properties: {
    approved: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'summary', 'fixInstruction'],
        properties: {
          file: { type: 'string' },
          summary: { type: 'string' },
          fixInstruction: { type: 'string' },
        },
      },
    },
  },
}
```

Design each field for the orchestrator's next decision. `approved` drives the loop condition. Each finding carries a `fixInstruction` written to be self-contained, so it can go straight into a fix agent's prompt without extra context.

Other useful `opts`: `label` (log identity), `phase`, `model`, `effort`, and `isolation: 'worktree'` for a fresh git worktree per agent.

## Parallel versus sequential

Use `parallel()` for independent work, plain `await` for dependent steps. `ultracode-fix.mjs` runs plan tasks in dependency waves: sequential across waves, parallel within a wave.

```js
const results = await parallel(wave.map(t => () =>
  agent(implPrompt(t), { label: `impl:${t.id}`, model: 'opus', effort: 'low' })))
```

`council-loop.mjs` runs its advocate and critic in parallel, then feeds both transcripts to a single arbiter. Fan out the lenses, then converge through one synthesis agent.

## Model tiering per role

Never let every agent inherit the top model. Assign a tier per role, with overridable defaults:

```js
const MODELS = Object.assign(
  { diagnosis: 'sonnet', fix: 'sonnet', gate: 'sonnet',
    arbiter: 'opus', reviewer: 'opus', ledger: 'haiku' },
  A.model || {})
```

The pattern across these workflows: fan-out work (implementers, per-repo appliers, mechanical checks) runs on the cheap tier, synthesis singletons (planner, arbiter, reviewer) run on the deep tier, and bookkeeping runs on the cheapest tier. `council-loop.mjs` adds per-role `effort` overrides to bound spend on the expensive roles. See [Model tiering](model-tiering.md) for the full rationale.

## Budget and resume

Long loops must survive rate limits and token exhaustion. `council-loop.mjs` and `autofix-swarm.mjs` share the same machinery:

- **Limit-aware retry.** A `tryAgent()` wrapper retries transient failures with backoff, but bails fast on a hard usage or rate limit. Retrying inside a blocked window burns quota and risks an empty result passing as a real one.
- **Budget floor.** Before each expensive phase, check the optional `budget` global behind a `typeof budget !== 'undefined'` guard. Stop cleanly when `budget.remaining()` drops below a floor, rather than dying mid-phase.
- **Resumable stop.** On a limit or budget stop, return `{ resumable: true }`. The caller re-invokes with `resumeFromRunId`, and completed `agent()` calls replay from cache instead of re-running.

## Nesting workflows

`workflow()` invokes another workflow one level deep. `feature-loop.mjs` delegates its whole review phase to `council-loop.mjs`. Invoke by absolute `scriptPath`: the name registry only resolves built-ins, and a relative path resolves against the project cwd. Pass a `workflowsDir` argument through so nested paths stay OS-correct.

## Design patterns

**Adversarial verify.** Never let the agent that wrote the code declare it done. `ultracode-fix.mjs` loops a reviewer against the implementers. `council-loop.mjs` goes further: an advocate argues for the change, a critic argues against it, and an arbiter issues the verdict. `autofix-swarm.mjs` adds a hard anti-gaming gate that rejects any candidate diff that touches test files or weakens assertions.

**Loop until dry.** Convergence is a checked condition, not a hope. `council-loop.mjs` re-convenes the council after each fix round until the verdict is an unconditional FOR with zero findings, bounded by `maxLoops`. `ultracode-fix.mjs` loops review and fix until `approved` is true, bounded by `maxLoops`. Every loop carries both a success condition and a hard iteration cap.

**Champion promotion.** When one fix would do, race several. `autofix-swarm.mjs` fans out 2 to 3 competing fix agents, each in an isolated worktree with a distinct strategy: minimal patch, targeted refactor, alternative root cause. A gate filters gamed candidates, then the orchestrator promotes one champion per iteration: the smallest passing diff in bug mode, the best metric in perf mode. Failures retire to a dead-ends ledger so later iterations never re-spend on them.

**Critique before compute.** `autofix-swarm.mjs` runs a council over candidate approaches before spawning any worktree. A shortlist debate costs a fraction of a wasted fan-out.

**Branch pinning.** Agents share one working tree across a long run, and the checkout a previous agent left behind is not trustworthy. `council-loop.mjs` injects a branch-pin instruction into every tree-touching agent: verify the branch first, and never commit or push to the parent branch. Encode safety invariants as injected prompt fragments, not as assumptions.
