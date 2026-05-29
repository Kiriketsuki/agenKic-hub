export const meta = {
  name: 'ai-co-scientist',
  description: 'Distilled Google AI co-scientist: generate -> review -> Elo tournament -> proximity dedup -> evolve, looped with a meta-review feedback overview',
  whenToUse: 'Open-ended scientific / research hypothesis generation where you want many candidate ideas ranked by self-play debate and iteratively evolved toward a goal.',
  phases: [
    { title: 'Generate' },
    { title: 'Review' },
    { title: 'Tournament' },
    { title: 'Proximity' },
    { title: 'Evolve' },
    { title: 'Meta-review' },
  ],
}

// ---------------------------------------------------------------------------
// Config. args may arrive as a JSON string (historical Workflow behavior) or
// as a real object. Parse defensively either way.
// ---------------------------------------------------------------------------
const cfg = (typeof args === 'string' ? JSON.parse(args || '{}') : (args || {}))
const GOAL        = cfg.goal        || 'State a research goal via args.goal'
const ROUNDS      = cfg.rounds      ?? 3      // supervisor: number of improvement cycles
const N_GEN       = cfg.generators  ?? 4      // generation strategies per round
const TOP_K       = cfg.topK        ?? 4      // survivors carried into evolution
const PAIR_CAP    = cfg.pairCap     ?? 12     // max tournament matches per round (O(n^2) guard)
const MIN_BUDGET  = cfg.minBudget   ?? 60_000 // stop a round early if budget tight

// Diverse generation strategies — the judge-panel diversity pattern.
const STRATEGIES = [
  { key: 'literature',   lens: 'grounded in established prior work and known mechanisms' },
  { key: 'assumption',   lens: 'by deliberately breaking a widely-held assumption in the field' },
  { key: 'analogical',   lens: 'by transferring a mechanism from an unrelated discipline' },
  { key: 'contrarian',   lens: 'by proposing what most experts would initially dismiss' },
  { key: 'mechanistic',  lens: 'by isolating a single testable causal mechanism' },
  { key: 'frontier',     lens: 'by combining two recent advances that have not been combined' },
].slice(0, N_GEN)

// ---------------------------------------------------------------------------
// Schemas (validated at the tool layer — agents must conform).
// ---------------------------------------------------------------------------
const HYPOTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    title:       { type: 'string' },
    hypothesis:  { type: 'string', description: 'one-paragraph falsifiable statement' },
    rationale:   { type: 'string' },
    experiment:  { type: 'string', description: 'how to test it' },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'hypothesis', 'rationale', 'experiment'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    novelty:     { type: 'number', description: '0-10' },
    validity:    { type: 'number', description: '0-10 scientific soundness' },
    testability: { type: 'number', description: '0-10' },
    fatalFlaw:   { type: 'string', description: 'empty string if none' },
    verdict:     { type: 'string', enum: ['advance', 'revise', 'reject'] },
  },
  required: ['novelty', 'validity', 'testability', 'verdict'],
}

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    winner:    { type: 'string', enum: ['A', 'B'] },
    reasoning: { type: 'string' },
  },
  required: ['winner', 'reasoning'],
}

const CLUSTER_SCHEMA = {
  type: 'object',
  properties: {
    clusters: {
      type: 'array',
      description: 'groups of near-duplicate hypotheses by their index',
      items: { type: 'array', items: { type: 'integer' } },
    },
  },
  required: ['clusters'],
}

const OVERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    overview:    { type: 'string', description: 'research overview: recurring patterns, strongest directions, common flaws' },
    guidance:    { type: 'string', description: 'concrete steering for the next generation/evolution round' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['overview', 'guidance'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (h) => `Title: ${h.title}\nHypothesis: ${h.hypothesis}\nExperiment: ${h.experiment}`
const reviewScore = (r) => (r.novelty + r.validity * 1.5 + r.testability) // validity weighted

// HARDENING: retry transient agent failures (API 529 overload, StructuredOutput
// misses). Same (prompt, opts) each attempt -> resume cache key is unchanged, so a
// cached success returns on attempt 1 and never retries. Only genuinely-live calls
// pay the retry cost. Used for ALL agent calls below.
async function aretry(prompt, opts, tries = 3) {
  let last
  for (let t = 1; t <= tries; t++) {
    try { return await agent(prompt, opts) }
    catch (e) {
      last = e
      log(`  retry ${opts?.label || ''} ${t}/${tries}: ${String(e).slice(0, 70)}`)
    }
  }
  throw last
}

// Deterministic pairing (no Math.random): pair sorted-by-Elo neighbours +
// some cross pairings, capped at PAIR_CAP. Swiss-ish.
function pairings(pool, cap) {
  const idx = pool.map((_, i) => i)
  const pairs = []
  for (let i = 0; i + 1 < idx.length; i++) {
    pairs.push([idx[i], idx[i + 1]])               // neighbours
    if (i + 2 < idx.length) pairs.push([idx[i], idx[i + 2]]) // skip-one
  }
  return pairs.slice(0, cap)
}

function applyElo(pool, a, b, winner) {
  const K = 24
  const ra = pool[a].elo, rb = pool[b].elo
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400))
  const eb = 1 - ea
  const sa = winner === 'A' ? 1 : 0
  pool[a].elo = ra + K * (sa - ea)
  pool[b].elo = rb + K * ((1 - sa) - eb)
}

// ---------------------------------------------------------------------------
// Main loop — the Supervisor.
// ---------------------------------------------------------------------------
let pool = []          // surviving hypotheses across rounds, each {...h, elo, review}
let overview = null    // meta-review feedback, injected forward
const history = []     // per-round summaries

for (let round = 1; round <= ROUNDS; round++) {
  if (budget.total && budget.remaining() < MIN_BUDGET) {
    log(`Budget low (${Math.round(budget.remaining()/1000)}k left) — stopping at round ${round - 1}.`)
    break
  }
  log(`Round ${round}/${ROUNDS} — pool carried in: ${pool.length}`)
  const feedback = overview ? `\n\nMeta-review guidance from prior rounds:\n${overview.guidance}` : ''

  // --- Generate: diverse strategies + evolution of top survivors ----------
  phase('Generate')
  const genThunks = STRATEGIES.map((s) => () =>
    aretry(
      `Research goal: ${GOAL}\n\nGenerate ONE novel, falsifiable hypothesis ${s.lens}.${feedback}`,
      { label: `gen:${s.key}:r${round}`, phase: 'Generate', schema: HYPOTHESIS_SCHEMA },
    ))

  // Evolution agents act on the current top-K survivors (combine / extend / simplify).
  const survivors = [...pool].sort((a, b) => b.elo - a.elo).slice(0, TOP_K)
  const evoModes = ['simplify and sharpen', 'extend to a bolder claim', 'combine with another strong idea', 'break a hidden assumption']
  const evoThunks = survivors.map((h, i) => () =>
    aretry(
      `Research goal: ${GOAL}\n\nEVOLVE this hypothesis — ${evoModes[i % evoModes.length]}:\n${fmt(h)}${feedback}\n\nReturn an improved, still-falsifiable hypothesis.`,
      { label: `evolve:r${round}:${i}`, phase: 'Evolve', schema: HYPOTHESIS_SCHEMA },
    ))

  const fresh = (await parallel([...genThunks, ...evoThunks])).filter(Boolean)
  log(`Round ${round}: ${fresh.length} new candidates (${genThunks.length} generated, ${evoThunks.length} evolved).`)

  // --- Review (Reflection): score + cull fatal flaws ----------------------
  phase('Review')
  const reviewed = (await parallel(fresh.map((h) => () =>
    aretry(
      `Critically review this hypothesis for the goal "${GOAL}". Be a skeptical scientist — assign a fatal flaw only if genuinely fatal.\n\n${fmt(h)}\nRationale: ${h.rationale}`,
      { label: `review:${h.title?.slice(0, 24)}`, phase: 'Review', schema: REVIEW_SCHEMA },
    ).then((r) => ({ ...h, review: r }))
  ))).filter(Boolean).filter((h) => h.review.verdict !== 'reject' && !h.review.fatalFlaw)

  // Seed Elo from review score so the tournament starts informed.
  const incoming = reviewed.map((h) => ({ ...h, elo: h.elo ?? (1200 + reviewScore(h.review)) }))
  pool = [...pool, ...incoming]
  if (pool.length === 0) { log(`Round ${round}: all candidates rejected.`); continue }

  // --- Proximity: cluster near-duplicates, keep best-Elo per cluster ------
  // HARDENING: single awaited call -> wrap so a transient failure skips dedup
  // instead of killing the whole workflow.
  phase('Proximity')
  if (pool.length > 2) {
    const listing = pool.map((h, i) => `[${i}] ${h.title}: ${h.hypothesis}`).join('\n')
    let clusters = null
    try {
      ({ clusters } = await aretry(
        `Group these hypotheses into clusters of near-duplicates (same core idea). Singletons are their own cluster. Return index arrays.\n\n${listing}`,
        { label: `proximity:r${round}`, phase: 'Proximity', schema: CLUSTER_SCHEMA },
      ))
    } catch (e) {
      log(`Round ${round}: proximity failed after retries (${String(e).slice(0, 60)}) — skipping dedup this round.`)
    }
    if (clusters) {
      const keep = new Set()
      for (const c of (clusters || [])) {
        if (!c.length) continue
        const best = c.reduce((bi, i) => (pool[i] && pool[i].elo > (pool[bi]?.elo ?? -1) ? i : bi), c[0])
        keep.add(best)
      }
      // any index never mentioned by the clusterer survives
      pool.forEach((_, i) => { if (![...(clusters || [])].flat().includes(i)) keep.add(i) })
      const before = pool.length
      pool = pool.filter((_, i) => keep.has(i))
      log(`Round ${round}: proximity dedup ${before} -> ${pool.length}.`)
    }
  }

  // --- Tournament: Elo via pairwise scientific debate (barrier) -----------
  phase('Tournament')
  pool.sort((a, b) => b.elo - a.elo)
  const pairs = pairings(pool, PAIR_CAP)
  const fullCount = pairings(pool, Number.MAX_SAFE_INTEGER).length
  if (fullCount > pairs.length) log(`Round ${round}: tournament capped at ${pairs.length}/${fullCount} matches (PAIR_CAP).`)

  const results = await parallel(pairs.map(([a, b]) => () =>
    aretry(
      `Scientific debate. Goal: ${GOAL}\n\nWhich hypothesis is stronger (novelty + validity + testability)? Pick A or B.\n\nA) ${fmt(pool[a])}\n\nB) ${fmt(pool[b])}`,
      { label: `match:r${round}:${a}v${b}`, phase: 'Tournament', schema: MATCH_SCHEMA },
    ).then((m) => ({ a, b, winner: m.winner }))
  ))
  for (const m of results.filter(Boolean)) applyElo(pool, m.a, m.b, m.winner)
  pool.sort((a, b) => b.elo - a.elo)

  // --- Meta-review: synthesize patterns -> feedback overview --------------
  // HARDENING: single awaited call -> wrap so a transient failure just carries
  // no feedback forward instead of killing the workflow.
  phase('Meta-review')
  const standings = pool.slice(0, TOP_K * 2).map((h, i) =>
    `#${i + 1} (Elo ${Math.round(h.elo)}) ${h.title}: ${h.hypothesis}`).join('\n')
  try {
    overview = await aretry(
      `You are the meta-review agent. Goal: ${GOAL}\n\nAcross this round's reviews and tournament, synthesize: recurring strong patterns, common flaws, and concrete guidance to steer the NEXT round's generation and evolution.\n\nCurrent standings:\n${standings}`,
      { label: `meta:r${round}`, phase: 'Meta-review', schema: OVERVIEW_SCHEMA },
    )
  } catch (e) {
    log(`Round ${round}: meta-review failed after retries (${String(e).slice(0, 60)}) — no feedback carried forward.`)
    overview = null
  }
  history.push({ round, poolSize: pool.length, topElo: Math.round(pool[0]?.elo ?? 0), overview: overview?.overview ?? null })
  log(`Round ${round} done. Top Elo ${Math.round(pool[0]?.elo ?? 0)}. ${Math.round(budget.remaining()/1000)}k budget left.`)

  // Convergence: stop if top hypothesis has dominated and pool is mature.
  if (round >= 2 && pool[0] && pool[0].elo > 1300 && pool.length <= TOP_K) {
    log(`Converged early at round ${round}.`); break
  }
}

pool.sort((a, b) => b.elo - a.elo)
return {
  goal: GOAL,
  rounds: history.length,
  topHypotheses: pool.slice(0, TOP_K).map((h) => ({
    title: h.title, hypothesis: h.hypothesis, experiment: h.experiment,
    elo: Math.round(h.elo), review: h.review,
  })),
  researchOverview: overview?.overview ?? null,
  openQuestions: overview?.openQuestions ?? [],
  history,
}
