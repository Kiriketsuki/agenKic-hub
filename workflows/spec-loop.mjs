/**
 * spec-loop.mjs — Spec-Loop Parallel Orchestrator (top-level background Workflow).
 *
 * Decomposes a whole *-spec.md into a routed feature/sub-task dependency DAG, builds independent
 * leaves in parallel worktree waves, councils every feature PR, and auto-squash-merges at the
 * feature tier (into the epic) and the epic tier (into origin/main) on an unconditional FOR.
 *
 * Phases:
 *   P1 Decompose & Route — opus decompose agent (DECOMP_SCHEMA) → features[] (+ optional disjoint
 *      subTasks[]); then routing assembly: routeFromTable(domain) JS table first → parallel() LLM
 *      fallback (one router per unique unclassified domain) → routeOverrides win-always on top.
 *   P2 Wave plan (PURE JS) — Kahn topo-sort of leaves by deps with a lexicographic key tiebreak,
 *      plus touchPoint-overlap serialization so no two wave-mates share a file. planOnly||!autonomous
 *      → log the plan and return {plan, resumable:true} WITHOUT spawning any build agent.
 *   P3 per wave — BUILD (parallel worktree agents) → intra-feature sub-task→one-feature-branch merge
 *      (serial agent; only for features whose sub-tasks ran in the SAME wave; no per-sub-task council)
 *      → per-feature council via workflow('council-loop',{merge:true}) (serial, top level).
 *   P4 Epic council — one workflow('council-loop',{scope:'integration',merge:true}) vs origin/main.
 *   Return { features, waves, builds, councils, epicCouncil, merged, resumable:false }.
 *
 * ─── RUNTIME CONTRACT ──────────────────────────────────────────────────────────────────────
 *  - Plain JavaScript. First statement is a PURE-LITERAL `export const meta`.
 *  - The harness wraps this body in an AsyncFunction, so top-level await/return are legal here
 *    (and `node --check` / a real `import` would FAIL on them — use spec-loop.smoke.mjs instead).
 *  - The injected primitives are agent/parallel/pipeline/phase/log/workflow; `budget` is OPTIONAL
 *    and read only behind a typeof guard. No console.log in this file (workflow runtime).
 *  - Worktree isolation is an agent({isolation:'worktree'}) option, NOT a workflow() option.
 *  - workflow() nests ONE level only; councils run at THIS top level, never inside a build agent().
 *  - council-loop is invoked by ABSOLUTE scriptPath (`${WF_DIR}/council-loop.mjs`) — the name
 *    registry does NOT resolve ~/.claude/workflows/*.mjs.
 *  - SELF-REFERENTIAL BUILD: workflow scripts cannot import each other, so the agent-route table is
 *    ported into a ROUTE const here AND duplicated in feature-loop.mjs (source:
 *    ~/.claude/skills/agent-route/SKILL.md + references/agent-catalog.md). Keep them in sync.
 *  - Repo/vault root is detected dynamically by the spawned agents (git rev-parse) — never hardcoded
 *    here; the only path default is the Arch workflowsDir fallback, overridable via args.workflowsDir.
 *
 * ─── INVOKE (top-level, by absolute scriptPath) ──────────────────────────────────────────────
 *   Workflow({ scriptPath: "<abs>/spec-loop.mjs",
 *              args: { epic, project, workflowsDir: "<abs>", autonomous, planOnly, maxParallel,
 *                      routeOverrides, council, liveValidate, envNote, extraRules } })
 *
 * ─── ARGS SHAPE (arrives as a JSON string — parsed defensively) ───────────────────────────────
 *   {
 *     epic:    { issue, branch, parentRef, title },        // parentRef e.g. "origin/main"
 *     project: { name, specFile, buildCmd, testCmd, repo }, // repo e.g. "owner/repo"
 *     workflowsDir,                 // abs dir holding council-loop.mjs (default Arch path)
 *     autonomous,                   // default true; false → plan-only gate (resumable)
 *     planOnly,                     // default false; true → return the plan, spawn no build agents
 *     maxParallel,                  // null → runtime cap min(16, cores-2)
 *     routeOverrides,               // { "F1": { agentType, model } } — wins over table + LLM
 *     council,                      // forwarded to council-loop { advocates, critics, rounds, ... }
 *     liveValidate, envNote, extraRules,  // optional, forwarded into build/council prompts
 *     liveValidateFeatures,         // optional string[] of feature keys; when set, liveValidate is
 *                                   // forwarded ONLY for those features' builds+councils. Use this
 *                                   // instead of a global liveValidate when early features precede
 *                                   // deployment: a global true puts "backend validated live" in the
 *                                   // arbiter's UNCONDITIONAL bar, which is unsatisfiable pre-deploy
 *                                   // and makes councils churn to maxLoops without ever merging
 *                                   // (observed 2026-06-10 on the AutoLLM run).
 *     haltOnUnmerged,               // default true: stop resumable when a feature council ends
 *                                   // unconverged or unmerged, instead of building later waves on an
 *                                   // epic branch that is missing the dependency. false = old behavior.
 *     minBudget,                    // budget-floor in tokens (default 80000)
 *     model,                        // optional per-role model overrides
 *   }
 */

export const meta = {
  name: 'spec-loop',
  description: 'Spec-Loop Parallel Orchestrator: decompose a *-spec.md into a routed feature/sub-task dependency DAG (opus decompose + table/LLM-fallback/override routing), plan parallel worktree waves (pure-JS topo-sort + touchPoint serialization), build leaves in parallel, merge intra-feature sub-tasks to one feature branch, council every feature PR and auto-squash-merge into the epic on unconditional FOR, then run one epic council and auto-squash-merge into origin/main. Fully autonomous and resumable (resumeFromRunId); planOnly returns the plan without building.',
  whenToUse: 'Landing a whole multi-feature epic from a single *-spec.md autonomously, building independent units in parallel worktree waves with per-feature and epic-level council gates. Run planOnly first to inspect the wave plan.',
  phases: [
    { title: 'Decompose', detail: 'opus decompose agent reads the spec → features[] with scopeTasks, deps, touchPoints, domain, briefing and optional disjoint subTasks[]' },
    { title: 'Route', detail: 'routeFromTable(domain) JS table first → one LLM fallback router per unique unclassified domain (parallel) → routeOverrides win-always on top' },
    { title: 'Plan', detail: 'pure-JS Kahn topo-sort of leaves by deps (lexicographic key tiebreak) + touchPoint-overlap serialization; planOnly/!autonomous returns the plan and builds nothing' },
    { title: 'Build', detail: 'per wave: parallel worktree agents, one per leaf, each implements its scope-guarded slice, runs buildCmd, commits semantically, pushes its branch' },
    { title: 'Merge', detail: 'intra-feature: serial agent merges a feature\'s same-wave sub-task branches into one feature branch (no per-sub-task council)' },
    { title: 'Council', detail: 'per feature: serial workflow(council-loop, merge:true) reviews to unconditional FOR and squash-merges the feature branch into the epic' },
    { title: 'Epic', detail: 'one workflow(council-loop, scope:integration, merge:true) over the epic vs origin/main; squash-merges the epic into main on unconditional FOR' },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SECTION 1 — PURE HELPERS (defined first; exported onto the test sentinel and early-returned)
// These two surfaces (routeFromTable + planWaves) are the only unit-testable code; everything
// else is live-agent orchestration. They are pure: no agent() calls, no I/O, no mutation.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ROUTE — agent-route routing table, ported from ~/.claude/skills/agent-route/SKILL.md (Quick
 * Routing Table) and references/agent-catalog.md (extended domains). Keys are lowercase domain
 * phrases; values are {agentType, model}. This is a frozen constant — never mutate it. It is
 * duplicated (not imported) inside feature-loop.mjs per the no-shared-import platform constraint;
 * keep both copies in sync when the skill table changes.
 *
 * Model tiers follow the skill's Model Pairing guidance: opus for architecture/cross-cutting and
 * planning domains, sonnet for implementation/review/devops, haiku for fast search/exploration.
 * @type {Readonly<Object<string, {agentType: string, model: string}>>}
 */
const ROUTE = Object.freeze({
  // Quick Routing Table (SKILL.md) — primary domains
  'codebase search/exploration': { agentType: 'Explore', model: 'haiku' },
  'codebase search': { agentType: 'Explore', model: 'haiku' },
  'exploration': { agentType: 'Explore', model: 'haiku' },
  'architecture/planning': { agentType: 'Software Architect', model: 'opus' },
  'architecture': { agentType: 'Software Architect', model: 'opus' },
  'planning': { agentType: 'Plan', model: 'opus' },
  'bug investigation': { agentType: 'diagnosis', model: 'sonnet' },
  'implementation (full-stack)': { agentType: 'Senior Developer', model: 'sonnet' },
  'implementation': { agentType: 'Senior Developer', model: 'sonnet' },
  'full-stack': { agentType: 'Senior Developer', model: 'sonnet' },
  'backend/api design': { agentType: 'Backend Architect', model: 'sonnet' },
  'backend': { agentType: 'Backend Architect', model: 'sonnet' },
  'api': { agentType: 'Backend Architect', model: 'sonnet' },
  'frontend/ui build': { agentType: 'Frontend Developer', model: 'sonnet' },
  'frontend': { agentType: 'Frontend Developer', model: 'sonnet' },
  'ui': { agentType: 'Frontend Developer', model: 'sonnet' },
  'code review': { agentType: 'Code Reviewer', model: 'sonnet' },
  'pr review': { agentType: 'pr-review-toolkit:code-reviewer', model: 'sonnet' },
  'security analysis': { agentType: 'Security Engineer', model: 'opus' },
  'security': { agentType: 'Security Engineer', model: 'opus' },
  'devops/ci/cd': { agentType: 'DevOps Automator', model: 'sonnet' },
  'devops': { agentType: 'DevOps Automator', model: 'sonnet' },
  'ci/cd': { agentType: 'DevOps Automator', model: 'sonnet' },
  'database work': { agentType: 'Database Optimizer', model: 'sonnet' },
  'database': { agentType: 'Database Optimizer', model: 'sonnet' },
  'documentation': { agentType: 'Technical Writer', model: 'sonnet' },
  'docs': { agentType: 'Technical Writer', model: 'sonnet' },
  'testing/qa': { agentType: 'API Tester', model: 'sonnet' },
  'testing': { agentType: 'API Tester', model: 'sonnet' },
  'qa': { agentType: 'API Tester', model: 'sonnet' },
  'pipeline orchestration': { agentType: 'Agents Orchestrator', model: 'opus' },
  'orchestration': { agentType: 'Agents Orchestrator', model: 'opus' },
  'mcp server building': { agentType: 'MCP Builder', model: 'sonnet' },
  'mcp': { agentType: 'MCP Builder', model: 'sonnet' },
  'type design review': { agentType: 'pr-review-toolkit:type-design-analyzer', model: 'sonnet' },
  'code simplification': { agentType: 'pr-review-toolkit:code-simplifier', model: 'sonnet' },
  // Extended (agent-catalog.md) — common cross-cutting domains
  'system design': { agentType: 'Software Architect', model: 'opus' },
  'data engineering': { agentType: 'Data Engineer', model: 'sonnet' },
  'data pipeline': { agentType: 'Data Engineer', model: 'sonnet' },
  'ai engineering': { agentType: 'AI Engineer', model: 'opus' },
  'machine learning': { agentType: 'AI Engineer', model: 'opus' },
  'mobile': { agentType: 'Mobile App Builder', model: 'sonnet' },
  'mobile app': { agentType: 'Mobile App Builder', model: 'sonnet' },
  'embedded': { agentType: 'Embedded Firmware Engineer', model: 'sonnet' },
  'firmware': { agentType: 'Embedded Firmware Engineer', model: 'sonnet' },
  'smart contract': { agentType: 'Solidity Smart Contract Engineer', model: 'opus' },
  'sre': { agentType: 'SRE', model: 'sonnet' },
  'git workflow': { agentType: 'Git Workflow Master', model: 'sonnet' },
  'ux': { agentType: 'UX Architect', model: 'sonnet' },
  'ui design': { agentType: 'UI Designer', model: 'sonnet' },
  'accessibility': { agentType: 'Accessibility Auditor', model: 'sonnet' },
  'performance': { agentType: 'Performance Benchmarker', model: 'sonnet' },
  'rapid prototype': { agentType: 'Rapid Prototyper', model: 'sonnet' },
})

// Domain classes the router should escalate to opus even when the table picks a cheaper tier:
// complex / cross-cutting work benefits from the deepest reasoning per the spec's dynamic-model rule.
const COMPLEX_DOMAIN_RE = /(architect|orchestrat|cross.?cutting|system design|security|distributed|migration|refactor)/i

/**
 * Resolve a domain string to {agentType, model} from the static ROUTE table, with NO LLM call.
 * Matching is case-insensitive and tolerant of surrounding whitespace; an exact key match is
 * tried first, then a substring containment match (so "backend service" resolves via "backend").
 * Returns a FRESH object (never a reference into ROUTE) so callers can extend it immutably, or
 * null when the domain is absent/empty so the caller can fall back to the LLM router.
 *
 * @param {string|null|undefined} domain - the leaf's domain field
 * @returns {{agentType: string, model: string}|null} a fresh route, or null if not in the table
 */
function routeFromTable(domain) {
  if (domain === null || domain === undefined) return null
  const d = String(domain).trim().toLowerCase()
  if (!d) return null
  if (Object.prototype.hasOwnProperty.call(ROUTE, d)) {
    const hit = ROUTE[d]
    return { agentType: hit.agentType, model: hit.model }
  }
  // substring containment: pick the longest matching key so "backend/api design" beats "api".
  let best = null
  let bestLen = 0
  for (const key of Object.keys(ROUTE)) {
    if ((d.includes(key) || key.includes(d)) && key.length > bestLen) {
      best = ROUTE[key]
      bestLen = key.length
    }
  }
  return best ? { agentType: best.agentType, model: best.model } : null
}

/**
 * Normalize a leaf's domain to the canonical key used for router dedup (lowercased, trimmed; a
 * null/undefined domain maps to the empty-string bucket so it is content-routed by ONE call).
 * Pure.
 * @param {string|null|undefined} domain
 * @returns {string} the canonical domain key
 */
function domainKey(domain) {
  return (domain === null || domain === undefined) ? '' : String(domain).trim().toLowerCase()
}

/**
 * Pure dedup: given leaves needing the LLM fallback router (those with no table route and no
 * override pin), return the UNIQUE canonical domain keys so the orchestrator fires EXACTLY ONE
 * router agent per unique domain and maps the result back to every leaf sharing that domain.
 * Order is preserved by first appearance for stable, deterministic routing. Pure; no mutation.
 * @param {Array<{domain?: string}>} unclassifiedLeaves
 * @returns {string[]} unique canonical domain keys
 */
function uniqueRouterDomains(unclassifiedLeaves) {
  const seen = new Set()
  const out = []
  for (const l of (unclassifiedLeaves || [])) {
    const k = domainKey(l && l.domain)
    if (!seen.has(k)) { seen.add(k); out.push(k) }
  }
  return out
}

/**
 * Pure wave planner. Accepts an array of LEAVES and returns a deterministic parallel wave plan.
 *
 * A leaf is { key, deps?: string[], touchPoints?: string[], feature?: string, ... }. Sub-task
 * leaves of the SAME feature whose touchPoints overlap are first collapsed into a single leaf
 * (graceful degradation to a one-unit feature — the decompose agent's split is advisory only;
 * this set-intersection enforcement is authoritative). Feature-level deps (leaves inherit their
 * parent feature's deps, which name FEATURE keys) are then expanded onto the sub-task leaf keys of
 * any split dependency feature, so an edge to a split feature G is not silently dropped. The
 * remaining leaves are scheduled by Kahn's BFS topo-sort over deps with a lexicographic key
 * tiebreak; within a wave, any leaf whose
 * touchPoints intersect an already-placed wave-mate is deferred to the next wave. No two leaves in
 * a wave ever share a touchPoint file, and a dependent leaf is always in a strictly later wave
 * than its dependency. PURE: no agent() calls, no I/O, never mutates the input.
 *
 * @param {Array<{key: string, deps?: string[], touchPoints?: string[], feature?: string}>} leavesIn
 * @returns {{ waves: Array<Array<object>>, collapses: Array<{feature: string, mergedKeys: string[], reason: string}> }}
 */
function planWaves(leavesIn) {
  const input = Array.isArray(leavesIn) ? leavesIn : []
  // ---- 1. Collapse same-feature sub-task leaves with overlapping touchPoints (immutably) ----
  const collapses = []
  const byFeature = new Map()
  for (const leaf of input) {
    const fk = leaf.feature || leaf.key
    if (!byFeature.has(fk)) byFeature.set(fk, [])
    byFeature.get(fk).push(leaf)
  }
  // Build the working leaf set, collapsing overlapping same-feature groups into one union leaf.
  let leaves = []
  for (const [fk, group] of byFeature) {
    if (group.length <= 1) { leaves.push({ ...group[0] }); continue }
    // Does any pair in this feature's sub-tasks overlap on touchPoints? If so, collapse ALL of
    // them into a single leaf carrying the union of scopeTasks + touchPoints (deps too).
    const overlaps = (() => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = new Set(group[i].touchPoints || [])
          if ((group[j].touchPoints || []).some((t) => a.has(t))) return true
        }
      }
      return false
    })()
    if (!overlaps) { for (const g of group) leaves.push({ ...g }); continue }
    const unionTouch = Array.from(new Set(group.flatMap((g) => g.touchPoints || [])))
    const unionScope = Array.from(new Set(group.flatMap((g) => (Array.isArray(g.scopeTasks) ? g.scopeTasks : (g.scopeTasks ? [g.scopeTasks] : [])))))
    // deps from sub-tasks that point OUTSIDE this feature's own sub-task keys are preserved.
    const ownKeys = new Set(group.map((g) => g.key))
    const unionDeps = Array.from(new Set(group.flatMap((g) => (g.deps || []).filter((dep) => !ownKeys.has(dep)))))
    const merged = {
      ...group[0],
      key: fk,
      feature: fk,
      touchPoints: unionTouch,
      scopeTasks: unionScope,
      deps: unionDeps,
      collapsedFrom: group.map((g) => g.key),
    }
    leaves.push(merged)
    collapses.push({ feature: fk, mergedKeys: group.map((g) => g.key), reason: 'overlapping touchPoints among same-feature sub-tasks — collapsed to a single leaf' })
  }

  // ---- 1b. Expand feature-level deps onto their sub-task leaf keys (immutably) ----
  // A leaf's deps are inherited from its parent FEATURE (spec-loop flatten) and therefore name
  // FEATURE keys (e.g. 'G'), not leaf keys. When that dependency feature G was split into
  // sub-task leaves (G.1, G.2), 'G' is NOT a key in byKey, so the Kahn filter `.filter(byKey.has)`
  // below would SILENTLY DROP the edge — letting the dependent build in the SAME wave as its
  // (un-merged) dependency. Rewrite each dep d that is absent as a leaf key but present as a
  // feature with leaves into that feature's leaf keys, so the topo-sort honors the real ordering.
  const leafKeySet = new Set(leaves.map((l) => l.key))
  const featureToLeafKeys = new Map() // feature key -> [leaf keys belonging to it]
  for (const l of leaves) {
    const fk = (l.feature !== undefined && l.feature !== null) ? l.feature : l.key
    if (!featureToLeafKeys.has(fk)) featureToLeafKeys.set(fk, [])
    featureToLeafKeys.get(fk).push(l.key)
  }
  leaves = leaves.map((l) => {
    const expanded = []
    for (const d of (l.deps || [])) {
      if (leafKeySet.has(d)) { expanded.push(d); continue }            // already a leaf key — keep
      const subKeys = featureToLeafKeys.get(d)                          // a split feature key?
      if (subKeys && subKeys.length) { for (const sk of subKeys) if (sk !== l.key) expanded.push(sk) }
      else expanded.push(d)                                            // unknown dep — keep (filtered later)
    }
    return { ...l, deps: Array.from(new Set(expanded)) }
  })

  // ---- 2. Kahn topo-sort with lexicographic key tiebreak + touchPoint serialization ----
  const byKey = new Map(leaves.map((l) => [l.key, l]))
  const doneWave = new Map() // key -> wave index it was placed in (for dependency-wave ordering)
  const remaining = new Set(leaves.map((l) => l.key))
  const waves = []
  let guard = leaves.length + 1 // termination guard against a cyclic dep graph

  while (remaining.size && guard-- > 0) {
    // ready = remaining leaves whose every in-set dep is already placed in an EARLIER wave.
    const ready = Array.from(remaining)
      .map((k) => byKey.get(k))
      .filter((l) => (l.deps || []).filter((d) => byKey.has(d)).every((d) => doneWave.has(d)))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) // lexicographic, stable
    if (!ready.length) break // remaining nodes are all in a cycle — stop (handled below)

    // Group ready leaves by feature so same-feature sub-tasks are placed ATOMICALLY.
    // A feature group is placed only if NONE of its union touchPoints conflict with the current
    // wave's waveTouch set; if any sub-task in the group would conflict, the WHOLE group is
    // deferred together. This guarantees that disjoint same-feature sub-tasks always land in
    // the same wave, so featureGroups.group.length>1 fires the intra-feature merge path and
    // exactly ONE feature council runs per feature.
    const featureGroupsReady = (() => {
      /** @type {Map<string, Array<object>>} */
      const byFeat = new Map()
      for (const leaf of ready) {
        const fk = (leaf.feature !== undefined && leaf.feature !== null) ? String(leaf.feature) : leaf.key
        if (!byFeat.has(fk)) byFeat.set(fk, [])
        byFeat.get(fk).push(leaf)
      }
      // Return ordered by the lex-first key within each group (the ready array is already sorted
      // lex by key, so the Map insertion order preserves the lex-first-group-first order).
      return Array.from(byFeat.values())
    })()

    const wave = []
    const waveTouch = new Set()
    const placedThisWave = []
    for (const group of featureGroupsReady) {
      // Union of ALL touchPoints in this feature group
      const groupTouch = group.flatMap((l) => l.touchPoints || [])
      const conflicts = groupTouch.some((t) => waveTouch.has(t))
      if (conflicts) continue // defer the WHOLE feature group to a later wave
      for (const leaf of group) {
        wave.push(leaf)
        placedThisWave.push(leaf.key)
      }
      for (const t of groupTouch) waveTouch.add(t)
    }
    if (!wave.length) {
      // DEFENSIVE / STRUCTURALLY UNREACHABLE: The Phase-1 collapse of overlapping same-feature
      // sub-tasks into a single leaf guarantees that every lex-first ready group can always
      // place at least its own leaf without a self-conflict. This branch cannot be reached in
      // practice given the current planner invariants; it exists only to guard against a future
      // planner regression that could otherwise cause an infinite loop.
      // Every ready feature group conflicts with the current wave's touchPoint set. Force the
      // ENTIRE first feature group through (the lex-first group; it cannot conflict with itself)
      // to guarantee progress, deferring all other groups to the next wave.
      const firstGroup = featureGroupsReady[0]
      for (const leaf of firstGroup) {
        wave.push(leaf)
        placedThisWave.push(leaf.key)
      }
      // Register this forced group's touchPoints so any remaining capacity added in a future
      // extension of this loop body cannot place a conflicting leaf in the same wave.
      for (const t of firstGroup.flatMap((l) => l.touchPoints || [])) waveTouch.add(t)
    }
    const waveI = waves.length
    for (const k of placedThisWave) { doneWave.set(k, waveI); remaining.delete(k) }
    waves.push(wave)
  }

  // Any leaves left unplaced are part of a dependency cycle — append them as a final wave so the
  // plan is total (the build agents will surface the cycle as a blocker rather than silently drop).
  if (remaining.size) {
    const leftover = Array.from(remaining).sort().map((k) => byKey.get(k))
    waves.push(leftover)
    for (const l of leftover) doneWave.set(l.key, waves.length - 1)
  }

  return { waves, collapses }
}

// ── Test sentinel early-out: expose the pure helpers and STOP before any orchestration. ──
// spec-loop.smoke.mjs sets globalThis.__SPEC_LOOP_TEST__ then executes this body with no-op
// stub globals; we assign the helpers and return so no phase()/agent()/workflow() ever runs.
if (typeof globalThis !== 'undefined' && globalThis.__SPEC_LOOP_TEST__) {
  globalThis.__SPEC_LOOP_TEST__.routeFromTable = routeFromTable
  globalThis.__SPEC_LOOP_TEST__.planWaves = planWaves
  globalThis.__SPEC_LOOP_TEST__.uniqueRouterDomains = uniqueRouterDomains
  globalThis.__SPEC_LOOP_TEST__.ROUTE = ROUTE
  return { test: true }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ORCHESTRATION (live agents; never reached under the test sentinel)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// --- defensive args (a stringified payload silently loses scope on the first real run) ---
const A = (args && typeof args === 'object') ? args : (typeof args === 'string' && args.trim() ? JSON.parse(args) : {})
const EPIC = A.epic || {}
const PROJ = A.project || {}
const NAME = PROJ.name || 'this project'
const SPEC = PROJ.specFile || 'spec.md'
const BUILD = PROJ.buildCmd || 'npm run build'
const TEST = PROJ.testCmd || 'npm test'
const REPO = PROJ.repo || null
const EPIC_BRANCH = EPIC.branch || 'epic/main'
const MAIN_REF = EPIC.parentRef || 'origin/main'
const AUTONOMOUS = A.autonomous !== false           // default true
const PLAN_ONLY = A.planOnly === true
// Per-feature liveValidate scoping. With no liveValidateFeatures arg this returns A.liveValidate
// for every feature — IDENTICAL prompts to the legacy behavior, so existing journal caches stay
// valid. With the arg, only the named features get live-validation in their build prompts and
// council bars (pre-deploy features otherwise can never satisfy the arbiter's unconditional bar).
const LV_FEATS = Array.isArray(A.liveValidateFeatures) ? new Set(A.liveValidateFeatures) : null
const lvFor = (featureKey) => (LV_FEATS ? LV_FEATS.has(featureKey) : A.liveValidate)
const ROUTE_OVERRIDES = (A.routeOverrides && typeof A.routeOverrides === 'object') ? A.routeOverrides : {}
// council-loop is referenced by ABSOLUTE scriptPath: the name registry does NOT resolve
// ~/.claude/workflows/*.mjs (only built-ins), so workflow('council-loop') errors. The driver
// passes workflowsDir so the path is OS-correct without hardcoding the vault root; fall back to
// the Arch default. (An absolute path is unambiguous — a relative one resolves against project cwd.)
// Default: <home>/.claude/workflows. Pass args.workflowsDir to override.
const WF_DIR = (A.workflowsDir || ((typeof process !== 'undefined' && process.env && (process.env.HOME || process.env.USERPROFILE)) || '') + '/.claude/workflows').replace(/\/+$/, '')
// Warn when the Arch-specific default path is used: a cross-platform caller that omits workflowsDir
// will get a downstream council-loop-not-found error. Surface it early so it is easy to diagnose.
// Hardening options (LOW — the Arch default covers the owner's box; all known callers pass workflowsDir):
//   (a) Throw early:  if (!A.workflowsDir) { const e = new Error('spec-loop: workflowsDir is required'); e.limit = false; throw e }
//   (b) Return resumable: if (!A.workflowsDir) return { ...RESUMABLE('workflowsDir not supplied — pass workflowsDir to locate council-loop.mjs'), resumable: true }
//   (c) Derive portably: detect vault root via `git rev-parse --show-toplevel` from a one-shot agent — but that requires an agent() call at the top of orchestration, before any phase().
// Current behaviour (c): log the warning and continue; the downstream workflow() call will surface a
// clear "file not found" error if the default path is wrong, which is diagnosable from the run log.
if (!A.workflowsDir) log(`spec-loop: workflowsDir not supplied — falling back to default ${WF_DIR}; pass workflowsDir explicitly for portability across platforms`)

// per-role model overrides (opus where the spec mandates deepest reasoning; sonnet default otherwise).
// NOTE: 'build' and 'validate' are intentionally absent — build agents use leaf.model (from routing),
// not a global override, so a driver passing {model:{build:'opus'}} would be silently ignored.
// 'merge' is the intra-feature sub-task merge agent. Only three orchestration-level roles exist here.
const MODELS = Object.assign(
  { decompose: 'opus', router: 'sonnet', merge: 'sonnet' },
  A.model || {})

// fan-out cap: maxParallel arg, else runtime min(16, cores-2). Core count is read defensively from
// whatever the sandbox happens to expose (navigator.hardwareConcurrency in a web-ish runtime; we do
// NOT require()/import the 'os' module — workflow bodies avoid real I/O). Defaults to 8 cores (→ cap
// 6) when no signal is available, so the fan-out is reasonable without over-subscribing an unknown box.
const cores = (() => {
  try {
    const hc = (typeof globalThis !== 'undefined' && globalThis.navigator && globalThis.navigator.hardwareConcurrency)
    return (typeof hc === 'number' && hc > 0) ? hc : 8
  } catch { return 8 }
})()
const MAX_PARALLEL = (A.maxParallel !== undefined && A.maxParallel !== null)
  ? Math.max(1, A.maxParallel)
  : Math.min(16, Math.max(1, cores - 2))

// --- limit-aware retry + resumable stop (COPIED pattern from feature-loop.mjs, not imported) ---
// Backs off on transient blips (529/overloaded/timeout) but BAILS FAST on a hard usage/rate limit
// (retrying inside a blocked window is futile). A hard limit throws { limit:true }, caught at a
// safe boundary to return { resumable:true } — resume via resumeFromRunId, which replays completed
// agent() calls from cache (the deterministic wave planner re-runs in pure JS) so only the
// unfinished wave re-runs live.
let limitHit = false
const LIMIT_RE = /(429|rate[ _-]?limit|usage limit|session limit|quota|too many requests|insufficient_quota|limit (?:reached|exceeded))/i
const sleep = (typeof setTimeout === 'function') ? (ms) => new Promise((r) => setTimeout(r, ms)) : () => Promise.resolve()
async function tryAgent(prompt, opts, retries = 2) {
  let last
  for (let i = 0; i <= retries; i++) {
    try { return await agent(prompt, opts) }
    catch (e) {
      last = e
      const msg = String((e && e.message) || e)
      if (LIMIT_RE.test(msg)) {                          // hard limit — stop, don't burn retries
        limitHit = true
        log(`agent ${(opts && opts.label) || ''} hit a usage/rate limit — stopping for resume: ${msg.slice(0, 120)}`)
        const le = new Error(`LIMIT: ${msg}`); le.limit = true; throw le
      }
      log(`agent ${(opts && opts.label) || ''} attempt ${i + 1}/${retries + 1} failed: ${msg.slice(0, 140)}`)
      if (i < retries) await sleep(1500 * (i + 1))       // linear backoff (no-op if timers unavailable)
    }
  }
  throw last
}
// budget floor: stop before an expensive phase when the turn's token target is nearly spent
const FLOOR = (A.minBudget !== undefined && A.minBudget !== null) ? A.minBudget : 80000
const lowBudget = () => (typeof budget !== 'undefined' && budget && budget.total && typeof budget.remaining === 'function' && budget.remaining() < FLOOR)

// ---------------- Schemas ----------------
// DECOMP_SCHEMA — opus decompose agent output. Each feature has an OPTIONAL disjoint subTasks[]
// (Option C nested shape): when absent/empty the feature is itself the leaf; when present each
// sub-task is a leaf, and the pure wave planner authoritatively enforces touchPoint disjointness.
const SUBTASK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['key', 'title', 'scopeTasks', 'touchPoints', 'briefing'],
  properties: {
    key: { type: 'string' },
    title: { type: 'string' },
    scopeTasks: { type: 'array', items: { type: 'string' } },
    touchPoints: { type: 'array', items: { type: 'string' } },
    briefing: { type: 'string' },
    // domain is non-required: a decompose agent may emit it on sub-tasks; allow it to avoid
    // strict-schema validation failures when the LLM overshoots the prompt (the current prompt
    // does not request domain on sub-tasks, but LLMs sometimes mirror the parent's domain field).
    domain: { type: 'string' },
  },
}
const DECOMP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['features'],
  properties: {
    features: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['key', 'title', 'scopeTasks', 'deps', 'touchPoints', 'domain', 'briefing'],
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          scopeTasks: { type: 'array', items: { type: 'string' } },
          deps: { type: 'array', items: { type: 'string' } },
          touchPoints: { type: 'array', items: { type: 'string' } },
          domain: { type: 'string' },
          briefing: { type: 'string' },
          subTasks: { type: 'array', items: SUBTASK_SCHEMA },
        },
      },
    },
    notes: { type: 'string' },
  },
}
// ROUTE_SCHEMA — the LLM fallback router output for ONE unclassified domain.
const ROUTE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['agentType', 'model', 'rationale'],
  properties: {
    agentType: { type: 'string' },
    model: { type: 'string', enum: ['sonnet', 'opus', 'haiku'] },
    rationale: { type: 'string' },
  },
}
// IMPL_SCHEMA — reused shape from feature-loop.mjs for the per-leaf build agents.
const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'filesChanged', 'buildPassed'],
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    depsAdded: { type: 'array', items: { type: 'string' } },
    buildPassed: { type: 'boolean' },
    scopeKept: { type: 'boolean' },
    notes: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
    branch: { type: 'string' },
  },
}
// MERGE_SCHEMA — intra-feature sub-task → one-feature-branch merge agent.
const SUBMERGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['merged', 'featureBranch'],
  properties: {
    merged: { type: 'boolean' },
    featureBranch: { type: 'string' },
    mergedBranches: { type: 'array', items: { type: 'string' } },
    conflict: { type: 'boolean' },
    output: { type: 'string' },
  },
}

const ENV = A.envNote ? `\nEnvironment: ${A.envNote}` : ''
const EXTRA = A.extraRules ? `\n- ${A.extraRules}` : ''

/**
 * Build the project rules block injected into every build agent prompt. Mirrors the working
 * agreement used by feature-loop.mjs / council-loop.mjs (immutability, small files, no console.log,
 * commit semantically + push, never merge/rebase). Pure string builder.
 * @param {string} parentRef - the branch this leaf builds on top of (dependencies already merged there)
 * @returns {string} the rules block
 */
function rulesBlock(parentRef) {
  return `
Project rules you MUST follow:
- Immutability: never mutate inputs; return new objects/arrays.
- Many small focused files; JSDoc/types on exported APIs. No console.log in committed code.
- Validate inputs at boundaries; never trust client data. No hardcoded secrets (env vars + .env.example only).
- Preserve existing UX/visual treatment unless the feature explicitly changes it.
- If you add deps, update the lockfile (CI runs a clean install). Do NOT edit version files (CI bumps on merge).
- When your change builds clean, stage it and commit with a semantic conventional-commit message (feat/fix/refactor/...) describing THIS work, then push your branch. If there is nothing to commit (already committed on a prior attempt), do NOT error — skip the commit and ensure the branch is pushed (\`git push --force-with-lease\`). Do NOT merge or rebase, and do NOT create issues — prior features are already-merged dependencies in ${parentRef}.${EXTRA}`
}

/**
 * Build the scope-guarded prompt for one build leaf. Names EXACTLY this leaf's scopeTasks and
 * forbids building other features. Pure string builder.
 * @param {object} leaf - a planned leaf { key, title, scopeTasks, touchPoints, briefing, branch, agentType, model, domain }
 * @returns {string} the build prompt
 */
function buildPrompt(leaf) {
  const scope = Array.isArray(leaf.scopeTasks) ? leaf.scopeTasks.join(', ') : String(leaf.scopeTasks || '')
  const touch = Array.isArray(leaf.touchPoints) ? leaf.touchPoints.join(', ') : ''
  return `Implement leaf ${leaf.key}: ${leaf.title} FULLY for ${NAME}. You run in your OWN fresh git worktree (isolation handles creation) — operate ONLY there, on the branch ${leaf.branch}.
SCOPE GUARD (critical): implement ONLY this leaf — spec tasks ${scope}. Do NOT build other features. If the work seems to require another feature's code, treat that as a dependency already merged into ${EPIC_BRANCH} if present (read it, build on it) — do NOT re-implement it. If a genuine gap blocks you, STOP and report it as a blocker rather than expanding scope.
Briefing: ${leaf.briefing || leaf.title}${ENV}
Touch points (files/modules to add or change): ${touch || '(infer from the spec)'}
Steps: (1) read ${SPEC} (the tasks for ${scope}) + the touch-point files; build on existing code. (2) Implement working code — no stubs/TODOs; cover the acceptance criteria for ${scope}. (3) Run \`${BUILD}\` and fix every error.${lvFor(leaf.feature) ? ' (4) Validate against the real backend per the project note.' : ''}
${rulesBlock(EPIC_BRANCH)}
After the build passes, commit semantically and push your branch ${leaf.branch}. Report filesChanged, buildPassed, scopeKept, branch (echo ${leaf.branch}), and any blockers.`
}

// --- resumable accumulators: progressively filled; referenced by the resumable-stop return ---
let decomp = null
let routedLeaves = null
let planResult = null
let waveIdx = 0
const builds = []
const councils = []
let epicCouncil = null
// Defensive Set guard: tracks feature keys that have been councilled so far. The planner's
// atomic same-feature-in-one-wave invariant structurally prevents a feature from appearing in
// featureBranches twice, so this guard should never trigger in practice; it exists to catch a
// future planner regression or unexpected resume-replay duplication without requiring a code audit.
const councilledFeatures = new Set()

/**
 * Build the resumable-stop return. ALWAYS includes waveIdx so a resume log can report
 * "resuming at wave N of M". Mirrors feature-loop.mjs's RESUMABLE() pattern.
 * @param {string} why - the human-readable stop reason
 * @returns {object} the resumable result
 */
const RESUMABLE = (why) => {
  log(`spec-loop ${EPIC.title || EPIC_BRANCH} stopping (resumable) at wave ${waveIdx}${planResult ? ' of ' + planResult.waves.length : ''}: ${why}`)
  return {
    epic: { issue: EPIC.issue, branch: EPIC_BRANCH, title: EPIC.title },
    features: decomp ? decomp.features : null,
    waves: planResult ? planResult.waves.map((w) => w.map((l) => l.key)) : null,
    waveIdx,
    builds,
    councils,
    epicCouncil,
    merged: false,
    resumable: true,
    reason: `stopped early — ${why}. Resume after limits/budget reset: Workflow({ scriptPath, args, resumeFromRunId }).`,
  }
}

try {
// ═══════════════════════════════════════════════════════════════════════════════════════════
// P1 — Decompose & Route
// ═══════════════════════════════════════════════════════════════════════════════════════════
phase('Decompose')
if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before decompose')
decomp = await tryAgent(
`You are the DECOMPOSE agent for the epic "${EPIC.title || NAME}" (${NAME}). Read the spec file ${SPEC} in this repo and split it into INDEPENDENT features that can be built and reviewed as separate PRs.
For EACH feature produce: key (a short, stable, alphanumeric identifier — e.g. F1, F2; NEVER regenerate or rename keys across runs; every key MUST be globally unique across ALL features AND sub-tasks in this response — a sub-task key such as F1.1 must not collide with any whole-feature key), title, scopeTasks (the spec task IDs this feature owns, e.g. ["T3","T4"]), deps (the keys of OTHER features this one must be built AFTER — empty if independent; each dep string MUST be a key of another feature defined in this same response — do not reference keys that do not appear in the features array), touchPoints (the exact files/modules this feature adds or edits — be precise; this drives parallel-safety), domain (a short domain phrase for routing, e.g. "backend", "frontend", "database", "devops", "documentation"; if unsure give your best guess), and briefing (one paragraph of what/why).
OPTIONALLY split a feature into DISJOINT subTasks[] — only when the sub-tasks edit NON-OVERLAPPING files (their touchPoints must not intersect) AND are order-free (neither needs the other's not-yet-merged code — they build in PARALLEL worktrees off the epic branch in the SAME wave, so a sub-task cannot depend on a sibling's uncommitted work). Each sub-task: key (e.g. F1.1, globally unique across the whole response), title, scopeTasks, touchPoints, briefing. OMIT subTasks if you cannot guarantee BOTH disjoint touchPoints AND no build-order dependency — any doubt means keep the feature as one unit; do not produce a split that requires a sequential ordering the build cannot enforce. The split is advisory — the wave planner will re-collapse any sub-tasks that actually overlap.
Keep features genuinely independent where possible; encode real ordering constraints in deps. Do NOT write code.
Return DECOMP_SCHEMA.`,
  { label: 'decompose', phase: 'Decompose', model: MODELS.decompose, agentType: 'Software Architect', schema: DECOMP_SCHEMA })

const features = (decomp && Array.isArray(decomp.features)) ? decomp.features : []
log(`decompose: ${features.length} features — ${features.map((f) => `${f.key}(${(f.subTasks || []).length} sub)`).join(', ')}`)

// Flatten features → leaves (sub-tasks when present, else the feature itself). IMMUTABLE: build a
// new leaf array; never mutate the decompose result. Each leaf carries its parent feature key.
const rawLeaves = features.flatMap((f) => {
  const subs = Array.isArray(f.subTasks) ? f.subTasks : []
  if (subs.length) {
    return subs.map((s) => ({
      key: s.key,
      feature: f.key,
      title: s.title,
      scopeTasks: s.scopeTasks || [],
      touchPoints: s.touchPoints || [],
      briefing: s.briefing,
      domain: f.domain,
      deps: f.deps || [],   // sub-tasks inherit the parent feature's inter-feature deps
    }))
  }
  return [{
    key: f.key,
    feature: f.key,
    title: f.title,
    scopeTasks: f.scopeTasks || [],
    touchPoints: f.touchPoints || [],
    briefing: f.briefing,
    domain: f.domain,
    deps: f.deps || [],
  }]
})

// ---- Routing assembly: table → LLM fallback (one per unique unclassified domain) → overrides ----
phase('Route')
// Step 1: table lookup. A leaf whose FEATURE key is pinned in routeOverrides is NEVER sent to the
// LLM router (overrides win-always), so exclude it from the unclassified set up front.
const tableRouted = rawLeaves.map((l) => {
  const overridePin = ROUTE_OVERRIDES[l.feature] || ROUTE_OVERRIDES[l.key]
  if (overridePin) return { ...l, _route: null, _pinned: true }
  return { ...l, _route: routeFromTable(l.domain), _pinned: false }
})

// Step 2: LLM fallback — one router agent per UNIQUE domain among unclassified, non-pinned leaves.
const unclassified = tableRouted.filter((l) => !l._pinned && !l._route)
const uniqDomains = uniqueRouterDomains(unclassified)
let domainRoutes = new Map()
if (uniqDomains.length) {
  log(`routing fallback: ${uniqDomains.length} unique unclassified domain(s) → one LLM router each`)
  // a representative leaf per domain gives the router title+briefing context for a null/empty domain.
  const reps = uniqDomains.map((dom) => unclassified.find((l) => domainKey(l.domain) === dom))
  const routerThunks = uniqDomains.map((dom, i) => () => tryAgent(
`You are the AGENT ROUTER. Pick the best agentType + model tier for a build leaf whose domain was not in the static routing table.
Domain (may be empty/unknown): "${dom || '(none)'}"
${dom ? '' : `Because the domain is empty, classify from the leaf's title + briefing instead.\nTitle: ${reps[i] ? reps[i].title : ''}\nBriefing: ${reps[i] ? reps[i].briefing : ''}`}
Choose agentType from the available agent catalog. Full catalog (all valid values): "Senior Developer", "Backend Architect", "Frontend Developer", "Database Optimizer", "DevOps Automator", "Technical Writer", "Security Engineer", "Software Architect", "Code Reviewer", "API Tester", "Agents Orchestrator", "MCP Builder", "Data Engineer", "AI Engineer", "Mobile App Builder", "Embedded Firmware Engineer", "Solidity Smart Contract Engineer", "SRE", "Git Workflow Master", "UX Architect", "UI Designer", "Accessibility Auditor", "Performance Benchmarker", "Rapid Prototyper", "Explore", "Plan", "diagnosis", "pr-review-toolkit:code-reviewer", "pr-review-toolkit:type-design-analyzer", "pr-review-toolkit:code-simplifier". Choose model from {sonnet, opus, haiku}: opus for complex/cross-cutting/architecture/security work, sonnet for normal implementation, haiku only for trivial/search work. Give a one-line rationale.
Return ROUTE_SCHEMA.`,
    { label: `router:${dom || 'none'}`, phase: 'Route', model: MODELS.router, schema: ROUTE_SCHEMA }))
  const routerResults = await parallel(routerThunks)
  if (limitHit) return RESUMABLE('a routing fallback agent hit a usage/rate limit')
  domainRoutes = new Map(uniqDomains.map((dom, i) => {
    const r = routerResults[i]
    if (!r) log(`router domain "${dom || '(none)'}" returned null — falling back to Senior Developer/sonnet`)
    const route = r ? { agentType: r.agentType, model: r.model } : { agentType: 'Senior Developer', model: 'sonnet' }
    return [dom, route]
  }))
}

// Step 3: final assembly — table result, else LLM fallback by domain, then overrides win-always.
// Also escalate router-tagged complex/cross-cutting leaves to opus per the dynamic-model rule.
routedLeaves = tableRouted.map((l) => {
  const overridePin = ROUTE_OVERRIDES[l.feature] || ROUTE_OVERRIDES[l.key]
  let route
  if (overridePin) {
    route = { agentType: overridePin.agentType || 'Senior Developer', model: overridePin.model || 'sonnet' }
  } else if (l._route) {
    route = l._route
  } else {
    route = domainRoutes.get(domainKey(l.domain)) || { agentType: 'Senior Developer', model: 'sonnet' }
  }
  // complex/cross-cutting escalation (only when not explicitly pinned by an override)
  let model = route.model
  if (!overridePin && COMPLEX_DOMAIN_RE.test(String(l.domain || ''))) model = 'opus'
  // Destructuring exclusion: drop _route and _pinned without mutation (spread+delete would mutate
  // the newly created object before returning it; this form makes the immutable intent explicit).
  const { _route: _r, _pinned: _p, ...rest } = l
  return { ...rest, agentType: route.agentType, model, branch: `feature/${l.key}` }
})
log(`routed ${routedLeaves.length} leaves: ${routedLeaves.map((l) => `${l.key}->${l.agentType}/${l.model}`).join(', ')}`)

// ═══════════════════════════════════════════════════════════════════════════════════════════
// P2 — Wave plan (PURE JS) + planOnly/!autonomous gate
// ═══════════════════════════════════════════════════════════════════════════════════════════
phase('Plan')
planResult = planWaves(routedLeaves)
for (const c of planResult.collapses) log(`wave-plan collapse: feature ${c.feature} sub-tasks ${c.mergedKeys.join('+')} — ${c.reason}`)
const planView = {
  waves: planResult.waves.map((w, i) => ({ wave: i, leaves: w.map((l) => ({ key: l.key, feature: l.feature, agentType: l.agentType, model: l.model, touchPoints: l.touchPoints })) })),
  collapses: planResult.collapses,
  maxParallel: MAX_PARALLEL,
}
log(`wave plan: ${planResult.waves.length} wave(s); widths ${planResult.waves.map((w) => w.length).join(',')}; maxParallel ${MAX_PARALLEL}`)

if (PLAN_ONLY || !AUTONOMOUS) {
  log(`${PLAN_ONLY ? 'planOnly' : 'autonomous:false'} — returning the plan, spawning no build agents`)
  return { plan: planView, features, waves: planView.waves, resumable: true, reason: 'plan-only gate — no build agents spawned; re-invoke with autonomous:true (and planOnly:false) to build' }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// P3 — Per wave: BUILD (parallel) → intra-feature merge (serial) → feature council (serial)
// ═══════════════════════════════════════════════════════════════════════════════════════════
for (waveIdx = 0; waveIdx < planResult.waves.length; waveIdx++) {
  const wave = planResult.waves[waveIdx]
  if (limitHit) return RESUMABLE('a usage/rate limit hit before this wave')
  if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before a build wave')
  log(`wave ${waveIdx + 1}/${planResult.waves.length}: building ${wave.length} leaf(s) — ${wave.map((l) => l.key).join(', ')}`)

  // ---- BUILD: parallel worktree agents, one per leaf (capped at MAX_PARALLEL) ----
  phase('Build')
  const builtKeys = []
  for (let off = 0; off < wave.length; off += MAX_PARALLEL) {
    const chunk = wave.slice(off, off + MAX_PARALLEL)
    const thunks = chunk.map((leaf) => () => tryAgent(buildPrompt(leaf), {
      label: `build:${leaf.key}`, phase: 'Build', model: leaf.model, agentType: leaf.agentType, isolation: 'worktree', schema: IMPL_SCHEMA,
    }))
    const results = await parallel(thunks)
    if (limitHit) return RESUMABLE('a build agent hit a usage/rate limit mid-wave')
    // A null result (limit/blip) is filtered + logged; never council/merge an unbuilt leaf.
    results.forEach((r, i) => {
      const leaf = chunk[i]
      if (!r) { log(`build ${leaf.key}: NULL result (limit/blip) — refusing to proceed with an unbuilt leaf`); return }
      builds.push({ key: leaf.key, feature: leaf.feature, branch: leaf.branch, buildPassed: r.buildPassed === true, scopeKept: r.scopeKept !== false, blockers: r.blockers || [] })
      builtKeys.push(leaf.key)
    })
  }
  // if ANY leaf in this wave failed to build (null), stop resumable rather than merging a partial wave.
  if (builtKeys.length !== wave.length) return RESUMABLE(`only ${builtKeys.length}/${wave.length} leaves built in wave ${waveIdx + 1} (limit/blip nulled a build) — refusing a partial wave`)

  // ---- INTRA-FEATURE MERGE: serial agent per feature with >1 sub-task leaf IN THIS WAVE ----
  // Group this wave's built leaves by feature; only features with 2+ sub-task leaves here need a merge.
  phase('Merge')
  const featureGroups = new Map()
  for (const leaf of wave) {
    if (!featureGroups.has(leaf.feature)) featureGroups.set(leaf.feature, [])
    featureGroups.get(leaf.feature).push(leaf)
  }
  const featureBranches = new Map() // feature -> the single branch to council
  for (const [feat, group] of featureGroups) {
    if (group.length <= 1) {
      featureBranches.set(feat, group[0].branch)
      continue
    }
    // T6: serial sub-task → one feature-branch merge (NO per-sub-task council).
    const targetBranch = `feature/${feat}`
    // Sort same-feature leaves by ascending key LOCALLY so the "in this order, by ascending key"
    // merge contract is guaranteed at the point of use, not only by the planner's wave-order
    // invariant (which a future planner change could silently break).
    const subBranches = group
      .slice()
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((l) => l.branch)
    if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before an intra-feature sub-task merge')
    const m = await tryAgent(
`You are the INTRA-FEATURE MERGE agent for feature ${feat} of ${NAME}. Its disjoint sub-tasks built in parallel worktree branches in the same wave; merge them into ONE feature branch. NO council runs per sub-task — that happens once on the merged feature branch.
Target feature branch: ${targetBranch}
Sub-task branches to merge (in this order, by ascending key): ${subBranches.join(', ')}
Do exactly this:
1. Fetch all branches. Create or reset ${targetBranch} from the FIRST sub-task branch (${subBranches[0]}). IDEMPOTENCY (resume-safe): if ${targetBranch} already contains all sub-task commits (\`git log --oneline\`), do NOT re-merge — report merged:true and stop.
2. Merge each remaining sub-task branch into ${targetBranch} serially, in the listed order.
3. The sub-tasks were planned to edit DISJOINT files, so conflicts should be rare. For any file conflict NOT covered by that disjoint check (auto-generated lockfiles, shared config not in touchPoints): PREFER the sub-task with the LATER wave index / later key, OR abort and report conflict:true with the conflicting paths — NEVER silently corrupt the feature branch.
4. Build (\`${BUILD}\`) the merged ${targetBranch}; fix only mechanical merge fallout, commit semantically, and push ${targetBranch}.
Report merged, featureBranch (echo ${targetBranch}), mergedBranches, conflict, and output.
Return SUBMERGE_SCHEMA.`,
      { label: `submerge:${feat}`, phase: 'Merge', model: MODELS.merge, agentType: 'Git Workflow Master', schema: SUBMERGE_SCHEMA })
    // A null merge result (limit/blip that resolved null rather than throwing) means the merge was
    // never confirmed — refuse to council an unverified feature branch (mirrors the build null guard).
    if (!m) {
      log(`intra-feature merge ${feat}: NULL result — refusing to council an unverified feature branch`)
      return RESUMABLE(`intra-feature merge agent for ${feat} returned null — refusing to proceed with an unverified feature branch`)
    }
    if (m && m.conflict) {
      log(`intra-feature merge ${feat} reported a conflict — stopping resumable rather than councilling a corrupt branch`)
      return RESUMABLE(`intra-feature sub-task merge for ${feat} hit a conflict the disjoint check missed`)
    }
    featureBranches.set(feat, (m && m.featureBranch) || targetBranch)
  }

  // ---- FEATURE COUNCIL: serial workflow('council-loop', {merge:true}) per feature in this wave ----
  // Councils run HERE at the orchestrator top level (never inside a build agent — that would
  // violate the one-level workflow() nesting limit). Each feature gets EXACTLY ONE council.
  // The planner's atomic same-feature-in-one-wave invariant structurally prevents a feature from
  // appearing in featureBranches twice; this Set guard is a defensive robustness layer only — it
  // ensures a future planner change or a resume-replay path cannot accidentally double-council.
  phase('Council')
  for (const [feat, branch] of featureBranches) {
    if (councilledFeatures.has(feat)) {
      log(`feature council ${feat}: already councilled in a prior wave — skipping duplicate (planner invariant holds; this guard is defensive only)`)
      continue
    }
    councilledFeatures.add(feat)
    if (limitHit) return RESUMABLE('a usage/rate limit hit before a feature council')
    if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before a feature council')
    const featObj = features.find((f) => f.key === feat) || { key: feat, scopeTasks: [] }
    // Union the parent feature's scopeTasks with any sub-task scopeTasks in this feature's wave
    // group. A decompose agent may place all task IDs on the sub-tasks (leaving the parent's
    // scopeTasks empty), so using the parent alone would produce an empty scope note for the
    // council. The union is always a superset — never loses tasks, never mutates inputs.
    const _parentScope = Array.isArray(featObj.scopeTasks) ? featObj.scopeTasks : []
    const _leafScope = (featureGroups.get(feat) || []).flatMap((l) => Array.isArray(l.scopeTasks) ? l.scopeTasks : [])
    const _allScope = Array.from(new Set([..._parentScope, ..._leafScope]))
    const scopeTasks = _allScope.length ? _allScope.join(', ') : String(featObj.scopeTasks || '')
    // NOTE: featObj.pr is always undefined — DECOMP_SCHEMA has no `pr` field, so target.pr is
    // always null here and council-loop falls back to target.branch. This is the correct fallback.
    // To pre-wire PR numbers into the council, add a `featurePRs: { [feat]: number }` arg and
    // replace featObj.pr with (A.featurePRs && A.featurePRs[feat]) || undefined.
    const cr = await workflow({ scriptPath: `${WF_DIR}/council-loop.mjs` }, {
      title: `${feat}: ${featObj.title || feat}`,
      target: { branch, parentRef: EPIC_BRANCH, pr: (A.featurePRs && A.featurePRs[feat]) || undefined },
      scope: `Review ONLY feature ${feat} — spec tasks ${scopeTasks}. Treat every OTHER feature as an already-merged dependency in the epic branch ${EPIC_BRANCH}; do not flag pre-existing code outside this feature's diff.`,
      project: { name: NAME, buildCmd: BUILD, testCmd: TEST, specFile: SPEC, repo: REPO },
      liveValidate: lvFor(feat),
      envNote: A.envNote,
      merge: true,                                   // squash-merge the feature into the epic on unconditional FOR
      extraRules: A.extraRules,
      council: A.council,
    })
    const converged = !!(cr && cr.converged)
    const merged = !!(cr && cr.merge && cr.merge.merged)
    councils.push({ feature: feat, branch, converged, merged, resumable: !!(cr && cr.resumable), reason: (cr && cr.reason) || null })
    log(`feature council ${feat}: ${converged ? 'converged' : 'did NOT converge'}${merged ? ' + squash-merged into epic' : ''}`)
    if (cr && cr.resumable) return RESUMABLE(`feature council for ${feat} did not finish (limit/budget) — re-enter to continue the review/merge gate`)
    // HALT-ON-UNMERGED (default ON): later waves build on ${EPIC_BRANCH} assuming every prior
    // feature is already squash-merged there. Continuing past an unconverged/unmerged feature
    // silently builds dependents on the WRONG base (observed 2026-06-10 AutoLLM run: F1 hit
    // maxLoops unconverged, never merged, and F2 was reviewed against an empty epic). Stop
    // resumable so the operator can merge manually or relax council knobs, then resume.
    // Pass haltOnUnmerged:false to restore the old continue-anyway behavior.
    if (A.haltOnUnmerged !== false && !converged) {
      return RESUMABLE(`feature council for ${feat} ended WITHOUT convergence (${(cr && cr.reason) || 'no reason reported'}) — refusing to build later waves on an epic missing this feature. Merge ${branch} manually or adjust council knobs (e.g. requireUnconditional:false), then resume`)
    }
    if (A.haltOnUnmerged !== false && !merged) {
      const mout = (cr && cr.merge && cr.merge.output) ? String(cr.merge.output).slice(0, 160) : 'merge blocked or skipped'
      return RESUMABLE(`feature ${feat} converged but did NOT squash-merge into ${EPIC_BRANCH} (${mout}) — resolve the merge blocker, then resume`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// P4 — Epic council + auto-merge to origin/main
// ═══════════════════════════════════════════════════════════════════════════════════════════
phase('Epic')
if (limitHit) return RESUMABLE('a usage/rate limit hit before the epic council')
if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before the epic council')
epicCouncil = await workflow({ scriptPath: `${WF_DIR}/council-loop.mjs` }, {
  title: `Epic: ${EPIC.title || NAME}`,
  target: { branch: EPIC_BRANCH, parentRef: MAIN_REF, pr: EPIC.pr },
  scope: `integration: review the WHOLE epic ${EPIC_BRANCH} as it will land on ${MAIN_REF}. Focus on cross-feature integration — feature contracts line up, no duplication, no regressions across the combined diff. Individual features were already councilled per-PR; do not re-litigate intra-feature nits.`,
  project: { name: NAME, buildCmd: BUILD, testCmd: TEST, specFile: SPEC, repo: REPO },
  liveValidate: A.liveValidate,
  envNote: A.envNote,
  // epicMerge defaults true (unchanged behavior: squash-merge the epic into main on unconditional
  // FOR). Pass epicMerge:false to run the epic council to unconditional FOR but HOLD the epic→main
  // merge for a human to land manually (feature→epic assembly merges are unaffected).
  merge: A.epicMerge !== false,
  extraRules: A.extraRules,
  council: Object.assign({}, A.council, { model: Object.assign({ arbiter: 'opus' }, (A.council && A.council.model) || {}) }),
})
} catch (e) {
  if (e && e.limit) return RESUMABLE('usage/rate limit')
  // An unexpected exception (schema/serialization/runtime error) thrown deep inside a wave would
  // normally propagate raw, losing accumulated builds/councils/waveIdx context. Instead, log the
  // partial state and re-throw so the caller still sees the error but the workflow log captures
  // exactly where the run stopped. The RESUMABLE() call is informational — it logs the context.
  // We do NOT return RESUMABLE() here because an unexpected throw is NOT safely resumable (the
  // partial state may be corrupt); however, the log entry lets a human diagnose from the run log.
  RESUMABLE(`unexpected exception at wave ${waveIdx}: ${String((e && e.message) || e).slice(0, 200)}`)
  throw e
}

if (epicCouncil && epicCouncil.resumable) return RESUMABLE('epic council-loop did not finish (limit/budget) — re-enter to continue the review/merge gate')

const epicConverged = !!(epicCouncil && epicCouncil.converged)
const epicMerged = !!(epicCouncil && epicCouncil.merge && epicCouncil.merge.merged)
log(`epic council: ${epicConverged ? 'converged' : 'did NOT converge'}${epicMerged ? ' + squash-merged into main' : ''}`)

return {
  epic: { issue: EPIC.issue, branch: EPIC_BRANCH, title: EPIC.title },
  features: (decomp && decomp.features) || [],
  waves: planResult ? planResult.waves.map((w) => w.map((l) => l.key)) : [],
  builds,
  councils,
  epicCouncil,
  merged: epicMerged,
  resumable: false,
  reason: epicMerged
    ? 'all features councilled + merged into the epic; epic council reached unconditional FOR and squash-merged into main'
    : epicConverged
      ? 'epic council converged but did not squash-merge (verify reported not mergeable or merge blocked) — inspect epicCouncil'
      : 'epic council did not converge — inspect epicCouncil.council.finalVerdict',
}
