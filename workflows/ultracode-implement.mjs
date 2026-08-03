/**
 * ultracode-implement.mjs — reusable "ultracode implement it" pipeline.
 *
 * Sibling of ultracode-fix.mjs, aimed at building a feature instead of fixing a
 * defect. Same model tiering (fixed by design, per user directive 2026-08-03):
 *   Explore   → sonnet (only when the plan needs more context)
 *   Plan      → fable, effort medium (design + task decomposition)
 *   Implement → opus, effort low (fan-out per plan task)
 *   Review    → fable, effort medium (also arbiters the fix loop)
 *
 * Invoke BY ABSOLUTE scriptPath (the name registry does not resolve
 * ~/.claude/workflows/*.mjs):
 *   Workflow({ scriptPath: "<abs>/ultracode-implement.mjs", args: { ...ARGS } })
 *
 * ARGS = {
 *   feature,       // REQUIRED: what to build, in plain language (behavior, scope, constraints)
 *   cwd,           // optional: absolute repo root the agents work in (default: session cwd)
 *   specFile,      // optional: absolute path to a spec the planner and reviewer must read and honor
 *   context,       // optional: extra context (links, decisions already made, constraints)
 *   testCmd,       // optional: command that must pass (e.g. "npm test")
 *   tdd,           // optional: true → each task writes its tests FIRST (default true when testCmd is set)
 *   maxLoops,      // optional: max review→fix rounds (default 3)
 *   explore,       // optional: 'auto' (default, planner decides) | 'always' | 'never'
 *   commit,        // optional: true → implementers commit with conventional messages (default false)
 * }
 *
 * Returns { verdict, plan, implemented, reviews, resumable }.
 */

export const meta = {
  name: 'ultracode-implement',
  description: 'Build a feature: sonnet explores, fable plans the design (medium), opus implements (low), fable reviews and loops fixes until approved',
  phases: [
    { title: 'Explore', detail: 'sonnet scouts existing patterns and integration points when the plan needs context', model: 'sonnet' },
    { title: 'Plan', detail: 'fable at medium effort designs the feature and decomposes it into tasks', model: 'fable' },
    { title: 'Implement', detail: 'opus at low effort builds each plan task in dependency waves', model: 'opus' },
    { title: 'Review', detail: 'fable at medium effort reviews against the spec, requests fixes, loops until approved', model: 'fable' },
  ],
}

// Defensive args. The harness may pass a stringified payload.
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
if (!A.feature) throw new Error('ultracode-implement: args.feature is required')
const FEATURE = A.feature
const CWD = A.cwd ? `Work in the repository at ${A.cwd}. ` : ''
const SPEC = A.specFile ? `\nRead the spec at ${A.specFile} first. It is the authority on scope and acceptance criteria.` : ''
const CTX = A.context ? `\n\nAdditional context:\n${A.context}` : ''
const TEST = A.testCmd ? `\nThe command \`${A.testCmd}\` must pass before you finish.` : ''
const TDD = (A.tdd ?? Boolean(A.testCmd))
  ? '\nFollow TDD: write the failing test for your task first, then implement until it passes.'
  : ''
const MAX_LOOPS = A.maxLoops ?? 3
const EXPLORE = A.explore || 'auto'
const COMMIT_RULE = A.commit
  ? '\nWhen your change is complete and verified, commit it with a conventional commit message (no push).'
  : '\nDo NOT commit. Leave the change in the working tree.'

const PLAN_SCHEMA = {
  type: 'object',
  required: ['needsExplore', 'summary', 'design', 'tasks'],
  properties: {
    needsExplore: { type: 'boolean', description: 'true if an exploration pass is needed before this plan is trustworthy' },
    exploreQuestions: { type: 'array', items: { type: 'string' }, description: 'concrete questions for the explorer' },
    summary: { type: 'string', description: 'one-paragraph statement of what gets built' },
    design: { type: 'string', description: 'the design: architecture, data flow, files to create or change, and why' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'instruction'],
        properties: {
          id: { type: 'string' },
          instruction: { type: 'string', description: 'self-contained instruction for one implementer agent, with file paths and expected behavior' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

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
          fixInstruction: { type: 'string', description: 'self-contained fix instruction for an implementer' },
        },
      },
    },
  },
}

const RESULT_SCHEMA = { type: 'object', required: ['done', 'report'], properties: { done: { type: 'boolean' }, report: { type: 'string' } } }

// --- Phase 1+2: optional explore, then plan (fable, medium) ---
let exploreNotes = ''
const explorePrompt = (questions) => `${CWD}You are a read-only scout. Investigate the codebase to answer these questions about the feature below. Cite file:line for every claim. Note the conventions and patterns new code must follow. Do not edit anything. Return your findings as plain text.

Feature: ${FEATURE}${SPEC}${CTX}

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`

const planPrompt = () => `${CWD}You are the planner and designer. Design this feature, then decompose it into the smallest set of independent, self-contained implementation tasks. The design must state the architecture, the files to create or change, and how the feature integrates with existing code. Each task instruction must name its files and the expected behavior after the change. Reuse existing patterns and utilities over net-new code. If you lack the context to write a trustworthy plan, set needsExplore=true and list exploreQuestions instead of guessing.

Feature: ${FEATURE}${SPEC}${CTX}${TEST}
${exploreNotes ? `\nExploration findings:\n${exploreNotes}` : ''}`

phase('Explore')
if (EXPLORE === 'always') {
  exploreNotes = await agent(explorePrompt(['Map the code this feature must integrate with: entry points, existing patterns to reuse, naming conventions, and test setup.']),
    { label: 'explore:initial', phase: 'Explore', model: 'sonnet' }) || ''
}

phase('Plan')
let plan = await agent(planPrompt(), { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA, model: 'fable', effort: 'medium' })
if (!plan) throw new Error('planner died')

if (plan.needsExplore && EXPLORE !== 'never') {
  log('Planner requested exploration. Dispatching sonnet scout.')
  exploreNotes = await agent(explorePrompt(plan.exploreQuestions?.length ? plan.exploreQuestions : ['Gather the context the plan needs.']),
    { label: 'explore:requested', phase: 'Explore', model: 'sonnet' }) || ''
  plan = await agent(planPrompt(), { label: 'plan:v2', phase: 'Plan', schema: PLAN_SCHEMA, model: 'fable', effort: 'medium' })
  if (!plan) throw new Error('planner died on replan')
}
log(`Plan: ${plan.summary} (${plan.tasks.length} task(s))`)

// --- Phase 3: implement (opus, low). Sequential per dependency waves, parallel within a wave. ---
phase('Implement')
const implPrompt = (t) => `${CWD}You are the implementer for one plan task. Build exactly this change, follow the design, match the surrounding code style, and verify it compiles/runs. Return a short report of what you changed (files + reasoning). Stay inside the task scope.${TDD}${TEST}${COMMIT_RULE}

Feature: ${FEATURE}
Design:
${plan.design}

Your task (${t.id}): ${t.instruction}`

const done = new Set()
const implemented = []
let remaining = [...plan.tasks]
while (remaining.length) {
  const wave = remaining.filter(t => (t.dependsOn || []).every(d => done.has(d)))
  if (!wave.length) { log('Dependency cycle in plan. Running remaining tasks sequentially.'); wave.push(remaining[0]) }
  const results = await parallel(wave.map(t => () =>
    agent(implPrompt(t), { label: `impl:${t.id}`, phase: 'Implement', schema: RESULT_SCHEMA, model: 'opus', effort: 'low' })
      .then(r => ({ id: t.id, ...r }))))
  for (const r of results.filter(Boolean)) { done.add(r.id); implemented.push(r) }
  remaining = remaining.filter(t => !done.has(t.id))
}

// --- Phase 4: review loop (fable, medium) with opus fix rounds ---
phase('Review')
const reviews = []
let verdict = 'unreviewed'
for (let round = 1; round <= MAX_LOOPS; round++) {
  const review = await agent(
    `${CWD}You are the reviewer and orchestrator of a build pipeline. Review the CURRENT working-tree change against the feature request${A.specFile ? ' and the spec' : ''}. Verify correctness against actual source (read the files, do not trust the reports alone). Check scope: every acceptance criterion met, nothing extra built. ${A.testCmd ? `Run \`${A.testCmd}\` and treat a failure as a blocking finding. ` : ''}Approve only if the feature is genuinely done. For each blocking finding, write a self-contained fixInstruction.

Feature: ${FEATURE}${SPEC}${CTX}
Design:
${plan.design}
Implementer reports:
${implemented.map(r => `- [${r.id}] ${r.report}`).join('\n')}`,
    { label: `review:round${round}`, phase: 'Review', schema: REVIEW_SCHEMA, model: 'fable', effort: 'medium' })
  if (!review) { verdict = 'review-agent-died'; break }
  reviews.push(review)
  if (review.approved) { verdict = 'approved'; log(`Approved on round ${round}.`); break }
  verdict = 'fixes-pending'
  log(`Round ${round}: ${review.findings.length} finding(s). Dispatching fixes.`)
  const fixes = await parallel(review.findings.map((f, i) => () =>
    agent(implPrompt({ id: `fix-r${round}-${i + 1}`, instruction: `${f.summary} (${f.file})\n${f.fixInstruction}` }),
      { label: `fix:r${round}-${i + 1}`, phase: 'Implement', schema: RESULT_SCHEMA, model: 'opus', effort: 'low' })
      .then(r => ({ id: `fix-r${round}-${i + 1}`, ...r }))))
  implemented.push(...fixes.filter(Boolean))
}
if (verdict === 'fixes-pending') verdict = 'max-loops-reached'

return {
  verdict,
  plan,
  implemented,
  reviews,
  resumable: verdict !== 'approved',
}
