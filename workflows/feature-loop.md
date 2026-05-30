# feature-loop — reusable epic/feature build loop (global)

A project-agnostic, two-part process for turning any `*-spec.md` into merged, reviewed code.
Lives in `~/.claude/workflows/` so it's reusable across repos.

| Part | Runs in | Does | Why it lives there |
|---|---|---|---|
| **`feature-loop.mjs`** | background **Workflow** | per-feature: brainstorm → spec → implement → (live-validate) → council-to-FOR → verify | heavy multi-agent work; keeps the main-loop context lean |
| **Driver** (this doc) | **main loop** (you/Claude) | scaffold issues+branches, checkout/rebase, commit, PR, **squash-merge**, version-bump wait, finalize | a background workflow *cannot* answer the merge-approval hook, can't reliably poll an async issue→branch automation, and runs under a `gh` account that can flip |

> Don't try to make the Workflow do `gh pr merge`/issue creation — it will stall or fail. That's the driver's job.

Invoke the workflow per feature by **absolute scriptPath** — the name registry does NOT resolve
`~/.claude/workflows/*.mjs` (only built-ins like deep-research / code-review), so `{ name: ... }`
errors. Pass `workflowsDir` so the nested council-loop path is OS-correct without hardcoding the
vault root:

```
Workflow({
  scriptPath: "/home/kiriketsuki/.claude/workflows/feature-loop.mjs",
  args: { ...<FEATURE>, workflowsDir: "/home/kiriketsuki/.claude/workflows" }
})
```

---

## `args` (`<FEATURE>`) — all project-specifics are parameters

```jsonc
{
  // identity
  "key": "F4", "issue": 42, "branch": "feature/42-...", "parentRef": "origin/epic/7-...",
  "title": "Real API adapter", "scopeTasks": "T4", "briefing": "one-paragraph what/why",

  // project config — NO hardcoding; pass yours
  "project": { "name": "<Project>", "specFile": "<spec>.md", "buildCmd": "npm run build", "testCmd": "npm test" },

  // implement routing — two modes (both optional):
  //   a) explicit: supply agentType + model to bypass the table entirely.
  //   b) table routing: supply only "domain" (e.g. "backend", "frontend", "mobile app",
  //      "firmware", "pr review", "code simplification", "type design review", "rapid prototype").
  //      When agentType AND model are both omitted, routeFromTable(domain) is used — the same
  //      static ROUTE table as spec-loop.mjs (zero LLM calls). Unclassified domains fall back to
  //      Senior Developer / sonnet. A partial override (agentType only) fills the missing field
  //      from the table result; an explicit pair bypasses the table entirely.
  "agentType": "Backend Architect", "model": "sonnet",   // mode (a): explicit pair — table bypassed
  "domain": "backend",                                   // mode (b): consulted ONLY when agentType+model are both omitted (ignored alongside the explicit pair above — shown here just to illustrate the field)

  // optional, HIGH VALUE for anything with a backend: prove behavior on a REAL service, not mocks
  "liveValidate": "Start the real backend; prove <invariant A>; prove <invariant B>; fix defects and re-run.",
  "envNote": "how to start the local DB/service (e.g. a CLI command)",

  // council knobs (optional; defaults shown)
  "council": { "advocates": 1, "critics": 1, "questioner": false, "rounds": 2, "maxLoops": 4 },

  // optional extra project rules appended to the working agreement
  "extraRules": "e.g. follow the design-token system in src/styles"
}
```

The workflow **does no git** and returns `{ converged, council.finalVerdict, impl, spec, verify, ... }`.
Merge only when `converged === true`.

---

## Phase 0 — Scaffold (main loop)

```bash
R=<owner>/<repo>; EPICSLUG=epic/<N>-<slug>
gh auth switch --user <account>                       # gh active account flips between sessions — assert it
for L in epic feature task; do gh label create $L -R $R 2>/dev/null || true; done   # if your repo uses a label-driven branch handler

# epic issue → (handler) creates epic branch from main
gh issue create -R $R --title "<Epic title>" --label epic --body "<overview>"
until git ls-remote --heads origin "$EPICSLUG" | grep -q .; do sleep 5; git fetch -q; done

# feature issues: create WITHOUT a trigger label, link as sub-issue, THEN label
# (so a label-driven handler bases the branch on the epic, not main)
num=$(basename "$(gh issue create -R $R --title "<Feature>" --body "<body>")")
cid=$(gh api repos/$R/issues/$num --jq .id)
gh api --method POST repos/$R/issues/<EPIC#>/sub_issues -F sub_issue_id=$cid
gh issue edit $num -R $R --add-label feature
```

If your repo has **no** branch automation, just create the branches yourself
(`git checkout -b feature/<n>-<slug> <epic-branch>; git push -u origin HEAD`).
If the org blocks Actions-created PRs, the driver creates PRs at merge time anyway.

---

## Phase 1 — Per-feature drive loop (main loop)

Process features in **dependency order**. For each:

```bash
git fetch -q origin && git checkout <feature-branch> && git rebase origin/$EPICSLUG
```
Run `Workflow({ scriptPath:"/home/kiriketsuki/.claude/workflows/feature-loop.mjs", args:{ ...<FEATURE>, workflowsDir:"/home/kiriketsuki/.claude/workflows" } })` and **wait for the completion notification**.
Read the result. If `converged`:
```bash
git add -A && git commit -m "feat(<scope>): <feature> (#<issue>)"
git push --force-with-lease origin HEAD               # force-with-lease: you rebased
gh pr create -R $R --base $EPICSLUG --head <feature-branch> --title "feat: ..." --body "..."
gh pr checks <pr> -R $R                                # wait for required checks
gh pr merge <pr> -R $R --squash --delete-branch        # approval hook prompts — you approve
```
If a version-bump-on-merge automation exists, wait for its commit on the epic before the next rebase.
If `converged === false`: inspect `result.council.finalVerdict.findings`; fix + re-run a council pass or file a follow-up — never auto-merge a non-converged feature.

---

## Sequential vs parallel

- **Within a feature**: advocate ∥ critic run in parallel (raise `council.critics` for more review lenses).
- **Across features**: one working tree ⇒ sequential by default. To parallelize **independent** features (same wave, no shared files), provision a **git worktree** per feature and run one `feature-loop.mjs` per worktree, then merge into the epic in order:
  ```bash
  git worktree add ../wt-A <branch-A>; git worktree add ../wt-B <branch-B>
  # run a Workflow in each worktree; merge sequentially; git worktree remove when done
  ```

---

## Phase 2 — Finalize (main loop)

```bash
gh pr create -R $R --base main --head $EPICSLUG --title "epic: ..." --body "Closes #1
Closes #2"                                             # closing keywords auto-close on merge to DEFAULT branch
gh pr merge <pr> -R $R --squash --delete-branch
git checkout main && git pull --ff-only && npm run build && npm test
```

---

## Recovery after a usage limit / budget stop

These workflows are **limit-resistant and resumable**. `tryAgent` backs off on transient blips but
**bails fast** on a hard usage/rate limit (it won't burn retries inside a blocked window). On a hard
limit — or when the turn's token budget (`budget.remaining()`) drops below the floor (`minBudget`,
default 80k) before an expensive phase — the workflow stops cleanly and returns `resumable: true`
instead of pushing a half-finished phase or (critically) letting a limit-killed review register as
"no findings → merge".

To resume, re-invoke with the **same** `scriptPath` + **byte-identical** `args`, plus the `runId`
from the stopped run's tool result:

```
Workflow({
  scriptPath: "/home/kiriketsuki/.claude/workflows/feature-loop.mjs",
  args: { ...<FEATURE>, workflowsDir: "/home/kiriketsuki/.claude/workflows" },
  resumeFromRunId: "<runId from the stopped run>"
})
```

The journal replays every completed `agent()` call from cache (~0 tokens); only the unfinished phase
re-runs live. Git **is** the checkpoint — every commit/push/promote/merge prompt is idempotent
(tolerates "nothing to commit", pushes `--force-with-lease`, and checks "already merged / already on
branch" before acting), so a re-run of the interrupted agent never double-commits or double-merges.
Resume in a **fresh turn** so the token budget has reset.

> A `resumable: true` result is NOT a failure — it means "paused at a safe point." A terminal result
> has `resumable: false` (converged, honestly stalled, or iteration-capped).

---

## Gotchas checklist (each paid for once)

- [ ] **Parse `args` defensively** — `feature-loop.mjs` does. An unparsed string dropped all scoping and built the whole spec at once.
- [ ] **Scope guard** — build agents implement ONLY the named feature; other features are dependencies to read, not rebuild.
- [ ] **Fix-then-review council** — the loop's last action is a review, so the final verdict reflects final code.
- [ ] **Live-validate the real backend** — unit tests + agent self-reports missed that SQL never ran and realtime delivered zero events. Pass `liveValidate` for backend features.
- [ ] **Per-agent retry** (`tryAgent`) backs off on transient 529/overload but **bails fast on a hard usage/rate limit** → workflow returns `resumable:true`; resume with `resumeFromRunId` after the limit resets (see Recovery above).
- [ ] **`gh auth switch`** before every gh batch (active account flips).
- [ ] **Sub-issue link before labeling** (label-driven handlers base the branch on the parent at label time).
- [ ] **`--force-with-lease`** after rebasing a feature branch.
- [ ] **Merge approval hook** is intended — it prompts on every `gh pr merge`.
