/**
 * spec-loop.smoke.mjs — standalone pure-function + syntax smoke test for the workflow suite.
 *
 * This is a TEST HARNESS, not a workflow. It is the only file in this suite where console
 * output is permitted (the .mjs workflow runtimes must never console.log). It runs under plain
 * node with NO workflow globals injected, so it CANNOT `import` the workflow files directly:
 * those files use top-level `await`/`return` (legal only because the harness wraps each body in
 * an async Function), which a real ESM `import` rejects. Instead it:
 *
 *   (i)  SYNTAX-CHECKS spec-loop.mjs, council-loop.mjs and feature-loop.mjs by reading each
 *        file, stripping the leading `export ` keyword per line, and compiling the body with
 *        `new (async () => {}).constructor(...globals, src)`. Any throw is a syntax failure.
 *   (ii) ASSERTS the pure helpers routeFromTable() and the wave planner exported by spec-loop.mjs.
 *        It loads them by executing spec-loop.mjs's wrapped body with no-op stub globals and the
 *        sentinel globalThis.__SPEC_LOOP_TEST__ set — the workflow assigns its pure helpers onto
 *        that sentinel and top-level `return`s BEFORE any phase()/agent() orchestration runs.
 *
 * Exit code is NONZERO on any failed assertion or syntax error. Invoke directly:
 *   node 000-System/Agents/Claude/workflows/spec-loop.smoke.mjs
 *
 * Repo root is detected dynamically (this file's own directory) — never hardcoded.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

let failures = 0
let checks = 0
/** Assert a condition; record + print a pass/fail line. */
function assert(cond, msg) {
  checks++
  if (cond) {
    console.log(`  PASS: ${msg}`)
  } else {
    failures++
    console.log(`  FAIL: ${msg}`)
  }
}

/**
 * Compile a workflow file's body the same way the harness does, to catch syntax errors.
 * Strips a leading `export ` from each line (the harness exposes `export const meta` etc. as
 * plain top-level bindings) and builds an AsyncFunction with the injected workflow globals.
 * Throws on a syntax error.
 */
function compileWorkflow(absPath) {
  const raw = readFileSync(absPath, 'utf8')
  const src = raw.replace(/^export\s+/gm, '')
  const AsyncFunction = (async () => {}).constructor
  // eslint-disable-next-line no-new-func — intentional: this is the harness's syntax oracle.
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow', 'args', 'budget', src)
}

/**
 * Execute spec-loop.mjs's wrapped body with no-op stub globals and the test sentinel set, so the
 * workflow assigns its pure helpers onto the sentinel and returns before any orchestration.
 * Returns { routeFromTable, planWaves }.
 */
async function loadPureHelpers(absSpecLoop) {
  const fn = compileWorkflow(absSpecLoop)
  const sentinel = {}
  globalThis.__SPEC_LOOP_TEST__ = sentinel
  const noop = () => undefined
  const stubAgent = async () => ({})
  const stubParallel = async (thunks) => Promise.all((thunks || []).map((t) => (typeof t === 'function' ? t() : t)))
  const stubWorkflow = async () => ({})
  try {
    await fn(stubAgent, stubParallel, noop, noop, noop, stubWorkflow, '{}', undefined)
  } finally {
    delete globalThis.__SPEC_LOOP_TEST__
  }
  return sentinel
}

async function main() {
  const specLoop = join(HERE, 'spec-loop.mjs')
  const councilLoop = join(HERE, 'council-loop.mjs')
  const featureLoop = join(HERE, 'feature-loop.mjs')

  // ── (i) Syntax checks ────────────────────────────────────────────────────────────────────
  console.log('Syntax checks (compile each workflow body as the harness does):')
  for (const [name, path] of [['spec-loop.mjs', specLoop], ['council-loop.mjs', councilLoop], ['feature-loop.mjs', featureLoop]]) {
    try {
      compileWorkflow(path)
      assert(true, `${name} compiles`)
    } catch (e) {
      assert(false, `${name} compiles — ${String((e && e.message) || e).slice(0, 200)}`)
    }
  }

  // ── Load the pure helpers from spec-loop.mjs via the test sentinel ─────────────────────────
  console.log('\nLoading pure helpers from spec-loop.mjs via __SPEC_LOOP_TEST__ sentinel:')
  let helpers
  try {
    helpers = await loadPureHelpers(specLoop)
    assert(typeof helpers.routeFromTable === 'function', 'routeFromTable exported onto sentinel')
    assert(typeof helpers.planWaves === 'function', 'planWaves (wave planner) exported onto sentinel')
    assert(typeof helpers.uniqueRouterDomains === 'function', 'uniqueRouterDomains (router dedup) exported onto sentinel')
  } catch (e) {
    assert(false, `helpers load — ${String((e && e.message) || e).slice(0, 200)}`)
    console.log(`\n${checks} checks, ${failures} failed`)
    process.exit(1)
  }
  const { routeFromTable, planWaves, uniqueRouterDomains, ROUTE: specLoopROUTE } = helpers

  // ── ROUTE table sync check: spec-loop.mjs and feature-loop.mjs carry identical inline tables ──
  // Item 4 (council round 4): both files duplicate ROUTE (no shared import due to platform
  // constraints). This assertion catches any divergence when the skill table changes.
  // We extract feature-loop.mjs's ROUTE by locating the `const ROUTE = Object.freeze({` header
  // and then walking character-by-character, tracking brace depth, until the matching `})` is
  // found. A lazy regex (/Object\.freeze\(\{([\s\S]*?)\}\)/) stops at the FIRST `})` it sees,
  // which would silently truncate (and falsely PASS) if any ROUTE value ever gained a nested
  // object. The bracket-depth walk is authoritative regardless of future schema shape.
  console.log('\nROUTE table sync check (spec-loop.mjs vs feature-loop.mjs):')
  try {
    const flRaw = readFileSync(featureLoop, 'utf8')

    /**
     * Extract the body of `Object.freeze({...})` at `startIdx` in `src` using bracket-depth
     * tracking. Returns the inner content (between the outer `{` and its matching `}`) or null
     * if no balanced closing bracket is found.
     * @param {string} src - the full source text
     * @param {number} startIdx - index of the `{` that opens the freeze call
     * @returns {string|null} the inner content between the outer braces, or null
     */
    function extractBalanced(src, startIdx) {
      let depth = 0
      let i = startIdx
      let innerStart = -1
      while (i < src.length) {
        const ch = src[i]
        if (ch === '{') {
          depth++
          if (depth === 1) innerStart = i + 1
        } else if (ch === '}') {
          depth--
          if (depth === 0) return src.slice(innerStart, i)
        }
        i++
      }
      return null
    }

    // Locate the `const ROUTE = Object.freeze({` declaration in feature-loop.mjs.
    const headerRe = /const ROUTE\s*=\s*Object\.freeze\(\{/
    const headerMatch = headerRe.exec(flRaw)
    if (!headerMatch) {
      assert(false, 'feature-loop.mjs ROUTE table extractable (const ROUTE = Object.freeze({...}) block found)')
    } else {
      // headerMatch.index points to `const`; find the `{` that opens Object.freeze's argument.
      const openBrace = flRaw.indexOf('{', headerMatch.index + headerMatch[0].length - 1)
      const inner = extractBalanced(flRaw, openBrace)
      if (inner === null) {
        assert(false, 'feature-loop.mjs ROUTE table extractable (balanced closing brace found)')
      } else {
        // Rebuild the object literal and eval it in a sandboxed Function (no globals needed).
        // eslint-disable-next-line no-new-func
        const featureLoopROUTE = new Function(`return Object.freeze({${inner}})`)()
        const specJson = JSON.stringify(specLoopROUTE, Object.keys(specLoopROUTE).sort())
        const featJson = JSON.stringify(featureLoopROUTE, Object.keys(featureLoopROUTE).sort())
        assert(specJson === featJson, 'spec-loop.mjs ROUTE and feature-loop.mjs ROUTE are identical (no drift)')
        if (specJson !== featJson) {
          // Print the first diverging key to help diagnose drift
          const specKeys = new Set(Object.keys(specLoopROUTE))
          const featKeys = new Set(Object.keys(featureLoopROUTE))
          const onlyInSpec = [...specKeys].filter((k) => !featKeys.has(k))
          const onlyInFeat = [...featKeys].filter((k) => !specKeys.has(k))
          if (onlyInSpec.length) console.log(`    only in spec-loop: ${onlyInSpec.join(', ')}`)
          if (onlyInFeat.length) console.log(`    only in feature-loop: ${onlyInFeat.join(', ')}`)
        }
      }
    }
  } catch (e) {
    assert(false, `ROUTE table sync check — ${String((e && e.message) || e).slice(0, 200)}`)
  }

  // ── (ii) routeFromTable assertions ─────────────────────────────────────────────────────────
  console.log('\nrouteFromTable() assertions:')
  const known = routeFromTable('backend/api design')
  assert(known && typeof known.agentType === 'string' && typeof known.model === 'string',
    'a known domain resolves via the table to {agentType, model} (zero LLM calls)')
  assert(routeFromTable('implementation (full-stack)') !== null,
    'another known domain (implementation) resolves via the table')
  assert(routeFromTable('totally-unknown-domain-xyz') === null,
    'an unknown domain returns null (not an error) so the LLM fallback can fire')
  assert(routeFromTable(null) === null, 'a null domain returns null without crashing')
  assert(routeFromTable(undefined) === null, 'an undefined domain returns null without crashing')
  // immutability: two calls return independent objects (no shared mutable reference)
  const a1 = routeFromTable('backend/api design')
  const a2 = routeFromTable('backend/api design')
  assert(a1 !== a2, 'routeFromTable returns a fresh object each call (no shared mutable reference)')

  // ── (ii) router dedup assertions (AC-T1c: exactly one router per unique domain) ──────────────
  console.log('\nuniqueRouterDomains() assertions:')
  {
    const leaves = [{ domain: 'X' }, { domain: 'X' }, { domain: 'Y' }]
    const uniq = uniqueRouterDomains(leaves)
    assert(uniq.length === 2, 'two leaves sharing domain X + one Y → exactly 2 unique router domains (one call per domain)')
    assert(uniq.includes('x') && uniq.includes('y'), 'unique domains are canonicalized (lowercased) to x and y')
  }
  {
    const uniq = uniqueRouterDomains([{ domain: null }, { domain: undefined }, { domain: '  ' }])
    assert(uniq.length === 1 && uniq[0] === '', 'null/undefined/blank domains all fold into one empty-string bucket (one content-routed call)')
  }
  {
    const uniq = uniqueRouterDomains([{ domain: 'B' }, { domain: 'A' }, { domain: 'B' }])
    assert(JSON.stringify(uniq) === JSON.stringify(['b', 'a']), 'order is preserved by first appearance (deterministic)')
  }

  // ── (ii) wave planner assertions ────────────────────────────────────────────────────────────
  console.log('\nplanWaves() assertions:')

  // (a) two leaves, disjoint touchPoints, no deps → same wave
  {
    const leaves = [
      { key: 'A', deps: [], touchPoints: ['src/a.ts'] },
      { key: 'B', deps: [], touchPoints: ['src/b.ts'] },
    ]
    const { waves } = planWaves(leaves)
    assert(waves.length === 1 && waves[0].length === 2,
      'two disjoint, dep-free leaves land in the same wave')
  }

  // (b) two leaves sharing a touchPoint → different waves (later key in the next wave)
  {
    const leaves = [
      { key: 'A', deps: [], touchPoints: ['src/api.ts'] },
      { key: 'B', deps: [], touchPoints: ['src/api.ts'] },
    ]
    const { waves } = planWaves(leaves)
    assert(waves.length === 2, 'two leaves sharing a touchPoint are serialized into different waves')
    const w0Keys = waves[0].map((l) => l.key)
    const w1Keys = waves[1].map((l) => l.key)
    assert(w0Keys.includes('A') && w1Keys.includes('B'),
      'the lexicographically-earlier leaf (A) goes first; the later-keyed leaf (B) goes to the next wave')
  }

  // (c) dependency order: B deps on A → A in an earlier wave than B
  {
    const leaves = [
      { key: 'A', deps: [], touchPoints: ['src/a.ts'] },
      { key: 'B', deps: ['A'], touchPoints: ['src/b.ts'] },
    ]
    const { waves } = planWaves(leaves)
    const waveOf = (k) => waves.findIndex((w) => w.some((l) => l.key === k))
    assert(waveOf('A') < waveOf('B'), 'a dependency edge places the dependent leaf in a strictly later wave')
  }

  // (d) sub-task overlap → collapsed to a single leaf, collapse logged
  {
    const leaves = [
      { key: 'F.1', feature: 'F', deps: [], touchPoints: ['src/shared.ts', 'src/one.ts'] },
      { key: 'F.2', feature: 'F', deps: [], touchPoints: ['src/shared.ts', 'src/two.ts'] },
    ]
    const { waves, collapses } = planWaves(leaves)
    const allLeaves = waves.flat()
    assert(allLeaves.length === 1, 'two sub-tasks of the same feature with overlapping touchPoints collapse to one leaf')
    assert(Array.isArray(collapses) && collapses.length >= 1, 'the collapse is reported (logged) by the planner')
    const collapsed = allLeaves[0]
    assert(collapsed.touchPoints.includes('src/one.ts') && collapsed.touchPoints.includes('src/two.ts') && collapsed.touchPoints.includes('src/shared.ts'),
      'the collapsed leaf carries the union of both sub-tasks touchPoints')
  }

  // (e) lexicographic tiebreak is stable: 'F10' sorts before 'F2'
  {
    const leaves = [
      { key: 'F2', deps: [], touchPoints: ['src/x.ts'] },
      { key: 'F10', deps: [], touchPoints: ['src/x.ts'] },
    ]
    const r1 = planWaves(leaves)
    const r2 = planWaves(leaves)
    assert(r1.waves[0][0].key === 'F10', "lexicographic tiebreak: 'F10' sorts before 'F2' and takes the first wave")
    assert(JSON.stringify(r1.waves.map((w) => w.map((l) => l.key))) === JSON.stringify(r2.waves.map((w) => w.map((l) => l.key))),
      'the same input yields the same wave assignment across runs (deterministic)')
  }

  // (f) immutability: planner must not mutate the input array or its leaf objects
  {
    const leaves = [
      { key: 'A', deps: [], touchPoints: ['src/a.ts'] },
      { key: 'B', deps: ['A'], touchPoints: ['src/b.ts'] },
    ]
    const snapshot = JSON.stringify(leaves)
    planWaves(leaves)
    assert(JSON.stringify(leaves) === snapshot, 'planWaves does not mutate its input leaves array')
  }

  // (g) cross-wave sub-task split fix: same-feature disjoint sub-tasks + cross-feature touchPoint collision.
  // Scenario: leaf A (feature A, touches b.ts) and F.1 (feature F, touches a.ts) are lex-first,
  // F.2 (feature F, touches b.ts) shares b.ts with leaf A. Under the old leaf-by-leaf loop, A and
  // F.1 would land in wave 0, then F.2 would be forced to wave 1 (b.ts is taken by A), splitting
  // F's sub-tasks across waves. Under the atomic-group fix, F.1 and F.2 are placed as a unit: the
  // union touchPoints {a.ts, b.ts} conflict with A's b.ts, so the WHOLE F group defers; only A
  // fits wave 0 alone, then F.1 and F.2 land together in wave 1. This means featureGroups.group
  // for F has length==2 in wave 1, triggering the intra-feature merge path for exactly one council.
  {
    const leaves = [
      { key: 'A',   feature: 'A', deps: [], touchPoints: ['b.ts'] },
      { key: 'F.1', feature: 'F', deps: [], touchPoints: ['a.ts'] },
      { key: 'F.2', feature: 'F', deps: [], touchPoints: ['b.ts'] },
    ]
    const { waves } = planWaves(leaves)
    const waveKeys = waves.map((w) => w.map((l) => l.key).sort())
    assert(waves.length === 2, 'same-feature disjoint sub-tasks + cross-feature collision → exactly 2 waves')
    assert(waveKeys[0].length === 1 && waveKeys[0][0] === 'A',
      'wave 0 contains only leaf A (F group deferred atomically due to b.ts conflict)')
    assert(waveKeys[1].length === 2 && waveKeys[1].includes('F.1') && waveKeys[1].includes('F.2'),
      'wave 1 contains BOTH F.1 and F.2 together (atomic group placement — no cross-wave split)')
  }

  // (h) split-dependency dep expansion: a leaf depending on a feature that was SPLIT into sub-tasks
  // must still be ordered AFTER all of that feature's sub-task leaves. Leaves inherit parent-FEATURE
  // deps (which name feature keys like 'G'), but the topo-sort keys on leaf keys (G.1/G.2). Without
  // expanding 'G' → {G.1, G.2}, the Kahn filter drops the edge and the dependent builds too early.
  {
    // Both F (deps:['G']) and G are split; F.1/F.2 inherit deps:['G'].
    const leaves = [
      { key: 'F.1', feature: 'F', deps: ['G'], touchPoints: ['src/f1.ts'] },
      { key: 'F.2', feature: 'F', deps: ['G'], touchPoints: ['src/f2.ts'] },
      { key: 'G.1', feature: 'G', deps: [],    touchPoints: ['src/g1.ts'] },
      { key: 'G.2', feature: 'G', deps: [],    touchPoints: ['src/g2.ts'] },
    ]
    const { waves } = planWaves(leaves)
    const waveOf = (k) => waves.findIndex((w) => w.some((l) => l.key === k))
    const fWave = Math.min(waveOf('F.1'), waveOf('F.2'))
    const gWave = Math.max(waveOf('G.1'), waveOf('G.2'))
    assert(fWave > gWave,
      'a dep on a SPLIT feature G keeps the dependent F strictly after ALL of G\'s sub-task leaves (no dropped edge)')
  }

  // (i) split-dependency with a WHOLE dependent: F whole deps:['G'], G split into G.1/G.2.
  {
    const leaves = [
      { key: 'F',   feature: 'F', deps: ['G'], touchPoints: ['src/f.ts'] },
      { key: 'G.1', feature: 'G', deps: [],    touchPoints: ['src/g1.ts'] },
      { key: 'G.2', feature: 'G', deps: [],    touchPoints: ['src/g2.ts'] },
    ]
    const { waves } = planWaves(leaves)
    const waveOf = (k) => waves.findIndex((w) => w.some((l) => l.key === k))
    const gWave = Math.max(waveOf('G.1'), waveOf('G.2'))
    assert(waveOf('F') > gWave,
      'a whole feature F depending on a SPLIT feature G is ordered after both G.1 and G.2')
  }

  console.log(`\n${checks} checks, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke harness crashed:', e)
  process.exit(1)
})
