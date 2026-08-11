/**
 * autofix-swarm.mjs — pure-coordinator autonomous fix swarm (background Workflow).
 *
 * Ports the useful parts of AutoScientists (mims-harvard/AutoScientists) to autonomous
 * bug-fixing / feature implementation / perf tuning:
 *
 *   Bootstrap (run-id + branch + baseline) → Diagnose → Impact scout → Critique-before-compute
 *     → [ always-on fan-out of 2-3 competing worktree fixes → HARD anti-gaming gate
 *         → promote champion → ledger ]  (bounded loop, termination ladder)
 *     → council-loop review (the backstop) + final code-reviewer + detect_changes.
 *
 * NEVER edits code itself, NEVER auto-merges. Leaves the branch review-ready.
 *
 * ─── RUNTIME CONTRACT (this file obeys it exactly) ───────────────────────────────────────
 *  - Plain JavaScript. First statement is a PURE-LITERAL `export const meta`.
 *  - The orchestrator body does ZERO real I/O: no fs/require/child_process, no git, no shell,
 *    no test runs, no file reads/writes, no Date.now()/new Date()/Math.random(). It ONLY
 *    sequences agent()/parallel()/pipeline()/phase()/log()/workflow(), reads schema-validated
 *    returns, branches, and loops.
 *  - The injected primitives are agent/parallel/pipeline/phase/log/workflow. A `budget` global
 *    is OPTIONAL and NOT guaranteed — the loop reads it only behind a `typeof budget !== 'undefined'`
 *    guard (the BUDGET termination rung degrades to the MAX-iteration ceiling when it is absent).
 *  - EVERY world-touching action (run testCmd, git branch/worktree/diff, read/write the
 *    .autofix/<runId>/ ledger, derive the run-id) happens INSIDE an agent() prompt — those
 *    agents have Bash/Read/Write/Edit.
 *  - The run-id is derived by a bootstrap agent running shell `date +%s` (no banned time API).
 *  - Competing fix agents run with opts.isolation:'worktree' (fresh worktree each) and RETURN
 *    their result via schema (worktree agents have no SendMessage).
 *  - council-loop is invoked by ABSOLUTE scriptPath (`workflow({scriptPath:`${WF_DIR}/council-loop.mjs`}, …)`),
 *    one level deep, merge:false. The name registry does NOT resolve ~/.claude/workflows/*.mjs.
 *
 * ─── INVOKE (top-level, by absolute scriptPath) ──────────────────────────────────────────
 *   Workflow({ scriptPath: "/absolute/path/to/.claude/workflows/autofix-swarm.mjs",
 *              args: { ...<ARGS>, workflowsDir: "/absolute/path/to/.claude/workflows" } })
 *
 * ─── ARGS SHAPE (arrives as a JSON string — parsed defensively) ──────────────────────────
 *   {
 *     task | bug | description,    // REQUIRED-ish: the bug/feature/perf goal, verbatim into prompts
 *     testCmd,                     // full-suite command (default "npm test")
 *     repoPath,                    // absolute repo path the agents operate in (default ".")
 *     mode,                        // "bug" | "feature" | "perf"; auto → "perf" if perfMetricCmd given
 *     perfMetricCmd,               // perf mode: continuous-metric command (lower/higher per agent)
 *     perfTarget,                  // perf mode: numeric target for the SUCCESS rung (optional)
 *     maxIterations,               // clamped to 3..6 (default 5)
 *     fanout,                      // clamped to 2..3 competing fixes (default 3)
 *     skipCouncilForTrivial,       // bool: skip P3 council when trivial+clean+high-confidence
 *     stagnationN,                 // N consecutive NO-CHAMPION iters → council pivot (default 2)
 *     buildCmd,                    // optional build command (included in prompts when present)
 *     parentRef,                   // branch off this (default "main")
 *     branchType,                  // naming-hook type; derived from mode if absent
 *     issue,                       // issue number for the branch name (optional)
 *     minBudget,                   // stop-before-iteration budget floor in tokens (default 60000)
 *     workflowsDir,                // abs dir holding council-loop.mjs (default /absolute/path/to/.claude/workflows)
 *     model: { diagnosis, fix, gate, arbiter, reviewer, ledger }, // per-role overrides
 *   }
 *
 * Arch note for the agents this workflow spawns: node is lazy-loaded; use the absolute path
 *   the absolute path to your node binary when a step needs node directly.
 */

export const meta = {
  name: 'autofix-swarm',
  description: 'Pure-coordinator autonomous fix swarm: bootstrap baseline + branch -> diagnose -> impact scout -> council critique-before-compute -> always-on fan-out of 2-3 competing worktree fixes -> hard anti-gaming gate -> promote champion -> ledger -> termination ladder (success/budget/stagnation), then council-loop review. Never edits code or auto-merges; leaves the branch review-ready.',
  whenToUse: 'Autonomous bug fix, feature implementation, or perf tuning where you want competing fixes raced in isolated worktrees with a hard guard against gaming the tests. Pass a task description, testCmd, and repoPath; set mode:"perf" with perfMetricCmd for continuous-metric tuning.',
  phases: [
    { title: 'Bootstrap', detail: 'one agent derives run-id via shell date, branches off main per the naming hook, materializes .autofix/<runId>/, runs testCmd once to capture baseline red/green and detect mode' },
    { title: 'Diagnose', detail: 'diagnosis agent: symptom, 3+ hypotheses, file:line evidence, root cause, confidence; never edits' },
    { title: 'Impact', detail: 'GitNexus impact(upstream) per suspect symbol; surface HIGH/CRITICAL; produce falsification criteria (tests that must newly pass / must not regress)' },
    { title: 'Critique', detail: 'adversarial-council on candidate approaches before spending worktree compute; arbiter returns a deduped 2-3 shortlist, dropping anything Retired in the ledger; skippable for trivial bugs' },
    { title: 'Swarm', detail: 'always-on fan-out: 2-3 agents in isolated worktrees, one per approach, each one atomic change, tests-first, full suite synchronously, structured result' },
    { title: 'Gate', detail: 'hard anti-gaming gate per candidate: reject any diff touching test files or deleting/weakening assertions before promotion' },
    { title: 'Promote', detail: 'orchestrator is sole writer of champion.md: binary mode smallest passing diff with no d=1 regression; perf mode best metric among all-green with strict-improvement' },
    { title: 'Ledger', detail: 'append insights.jsonl (machine truth for stagnation), retire failures to dead-ends.md, update champion.md' },
    { title: 'Report', detail: 'run the council-loop workflow on the champion diff (CRITICAL/HIGH must be clean) plus a final code-reviewer and detect_changes; never auto-merge; leave the branch review-ready' },
  ],
}

// ─── Args parse (defensive — args may arrive as a JSON string OR a bare task string) ─────
// Contract: PARSE DEFENSIVELY. args can arrive as (a) an object, (b) a JSON string, or
// (c) a bare non-JSON task string (e.g. "fix the login bug"). Never let JSON.parse throw at
// module top level — fall back to treating the raw string as the task description.
let A = {}
if (args && typeof args === 'object') {
  A = args
} else if (typeof args === 'string' && args.trim()) {
  try { A = JSON.parse(args) } catch { A = { task: args } }
}

// council-loop is referenced by ABSOLUTE scriptPath: the name registry does NOT resolve
// ~/.claude/workflows/*.mjs (only built-ins), so workflow('council-loop') errors "unknown name".
// The driver passes workflowsDir so the path is OS-correct without hardcoding the vault root;
// fall back to the Arch default. (Absolute path is unambiguous — a relative one would resolve
// against the project cwd, i.e. the target repo, not the vault.)
// Default: <home>/.claude/workflows. Pass args.workflowsDir to override.
const WF_DIR = (A.workflowsDir || ((typeof process !== 'undefined' && process.env && (process.env.HOME || process.env.USERPROFILE)) || '') + '/.claude/workflows').replace(/\/+$/, '')

// ─── Config (all derived from A) ─────────────────────────────────────────────────────────
const TASK = A.task || A.bug || A.description || '(no task description provided)'
const TEST = A.testCmd || 'npm test'
const PERF_METRIC = A.perfMetricCmd || null
const MODE = A.mode || (PERF_METRIC ? 'perf' : 'bug')
const PERF = MODE === 'perf'
const PERF_TARGET = (A.perfTarget !== undefined && A.perfTarget !== null) ? A.perfTarget : null
const MAX = Math.min(Math.max(A.maxIterations || 5, 3), 6)            // hard cap 3..6
const REPO = A.repoPath || '.'
const FANOUT = Math.min(Math.max(A.fanout || 3, 2), 3)               // 2..3 competing fixes
const SKIP_TRIVIAL = A.skipCouncilForTrivial === true
const STAG_N = A.stagnationN || 2
const BUILD = A.buildCmd || null
const PARENT = A.parentRef || 'main'
const BTYPE = A.branchType || (MODE === 'feature' ? 'feature' : MODE === 'perf' ? 'perf' : 'bugfix')
const ISSUE = (A.issue !== undefined && A.issue !== null) ? A.issue : null
const MIN_BUDGET = (A.minBudget !== undefined && A.minBudget !== null) ? A.minBudget : 60000
const MODELS = Object.assign(
  { diagnosis: 'sonnet', fix: 'sonnet', gate: 'sonnet', arbiter: 'opus', reviewer: 'opus', ledger: 'haiku' },
  A.model || {})

// Strategy enum — feeds the candidate / shortlist schemas; slice(0, FANOUT) per iteration.
const STRATEGIES = ['minimal-patch', 'targeted-refactor', 'alternative-root-cause']

// Arch-box reminder injected into every spawned agent that runs shell.
const ARCH_NOTE = 'Environment note: node may be lazy-loaded (nvm). If a step needs node directly, use the absolute path to your node binary.'
const REPO_NOTE = `Operate inside the repository at the absolute path: ${REPO}. ${ARCH_NOTE}`
const NOWRITE = 'STRICT: do NOT write to the .autofix/ run dir, champion.md, or any ledger file — the orchestrator is the sole writer of shared state via dedicated promote/ledger agents.'

// ─── limit-aware retry + resumable stop (shared shape with council-loop / feature-loop) ───
// Backs off on transient blips (529/overloaded/timeout) but BAILS FAST on a hard usage/rate
// limit: retrying inside a blocked window is futile. A hard limit sets `limitHit` and throws
// { limit:true }; the loop/Report stop on it and emit a resumable result. Resume via
// resumeFromRunId — completed agent() calls replay from cache, and the on-disk .autofix/<runId>/
// ledger + the committed champion branch carry progress across the gap.
let limitHit = false
const LIMIT_RE = /(429|rate[ _-]?limit|usage limit|quota|too many requests|insufficient_quota|limit (?:reached|exceeded))/i
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

// ─── Schemas (every nested object sets additionalProperties:false + required) ─────────────
const BOOTSTRAP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['runId', 'branch', 'baselineGreen', 'runDir'],
  properties: {
    runId: { type: 'string' },
    branch: { type: 'string' },
    runDir: { type: 'string' },
    baselineGreen: { type: 'boolean' },
    baselineFailing: { type: 'integer' },
    baselineTotal: { type: 'integer' },
    baselineMetric: { type: 'number' },
    failingTests: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const DIAGNOSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['symptom', 'hypotheses', 'rootCause', 'confidence', 'suspectSymbols'],
  properties: {
    symptom: { type: 'string' },
    hypotheses: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['hypothesis', 'evidence'],
        properties: { hypothesis: { type: 'string' }, evidence: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' } },
      },
    },
    rootCause: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    suspectSymbols: { type: 'array', items: { type: 'string' } },
    trivial: { type: 'boolean' },
  },
}

const IMPACT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['perSymbol', 'falsification'],
  properties: {
    perSymbol: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['symbol', 'risk'],
        properties: {
          symbol: { type: 'string' },
          risk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          directCallers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    highOrCritical: { type: 'array', items: { type: 'string' } },
    falsification: {
      type: 'object', additionalProperties: false,
      required: ['mustPass', 'mustNotRegress'],
      properties: {
        mustPass: { type: 'array', items: { type: 'string' } },
        mustNotRegress: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

const SHORTLIST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['approaches'],
  properties: {
    approaches: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['strategy', 'plan'],
        properties: { strategy: { type: 'string', enum: STRATEGIES }, plan: { type: 'string' }, rationale: { type: 'string' } },
      },
    },
  },
}

const CANDIDATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['candidateId', 'strategy', 'applied', 'testPass'],
  properties: {
    candidateId: { type: 'string' },
    strategy: { type: 'string', enum: STRATEGIES },
    worktreePath: { type: 'string' },
    branch: { type: 'string' },
    applied: { type: 'boolean' },
    testPass: { type: 'boolean' },
    exitCode: { type: 'integer' },
    newlyGreen: { type: 'array', items: { type: 'string' } },
    regressions: { type: 'array', items: { type: 'string' } },
    filesTouched: { type: 'array', items: { type: 'string' } },
    productionLinesChanged: { type: 'integer' },
    diffStat: { type: 'string' },
    metric: { type: 'number' },
    summary: { type: 'string' },
  },
}

const GATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['candidateId', 'strategy', 'gamed', 'touchesTests', 'deletesAssertions', 'testPass'],
  properties: {
    candidateId: { type: 'string' },
    strategy: { type: 'string', enum: STRATEGIES },
    gamed: { type: 'boolean' },
    touchesTests: { type: 'boolean' },
    deletesAssertions: { type: 'boolean' },
    weakenedAssertions: { type: 'integer' },
    addedSkips: { type: 'integer' },
    touchedTestFiles: { type: 'array', items: { type: 'string' } },
    testPass: { type: 'boolean' },
    productionLinesChanged: { type: 'integer' },
    // independent measurements from the gate's OWN re-run (NOT the author's self-report)
    newlyGreen: { type: 'array', items: { type: 'string' } },
    regressions: { type: 'array', items: { type: 'string' } },
    totalTests: { type: 'integer' },
    testCountDropped: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

const PROMOTE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['championWritten', 'championStrategy'],
  properties: {
    championWritten: { type: 'boolean' },
    championStrategy: { type: 'string' },
    championBranch: { type: 'string' },
    championLinesChanged: { type: 'integer' },
    championMetric: { type: 'number' },
    metricMeetsTarget: { type: 'boolean' },
    noD1Regression: { type: 'boolean' },
    replacedPrevious: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

const LEDGER_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['insightsAppended', 'deadEndsAppended'],
  properties: {
    insightsAppended: { type: 'integer' },
    deadEndsAppended: { type: 'integer' },
    retiredApproaches: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const FINAL_CHECK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['detectChangesClean', 'reviewerClean'],
  properties: {
    detectChangesClean: { type: 'boolean' },
    reviewerClean: { type: 'boolean' },
    criticalHigh: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

// ─── Shared prompt fragments ─────────────────────────────────────────────────────────────
const MODE_LINE = PERF
  ? `Mode: perf (continuous metric). The success oracle is the metric command \`${PERF_METRIC}\`${PERF_TARGET !== null ? ` against the target ${PERF_TARGET}` : ' (no explicit target — best-so-far)'}; tests must still stay green.`
  : `Mode: ${MODE} (binary oracle). The success oracle is the full test suite: it passes or it does not.`
const TASK_BLOCK = `Task (verbatim, do not reinterpret): ${TASK}\nFull test command: ${TEST}${BUILD ? `\nBuild command: ${BUILD}` : ''}${PERF ? `\nPerf metric command: ${PERF_METRIC}` : ''}\n${MODE_LINE}`

// ═════════════════════════════════════════════════════════════════════════════════════════
// P0 — Bootstrap (once)
// ═════════════════════════════════════════════════════════════════════════════════════════
phase('Bootstrap')
const boot = await tryAgent(
`You are the bootstrap agent for an autonomous fix swarm. Do ALL of the following with Bash, in order, and RETURN the structured result. ${REPO_NOTE}
${TASK_BLOCK}

1. Run \`date +%s\` and use its output verbatim as runId.
2. Create the run dir \`${REPO}/.autofix/<runId>/\` and seed three empty files in it: \`insights.jsonl\`, \`dead-ends.md\`, \`champion.md\`. Return its ABSOLUTE path as runDir.
3. Create a fix branch off ${PARENT} following the repo naming hook (the gh-check-before-create hook enforces \`<type>/<issue#>-<kebab-case-description>\` and will BLOCK a non-conforming name): use type "${BTYPE}", issue "${ISSUE !== null ? ISSUE : 'auto'}", and a kebab-case slug derived from the task. If a branch matching this task already exists (a prior interrupted run), reuse it (\`git checkout <branch>\`) instead of erroring. Return the exact branch name created or reused.
4. Run \`${TEST}\` ONCE at HEAD (before any fix). Record: baselineGreen (did it pass), baselineFailing, baselineTotal, and failingTests (test names). ${PERF ? `Also run \`${PERF_METRIC}\` once and record the measured number as baselineMetric.` : 'Set baselineMetric to 0.'}
5. Do NOT edit any source file. ${NOWRITE.replace('STRICT: ', 'You MAY write only inside the .autofix run dir you just created; otherwise ')}

Return BOOTSTRAP_SCHEMA.`,
  { label: 'bootstrap', phase: 'Bootstrap', model: MODELS.diagnosis, schema: BOOTSTRAP_SCHEMA })

const runId = boot.runId
const branch = boot.branch
const runDir = boot.runDir
const baselineGreen = boot.baselineGreen
log(`bootstrap: runId=${runId} branch=${branch} baselineGreen=${baselineGreen}${PERF ? ` baselineMetric=${boot.baselineMetric}` : ''}`)

// ═════════════════════════════════════════════════════════════════════════════════════════
// P1 — Diagnose (once)
// ═════════════════════════════════════════════════════════════════════════════════════════
phase('Diagnose')
const diag = await tryAgent(
`You are a diagnosis agent. Investigate but NEVER edit code. ${REPO_NOTE}
${TASK_BLOCK}
Baseline failing tests: ${JSON.stringify(boot.failingTests || [])}

Produce a rigorous diagnosis:
- symptom: the exact observed behavior (not interpreted).
- hypotheses: AT LEAST 3, each with a one-line rationale and concrete evidence; cite file + line where the defect likely lives.
- rootCause: the best-supported root cause, citing file:line.
- confidence: high | medium | low.
- suspectSymbols: the symbol names (functions/classes/methods) most likely involved — these feed GitNexus impact analysis next.
- trivial: true ONLY if this is a small, single-site cause a stack trace collapses to one file:line (used to decide whether the council critique can be skipped).

Return DIAGNOSIS_SCHEMA.`,
  { label: 'diagnose', phase: 'Diagnose', model: MODELS.diagnosis, agentType: 'diagnosis', schema: DIAGNOSIS_SCHEMA })
log(`diagnose: rootCause confidence=${diag.confidence} trivial=${diag.trivial === true} suspects=${(diag.suspectSymbols || []).length}`)

// ═════════════════════════════════════════════════════════════════════════════════════════
// P2 — Impact scout (once)
// ═════════════════════════════════════════════════════════════════════════════════════════
phase('Impact')
const impact = await tryAgent(
`You are the impact-scout agent. Do NOT edit code. ${REPO_NOTE}
${TASK_BLOCK}
Diagnosis to scout: ${JSON.stringify(diag)}

For EACH symbol in suspectSymbols, call the GitNexus MCP tool impact({target:<symbol>, direction:'upstream'}) and record the risk level (LOW/MEDIUM/HIGH/CRITICAL) plus the direct callers (d=1). Collect any HIGH or CRITICAL symbols into highOrCritical. (CLAUDE.md mandates impact analysis before any edit — this is that gate.)

Then produce falsification criteria the fix must satisfy:
- mustPass: the specific tests that must NEWLY pass for the task to be considered fixed.
- mustNotRegress: the tests / behaviors that must NOT regress (especially anything reachable from a HIGH/CRITICAL symbol's d=1 callers).

Return IMPACT_SCHEMA.`,
  { label: 'impact', phase: 'Impact', model: MODELS.diagnosis, schema: IMPACT_SCHEMA })
log(`impact: HIGH/CRITICAL=${(impact.highOrCritical || []).length} mustPass=${(impact.falsification && impact.falsification.mustPass || []).length} mustNotRegress=${(impact.falsification && impact.falsification.mustNotRegress || []).length}`)

// ═════════════════════════════════════════════════════════════════════════════════════════
// P3 — Critique-before-compute (once, skippable)
// ═════════════════════════════════════════════════════════════════════════════════════════
let shortlist
const skipCouncil = SKIP_TRIVIAL && diag.trivial === true && (impact.highOrCritical || []).length === 0 && diag.confidence === 'high'
if (skipCouncil) {
  log('trivial bug + clean blast radius + high confidence — skipping council, using diagnosis-derived strategies')
  shortlist = { approaches: STRATEGIES.slice(0, FANOUT).map(s => ({ strategy: s, plan: diag.rootCause })) }
} else {
  phase('Critique')
  shortlist = await tryAgent(
`You are the ARBITER of a critique-before-compute council. Run an adversarial critique of candidate FIX APPROACHES (NOT code — no code is written yet) before we spend expensive parallel worktree compute. ${REPO_NOTE}
${TASK_BLOCK}
Diagnosis: ${JSON.stringify(diag)}
Impact + falsification: ${JSON.stringify(impact)}

FIRST read \`${runDir}/dead-ends.md\` and EXCLUDE any approach already retired there. Then weigh competing fix approaches (e.g. a minimal patch vs a targeted refactor vs an alternative root-cause attack) and return a DEDUPED shortlist of EXACTLY ${FANOUT} approaches, each mapped onto the strategy enum [${STRATEGIES.join(', ')}]. Each approach: a concrete plan and a one-line rationale. Do not edit code or write any file.

Return SHORTLIST_SCHEMA.`,
    { label: 'critique', phase: 'Critique', model: MODELS.arbiter, agentType: 'adversarial-council', schema: SHORTLIST_SCHEMA })
}
log(`shortlist: ${(shortlist.approaches || []).map(a => a.strategy).join(', ')}`)

// ─── stagnation council pivot (used by the termination ladder) ───────────────────────────
async function councilPivot(prev) {
  phase('Critique')
  return await tryAgent(
`You are the ARBITER running a STAGNATION PIVOT. The prior shortlist failed to produce a champion across consecutive iterations. Re-triage. ${REPO_NOTE}
${TASK_BLOCK}
Diagnosis: ${JSON.stringify(diag)}
Impact: ${JSON.stringify(impact)}
Prior shortlist that failed: ${JSON.stringify(prev)}

Read \`${runDir}/insights.jsonl\` and \`${runDir}/dead-ends.md\` first. Produce a FRESH shortlist of EXACTLY ${FANOUT} approaches that are COLD — a different strategy class or a different file region from everything tried so far — and EXPLICITLY exclude every approach listed in dead-ends.md. Map each onto the strategy enum [${STRATEGIES.join(', ')}]. Do not edit code or write any file.

Return SHORTLIST_SCHEMA.`,
    { label: 'council-pivot', phase: 'Critique', model: MODELS.arbiter, agentType: 'adversarial-council', schema: SHORTLIST_SCHEMA })
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// P6 — Ledger (sole-writer agent; always runs, win or lose)
// ═════════════════════════════════════════════════════════════════════════════════════════
async function appendLedger(iter, gated, winner) {
  phase('Ledger')
  return await tryAgent(
`You are the LEDGER agent — the orchestrator's SOLE writer of the run-dir ledger this iteration. ${REPO_NOTE}
Run dir: ${runDir}  (iteration ${iter})
Candidates this iteration (with gate verdicts): ${JSON.stringify(gated)}
Winner this iteration (null if none): ${JSON.stringify(winner)}

Do exactly this, append-only:
1. Append one JSONL line PER candidate to \`${runDir}/insights.jsonl\`: {"iter":${iter},"candidateId":...,"strategy":...,"testPass":...,"gamed":...,"linesChanged":...,"metric":...,"regressions":[...],"why":...}. Use each candidate's candidateId as the stable unique key (two candidates can share a strategy across iterations — candidateId disambiguates them). This file is the machine truth used to detect stagnation. On a WIN, record WHY it passed plus the file/pattern that worked, so later iterations can reuse it.
2. Append every FAILED or REJECTED approach to \`${runDir}/dead-ends.md\` WITH its reason (so the critique phase dedups it next time). Format each as "Retired: <strategy> — <reason>".
3. NEVER delete prior entries. Memory is append-only — dead-ends are downgraded/recorded, never erased.
Do NOT edit any source file.

Return LEDGER_SCHEMA.`,
    { label: `ledger#${iter}`, phase: 'Ledger', model: MODELS.ledger, schema: LEDGER_SCHEMA })
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// P4 (Swarm) + Gate + P5 (Promote) + P6 (Ledger) — one iteration
// ═════════════════════════════════════════════════════════════════════════════════════════
async function runIteration(iter) {
  // ── P4 Swarm: always-on fan-out, one isolated worktree per shortlisted strategy ──
  phase('Swarm')
  // Dedup approaches by strategy BEFORE slicing — the strategy value is the gate-join key and
  // the ledger key, so two approaches sharing a strategy would silently collapse a candidate.
  // Keep the first occurrence per strategy, then slice to FANOUT.
  const seenStrategy = new Set()
  const approaches = (shortlist.approaches || [])
    .filter(ap => (ap && !seenStrategy.has(ap.strategy)) ? (seenStrategy.add(ap.strategy), true) : false)
    .slice(0, FANOUT)
  const mustPass = (impact.falsification && impact.falsification.mustPass) || []
  const mustNotRegress = (impact.falsification && impact.falsification.mustNotRegress) || []
  // stable, unique per-candidate id — the integrity-checked join key for gate ↔ candidate.
  const fixThunks = approaches.map((ap, index) => {
    const candidateId = `${ap.strategy}#${iter}#${index}`
    return () => tryAgent(
`You are a competing FIX agent for strategy "${ap.strategy}" (iteration ${iter}). You run in your OWN fresh git worktree (isolation handles creation) — operate ONLY there. ${REPO_NOTE}
${TASK_BLOCK}
Your stable candidateId (echo it back VERBATIM, do not change it): ${candidateId}
Your ASSIGNED strategy (echo it back VERBATIM as strategy): ${ap.strategy}
Your assigned approach plan: ${ap.plan}
Falsification criteria — mustPass: ${JSON.stringify(mustPass)}; mustNotRegress: ${JSON.stringify(mustNotRegress)}
Before you start, READ \`${runDir}/dead-ends.md\` and \`${runDir}/insights.jsonl\` and DIFFERENTIATE from every prior failed attempt of this same strategy — pick a different file region / tactic so you are not re-running a known dead-end.

Implement the approach as ONE atomic change, tests-first where applicable. Then run the FULL \`${TEST}\` suite SYNCHRONOUSLY and capture the result.${PERF ? ` Also run \`${PERF_METRIC}\` and record the measured number as metric.` : ' Set metric to 0.'}
HARD CONSTRAINTS (your work is rejected later if you violate these):
- DO NOT edit any test file and DO NOT delete, weaken, skip, xfail, or .only any assertion. Make production code pass the EXISTING tests honestly.
- ${NOWRITE}
- Commit your change on your worktree branch (so the diff is inspectable).
Report: candidateId (echo the id above verbatim), strategy (echo the assigned strategy verbatim), applied (did you write code + commit), testPass (full suite green), exitCode, newlyGreen (tests now passing that were failing), regressions (tests now failing that passed before), filesTouched, productionLinesChanged (non-test diff size — used to pick the smallest passing diff), diffStat, worktreePath, branch, summary.

Return CANDIDATE_SCHEMA.`,
      { label: `fix:${candidateId}`, phase: 'Swarm', model: MODELS.fix, isolation: 'worktree', agentType: 'parallel-fix', schema: CANDIDATE_SCHEMA })
  })

  const candidates = (await parallel(fixThunks)).filter(Boolean)
  if (!candidates.length) {
    log(`iteration ${iter}: all ${approaches.length} candidates failed — zero candidates`)
    const ledgerEmpty = await appendLedger(iter, [], null)
    // zero candidates means the whole shortlist is dead this iteration; signal the loop to
    // pivot immediately rather than re-dispatching the identical shortlist next iteration.
    return { promotedThisIter: false, gated: [], promote: null, ledger: ledgerEmpty, zeroCandidates: true }
  }

  // ── HARD ANTI-GAMING GATE (P4, before promotion; separate agent; fails closed) ──
  phase('Gate')
  const baselineTotal = (boot.baselineTotal !== undefined && boot.baselineTotal !== null) ? boot.baselineTotal : null
  const baselineFailing = boot.failingTests || []
  const gateThunks = candidates.map(c => () => tryAgent(
`You are the ANTI-GAMING GATE agent (NOT the author of this candidate). Inspect candidate strategy "${c.strategy}" (candidateId ${c.candidateId}) inside its worktree at ${c.worktreePath || '(the candidate worktree)'}. ${REPO_NOTE}
Full test command: ${TEST}
Echo back candidateId (${c.candidateId}) and strategy (${c.strategy}) VERBATIM so the orchestrator can join your verdict to the right candidate.
Recorded baseline (from before any fix): baselineTotalTests=${baselineTotal !== null ? baselineTotal : '(unknown)'}; baselineFailingTests=${JSON.stringify(baselineFailing)}.

Do exactly this, editing NOTHING:
(a) Run \`git diff\` and inspect EVERY hunk. Set touchesTests=true if ANY hunk path is a test file — match **/*test*, **/*spec*, test/, tests/, __tests__/, *.test.*, *.spec.*, conftest.py, and any obvious test fixture. List those paths in touchedTestFiles.
(b) Detect tampering: deletesAssertions (any assert/expect/should removed), weakenedAssertions (count of assertions loosened — tightened→loosened, expected value removed, == → truthy), addedSkips (count of skip/xfail/.only/it.only added).
(c) INDEPENDENTLY re-run \`${TEST}\` in this worktree yourself. Set testPass from YOUR run (do not trust the author's claim). From YOUR run, compute and report:
    - newlyGreen: tests that were in baselineFailingTests and now PASS in your run.
    - regressions: tests that were NOT in baselineFailingTests (i.e. passed at baseline) and now FAIL in your run.
    - totalTests: the total number of tests COLLECTED in your run.
    - testCountDropped: true if totalTests < baselineTotalTests (tests were removed/skipped from collection — a gaming vector even when the suite is "green").
Set gamed = touchesTests || deletesAssertions || weakenedAssertions > 0 || addedSkips > 0 || testCountDropped === true. Give a one-line reason. Also report productionLinesChanged you measured from the diff.

Return GATE_SCHEMA.`,
    { label: `gate:${c.candidateId}`, phase: 'Gate', model: MODELS.gate, schema: GATE_SCHEMA }))

  const gateResults = (await parallel(gateThunks)).filter(Boolean)

  // join gate verdicts onto candidates by the opaque candidateId (NOT the self-reported
  // strategy). Fail closed when no match is found. Then REJECT: gamed (even if testPass===true),
  // a strategy mismatch (author returned a strategy different from the one assigned in the id),
  // not-green per the gate's OWN re-run, regressions per the gate's OWN measurement, a dropped
  // test count, or a fix that does not cover the falsification mustPass set.
  const gated = candidates.map(c => {
    const g = gateResults.find(x => x.candidateId === c.candidateId) || { gamed: true, reason: 'gate missing — fail closed' }
    // strategy embedded in the candidateId is the assigned source of truth; a mismatch is fail-closed.
    const assignedStrategy = String(c.candidateId || '').split('#')[0]
    const strategyMismatch = c.strategy !== assignedStrategy
    // prefer the gate's INDEPENDENT measurements; fall back to the author's only if the gate omitted them.
    const regressions = (g.regressions !== undefined) ? (g.regressions || []) : (c.regressions || [])
    const newlyGreen = (g.newlyGreen !== undefined) ? (g.newlyGreen || []) : (c.newlyGreen || [])
    const regressesProtected = regressions.some(r => mustNotRegress.includes(r))
    // fix must cover the falsification mustPass set (when non-empty): a green-but-wrong suite
    // (e.g. target test was already skipped/xfail at baseline) must NOT be promotable.
    const fixesTarget = mustPass.length === 0 || mustPass.every(t => newlyGreen.includes(t))
    const rejected =
      g.gamed === true ||
      strategyMismatch ||
      g.testPass !== true ||
      c.testPass !== true ||
      regressions.length > 0 ||
      g.testCountDropped === true ||
      !fixesTarget
    return { ...c, gate: g, rejected, regressions, newlyGreen, regressesProtected, strategyMismatch, fixesTarget }
  })

  const valid = gated.filter(x => !x.rejected)
  for (const r of gated.filter(x => x.rejected)) {
    const why = (r.strategyMismatch) ? `strategy mismatch (assigned ${String(r.candidateId || '').split('#')[0]}, returned ${r.strategy})`
      : (r.gate && r.gate.gamed) ? `gamed (${r.gate.reason || ''})${r.gate.testCountDropped === true ? ' [test count dropped]' : ''}`
      : (r.gate && r.gate.testPass !== true) ? 'gate re-run not green'
      : (r.testPass !== true) ? 'tests not green'
      : (r.regressions.length > 0) ? (r.regressesProtected ? 'regressions (protected/mustNotRegress test)' : 'regressions')
      : (!r.fixesTarget) ? 'does not satisfy falsification mustPass (suite green but target not fixed)'
      : 'rejected'
    log(`REJECTED ${r.strategy} [${r.candidateId}]: ${why}`)
  }

  // ── P5 Promote ──
  let winner = null
  if (valid.length) {
    if (PERF) {
      // perf mode: best metric among all-green; STRICT improvement vs the carried champion
      const best = valid.reduce((b, c) => (c.metric > (b ? b.metric : -Infinity) ? c : b), null)
      if (best && (!champion || best.metric > champion.metric)) winner = best
    } else {
      // binary mode: smallest passing diff; NO champion-scoring carryover
      const smallest = valid.reduce((b, c) => (c.productionLinesChanged < (b ? b.productionLinesChanged : Infinity) ? c : b), null)
      if (smallest && (!champion || smallest.productionLinesChanged < champion.linesChanged)) winner = smallest
    }
  }

  let promote = null
  if (winner) {
    phase('Promote')
    promote = await tryAgent(
`You are the PROMOTE agent — the orchestrator's SOLE writer of champion.md and the canonical fix branch. ${REPO_NOTE}
Canonical fix branch: ${branch}   Run dir: ${runDir}   Winner: ${JSON.stringify(winner)}
${PERF ? `Perf target: ${PERF_TARGET !== null ? PERF_TARGET : '(none — best-so-far)'}` : ''}
Impact perSymbol (for the d=1 regression check): ${JSON.stringify(impact.perSymbol || [])}

Do exactly this:
1. Apply the winner's worktree commit onto ${branch} (cherry-pick or apply the commit; keep ${branch} as the single canonical branch). IDEMPOTENCY (resume-safe): first check whether this winner's change is ALREADY on ${branch} — \`git log --oneline ${branch}\` and \`git diff --stat ${branch}\` — because a prior interrupted run may have cherry-picked it. If it is already present, do NOT apply it again; treat it as already promoted and continue from step 2.
2. Run the GitNexus detect_changes MCP tool and confirm there is NO d=1 regression among the impact perSymbol symbols. Report noD1Regression. ${PERF ? '' : 'In binary mode a d=1 regression means do NOT write the champion.'}
3. Write \`${runDir}/champion.md\` with the winning strategy, diffStat, productionLinesChanged${PERF ? ', the measured metric, and whether the metric meets the perf target (metricMeetsTarget)' : ''}.
${PERF ? '4. Set metricMeetsTarget = (a target is set AND the measured metric meets/beats it). If no target is set, metricMeetsTarget=false.' : '4. Set metricMeetsTarget=false (binary mode).'}
Do NOT merge anything. Report championWritten, championStrategy, championBranch, championLinesChanged, championMetric, metricMeetsTarget, noD1Regression, replacedPrevious.

Return PROMOTE_SCHEMA.`,
      { label: `promote:${winner.candidateId || winner.strategy + '#' + iter}`, phase: 'Promote', model: MODELS.fix, schema: PROMOTE_SCHEMA })

    // Enforce the binary-mode 'no d=1 regression' rule in CONTROL FLOW, not only the prompt:
    // a reported d=1 regression in binary mode cannot become the body's champion regardless of
    // how the promote agent set championWritten. (Perf mode does not gate on d=1 per the design.)
    const d1Ok = PERF || promote.noD1Regression !== false
    if (promote.championWritten && d1Ok) {
      champion = PERF
        ? {
            strategy: winner.strategy, branch, linesChanged: winner.productionLinesChanged, metric: winner.metric,
            metricMeetsTarget: promote.metricMeetsTarget === true,
            // use the gate's INDEPENDENT measurements (carried onto the gated candidate), not the author's.
            testPass: winner.testPass === true, regressions: winner.regressions || [], newlyGreen: winner.newlyGreen || [],
          }
        : {
            strategy: winner.strategy, branch, linesChanged: winner.productionLinesChanged, metric: 0,
            metricMeetsTarget: false,
            testPass: winner.testPass === true, regressions: winner.regressions || [], newlyGreen: winner.newlyGreen || [],
          }
    } else if (promote.championWritten && !d1Ok) {
      log(`promote reported championWritten but noD1Regression=false in binary mode — NOT adopting as champion`)
    }
  }
  // promotedThisIter reflects whether the body actually ADOPTED a champion (d=1 guard applied),
  // not merely what the agent claimed — so the stagnation streak counts honestly.
  const promotedThisIter = !!(promote && promote.championWritten && (PERF || promote.noD1Regression !== false) && champion)

  // ── P6 Ledger (always) ──
  const ledger = await appendLedger(iter, gated, winner)
  return { promotedThisIter, gated, promote, ledger }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// Bounded loop + termination ladder (SUCCESS → BUDGET → STAGNATION)
// ═════════════════════════════════════════════════════════════════════════════════════════
let champion = null            // body's view; champion.md on disk is written by the promote agent
let noChampionStreak = 0
let pivoted = false            // the stagnation rung fires its ONE council pivot only once
let outcome = null             // 'success' | 'budget' | 'stagnation-exit' | 'token-budget' | 'limit'
const history = []

try {
for (let iter = 1; iter <= MAX; iter++) {
  log(`iteration ${iter}/${MAX} — champion: ${champion ? champion.strategy + ' (' + champion.linesChanged + ' LOC' + (PERF ? ', metric ' + champion.metric : '') + ')' : 'none'}`)

  if (limitHit) { outcome = 'limit'; break }   // a parallel fix fan-out tripped a usage/rate limit

  // budget pre-check (defensive: `budget` is NOT a guaranteed runtime global — degrade
  // gracefully when absent rather than crashing the loop. The MAX-iteration ceiling below is
  // the hard stop; this rung is a best-effort early-out only when a budget global is injected.)
  const haveBudget = typeof budget !== 'undefined' && budget && typeof budget.remaining === 'function'
  if (haveBudget && budget.total && budget.remaining() < MIN_BUDGET) {
    log(`budget low (${Math.round(budget.remaining() / 1000)}k left) — stopping before iteration ${iter}`)
    outcome = 'token-budget'; break
  }

  const { promotedThisIter, gated, zeroCandidates } = await runIteration(iter)
  if (limitHit) { outcome = 'limit'; break }   // runIteration's parallel fix fan-out hit a limit
  history.push({ iter, promoted: promotedThisIter, candidates: gated.length })

  // ── Termination ladder, CHECKED IN ORDER ──

  // (1) SUCCESS — checked FIRST so an already-green champion is never discarded by BUDGET
  const success = PERF
    ? !!(champion && champion.metricMeetsTarget)
    : !!(champion && champion.testPass && (champion.regressions || []).length === 0)
  if (success) { outcome = 'success'; break }

  // (2) BUDGET — iteration cap reached
  if (iter >= MAX) { outcome = 'budget'; break }

  // (3) STAGNATION — N consecutive NO-CHAMPION iterations (not N total iterations).
  // A zero-candidate iteration means the ENTIRE shortlist is dead — re-dispatching the same
  // shortlist next iteration is guaranteed waste, so pivot IMMEDIATELY (don't wait for STAG_N).
  if (!promotedThisIter) noChampionStreak++; else noChampionStreak = 0
  const pivotNow = noChampionStreak >= STAG_N || zeroCandidates === true
  if (pivotNow) {
    if (!pivoted) {
      pivoted = true; noChampionStreak = 0
      log(zeroCandidates === true
        ? 'zero candidates this iteration — whole shortlist dead, triggering ONE council pivot immediately'
        : `stagnation: ${STAG_N} consecutive no-champion iterations — triggering ONE council pivot`)
      shortlist = await councilPivot(shortlist)
      // loop continues with the fresh shortlist
    } else {
      log('stagnation persists after the pivot — exiting honestly')
      outcome = 'stagnation-exit'; break
    }
  }
  // otherwise loop, carrying champion + ledger forward
}
} catch (e) { if (e && e.limit) { limitHit = true; outcome = 'limit' } else throw e }

// ═════════════════════════════════════════════════════════════════════════════════════════
// P8 — Report (once, after the loop): council-loop backstop + final code-reviewer + detect_changes
// ═════════════════════════════════════════════════════════════════════════════════════════
// Skip the (expensive) backstop entirely if a hard limit already hit — it would just re-trip it.
// council-loop is itself resumable; if it stops mid-review, propagate that as a resumable run.
let councilReview = null, finalCheck = null
try {
  if (!limitHit) {
    phase('Report')
    councilReview = await workflow({ scriptPath: `${WF_DIR}/council-loop.mjs` }, {
      title: `autofix-swarm champion for: ${TASK}`,
      target: { branch, parentRef: `origin/${PARENT}` },
      scope: `Review ONLY the champion diff on ${branch} vs ${PARENT}. The fix must clear CRITICAL/HIGH with zero findings. Do NOT merge.`,
      project: { name: REPO, buildCmd: BUILD || TEST, testCmd: TEST },
      merge: false,                       // NEVER auto-merge
      council: { advocates: 1, critics: 1, requireUnconditional: true },
    })
    if (councilReview && councilReview.resumable) { limitHit = true; outcome = outcome || 'limit' }
  }

  if (!limitHit) {
    finalCheck = await tryAgent(
`You are the final-check agent. Do NOT change code — verify and report only. ${REPO_NOTE}
Canonical fix branch under review: ${branch} (vs ${PARENT}).

1. Run the GitNexus detect_changes MCP tool and confirm the changed scope matches the expected fix (no surprise files / symbols). Set detectChangesClean accordingly.
2. Run a code-reviewer pass over the champion diff. Set reviewerClean=true ONLY if there are ZERO CRITICAL and ZERO HIGH findings; list any CRITICAL/HIGH in criticalHigh.

Return FINAL_CHECK_SCHEMA.`,
      { label: 'final-check', phase: 'Report', model: MODELS.reviewer, agentType: 'code-reviewer', schema: FINAL_CHECK_SCHEMA })
  }
} catch (e) { if (e && e.limit) { limitHit = true; outcome = outcome || 'limit' } else throw e }

// ─── Final result ────────────────────────────────────────────────────────────────────────
// The workflow harness wraps this body and captures its completion value, so the result is
// the body's final expression statement. We bind it and leave it as that trailing expression
// (a top-level `return` is not legal in an ESM module body and fails `node --check`).
const resumable = !!limitHit || outcome === 'token-budget'
const result = {
  task: TASK,
  mode: MODE,
  runId,
  branch,
  outcome,                            // 'success' | 'budget' | 'stagnation-exit' | 'token-budget' | 'limit'
  iterations: history.length,
  history,                            // [{iter, promoted, candidates}]
  champion,                           // null if never promoted
  diagnosis: diag,
  impact,
  councilReview,                      // council-loop result (converged?, reason)
  finalCheck,                         // {detectChangesClean, reviewerClean, criticalHigh}
  reviewReady: !resumable && !!(champion && finalCheck && finalCheck.reviewerClean && councilReview && councilReview.converged),
  resumable,                          // true → stopped on a limit/token-budget; resume with resumeFromRunId
  merged: false,                      // ALWAYS false — never auto-merge
  reason: outcome === 'success' ? 'target green / perf target met'
    : outcome === 'limit' ? 'hit a usage/rate limit — partial progress committed to the branch + ledger; resume with resumeFromRunId once limits reset'
    : outcome === 'token-budget' ? 'turn token budget nearly exhausted — resume with resumeFromRunId in a fresh turn'
    : outcome === 'budget' ? `iteration cap (${MAX}) reached — best champion left review-ready`
    : 'stagnation persisted after one council pivot — exited honestly',
}
result
