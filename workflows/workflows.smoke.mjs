/**
 * workflows.smoke.mjs — orchestration smoke test for the workflow suite.
 *
 * This is a TEST HARNESS, not a workflow, so console output is allowed here. It runs under plain
 * node. It cannot `import` a workflow file, because a workflow body uses top-level `await` and
 * `return`, which only work inside the AsyncFunction wrapper of the workflow runtime.
 *
 * The harness builds that wrapper itself. It strips each leading `export ` and compiles the body
 * with the runtime globals as parameters: agent, parallel, pipeline, phase, log, workflow, args,
 * budget. It also passes a Date and a Math that throw on Date.now(), argless new Date() and
 * Math.random(), the same as the runtime. It then runs the FULL body of council-loop,
 * spec-loop, feature-loop, ultracode-fix and ultracode-implement. Each agent() call returns a
 * scripted response keyed by its label. An unscripted label returns null, which is what the
 * runtime returns for a dead subagent.
 *
 * The tests prove that a failed stage never reaches a mutation stage (merge, build, council).
 * spec-loop.smoke.mjs covers the pure helpers of spec-loop (routeFromTable, planWaves).
 *
 * Exit code is nonzero on any failed check. Run:
 *   node workflows/workflows.smoke.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const AsyncFunction = (async () => {}).constructor
const PARAMS = ['agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow', 'args', 'budget', 'Date', 'Math']

let checks = 0
let failures = 0
function assert(cond, msg) {
  checks++
  if (cond) console.log(`  PASS: ${msg}`)
  else { failures++; console.log(`  FAIL: ${msg}`) }
}

// The workflow runtime throws on these calls because they would break resume.
const StrictMath = Object.create(Math, {
  random: { value: () => { throw new Error('Math.random() is unavailable in the workflow runtime') } },
})
class StrictDate extends Date {
  constructor(...a) {
    if (!a.length) throw new Error('argless new Date() is unavailable in the workflow runtime')
    super(...a)
  }
  static now() { throw new Error('Date.now() is unavailable in the workflow runtime') }
}

function compileSource(source) {
  return new AsyncFunction(...PARAMS, source.replace(/^export\s+/gm, ''))
}
function compile(file) {
  return compileSource(readFileSync(join(HERE, file), 'utf8'))
}

const clone = (v) => (v === undefined ? undefined : structuredClone(v))
const tick = () => new Promise((r) => setImmediate(r))

/**
 * Build one runtime. `responses` maps an agent label to its response: a value (cloned per call),
 * a function (call, rt) => value, or null. `workflowImpl(ref, args, rt)` answers workflow().
 */
function makeRuntime(responses = {}, workflowImpl = null) {
  const rt = { calls: [], logs: [], phases: [], unscripted: [], workflowCalls: [], active: 0, maxActive: 0 }
  rt.agent = async (prompt, opts = {}) => {
    const label = opts.label || ''
    const call = { label, prompt, opts }
    rt.calls.push(call)
    rt.active++
    rt.maxActive = Math.max(rt.maxActive, rt.active)
    try {
      await tick()
      if (!Object.prototype.hasOwnProperty.call(responses, label)) { rt.unscripted.push(label); return null }
      const v = responses[label]
      return typeof v === 'function' ? v(call, rt) : clone(v)
    } finally { rt.active-- }
  }
  rt.parallel = async (thunks) => Promise.all((thunks || []).map(async (t) => {
    try { return await t() } catch { return null }
  }))
  rt.pipeline = async (items, ...stages) => Promise.all((items || []).map(async (item, i) => {
    let prev = item
    for (const stage of stages) {
      try { prev = await stage(prev, item, i) } catch { return null }
    }
    return prev
  }))
  rt.phase = (t) => { rt.phases.push(t) }
  rt.log = (m) => { rt.logs.push(String(m)) }
  rt.workflow = async (ref, a) => {
    rt.workflowCalls.push({ ref, args: a })
    if (!workflowImpl) throw new Error('unexpected workflow() call')
    return workflowImpl(ref, a, rt)
  }
  rt.labels = () => rt.calls.map((c) => c.label)
  rt.called = (label) => rt.calls.some((c) => c.label === label)
  rt.prompt = (label) => { const c = rt.calls.find((x) => x.label === label); return c ? c.prompt : '' }
  rt.opts = (label) => { const c = rt.calls.find((x) => x.label === label); return c ? c.opts : {} }
  return rt
}

async function exec(file, args, rt) {
  return execFn(compile(file), args, rt)
}
async function execFn(fn, args, rt) {
  return fn(rt.agent, rt.parallel, rt.pipeline, rt.phase, rt.log, rt.workflow, args, undefined, StrictDate, StrictMath)
}

// Runs the real council-loop body as the nested workflow, with the same scripted agent.
const realCouncil = async (ref, a, rt) => {
  if (basename(ref.scriptPath || '') !== 'council-loop.mjs') throw new Error(`unexpected workflow ${JSON.stringify(ref)}`)
  return exec('council-loop.mjs', a, rt)
}

// Every prompt that any run sent, for the git-safety checks at the end.
const ALL_PROMPTS = []
async function runCase(file, args, responses, workflowImpl) {
  const rt = makeRuntime(responses, workflowImpl)
  let result, error
  try { result = await exec(file, args, rt) } catch (e) { error = e; console.log(`    (${file} threw: ${String((e && e.message) || e).slice(0, 160)})`) }
  for (const c of rt.calls) ALL_PROMPTS.push({ file, label: c.label, prompt: c.prompt })
  return { rt, result, error }
}

// ─── council-loop fixtures ────────────────────────────────────────────────────────────────────
const COUNCIL_ARGS = {
  title: 'T1 change',
  target: { branch: 'feature/1-change', parentRef: 'origin/main' },
  project: { name: 'Proj', buildCmd: 'npm run build', testCmd: 'npm test' },
  merge: true,
}
const FOR = { verdict: 'FOR', unconditional: true, rationale: 'clean', findings: [], followUps: [] }
const AGAINST = { verdict: 'AGAINST', unconditional: false, rationale: 'bug', findings: [{ description: 'null deref', severity: 'high', file: 'a.js', line: 3, fix: 'guard it' }] }
const VERIFY_OK = { build: 'pass', tests: 'pass', mergeable: true, output: 'ok' }
const FIX_OK = { applied: [{ item: 'null deref' }], buildPassed: true, pushed: true, tests: 'fail', testTail: 'TAIL-MARKER 2 failing', notes: '' }
const councilHappy = (over = {}) => ({
  'advocate-1#1': 'FOR: file a.js:1 is correct',
  'critic-1#1': 'No blocking issues found.',
  'arbiter#1': FOR,
  verify: VERIFY_OK,
  merge: { merged: true, blocked: false, output: 'merged' },
  ...over,
})
// Round 1 finds a blocker, round 2 fixes it and passes.
const councilTwoRounds = (over = {}) => ({
  'advocate-1#1': 'FOR', 'critic-1#1': 'a.js:3 null deref, high', 'arbiter#1': AGAINST,
  'fix-plan#2': '1. Guard a.js:3. Commit fix(a): guard null.',
  'fix#2': FIX_OK,
  'fix-review#2': { ok: true },
  'advocate-1#2': 'FOR', 'critic-1#2': 'No blocking issues.', 'arbiter#2': FOR,
  verify: VERIFY_OK,
  merge: { merged: true },
  ...over,
})

// ─── legacy prompt snapshot ───────────────────────────────────────────────────────────────────
// A prompt change invalidates the resume journal of an in-flight run. These scenarios cover every
// legacy (debate: 'parallel') prompt shape. The digest below came from the council-loop.mjs of the
// #20 branch (commit 4c8883a), before the exchange mode existed. Re-baseline it ONLY on a deliberate
// legacy prompt change, with:
//   node workflows/workflows.smoke.mjs --legacy-snapshot workflows/council-loop.mjs
const LEGACY_DIGEST = 'f58453ac8b31b8effb79f34678c871cddb2b718710ebd5afd71f4c66b3103d4b'
const LEGACY_SCENARIOS = [
  ['happy branch mode', COUNCIL_ARGS, () => councilHappy()],
  ['two rounds with a fix', COUNCIL_ARGS, () => councilTwoRounds()],
  ['questioner, 2 advocates, 2 critics, spec, live validate, scope, env, extra rules', {
    ...COUNCIL_ARGS, scope: 'only src/', envNote: 'run in /repo', extraRules: 'use tokens', liveValidate: 'prove it',
    project: { ...COUNCIL_ARGS.project, specFile: 'spec.md' }, council: { advocates: 2, critics: 2, questioner: true, rounds: 3 },
  }, () => councilHappy({ 'advocate-2#1': 'ADV2', 'critic-2#1': 'CRIT2', 'questioner#1': 'Q' })],
  ['working-tree mode', { ...COUNCIL_ARGS, target: { parentRef: 'origin/dev' }, merge: false }, () => councilTwoRounds()],
  ['pr-only target', { ...COUNCIL_ARGS, target: { pr: 42 } }, () => councilHappy({ 'resolve-branch': { headRefName: 'feature/42-x', baseRefName: 'main' } })],
  ['fix review reject then pass', COUNCIL_ARGS, () => councilTwoRounds({
    'fix-review#2': { ok: false, issues: ['guard is incomplete at a.js:4'] },
    'fix-plan#3': 'plan 3', 'fix#3': FIX_OK, 'fix-review#3': { ok: true },
    'advocate-1#3': 'FOR', 'critic-1#3': 'none', 'arbiter#3': FOR,
  })],
  ['non-blocker sweep', COUNCIL_ARGS, () => councilHappy({
    'arbiter#1': { ...FOR, followUps: ['rename x'] }, 'fix-plan#2': 'plan', 'fix#2': FIX_OK, 'fix-review#2': { ok: true },
    'advocate-1#2': 'FOR', 'critic-1#2': 'none', 'arbiter#2': FOR,
  })],
]
async function legacySnapshot(source) {
  const out = []
  for (const [name, args, responses] of LEGACY_SCENARIOS) {
    const rt = makeRuntime(responses())
    try { await execFn(compileSource(source), structuredClone(args), rt) } catch (e) { out.push({ scenario: name, error: String((e && e.message) || e) }) }
    for (const c of rt.calls) {
      out.push({ scenario: name, label: c.label, model: c.opts.model ?? null, effort: c.opts.effort ?? null, agentType: c.opts.agentType ?? null,
        schema: c.opts.schema ? JSON.stringify(c.opts.schema) : null, prompt: c.prompt })
    }
  }
  return out
}
const digestOf = (records) => createHash('sha256').update(JSON.stringify(records)).digest('hex')

async function councilTests() {
  console.log('\ncouncil-loop orchestration:')
  {
    const snap = await legacySnapshot(readFileSync(join(HERE, 'council-loop.mjs'), 'utf8'))
    const digest = digestOf(snap)
    assert(digest === LEGACY_DIGEST, `legacy prompts, models and schemas are byte-identical to the #20 branch (${snap.length} calls, digest ${digest.slice(0, 12)})`)
  }
  {
    const { rt, result, error } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilHappy())
    assert(!error && result?.converged === true && result?.verified === true && rt.called('merge') && result?.merge?.merged === true,
      'control: unconditional FOR + verify pass/pass/mergeable reaches the merge')
  }
  for (const [name, verify] of [
    ['build fail', { build: 'fail', tests: 'pass', mergeable: true }],
    ['tests fail', { build: 'pass', tests: 'fail', mergeable: true }],
    ['tests none without allowNoTests', { build: 'pass', tests: 'none', mergeable: true }],
    ['mergeable false', { build: 'pass', tests: 'pass', mergeable: false }],
    ['mergeable missing', { build: 'pass', tests: 'pass' }],
  ]) {
    const { rt, result } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilHappy({ verify }))
    assert(!rt.called('merge') && result?.converged === false && result?.verified === false && result?.councilConverged === true,
      `verify ${name}: no merge call, converged false, councilConverged true`)
  }
  {
    const { rt, result } = await runCase('council-loop.mjs', { ...COUNCIL_ARGS, allowNoTests: true }, councilHappy({ verify: { build: 'pass', tests: 'none', mergeable: true } }))
    assert(rt.called('merge') && result?.converged === true, 'verify tests none WITH allowNoTests:true reaches the merge')
  }
  {
    const { rt, result } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilHappy({ verify: null }))
    assert(!rt.called('merge') && result?.converged === false && result?.resumable === true, 'null verify: no merge call, resumable stop')
  }
  {
    const { rt, result } = await runCase('council-loop.mjs', { ...COUNCIL_ARGS, merge: false }, councilHappy({ verify: { build: 'fail', tests: 'pass', mergeable: true } }))
    assert(!rt.called('merge') && result?.converged === false, 'merge:false with a failed verify still reports converged false to the caller')
  }
  {
    const { rt, result } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilTwoRounds())
    assert(result?.converged === true && rt.called('merge'), 'control: a blocker fixed in round 2 converges and merges')
    assert(rt.prompt('arbiter#2').includes('TAIL-MARKER 2 failing'), 'the fix round test tail reaches the next arbiter as evidence')
    assert(rt.prompt('fix#2').includes('npm test') && rt.prompt('fix#2').includes('testTail'), 'the fix agent is told to run the tests and report a test tail')
  }
  for (const [name, over, reason] of [
    ['null fix plan', { 'fix-plan#2': null }, 'fix-plan'],
    ['blank fix plan', { 'fix-plan#2': '   ' }, 'fix-plan'],
    ['null fix', { 'fix#2': null }, 'fix#2'],
    ['fix buildPassed false', { 'fix#2': { ...FIX_OK, buildPassed: false } }, 'fix#2'],
    ['fix pushed false in branch mode', { 'fix#2': { ...FIX_OK, pushed: false } }, 'fix#2'],
    ['null fix review', { 'fix-review#2': null }, 'fix-review'],
    ['fix review ok:false with no issues', { 'fix-review#2': { ok: false, issues: [] } }, 'fix-review'],
  ]) {
    const { rt, result } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilTwoRounds(over))
    assert(!rt.called('merge') && !rt.called('verify') && !rt.called('arbiter#2') && result?.resumable === true && result?.converged === false,
      `${name}: stops resumable before re-review, verify and merge`)
    assert(result?.council?.stoppedAtRound === 2 && !rt.labels().some((l) => /#3$/.test(l)), `${name}: the stop happens in round 2, not a round later`)
  }
  {
    const { rt } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilTwoRounds({ 'fix-plan#2': null }))
    assert(!rt.called('fix#2'), 'a null fix plan stops before the fix agent runs')
  }
  for (const [name, critic] of [['null critic', null], ['empty critic', ''], ['whitespace critic', ' \n\t ']]) {
    const { rt, result } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilHappy({ 'critic-1#1': critic }))
    assert(!rt.called('arbiter#1') && !rt.called('merge') && result?.resumable === true, `${name}: review-incomplete, no arbiter, no merge`)
  }
  {
    const { rt } = await runCase('council-loop.mjs', { ...COUNCIL_ARGS, council: { advocates: 2, questioner: true } },
      councilHappy({ 'advocate-1#1': null, 'advocate-2#1': 'ADV2 TEXT', 'critic-1#1': 'CRIT TEXT', 'questioner#1': 'Q TEXT' }))
    const p = rt.prompt('arbiter#1')
    assert(/--- ADVOCATE-1 ---\n\(no output/.test(p), 'a failed lens keeps its labelled slot with a placeholder')
    assert(p.includes('--- ADVOCATE-2 ---\nADV2 TEXT') && p.includes('--- CRITIC-1 ---\nCRIT TEXT') && p.includes('--- QUESTIONER ---\nQ TEXT'),
      'every arbiter input block carries its role label')
  }
  {
    const { rt, result } = await runCase('council-loop.mjs', { ...COUNCIL_ARGS, council: { maxLoops: 1 } },
      councilHappy({ 'arbiter#1': { ...FOR, followUps: ['rename x'] } }))
    assert(result?.converged === true && rt.called('merge') && result?.inPrFollowUps?.length === 1,
      'non-blocker sweep is skipped on the last iteration, so a clean FOR still converges')
  }
  {
    const { rt } = await runCase('council-loop.mjs', { ...COUNCIL_ARGS, council: { model: { arbiter: ['fable', 'sonnet'], fixPlan: 'fable' } } }, councilTwoRounds())
    assert(rt.opts('arbiter#1').model === 'opus' && rt.opts('fix-plan#2').model === 'opus', 'fable is clamped to opus on the singleton roles')
  }
  {
    const { rt } = await runCase('council-loop.mjs', COUNCIL_ARGS, councilHappy())
    const m = rt.prompt('merge')
    assert(!/Make sure the latest work is committed/.test(m) && /Do NOT commit, push, or edit any file/.test(m), 'the merge agent is told not to commit')
    assert(m.includes('git merge --ff-only origin/main') && m.includes('git fetch origin main:main'), 'the parent sync uses ff-only merge or fetch refspec')
  }
}

// ─── council-loop exchange mode fixtures ─────────────────────────────────────────────────────
const SHA = 'abc1234def'
const EX_ARGS = (council = {}) => ({ ...COUNCIL_ARGS, council: { debate: 'exchange', rounds: 1, ...council } })
const F_HIGH = { id: 'F1', file: 'a.js', line: 3, severity: 'high', claim: 'null deref when x is missing', evidence: 'a.js:3 x.y', fix: 'guard x' }
const F_MED = { id: 'F2', file: 'b.js', line: 9, severity: 'medium', claim: 'error is swallowed', evidence: 'b.js:9 catch {}', fix: 'log it' }
const findingsOut = (findings = [], ledgerStatus = [], sha = SHA) => ({ reviewedSha: sha, ledgerStatus, findings })
const rebuttal = (stances) => ({ responses: Object.entries(stances).map(([id, stance]) => ({ id, stance, counterEvidence: `${stance} ${id} because of c.js:1` })) })
const BLOCK_F1 = { verdict: 'AGAINST', unconditional: false, rationale: 'bug', findings: [{ description: '[CRITIC-1-F1] null deref', severity: 'high', file: 'a.js', line: 3, fix: 'guard x' }] }
const BLOCK_L1 = { verdict: 'AGAINST', unconditional: false, rationale: 'still a bug', findings: [{ description: '[L1] null deref is still there', severity: 'high', file: 'a.js', line: 4, fix: 'guard x' }] }
const fixRound = (n) => ({ [`fix-plan#${n}`]: `plan ${n}`, [`fix#${n}`]: FIX_OK, [`fix-review#${n}`]: { ok: true } })
// Splits an exchange arbiter prompt into its conceded and contested sections.
const arbiterSections = (p) => ({
  conceded: (p.split('CONCEDED FINDINGS')[1] || '').split('CONTESTED FINDINGS')[0],
  contested: (p.split('CONTESTED FINDINGS')[1] || '').split('WITHDRAWN BY THE CRITIC')[0],
})

async function exchangeTests() {
  console.log('\ncouncil-loop exchange mode:')
  {
    const { rt, result } = await runCase('council-loop.mjs', EX_ARGS(), councilHappy({ 'critic-1#1': findingsOut(), 'arbiter#1': FOR }))
    assert(result?.converged === true && rt.called('merge') && !rt.called('advocate-1-rebuttal#1') && !rt.called('questioner#1'),
      'no findings: no rebuttal, no questioner, the arbiter FOR still converges and merges')
    assert(rt.logs.some((l) => l === 'council iteration 1: 2 agent call(s) (exchange mode)'), 'a log line reports the agent count of the iteration')
    assert(result?.council?.lastReviewedSha === SHA && Array.isArray(result?.ledger) && result.ledger.length === 0, 'the result carries lastReviewedSha and an empty ledger')
  }
  {
    const { rt, result } = await runCase('council-loop.mjs', EX_ARGS(), councilHappy({
      'critic-1#1': findingsOut([F_HIGH, F_MED]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'concede', 'CRITIC-1-F2': 'concede' }), 'arbiter#1': FOR }))
    const adv = rt.prompt('advocate-1-rebuttal#1')
    assert(adv.includes('[CRITIC-1-F1] high a.js:3: null deref when x is missing') && adv.includes('[CRITIC-1-F2] medium b.js:9'),
      'the advocate gets every critic finding with its critic-prefixed id')
    assert(!rt.called('questioner#1') && !rt.labels().some((l) => l.startsWith('questioner')), 'nothing disputed: the questioner is skipped')
    const s = arbiterSections(rt.prompt('arbiter#1'))
    assert(s.conceded.includes('CRITIC-1-F1') && s.conceded.includes('CRITIC-1-F2') && s.contested.includes('(none)'), 'the arbiter gets both findings as conceded')
    assert(result?.converged === true, 'control: conceded findings that the arbiter does not block on still converge')
  }
  {
    const { rt } = await runCase('council-loop.mjs', EX_ARGS(), councilHappy({
      'critic-1#1': findingsOut([F_HIGH, F_MED]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'concede', 'CRITIC-1-F2': 'dispute' }),
      'questioner#1': { rulings: [{ id: 'CRITIC-1-F2', substantiated: false, quote: 'b.js:9 logs the error' }] }, 'arbiter#1': FOR }))
    const q = rt.prompt('questioner#1')
    assert(rt.called('questioner#1') && q.includes('[CRITIC-1-F2]') && !q.includes('CRITIC-1-F1'), 'the questioner runs on the disputed finding only')
    const s = arbiterSections(rt.prompt('arbiter#1'))
    assert(s.conceded.includes('CRITIC-1-F1') && !s.conceded.includes('CRITIC-1-F2')
      && s.contested.includes('CRITIC-1-F2') && s.contested.includes('ADVOCATE-1 disputes') && s.contested.includes('QUESTIONER: UNSUBSTANTIATED. Quote: b.js:9 logs the error'),
      'the arbiter gets the conceded set and the contested set with the rebuttal and the ruling')
    assert(rt.prompt('arbiter#1').includes('Block ONLY on a defect in correctness, security, or a stated requirement'), 'the arbiter is told to block only on correctness, security or a requirement')
  }
  {
    // The same blocker survives three landed fix rounds.
    const r = {
      'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'concede' }), 'arbiter#1': BLOCK_F1,
      ...[2, 3, 4, 5].reduce((acc, n) => ({ ...acc, ...fixRound(n), [`critic-1#${n}`]: findingsOut([], [{ key: 'L1', status: 'open', evidence: 'a.js:4 still x.y' }]), [`arbiter#${n}`]: BLOCK_L1 }), {}),
      verify: VERIFY_OK, merge: { merged: true },
    }
    const { rt, result } = await runCase('council-loop.mjs', EX_ARGS(), r)
    const l1 = (result?.ledger || []).find((e) => e.id === 'L1')
    assert(result?.resumable === false && result?.converged === false && /survived 3 fix attempts/.test(result?.reason || '')
      && result?.notLanding?.[0]?.id === 'L1' && l1?.attempts === 3 && l1?.status === 'open',
      'a blocker that survives 3 fix attempts stops fix-not-landing, not resumable, and reports the ledger entry')
    assert(rt.called('arbiter#4') && !rt.called('fix-plan#5') && !rt.called('verify') && !rt.called('merge'), 'fix-not-landing stops before a fourth fix, verify and merge')
    const c2 = rt.prompt('critic-1#2')
    assert(rt.prompt('critic-1#1').includes('git diff origin/main...origin/feature/1-change') && !rt.prompt('critic-1#1').includes('OPEN LEDGER ITEMS'),
      'iteration 1 reviews the whole branch against the parent')
    assert(c2.includes(`git diff ${SHA}..origin/feature/1-change`) && c2.includes('OPEN LEDGER ITEMS') && c2.includes('[L1] status=open fixAttempts=1'),
      'iteration 2 reviews only the delta from the last reviewed SHA plus the open ledger items')
    assert(rt.prompt('arbiter#2').includes('TAIL-MARKER 2 failing') && rt.prompt('arbiter#2').includes('[L1]'), 'the exchange arbiter gets the fix test tail and the ledger')
    assert(rt.prompt('fix-plan#2').includes('[CRITIC-1-F1]'), 'the fix round gets the blocker with its id')
  }
  {
    // Round 2: the critic reports the blocker resolved and adds one medium finding that is not a regression.
    const base = {
      'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'concede' }), 'arbiter#1': BLOCK_F1, ...fixRound(2),
      'arbiter#2': FOR, verify: VERIFY_OK, merge: { merged: true },
    }
    const dropped = await runCase('council-loop.mjs', EX_ARGS(), { ...base, 'critic-1#2': findingsOut([F_MED], [{ key: 'L1', status: 'resolved', evidence: 'a.js:3 guards x' }]) })
    assert(dropped.result?.converged === true && !dropped.rt.called('advocate-1-rebuttal#2') && dropped.result?.ledger?.[0]?.status === 'resolved' && dropped.result?.ledger?.[0]?.attempts === 1,
      'a delta review drops a new medium finding, and the ledger marks the fixed blocker resolved')
    const regression = await runCase('council-loop.mjs', EX_ARGS(), { ...base,
      'critic-1#2': findingsOut([{ ...F_MED, claim: 'REGRESSION: the guard swallows the error' }], [{ key: 'L1', status: 'resolved', evidence: 'ok' }]),
      'advocate-1-rebuttal#2': rebuttal({ 'CRITIC-1-F2': 'concede' }) })
    assert(regression.rt.prompt('advocate-1-rebuttal#2').includes('REGRESSION: the guard swallows the error'), 'a delta review keeps a medium finding marked as a regression')
  }
  for (const [name, over, council] of [
    ['null critic', { 'critic-1#1': null }, {}],
    ['null advocate', { 'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': null }, {}],
    ['null questioner', { 'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }), 'questioner#1': null }, {}],
    ['null critic reply', { 'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }), 'critic-1-reply-r1#1': null }, { rounds: 2 }],
    ['critic SHA disagreement', { 'critic-1#1': findingsOut([], [], 'abc1234'), 'critic-2#1': findingsOut([], [], 'fff9999') }, { critics: 2 }],
    ['critic with no valid SHA', { 'critic-1#1': findingsOut([], [], 'HEAD') }, {}],
  ]) {
    const { rt, result } = await runCase('council-loop.mjs', EX_ARGS(council), councilHappy({ 'arbiter#1': FOR, ...over }))
    assert(!rt.called('arbiter#1') && !rt.called('verify') && !rt.called('merge') && result?.resumable === true && result?.converged === false,
      `${name}: stops review-incomplete with no arbiter, verify or merge`)
    if (name === 'critic SHA disagreement') {
      assert(/different commits \(abc1234, fff9999\)/.test(result?.reason || '') && !rt.called('advocate-1-rebuttal#1'), 'SHA disagreement: the reason names both commits and no rebuttal runs')
    }
  }
  {
    const { result } = await runCase('council-loop.mjs', EX_ARGS({ critics: 2 }), councilHappy({ 'critic-1#1': findingsOut([], [], 'abc1234'), 'critic-2#1': findingsOut([], [], 'abc1234def567'), 'arbiter#1': FOR }))
    assert(result?.converged === true && result?.council?.lastReviewedSha === 'abc1234def567', 'a short SHA and its full form count as one commit')
  }
  {
    const two = { 'critic-1#1': findingsOut([F_HIGH, F_MED]), 'critic-2#1': findingsOut([{ ...F_HIGH, claim: 'other claim' }]),
      'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'concede', 'CRITIC-1-F2': 'concede', 'CRITIC-2-F1': 'concede' }), 'arbiter#1': FOR }
    const { rt } = await runCase('council-loop.mjs', EX_ARGS({ critics: 2 }), councilHappy(two))
    const p = rt.prompt('advocate-1-rebuttal#1')
    assert(p.includes('[CRITIC-1-F1]') && p.includes('[CRITIC-2-F1]'), 'finding ids stay unique across critics through the critic prefix')
  }
  {
    // rounds 2: one critic reply. A withdraw removes the dispute, so the questioner is skipped.
    const { rt } = await runCase('council-loop.mjs', EX_ARGS({ rounds: 2 }), councilHappy({
      'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }),
      'critic-1-reply-r1#1': { responses: [{ id: 'CRITIC-1-F1', action: 'withdraw', evidence: 'the advocate is right' }] }, 'arbiter#1': FOR }))
    assert(rt.prompt('critic-1-reply-r1#1').includes('ADVOCATE-1 disputes: dispute CRITIC-1-F1') && !rt.called('questioner#1')
      && /WITHDRAWN BY THE CRITIC: CRITIC-1-F1/.test(rt.prompt('arbiter#1')), 'rounds 2: the critic sees the rebuttal and a withdraw skips the questioner')
  }
  {
    // rounds 5 caps at 2 extra rounds. Every step keeps the dispute alive.
    const keep = { responses: [{ id: 'CRITIC-1-F1', action: 'reinforce', evidence: 'still a.js:3' }] }
    const { rt } = await runCase('council-loop.mjs', EX_ARGS({ rounds: 5 }), councilHappy({
      'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }), 'critic-1-reply-r1#1': keep,
      'advocate-1-rebuttal-r2#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }), 'critic-1-reply-r2#1': keep,
      'questioner#1': { rulings: [{ id: 'CRITIC-1-F1', substantiated: true, quote: 'a.js:3 x.y' }] }, 'arbiter#1': FOR }))
    const ex = rt.labels().filter((l) => /rebuttal|reply|questioner/.test(l))
    assert(JSON.stringify(ex) === JSON.stringify(['advocate-1-rebuttal#1', 'critic-1-reply-r1#1', 'advocate-1-rebuttal-r2#1', 'critic-1-reply-r2#1', 'questioner#1']),
      `rounds 5 caps at 2 extra rounds (${ex.join(', ')})`)
    assert(rt.prompt('advocate-1-rebuttal-r2#1').includes('CRITIC-1 reinforces (round 1): still a.js:3'), 'the second rebuttal sees the critic reinforcement')
    const one = await runCase('council-loop.mjs', EX_ARGS({ rounds: 1 }), councilHappy({
      'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }),
      'questioner#1': { rulings: [{ id: 'CRITIC-1-F1', substantiated: true, quote: 'q' }] }, 'arbiter#1': FOR }))
    assert(!one.rt.labels().some((l) => l.includes('-reply-')), 'rounds 1 adds no critic reply')
  }
  {
    const r = councilHappy({ 'critic-1#1': findingsOut([F_HIGH]), 'advocate-1-rebuttal#1': rebuttal({ 'CRITIC-1-F1': 'dispute' }),
      'questioner#1': { rulings: [{ id: 'CRITIC-1-F1', substantiated: true, quote: 'q' }] }, 'arbiter#1': FOR })
    const { rt } = await runCase('council-loop.mjs', EX_ARGS(), r)
    assert(rt.opts('critic-1#1').model === 'opus' && rt.opts('advocate-1-rebuttal#1').model === 'sonnet' && rt.opts('questioner#1').model === 'sonnet' && rt.opts('arbiter#1').model === 'opus',
      'exchange tiers: critic opus, rebuttal sonnet, questioner sonnet, arbiter opus')
    const over = await runCase('council-loop.mjs', EX_ARGS({ model: { advocate: 'opus' } }), r)
    assert(over.rt.opts('advocate-1-rebuttal#1').model === 'opus', 'council.model.advocate overrides the rebuttal model')
  }
  {
    const { rt, error } = await runCase('council-loop.mjs', EX_ARGS({ debate: 'debate' }), councilHappy())
    assert(error && /council\.debate must be/.test(error.message) && rt.calls.length === 0, 'an unknown debate value fails before any agent runs')
    const none = await runCase('council-loop.mjs', EX_ARGS({ critics: 0 }), councilHappy())
    assert(none.error && /needs council\.critics/.test(none.error.message) && none.rt.calls.length === 0, 'exchange mode with zero critics fails before any agent runs')
    const a = await runCase('council-loop.mjs', { ...COUNCIL_ARGS, council: { debate: 'parallel' } }, councilHappy())
    const b = await runCase('council-loop.mjs', COUNCIL_ARGS, councilHappy())
    assert(JSON.stringify(a.rt.calls.map((c) => c.prompt)) === JSON.stringify(b.rt.calls.map((c) => c.prompt)), "debate: 'parallel' sends the same prompts as the default")
  }
  {
    const { rt } = await runCase('feature-loop.mjs', { ...FEATURE_ARGS, council: { debate: 'exchange', rounds: 1 } },
      featureBase(councilHappy({ 'critic-1#1': findingsOut(), 'arbiter#1': FOR })), realCouncil)
    assert(rt.workflowCalls[0]?.args?.council?.debate === 'exchange' && rt.called('merge') && rt.opts('critic-1#1').schema, 'feature-loop forwards debate to the nested council-loop')
    const spec = await runCase('spec-loop.mjs', { ...SPEC_ARGS, council: { debate: 'exchange' } }, { decompose: { features: [feat('F1')] }, 'build:F1': BUILD_OK }, councilStub())
    assert(spec.rt.workflowCalls.length === 2 && spec.rt.workflowCalls.every((c) => c.args.council.debate === 'exchange'), 'spec-loop forwards debate to the feature and epic councils')
  }
}

// ─── spec-loop fixtures ───────────────────────────────────────────────────────────────────────
const SPEC_ARGS = {
  epic: { issue: 1, branch: 'epic/1-epic', parentRef: 'origin/main', title: 'Epic' },
  project: { name: 'Proj', specFile: 'spec.md', buildCmd: 'npm run build', testCmd: 'npm test' },
  workflowsDir: '/wf',
}
const feat = (key, extra = {}) => ({ key, title: `feature ${key}`, scopeTasks: [`T-${key}`], deps: [], touchPoints: [`src/${key}.js`], domain: 'backend', briefing: `build ${key}`, ...extra })
const BUILD_OK = { summary: 'done', filesChanged: ['x'], buildPassed: true, scopeKept: true, blockers: [] }
const councilStub = (rt0) => async (ref, a) => ({ converged: true, merge: { merged: true }, resumable: false, reason: 'stub' })

async function specTests() {
  console.log('\nspec-loop orchestration:')
  const base = (features, over = {}) => ({ decompose: { features }, 'build:F1': BUILD_OK, 'build:F2': BUILD_OK, ...over })
  {
    const { rt, result, error } = await runCase('spec-loop.mjs', SPEC_ARGS, base([feat('F1'), feat('F2', { deps: ['F1'] })]), councilStub())
    assert(!error && result?.merged === true && rt.workflowCalls.length === 3, 'control: two features build, council, and the epic council merges')
    assert(rt.prompt('build:F1').includes('origin/epic/1-epic'), 'the build prompt bases the leaf branch on origin/<epic branch>')
  }
  for (const [name, responses] of [
    ['null decomposition', { decompose: null }],
    ['empty decomposition', { decompose: { features: [] } }],
  ]) {
    const { rt, result } = await runCase('spec-loop.mjs', SPEC_ARGS, responses, councilStub())
    assert(result?.resumable === true && rt.workflowCalls.length === 0 && !rt.labels().some((l) => l.startsWith('build:')),
      `${name}: stops resumable, no build, no council, no epic merge`)
  }
  for (const [name, b] of [
    ['buildPassed false', { ...BUILD_OK, buildPassed: false }],
    ['scopeKept false', { ...BUILD_OK, scopeKept: false }],
    ['blockers reported', { ...BUILD_OK, blockers: ['missing dep'] }],
    ['null build', null],
  ]) {
    const { rt, result } = await runCase('spec-loop.mjs', SPEC_ARGS, base([feat('F1')], { 'build:F1': b }), councilStub())
    assert(result?.resumable === true && rt.workflowCalls.length === 0, `build ${name}: stops resumable before any council`)
  }
  {
    const split = feat('F1', { subTasks: [
      { key: 'F1.1', title: 'a', scopeTasks: ['T1'], touchPoints: ['src/a.js'], briefing: 'a' },
      { key: 'F1.2', title: 'b', scopeTasks: ['T2'], touchPoints: ['src/b.js'], briefing: 'b' },
    ] })
    const ok = await runCase('spec-loop.mjs', SPEC_ARGS, { decompose: { features: [split] }, 'build:F1.1': BUILD_OK, 'build:F1.2': BUILD_OK, 'submerge:F1': { merged: true, featureBranch: 'feature/F1' } }, councilStub())
    assert(ok.result?.merged === true && ok.rt.called('submerge:F1'), 'control: a split feature merges its sub-tasks and councils once')
    for (const [name, m] of [['merged:false', { merged: false, featureBranch: 'feature/F1' }], ['conflict', { merged: true, featureBranch: 'feature/F1', conflict: true }], ['null', null]]) {
      const { rt, result } = await runCase('spec-loop.mjs', SPEC_ARGS, { decompose: { features: [split] }, 'build:F1.1': BUILD_OK, 'build:F1.2': BUILD_OK, 'submerge:F1': m }, councilStub())
      assert(result?.resumable === true && rt.workflowCalls.length === 0, `intra-feature merge ${name}: stops before the council`)
    }
  }
  for (const [name, features, re] of [
    ['duplicate feature keys', [feat('F1'), feat('F1', { touchPoints: ['src/z.js'] })], /duplicate/],
    ['unknown dependency', [feat('F1', { deps: ['F9'] })], /unknown key F9/],
    ['dependency cycle', [feat('F1', { deps: ['F2'] }), feat('F2', { deps: ['F1'] })], /cycle/],
  ]) {
    const { rt, result } = await runCase('spec-loop.mjs', SPEC_ARGS, base(features), councilStub())
    assert(result?.resumable === false && Array.isArray(result?.planErrors) && result?.planErrors?.some((e) => re.test(e))
      && !rt.labels().some((l) => l.startsWith('build:')) && rt.workflowCalls.length === 0,
      `${name}: rejected with a clear error before any build or council`)
  }
  {
    const { rt } = await runCase('spec-loop.mjs', { ...SPEC_ARGS, allowNoTests: true }, base([feat('F1')]), councilStub())
    assert(rt.workflowCalls.length === 2 && rt.workflowCalls.every((c) => c.args.allowNoTests === true), 'spec-loop forwards allowNoTests to the feature and epic councils')
  }
  {
    const { rt, result } = await runCase('spec-loop.mjs', SPEC_ARGS, base([feat('F1')]), async () => ({ converged: true, merge: { merged: false, output: 'blocked' }, resumable: false }))
    assert(result?.resumable === true && rt.workflowCalls.length === 1, 'a feature council that did not merge halts before the epic council')
  }
}

// ─── ultracode fixtures ───────────────────────────────────────────────────────────────────────
const plan = (tasks, extra = {}) => ({ needsExplore: false, summary: 'plan', design: 'design', tasks, ...extra })
const DONE = { done: true, report: 'changed x' }

async function ultracodeTests(file, argKey) {
  console.log(`\n${file} orchestration:`)
  const A = { [argKey]: 'do the thing' }
  {
    const tasks = [{ id: 't1', instruction: 'a', complexity: 'routine' }, { id: 't2', instruction: 'b', complexity: 'hard', dependsOn: ['t1'] }, { id: 't3', instruction: 'c' }]
    const { rt, result, error } = await runCase(file, A, { plan: plan(tasks), 'impl:t1': DONE, 'impl:t2': DONE, 'impl:t3': DONE, 'review:round1': { approved: true, findings: [] } })
    assert(!error && result?.verdict === 'approved' && result?.implemented?.length === 3, 'control: three done tasks reach an approved review')
    assert(rt.opts('impl:t1').model === 'sonnet' && rt.opts('impl:t2').model === 'opus' && rt.opts('impl:t3').model === 'sonnet',
      'routine and untagged tasks run on sonnet, a hard task runs on opus')
    assert(rt.maxActive === 1, 'implementers run one at a time in the shared tree')
    assert(rt.prompt('plan').includes('complexity'), 'the planner is told to tag task complexity')
  }
  {
    const { rt } = await runCase(file, { ...A, implementModel: 'haiku' }, { plan: plan([{ id: 't1', instruction: 'a', complexity: 'hard' }]), 'impl:t1': DONE,
      'review:round1': { approved: false, findings: [{ file: 'a', summary: 's', fixInstruction: 'f', complexity: 'hard' }] }, 'fix:r1': DONE, 'review:round2': { approved: true, findings: [] } })
    assert(rt.opts('impl:t1').model === 'haiku' && rt.opts('fix:r1').model === 'haiku', 'args.implementModel overrides the implementer and fixer model')
  }
  for (const [name, r] of [['null implementer', null], ['done:false implementer', { done: false, report: 'gave up' }]]) {
    const tasks = [{ id: 't1', instruction: 'a' }, { id: 't2', instruction: 'b', dependsOn: ['t1'] }]
    const { rt, result, error } = await runCase(file, A, { plan: plan(tasks), 'impl:t1': r, 'impl:t2': DONE, 'review:round1': { approved: true, findings: [] } })
    assert(!error && result?.verdict === 'impl-failed' && result?.resumable === true && result?.failed?.[0]?.id === 't1'
      && !rt.called('impl:t2') && !rt.called('review:round1'), `${name}: impl-failed, resumable, no later task, no review`)
  }
  for (const [name, tasks] of [
    ['dependency cycle', [{ id: 't1', instruction: 'a', dependsOn: ['t2'] }, { id: 't2', instruction: 'b', dependsOn: ['t1'] }]],
    ['unknown dependency', [{ id: 't1', instruction: 'a', dependsOn: ['zzz'] }]],
  ]) {
    const { rt, result } = await runCase(file, A, { plan: plan(tasks), 'impl:t1': DONE, 'impl:t2': DONE, 'review:round1': { approved: true, findings: [] } })
    assert(result?.verdict === 'approved' && rt.calls.length <= 4, `${name}: the fallback terminates`)
  }
  {
    const { result } = await runCase(file, A, { plan: plan([{ id: 't1', instruction: 'a', dependsOn: ['t2'] }, { id: 't2', instruction: 'b', dependsOn: ['t1'] }]), 'impl:t1': null })
    assert(result?.verdict === 'impl-failed', 'a cycle with a dead implementer terminates as impl-failed')
  }
  {
    const findings = [{ file: 'a', summary: 'FINDING-ONE', fixInstruction: 'f1', complexity: 'routine' }, { file: 'b', summary: 'FINDING-TWO', fixInstruction: 'f2', complexity: 'hard' }]
    const { rt, result } = await runCase(file, A, { plan: plan([{ id: 't1', instruction: 'a' }]), 'impl:t1': DONE,
      'review:round1': { approved: false, findings }, 'fix:r1': DONE, 'review:round2': { approved: true, findings: [] } })
    const fixCalls = rt.labels().filter((l) => l.startsWith('fix:'))
    assert(result?.verdict === 'approved' && fixCalls.length === 1 && rt.prompt('fix:r1').includes('FINDING-ONE') && rt.prompt('fix:r1').includes('FINDING-TWO'),
      'one fixer per round receives every finding')
    assert(rt.opts('fix:r1').model === 'opus', 'a round with a hard finding runs the fixer on opus')
  }
  {
    const { rt, result } = await runCase(file, A, { plan: plan([{ id: 't1', instruction: 'a' }]), 'impl:t1': DONE,
      'review:round1': { approved: false, findings: [{ file: 'a', summary: 's', fixInstruction: 'f' }] }, 'fix:r1': null })
    assert(result?.verdict === 'fix-failed' && result?.resumable === true && !rt.called('review:round2'), 'a null fixer stops as fix-failed with no further review')
  }
  {
    const { rt, result } = await runCase(file, A, { plan: plan([{ id: 't1', instruction: 'a' }]), 'impl:t1': DONE, 'review:round1': { approved: false, findings: [] } })
    assert(result?.verdict === 'review-rejected-without-findings' && !rt.labels().some((l) => l.startsWith('fix:')), 'a reject with no findings stops without a fixer')
  }
}

// ─── feature-loop fixtures ────────────────────────────────────────────────────────────────────
const FEATURE_ARGS = {
  key: 'F1', issue: 7, branch: 'feature/7-thing', parentRef: 'origin/epic/1-epic', title: 'Thing', scopeTasks: 'T1', briefing: 'build it',
  workflowsDir: '/wf', project: { name: 'Proj', specFile: 'spec.md', buildCmd: 'npm run build', testCmd: 'npm test' },
}
const featureBase = (over = {}) => ({
  'brainstorm:F1': { questions: [] },
  'answer:F1': { decisions: [] },
  'spec:F1': { acceptanceCriteria: ['works'], touchPoints: ['a.js'] },
  'impl:F1': { summary: 'done', filesChanged: ['a.js'], buildPassed: true, scopeKept: true, blockers: [] },
  ...over,
})

async function featureTests() {
  console.log('\nfeature-loop orchestration:')
  {
    const { rt, result, error } = await runCase('feature-loop.mjs', FEATURE_ARGS, featureBase(councilHappy()), realCouncil)
    assert(!error && result?.converged === true && result?.merged === true && rt.workflowCalls.length === 1 && rt.workflowCalls[0].args.merge === true,
      'control: a passing implement runs the real nested council-loop and merges')
    assert(rt.prompt('impl:F1').includes('BRANCH PIN') && rt.prompt('impl:F1').includes('git checkout feature/7-thing'), 'the implement agent gets the branch pin')
  }
  for (const [name, impl] of [
    ['null implement', null],
    ['buildPassed false', { summary: 'x', filesChanged: [], buildPassed: false }],
    ['scopeKept false', { summary: 'x', filesChanged: [], buildPassed: true, scopeKept: false }],
    ['blockers reported', { summary: 'x', filesChanged: [], buildPassed: true, blockers: ['needs F2'] }],
  ]) {
    const { rt, result } = await runCase('feature-loop.mjs', FEATURE_ARGS, featureBase({ 'impl:F1': impl }), realCouncil)
    assert(result?.resumable === true && result?.merged === false && rt.workflowCalls.length === 0 && !rt.called('merge'),
      `implement ${name}: stops resumable before council-loop runs`)
  }
  for (const review of ['none', 'budget']) {
    const { rt } = await runCase('feature-loop.mjs', { ...FEATURE_ARGS, review }, featureBase({ 'impl:F1': null, 'review:F1': { blockers: [] } }), realCouncil)
    assert(!rt.called('review:F1') && rt.workflowCalls.length === 0, `review:${review} also stops on a failed implement`)
  }
  {
    const { rt, result } = await runCase('feature-loop.mjs', FEATURE_ARGS, featureBase(councilHappy({ verify: { build: 'fail', tests: 'pass', mergeable: true } })), realCouncil)
    assert(result?.merged === false && result?.converged === false && !rt.called('merge'), 'a failed verify inside the nested council-loop blocks the merge')
  }
  {
    const { rt } = await runCase('feature-loop.mjs', { ...FEATURE_ARGS, liveValidate: 'prove it', review: 'budget' }, featureBase({
      'validate:F1': { checks: [{ check: 'c', result: 'pass' }] },
      'review:F1': { blockers: [{ where: 'a.js:1', issue: 'bug', whyBlocking: 'wrong' }] },
      'fix:F1': { summary: 'fixed', filesChanged: ['a.js'], buildPassed: true },
      'recheck:F1': { allFixed: true, testsPassed: true },
    }), null)
    assert(rt.prompt('validate:F1').includes('BRANCH PIN') && rt.prompt('fix:F1').includes('BRANCH PIN'), 'the validate and budget fix agents get the branch pin')
    assert(rt.prompt('review:F1').includes('BRANCH PIN') && rt.prompt('recheck:F1').includes('BRANCH PIN'), 'the budget review and recheck agents get the branch pin')
    assert(!rt.prompt('review:F1').includes('...HEAD'), 'the budget review diffs the feature branch, not an unpinned HEAD')
  }
  {
    const noTests = councilHappy({ verify: { build: 'pass', tests: 'none', mergeable: true } })
    const blocked = await runCase('feature-loop.mjs', FEATURE_ARGS, featureBase(noTests), realCouncil)
    const allowed = await runCase('feature-loop.mjs', { ...FEATURE_ARGS, allowNoTests: true }, featureBase(noTests), realCouncil)
    assert(blocked.result?.merged === false && allowed.result?.merged === true, 'feature-loop forwards allowNoTests to the nested council-loop')
  }
  {
    const { rt, result } = await runCase('feature-loop.mjs', { ...FEATURE_ARGS, liveValidate: 'prove it' }, featureBase({ 'validate:F1': { checks: [{ check: 'login works', result: 'fail' }] } }), realCouncil)
    assert(result?.resumable === true && rt.workflowCalls.length === 0, 'a failing live check stops before the council')
  }
}

// ─── syntax check of every workflow body ──────────────────────────────────────────────────────
function syntaxTests() {
  console.log('Syntax checks (compile each workflow body as the runtime does):')
  const files = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.endsWith('.smoke.mjs')).sort()
  for (const f of files) {
    try { compile(f); assert(true, `${f} compiles`) } catch (e) { assert(false, `${f} compiles — ${String((e && e.message) || e).slice(0, 200)}`) }
  }
}

// ─── git safety over every prompt the runs sent ───────────────────────────────────────────────
function gitSafetyTests() {
  console.log('\ngit safety across every scripted prompt:')
  const bad = (re) => ALL_PROMPTS.filter((p) => re.test(p.prompt)).map((p) => `${p.file}:${p.label}`)
  const force = bad(/--force|force-with-lease|push\s+-f\b/)
  const reset = bad(/reset\s+--hard/)
  assert(ALL_PROMPTS.length > 50, `the runs sent ${ALL_PROMPTS.length} prompts to scan`)
  assert(force.length === 0, `no prompt asks for a force push${force.length ? ` (found in ${force.slice(0, 5).join(', ')})` : ''}`)
  assert(reset.length === 0, `no prompt runs git reset --hard${reset.length ? ` (found in ${reset.slice(0, 5).join(', ')})` : ''}`)
}

async function main() {
  if (process.argv[2] === '--legacy-snapshot') {
    const snap = await legacySnapshot(readFileSync(process.argv[3], 'utf8'))
    console.log(JSON.stringify({ digest: digestOf(snap), calls: snap }, null, 1))
    return
  }
  syntaxTests()
  await councilTests()
  await specTests()
  await ultracodeTests('ultracode-fix.mjs', 'task')
  await ultracodeTests('ultracode-implement.mjs', 'feature')
  await featureTests()
  await exchangeTests()
  gitSafetyTests()
  console.log(`\n${checks} checks, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke harness crashed:', e)
  process.exit(1)
})
