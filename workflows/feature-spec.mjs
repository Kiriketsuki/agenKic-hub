/**
 * feature-spec.mjs — Single-Spec Implementation Workflow.
 *
 * Lands ONE focused `*-spec.md` (a single feature/fix that touches a small, known set of files)
 * end-to-end with an adversarial quality harness — as opposed to spec-loop.mjs, which decomposes a
 * whole multi-feature epic into parallel worktree waves. There is exactly ONE writer (the implement
 * agent, later the fix agent); verify and review agents are READ-ONLY, so no worktree isolation is
 * needed and the change lands directly on the already-checked-out branch's working tree.
 *
 * Phases:
 *   P1 VERIFY  (parallel, read-only) — N lenses confirm/refute the spec's load-bearing claims against
 *              the ACTUAL source (the spec's own "Verify first" section is often partly inferred).
 *              Each returns file:line evidence + corrections. Merged into a grounding brief.
 *   P2 IMPLEMENT (serial, 1 writer) — applies the minimal diff + adds the spec's unit tests on the
 *              working tree, runs the compile check, the targeted test subset, and the full suite.
 *   P3 REVIEW  (parallel, adversarial) — distinct lenses (semantics/correctness, regression/ordering,
 *              constraint-compliance, test-coverage) each try to BREAK the change. file:line findings.
 *   P4 ARBITER (serial, opus) — synthesizes review verdicts + test results into ship | fix | escalate.
 *   P5 FIX     (serial loop, ≤ maxFixLoops) — on `fix`, one agent resolves blocking findings, re-runs
 *              tests; one opus re-verifier confirms the fixes; re-arbitrate. Loop until ship/escalate.
 *
 * The workflow NEVER commits, pushes, or opens a PR (outward-facing actions stay with the human).
 * It leaves a clean, tested working tree and returns the proposed commit message + PR target.
 *
 * ─── RUNTIME CONTRACT ──────────────────────────────────────────────────────────────────────
 *  - Plain JavaScript. First statement is a PURE-LITERAL `export const meta`.
 *  - The harness wraps this body in an AsyncFunction → top-level await/return are legal.
 *  - Injected primitives: agent/parallel/pipeline/phase/log; `args` is the JSON args; `budget` is
 *    OPTIONAL and read only behind a typeof guard. No console.log (workflow runtime owns stdout).
 *  - Date.now()/Math.random()/argless new Date() are unavailable — never call them.
 *
 * ─── INVOKE (by absolute scriptPath) ─────────────────────────────────────────────────────────
 *   Workflow({ scriptPath: "<abs>/feature-spec.mjs", args: { project, review, maxFixLoops } })
 *
 * ─── ARGS SHAPE ──────────────────────────────────────────────────────────────────────────────
 *   {
 *     project: {
 *       name,            // human label for the project (prompts only)
 *       specFile,        // path (relative to repo cwd) to the *-spec.md to implement   [required]
 *       primaryFile,     // main source file the fix edits (hint; agent confirms from spec)
 *       testFile,        // test file new unit tests go into (hint)
 *       testDir,         // dir to run test/compile commands FROM (e.g. "relay/control"); default "."
 *       compileCmd,      // syntax/typecheck gate run in testDir (e.g. "python -m py_compile x.py"); optional
 *       targetedTest,    // fast must-be-green subset (e.g. 'uv run pytest -k "drain" -q'); default "pytest -q"
 *       fullTest,        // full suite for regression visibility (e.g. "uv run pytest -q"); optional
 *       baselineNote,    // free-text note on the known-green baseline / known pre-existing failures
 *       prTarget,        // branch the eventual PR targets (prompts/return only); default "main"
 *       commitType,      // conventional-commit type for the suggested message; default "fix"
 *     },
 *     verifyLenses,      // optional string[] of verify-lens briefs; default the 2 built-ins
 *     review: { lenses }, // optional override of the review lens set
 *     maxFixLoops,       // default 2
 *     minBudget,         // token floor to stop before an expensive phase; default 60000
 *     model,             // optional per-role overrides { verify, implement, review, arbiter, fix }
 *   }
 */

export const meta = {
  name: 'feature-spec',
  description: 'Single-Spec Implementation Workflow: land ONE focused *-spec.md end-to-end with an adversarial quality harness. Read-only verify lenses confirm the spec\'s claims against actual source, one implement agent applies the minimal diff + the spec\'s unit tests and runs the compile/targeted/full test gates, parallel adversarial reviewers try to break it, an opus arbiter rules ship/fix/escalate, and a bounded fix loop resolves blocking findings. Never commits/pushes/PRs — leaves a clean tested tree and returns the proposed commit message + PR target.',
  whenToUse: 'Implementing a single, well-scoped feature or fix described in one *-spec.md that touches a small known set of files, when you want verify-against-source grounding plus adversarial review and a bounded fix loop before a human commits. For a whole multi-feature epic, use spec-loop instead.',
  phases: [
    { title: 'Verify', detail: 'parallel read-only lenses confirm/refute the spec\'s load-bearing claims against actual source with file:line evidence + corrections' },
    { title: 'Implement', detail: 'one writer applies the minimal diff + the spec\'s unit tests on the working tree; runs compile, targeted, and full test gates' },
    { title: 'Review', detail: 'parallel adversarial lenses (semantics, regression/ordering, constraints, test-coverage) each try to break the change; file:line findings' },
    { title: 'Arbiter', detail: 'opus synthesizes review verdicts + test results into ship | fix | escalate' },
    { title: 'Fix', detail: 'bounded loop: resolve blocking findings, re-run tests, opus re-verify the fixes, re-arbitrate until ship/escalate' },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// args + config (defensive: a stringified payload silently loses scope on the first real run)
// ═══════════════════════════════════════════════════════════════════════════════════════════
const A = (args && typeof args === 'object') ? args : (typeof args === 'string' && args.trim() ? JSON.parse(args) : {})
const P = (A.project && typeof A.project === 'object') ? A.project : {}
const NAME = P.name || 'this project'
const SPEC = P.specFile || 'spec.md'
const PRIMARY_FILE = P.primaryFile || '(infer the source file(s) from the spec)'
const TEST_FILE = P.testFile || '(add tests to the project\'s existing test file for this module, inferred from the spec)'
const TEST_DIR = P.testDir || '.'
const COMPILE_CMD = P.compileCmd || ''
const TARGETED_TEST = P.targetedTest || 'pytest -q'
const FULL_TEST = P.fullTest || ''
const BASELINE = P.baselineNote || ''
const PR_TARGET = P.prTarget || 'main'
const COMMIT_TYPE = P.commitType || 'fix'
const MAX_FIX_LOOPS = (A.maxFixLoops !== undefined && A.maxFixLoops !== null) ? Math.max(0, A.maxFixLoops) : 2

const MODELS = Object.assign(
  { verify: 'sonnet', implement: 'sonnet', review: 'opus', arbiter: 'opus', fix: 'sonnet' },
  (A.model && typeof A.model === 'object') ? A.model : {})

// budget floor + limit-aware retry (pattern ported from spec-loop.mjs; not imported).
const FLOOR = (A.minBudget !== undefined && A.minBudget !== null) ? A.minBudget : 60000
const lowBudget = () => (typeof budget !== 'undefined' && budget && budget.total && typeof budget.remaining === 'function' && budget.remaining() < FLOOR)
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
      if (LIMIT_RE.test(msg)) {
        limitHit = true
        log(`agent ${(opts && opts.label) || ''} hit a usage/rate limit — stopping for resume: ${msg.slice(0, 120)}`)
        const le = new Error(`LIMIT: ${msg}`); le.limit = true; throw le
      }
      log(`agent ${(opts && opts.label) || ''} attempt ${i + 1}/${retries + 1} failed: ${msg.slice(0, 140)}`)
      if (i < retries) await sleep(1500 * (i + 1))
    }
  }
  throw last
}

// ── shared prompt fragments ──────────────────────────────────────────────────────────────────
const TEST_BLOCK = `How to run checks (run them FROM \`${TEST_DIR}\`):${COMPILE_CMD ? `\n  - Compile/syntax gate: \`${COMPILE_CMD}\`` : ''}
  - Targeted (MUST be green): \`${TARGETED_TEST}\`${FULL_TEST ? `\n  - Full suite (regression visibility): \`${FULL_TEST}\`` : ''}${BASELINE ? `\nBaseline: ${BASELINE}` : ''}`

const RULES_BLOCK = `Project rules you MUST follow:
- Keep the diff MINIMAL and surgical — mirror the surrounding style; do not refactor unrelated code.
- Immutability: never mutate inputs in place; return new objects/strings. Match the file's existing idioms.
- Do NOT edit version files (e.g. pyproject \`version = ...\`); CI bumps versions on merge.
- No hardcoded secrets. No stray debug prints / console.log in committed code.
- Respect every constraint in the spec's "Constraints" section verbatim.`

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════════════════════════════════
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lens', 'claims', 'verdict', 'summary'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['spec-accurate', 'minor-corrections', 'major-corrections'] },
    claims: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['claim', 'status', 'evidence'],
        properties: {
          claim: { type: 'string' },
          status: { type: 'string', enum: ['confirmed', 'partial', 'refuted', 'unverifiable'] },
          evidence: { type: 'string', description: 'file:line citation(s) + a short verbatim quote' },
          correction: { type: 'string', description: 'how the spec should be corrected, if status != confirmed' },
        },
      },
    },
    corrections: { type: 'array', items: { type: 'string' }, description: 'load-bearing corrections the implementer MUST apply' },
    extraRisks: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'filesChanged', 'compileClean', 'targetedPassed', 'buildPassed'],
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'array', items: { type: 'string' }, description: 'names of the unit tests added' },
    compileClean: { type: 'boolean' },
    targetedPassed: { type: 'boolean' },
    targetedOutput: { type: 'string', description: 'tail of the targeted test run (pass/fail counts)' },
    fullSuite: { type: 'string', description: 'pass/fail counts of the full suite + any NEW failures vs baseline' },
    buildPassed: { type: 'boolean', description: 'true iff compile clean AND targeted green AND no NEW full-suite regressions' },
    diffSummary: { type: 'string', description: 'concise human-readable summary of the diff (what changed where)' },
    commitMessage: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lens', 'verdict', 'findings', 'summary'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'concerns', 'block'] },
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          location: { type: 'string', description: 'file:line' },
          suggestedFix: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const ARBITER_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['decision', 'rationale', 'blockingFindings'],
  properties: {
    decision: { type: 'string', enum: ['ship', 'fix', 'escalate'] },
    rationale: { type: 'string' },
    blockingFindings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'detail'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          location: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
    residualRisks: { type: 'array', items: { type: 'string' } },
    recommendedCommitMessage: { type: 'string' },
    integratorNote: { type: 'string', description: 'what to tell the integrator (e.g. SHA bump, PR target)' },
  },
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Lens definitions (overridable via args)
// ═══════════════════════════════════════════════════════════════════════════════════════════
const DEFAULT_VERIFY_LENSES = Array.isArray(A.verifyLenses) && A.verifyLenses.length ? A.verifyLenses : [
  'DATA-FLOW lens: trace the runtime path the spec claims is the one being fixed (the "happy path" and which code actually executes at runtime vs which is legacy/test-only). Confirm every "Verify first" bullet about WHICH path is live and HOW data reaches the changed function. Cite file:line for each.',
  'EDGE-CASE & CONSTRAINT lens: verify the spec\'s claims about edge cases, clearing/flush semantics, interactions with adjacent existing behavior, and every item in the spec\'s "Constraints" section. Confirm the exact cited line numbers/symbols still exist and say what the spec says. Cite file:line.',
]
const DEFAULT_REVIEW_LENSES = (A.review && Array.isArray(A.review.lenses) && A.review.lenses.length) ? A.review.lenses : [
  { key: 'semantics', model: MODELS.review, brief: 'CORRECTNESS/SEMANTICS lens: does the implemented logic actually achieve the spec\'s intended behavior in every case the spec enumerates? Reason through each branch with concrete example inputs. Hunt for off-by-one slicing, wrong case ordering, missed states.' },
  { key: 'regression', model: MODELS.review, brief: 'REGRESSION/ORDERING lens: does the change break any ADJACENT existing behavior the spec says must be preserved? Pay special attention to interaction order between the new logic and pre-existing logic that touches the same data, and to any state that persists across calls. Verify existing tests still pass and the change does not alter unrelated outputs.' },
  { key: 'constraints', model: 'sonnet', brief: 'CONSTRAINT-COMPLIANCE lens: check every rule in the spec\'s "Constraints" section AND the project rules (minimal diff, no version-file edits, immutability, no debug prints, no forbidden implicit behaviors). Flag any scope creep or violated constraint.' },
  { key: 'tests', model: 'sonnet', brief: 'TEST-COVERAGE lens: do the added unit tests actually cover EVERY case the spec\'s "Tests" section requires? Would each test FAIL if the implementation were wrong (are they real assertions, not tautologies)? Identify any required case left untested.' },
]

// ═══════════════════════════════════════════════════════════════════════════════════════════
// P1 — VERIFY (parallel, read-only)
// ═══════════════════════════════════════════════════════════════════════════════════════════
phase('Verify')
log(`feature-spec: implementing ${SPEC} for ${NAME} — verifying spec claims against source (${DEFAULT_VERIFY_LENSES.length} lenses)`)

const verifyResults = (await parallel(DEFAULT_VERIFY_LENSES.map((brief, i) => () => tryAgent(
`You are a READ-ONLY verification agent for the implementation spec \`${SPEC}\` in ${NAME}. You do NOT edit any files.
Your lens: ${brief}

Read \`${SPEC}\` in full, then open the actual source files it cites and CONFIRM or REFUTE each load-bearing factual claim the spec makes (especially everything under its "Verify first" / "proven from source" sections — some of it was inferred and may be wrong). For each claim: give status (confirmed/partial/refuted/unverifiable) with a file:line citation and a short verbatim quote of the code that proves it. List any "corrections" the implementer MUST apply (claims that are wrong and would cause a bad fix). Note extra risks you spot that the spec missed.
Return VERIFY_SCHEMA.`,
  { label: `verify:${i + 1}`, phase: 'Verify', model: MODELS.verify, agentType: 'diagnosis', schema: VERIFY_SCHEMA })))).filter(Boolean)

if (limitHit) return { phase: 'verify', resumable: true, reason: 'usage/rate limit during verify', verifyResults }
if (!verifyResults.length) return { phase: 'verify', resumable: true, reason: 'all verify lenses returned null', verifyResults }

const allCorrections = Array.from(new Set(verifyResults.flatMap((v) => v.corrections || [])))
const refuted = verifyResults.flatMap((v) => (v.claims || []).filter((c) => c.status === 'refuted'))
const verifyVerdict = verifyResults.some((v) => v.verdict === 'major-corrections') ? 'major-corrections'
  : verifyResults.some((v) => v.verdict === 'minor-corrections') ? 'minor-corrections' : 'spec-accurate'
log(`verify: verdict=${verifyVerdict}; ${allCorrections.length} correction(s); ${refuted.length} refuted claim(s)`)

const correctionBrief = allCorrections.length
  ? `\n\nIMPORTANT — the verification pass found these corrections to the spec; APPLY them (the spec text may be wrong on these points):\n${allCorrections.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`
  : '\n\nThe verification pass confirmed the spec is accurate against source — implement it as written.'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// P2 — IMPLEMENT (serial, single writer on the working tree)
// ═══════════════════════════════════════════════════════════════════════════════════════════
phase('Implement')
if (lowBudget()) return { phase: 'implement', resumable: true, reason: 'token budget nearly exhausted before implement', verifyResults }

let impl = await tryAgent(
`You are the IMPLEMENT agent for ${NAME}. Implement the spec \`${SPEC}\` FULLY on the CURRENT working tree (you are already on the correct branch — do NOT create branches, do NOT commit, do NOT push, do NOT open a PR).
Primary source file: ${PRIMARY_FILE}. Add unit tests to: ${TEST_FILE}.${correctionBrief}

Steps:
 1. Read \`${SPEC}\` and the source files it cites. Build on the EXISTING code and mirror its style exactly.
 2. Apply the MINIMAL change the spec describes — surgical, immutable-friendly, no unrelated refactors. Implement the real behavior (no stubs/TODOs).
 3. Add the unit tests the spec's "Tests" section enumerates — one assertion per required case, each must genuinely fail if the implementation is wrong.
 4. Run the checks below and fix every error until green:
${TEST_BLOCK}
${RULES_BLOCK}

Report: filesChanged, testsAdded (test function names), compileClean, targetedPassed (+ targetedOutput tail), fullSuite (counts + any NEW failures vs baseline), buildPassed (true ONLY if compile clean AND targeted green AND no new full-suite regressions), diffSummary, a conventional-commit commitMessage (type \`${COMMIT_TYPE}\`), and any blockers. Do NOT commit.
Return IMPL_SCHEMA.`,
  { label: 'implement', phase: 'Implement', model: MODELS.implement, agentType: 'Python Specialist', schema: IMPL_SCHEMA })

if (limitHit) return { phase: 'implement', resumable: true, reason: 'usage/rate limit during implement', verifyResults, impl }
if (!impl) return { phase: 'implement', resumable: true, reason: 'implement agent returned null', verifyResults }
log(`implement: buildPassed=${impl.buildPassed} compile=${impl.compileClean} targeted=${impl.targetedPassed}; files=${(impl.filesChanged || []).join(', ')}`)

// ═══════════════════════════════════════════════════════════════════════════════════════════
// P3 + P4 + P5 — REVIEW → ARBITER → bounded FIX loop
// ═══════════════════════════════════════════════════════════════════════════════════════════
const reviewRounds = []
const arbiterRounds = []
const fixRounds = []
let finalDecision = null

const runReview = async (round) => {
  phase('Review')
  const correctionsCtx = allCorrections.length ? `\nVerify-phase corrections that were applied: ${allCorrections.join(' | ')}` : ''
  const results = (await parallel(DEFAULT_REVIEW_LENSES.map((lens) => () => tryAgent(
`You are an ADVERSARIAL reviewer for the just-implemented change against spec \`${SPEC}\` in ${NAME}. Your job is to BREAK it — default to skepticism; only return verdict "pass" if you genuinely cannot find a real problem.
Your lens: ${lens.brief}

Read \`${SPEC}\`, then read the CURRENT state of the changed files (use git diff against HEAD to see exactly what changed) and the new tests. Reason concretely. For each real problem give a finding with severity (blocker = ships a bug or violates a hard constraint; major = likely wrong/risky; minor = nit), a file:line location, and a concrete suggestedFix.
Implement summary under review: ${impl.summary}
Test status: compileClean=${impl.compileClean}, targetedPassed=${impl.targetedPassed}, fullSuite=${impl.fullSuite || 'n/a'}${correctionsCtx}
Return REVIEW_SCHEMA.`,
    { label: `review:${lens.key}${round > 1 ? `:r${round}` : ''}`, phase: 'Review', model: lens.model || MODELS.review, agentType: 'Code Reviewer', schema: REVIEW_SCHEMA })))).filter(Boolean)
  reviewRounds.push(results)
  const blockers = results.flatMap((r) => (r.findings || []).filter((f) => f.severity === 'blocker'))
  const majors = results.flatMap((r) => (r.findings || []).filter((f) => f.severity === 'major'))
  log(`review round ${round}: ${results.map((r) => `${r.lens || '?'}=${r.verdict}`).join(', ')}; ${blockers.length} blocker(s), ${majors.length} major(s)`)
  return results
}

const runArbiter = async (reviews, round) => {
  phase('Arbiter')
  const pack = reviews.map((r) => `- [${r.lens}] verdict=${r.verdict}; findings: ${(r.findings || []).map((f) => `(${f.severity}) ${f.title}${f.location ? ' @' + f.location : ''}`).join('; ') || 'none'}`).join('\n')
  const verdict = await tryAgent(
`You are the ARBITER for the implementation of spec \`${SPEC}\` in ${NAME}. Decide whether the change is ready to hand to a human for commit.
Honest-findings rule: a finding is BLOCKING only if it is real and within the spec's scope (ships a bug, breaks a preserved behavior, or violates a hard constraint). Out-of-scope ideas, style nits, and pre-existing issues are NOT blocking — list them as residualRisks instead. Do not invent findings to seem thorough.

Test gate (objective): buildPassed=${impl.buildPassed}, compileClean=${impl.compileClean}, targetedPassed=${impl.targetedPassed}, fullSuite=${impl.fullSuite || 'n/a'}. If the targeted suite is RED or compile failed, decision MUST be "fix".

Review findings (round ${round}):
${pack}

Decide: "ship" (no blocking findings AND test gate green), "fix" (blocking findings or red gate that a bounded fix can resolve), or "escalate" (contradictory/unresolvable — needs the human). Provide a recommendedCommitMessage (conventional-commit, type \`${COMMIT_TYPE}\`) and an integratorNote (PR targets \`${PR_TARGET}\`; mention the human should hand the integrator the commit SHA after committing).
Return ARBITER_SCHEMA.`,
    { label: `arbiter${round > 1 ? `:r${round}` : ''}`, phase: 'Arbiter', model: MODELS.arbiter, agentType: 'Software Architect', schema: ARBITER_SCHEMA })
  arbiterRounds.push(verdict)
  log(`arbiter round ${round}: decision=${verdict ? verdict.decision : 'null'}; ${verdict ? (verdict.blockingFindings || []).length : 0} blocking`)
  return verdict
}

let round = 1
let reviews = await runReview(round)
if (limitHit) return { phase: 'review', resumable: true, reason: 'usage/rate limit during review', verifyResults, impl, reviewRounds }
let arb = await runArbiter(reviews, round)
finalDecision = arb

while (arb && arb.decision === 'fix' && round <= MAX_FIX_LOOPS) {
  if (limitHit) break
  if (lowBudget()) { log('budget floor reached — stopping fix loop'); break }
  phase('Fix')
  const blocking = (arb.blockingFindings || [])
  const fixList = blocking.map((b, i) => `  ${i + 1}. ${b.title} — ${b.detail}${b.location ? ` [${b.location}]` : ''}${b.suggestedFix ? ` → suggested: ${b.suggestedFix}` : ''}`).join('\n')
  log(`fix round ${round}: resolving ${blocking.length} blocking finding(s)`)
  const fix = await tryAgent(
`You are the FIX agent for the implementation of spec \`${SPEC}\` in ${NAME}. Resolve ONLY these blocking findings on the working tree — keep the diff minimal, do NOT introduce new scope, do NOT commit/push:
${fixList || '  (no explicit blocking findings listed — re-read the arbiter rationale and the red test output, then fix the failure)'}

After fixing, re-run the checks and confirm green:
${TEST_BLOCK}
${RULES_BLOCK}
Report the updated IMPL_SCHEMA fields (filesChanged, testsAdded, compileClean, targetedPassed, targetedOutput, fullSuite, buildPassed, diffSummary, commitMessage, blockers, notes). Do NOT commit.
Return IMPL_SCHEMA.`,
    { label: `fix:r${round}`, phase: 'Fix', model: MODELS.fix, agentType: 'Python Specialist', schema: IMPL_SCHEMA })
  fixRounds.push(fix)
  if (!fix) { log(`fix round ${round} returned null — stopping`); break }
  impl = fix // the working tree now reflects the fix; subsequent reviews read the new state
  log(`fix round ${round}: buildPassed=${fix.buildPassed} targeted=${fix.targetedPassed}`)
  if (limitHit) break

  round += 1
  reviews = await runReview(round)
  if (limitHit) break
  arb = await runArbiter(reviews, round)
  finalDecision = arb
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Return — leave the tree as-is for the human to inspect/commit (NO git side effects performed)
// ═══════════════════════════════════════════════════════════════════════════════════════════
return {
  spec: SPEC,
  project: NAME,
  verify: { verdict: verifyVerdict, corrections: allCorrections, refutedCount: refuted.length, lenses: verifyResults },
  implement: {
    summary: impl.summary,
    filesChanged: impl.filesChanged,
    testsAdded: impl.testsAdded,
    compileClean: impl.compileClean,
    targetedPassed: impl.targetedPassed,
    fullSuite: impl.fullSuite,
    buildPassed: impl.buildPassed,
    diffSummary: impl.diffSummary,
    blockers: impl.blockers,
  },
  reviewRounds,
  arbiterRounds,
  fixRounds: fixRounds.length,
  decision: finalDecision ? finalDecision.decision : 'unknown',
  residualRisks: finalDecision ? (finalDecision.residualRisks || []) : [],
  recommendedCommitMessage: (finalDecision && finalDecision.recommendedCommitMessage) || impl.commitMessage,
  prTarget: PR_TARGET,
  integratorNote: finalDecision ? finalDecision.integratorNote : null,
  committed: false,
  reason: finalDecision && finalDecision.decision === 'ship'
    ? 'Implemented, tested, and reviewed clean. Working tree ready for human commit → push → PR (no git side effects performed by the workflow).'
    : finalDecision && finalDecision.decision === 'escalate'
      ? 'Arbiter escalated — needs human judgment before commit. See arbiterRounds + reviewRounds.'
      : `Fix loop exhausted (${MAX_FIX_LOOPS} max) without a clean ship — review remaining findings before committing.`,
}
