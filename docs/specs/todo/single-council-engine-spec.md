# Feature: Single Council Engine

## Overview

**User Story**: As a user of the council, I want one engine with one set of
rules for review, fixes, pushes and liveness. Then I know which behavior runs,
and a fix to the council lands in one place.

**Problem**: Four paths run the same review and fix loop. The
`adversarial-council`, `council-supervisor` and `council-fix` skills drive an
agent team by hand. The `council-loop` workflow drives scripted agents. Each
path has its own fix, push and liveness rules. The supervisor reimplements
stall detection that the workflow runtime now provides.

**Out of Scope**:

- The internals of `feature-loop.mjs` and `spec-loop.mjs`. They keep their
  `workflow()` call to `council-loop`, and the new arguments default to the
  current behavior.
- The `review: 'budget'` path in `feature-loop.mjs` and the critique phase in
  `autofix-swarm.mjs`. Both are small single-agent reviews. Open question 9
  covers them.
- Any change to the anti-gaming gate, the promote rule or the ledger of
  `autofix-swarm.mjs`.
- A new council protocol. The engine keeps the exchange debate that
  `council.debate: 'exchange'` already defines.

## Success Condition

> This feature is complete when every council entry point runs its review
> through `council-loop.mjs`. No skill spawns a debate team by hand, and the
> workflow smoke suite passes with the same legacy prompt digest. The entry
> points are `/adversarial-council`, `/council-fix`, `/council-supervisor`,
> `/parallel-fix --from-council`, `feature-loop`, `spec-loop` and
> `autofix-swarm`.

## Current Paths

| Path | Debate | Fix | Liveness | Output |
|:-----|:-------|:----|:---------|:-------|
| `adversarial-council` | Agent team, live `SendMessage`, N advocates and N-1 critics, questioner, arbiter | Gate menu, then a manifest and a handoff to a fix loop in a fresh session | None | Recommendation markdown |
| `council-supervisor` | Same team, driven by the supervisor | Chains to `parallel-fix` | Heartbeats, nudges, agent replacement, checkpoint file | `.council/council-result.json` |
| `council-fix` | Calls `adversarial-council --supervised --skeptic` | Plan file only | Inherited from the supervisor | Plan file in `~/.claude/plans/` |
| `parallel-fix` | None | Three competing worktree fixes, smallest passing diff wins | Agent timeout | Updated `council-result.json` |
| `council-loop.mjs` | Scripted lenses, legacy `parallel` or `exchange` | Plan, fix, fix review, commit and push per round | Runtime stall restart, null guards, limit stop, resume | Structured return value |

## Decisions

### D1. Feature matrix

Each row names one capability, its destination and the reason. The
destinations are an engine argument, a thin skill wrapper, a separate skill,
or removal.

#### Debate

| Capability | Source | Destination | Reason |
|:-----------|:-------|:------------|:-------|
| Motion intake: inline text, file, natural language, one clarifying question at a time | adversarial-council Step 1 | Thin wrapper | Intake needs the user. A workflow takes no mid-run input. |
| Code scan prep: PR diff, branch diff, named files | adversarial-council Step 1 | Engine (`target`, `scope`) | The engine already reads the committed diff by ref and pins the branch. |
| Non-code motions: plans, architecture decisions, strategy | adversarial-council GENERAL path | Engine arg `subject.kind: 'text'` | See D2. One debate protocol and one set of null guards. |
| Team debate with live messaging (`TeamCreate`, `SendMessage`, free-form headers) | adversarial-council, council-supervisor | Removed after one release | Agent teams are experimental and off by default. They have no resume and one team per session. The supervisor exists to babysit them. Exchange mode keeps the adversarial rounds with schema-checked output. |
| Advocate and critic counts (`--n`, `--skeptic`) | adversarial-council | Wrapper maps to `council.advocates` and `council.critics` | The engine already takes both counts. The wrapper keeps at least one advocate, because the rebuttal needs one. |
| Debate rounds (`--rounds`) | adversarial-council | Wrapper maps to `council.rounds` | Exchange mode caps extra critic replies at two. The wrapper logs when it clamps a larger value. |
| Named roles and the role focus map (`--roles`, PERF, SEC, UX and others) | adversarial-council Step 3 | New engine arg `council.focus` | The engine injects one focus line per role name. The wrapper builds the map from the role names. |
| Questioner that probes uncited claims | questioner template | Engine (exchange questioner) | Exchange mode runs the questioner on disputed findings only, and it reads the code itself. That is the same check with fewer calls. |
| Evidence protocol: `file:line` for code, a named source for text | evidence-protocol.md | Engine prompts | Exchange critics already quote evidence. Text mode adds the named-source rule to the critic prompt. |
| Scope audit: relevance and pre-existence tests | arbiter template | Engine (arbiter prompt) | The exchange arbiter already drops pre-existing and unrelated findings. |
| Critical discoveries: security, data loss, compliance | arbiter template | New engine verdict field `criticalDiscoveries` | The finding is informational. It must not block, and it must not vanish. |
| Prior council lookup | adversarial-council Step 1 | Wrapper reads the last result, engine arg `priorContext` | File discovery is wrapper work. The engine injects the text into the critic and arbiter prompts. |
| Fix registry and regression history (`council-fix-registry.md`) | autofix-pipeline Phase 6 | Removed, replaced by the ledger | The exchange ledger tracks each blocker, its fix attempts and a regression status in the result. A second hand-edited table drifts. |
| Model selection: auto complexity and `--model*` flags | adversarial-council Step 1.5 | Wrapper maps to `council.model` | The engine keeps its opus floor for the arbiter, fix plan and fix review. The legacy sonnet arbiter at low complexity no longer applies. |
| Loose message handling: ask the user what an agent meant | adversarial-council Step 4 | Removed | Schemas force structure. An invalid output retries five times and then fails the call. |
| Consolidated single-agent fallback when agent capacity runs out | council-supervisor | Removed | One agent that plays every role is the inline debate the skill forbids. The runtime queues agents above the concurrency cap. |

#### Liveness and recovery

| Capability | Source | Destination | Reason |
|:-----------|:-------|:------------|:-------|
| Heartbeats, nudges and stall detection | council-supervisor Step 4 | Runtime | The runtime restarts a silent agent up to five times. `stallMs` sets the window. |
| Agent replacement with the transcript so far | council-supervisor Step 4 | Runtime plus engine prompts | A restart starts without the old transcript. Each engine prompt already carries the full debate state, so a restart loses nothing. |
| Arbiter stall | council-supervisor | Engine | A null arbiter stops the run as resumable. No verdict is ever guessed. |
| Questioner stall | council-supervisor | Engine | A null questioner stops the run as resumable. The supervisor went on without probes. The engine is stricter on purpose. |
| Checkpoint file `.council/checkpoint.json` | council-supervisor | Runtime journal | `resumeFromRunId` replays the completed agents from the journal. |
| Context pressure and early convergence | council-supervisor | Removed | Script variables hold the state, not a context window. `minBudget` stops the run before a round that the budget cannot finish. |
| Usage and rate limits | council-loop `LIMIT_RE` | Runtime, with the engine stop kept | The runtime pauses an interactive run at a usage limit. The engine stop still covers `claude -p`, the Agent SDK and background sessions. |

#### Fix, merge and output

| Capability | Source | Destination | Reason |
|:-----------|:-------|:------------|:-------|
| Findings gate menu `y/N/modify` | findings-gate.md | Thin wrapper, between runs | A workflow takes no mid-run input. The docs say to run each stage as its own workflow for sign-off. |
| Citation verifier: purge PHANTOM, tag UNVERIFIED and RUNTIME | findings-gate.md step 2.5 | Engine, plan mode | Plan mode has no fix review after the verdict, so it needs a separate citation check. Auto mode keeps the fix review as its check. |
| Plan-only fix | council-fix | Engine arg `fix: 'plan'` | See D3. |
| Autofix: plan, fix, review, commit and push per round | council-loop, fix-loop.md, autofix-pipeline.md | Engine arg `fix: 'auto'` (default) | See D3. The engine path already has the null guards that the prose loops lack. |
| Red-first regression test and the three-attempt ceiling | fix-loop.md | Engine | The ledger stops a blocker after three fix attempts. A new opt-in arg `redFirst` adds the failing-test-first rule to the fix prompt. |
| `/simplify` pass after the fixes | fix-loop.md 7.4 | Removed | The fix review checks scope after each round. A second edit pass after review adds unreviewed changes. |
| Fix manifest and the handoff to a fresh session | findings-gate.md | Removed | The engine state lives in the workflow, not in the main context. The wrapper starts a second run with `fix: 'auto'` instead. |
| PR creation and the merge gate | autofix-pipeline Phases 4 and 5 | Engine (`merge`) | The merge phase already creates a missing PR and squash-merges. The `gh pr merge` hook asks the user every time. |
| PR description amendments | arbiter template | New engine verdict field `prAmendments`, wrapper applies | The wrapper offers `gh pr edit` after the user accepts. |
| Parallel competing fixes | parallel-fix | Separate skill, rebased on `autofix-swarm.mjs` | See D3. |
| Arbiter output format (FORMAT A and FORMAT B markdown) | arbiter template | Wrapper renders from the structured verdict | The engine returns data. Rendering is presentation, and it can change without a journal break. |
| Debate record: positions, concessions, questioner rulings | arbiter template | New engine result field `debateLog` | The wrapper needs it to render positions and concessions. Today the engine discards it after each round. |
| `council-result.json` | council-supervisor Step 6 | Wrapper writes it from the engine result | The engine has no file access. The schema stays a superset of today's file. See D5. |
| Plan file in `~/.claude/plans/` | council-fix Step 3 | Wrapper | It is a user-home path and a presentation choice. |
| Recommendation markdown `YYYY-MM-DD-HHmmss-council-<slug>.md` | arbiter | Wrapper | The wrapper stamps the time. A workflow script cannot read the clock. |
| Presets `--thorough` and `--quick` | council-fix | Wrapper | Presets only expand to arguments. |

### D2. Non-code motions

**Decision**: the engine grows a text mode. `adversarial-council` keeps no
debate path of its own.

**Shape**: `subject: { kind: 'text', motion, files }`. `motion` is the
proposition. `files` lists repo paths to read, such as a plan or an ADR. Text
mode has these rules:

- It needs `council.debate: 'exchange'` and `fix: 'plan'`. Any other
  combination fails at argument parse.
- The review preamble tells agents to read the motion and the files. It runs
  no `git diff` and pins no branch.
- A critic finding uses the document path as `file`, or an empty string, and
  line 0 when no line applies. The schema already allows both.
- Evidence is a named source or a reasoning chain, as in
  `evidence-protocol.md`.
- The arbiter rules FOR, AGAINST or CONDITIONAL. Its findings become action
  items. The run makes one convening and skips the Verify and Merge phases.

**Why not a small text path in the skill**: a text path in the skill needs
its own debate. That means a team, a supervisor and a second set of rules.
That is the duplication this feature removes. The text mode adds about 60
lines to the engine and reuses the exchange functions.

**Cost**: `council-loop.mjs` is already 904 lines, over the 800-line cap.
Workflow scripts cannot import each other. Step M9 deletes the legacy
`parallel` debate and pays the lines back.

### D3. Fix modes

The engine keeps two fix modes. A third value fails at argument parse.

| Mode | Engine behavior | Who uses it |
|:-----|:----------------|:------------|
| `fix: 'plan'` | One convening. No fix plan, fix or fix review agent. No commit, no push, no merge. A citation check labels each finding `verified`, `unverified`, `phantom` or `runtime`. The result carries a `plan` with blockers, non-blockers and phantoms. Verify still runs, so `converged` keeps its meaning. | `/council-fix`, `/adversarial-council` by default, every text motion, the `autofix-swarm` backstop |
| `fix: 'auto'` (default) | Today's loop: fix plan, fix, fix review, semantic commit and push per round, re-review to an unconditional FOR, verify, optional merge | `feature-loop`, `spec-loop`, `/council-fix --auto`, the wrapper after a `y` on a plan result |

`fix: 'plan'` with `merge: true` fails at argument parse. The
`autofix-swarm` backstop today fakes review-only mode with `maxLoops: 1` and
`applyNonBlockers: false`. It moves to `fix: 'plan'`.

Parallel competing fixes are not a council fix mode. The `parallel-fix` skill
races minimal, refactor and rewrite strategies in worktrees and keeps the
smallest passing diff. `autofix-swarm.mjs` already does this with more
rigor. It adds an anti-gaming gate, an independent test re-run, a
falsification set, a ledger and a stagnation pivot. Two copies of that race
would drift.

So `parallel-fix` stays a separate skill and becomes a thin wrapper over
`autofix-swarm.mjs`:

- A direct call passes the bug as `task`.
- `--from-council <path>` reads `council-result.json`. It groups the
  verified and unverified findings by file, at most five per group, and runs
  one swarm per group.
- `--strategies` maps to `fanout`. The swarm clamps it to two or three.
- `--timeout` maps to `stallMs`. Open question 4 covers the gap.
- The "fresh rewrite" strategy becomes the swarm's `alternative-root-cause`.
  The synthesis agent becomes the swarm's council pivot.

### D4. Runtime and supervisor

| Supervisor feature | Runtime feature that replaces it | Gap |
|:-------------------|:---------------------------------|:----|
| Heartbeat check and two nudges | Stall restart, up to five restarts, `stallMs` per agent | None for a silent agent |
| Replace a stalled agent with the transcript so far | Restart from the same prompt | None, because each engine prompt holds the debate state |
| Checkpoint file | Run journal and `resumeFromRunId` in the same session | A fresh session cannot resume. It returns `nothing to resume`. |
| Resume after the session ends | `claude --resume` replays the run. Background sessions carry it over. | Same gap as above for a fresh session |
| Agent capacity check | Concurrency cap of 16 with a queue. 1,000 agents per run. | None |
| Retry on a transient error | Runtime retries, then `agent()` resolves to `null` | None. The engine guards every null. |
| Stop at a usage limit | Interactive runs pause until the reset, at most twice | `-p`, the SDK and background sessions still fail. The engine stop stays. |

Still missing after this feature:

1. **Hung tool calls.** Time spent in an agent's own tool call does not count
   toward the stall window. A test command that hangs is never restarted.
2. **Fresh-session resume.** The ledger lives only in the run. A new run
   re-reviews the committed branch from zero. A should-have arg
   `council.seedLedger` takes the ledger from a prior result.
3. **Mid-run input.** The gate menu must sit between runs.
4. **Live view of the debate.** The user sees agents in `/workflows`, not a
   message thread. `log()` lines carry the per-round counts.

### D5. Thin wrapper shape

**Where it runs**: in the main conversation. A skill with `context: fork`
cannot launch a workflow, because Claude Code removes the `Workflow` tool from
every subagent. The wrapper skills set no `context` key.

**Invocation control**:

- `adversarial-council` stays model-invocable, so natural-language triggers
  keep working. Its default is `fix: 'plan'`, which never edits the tree.
- `council-fix` keeps `disable-model-invocation: true`. Its `--auto` flag
  commits and pushes, so only the user starts it.
- A model-invoked wrapper never passes `fix: 'auto'` or `merge: true` unless
  the user typed that request in the current exchange.

**Steps the wrapper follows**:

1. Parse the flags and the motion. Ask one clarifying question at a time when
   the target is unclear.
2. Resolve the target. For a PR, run `gh pr view <n> --json
   headRefName,baseRefName,state`. Stop when the state is `MERGED`. For a text
   motion, collect the files.
3. Detect `buildCmd` and `testCmd` with the table that `parallel-fix` uses
   today. Ask the user when none matches.
4. Read the last `.council/council-result.json` for this slug into
   `priorContext`.
5. Build the args. Pass objects, not a JSON string.
6. Check that `$HOME/.claude/workflows/council-loop.mjs` exists. If not,
   tell the user to install the `workflows` component, and stop.
7. Call `Workflow({ scriptPath: "<absolute path>", args })`. The path must be
   absolute, because the name registry does not resolve these scripts today.
8. Tell the user the run started and that `/workflows` shows progress.

**Permissions and approval**:

- The launch prompt follows the permission mode. Auto mode asks on the first
  launch only. Manual mode asks on every run. Bypass mode does not ask.
- An allow rule `Workflow` removes the prompt. The README documents it as an
  option, not a default.
- Workflow agents use the session permission rules. A run pauses on an agent
  permission prompt, so `gh pr merge` still waits for the user through the
  hook ask decision.

**How results return**: the run ends and its return value arrives in the
session. The wrapper then does this:

1. Write `.council/council-result.json`. Keep every field of today's schema
   and add `runId`, `subject`, `fixMode`, `ledger` and `debateLog`. Map the
   fields as follows. `motion_type` comes from `subject.kind`. `verdict` and
   `conditions` come from the final verdict. `summary` comes from its
   rationale. `findings[].verification` comes from the citation check.
   `confidence` and `early_convergence` become `null` and `false`.
2. Write the recommendation markdown in FORMAT A for a diff or FORMAT B for
   text.
3. Render the findings table or the action items table.
4. Show the gate. On a plan-mode diff result, `y` starts a second run
   with `fix: 'auto'`. `N` records the result. `modify` asks for the new motion
   and starts a new plan-mode run.
5. On a resumable stop, show the reason and offer a relaunch with
   `resumeFromRunId`.

**Flag mapping**:

| Old flag | New behavior |
|:---------|:-------------|
| `--motion`, `--motion-file` | Diff target or `subject.motion` |
| `--n`, `--skeptic` | `council.advocates`, `council.critics` |
| `--rounds` | `council.rounds`, clamped |
| `--roles` | `council.focus` |
| `--model`, `--model-*` | `council.model`, with the engine floor |
| `--supervised` | Accepted. It prints a notice that the runtime supervises every run. |
| `--chain-fix` | After a plan-mode result, run `/parallel-fix --from-council` |
| `--heartbeat-interval`, `--max-nudges`, `--max-agents` | Accepted and ignored, with a notice |
| `--output` | Path of `council-result.json` |

### D6. Migration

Each step ships alone and has its own rollback. A revert of one step leaves
the earlier steps working.

| Step | Change | Rollback | Existing users |
|:-----|:-------|:---------|:---------------|
| M1 | Engine: add `fix: 'plan'`, the citation check, and the `plan`, `debateLog`, `criticalDiscoveries` and `prAmendments` result fields. Defaults keep every legacy prompt byte-identical. Add smoke cases. | Revert the commit | No change. `feature-loop` and `spec-loop` pass no `fix`, so they get `auto`. |
| M2 | Engine: add `subject.kind: 'text'`, `priorContext`, `council.focus` and opt-in `redFirst` | Revert the commit | No change. Every new arg is opt-in. |
| M3 | `autofix-swarm.mjs` backstop: `fix: 'plan'` in place of `maxLoops: 1` | Revert one call | Same review, with an explicit no-push guarantee |
| M4 | `adversarial-council` becomes the thin wrapper. The team procedure moves to `references/legacy-team.md` behind `--legacy-team`. | Pass `--legacy-team`, or revert | Same triggers and flags. The result arrives when the run ends, not as a live thread. |
| M5 | `council-fix` becomes an alias: `fix: 'plan'`, `--skeptic`, the plan file, and `--auto` for a second run | Revert the commit | Same command, same plan file path |
| M6 | `parallel-fix` becomes a wrapper over `autofix-swarm.mjs`. `council-supervisor` becomes a shim that forwards to `adversarial-council` and prints a deprecation notice. | Revert each skill alone | Same commands. `--chain-fix` still chains. |
| M7 | Docs: `council-patterns.md`, README, WALKTHROUGH, skills index, workflows index | Revert the docs | Docs match the behavior |
| M8 | One release after M6, delete `--legacy-team`, `fix-loop.md`, `autofix-pipeline.md`, `council-fix-registry.md` support and the `council-supervisor` directory | Restore from the M7 tag | The shim and the legacy flag are gone. The notice gave one release of warning. |
| M9 | Engine: make `exchange` the default debate and delete the legacy `parallel` path. Run it only when no `feature-loop` or `spec-loop` run is in flight, because a prompt change breaks their resume journals. | Revert the commit | Callers get the exchange debate. The file falls back under 800 lines. |

## Open Questions

| # | Question | Raised By | Recommended Answer | Resolved |
|:--|:---------|:----------|:-------------------|:---------|
| 1 | Does the loss of a live message thread weaken the debate? | Spec author | No. Exchange mode keeps concede, dispute and reply rounds with evidence. Keep `--legacy-team` for one release and compare verdicts on three PRs before M8. | [ ] |
| 2 | Can the engine run by name as `/council-loop`? The docs show saved workflows as `.js`. The hub ships `.mjs`, and the name registry does not resolve it. | Spec author | Keep the absolute `scriptPath`. File a separate issue to test a `.js` copy. | [ ] |
| 3 | Does "do not ask again" apply to a `scriptPath` launch? The docs offer it only for a run by name. | Spec author | Assume no. Document the `Workflow` allow rule as the way to stop the prompt. | [ ] |
| 4 | How does the engine bound a hung tool call, which the stall window skips? | D4 | Add a prompt rule: wrap build and test commands in `timeout`. The wrapper passes the limit from `--timeout`. | [ ] |
| 5 | Should text mode allow `fix: 'auto'` to revise a plan document in the repo? | D2 | No, not in this feature. A revised plan needs human sign-off. Revisit after M9. | [ ] |
| 6 | A null questioner now stops the run. The supervisor went on without it. Is that too strict? | D1 | Keep it strict. The stop is resumable, and an unprobed dispute is an unreviewed finding. | [ ] |
| 7 | The legacy auto-complexity table sets a sonnet arbiter. The engine floors the arbiter at opus. Which wins? | D1 | The engine floor wins, per the model tiering rule. The wrapper sets only advocate, critic and questioner models. | [ ] |
| 8 | Should the `skills-council` component require the `workflows` component? | D5 | Yes. Add a `requires=workflows` key in a follow-up. Until then, the wrapper checks the path and prints the install command. | [ ] |
| 9 | Should the `feature-loop` budget review and the `autofix-swarm` critique phase also use the engine? | Out of Scope | Not in this feature. File a follow-up issue after M9. | [ ] |
| 10 | How does a user continue a council in a fresh session? | D4 | Start a new run. The committed branch carries the fixes. The should-have `council.seedLedger` arg carries the open blockers. | [ ] |

## Scope

### Must-Have

- Engine `fix` arg with `'plan'` and `'auto'`: plan mode makes no commit, no
  push and no merge, and an invalid value fails at parse.
- Plan-mode citation check: each finding carries a `verification` label.
- Engine text mode: a text motion runs to a FOR, AGAINST or CONDITIONAL
  verdict without a git command.
- Engine `priorContext`, `council.focus` and the new result fields
  (`plan`, `debateLog`, `criticalDiscoveries`, `prAmendments`).
- Legacy default path unchanged: the legacy prompt digest in
  `workflows.smoke.mjs` stays the same, and `feature-loop` and `spec-loop`
  need no edit.
- `adversarial-council` thin wrapper: every listed flag maps as in D5, and no
  default path calls `TeamCreate`.
- `council-fix` alias: same command and plan file path, plus `--auto`.
- `parallel-fix` on `autofix-swarm.mjs`: direct calls and `--from-council`
  both work.
- `council-supervisor` shim: forwards and prints a deprecation notice.
- `autofix-swarm` backstop on `fix: 'plan'`.

### Should-Have

- `council.seedLedger`: a new run starts with the open blockers of a prior
  result.
- Opt-in `redFirst` fix rule.
- `requires=` key for component manifests.

### Nice-to-Have

- A `/council-loop` named command, if open question 2 resolves to yes.

## Technical Plan

**Affected Components**: `workflows/council-loop.mjs`,
`workflows/autofix-swarm.mjs`, `workflows/workflows.smoke.mjs`,
`skills/council/adversarial-council/` (SKILL.md and references),
`skills/council/council-fix/SKILL.md`,
`skills/council/council-supervisor/SKILL.md`,
`skills/council/parallel-fix/SKILL.md`, `docs/patterns/council-patterns.md`,
`docs/skills/index.md`, `docs/workflows/index.md`, `README.md`,
`docs/WALKTHROUGH.md`.

**Data Model Changes**:

- Engine args: `fix`, `subject`, `priorContext`, `council.focus`,
  `redFirst`, and the should-have `council.seedLedger`.
- Verdict schema: a new exchange-only schema adds optional
  `criticalDiscoveries` and `prAmendments` arrays. The legacy digest hashes
  each call schema, so the legacy `VERDICT_SCHEMA` stays unchanged.
- Engine result: `fixMode`, `subject`, `plan`, `debateLog`.
- `.council/council-result.json`: a superset of today's schema, written by
  the wrapper.

**API Contracts**:

- `Workflow({ scriptPath: "<abs>/council-loop.mjs", args })`. `args.fix`
  defaults to `'auto'`, and `args.subject.kind` defaults to `'diff'`.
- Plan mode returns `{ fixMode: 'plan', plan: { blockers, nonBlockers,
  phantoms }, councilConverged, converged, verified, ledger, debateLog }`.
  `merge` is always `null`.

**Dependencies**: the Claude Code workflow runtime with `workflow()`
nesting, which is one level only. `gh` for PR targets. The `workflows`
installer component. No dependency on agent teams after M8.

**Risks**:

| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| An engine prompt change breaks the resume journal of a run in flight | Medium | New prompts sit behind new args. The legacy digest test guards the default path. M9 runs only with no run in flight. |
| `council-loop.mjs` grows further past the 800-line cap | High | Accept until M9 deletes the legacy path. Workflow scripts cannot import. |
| A wrapper launched from inside a workflow agent fails, because subagents have no `Workflow` tool | Low | The wrapper runs only in the main conversation. The SKILL.md says so. |
| Users who installed `skills-council` without `workflows` get a missing-script error | Medium | The wrapper checks the path first. Open question 8 adds a manifest dependency. |
| The usage-limit pause does not cover `-p`, SDK or background runs | Medium | The engine keeps its limit stop and resumable result. |
| The model writes `council-result.json` with a wrong field | Low | The wrapper copies values from the returned object. A smoke case checks the mapping on a fixture. |

## Acceptance Scenarios

```gherkin
Feature: Single Council Engine
  As a user of the council
  I want one engine with one set of rules
  So that I know which behavior runs and a fix lands in one place

  Background:
    Given the workflows component is installed under ~/.claude/workflows
    And the repo has a feature branch with an open PR

  Rule: Plan mode never changes the branch

    Scenario: Plan-only council on a PR
      When the user runs /council-fix PR #42
      Then council-loop runs with fix "plan"
      And no commit, push or merge happens
      And the plan file lists blockers, non-blockers and phantoms
      And .council/council-result.json carries a verification label per finding

    Scenario: Plan mode with merge is rejected
      Given args with fix "plan" and merge true
      When council-loop parses its args
      Then the run fails before any agent starts

  Rule: Autofix runs only on an explicit user request

    Scenario: Accept a plan result
      Given a plan-mode result with two verified blockers
      When the user answers y at the gate
      Then the wrapper starts a second run with fix "auto"
      And each fix round commits semantically and pushes

    Scenario: Model-invoked council stays read-only
      Given the user says "council this plan"
      When Claude invokes adversarial-council on its own
      Then the run uses fix "plan"

  Rule: Text motions use the same engine

    Scenario: Architecture decision
      When the user runs /adversarial-council --motion "Adopt event sourcing for orders"
      Then council-loop runs with subject kind "text"
      And no git command runs
      And the wrapper writes a FORMAT B recommendation with action items

    Scenario: Text motion with autofix is rejected
      Given args with subject kind "text" and fix "auto"
      When council-loop parses its args
      Then the run fails before any agent starts

  Rule: Existing callers keep working

    Scenario: feature-loop unchanged
      When feature-loop calls council-loop without a fix arg
      Then the fix mode is "auto"
      And the legacy prompt digest matches the stored digest

    Scenario: Old supervisor command
      When the user runs /council-supervisor --motion "Merge PR #7"
      Then the wrapper prints a deprecation notice
      And the council runs through council-loop

  Rule: Liveness comes from the runtime and the engine

    Scenario: Arbiter returns nothing
      Given the arbiter agent resolves to null
      When the engine reads the verdict
      Then the run stops with resumable true
      And nothing is merged

  Rule: Competing fixes use autofix-swarm

    Scenario: Chain from a council result
      Given a council-result.json with three verified findings in two files
      When the user runs /parallel-fix --from-council .council/council-result.json
      Then autofix-swarm runs once per file group
      And no candidate that touches a test file is promoted
```

## Task Breakdown

| ID   | Task | Priority | Dependencies | Status  |
|:-----|:-----|:---------|:-------------|:--------|
| T1   | M1: `fix` arg, plan mode, citation check, new result fields, smoke cases | High | None | pending |
| T2   | M2: text mode, `priorContext`, `council.focus`, `redFirst`, smoke cases | High | T1 | pending |
| T3   | M3: `autofix-swarm` backstop on `fix: 'plan'` | Med | T1 | pending |
| T4   | M4: `adversarial-council` thin wrapper, `legacy-team.md`, `council-result.json` mapping | High | T2 | pending |
| T5   | M5: `council-fix` alias with `--auto` | High | T4 | pending |
| T6   | M6: `parallel-fix` on `autofix-swarm`, `council-supervisor` shim | Med | T4 | pending |
| T7   | M7: docs update and kilint pass | Med | T5, T6 | pending |
| T8   | M8: delete the legacy team path and the shim, one release after T6 | Low | T7 | pending |
| T9   | M9: exchange as the default debate, delete the legacy `parallel` path | Low | T8 | pending |
| T10  | Should-have: `council.seedLedger` and the manifest `requires=` key | Low | T4 | pending |

## Exit Criteria

- [ ] `node workflows/workflows.smoke.mjs` passes, and the legacy prompt digest stays the same until T9
- [ ] New smoke cases cover plan mode, text mode, both parse rejections and the result mapping
- [ ] No council skill calls `TeamCreate` on its default path
- [ ] `feature-loop.mjs` and `spec-loop.mjs` need no edit through T8
- [ ] kilint reports zero errors on the spec, the skills and the docs that change

## References

- Issue: Kiriketsuki/agenKic-hub#34
- Workflows: https://code.claude.com/docs/en/workflows.md (stall restart, resume, null results, no mid-run input)
- Agent teams: https://code.claude.com/docs/en/agent-teams.md (experimental, no resume, one team per session)
- Skills: https://code.claude.com/docs/en/skills.md (`context: fork`, `disable-model-invocation`)
- Subagents: https://code.claude.com/docs/en/sub-agents.md (Claude Code removes the `Workflow` tool from subagents)
- Best practices: https://code.claude.com/docs/en/best-practices.md (adversarial review step: flag only correctness and requirement gaps)
- Related spec: `workflows/spec-loop-spec.md`

---
*Authored by: Clault KiperO 5.5*
