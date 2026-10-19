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

function compile(file) {
  const src = readFileSync(join(HERE, file), 'utf8').replace(/^export\s+/gm, '')
  return new AsyncFunction(...PARAMS, src)
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
  const fn = compile(file)
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

async function councilTests() {
  console.log('\ncouncil-loop orchestration:')
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
  syntaxTests()
  await councilTests()
  await specTests()
  await ultracodeTests('ultracode-fix.mjs', 'task')
  await ultracodeTests('ultracode-implement.mjs', 'feature')
  await featureTests()
  gitSafetyTests()
  console.log(`\n${checks} checks, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke harness crashed:', e)
  process.exit(1)
})
