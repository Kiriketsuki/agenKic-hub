# spec-loop — parallel multi-feature epic orchestrator (global)

A project-agnostic top-level Workflow that turns a whole `*-spec.md` into a merged, reviewed epic
by decomposing it into a routed dependency DAG, building independent units in **parallel worktree
waves**, and councilling + auto-merging every PR at the feature tier (into the epic) and the epic
tier (into `origin/main`). Lives in `~/.claude/workflows/` so it is reusable across repos.

Where `feature-loop.mjs` builds **one feature per invocation** and leaves cross-feature
parallelism to a human driver, `spec-loop.mjs` does the decomposition, agent/model routing, and
parallel scheduling automatically. **Builds parallelize; councils serialize** — the only platform-
imposed constraint (`workflow()` nests one level, worktree isolation is an `agent()` option not a
`workflow()` option).

| Part | Runs in | Does |
|---|---|---|
| **`spec-loop.mjs`** | background **Workflow** (top level) | decompose → route → wave-plan → parallel build → intra-feature merge → per-feature council + merge → epic council + merge |
| **`council-loop.mjs`** | nested `workflow()` (one level) | the serial review/fix/verify/squash-merge gate, reused per feature and once for the epic |

> The orchestrator starts from an **existing epic branch**. Creating the epic issue/branch/PR and
> the per-feature branches is the **driver's** job (human or a calling script) — `spec-loop.mjs`
> does not scaffold issues or branches. The `gh-pr-merge` approval hook still applies to each
> auto-merge.

Invoke by **absolute scriptPath** — the name registry does NOT resolve `~/.claude/workflows/*.mjs`
(only built-ins like deep-research / code-review), so `{ name: "spec-loop" }` errors. Pass
`workflowsDir` so the nested council-loop path is OS-correct without hardcoding the vault root:

```
Workflow({
  scriptPath: "/home/kiriketsuki/.claude/workflows/spec-loop.mjs",
  args: { ...<ARGS>, workflowsDir: "/home/kiriketsuki/.claude/workflows" }
})
```

---

## `args` shape — all project-specifics are parameters

```jsonc
{
  // the epic this run lands (driver scaffolds the branch/issue first)
  "epic":    { "issue": 7, "branch": "epic/7-orchestrator", "parentRef": "origin/main", "title": "Spec-Loop" },

  // project config — NO hardcoding; pass yours
  "project": { "name": "<Project>", "specFile": "<spec>.md", "buildCmd": "npm run build", "testCmd": "npm test", "repo": "owner/repo" },

  "workflowsDir": "/home/kiriketsuki/.claude/workflows",  // abs dir holding council-loop.mjs

  // autonomy
  "autonomous": true,            // default; false → plan-only gate (returns the plan, resumable)
  "planOnly": false,             // true → return the wave plan and spawn NO build agents

  // scheduling
  "maxParallel": null,           // null → runtime cap min(16, cores-2); a number caps fan-out below it

  // routing pins (win over the table AND the LLM fallback; a pinned feature is never sent to the router)
  "routeOverrides": { "F1": { "agentType": "Backend Architect", "model": "opus" } },

  // forwarded to every council-loop invocation
  "council": { "advocates": 1, "critics": 1, "questioner": false, "rounds": 2, "maxLoops": 10 },

  // optional, forwarded into build + council prompts
  "liveValidate": "Start the real backend; prove <invariant>; fix defects and re-run.",
  "envNote": "how to start the local DB/service",
  "extraRules": "e.g. follow the design-token system in src/styles",

  // optional per-role model overrides (defaults: decompose=opus, router=sonnet, merge=sonnet; build uses the per-leaf routed model; validate is not an orchestration-level role)
  // NOTE: `model.build` and `model.validate` are NOT valid keys — they are silently ignored (build agents use the per-leaf routed model; there is no orchestration-level validate role).
  "model": { "decompose": "opus", "router": "sonnet", "merge": "sonnet" },

  // optional: pre-wire PR numbers so council-loop uses the exact PR rather than falling back to
  // target.branch lookup. Shape: { [featureKey]: prNumber }  e.g. { "F1": 42, "F2": 43 }
  // Consumed at orchestration time (spec-loop.mjs) as (A.featurePRs && A.featurePRs[feat]).
  // Useful when the driver scaffolds PRs before building and wants to pass their numbers in.
  "featurePRs": { "F1": 42 },

  "minBudget": 80000             // budget floor in tokens before an expensive phase (default 80k)
}
```

The workflow returns
`{ epic, features, waves, builds, councils, epicCouncil, merged, resumable, reason }`.
A terminal run has `resumable: false`; `merged: true` means the epic squash-merged into `main`.

---

## What each phase does

1. **Decompose & Route** — an **opus** decompose agent reads `specFile` and produces
   `features[] = {key, title, scopeTasks, deps[], touchPoints[], domain, briefing}`, each feature
   optionally split into **disjoint** `subTasks[]`. Routing assembly then runs in priority order:
   `routeFromTable(domain)` (a JS table ported from the `agent-route` skill — **zero** LLM calls
   for known domains) → one **parallel** LLM fallback router **per unique unclassified domain** →
   `routeOverrides` **win-always** on top (a pinned feature is never sent to the router).
2. **Wave plan (pure JS)** — Kahn topo-sort of the leaves by `deps` with a lexicographic key
   tiebreak, plus a set-intersection check that serializes any leaves whose `touchPoints` overlap.
   No two leaves in a wave share a file; a dependent leaf is always in a strictly later wave.
   Sub-tasks of one feature that actually overlap are **collapsed back to a single leaf** (graceful
   degradation) and the collapse is logged. `planOnly || !autonomous` returns the plan here and
   spawns no build agents.
3. **Per wave** — `parallel()` worktree build agents (one per leaf, capped at `maxParallel`), each
   implements its scope-guarded slice, runs `buildCmd`, commits semantically, pushes its branch →
   a **serial** intra-feature merge agent folds a feature's same-wave sub-task branches into ONE
   feature branch (no per-sub-task council) → a **serial** per-feature council via
   `workflow('council-loop', {merge:true})` squash-merges the feature into the epic on an
   unconditional FOR.
4. **Epic council** — one `workflow('council-loop', {scope:'integration', merge:true})` over the
   epic vs `origin/main` squash-merges the epic into `main` on an unconditional FOR (opus arbiter).

---

## planOnly dry-run (always do this first)

Inspect the routed wave plan before spending any build compute:

```
Workflow({
  scriptPath: "/home/kiriketsuki/.claude/workflows/spec-loop.mjs",
  args: { epic, project, workflowsDir: "/home/kiriketsuki/.claude/workflows", planOnly: true }
})
```

Returns `{ plan, features, waves, resumable: true }` with **no build agents spawned**. Confirm:
no two leaves in a wave share a `touchPoint`; deps order is honoured; routing (`agentType`/`model`)
looks right; any sub-task collapse was intended. Then re-invoke with `planOnly:false` to build.

---

## Sequential vs parallel

- **Within a wave**: independent leaves build **in parallel** in isolated worktrees (capped at
  `maxParallel`; default `min(16, cores-2)`). Sub-tasks of the same feature build in parallel then
  merge serially to one branch.
- **Across waves**: strictly sequential — a wave runs only after the prior wave's features are
  councilled and merged into the epic, so a dependent leaf builds on top of its already-merged
  dependency.
- **Councils**: always **serial** on the main tree (`workflow()` nesting + shared-tree constraint).
  Raise `council.critics` for more review lenses within a single council, not for parallel councils.

---

## Recovery / resume after a usage limit or budget stop

`spec-loop.mjs` is **limit-resistant and resumable** (same `tryAgent` / budget-floor / `RESUMABLE()`
pattern as `feature-loop.mjs`). On a hard usage/rate limit — or when `budget.remaining()` drops
below the floor (`minBudget`, default 80k) before an expensive phase — it stops at the next **safe
boundary** (never mid-merge) and returns `resumable: true` with a `waveIdx` so the log reads
"resuming at wave N of M".

To resume, re-invoke with the **same** `scriptPath` + **byte-identical** `args`, plus the `runId`
from the stopped run:

```
Workflow({
  scriptPath: "/home/kiriketsuki/.claude/workflows/spec-loop.mjs",
  args: { ...<ARGS>, workflowsDir: "/home/kiriketsuki/.claude/workflows" },
  resumeFromRunId: "<runId from the stopped run>"
})
```

The journal replays every completed `agent()` call from cache (~0 tokens) — the **opus decompose
result replays from cache** and the deterministic wave planner **re-runs in pure JS** — so only the
unfinished wave's agents run live. Git is the checkpoint: every commit/push/merge is idempotent
(tolerates "nothing to commit", pushes `--force-with-lease`, checks "already merged" before acting).
Resume in a **fresh turn** so the token budget has reset.

> A `resumable: true` result is NOT a failure — it means "paused at a safe point." A terminal result
> has `resumable: false`.

---

## Gotchas checklist (each paid for once)

- **Non-collapsed sub-task leaves use branch `feature/<sub-task-key>`** (e.g. `feature/F1.1`).
  If a driver pre-creates PRs before building, run `planOnly` first to read the branch assignments
  so PRs target the correct branch for each leaf.
- **Run `planOnly` first** — eyeball the wave plan (no shared `touchPoints` per wave, deps
  honoured, routing sane) before spawning any build agent. Cheap insurance against a bad split.
- **Decompose `touchPoints` must be precise** — they are the parallel-safety contract. A
  mis-listed file lets two leaves collide in a wave; the planner only serializes overlaps it can
  SEE. The intra-feature merge agent is the backstop for lockfiles/shared config not in the list.
- **Sub-tasks must be order-free, not just file-disjoint** — sibling sub-tasks of one feature
  build in PARALLEL worktrees off the epic branch in the SAME wave, so a sub-task cannot depend
  on a sibling's not-yet-merged code (inter-feature ordering is expressible via `deps`, but
  intra-feature ordering is NOT — that invariant keeps each feature to exactly one branch and one
  council). If two slices are file-disjoint yet sequential (F1.1 scaffolds a module F1.2 extends),
  the decompose must keep them as ONE feature unit, not split them. The prompt enforces this.
- **Stable feature keys** — the decompose agent must emit short, stable alphanumeric keys (F1,
  F2) and NEVER regenerate them on resume; the lexicographic tiebreak and wave assignment depend
  on key stability across runs.
- **Councils serialize, builds parallelize** — never call `council-loop` from inside a build
  `agent()` (it would break the one-level `workflow()` nesting limit). Councils run at the
  orchestrator top level only.
- **Null build result = stop, don't merge** — a limit/blip that nulls a build agent leaves an
  unbuilt leaf; the orchestrator filters it, logs it, and stops `resumable` rather than
  councilling/merging a partial wave.
- **Draft-PR self-heal** — each council-loop merge runs `gh pr ready` before `gh pr merge`; a
  genuine block reports the REAL reason (draft / failing checks / conflict), never "approval hook".
- **`workflowsDir` is required for portability** — it makes the nested council-loop path
  OS-correct without hardcoding the vault root (Arch vs Windows).
- **`routeOverrides` win-always** — a pinned feature key bypasses both the table and the LLM
  router; use it to force a specialist/opus where the auto-router would under-route.
- **The epic council is integration-scoped** — it reviews cross-feature integration, not
  intra-feature nits already cleared per-PR. Don't re-litigate.

---

## References

- `feature-loop.md` / `feature-loop.mjs` — the single-feature loop this orchestrates in parallel;
  source of the `tryAgent` / `RESUMABLE` pattern and the duplicated `ROUTE` table.
- `council-loop.mjs` — the serial council gate reused per feature and for the epic; its merge step
  self-heals draft PRs and reports the real block reason.
- `spec-loop-spec.md` — the feature spec (tasks T1–T12, acceptance scenarios).
- `~/.claude/skills/agent-route/SKILL.md` + `references/agent-catalog.md` — the routing table source.
- `spec-loop.smoke.mjs` — standalone pure-function + syntax smoke test (`routeFromTable` + the wave
  planner); the build/test target. Run: `node 000-System/Agents/Claude/workflows/spec-loop.smoke.mjs`.
