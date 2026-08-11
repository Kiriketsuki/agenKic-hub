/**
 * council-loop.mjs — standalone adversarial council fix-loop (background Workflow).
 *
 * Reviews whatever is already in the working tree (a feature/PR branch) and drives it
 * to an UNCONDITIONAL FOR:
 *   Review (advocate ∥ critic [∥ questioner]) → Arbiter verdict → Fix in-PR → re-review … → Verify
 *
 * This is feature-loop.mjs Phase 5 lifted out so any branch — not just one built by
 * feature-loop — can be put through the same council gate.
 *
 * RULES:
 *   1. NO NEW ISSUES. Every follow-up, defect, or nit the council raises is handled as an
 *      IN-PR update — applied directly to the working tree on the current branch. The
 *      workflow NEVER creates a GitHub issue or new branch for follow-ups.
 *   2. GIT IS IN SCOPE. Each fix round stages its work and commits with a semantic
 *      conventional-commit message, then pushes to update the PR — so the branch carries a
 *      readable per-round history. On an unconditional FOR it optionally squash-merges into
 *      the parent (set `merge: true`); otherwise it leaves the converged, pushed branch for
 *      the caller (the driver or feature-loop) to merge. The gh-pr-merge approval hook still
 *      applies — allow/approve `gh pr merge --squash` for an unattended merge.
 *
 * Invoke (from the driver, or nested via workflow()) BY ABSOLUTE scriptPath — the name registry
 * does NOT resolve ~/.claude/workflows/*.mjs (only built-ins), so `{ name: "council-loop" }` errors.
 * An absolute path resolves the same from any cwd/OS (a RELATIVE one would resolve against the
 * project cwd and break):
 *   Workflow({ scriptPath: "/absolute/path/to/.claude/workflows/council-loop.mjs", args: <TARGET> })
 *
 * TARGET = {
 *   title,                                    // what's under review (1 line)
 *   target: { branch, parentRef, pr },        // parentRef e.g. "origin/main" (default). Pass branch when known;
 *                                             // a pr-only target gets its head branch resolved up front so the
 *                                             // branch pin and merge target lock are never empty
 *   scope,                                    // optional: explicit "review only X / ignore Y" note
 *   project: { name, buildCmd, testCmd, specFile },
 *   liveValidate,                             // optional: instructions to prove behavior on a REAL backend
 *   envNote,                                  // optional: env/setup note
 *   agentType,                                // fix-agent routing (default "Senior Developer")
 *   merge,                                    // optional: true to squash-merge into parentRef on an unconditional FOR (default false)
 *   extraRules,                               // optional: project-specific rules appended
 *   council: {                                // ---- flexible tuning (all optional) ----
 *     advocates,         // default 1
 *     critics,           // default 1
 *     questioner,        // default false — set true to add a real Socratic questioner lens
 *     rounds,            // default 2 — debate depth per agent within one council
 *     maxLoops,          // default 10 — bounded cap on council convenings (fix→re-review iterations)
 *     requireUnconditional, // default true — converge ONLY on unconditional FOR
 *     applyNonBlockers,  // default true — fix non-blockers (cosmetic + follow-ups) in-loop too; converge on ZERO findings
 *     model: { advocate, critic, questioner, arbiter, fixPlan, fix, fixReview, merge, verify }, // per-role model overrides
 *     effort: { advocate, critic, fixPlan, fix, fixReview },         // per-role reasoning effort overrides
 *   },
 * }
 */

export const meta = {
  name: 'council-loop',
  description: 'Standalone adversarial council fix-loop over the working tree: review → fix in-PR + semantic commit/push → re-review until unconditional FOR with zero findings (default 1v1, no questioner, 2 debate rounds, bounded at 10 councils), then optionally squash-merge. Never files issues; commits/pushes per round.',
  phases: [
    { title: 'Council', detail: 'advocate ∥ critic (∥ optional questioner) + arbiter; fix-then-review loop to unconditional FOR; each fix round commits semantically and pushes; follow-ups applied in-PR, never as issues' },
    { title: 'Verify', detail: 'build + tests on the final state; reports mergeable' },
    { title: 'Merge', detail: 'optional (merge:true): squash-merge into the parent on an unconditional FOR' },
  ],
}

// --- defensive args (a stringified payload silently loses scope on the first real run) ---
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const T = A.target || {}
const PROJ = A.project || {}
const NAME = PROJ.name || 'this project'
const SPEC = PROJ.specFile || null
const BUILD = PROJ.buildCmd || 'npm run build'
const TEST = PROJ.testCmd || 'npm test'
const PARENT = T.parentRef || 'origin/main'
const PRREF = T.pr ? ` (PR ${T.pr})` : (T.branch ? ` (branch ${T.branch})` : '')
const TITLE = A.title || 'the changes on this branch'
const AGENT = A.agentType || 'Senior Developer'
const MERGE = A.merge === true

// council knobs — defaults: 1v1, no questioner, 2 debate rounds, bounded at 10 councils, unconditional FOR + zero findings
const C = Object.assign(
  { advocates: 1, critics: 1, questioner: false, rounds: 2, maxLoops: 10, requireUnconditional: true, applyNonBlockers: true },
  A.council || {})
const M = Object.assign(
  { advocate: 'opus', critic: 'opus', questioner: 'sonnet', arbiter: 'fable', fixPlan: 'fable', fix: 'opus', fixReview: 'fable', merge: 'sonnet', verify: 'sonnet' },
  (A.council && A.council.model) || {})
// per-role reasoning effort. Bounds spend on the opus and fable roles.
const E = Object.assign(
  { advocate: 'low', critic: 'low', fixPlan: 'medium', fix: 'low', fixReview: 'low' },
  (A.council && A.council.effort) || {})

// --- limit-aware retry + resumable stop ----------------------------------------------------
// Backs off on transient blips (529/overloaded/timeout) but BAILS FAST on a hard usage/rate
// limit: retrying inside a blocked window is futile and risks a degraded (empty) result being
// mistaken for a real one. A hard limit sets `limitHit`; the loop checks it at safe boundaries
// and stops with { resumable:true } so the run can be continued via
// Workflow({ scriptPath, args, resumeFromRunId }) — completed agent() calls replay from cache.
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
const FLOOR = (A.minBudget !== undefined && A.minBudget !== null) ? A.minBudget : 80000
const lowBudget = () => (typeof budget !== 'undefined' && budget && budget.total && typeof budget.remaining === 'function' && budget.remaining() < FLOOR)

// --- the two hard rules, injected into every agent that can touch the tree ---
const NOISSUE = `STRICT: Never create — or suggest deferring work to — a new GitHub issue or branch. Every follow-up, defect, or improvement the council raises is an IN-PR update: applied directly to the working tree on the current branch${PRREF}. There is exactly one destination for all findings — this PR.`
// BRANCH PIN — the shared checkout is used by MANY agents across councils; whatever branch a
// previous agent left checked out is NOT trustworthy. Every tree-touching agent must verify the
// branch FIRST, and nothing may ever be committed to or pushed to main/the parent branch.
// (Observed 2026-06-10 AutoClaims F3: a fix agent inherited a checkout left on `main`, committed
// the feature's entire implementation there and pushed — auto-merging the epic PR on GitHub and
// firing a version bump. The branch pin makes that class of accident impossible.)
const PARENT_BRANCH = PARENT.replace(/^origin\//, '')
// Council review F1 (2026-07-30): BRANCH_PIN used to collapse to '' when T.branch was unset
// (a documented pr-only input shape), silently removing every branch-safety instruction from
// the tree-mutating agents. Now: pr-only callers get the branch resolved up front (see the
// resolver agent below, before the loop); a caller with NEITHER branch nor pr runs in
// working-tree mode with a reduced pin that still forbids touching main/the parent.
const branchPin = () => T.branch
  ? `\nBRANCH PIN (critical): all work for this council happens ON BRANCH ${T.branch}. FIRST run \`git rev-parse --abbrev-ref HEAD\`; if the checkout is not on ${T.branch}, run \`git checkout ${T.branch}\` (then \`git pull --ff-only origin ${T.branch}\` if it has an upstream) BEFORE doing anything else. If the working tree is dirty with ANOTHER branch's work, STOP and report it instead of checking out over it. NEVER run \`git commit\` or \`git push\` while on ${PARENT_BRANCH} or main, and NEVER push to ${PARENT_BRANCH} or main — the ONLY branch you may push is ${T.branch}.`
  : `\nBRANCH PIN (critical, reduced — no target branch was resolved): FIRST run \`git rev-parse --abbrev-ref HEAD\`. If the checkout is on ${PARENT_BRANCH} or main, STOP and report — NEVER commit or push there. Work only on the branch already checked out, and never push any ref you did not verify by name.`
const COMMIT = (n) => `When the fixes build clean, commit them SEMANTICALLY: one conventional commit per logical fix (or per tightly related group), never one opaque "round ${n} fixes" blob. Each subject is \`<type>(<scope>): <what changed>\` and each body states (a) the council finding it addresses and (b) why the fix matters (the failure it prevents). STE form: short sentences, no em-dash, no semicolon, no contraction. Then push${T.branch ? ` with \`git push origin ${T.branch}\`` : ' to update the PR'}${PRREF}. Before committing, re-verify \`git rev-parse --abbrev-ref HEAD\`${T.branch ? ` prints ${T.branch}` : ' is the PR branch'} — if not, STOP and report. If there is nothing to commit (the work was already committed on a prior attempt), do NOT error — skip the commit and just ensure the branch is pushed${T.branch ? ` (\`git push --force-with-lease origin ${T.branch}\`)` : ' (plain \`git push\` of the verified current branch only — NEVER force-push an unresolved ref)'}. AFTER pushing, VERIFY the push landed: \`git ls-remote origin ${T.branch || '<branch>'}\` must print the same SHA as \`git rev-parse HEAD\`; report pushed:true/false accordingly. Do NOT squash, rebase, or merge — just commit + push this round's work.`

const SCOPENOTE = A.scope ? `\nReview scope: ${A.scope}` : ''
// Council review follow-up (2026-07-30): ENV was defined but never injected — envNote silently
// did nothing. It now leads both the review preamble and the fix rules, since environment
// context (repo location, cwd caveats) must be read BEFORE any git command runs.
const ENV = A.envNote ? `\nEnvironment: ${A.envNote}` : ''
const RULES = `${ENV}
Project rules you MUST follow when applying fixes:
- Immutability: never mutate inputs; return new objects/arrays.
- Many small focused files; JSDoc/types on exported APIs. No console.log in committed code.
- Validate inputs at boundaries; never trust client data. No hardcoded secrets (env vars + .env.example only).
- Preserve existing UX/visual treatment unless a finding explicitly requires changing it.
- If you add deps, update the lockfile (CI runs a clean install). Do NOT edit version files (CI bumps on merge).
- ${NOISSUE}${A.extraRules ? '\n- ' + A.extraRules : ''}`

// A function (not a const) so the pr-only branch resolution below is honored: T.branch may be
// assigned after module init, and every prompt built later must see the branch-pinned variant.
const review = () => T.branch
  // Branch-pinned review: reviewers run in PARALLEL on a shared checkout, so they must NEVER
  // checkout/mutate the tree. Review the COMMITTED state of the branch directly via refs.
  ? `${ENV}Inspect the changes under review with \`git fetch origin ${T.branch} --quiet; git diff ${PARENT}...origin/${T.branch} -- . ':(exclude)package-lock.json' ':(exclude)uv.lock'\` and read full files with \`git show origin/${T.branch}:<path>\`. Do NOT \`git checkout\`, do NOT modify the working tree, and IGNORE the working tree's current state — the committed branch ${T.branch} is the single source of truth for this review.${SCOPENOTE}`
  : `${ENV}Inspect the changes under review with \`git diff ${PARENT} -- . ':(exclude)package-lock.json'\` (modified tracked files) and \`git status --porcelain\` (NEW untracked files — read those directly). Work is uncommitted in the working tree.${SCOPENOTE}`

// ---------------- Schemas ----------------
// severity is an ENUM so the isCosmetic split below can never diverge from what the arbiter
// intends to demote (council review F2, 2026-07-30: a free-form "minor" landed in blocking,
// which the convergence test then discarded).
const VERDICT_SCHEMA = { type: 'object', additionalProperties: false, required: ['verdict', 'unconditional', 'rationale'], properties: { verdict: { type: 'string', enum: ['FOR', 'AGAINST', 'CONDITIONAL'] }, unconditional: { type: 'boolean' }, conditions: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['description', 'severity'], properties: { description: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'cosmetic'] }, fix: { type: 'string' } } } }, followUps: { type: 'array', items: { type: 'string' } }, rationale: { type: 'string' } } }
const FIX_SCHEMA = { type: 'object', additionalProperties: false, required: ['applied', 'buildPassed'], properties: { applied: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item'], properties: { item: { type: 'string' }, file: { type: 'string' }, change: { type: 'string' } } } }, buildPassed: { type: 'boolean' }, pushed: { type: 'boolean' }, notes: { type: 'string' } } }
const FIXREVIEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } }
const VERIFY_SCHEMA ={ type: 'object', additionalProperties: false, required: ['build', 'mergeable'], properties: { build: { type: 'string', enum: ['pass', 'fail'] }, tests: { type: 'string', enum: ['pass', 'fail', 'none'] }, output: { type: 'string' }, mergeable: { type: 'boolean' } } }
const MERGE_SCHEMA = { type: 'object', additionalProperties: false, required: ['merged'], properties: { merged: { type: 'boolean' }, blocked: { type: 'boolean' }, output: { type: 'string' } } }

const isCosmetic = (sev) => /^(low|cosmetic|nit|info|trivial)/i.test(sev || '')
const fmt = (f) => `${f.severity || ''}: ${f.description}${f.file ? ` (${f.file}${f.line ? ':' + f.line : ''})` : ''}${f.fix ? ` — fix: ${f.fix}` : ''}`

// ---------------- Phase 1: Council (fix-THEN-review loop → unconditional FOR) ----------------
phase('Council')

// Council review F1 (2026-07-30): a pr-only caller gets the head branch resolved BEFORE any
// tree-mutating agent runs, so the full BRANCH_PIN and the merge TARGET LOCK are never empty.
// Workflow scripts have no exec access, so a tiny read-only agent does the lookup.
if (!T.branch && T.pr) {
  const resolved = await tryAgent(
    `Run \`gh pr view ${T.pr} --json headRefName,baseRefName\` and report the result. Read-only: run NOTHING else.`,
    { label: 'resolve-branch', phase: 'Council', model: 'sonnet',
      schema: { type: 'object', additionalProperties: false, required: ['headRefName'], properties: { headRefName: { type: 'string' }, baseRefName: { type: 'string' } } } })
  if (resolved && resolved.headRefName) {
    T.branch = resolved.headRefName
    log(`resolved PR ${T.pr} head branch: ${T.branch}`)
  } else {
    log(`could not resolve the head branch for PR ${T.pr} — fix agents run with the reduced pin`)
  }
}

const advNames = Array.from({ length: C.advocates }, (_, i) => `ADVOCATE${C.advocates > 1 ? i + 1 : ''}`)
const critNames = Array.from({ length: C.critics }, (_, i) => `CRITIC${C.critics > 1 ? i + 1 : ''}`)
let verdict = null, pending = null, iter = 0, stalled = false, converged = false
let stopReason = null                  // 'budget' | 'limit' | 'review-incomplete' | 'fix-failed' → resumable stop (never merges)
let lastBlocking = []                  // blocking findings from the most recent judged round (surfaced top-level)
const history = []

try {
for (iter = 1; iter <= C.maxLoops; iter++) {
  if (lowBudget()) { stopReason = 'budget'; break }   // stop before spending a whole round we can't finish
  // fix FIRST (from the previous round's findings) so each review reflects the latest code — all in-PR
  if (pending && pending.length) {
    // fix pipeline: plan (fable, medium) -> implement (opus, low) -> review (fable, low)
    const plan = await tryAgent(
`Plan the fixes for these council findings on ${TITLE}${PRREF} (${NAME}). READ the cited code first. For each finding: the exact file(s) and change, the order of application, risks and interactions between fixes, and the semantic commit split (one conventional commit per logical fix, subject + one-line why). Do NOT edit anything. Output a numbered plan as text.
${pending.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
      { label: `fix-plan#${iter}`, phase: 'Council', model: M.fixPlan, effort: E.fixPlan })
    if (limitHit) { stopReason = 'limit'; break }
    const fix = await tryAgent(
`Apply these council-raised fixes to ${TITLE}${PRREF} as IN-PR updates in the working tree. Follow the plan below. Implement each fully, verify by reading the result, then run \`${BUILD}\`${A.liveValidate ? ' and re-validate the backend if a fix touched it' : ''}.${branchPin()}
${pending.map((b, i) => `${i + 1}. ${b}`).join('\n')}
${plan ? `\nPLAN (from the planning agent — deviate only with a stated reason in notes):\n${plan}\n` : ''}
${RULES}
${COMMIT(iter)}`,
      { label: `fix#${iter}`, phase: 'Council', model: M.fix, effort: E.fix, agentType: AGENT, schema: FIX_SCHEMA })
    // Council review F3 (2026-07-30): the fix result used to be discarded. A build failure or
    // an unlanded push means the next review would re-read IDENTICAL committed code and
    // re-litigate the same findings until maxLoops — a silent budget burn misreported as
    // "did not converge". Stop resumable with the real cause instead.
    // Ultracode review (2026-08-02): FIX_SCHEMA does not require `pushed`, so a
    // model that omits it yields undefined, and `undefined === false` let the
    // unlanded-push arm never fire. In branch mode only an explicit true counts.
    if (fix && (fix.buildPassed === false || (T.branch && fix.pushed !== true))) {
      log(`fix round ${iter} did not land (buildPassed=${fix.buildPassed} pushed=${fix.pushed}): ${(fix.notes || '').slice(0, 200)}`)
      stopReason = 'fix-failed'
      break
    }
    // fix review: a cheap fable pass that checks each pending item actually landed as planned
    // BEFORE the full council re-reviews. On a reject, the issues become the next round's
    // pending and we re-fix (bounded by maxLoops and the budget guard) instead of burning a
    // full advocate/critic/arbiter round on a botched fix.
    const fr = await tryAgent(
`Review the fix commits just pushed for ${TITLE}${PRREF} (${NAME}). ${review()}
Check ONLY that each item below was fully and correctly implemented (read the code, no fabrication), that no fix introduced an obvious new defect, and that the commits are semantic (one logical fix per commit, body states the finding and why the fix matters). Do NOT re-review the whole PR. ok=true if all items landed. Otherwise list each problem as a self-contained fix instruction in issues.
${pending.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
      { label: `fix-review#${iter}`, phase: 'Council', model: M.fixReview, effort: E.fixReview, schema: FIXREVIEW_SCHEMA })
    if (limitHit) { stopReason = 'limit'; break }
    if (fr && fr.ok === false && Array.isArray(fr.issues) && fr.issues.length) {
      log(`fix review round ${iter} rejected ${fr.issues.length} item(s) — re-fixing next round`)
      pending = fr.issues
      continue
    }
    pending = null
  }

  const lenses = [
    ...advNames.map(n => () => tryAgent(
`You are ${n} in an adversarial council on ${TITLE}${PRREF} (${NAME}). ${review()}
${SPEC ? `Verify against ${SPEC} (acceptance criteria). ` : ''}Argue FOR merging with the strongest evidence-based case; ground every claim in file:line; honestly flag what you cannot defend. <=${C.rounds} rounds. Output text.`,
      { label: `${n.toLowerCase()}#${iter}`, phase: 'Council', model: M.advocate, effort: E.advocate })),
    ...critNames.map(n => () => tryAgent(
`You are ${n} in an adversarial council on ${TITLE}${PRREF} (${NAME}). ${review()}
READ each cited file to confirm issues (no fabrication). Find REAL blocking defects: ${SPEC ? 'spec violations, ' : ''}security gaps, bugs, missing error handling, mutation, broken build/tests, unmet acceptance criteria. Every finding needs file:line + one-line fix + severity. "No blocking issues" is a valid honest result. <=${C.rounds} rounds. Output text.`,
      { label: `${n.toLowerCase()}#${iter}`, phase: 'Council', model: M.critic, effort: E.critic })),
    ...(C.questioner ? [() => tryAgent(
`You are the QUESTIONER in an adversarial council on ${TITLE}${PRREF} (${NAME}). ${review()}
You do NOT argue for or against merging. Probe every claim — from any agent — that lacks a file:line or test/output citation. For each: state the specific question, then READ the code yourself and mark it SUBSTANTIATED or UNSUBSTANTIATED. Claims you mark UNSUBSTANTIATED must be excluded from fixes by the arbiter. <=${C.rounds} rounds. Output text.`,
      { label: `questioner#${iter}`, phase: 'Council', model: M.questioner })] : []),
  ]
  const raw = await parallel(lenses)                    // nulls for failed lenses (parallel swallows throws)
  if (limitHit) { stopReason = 'limit'; break }
  // NEVER judge unreviewed code as converged: require every critic to have actually run this round.
  // A limit/blip that silently nulls the critics would otherwise read as "no findings" → spurious merge.
  if (!critNames.every((_, j) => raw[advNames.length + j] != null)) { stopReason = 'review-incomplete'; break }
  const sides = raw.filter(Boolean)

  // CONVERGENCE TRAP (do not regress): with liveValidate:true the unconditional bar below includes
  // "backend behavior validated live" — UNSATISFIABLE when the change under review precedes its own
  // deployment (e.g. a scaffold feature in a spec-loop run). Combined with requireUnconditional:true
  // the council then churns to maxLoops without ever converging or merging (observed 2026-06-10,
  // AutoLLM F1: clean FOR twice, never unconditional). Callers MUST scope liveValidate to features
  // whose backend exists at review time (spec-loop: liveValidateFeatures), or relax
  // council.requireUnconditional. Do NOT edit the prompt text below to "fix" this — prompt changes
  // invalidate resume journals for in-flight runs.
  verdict = await tryAgent(
`You are the ARBITER of an adversarial council on ${TITLE}${PRREF} (${NAME}). Independently verify contested claims by reading the cited code. ${review()}
"unconditional" = true ONLY if FOR with ZERO blocking conditions/findings: build+tests pass${SPEC ? `, acceptance criteria in ${SPEC} met` : ''}, no security gaps${A.liveValidate ? ', backend behavior validated live' : ''}. Drop findings you cannot verify in code, that are pre-existing/unrelated${C.questioner ? ', or that the QUESTIONER marked UNSUBSTANTIATED' : ''}. Demote LOW/cosmetic nits to in-PR follow-ups (put them in followUps; do NOT block on them). Each blocking finding needs file+line+fix. ${NOISSUE}
Council positions:
${sides.map((s, i) => `--- ${i + 1} ---\n${s}`).join('\n\n')}`,
    { label: `arbiter#${iter}`, phase: 'Council', model: M.arbiter, schema: VERDICT_SCHEMA })

  // agent() resolves to null (not a throw) on a terminal API error — e.g. a hard session limit
  // that exhausted the harness's own retries. A null arbiter means this round was never judged:
  // stop resumable instead of dereferencing null (this exact crash killed run wf_a995c3db on
  // 2026-06-10: "null is not an object (evaluating 'verdict.verdict')").
  if (!verdict) { stopReason = limitHit ? 'limit' : 'review-incomplete'; break }

  history.push({ iter, verdict: verdict.verdict, unconditional: verdict.unconditional })
  log(`council round ${iter}/${C.maxLoops}: ${verdict.verdict}${verdict.unconditional ? ' (unconditional FOR)' : ''}`)

  // blocking = conditions + non-cosmetic findings. nonBlocking = explicit follow-ups + cosmetic findings (all in-PR, never issues).
  const blocking = [
    ...(verdict.conditions || []),
    ...((verdict.findings || []).filter(f => !isCosmetic(f.severity)).map(fmt)),
  ]
  const nonBlocking = [
    ...(verdict.followUps || []),
    ...((verdict.findings || []).filter(f => isCosmetic(f.severity)).map(fmt)),
  ]
  lastBlocking = blocking
  const verdictOk = verdict.verdict === 'FOR' && (!C.requireUnconditional || verdict.unconditional)
  // converged = verdict passes AND ZERO blocking findings remain AND (when applyNonBlockers) the
  // tree is fully clean. Council review F2 (2026-07-30): the !blocking.length term is load-bearing —
  // without it, an arbiter that says "unconditional FOR" while still listing a non-cosmetic finding
  // (or any plain FOR under requireUnconditional:false) converged PAST its own blocker and could
  // auto-merge it. The council's findings outrank the arbiter's self-reported flag.
  if (verdictOk && !blocking.length && (!C.applyNonBlockers || !nonBlocking.length)) { converged = true; break }

  // when applyNonBlockers, drive non-blockers to zero too; otherwise only blockers feed the next round
  const toFix = C.applyNonBlockers ? [...blocking, ...nonBlocking] : blocking
  // nothing actionable left but still not converged → re-running would re-review identical code. Stop, report honestly.
  if (!toFix.length) { stalled = true; break }
  pending = toFix
}
} catch (e) { if (e && e.limit) { stopReason = stopReason || 'limit' } else throw e }

// Resumable stop: bail BEFORE Verify/Merge. Burns no more of the blocked window, and — crucially —
// a degraded/limit-killed round can NEVER reach the merge step. Resume later with resumeFromRunId;
// the journal replays every completed agent() from cache, so only the unfinished round re-runs live.
if (stopReason && !converged) {
  const why = stopReason === 'budget' ? 'turn token budget nearly exhausted'
            : stopReason === 'review-incomplete' ? 'a council reviewer did not complete (likely a limit/blip) — refusing to judge unreviewed code'
            : stopReason === 'fix-failed' ? 'a fix round did not land (build failed or the push never reached the remote) — re-reviewing identical code would burn rounds for nothing'
            : 'hit a usage/rate limit'
  log(`council-loop stopping (resumable): ${why} at round ${iter}`)
  return {
    title: TITLE,
    target: { branch: T.branch, parentRef: PARENT, pr: T.pr },
    council: { config: C, iterations: history.length, stoppedAtRound: iter, history, finalVerdict: verdict },
    verify: null, merge: null, converged: false, resumable: true,
    reason: `stopped early — ${why}. Resume after limits/budget reset: Workflow({ scriptPath, args, resumeFromRunId }).`,
    unresolvedBlockers: lastBlocking,
    inPrFollowUps: [],
  }
}

// ---------------- Phase 2: Verify ----------------
phase('Verify')
let verify = null, merge = null
try {
  verify = await tryAgent(
`Final verification of ${TITLE}${PRREF} — do NOT change code, only verify and report.${branchPin()}
1. \`${BUILD}\` (must pass). 2. \`${TEST}\` (report pass/fail+counts; "none" if no test script).${A.liveValidate ? ' 3. Re-run the backend reset/health to confirm it still applies cleanly.' : ''}
Report concise excerpts + whether mergeable.`,
    { label: 'verify', phase: 'Verify', model: M.verify, schema: VERIFY_SCHEMA })

  // ---------------- Phase 3: Merge (optional — squash-merge on an unconditional FOR) ----------------
  // Ultracode review (2026-08-02): in pure working-tree mode T.branch and T.pr
  // both stay undefined, and every merge-phase command template then renders a
  // bare `gh pr merge`. That is the exact call the TARGET LOCK forbids, so the
  // merge phase requires a resolved target.
  if (MERGE && converged && !T.branch && !T.pr) {
    log('merge requested but no branch or PR was resolved (working-tree mode). Skipping squash-merge to avoid a bare gh pr merge.')
  } else if (MERGE && converged && verify && verify.mergeable !== false) {
    phase('Merge')
    merge = await tryAgent(
`${TITLE}${PRREF} reached an UNCONDITIONAL FOR and verification passed. Squash-merge it now. Stop and report if any step fails — never force.
TARGET LOCK (critical): the ONLY thing you may merge is the PR whose head branch is EXACTLY ${T.branch || '(the target branch)'} and whose base is ${PARENT.replace(/^origin\//, '')}. NEVER run \`gh pr view\`, \`gh pr ready\`, or \`gh pr merge\` WITHOUT an explicit PR number or branch argument — a bare call resolves against the checkout's current branch, which may be a DIFFERENT PR (e.g. the epic PR). Before step 3, confirm with \`gh pr view <ref> --json headRefName,baseRefName\` that headRefName is ${T.branch || 'the target branch'}; if it is anything else, report blocked:true and STOP.
0. IDEMPOTENCY (resume-safe): first run \`gh pr view ${T.pr || T.branch || ''} --json state,mergedAt,headRefName\`. If state is MERGED AND headRefName is ${T.branch || 'the target branch'}, do NOT merge again — report merged:true with that state and stop.
0b. ENSURE A PR EXISTS: if step 0 reported "no pull requests found" (the branch was pushed by a build agent without opening a PR), create one now targeting the parent: \`gh pr create --base ${PARENT.replace(/^origin\//, '')} --head ${T.branch || ''} --title "<type>(<scope>): <description>" --body "<one-paragraph summary of the change>"\` — the title MUST follow the conventional-commit format (e.g. \`feat(scaffold): ...\`). Then continue with the new PR number.
1. Make sure the latest work is committed and pushed (the PR should be up to date).
2. SELF-HEAL DRAFT STATE (a draft PR is the real merge blocker, not the approval hook): run \`gh pr ready ${T.pr || T.branch || ''} 2>&1 || true\` BEFORE attempting the merge (\`2>&1\` folds stderr into stdout so it is captured, not discarded; the \`|| true\` only guards the exit code). Capture and report the combined output verbatim regardless of exit code (so unexpected output, e.g. a permissions error, is surfaced rather than swallowed). If the PR was already out of draft this is a harmless no-op.
3. Squash-merge into ${PARENT}: \`gh pr merge ${T.pr || T.branch || ''} --squash --delete-branch\`.
3b. SYNC THE LOCAL PARENT AFTER A SUCCESSFUL MERGE (critical for stacked runs): the squash-merge happened on GitHub only, so the LOCAL ${PARENT.replace(/^origin\//, '')} branch is now stale — any later worktree branched from it will carry pre-squash lineage and its PR will hit a phantom merge conflict against the squashed parent. Run \`git fetch origin\` then update the local branch: if it is not checked out anywhere, \`git branch -f ${PARENT.replace(/^origin\//, '')} origin/${PARENT.replace(/^origin\//, '')}\`; if it IS the current checkout, \`git reset --hard origin/${PARENT.replace(/^origin\//, '')}\` (the tree must be clean at this point — everything was committed and pushed before the merge). Report that the sync ran.
4. IF THE MERGE FAILS, diagnose the REAL reason — run \`gh pr view ${T.pr || T.branch || ''} --json isDraft,statusCheckRollup,mergeable\` and report exactly ONE of these as the stop reason, set blocked:true, and do NOT retry:
   - "draft state" when isDraft is true (you should have cleared this in step 2; if it persists, report it).
   - "failing required checks" when statusCheckRollup contains ANY check whose state is FAILURE or CANCELLED (statusCheckRollup is an ARRAY of check objects — treat any FAILURE/CANCELLED entry as failing; an empty array means no checks are configured, so do NOT attribute the failure to checks).
   - "merge conflict" when mergeable is CONFLICTING.
   NEVER report "approval hook" (or "needs approval") as the stop reason — the approval gate is not the blocker; identify and report the actual draft/checks/conflict cause from the gh pr view output above.
Report the merge result (merged, blocked, and output including the gh pr ready stdout/stderr and any gh pr view diagnostic).`,
      { label: 'merge', phase: 'Merge', model: M.merge, agentType: AGENT, schema: MERGE_SCHEMA })
  } else if (MERGE && converged) {
    log('converged but verify reported not mergeable — skipping squash-merge')
  }
} catch (e) {
  if (e && e.limit) {
    log('council-loop hit a usage/rate limit during verify/merge — resumable')
    return {
      title: TITLE, target: { branch: T.branch, parentRef: PARENT, pr: T.pr },
      council: { config: C, iterations: history.length, history, finalVerdict: verdict },
      verify, merge: null, converged, resumable: true,
      reason: 'hit a usage/rate limit during verify/merge. Resume with resumeFromRunId once limits reset.',
      unresolvedBlockers: lastBlocking,
      inPrFollowUps: [],
    }
  }
  throw e
}

// outstanding in-PR follow-ups (explicit follow-ups + cosmetic findings). With applyNonBlockers these are empty on convergence;
// otherwise the driver folds them into the PR — NEVER an issue.
const inPrFollowUps = [
  ...((verdict && verdict.followUps) || []),
  ...(((verdict && verdict.findings) || []).filter(f => isCosmetic(f.severity)).map(fmt)),
]
const reason = converged
  ? (C.applyNonBlockers ? 'unconditional FOR — zero findings remaining (blockers + non-blockers applied in-PR)' : 'unconditional FOR')
  : stalled
    ? 'non-unconditional verdict with no actionable findings left — could not progress without re-litigating identical code'
    : `did not converge within ${C.maxLoops} council(s)`

return {
  title: TITLE,
  target: { branch: T.branch, parentRef: PARENT, pr: T.pr },
  // iterations = judged rounds (history entries). The raw loop variable over-counted by one on
  // maxLoops exhaustion (council review F4, 2026-07-30).
  council: { config: C, iterations: history.length, history, finalVerdict: verdict },
  verify,
  merge,                // squash-merge result when merge:true + converged + mergeable; null otherwise
  converged,
  resumable: false,     // reached a terminal verdict (converged or honestly stalled) — nothing to resume
  reason,
  unresolvedBlockers: lastBlocking,  // blocking findings from the last judged round — empty on convergence
  inPrFollowUps,        // apply in-PR / fold into the PR — never file as a GitHub issue
}
