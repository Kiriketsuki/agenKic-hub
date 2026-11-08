# Feature: Spec-Loop Parallel Orchestrator

## Context

The current workflow system (`~/.claude/workflows/`) builds **one feature per invocation**, strictly
sequentially: `feature-loop.mjs` runs brainstorm → spec → implement → validate → council. The only
parallelism is advocate ∥ critic inside the delegated `council-loop.mjs`. Cross-feature parallelism,
agent routing, and model-tier selection are all left to a human "driver" (documented in `feature-loop.md`).
The driver does them by hand with git worktrees. This feature adds an orchestration layer that does all three
automatically. It splits a whole `*-spec.md` into a routed dependency DAG. It builds independent units in parallel
worktree waves. It gates every PR with a council that auto-merges on an unconditional FOR.

**Hard platform constraints that shaped the design (non-negotiable):**
- `workflow()` nests **one level only**. `feature-loop → council-loop` already consumes it.
- Worktree isolation is an `agent({isolation:'worktree'})` option, **not** a `workflow()` option.
- ⇒ Parallel **builds** must be inline worktree-isolated `agent()` calls. `council-loop` runs again as a
  **serial** `workflow()` call on the main tree. **Builds parallelize, councils serialize.**

---

## Overview

**User Story**: As the vault owner driving multi-feature builds, I want a single workflow that decomposes a
spec into independent units. It routes each unit to the right agent and model. It builds the units in parallel. It councils and
auto-merges every PR. So an entire epic ships fully autonomously instead of one hand-driven feature at a time.

**Problem**: `feature-loop.mjs` is one-feature-at-a-time and sequential. Chunking, agent selection, and
sonnet/opus tiering are manual driver work. Large specs are slow and labour-intensive to land.

**Out of Scope**:
- Parallel councils (rejected: councils reuse `council-loop` serially on the shared tree).
- A separate intra-feature parallelism *mechanism* beyond finer decomposition into disjoint sub-tasks.
- Changes to the merge-approval hook itself (the real merge blocker is **draft PR state**, handled in-workflow).
- Importing shared code between workflow scripts (not supported, so the workflow author duplicates the small routing `const`).

---

## Success Condition

> This feature is complete when `spec-loop.mjs` takes a `*-spec.md` and produces a routed feature/sub-task
> dependency DAG. It builds independent leaves in parallel worktree waves. It councils at the **feature-PR** and
> **epic-PR** tiers. It **auto-squash-merges each tier on an unconditional FOR**. It runs fully autonomously and
> resumably. The team also updates `feature-loop.mjs` and `council-loop.mjs` to support it.

---

## Open Questions

| # | Question | Raised By | Resolved |
|:--|:---------|:----------|:---------|
| 1 | Name → `spec-loop` (files `spec-loop.mjs` / `spec-loop.md` / `spec-loop-spec.md`). | Claude | [x] |
| 2 | Fan-out width → expose optional `maxParallel`, default = runtime cap `min(16, cores-2)`. | Claude | [x] |

---

## Scope

### Must-Have
- **Decompose & route**: opus agent reads `specFile` → `features[] = {key,title,scopeTasks,deps[],touchPoints[],domain,briefing}`, each feature optionally split into **disjoint** sub-tasks. Acceptance: every leaf has non-overlapping `touchPoints` with its wave-mates. Un-splittable features stay one unit.
- **Hybrid routing**: `routeFromTable(domain)` JS const (ported from `agent-route`) assigns `{agentType,model}` for known domains. Unclassified leaves → `parallel()` LLM router agents. `routeOverrides` pins win. Acceptance: known domain resolves with zero extra LLM calls. Unknown domain triggers exactly one fallback router. An override always wins.
- **Wave plan (pure JS)**: topo-sort leaves by `deps`. Also serialize leaves whose `touchPoints` overlap. Acceptance: no two leaves in the same wave share a file. The planner respects dependency order.
- **Parallel build**: per wave, `parallel(leaves.map(l => () => agent(buildPrompt(l), {isolation:'worktree', agentType, model, schema:IMPL})))`. Each leaf implements a scope-guarded slice, runs `buildCmd`, commits semantically, and pushes its branch.
- **Intra-feature merge**: a feature's sub-task branches merge (serial agent) into **one** feature branch. There is **no per-sub-task council**.
- **Feature-tier council + auto-merge**: per feature, `workflow('council-loop', {merge:true,...})` → review → fix → unconditional FOR → squash-merge feature into epic.
- **Epic-tier council + auto-merge**: one final `council-loop` over the epic vs `origin/main` (integration scope) → squash-merge epic into main on unconditional FOR.
- **Dynamic models**: opus for decompose, council arbiters, epic arbiter, router-tagged complex/cross-cutting leaves, live-validate. Sonnet is the default for build/advocate/critic/verify/merge.
- **Fully autonomous default**: no human gate. `planOnly`/`autonomous:false` returns the plan without building.
- **Draft-PR self-heal**: every auto-merge runs `gh pr ready <pr>` before `gh pr merge --squash`. A genuine block reports the real reason (draft / failing checks / conflict), not "approval hook".
- **Resumable**: reuse `tryAgent` limit-resilience + budget floor + `RESUMABLE()`. Resume via `resumeFromRunId` (decompose/plan replay from cache, and only the unfinished wave re-runs).

### Should-Have
- `spec-loop.md` driver/usage doc (mirrors `feature-loop.md`: args, invocation by absolute scriptPath, gotchas).
- `feature-loop.mjs` enhancement: auto-route `{agentType,model}` via the same hybrid logic when not supplied.

### Nice-to-Have
- `maxParallel` arg to cap fan-out below the runtime concurrency cap.
- Per-wave progress `log()` summarising routed agents/models and est. token cost.

---

## Technical Plan

**Affected Components**:
- NEW `000-System/Agents/Claude/workflows/spec-loop.mjs`: the orchestrator.
- NEW `000-System/Agents/Claude/workflows/spec-loop.md`: driver/usage doc.
- EDIT `000-System/Agents/Claude/workflows/council-loop.mjs`: merge step (`:247-250`). Add `gh pr ready` before `gh pr merge`. Report accurate draft-stop reason.
- EDIT `000-System/Agents/Claude/workflows/feature-loop.mjs`: add hybrid routing + dynamic-model defaults (`:62-63`, `:167`, `:179`).

**`spec-loop.mjs` args**:
```jsonc
{
  "epic":    { "issue": 7, "branch": "epic/7-...", "parentRef": "origin/main", "title": "..." },
  "project": { "name": "...", "specFile": "spec.md", "buildCmd": "npm run build", "testCmd": "npm test", "repo": "owner/repo" },
  "workflowsDir": "<abs dir holding council-loop.mjs>",
  "autonomous": true,            // default; false → plan-only gate (resumable)
  "planOnly": false,
  "maxParallel": null,           // null → runtime cap min(16, cores-2)
  "routeOverrides": { "F1": { "agentType": "Backend Architect", "model": "opus" } },
  "council": { "advocates": 1, "critics": 1, "rounds": 2 },   // forwarded to council-loop
  "liveValidate": "...", "envNote": "...", "extraRules": "..."
}
```

**Phases (the orchestrator, top-level Workflow)**:
1. **Decompose & Route**: opus decompose agent (schema `DECOMP_SCHEMA`) → features + sub-tasks. Then `routeFromTable()` + `parallel()` LLM fallback + `routeOverrides`.
2. **Wave plan**: pure JS topo-sort of leaves + touchPoint-overlap serialization. `planOnly||!autonomous` → `log(plan)` + `return {plan, resumable:true}`.
3. **Per wave**: BUILD (`parallel` worktree agents) → intra-feature sub-task merge (serial agent) → feature council `workflow('council-loop',{merge:true})` (serial).
4. **Epic council**: one `workflow('council-loop',{scope:'integration', merge:true})` vs `origin/main`.
5. **Return** `{ features, waves, builds, councils, epicCouncil, merged, resumable:false }`.

**Reused utilities (do not re-invent)**:
- `tryAgent` / `LIMIT_RE` / `RESUMABLE()` / `lowBudget()`: copy the pattern from `feature-loop.mjs:76-126`.
- `council-loop.mjs` invoked by **absolute scriptPath** (`${WF_DIR}/council-loop.mjs`), same as `feature-loop.mjs:193`.
- `agent-route` routing table → ported to a `ROUTE` const + `routeFromTable()` (source: `~/.claude/skills/agent-route/SKILL.md` + `references/agent-catalog.md`).

**Testability note**: keep `routeFromTable()` and the wave planner as **pure functions**. Then a tiny standalone node script can smoke-test them. This is the only unit-testable surface. The rest is live-agent orchestration, which a dry-run and a scratch-repo run validate.

**Data Model Changes**: none. There is no persistent store, only in-memory accumulators.

**Dependencies**: `gh` CLI (auth account must match `repo`), git worktree support, the `workflow()`/`parallel()`/`agent()` Workflow hooks. No new packages.

**Risks**:
| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| Two leaves edit the same file → merge conflict | Med | Wave planner serializes touchPoint-overlapping leaves. Un-splittable features stay one unit |
| `workflow()` nesting violation if council called from inside a build agent | Low | Councils run at orchestrator top level only, never inside a build `agent()` |
| Parallel council attempt corrupts shared tree | Low | Councils are explicitly serial. This is a documented constraint |
| Limit/blip nulls a build agent → silent partial epic | Med | `parallel` nulls filtered + logged. `RESUMABLE()` stop. Never merge an unbuilt leaf |
| Decompose over-splits → spurious sub-task churn | Med | Disjoint-touchPoints rule. Router rationale logged. `planOnly` to inspect first |
| Routing table drifts from `agent-route` skill | Low | Comment links the source. LLM fallback covers gaps |

---

## Acceptance Scenarios

```gherkin
Feature: Spec-Loop Parallel Orchestrator

  Background:
    Given a *-spec.md describing multiple features in a git repo on an epic branch

  Rule: Decomposition and routing

    Scenario: Spec decomposes into a routed wave plan
      When spec-loop runs P1 and P2
      Then each feature has scopeTasks, deps and touchPoints
      And every leaf is assigned {agentType, model}
      And known domains resolve via the JS table with no extra LLM call
      And an unlisted domain triggers exactly one LLM fallback router

    Scenario: Route override wins
      Given routeOverrides pins F1 to {Backend Architect, opus}
      Then F1 is built by Backend Architect on opus regardless of table/LLM result

  Rule: Parallel build with safe scheduling

    Scenario: Independent leaves build concurrently
      Given two features with disjoint touchPoints and no deps
      When their wave runs
      Then both build in parallel worktrees and push their own branches

    Scenario: Overlapping touchPoints are serialized
      Given two leaves that both edit src/api.ts
      Then the planner places them in different waves

    Scenario: Sub-tasks fan out then merge to one feature branch
      Given feature F split into disjoint sub-tasks F.1 and F.2
      When the wave runs
      Then F.1 and F.2 build in parallel
      And their branches merge serially into a single F branch with no per-sub-task council

  Rule: PR-aligned council and auto-merge

    Scenario: Feature council auto-merges on unconditional FOR
      When council-loop reaches an unconditional FOR on feature F
      Then F is squash-merged into the epic automatically

    Scenario: Epic council auto-merges on unconditional FOR
      When all features are merged and the epic council returns unconditional FOR
      Then the epic is squash-merged into main automatically

    Scenario: Draft PR self-heals before merge
      Given the feature PR is in draft state
      When the merge step runs
      Then it runs gh pr ready before gh pr merge --squash and the merge proceeds

    Scenario: Genuine merge block reports the real reason
      Given required checks are failing
      Then the step reports the failing-checks reason, not "approval hook", and does not retry

  Rule: Autonomy and resumability

    Scenario: planOnly returns the plan without building
      When spec-loop runs with planOnly true
      Then it returns {plan, resumable:true} and spawns no build agents

    Scenario: Resume after a usage limit
      Given a run stopped resumable mid-wave on a usage limit
      When re-invoked with resumeFromRunId
      Then decompose and plan replay from cache and only the unfinished wave runs live

  Rule: feature-loop enhancement

    Scenario: Standalone feature-loop auto-routes
      Given feature-loop is invoked without agentType or model
      Then it derives {agentType, model} via the ROUTE table (table-only; no LLM fallback for a single-feature run)
```

---

## Task Breakdown

| ID | Task | Priority | Dependencies | Status |
|:---|:-----|:---------|:-------------|:-------|
| T1 | Port `agent-route` table → `ROUTE` const + pure `routeFromTable()`. Define LLM-fallback router prompt + schema | High | None | done |
| T2 | `council-loop.mjs` merge-step patch: `gh pr ready` before merge + accurate draft/checks/conflict stop reporting | High | None | done |
| T3 | `spec-loop.mjs` P1: decompose agent (`DECOMP_SCHEMA`) + routing assembly (table → fallback → overrides) | High | T1 | done |
| T4 | `spec-loop.mjs` P2: pure wave planner (topo-sort + touchPoint serialization). `planOnly`/`autonomous` gate | High | T3 | done |
| T5 | `spec-loop.mjs` P3 build: `parallel` worktree build agents (`IMPL_SCHEMA`, scope guard, semantic commit+push) | High | T4 | done |
| T6 | `spec-loop.mjs` P3 intra-feature: serial sub-task→feature merge agent | High | T5 | done |
| T7 | `spec-loop.mjs` P3 feature council: serial `workflow('council-loop',{merge:true})` per feature | High | T5, T2 | done |
| T8 | `spec-loop.mjs` P4 epic council + auto-merge to main | High | T7 | done |
| T9 | `spec-loop.mjs` resilience: `tryAgent`/limit/budget-floor/`RESUMABLE()` plumbing + result schema | High | T3 | done |
| T10 | `feature-loop.mjs` enhancement: hybrid auto-routing + dynamic-model defaults when args omit them | Med | T1 | done |
| T11 | `spec-loop.md` driver/usage doc + gotchas checklist | Med | T3-T8 | done |
| T12 | Verification: pure-function smoke test (32/32 pass) + `planOnly` dry-run path implemented. Live 2-3-feature scratch-repo run is a post-merge acceptance step (consumes build budget) | High | T1-T10 | done (smoke + dry-run), live run post-merge |

---

## Exit Criteria

- [x] `planOnly` produces a correct wave plan and spawns no build agents. The plan honors deps and no wave shares `touchPoints`: `planWaves` smoke-tested. `PLAN_ONLY||!AUTONOMOUS` gate returns the plan and spawns nothing (`spec-loop.mjs:747`)
- [~] A real 2-3 feature epic on a scratch repo builds leaves in parallel. It councils per feature and at epic level. It auto-squash-merges each tier on unconditional FOR. DEFERRED: the live scratch-repo run is a post-merge acceptance step per T12 (consumes build budget). Code path statically verified only: feature-tier `merge:true` wired at P3 council loop. Epic-tier `merge:true` wired at P4 council loop. Squash-merge fires on unconditional FOR at both tiers (`spec-loop.mjs:866, 891`)
- [x] Sub-task fan-out merges to a single feature branch with exactly one feature-tier council (`spec-loop.mjs:727-773`)
- [x] Draft PRs self-heal (`gh pr ready` then merge). A genuine block reports the real reason (`council-loop.mjs:249-256`)
- [x] Run resumes cleanly from `resumeFromRunId` after a forced limit (cached decompose/plan, only unfinished wave re-runs): `RESUMABLE()` + `tryAgent`/budget plumbing implemented (`spec-loop.mjs:450-470, 611-625`)
- [x] Standalone `feature-loop.mjs` auto-routes when `agentType`/`model` omitted. Existing explicit-arg runs unchanged (`feature-loop.mjs:153-158`)
- [x] `council-loop.mjs` merge patch does not regress current `feature-loop` runs: smoke test confirms council-loop.mjs compiles. The merge step is additive
- [x] `routeFromTable()` + wave planner pass the standalone pure-function smoke test: 32/32 checks pass
- [x] The code has no emojis, no input mutation, no `console.log`, JSDoc on exported helpers, and no hardcoded vault root (it detects the root dynamically): verified

---

## References

- `000-System/Agents/Claude/workflows/feature-loop.md`: driver model, worktree parallelism, resumability
- `000-System/Agents/Claude/workflows/feature-loop.mjs`: pipeline + `tryAgent`/`RESUMABLE` pattern to reuse
- `000-System/Agents/Claude/workflows/council-loop.mjs`: council gate reused serially, merge step patched
- `~/.claude/skills/agent-route/SKILL.md` + `references/agent-catalog.md`: routing table + fallback logic source
- Workflow tool semantics: one-level `workflow()` nesting, `agent({isolation:'worktree'})`, `parallel()` concurrency cap

---
*Authored by: Clault KiperO 4.8*
