/**
 * feature-loop.js — reusable per-feature build pipeline (background Workflow).
 *
 * One invocation builds ONE feature end to end:
 *   Brainstorm → Spec → Implement → (Live-validate) → Council (delegated) → Merge (delegated)
 *
 * Sequencing: the phases above are sequential (each depends on the prior).
 * Parallelism: lives inside the delegated council-loop (advocate ∥ critic). Cross-FEATURE
 * parallelism is the DRIVER's job (separate git worktrees) — see feature-loop.md,
 * because all agents here share one working tree.
 *
 * GIT IS IN SCOPE. Each work phase commits its own change with a semantic conventional-commit
 * message and pushes to update the PR, so the branch carries readable per-step history. The
 * council is delegated to the council-loop workflow, which keeps committing/pushing each fix
 * round and — because we pass `merge: true` — squash-merges into the parent on an unconditional
 * FOR. Scaffolding (creating the issue/branch/PR, version bumps) stays the DRIVER's job; the
 * gh-pr-merge approval hook still applies (allow/approve `gh pr merge --squash` for an
 * unattended merge). Because council-loop runs via the workflow() hook, feature-loop MUST be
 * invoked as a TOP-LEVEL Workflow (the workflow() hook nests one level only).
 *
 * Invoke (from the driver, once per feature, in dependency order). Invoke BY ABSOLUTE scriptPath —
 * the name registry does NOT resolve ~/.claude/workflows/*.mjs (only built-ins like deep-research /
 * code-review), so `{ name: "feature-loop" }` errors "unknown name". An absolute scriptPath resolves
 * the same from any cwd/OS. Pass workflowsDir so the nested council-loop path is OS-correct without
 * hardcoding the vault root:
 *   Workflow({ scriptPath: "<abs>/feature-loop.mjs", args: { ...FEATURE, workflowsDir: "<abs>" } })
 *
 * FEATURE = {
 *   key, issue, branch, parentRef, pr,        // identity (parentRef e.g. "origin/epic/1-..."; pr optional, used for the merge)
 *   workflowsDir,                             // optional: abs dir holding council-loop.mjs (default /absolute/path/to/.claude/workflows)
 *   title, scopeTasks, briefing,              // what to build (scopeTasks e.g. "T6, T6.1")
 *   agentType, model,                         // implement routing (default Senior Developer / sonnet)
 *   domain,                                   // optional: when agentType/model are omitted, this is hybrid-routed via the ROUTE table (e.g. "backend", "frontend", "database")
 *   project: { name, specFile, buildCmd, testCmd },
 *   liveValidate,                             // optional: instructions to prove behavior on a REAL backend
 *   envNote,                                  // optional: env/setup note (e.g. how to start a local DB or service)
 *   council,                                  // optional: knobs forwarded to council-loop (advocates, critics, questioner, rounds, maxLoops, ...)
 *   review,                                   // optional: 'council' (default, full adversarial loop) | 'budget' (ONE review pass → ≤1 fix round → re-check; never merges) | 'none' (skip review; never merges)
 *   merge,                                    // optional: set false to stop at converged (no squash-merge) and let the driver merge
 *   extraRules,                               // optional: project-specific rules appended
 * }
 */

export const meta = {
  name: 'feature-loop',
  description: 'Build one feature: brainstorm → spec → implement (semantic commit+push) → live-validate → delegate to council-loop (review/fix/commit → unconditional FOR → verify → squash-merge)',
  phases: [
    { title: 'Brainstorm', detail: 'questioner surfaces decisions; answerer resolves them with web research + recommended defaults' },
    { title: 'Spec', detail: 'turn decisions + scope into a crisp feature spec (acceptance criteria, touch points, test plan)' },
    { title: 'Implement', detail: 'routed specialist implements ONLY this feature, then commits semantically and pushes to update the PR' },
    { title: 'Validate', detail: 'optional: stand up the real backend and PROVE behavior, committing any fixes (no trusting unit tests alone)' },
    { title: 'Council', detail: 'delegates to the council-loop workflow: advocate ∥ critic + arbiter, fix+commit+push each round until unconditional FOR, verify, then squash-merge' },
  ],
}

// --- defensive args (a stringified payload silently lost scope on the first real run) ---
const F = typeof args === 'string' ? JSON.parse(args) : (args || {})
const PROJ = F.project || {}
const NAME = PROJ.name || 'this project'
const SPEC = PROJ.specFile || 'spec.md'
const BUILD = PROJ.buildCmd || 'npm run build'
const TEST = PROJ.testCmd || 'npm test'
const PARENT = F.parentRef || 'origin/main'

// --- hybrid auto-routing: derive {agentType, model} from the feature's domain when the driver
// omits them. The ROUTE table + routeFromTable() are DUPLICATED INLINE here (workflow scripts
// cannot import each other — same source of truth as spec-loop.mjs's ROUTE: the agent-route skill
// at ~/.claude/skills/agent-route/SKILL.md + references/agent-catalog.md; keep both copies in
// sync). When agentType AND model are BOTH supplied, the table is bypassed and behaviour is
// unchanged from prior runs; a partial override fills only the missing field. There is NO LLM
// fallback here (a single-feature run should not pay for a router call) — an unclassified domain
// falls back to the prior defaults (Senior Developer / sonnet).
const ROUTE = Object.freeze({
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
/**
 * Resolve a domain string to {agentType, model} from the static ROUTE table, with NO LLM call.
 * Case-insensitive; tries an exact key match, then the longest substring-containment match.
 * Returns a fresh object, or null when the domain is absent/empty/unclassified.
 * @param {string|null|undefined} domain - the feature's domain field
 * @returns {{agentType: string, model: string}|null}
 */
function routeFromTable(domain) {
  if (domain === null || domain === undefined) return null
  const d = String(domain).trim().toLowerCase()
  if (!d) return null
  if (Object.prototype.hasOwnProperty.call(ROUTE, d)) {
    const hit = ROUTE[d]
    return { agentType: hit.agentType, model: hit.model }
  }
  let best = null, bestLen = 0
  for (const key of Object.keys(ROUTE)) {
    if ((d.includes(key) || key.includes(d)) && key.length > bestLen) { best = ROUTE[key]; bestLen = key.length }
  }
  return best ? { agentType: best.agentType, model: best.model } : null
}
// Domain classes that should escalate to opus even when the table picks a cheaper tier:
// complex / cross-cutting work benefits from the deepest reasoning per the dynamic-model rule.
// (Mirrored from spec-loop.mjs; kept in sync as both are inline-duplicated, not imported.)
const COMPLEX_DOMAIN_RE = /(architect|orchestrat|cross.?cutting|system design|security|distributed|migration|refactor)/i
// derive the route ONLY for the fields the driver did not supply (explicit args win unchanged).
const _route = (F.agentType && F.model) ? null : routeFromTable(F.domain)
// apply complex-domain escalation to opus when the table resolved a cheaper model tier and the
// caller did not explicitly pin a model (explicit F.model always wins; this is auto-routing only).
const _routeModel = (_route && !F.model && COMPLEX_DOMAIN_RE.test(String(F.domain || ''))) ? 'opus' : (_route && _route.model)
const MODEL = F.model || _routeModel || 'sonnet'
const AGENT = F.agentType || (_route && _route.agentType) || 'Senior Developer'
// review gate mode: 'council' (default) runs the full council-loop; 'budget' runs ONE review
// pass + at most ONE fix round + ONE re-check (no advocate/arbiter, no loops); 'none' skips.
// budget/none never merge — merging lives in council-loop only.
const REVIEW = (F.review === 'budget' || F.review === 'none') ? F.review : 'council'
// council-loop is referenced by ABSOLUTE scriptPath: the name registry does NOT resolve
// ~/.claude/workflows/*.mjs (only built-ins), so workflow('council-loop') errors. The driver
// passes workflowsDir so the path is OS-correct without hardcoding the vault root; fall back to
// the Arch default. (An absolute path is unambiguous — unlike a relative one, it never resolves
// against the project cwd.)
// Default: <home>/.claude/workflows. Pass args.workflowsDir to override.
const WF_DIR = (F.workflowsDir || ((typeof process !== 'undefined' && process.env && (process.env.HOME || process.env.USERPROFILE)) || '') + '/.claude/workflows').replace(/\/+$/, '')
// Warn when the Arch-specific default path is used: a cross-platform caller that omits workflowsDir
// will get a downstream council-loop-not-found error. Surface it early so it is easy to diagnose.
if (!F.workflowsDir) log(`feature-loop: workflowsDir not supplied — falling back to default ${WF_DIR}; pass workflowsDir explicitly for portability across platforms`)

// --- limit-aware retry + resumable stop ----------------------------------------------------
// Backs off on transient blips (529/overloaded/timeout) but BAILS FAST on a hard usage/rate
// limit (retrying inside a blocked window is futile). A hard limit throws { limit:true }, caught
// at the phase boundary to return { resumable:true } — resume via resumeFromRunId, which replays
// completed agent() calls from cache so only the unfinished phase re-runs live.
let limitHit = false
const LIMIT_RE = /(429|rate[ _-]?limit|usage limit|session limit|quota|too many requests|insufficient_quota|limit (?:reached|exceeded))/i
const sleep = (typeof setTimeout === 'function') ? (ms) => new Promise(r => setTimeout(r, ms)) : () => Promise.resolve()
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
const FLOOR = (F.minBudget !== undefined && F.minBudget !== null) ? F.minBudget : 80000
const lowBudget = () => (typeof budget !== 'undefined' && budget && budget.total && typeof budget.remaining === 'function' && budget.remaining() < FLOOR)

// --- hard scope guard: the #1 lesson — do NOT let one feature become the whole spec ---
const SCOPE = `SCOPE GUARD (critical): implement ONLY feature ${F.key} — spec tasks ${F.scopeTasks}. Do NOT build other features. If the work seems to require another feature's code, treat that as an already-merged dependency in ${PARENT} (read it, build on it) — do NOT re-implement it. If a genuine gap blocks you, STOP and report it as a blocker rather than expanding scope.`

const ENV = F.envNote ? `\nEnvironment: ${F.envNote}` : ''
const RULES = `
Project rules you MUST follow:
- Immutability: never mutate inputs; return new objects/arrays.
- Many small focused files; JSDoc/types on exported APIs. No console.log in committed code.
- Validate inputs at boundaries; never trust client data. No hardcoded secrets (env vars + .env.example only).
- Preserve existing UX/visual treatment unless the feature explicitly changes it.
- If you add deps, update the lockfile (CI runs a clean install). Do NOT edit version files (CI bumps on merge).
- When your change builds clean, stage it and commit with a semantic conventional-commit message (feat/fix/refactor/...) describing THIS work, then push to update the PR. If there is nothing to commit (already committed on a prior attempt), do NOT error — skip the commit and ensure the branch is pushed (\`git push --force-with-lease\`). Do NOT merge or rebase, and do NOT create issues or new branches — the council squash-merges on approval.${F.extraRules ? '\n- ' + F.extraRules : ''}`

// ---------------- Schemas ----------------
const QUESTIONS_SCHEMA = { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic', 'options', 'recommendation'], properties: { topic: { type: 'string' }, options: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['option', 'tradeoff'], properties: { option: { type: 'string' }, tradeoff: { type: 'string' } } } }, recommendation: { type: 'string' } } } } } }
const DECISIONS_SCHEMA = { type: 'object', additionalProperties: false, required: ['decisions'], properties: { decisions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic', 'decision', 'rationale'], properties: { topic: { type: 'string' }, decision: { type: 'string' }, rationale: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } } } }, openRisks: { type: 'array', items: { type: 'string' } } } }
const SPEC_SCHEMA = { type: 'object', additionalProperties: false, required: ['acceptanceCriteria', 'touchPoints'], properties: { summary: { type: 'string' }, acceptanceCriteria: { type: 'array', items: { type: 'string' } }, touchPoints: { type: 'array', items: { type: 'string' } }, testPlan: { type: 'array', items: { type: 'string' } }, outOfScope: { type: 'array', items: { type: 'string' } } } }
const IMPL_SCHEMA = { type: 'object', additionalProperties: false, required: ['summary', 'filesChanged', 'buildPassed'], properties: { summary: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } }, depsAdded: { type: 'array', items: { type: 'string' } }, buildPassed: { type: 'boolean' }, scopeKept: { type: 'boolean' }, notes: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VALIDATE_SCHEMA = { type: 'object', additionalProperties: false, required: ['checks'], properties: { checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['check', 'result'], properties: { check: { type: 'string' }, result: { type: 'string', enum: ['pass', 'fail', 'skipped'] }, detail: { type: 'string' } } } }, filesFixed: { type: 'array', items: { type: 'string' } }, residualRisks: { type: 'array', items: { type: 'string' } } } }
const BUDGET_REVIEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['blockers'], properties: { summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['where', 'issue', 'whyBlocking'], properties: { where: { type: 'string' }, issue: { type: 'string' }, whyBlocking: { type: 'string' } } } }, nonBlockers: { type: 'array', items: { type: 'string' } } } }
const BUDGET_RECHECK_SCHEMA = { type: 'object', additionalProperties: false, required: ['allFixed', 'testsPassed'], properties: { allFixed: { type: 'boolean' }, testsPassed: { type: 'boolean' }, remaining: { type: 'array', items: { type: 'string' } } } }

// --- resumable accumulators: progressively filled; referenced by the resumable-stop return ---
let decisions = null, spec = null, impl = null, validate = null, councilResult = null
const RESUMABLE = (why) => {
  log(`feature-loop ${F.key} stopping (resumable): ${why}`)
  return { feature: F.key, issue: F.issue, branch: F.branch, decisions, spec, impl, validate, council: councilResult, converged: false, merged: false, resumable: true, reason: `stopped early — ${why}. Resume after limits/budget reset: Workflow({ scriptPath, args, resumeFromRunId }).` }
}

try {
// ---------------- Phase 1: Brainstorm (questioner → answerer w/ research + defaults) ----------------
phase('Brainstorm')
const questions = await tryAgent(
`Non-interactive design brainstorm for ONE feature of ${NAME}.
Feature ${F.key}: ${F.title} | Spec tasks: ${F.scopeTasks}
Briefing: ${F.briefing}
${SCOPE}
Read ${SPEC} (relevant tasks + technical plan + acceptance scenarios) and the current code for the touch points. Surface the 2-4 genuinely consequential design decisions for THIS feature (library/version, data flow, contract shape, error/edge handling). For each give 2-3 options with honest trade-offs and a recommended default. Do NOT write code.`,
  { label: `brainstorm:${F.key}`, phase: 'Brainstorm', model: 'opus', schema: QUESTIONS_SCHEMA })

decisions = await tryAgent(
`Decide each design question below for feature ${F.key}: ${F.title} (${NAME}). Use WebSearch/WebFetch to confirm CURRENT best practice and exact API/version usage for any library or platform involved. Prefer battle-tested defaults; respect the spec's locked decisions. Cite sources you used; note residual risks.
Questions:
${JSON.stringify(questions, null, 2)}
Do NOT write code — decisions only.`,
  { label: `answer:${F.key}`, phase: 'Brainstorm', model: 'opus', schema: DECISIONS_SCHEMA })

// ---------------- Phase 2: Spec (feature spec from decisions) ----------------
phase('Spec')
spec = await tryAgent(
`Produce a crisp FEATURE SPEC for ${F.key}: ${F.title} (${NAME}), grounded in ${SPEC} (tasks ${F.scopeTasks}) and the decisions below. ${SCOPE}
Decisions:
${JSON.stringify(decisions, null, 2)}
Output: acceptance criteria (testable), touch points (files/modules to change or add), a test plan (unit/integration/e2e as appropriate), and an explicit out-of-scope list. Do NOT write code.`,
  { label: `spec:${F.key}`, phase: 'Spec', model: 'opus', schema: SPEC_SCHEMA })

// ---------------- Phase 3: Implement ----------------
phase('Implement')
if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before implement')
impl = await tryAgent(
`Implement feature ${F.key}: ${F.title} FULLY in this repo's working tree (branch ${F.branch}; prior features are already merged into ${PARENT}).
${SCOPE}
Briefing: ${F.briefing}${ENV}
Approved decisions: ${JSON.stringify(decisions)}
Feature spec: ${JSON.stringify(spec)}
Steps: (1) read ${SPEC} + the touch-point files; build on existing code. (2) Implement working code — no stubs/TODOs; cover the acceptance criteria. (3) Run \`${BUILD}\` and fix every error. ${F.liveValidate ? '(4) Apply/validate against the real backend (see Validate phase note).' : ''}
${RULES}
Report what you changed and confirm you stayed in scope.`,
  { label: `impl:${F.key}`, phase: 'Implement', model: MODEL, agentType: AGENT, schema: IMPL_SCHEMA })

// ---------------- Phase 4: Validate (optional, real backend) — the lesson: unit tests aren't enough ----------------
if (F.liveValidate) {
  phase('Validate')
  if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before live-validate')
  validate = await tryAgent(
`Validate feature ${F.key} against a REAL running backend (not mocks). ${F.envNote ? 'Env: ' + F.envNote : ''}
Prove each behavior below by actually exercising it; fix defects you find (code/SQL/config), then re-run.
${F.liveValidate}
If you fixed anything, commit it with a semantic message (e.g. \`fix: live-validation fixes for ${F.key}\`) and push to update the PR. Do NOT merge.
Report pass/fail per check, files fixed, residual risk.`,
    { label: `validate:${F.key}`, phase: 'Validate', model: F.model || 'sonnet', agentType: AGENT, schema: VALIDATE_SCHEMA })
  // agent() returns null (not a throw) when the subagent dies terminally (e.g. session limit
  // mid-run) — treat as resumable, NOT as a passed validation.
  if (!validate) return RESUMABLE('live-validate agent died (limit/terminal error) — resume to re-run validate')
}

// ---------------- Phase 5: Review gate (review: 'council' | 'budget' | 'none') ----------------
// 'council' (default) delegates to council-loop: review → fix in-PR (commit+push each round) →
// re-review → Verify → (merge:true) squash-merge; converged ONLY on an unconditional FOR.
// 'budget' is the cheap gate: ONE review pass → at most ONE fix round → ONE re-check. No
// advocate/arbiter, no loops, never merges. 'none' skips review entirely (converged by fiat).
if (REVIEW === 'none') {
  log(`feature-loop ${F.key}: review skipped (review:"none") — no merge`)
  councilResult = { converged: true, skipped: true, reason: 'review skipped via review:"none"' }
} else if (REVIEW === 'budget') {
  phase('Council')
  if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before budget review')
  const review = await tryAgent(
`Single-pass code review of feature ${F.key}: ${F.title} (${NAME}) on branch ${F.branch}.
Review ONLY this feature's diff vs ${PARENT} (\`git diff ${PARENT}...HEAD\`) — spec tasks ${F.scopeTasks}. Treat other features as already-merged dependencies; do not flag pre-existing code outside this diff.
Report BLOCKERS only: correctness, security, or data-loss defects that must be fixed before merge — each with file:line ("where") and why it blocks. Style, naming, nits, refactor ideas and feature suggestions go to nonBlockers (informational only; they will NOT be applied). Run \`${BUILD}\` and \`${TEST}\` and treat failures as blockers. This is the ONLY review round — be thorough but proportionate.`,
    { label: `review:${F.key}`, phase: 'Council', model: 'sonnet', schema: BUDGET_REVIEW_SCHEMA })
  // null = reviewer died terminally (e.g. session limit) — never treat as "no blockers".
  if (!review) return RESUMABLE('budget review agent died (limit/terminal error) — resume to re-run review')
  let fix = null, recheck = null
  const blockers = (review && review.blockers) || []
  if (blockers.length) {
    if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before budget fix round')
    fix = await tryAgent(
`Fix ONLY these blocking review findings for feature ${F.key} on branch ${F.branch} — nothing else (non-blockers are informational and must NOT be applied):
${JSON.stringify(blockers, null, 2)}
${RULES}`,
      { label: `fix:${F.key}`, phase: 'Council', model: MODEL, agentType: AGENT, schema: IMPL_SCHEMA })
    recheck = await tryAgent(
`Verify each blocker below is actually fixed on branch ${F.branch}: read the code at the cited locations and run \`${BUILD}\` and \`${TEST}\`. Do NOT re-review the whole feature — check only these findings.
${JSON.stringify(blockers, null, 2)}`,
      { label: `recheck:${F.key}`, phase: 'Council', model: 'sonnet', schema: BUDGET_RECHECK_SCHEMA })
  }
  const budgetOk = blockers.length === 0 || !!(recheck && recheck.allFixed && recheck.testsPassed)
  councilResult = { converged: budgetOk, budget: true, review, fix, recheck, reason: budgetOk ? (blockers.length ? `${blockers.length} blocker(s) fixed in one round` : 'no blockers found') : 'blockers remain after the single budget fix round — escalate to review:"council" or fix manually' }
} else {
phase('Council')
// Reference council-loop by ABSOLUTE scriptPath (WF_DIR), NOT by name: meta.name is only a
// display/journal label for user workflows — the registry resolves names only for built-ins, so
// workflow('council-loop') errors. An absolute path resolves the same from any cwd/OS (only a
// RELATIVE scriptPath would resolve against the project cwd). council-loop is a leaf (no nested
// workflow() calls), so feature-loop → council-loop stays within the one-level nesting limit.
if (lowBudget()) return RESUMABLE('turn token budget nearly exhausted before council')
councilResult = await workflow({ scriptPath: `${WF_DIR}/council-loop.mjs` }, {
  title: `${F.key}: ${F.title}`,
  target: { branch: F.branch, parentRef: PARENT, pr: F.pr },
  scope: `Review ONLY feature ${F.key} — spec tasks ${F.scopeTasks}. Treat other features as already-merged dependencies in ${PARENT}; do not flag pre-existing code outside this feature's diff.`,
  project: { name: NAME, buildCmd: BUILD, testCmd: TEST, specFile: SPEC },
  liveValidate: F.liveValidate,
  envNote: F.envNote,
  agentType: AGENT,
  merge: F.merge !== false,
  extraRules: F.extraRules,
  council: F.council,
})
}
} catch (e) {
  if (e && e.limit) return RESUMABLE('usage/rate limit')
  throw e
}

// council-loop itself stops resumable on a limit/budget hit mid-review — propagate so the driver
// re-enters feature-loop (the cached agent prefix replays; council-loop re-runs against the
// already-committed PR state, so the in-progress review/merge gate continues idempotently).
if (councilResult && councilResult.resumable) return RESUMABLE('council-loop did not finish (limit/budget) — re-enter to continue the review/merge gate')

const converged = !!(councilResult && councilResult.converged)
const merged = !!(councilResult && councilResult.merge && councilResult.merge.merged)
log(`council-loop ${F.key}: ${converged ? 'converged' : 'did NOT converge'}${merged ? ' + squash-merged' : ''} — ${(councilResult && councilResult.reason) || 'no result'}`)

return { feature: F.key, issue: F.issue, branch: F.branch, decisions, spec, impl, validate, council: councilResult, converged, merged, resumable: false }
