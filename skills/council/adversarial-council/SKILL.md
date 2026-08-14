---
name: adversarial-council
description: "Use when the user wants adversarial scrutiny of a decision, plan, proposal, or architecture. Convenes a team of advocate and critic agents for free-flowing debate, moderated by an arbiter who produces a structured recommendation. A Socratic questioner probes unsubstantiated claims in parallel throughout the debate. Triggers: \"summon a council\", \"convene a council\", \"council this\", \"debate this\", \"challenge this plan\", \"adversarial review of\", \"get the council to look at\"."
---

## HARD REQUIREMENT — REAL AGENTS ONLY

**NEVER run this council inline as text.** The debate MUST be conducted by real spawned agents via the `Agent` tool with a shared `team_name`. Steps 2 and 3 are non-negotiable:

- Step 2: Call `TeamCreate` before anything else
- Step 3: Call `Agent` (simultaneously, in one message) for each debate role

If you write ADVOCATE/CRITIC/ARBITER sections as prose in your own response without calling `Agent`, you are violating this skill. Stop and restart using real agent spawns.

---

## Agent Communication Model

| Agent type | How spawned | Has SendMessage? | How results are returned |
|:---|:---|:---|:---|
| Debate agents (advocates, critics, questioner, arbiter) | `Agent` with `team_name` | Yes | Broadcast to team via SendMessage |
| Verifier (Step 5) | `Agent` standalone (no team) | **No** | Final text output → Agent tool return value |
| Parallel-fix agents | `Agent` with `isolation: worktree` | **No** | Final text output → Agent tool return value |

**Never SendMessage to a standalone agent.** Read the Agent tool's return value instead.
**Never ask a standalone agent to SendMessage.** Tell it to return results as final text output.

If a spawned agent reports "I don't have SendMessage" — that agent's output IS its results.
Read its response text; do not retry or ask it to send again.

---

## Context

Convenes an adversarial agent team to debate a motion. N advocate agents argue
FOR, N-1 (or N, in `--skeptic` mode) critic agents argue AGAINST, one QUESTIONER
monitors the live debate and probes unsubstantiated claims as they appear (non-blocking),
and one ARBITER moderates and produces a final recommendation. The team lead
(main Claude) presents the recommendation to the user and gates action on approval.

The QUESTIONER does not block the debate. It watches the live thread and fires
"Why?" at any claim that skips over its reasoning chain. Agents respond when they
can with ANSWER -- the debate continues without waiting. This is a child asking
"but why?" at the dinner table: relentless, parallel, and ultimately clarifying.

For CODE motions, all agents independently read the relevant files before the
debate opens (silent scan phase), ensuring positions are grounded in what the
code actually says rather than what agents assume it says.

Use this skill whenever the user wants to stress-test a decision before acting on it.

## Triggers

Natural language (all invoke with defaults -- `--n 2`, `--rounds 4`, auto roles):
- "summon a council to review this"
- "convene a council on [topic]"
- "council this" / "debate this"
- "challenge this [plan/proposal/decision]"
- "adversarial review of [topic]"
- "get the council to look at [X]"

Slash command (explicit options):

```
/adversarial-council [OPTIONS]

Options:
  --motion "text"                    Proposition to debate (inline)
  --motion-file path                 Read motion from a file
  --n 2                              Number of advocates (default: 2); critics = N-1 normally
  --rounds 4                         Max exchange rounds -- hard ceiling (default: 4)
  --roles "adv1,adv2:crit1"         Named roles, colon-separated by side (advocates : critics)
  --skeptic                          Flip ratio: N-1 advocates, N critics.
                                     Recommended for PR and code review contexts.
  --model sonnet|opus|haiku          Override model for ALL debate agents (arbiter, advocates,
                                     critics). Questioner stays haiku unless --model-questioner
                                     is also set. Bypasses auto-complexity classification.
  --model-advocate sonnet|opus|haiku Override model for advocates only
  --model-critic sonnet|opus|haiku   Override model for critics only
  --model-arbiter sonnet|opus|haiku  Override model for arbiter only
  --model-questioner sonnet|opus|haiku Override model for questioner (default: haiku)
  --supervised                         Wrap with council-supervisor: heartbeat monitoring,
                                       stall detection, agent replacement, and structured
                                       council-result.json output
  --chain-fix                          After verdict, auto-invoke /parallel-fix on findings.
                                       Implies --supervised.
```

Examples:

```
/adversarial-council --motion "Migrate frontend to React" --n 3 --rounds 5
# Spawns: 3 advocates, 2 critics, 1 questioner, 1 arbiter

/adversarial-council --motion-file docs/proposals/auth-rewrite.md --n 2 --skeptic
# Spawns: 1 advocate, 2 critics, 1 questioner, 1 arbiter

/adversarial-council \
  --motion "Use glassmorphism in dark mode" \
  --n 3 --rounds 5 \
  --roles "DARKMODE-ADVOCATE,UX-ADVOCATE,PERF-ADVOCATE:CONTRAST-CRITIC,A11Y-CRITIC"

/adversarial-council --motion "Rewrite auth in Rust" --model opus
# Forces all debate agents to opus (questioner stays haiku)

/adversarial-council \
  --motion "Adopt microservices" \
  --model-advocate sonnet --model-critic opus --model-arbiter opus
# Per-role: critics and arbiter get opus, advocates get sonnet

/adversarial-council --motion-file pr-diff.md --supervised --chain-fix
# Full pipeline: council debate -> council-result.json -> parallel-fix auto-remediation
```

## Workflow

### Step 0 -- Supervisor Delegation

If `--chain-fix` is passed, it implies `--supervised`.

If `--supervised` or `--chain-fix` is set:
1. Hand off to `/council-supervisor` with all options passed through
2. Council-supervisor orchestrates the entire workflow (heartbeat monitoring,
   stall detection, structured output, and optional parallel-fix chaining)
3. Do NOT proceed to Step 1 -- council-supervisor will invoke this skill
   internally without the `--supervised` flag

If neither flag is set, proceed normally to Step 1.

### Step 1 -- Motion Intake

Determine the motion from the invocation:

**Slash command:** extract `--motion` text or read `--motion-file` contents.
If neither is provided, ask: "What is the motion to debate?"

**Natural language:** extract the motion from context -- the current file,
recently written plan, or inline text in the user's message.
If the motion is ambiguous, ask clarifying questions one at a time until
the proposition is unambiguous. Only then proceed to Step 2.

Clarification example:
```
User: "summon a council on whether we should rewrite the thing"
Claude: "What is 'the thing' -- which component or system?"
  -> User answers
Claude: "And what would the rewrite involve -- language, framework, scope?"
  -> User answers
Motion: "Rewrite the AutoConnect HUD renderer in React
         instead of the current vanilla JS implementation"
```

Parse parameters (use defaults if not specified):
- `N` = number of advocates (default: 2)
- `SKEPTIC` = false (default). If true: `ADV_COUNT` = N-1, `CRIT_COUNT` = N.
  Otherwise: `ADV_COUNT` = N, `CRIT_COUNT` = N-1.
- `ROUNDS` = max exchange rounds before arbiter forced to call it (default: 4)
- `ROLES` = named roles, split on `:` to get advocate names (`ADV_COUNT`)
  and critic names (`CRIT_COUNT`). If omitted, auto-name as `ADVOCATE-1..ADV_COUNT`
  and `CRITIC-1..CRIT_COUNT`.

Derive `motion-slug` from motion text: lowercase, spaces to hyphens,
truncate at 40 chars. Example: `react-hud-renderer-rewrite`.

#### Prior Council Lookup

After deriving `motion-slug`, check the current working directory for prior
council recommendation files:

```
glob: *-council-[motion-slug].md
```

If one or more matching files exist, read the most recent one and store it as
`PRIOR_COUNCIL`. Inject it into every agent brief under "Prior Council Context".
This allows agents to build on, challenge, or update prior findings rather than
rediscovering the same ground from scratch.

If no matching files exist: `PRIOR_COUNCIL = null`.

#### Fix Registry Lookup

After the prior council lookup, check for the fix registry:

```
file: council-fix-registry.md
```

If found, read it and collect all entries where the `Resolved By` column is `--`
(unresolved regressions introduced by prior council fixes).

Store as `REGRESSION_HISTORY` -- a list of regressions that prior fixes introduced
but no subsequent council has yet addressed. Each entry carries:
- The council file that introduced the regression
- The fix that caused it (file:line)
- The regression symptom and its location

If the registry does not exist, or no unresolved entries exist: `REGRESSION_HISTORY = null`.

#### Code Scan Prep (CODE motions only)

If the motion explicitly references specific code, files, a PR, or implementation
changes, classify it as a CODE motion and collect scan material:

- If the motion names specific file paths, store them as `SCAN_TARGETS`.
- If the motion references a PR or branch diff, run `git diff HEAD~1` (or
  `git diff main...HEAD` for a feature branch) and store as `DIFF_CONTEXT`.
- If it is ambiguous, ask: "Which files or diff should the council examine?"

Pass `SCAN_TARGETS` and/or `DIFF_CONTEXT` into all agent briefs in Step 3.
For GENERAL motions, both are empty and the scan section is omitted.

---

### Step 1.5 -- Model Selection

Model assignment uses two layers: auto-complexity classification (default) and
explicit overrides (`--model` and `--model-*` flags). Overrides always win.

#### Override resolution order

1. **Per-role flags** (`--model-advocate`, `--model-critic`, `--model-arbiter`,
   `--model-questioner`) take highest precedence for that specific role.
2. **Blanket flag** (`--model`) applies to all roles EXCEPT questioner (which
   defaults to haiku unless `--model-questioner` is also set).
3. **Auto-complexity** (below) fills in any roles not covered by flags.

In other words: `--model opus --model-questioner sonnet` gives opus to advocates,
critics, and arbiter, but sonnet to the questioner. `--model-arbiter opus` alone
only overrides the arbiter -- all other roles fall through to auto-complexity.

#### Complexity classification (when no override covers a role)

Evaluate the motion against these signals:

| Signal | Low | High |
|:---|:---|:---|
| Ambiguity | Clear proposition, well-scoped | Vague, conflicting requirements, many unknowns |
| Stakes | Reversible, local impact | Irreversible, system-wide, production, compliance |
| Scope | Single file or narrow concept | Multi-file, cross-cutting, architectural |
| Domain density | Familiar patterns, standard code | Unfamiliar codebase, novel architecture, security-critical |

Score: count how many signals are High.
- 0-1 High signals → `COMPLEXITY = low`
- 2 High signals → `COMPLEXITY = medium`
- 3-4 High signals → `COMPLEXITY = high`

#### Auto-complexity model assignment

| Role | Low | Medium | High |
|:---|:---|:---|:---|
| Advocates | sonnet | sonnet | opus |
| Critics | sonnet | sonnet | opus |
| Arbiter | sonnet | opus | opus |
| Questioner | haiku | haiku | haiku |
| Verifier (Step 5) | sonnet | sonnet | sonnet |

The arbiter upgrades to opus one tier earlier than debate agents because
synthesis and judgment benefit more from deeper reasoning than positional arguing.
The questioner stays on haiku regardless -- probing is mechanical and benefits
from speed over depth. The verifier stays on sonnet -- it does semantic comparison,
not deep reasoning.

#### Final assignment

For each role, resolve the model in override order (per-role > blanket > auto):

```
MODEL_ADVOCATE   = --model-advocate  || --model  || auto[advocate]
MODEL_CRITIC     = --model-critic    || --model  || auto[critic]
MODEL_ARBITER    = --model-arbiter   || --model  || auto[arbiter]
MODEL_QUESTIONER = --model-questioner           || auto[questioner]   # --model does NOT cascade here
MODEL_VERIFIER   = sonnet (always -- not overridable)
```

Note: `--model` intentionally does NOT cascade to the questioner. The questioner's
default (haiku) is almost always correct -- override it explicitly with
`--model-questioner` if needed.

Store the assignments as `MODEL_ADVOCATE`, `MODEL_CRITIC`, `MODEL_ARBITER`,
`MODEL_QUESTIONER`, `MODEL_VERIFIER` for use in Steps 3 and 5.

Report the classification to the user before proceeding:

```
Motion complexity: [low/medium/high] [or "overridden" if --model is set]
Models: advocates=[model], critics=[model], arbiter=[model], questioner=[model]
[If any overrides active: "Overrides: --model=X / --model-advocate=Y / ..."]
```

---

### Step 2 -- Team Setup

Create the council team:

```
TeamCreate:
  team_name: adversarial-council-{YYYY-MM-DD-HHmmss}
  description: "Adversarial council debating: [MOTION -- truncated to 60 chars]"
```

Create tasks for tracking -- one per agent:

```
TaskCreate for each advocate:
  subject: "[ROLE] -- advocate for motion"
  description: "Argue FOR: [MOTION]"

TaskCreate for each critic:
  subject: "[ROLE] -- critic against motion"
  description: "Argue AGAINST: [MOTION]"

TaskCreate for questioner:
  subject: "QUESTIONER -- Socratic probe"
  description: "Monitor debate and probe unsubstantiated claims in parallel."

TaskCreate for arbiter:
  subject: "ARBITER -- moderate and synthesize"
  description: "Monitor debate, call when ready, produce recommendation."
```

Store team name and task IDs for cleanup in Step 6.

---

### Step 3 -- Agent Spawn

Spawn all agents simultaneously via the Agent tool. All use
`subagent_type: general-purpose` and `team_name: [team from Step 2]`.
Each agent uses the model assigned in Step 1.5:
- Advocates: `model: [MODEL_ADVOCATE]`
- Critics: `model: [MODEL_CRITIC]`
- Arbiter: `model: [MODEL_ARBITER]`
- Questioner: `model: [MODEL_QUESTIONER]` (always haiku)

#### Role focus map

When `--roles` names are provided, inject the matching focus area into the
agent brief. Multiple keywords may match -- inject all matching focus areas.
If a role name is unrecognised, no specific focus is injected (agent argues broadly).

| Role name contains | Focus area injected into brief |
|:---|:---|
| `PERF` | Performance, latency, resource usage, algorithmic complexity |
| `SEC` or `SECURITY` | Security, attack surface, auth flows, data exposure |
| `UX` | User experience, discoverability, cognitive load, friction |
| `A11Y` | Accessibility, WCAG compliance, contrast ratios, screen readers |
| `SCOPE` | Project scope, complexity, delivery risk, maintenance burden |
| `DARKMODE` or `LIGHTMODE` | Theme-specific visual consistency, readability |
| `ARCH` | Architecture, coupling, extensibility, system boundaries |
| `COST` | Cost, resource consumption, infrastructure spend |

---

#### Advocate prompt template

Instantiate once per advocate. Replace all `[PLACEHOLDERS]` before dispatching.

```
subagent_type: general-purpose
model: [MODEL_ADVOCATE]
name: [ROLE]
team_name: [TEAM_NAME]
prompt: |
  You are [ROLE], a council member arguing FOR the following motion.

  ## Motion
  [FULL MOTION TEXT]

  ## Your Role
  You are an ADVOCATE. Your job is to argue FOR this motion.
  [If named role with focus area: Focus specifically on: [FOCUS AREA]]

  ## Team Roster
  [List all agent names and their designation: ADVOCATE / CRITIC / QUESTIONER / ARBITER]

  [IF PRIOR_COUNCIL IS NOT NULL:]
  ## Prior Council Context
  A prior council debated a related motion. Its findings are below.
  You may build on, challenge, or add nuance to these findings -- but do not
  simply repeat them as if they are your own analysis.
  ---
  [PRIOR_COUNCIL CONTENT]
  ---
  [END IF]

  [IF REGRESSION_HISTORY IS NOT NULL:]
  ## Regressions from Prior Fixes
  Prior council fixes introduced the following unresolved bugs. During your scan,
  check whether any current issues in scope trace back to these regressions.
  If so, name the lineage explicitly in your POSITION (e.g. "This bug was introduced
  by the fix in [council file]").
  ---
  [REGRESSION_HISTORY ENTRIES -- one per unresolved regression]
  [END IF]

  [IF SCAN_TARGETS OR DIFF_CONTEXT IS SET:]
  ## Pre-Debate Scan
  This is a CODE motion. Before you write anything, read the following.
  [If SCAN_TARGETS set: list each file path]
  [If DIFF_CONTEXT set: "The current diff follows. Read it in full before proceeding."\n\n[DIFF_CONTEXT]]

  ### Preferred Exploration Order (saves tokens -- follow this order)
  1. `gitnexus_query({query: "concept"})` -- find relevant execution flows before reading files
  2. `gitnexus_context({name: "symbolName"})` -- targeted: callers, callees, flows for one symbol
  3. Read tool -- only for specific line ranges when gitnexus is insufficient
  For vault markdown content (not source code): use `ov_search` / `ov_read`.
  Only read a full file when the motion targets the entire file and gitnexus cannot scope it.

  Read silently and independently. Do not broadcast yet.
  Your opening POSITION must be grounded in what you actually find in the code --
  not what you assume is there.
  [END IF]

  ## Discussion Rules
  Every message MUST start with exactly one of these structured headers:

    POSITION: (opening statement -- broadcast to full team)
    REBUTTAL: @[AgentName] (direct response to a specific agent's point)
    CONCESSION: (point you accept from the other side)
    OBJECTION: (new challenge about the motion raised mid-discussion)
    ANSWER: @QUESTIONER (response to a PROBE from the questioner)

  Free prose is allowed after the header line.
  Do not repeat points you have already conceded.
  Stay in character at all times.

  ## Scope Discipline
  Your arguments, OBJECTIONs, and findings must be directly about the motion.
  Do not surface unrelated code quality issues, style concerns, performance observations,
  or feature ideas you encounter during your scan. If you discover something genuinely
  dangerous -- a security vulnerability, data loss risk, or compliance blocker -- you
  may raise it as a CRITICAL DISCOVERY using this exact format:

    CRITICAL DISCOVERY: [Security / Data Loss / Compliance] -- [description] -- [citation]

  Use this header only for: SQL injection, auth bypass, exposed credentials, SSRF,
  missing rollback, unguarded cascade delete, GDPR violation, license incompatibility,
  or equivalent severity. Everything else stays out of your output.

  ## Evidence Requirement (STRICTLY ENFORCED)
  Every claim you make must be grounded. How you ground it depends on the motion:
  - **Code or file-specific motion**: cite the exact location -- `file/path.ext:LINE_NUMBER`.
    Example: "The null check is missing at src/auth/handler.py:142"
  - **Non-code motion**: name your evidence -- a data source, documented precedent,
    prior experience, or explicit reasoning chain.
  Ungrounded claims will be probed by the QUESTIONER and challenged by the ARBITER.

  ## Claim Verification Protocol (MANDATORY for CODE motions)
  Before asserting ANY code defect in a POSITION, REBUTTAL, or OBJECTION:
  1. **Read the actual source file** at the location you intend to cite, using the Read tool
  2. **Quote the exact line(s)** with line numbers in your message
  3. **Explain the defect** referencing the quoted code -- not a paraphrase or memory
  Never report defects from memory, scan summaries, or assumptions about what the code
  contains. If you cannot read the file to verify, prefix your claim with "[UNVERIFIED]"
  and state why verification was not possible.
  Fabricated findings -- citing code that does not match the actual file content -- are
  treated as automatic concessions by the ARBITER and damage your credibility for the
  remainder of the debate.

  ## Flow
  [IF CODE MOTION:]
  0. SCAN: Explore all files/diff listed in the Pre-Debate Scan section above.
     Use gitnexus_query/gitnexus_context first; fall back to Read for specific line ranges.
     Do this before formulating anything. This is silent -- do not broadcast during scan.
  [END IF]
  1. Formulate and broadcast your opening POSITION to the team.
     No pre-clearance needed. Broadcast directly.
  2. For every subsequent argument (REBUTTAL, OBJECTION): broadcast directly.
  3. If the QUESTIONER fires a PROBE: @[YourName] at one of your claims,
     respond with ANSWER: @QUESTIONER explaining your reasoning.
     The debate continues regardless -- you are not blocked waiting for clearance.
  4. CONCESSION messages -- broadcast directly. No QUESTIONER response needed.
  5. Acknowledge valid counter-points with CONCESSION where warranted.
  6. Continue exchanging until the ARBITER broadcasts "DEBATE CALLED".
  7. When the ARBITER broadcasts "FINAL SUMMARY REQUEST", send a FINAL SUMMARY
     to ARBITER only. One paragraph. Your strongest remaining points. Nothing else.

  Do NOT message the team lead directly.
  Do NOT use any header other than: POSITION, REBUTTAL, CONCESSION, OBJECTION, ANSWER, CRITICAL DISCOVERY.
  PROBE and SATISFIED are reserved for the QUESTIONER.
```

---

#### Critic prompt template

Instantiate once per critic. Replace all `[PLACEHOLDERS]` before dispatching.

```
subagent_type: general-purpose
model: [MODEL_CRITIC]
name: [ROLE]
team_name: [TEAM_NAME]
prompt: |
  You are [ROLE], a council member arguing AGAINST the following motion.

  ## Motion
  [FULL MOTION TEXT]

  ## Your Role
  You are a CRITIC. Your job is to argue AGAINST this motion.
  [If named role with focus area: Focus specifically on: [FOCUS AREA]]

  ## Team Roster
  [List all agent names and their designation: ADVOCATE / CRITIC / QUESTIONER / ARBITER]

  [IF PRIOR_COUNCIL IS NOT NULL:]
  ## Prior Council Context
  A prior council debated a related motion. Its findings are below.
  You may build on, challenge, or add nuance to these findings -- but do not
  simply repeat them as if they are your own analysis.
  ---
  [PRIOR_COUNCIL CONTENT]
  ---
  [END IF]

  [IF REGRESSION_HISTORY IS NOT NULL:]
  ## Regressions from Prior Fixes
  Prior council fixes introduced the following unresolved bugs. During your scan,
  check whether any current issues in scope trace back to these regressions.
  If so, name the lineage explicitly in your POSITION (e.g. "This bug was introduced
  by the fix in [council file]").
  ---
  [REGRESSION_HISTORY ENTRIES -- one per unresolved regression]
  [END IF]

  [IF SCAN_TARGETS OR DIFF_CONTEXT IS SET:]
  ## Pre-Debate Scan
  This is a CODE motion. Before you write anything, read the following.
  [If SCAN_TARGETS set: list each file path]
  [If DIFF_CONTEXT set: "The current diff follows. Read it in full before proceeding."\n\n[DIFF_CONTEXT]]

  ### Preferred Exploration Order (saves tokens -- follow this order)
  1. `gitnexus_query({query: "concept"})` -- find relevant execution flows before reading files
  2. `gitnexus_context({name: "symbolName"})` -- targeted: callers, callees, flows for one symbol
  3. Read tool -- only for specific line ranges when gitnexus is insufficient
  For vault markdown content (not source code): use `ov_search` / `ov_read`.
  Only read a full file when the motion targets the entire file and gitnexus cannot scope it.

  Read silently and independently. Do not broadcast yet.
  Your opening POSITION must be grounded in what you actually find in the code --
  not what you assume is there.
  [END IF]

  ## Discussion Rules
  Every message MUST start with exactly one of these structured headers:

    POSITION: (opening statement -- broadcast to full team)
    REBUTTAL: @[AgentName] (direct response to a specific agent's point)
    CONCESSION: (point you accept from the other side)
    OBJECTION: (new challenge about the motion raised mid-discussion)
    ANSWER: @QUESTIONER (response to a PROBE from the questioner)

  Free prose is allowed after the header line.
  Do not repeat points you have already conceded.
  Stay in character at all times.

  ## Scope Discipline
  Your arguments, OBJECTIONs, and findings must be directly about the motion.
  Do not surface unrelated code quality issues, style concerns, performance observations,
  or feature ideas you encounter during your scan. If you discover something genuinely
  dangerous -- a security vulnerability, data loss risk, or compliance blocker -- you
  may raise it as a CRITICAL DISCOVERY using this exact format:

    CRITICAL DISCOVERY: [Security / Data Loss / Compliance] -- [description] -- [citation]

  Use this header only for: SQL injection, auth bypass, exposed credentials, SSRF,
  missing rollback, unguarded cascade delete, GDPR violation, license incompatibility,
  or equivalent severity. Everything else stays out of your output.

  ## Evidence Requirement (STRICTLY ENFORCED)
  Every claim you make must be grounded. How you ground it depends on the motion:
  - **Code or file-specific motion**: cite the exact location -- `file/path.ext:LINE_NUMBER`.
    Example: "The null check is missing at src/auth/handler.py:142"
  - **Non-code motion**: name your evidence -- a data source, documented precedent,
    prior experience, or explicit reasoning chain.
  Ungrounded claims will be probed by the QUESTIONER and challenged by the ARBITER.

  ## Claim Verification Protocol (MANDATORY for CODE motions)
  Before asserting ANY code defect in a POSITION, REBUTTAL, or OBJECTION:
  1. **Read the actual source file** at the location you intend to cite, using the Read tool
  2. **Quote the exact line(s)** with line numbers in your message
  3. **Explain the defect** referencing the quoted code -- not a paraphrase or memory
  Never report defects from memory, scan summaries, or assumptions about what the code
  contains. If you cannot read the file to verify, prefix your claim with "[UNVERIFIED]"
  and state why verification was not possible.
  Fabricated findings -- citing code that does not match the actual file content -- are
  treated as automatic concessions by the ARBITER and damage your credibility for the
  remainder of the debate.

  ## Flow
  [IF CODE MOTION:]
  0. SCAN: Explore all files/diff listed in the Pre-Debate Scan section above.
     Use gitnexus_query/gitnexus_context first; fall back to Read for specific line ranges.
     Do this before formulating anything. This is silent -- do not broadcast during scan.
  [END IF]
  1. Wait for advocates to broadcast their opening POSITION statements.
  2. Formulate and broadcast your POSITION in response. No pre-clearance needed.
  3. For every subsequent argument (REBUTTAL, OBJECTION): broadcast directly.
  4. If the QUESTIONER fires a PROBE: @[YourName] at one of your claims,
     respond with ANSWER: @QUESTIONER explaining your reasoning.
     The debate continues regardless -- you are not blocked waiting for clearance.
  5. CONCESSION messages -- broadcast directly. No QUESTIONER response needed.
  6. Acknowledge valid points with CONCESSION where warranted.
  7. Continue exchanging until the ARBITER broadcasts "DEBATE CALLED".
  8. When the ARBITER broadcasts "FINAL SUMMARY REQUEST", send a FINAL SUMMARY
     to ARBITER only. One paragraph. Your strongest remaining objections. Nothing else.

  Do NOT message the team lead directly.
  Do NOT use any header other than: POSITION, REBUTTAL, CONCESSION, OBJECTION, ANSWER, CRITICAL DISCOVERY.
  PROBE and SATISFIED are reserved for the QUESTIONER.
```

---

#### Questioner prompt template

```
subagent_type: general-purpose
model: [MODEL_QUESTIONER]
name: QUESTIONER
team_name: [TEAM_NAME]
prompt: |
  You are the QUESTIONER in this adversarial council.
  You do not argue for or against the motion. You are a persistent Socratic voice --
  a child at the dinner table who keeps asking "but why?" until the reasoning holds.
  Your job is to keep both sides honest by probing the claims they broadcast,
  right there in the open thread where everyone can see.

  You run in parallel with the debate. You do not block it. Agents do not wait
  for you before speaking -- they broadcast freely and respond to your probes
  when they can. What matters is that unsubstantiated claims are named, visible,
  and on the record for the ARBITER to weigh.

  IMPORTANT: Broadcast probes PROMPTLY as claims appear. Do not wait for nudges
  from the arbiter or team lead. Do not batch probes across rounds. If you see
  an unsubstantiated claim, fire the PROBE immediately.

  ## Motion
  [FULL MOTION TEXT]

  ## Team Roster
  [Full list of all agent names and designations]

  ## When to Probe

  Watch the live thread. When any advocate or critic broadcasts a claim that
  asserts something without showing its work, probe it:

  - "This will be faster" -- faster than what? under what conditions?
  - "Users hate X" -- which users? what evidence?
  - "If we do X, then Y" -- why does X lead to Y?
  - "Everyone knows..." -- do they? where is this documented?
  - Circular reasoning: "We should do X because X is good"
  - Hidden assumptions stated as settled facts
  - OBJECTIONs that appear unrelated to the motion: ask "Is this about the motion?"
    If the agent cannot connect it to the motion, mark: "Out of scope. Noted for arbiter."

  ## When NOT to Probe

  - Claims that already cite a source, a `file:line`, or a named reasoning chain
  - CONCESSION messages (the agent is already accepting something -- no need)
  - ANSWER messages directed at you (those are responses, not new claims)
  - Claims that both sides appear to agree on
  - CRITICAL DISCOVERY messages -- those go directly to the arbiter

  Do not probe everything. Pick the claims the debate is actually hinging on.
  One sharp "why?" beats five scattered ones. If the argument is clear, stay silent.

  ## Probe Format

    PROBE: @[AgentName] -- [the specific claim] -- Why? [your follow-up question]

  Keep it short. "Why?" is often the entire follow-up. You are not trying to
  embarrass anyone -- you genuinely want to understand, and so does the ARBITER.

  ## After They Respond (ANSWER: @QUESTIONER)

  Evaluate their answer:
  - If the reasoning is now clear and complete:
      SATISFIED: @[AgentName] -- [brief note: what was clarified]
  - If the claim remains unsubstantiated after they have tried:
      SATISFIED: @[AgentName] -- Claim unsubstantiated. Noted for arbiter.

  Always end with SATISFIED. You do not withhold it -- the point is that the
  claim is now on the record, not that you have blocked the agent from speaking.
  The ARBITER sees everything and will weigh accordingly.

  ## Tone

  Ask simply and directly. You are not hostile. You are not a critic.
  You are the person in the room who will not let a vague claim slide by
  just because it sounds confident. Stay curious, stay brief, get out of the way
  once the reasoning is clear.

  Do NOT message the team lead directly.
  Do NOT argue for or against the motion.
  Do NOT use any header other than: PROBE, SATISFIED.
```

---

#### Arbiter prompt template

```
subagent_type: general-purpose
model: [MODEL_ARBITER]
name: ARBITER
team_name: [TEAM_NAME]
prompt: |
  You are the ARBITER of this adversarial council.
  You do not argue for or against the motion. You moderate and synthesize.

  ## Motion
  [FULL MOTION TEXT]

  ## Parameters
  - Advocates: [ADV_COUNT] | Critics: [CRIT_COUNT] | Questioner: 1
  - Max rounds: [ROUNDS]
  - Advocates: [comma-separated list]
  - Critics: [comma-separated list]

  ## Team Roster
  [Full list of all agent names and designations]

  [IF PRIOR_COUNCIL IS NOT NULL:]
  ## Prior Council Context
  A prior council debated a related motion. Its findings are below.
  In your recommendation, note where the current debate confirms, contradicts,
  or adds nuance to these prior findings.
  ---
  [PRIOR_COUNCIL CONTENT]
  ---
  [END IF]

  [IF REGRESSION_HISTORY IS NOT NULL:]
  ## Regressions from Prior Fixes
  The following bugs were introduced by fixes applied in prior councils and
  remain unresolved. After the debate, check whether any current findings
  resolve one of these regressions -- if so, record it in the Regression
  Lineage section and mark the entry as resolved in council-fix-registry.md.
  ---
  [REGRESSION_HISTORY ENTRIES -- one per unresolved regression]
  [END IF]

  ## Motion Classification
  Before the debate begins, classify the motion as one of:
  - **CODE**: the motion explicitly involves specific code, files, PRs, libraries,
    or technical implementation choices (e.g. "migrate frontend to React",
    "fix the auth handler", "adopt library X for this codebase").
  - **GENERAL**: the motion is a strategy, business, personnel, architecture
    philosophy, or conceptual decision with no direct code target
    (e.g. "hire contractor Y", "adopt a microservices approach in principle",
    "invest in building vs buying").

  Your recommendation format and the Step 5 proceed gate both depend on this
  classification. CODE motions use the full fix-oriented template; GENERAL motions
  use the simplified template. Use your best judgment -- when in doubt, prefer GENERAL.

  ## Your Job
  1. Monitor the discussion thread as messages arrive.
  2. When an argument is vague or unsubstantiated, ask a clarifying question:
       CLARIFY: @[AgentName] -- [your question]
     For CODE motions: if any agent makes a claim about a bug, defect, or code-level
     problem WITHOUT citing a file and line number (format: `path/to/file.ext:LINE`),
     challenge it immediately:
       CLARIFY: @[AgentName] -- Cite the exact file and line number for that claim.
     For GENERAL motions: if any agent makes an ungrounded factual assertion without
     naming a source or reasoning chain, challenge it:
       CLARIFY: @[AgentName] -- What is your evidence for that claim?
     The QUESTIONER is probing in parallel throughout -- track any claims it marks
     as "unsubstantiated" (SATISFIED: ... -- Claim unsubstantiated). These are
     weaker pillars: the agent tried to defend the claim under direct questioning
     and could not. Weight them accordingly in your synthesis.
  3. Call the debate when EITHER is true:
       a. Discussion has converged (both sides repeating points, concessions
          made, no new ground being covered), OR
       b. [ROUNDS] exchange rounds have elapsed (mandatory hard ceiling).
  4. On calling it:
       a. Broadcast: DEBATE CALLED: [brief reason -- converged / ceiling hit]
       b. Immediately broadcast: FINAL SUMMARY REQUEST
          (all advocates and critics send their closing paragraph to you directly)
          The QUESTIONER has been probing inline throughout -- no separate
          probing phase is needed after calling the debate.
       c. Wait for all [ADV_COUNT + CRIT_COUNT] final summaries.
       d. Write the recommendation file to the current working directory.
       e. SendMessage to the team lead: "Council complete. Recommendation saved to: [filename]"

  ## Honest Findings Protocol
  Your recommendation must reflect what the debate actually revealed -- no more,
  no less. Do NOT manufacture findings, suggestions, or action items to appear
  thorough. An honest "no issues found" is a valuable outcome. A padded list of
  invented concerns is noise that erodes trust in the council.

  When compiling findings:
  - Only include issues that were explicitly raised AND substantiated in the debate
    (or surfaced as unsubstantiated by the QUESTIONER)
  - If an issue was raised but not substantiated (QUESTIONER marked it so, or
    a citation was never provided), note it as "raised but unsubstantiated"
  - If no code-level issues were identified, the Suggested Fixes section is omitted

  When a genuine code issue IS found:
  1. **Fix it in this PR**: Every verified finding -- bug, improvement, or hardening --
     gets fixed in the current PR. There is no "follow-on" or "non-blocking" tier.
     If the council found it and verified it, it belongs in the current changeset.
     The only exception is Critical Discoveries (see below).
  2. **PR description update**: If the fixes expand the PR scope, note what to add/amend.
  3. **Critical Discovery -- informational only, not a fix target**: If an agent raised a
     CRITICAL DISCOVERY during the debate, note it in the recommendation. Category tag must
     be Security, Data Loss, or Compliance -- anything else is dropped. Critical Discoveries
     are never added to Suggested Fixes. They are presented to the user as informational.

  ## Scope Audit
  Before compiling Suggested Fixes, apply this audit to every finding:
  1. **Relevance test**: Is this finding directly about the motion? If it is about a
     different feature, file, or concern noticed during the scan, it fails.
  2. **Pre-existence test**: Would this concern exist even without this motion? If yes,
     it was a pre-existing issue unrelated to the motion, and it fails.
  Findings that fail either test are dropped from the recommendation.
  Exception: a finding with a valid CRITICAL DISCOVERY tag (Security / Data Loss / Compliance)
  survives the audit and is noted in the Critical Discoveries section.
  QUESTIONER "Out of scope" marks auto-fail the relevance test.

  ## Citation Format (CODE motions)
  Every finding in Suggested Fixes for CODE motions MUST include one or more `CITE:`
  lines immediately after the fix description line:

  For file-verifiable claims (a specific location in a file):
  ```
  CITE: `path/to/file.ext` L:LINE_NUMBER
  ```

  For runtime, environment, or external claims that cannot be verified in a file:
  ```
  CITE: RUNTIME -- [brief description of what cannot be statically verified]
  ```

  Example:
  ```
  - Null check missing in token validator -- `src/auth/handler.py:142` -- can cause NullPointerException
    CITE: `src/auth/handler.py` L:142
  ```

  These `CITE:` lines allow the codebase verifier (Step 5.2.5) to ground-truth check
  every finding after the debate. Omitting them tags the finding as "verification skipped".
  For GENERAL motions, citation format is not required.

  ## Recommendation File
  Filename: [YYYY-MM-DD-HHmmss]-council-[MOTION-SLUG].md
  Location: current working directory

  Use the format matching the motion classification you determined above.

  ### FORMAT A -- CODE motion

  ---
  ## Adversarial Council -- [MOTION TITLE]

  > Convened: [timestamp] | Advocates: [ADV_COUNT] | Critics: [CRIT_COUNT] | Rounds: [X]/[ROUNDS] | Motion type: CODE

  ### Motion
  [Full motion text]

  ### Advocate Positions
  **[ROLE]**: [strongest points distilled from full thread]

  ### Critic Positions
  **[ROLE]**: [strongest objections distilled from full thread]

  ### Questioner Findings
  [Claims that were probed and clarified, and any marked unsubstantiated.
   If nothing was flagged, write: "All claims substantiated -- no probing needed."]

  ### Key Conflicts
  - [Contention] -- Advocate said X, Critic said Y -- [resolved / unresolved]

  ### Concessions
  - [AGENT] conceded [X] to [AGENT]

  ### Regression Lineage
  [Only present if any current findings trace back to a prior council fix, or if any
   prior regressions in REGRESSION_HISTORY were resolved by this council's findings.
   If neither applies, write: "No regression lineage -- no prior fix involvement."]

  #### Regressions Introduced by This Council's Fixes
  [Populated by the autofix pipeline after fixes are applied -- leave as "--" at debate time.
   The pipeline will back-fill this after Phase 3 test results are known.]
  - Fix: [fix description] -- [file:line] -- Introduced regression: [symptom] at [file:line] -- Registry: LOGGED

  #### Prior Regressions Resolved by This Council
  [Only if REGRESSION_HISTORY was provided and current findings close a prior regression entry.
   If none, omit this sub-section.]
  - [regression symptom from registry] -- introduced by [council file] -- RESOLVED by [current finding]

  ### Arbiter Recommendation
  **[FOR / AGAINST / CONDITIONAL]**
  [2-3 sentences citing specific debate points that drove the recommendation]

  ### Conditions (if CONDITIONAL)
  - [Condition]

  ### Suggested Fixes
  [Only present if genuine issues were raised and substantiated in the debate.
   If none, write: "No issues identified." and omit all sub-sections below.]

  All verified findings are fixed in the current PR -- no "follow-on" tier exists.

  #### Fixes (all in-PR)
  - [Fix description] -- [file/path.ext:LINE] -- [severity: Bug/Improvement] -- [rationale]

  #### PR Description Amendments (update scope/intent)
  - [What to add/change in the PR description]

  #### Critical Discoveries (informational -- not fix targets)
  [Only present if a Critical Discovery passed the scope audit. If none, omit this section.]
  - [Security / Data Loss / Compliance]: [description] -- [citation]
  ---

  ### FORMAT B -- GENERAL motion

  ---
  ## Adversarial Council -- [MOTION TITLE]

  > Convened: [timestamp] | Advocates: [ADV_COUNT] | Critics: [CRIT_COUNT] | Rounds: [X]/[ROUNDS] | Motion type: GENERAL

  ### Motion
  [Full motion text]

  ### Advocate Positions
  **[ROLE]**: [strongest points distilled from full thread]

  ### Critic Positions
  **[ROLE]**: [strongest objections distilled from full thread]

  ### Questioner Findings
  [Claims that were probed and clarified, and any marked unsubstantiated.
   If nothing was flagged, write: "All claims substantiated -- no probing needed."]

  ### Key Conflicts
  - [Contention] -- Advocate said X, Critic said Y -- [resolved / unresolved]

  ### Concessions
  - [AGENT] conceded [X] to [AGENT]

  ### Arbiter Recommendation
  **[FOR / AGAINST / CONDITIONAL]**
  [2-3 sentences citing specific debate points that drove the recommendation]

  ### Conditions (if CONDITIONAL)
  - [Condition]

  ### Action Items
  [Only if the debate produced specific follow-on steps directly entailed by the motion's
   outcome. Each action item must pass the scope audit: relevant to the motion and not a
   pre-existing concern. If none, write: "No action items identified."]
  - [Action item] -- [owner if discussed] -- [why this matters]

  ### Critical Discoveries (informational -- not fix targets)
  [Only present if a Critical Discovery passed the scope audit. If none, omit this section.]
  - [Security / Data Loss / Compliance]: [description] -- [citation]
  ---

  Do NOT message the team lead until the recommendation file is written and saved.
  Do NOT argue for or against the motion at any point.
```

---

### Step 4 -- Discussion Monitoring

The team lead (main Claude) monitors incoming messages from team members
while the debate is in progress.

#### Loose message handling

If any agent sends a message that does not start with a required header
(`POSITION:`, `REBUTTAL:`, `CONCESSION:`, `OBJECTION:`, `CLARIFY:`,
`ANSWER:`, `PROBE:`, `SATISFIED:`, `CRITICAL DISCOVERY:`,
`DEBATE CALLED:`, `FINAL SUMMARY REQUEST:`, or `FINAL SUMMARY:`):

Ask the user to clarify what that agent was trying to say:

```
[AGENT-NAME] sent an unstructured message:
"[message text]"

Can you clarify what point they were trying to make so I can
feed it back into the discussion?
```

Once the user clarifies, relay the structured version back to the
relevant agents via SendMessage.

#### Round counting

One round = one complete cycle where all advocates AND all critics have
sent at least one message since the last round boundary.

The arbiter manages its own round count and calls the debate when `ROUNDS`
is reached. The team lead does not force-call the debate -- only the arbiter does.

#### Waiting for the arbiter

The team lead waits for the arbiter's "Council complete" message before
proceeding to Step 5. Messages from advocates, critics, and the questioner
during the debate are informational -- the team lead does not need to respond to them.

---

### Step 5 -- Findings Presentation & Proceed Gate

When the arbiter reports "Council complete. Recommendation saved to: [filename]":

1. **Immediately shut down the team** before presenting findings to the user:
   ```
   SendMessage type: shutdown_request
   recipient: [each agent name -- advocates, critics, questioner, arbiter]
   content: "Council concluded. Thank you."
   ```
   Do NOT wait for shutdown acknowledgements at this point -- fire-and-forget.
   Proceed immediately to step 2.

2. Read the recommendation file.

2.5. **[CODE motions only] Codebase Verification**: Skip this step entirely for
   GENERAL motions and if the recommendation file contains "No issues identified."
   in the Suggested Fixes section.

   **5.2.5.1 -- Extract Citations**: Parse the recommendation file for `CITE:` lines.
   Collect all citations into a list paired with their parent finding.

   Fallback regex (for non-compliant recommendations): scan the Suggested Fixes
   sections for patterns:
   - Backtick path + `line`/`L:` + number: `` `path/file.ext` L:LINE `` or `` `path/file.ext`:LINE ``
   - Colon format: `path/file.ext:LINE` (bare, no backticks)

   If no parseable citations are found after all fallback attempts, tag all findings
   "verification skipped" and proceed directly to step 3.

   **5.2.5.2 -- Spawn Verifier Agent**: Spawn a single standalone verifier agent
   (NOT a team member -- the team is already shut down). Use `subagent_type: diagnosis`
   and `model: [MODEL_VERIFIER]` (from Step 1.5 -- always sonnet). The `diagnosis` agent
   type is read-only and optimized for code investigation, which is exactly what
   verification requires.

   **Communication model**: The verifier is a standalone Agent, NOT a team member.
   It does NOT have SendMessage. Do NOT use SendMessage to talk to it or ask it
   to SendMessage back. The verifier returns its results as the Agent tool's return
   value -- read the tool result directly.

   Provide the verifier with each finding and its citations. The verifier prompt MUST
   include this output instruction:

   ```
   ## Output
   You are a standalone agent. You do NOT have SendMessage -- do not attempt to use it.
   Return your results as your final text output. The caller reads your response directly.
   ```

   For each citation the verifier checks:
   1. If the citation names a symbol: prefer `gitnexus_context({name: symbolName})` to
      confirm the symbol exists and verify the claim (more token-efficient than file reads).
      Fall back to Read if gitnexus is unavailable or the citation is line-specific only.
   2. Attempt to read the cited file (Read tool) when needed:
      - File does not exist → verdict: `PHANTOM`
   3. If file exists, read an 11-line window centered on the cited line
      (lines LINE-5 to LINE+5, clamped to file bounds).
      - Line number is out of file range → verdict: `PHANTOM`
      - Code at the cited location matches the claim → verdict: `VERIFIED`
      - Code exists but does not match the claim → verdict: `UNVERIFIED`
   4. `CITE: RUNTIME` lines → verdict: `RUNTIME` (not file-verifiable, retain as-is)

   Verifier returns a structured verdict list as its final text output:
   ```
   Finding 1: [description]
     CITE: `src/auth/handler.py` L:142 → VERIFIED
   Finding 2: [description]
     CITE: `src/utils/empty.py` L:5 → PHANTOM
   Finding 3: [description]
     CITE: RUNTIME -- env var check → RUNTIME
   ```

   **5.2.5.3 -- Process Verdicts**:

   | Verdict | Action |
   |:---|:---|
   | All CITE lines VERIFIED | Keep finding as-is |
   | Any CITE line PHANTOM | **Purge finding** -- remove from recommendation entirely |
   | Any CITE line UNVERIFIED (file exists, claim mismatches) | **Tag finding** -- append "[UNVERIFIED -- manual review recommended]", retain |
   | CITE: RUNTIME | **Tag finding** -- append "[NOT FILE-VERIFIABLE -- runtime/external]", retain |
   | Mixed VERIFIED + UNVERIFIED | Tag with UNVERIFIED note, do not purge |

   Only PHANTOM triggers purging (deterministic: cited file/line does not exist).
   UNVERIFIED findings (file exists but claim doesn't match) are retained for human review.

   **5.2.5.4 -- Amend Recommendation File**: Rewrite the recommendation file in place.
   - Remove purged findings from all Suggested Fixes sub-sections
   - Append tag notes to UNVERIFIED and RUNTIME findings inline
   - Append a new `### Verification Results` section at the end of the file:

   ```
   ### Verification Results
   | # | Finding | Citations | Verdict | Action |
   |---|---------|-----------|---------|--------|
   | 1 | [finding desc] | `file:line` | VERIFIED | Retained |
   | 2 | [finding desc] | `file:line` | PHANTOM | Purged |
   | 3 | [finding desc] | RUNTIME | RUNTIME | Tagged, retained |

   Verification: [X] verified, [Y] phantom (purged), [Z] unverified (retained for review)
   ```

   **5.2.5.5 -- Short-Circuit Conditions**:
   - All findings VERIFIED → append minimal note: "All findings verified against codebase."
   - All findings PHANTOM → replace Suggested Fixes content with:
     "All findings purged by verification -- no cited files/lines exist in codebase."

3. Present the **full findings** immediately. Output the entire recommendation
   file content verbatim (post-verification, amended version).

4. Always render a findings table. Only include findings that appear in the
   recommendation file -- do NOT add items here.

   **CODE motion** -- findings table:
   ```
   | # | Severity | File | Line | Finding | Suggested Fix | Status |
   |---|----------|------|------|---------|---------------|--------|
   | 1 | Bug      | src/auth/handler.py | 142 | Null check missing | Add `if user is None: return 401` | Verified |
   ```
   Severity values: `Bug`, `Security`, `Improvement`, `Style`.
   Status values: `Verified`, `Unverified`, `Runtime`, `Skipped` (verification skipped -- no citations found).
   ALL findings appear in one flat list -- there is no "follow-on" or "non-blocking" column.
   Purged findings are omitted from this table entirely (documented in Verification Results section only).
   If there are no code-level findings, render one row: `| -- | -- | -- | -- | No findings identified. | -- | -- |`

   **GENERAL motion** -- action items table:
   ```
   | # | Action Item | Owner | Why It Matters |
   |---|-------------|-------|----------------|
   | 1 | [action]    | [owner or --] | [reason] |
   ```
   If there are no action items, render one row: `| -- | No action items identified. | -- | -- |`

5. Present the proceed gate appropriate to the motion type:

**CODE motion gate:**

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning from the recommendation file]

Fixes ([N] -- all applied in this PR):
  1. [Fix 1]
  ...

PR Description Amendments ([N]):
  - [Amendment 1]
  ...

[If Critical Discoveries exist:]
Critical Discoveries ([N] -- informational, not blocking):
  - [Category]: [description]
  ...

Verification: [X] verified, [Y] phantom (purged), [Z] unverified (retained for review)
[If Y > 0: Note: [Y] finding(s) cited files/lines that do not exist in the codebase and were purged.]
Full debate saved to: [filename]

Proceed? [y/N/modify]
```

If there are no fixes or amendments, the CODE gate simplifies to:

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning]

No fixes identified.
Verification: [X] verified, [Y] phantom (purged), [Z] unverified (retained for review)
Full debate saved to: [filename]

Proceed? [y/N/modify]
```

Responses (CODE):
- `y` -- write a **council-fix handoff** and invoke `/context-handoff` so the
  fix loop runs in a fresh context window. This prevents the council debate
  (which consumes significant context) from crowding out the implementation work.

  **Council-fix handoff procedure:**

  1. Write `council-fix-manifest.json` to the same directory as the recommendation file:
     ```json
     {
       "recommendation_file": "[absolute path to recommendation .md]",
       "motion": "[full motion text]",
       "arbiter_verdict": "FOR | AGAINST | CONDITIONAL",
       "branch": "[current git branch]",
       "fixes": [
         {
           "id": 1,
           "description": "[fix description]",
           "file": "[file path]",
           "line": [line number],
           "severity": "Bug | Improvement",
           "citations": ["file L:line", ...]
         }
       ],
       "pr_amendments": ["[amendment text]", ...],
       "test_command": "[detected test runner command, e.g. pytest, npm test, cargo test]",
       "created": "[ISO 8601 timestamp]"
     }
     ```

  2. Auto-detect the test command by checking for:
     - `pytest.ini` / `pyproject.toml` [tool.pytest] / `setup.cfg` [tool:pytest] → `pytest`
     - `package.json` scripts.test → `npm test`
     - `Cargo.toml` → `cargo test`
     - `Makefile` with `test` target → `make test`
     - If none found, set to `null` and flag in handoff for user input

  3. Invoke `/context-handoff` with the council-fix manifest path as the primary
     next step. The handoff's "Next Steps" section should read:
     ```
     1. Read council-fix-manifest.json at [path]
     2. Read the recommendation file for full context
     3. Enter the Bounded Fix Loop (adversarial-council skill Step 7)
     ```

  4. Report to user:
     ```
     Council complete. Fix manifest written to: [path]
     Handoff prepared. Start a new session and run `/context-resume` to begin the fix loop.
     ```

  Critical Discoveries (if any) are informational -- they are not part of the fix manifest.
- `N` -- note the result, take no further action. Inform the user:
  "Council result noted. No action taken."
- `modify` -- ask the user how they want to amend the motion.
  Once clarified, call TeamDelete on the current team, then return to Step 1
  with the updated motion and same N and roles. A fresh team will be created.

---

**GENERAL motion gate:**

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning from the recommendation file]

[If action items exist:]
Action Items ([N]):
  - [Action item]
  ...

[If Critical Discoveries exist:]
Critical Discoveries ([N] -- informational, not blocking):
  - [Category]: [description]
  ...

Full debate saved to: [filename]

Proceed? [y/N/modify]
```

Responses (GENERAL):
- `y` -- note the result. Inform the user: "Council result noted."
  If action items were listed, ask: "Would you like to work through any of
  these action items now?"
- `N` -- note the result, take no further action. Inform the user:
  "Council result noted. No action taken."
- `modify` -- ask the user how they want to amend the motion.
  Once clarified, call TeamDelete on the current team, then return to Step 1
  with the updated motion and same N and roles. A fresh team will be created.

---

### Step 6 -- Cleanup

After the proceed gate resolves (whether `y`, `N`, or after a `modify`
reconvene completes):

1. Agents were already sent shutdown requests in Step 5 (fire-and-forget).
   No need to re-send -- skip straight to TeamDelete.
2. Call TeamDelete to remove the team and task list.

Inform the user: "Team disbanded." if TeamDelete succeeds.

---

### Step 7 -- Bounded Fix Loop (resumed session)

This step runs in a **fresh context window** after the user runs `/context-resume`
following a council-fix handoff. The handoff points to a `council-fix-manifest.json`
file that contains all fix details.

#### 7.1 -- Load Manifest

1. Read the `council-fix-manifest.json` file referenced in the handoff.
2. Read the recommendation file for full context on each finding.
3. Confirm the branch matches: `git branch --show-current` must match `manifest.branch`.
   If not, ask the user before switching.
4. If `manifest.test_command` is `null`, ask the user: "What command runs your tests?"

#### 7.2 -- Plan Presentation

Enter plan mode. Present a fix plan covering ALL fixes from the manifest:

```
# Council Fix Loop -- [motion summary]

## Fixes ([N] total)
1. [Fix 1 description] -- [file:line] -- [severity]
2. [Fix 2 description] -- [file:line] -- [severity]
...

## Approach
For each fix:
  a. Generate a regression test that FAILS on current code (proves the bug)
  b. Apply the fix
  c. Confirm the test PASSES (proves the fix)
  d. Max 3 attempts per fix -- escalate to human if still red

## Parallelization
[Which fixes touch independent files and can be done in parallel]

## Test Command
[manifest.test_command]
```

Wait for user approval before proceeding.

#### 7.3 -- Fix Iteration

Process each fix sequentially (or parallel where files are independent):

```
FOR each fix in manifest.fixes:

  ATTEMPT = 0
  MAX_ATTEMPTS = 3

  -- Phase A: Red (prove the bug exists)
  1. Read the cited file at the cited line (verify citation is still valid)
     - If file/line no longer matches: SKIP fix, report "citation stale"
  2. Write a targeted regression test that asserts the CORRECT behavior
     (which should FAIL against current buggy code)
  3. Run: [test_command] -k [test_name] (or equivalent targeted run)
  4. If test PASSES (unexpected green):
     - The bug may already be fixed, or the test is wrong
     - Report: "Test passed on current code -- fix may be unnecessary or test is incorrect"
     - SKIP this fix, move to next

  -- Phase B: Green (apply fix, confirm it works)
  5. Apply the code fix
  6. Run: [test_command] -k [test_name]
  7. If test PASSES: mark fix as DONE, move to next fix
  8. If test FAILS:
     ATTEMPT += 1
     If ATTEMPT < MAX_ATTEMPTS:
       - Read the test output, diagnose, adjust the fix
       - Go to step 5
     If ATTEMPT >= MAX_ATTEMPTS:
       - Revert the fix: git checkout -- [file]
       - Mark fix as ESCALATED
       - Report: "Fix [N] failed after 3 attempts -- needs human review"
       - Continue to next fix
```

#### 7.4 -- Simplify Pass

After all fixes are processed and before running the full suite:

1. Run `/simplify` on all files changed by the fix loop
   (`git diff --name-only` against the pre-fix-loop HEAD).
2. If `/simplify` produces changes, stage them as part of the fix commit.
3. If `/simplify` finds no issues, proceed directly to 7.5.

This catches duplicate logic, dead code, and overly defensive patterns
introduced by mechanical fix application.

#### 7.5 -- Full Suite Verification & Auto-Commit

After all fixes are processed and simplified:

1. Run the full test suite: `[test_command]`
2. If all green:
   - Commit all changes: `fix: apply council fixes for [motion-slug]`
   - Push to remote: `git push`
   - Report: "All tests green. Committed and pushed."
3. If any failures:
   - Report which tests failed and whether they are related to the fixes
   - Do NOT re-council. Escalate to user:
     ```
     Full suite: [X] passed, [Y] failed
     Failures related to fixes: [list or "none"]
     Pre-existing failures: [list or "none"]

     How would you like to proceed?
     ```
   - Do NOT auto-commit on failure. Wait for user direction.

#### 7.6 -- Fix Report

After the loop completes (whether all green or partially escalated), write a
fix report to the same directory as the manifest:

```markdown
# Council Fix Report -- [motion summary]

> Recommendation: [path to recommendation file]
> Branch: [branch]
> Date: [ISO 8601]

## Results

| # | Fix | File:Line | Test | Attempts | Status |
|---|-----|-----------|------|----------|--------|
| 1 | [desc] | [file:line] | [test name] | [1-3] | DONE / ESCALATED / SKIPPED |

## Summary
- Fixed: [N] / [total]
- Escalated: [N] (need human review)
- Skipped: [N] (stale citation or already fixed)

## Full Suite
- Result: [PASS / FAIL]
- [If FAIL: list failing tests]

## Escalated Fixes (human review needed)
[For each ESCALATED fix:]
- Fix [N]: [description]
  - Last error: [test output excerpt]
  - Attempts: [what was tried]
```

#### 7.7 -- Constraints

- **3-attempt ceiling per fix** -- prevents runaway token burn on edge cases
- **No re-council** -- if fixes fail, escalate to human. A full council is too expensive
  for verification when targeted tests already prove correctness
- **Red-first mandatory** -- if the regression test passes before the fix is applied,
  the test is suspect. Skip, don't proceed with a potentially wrong test
- **Revert on failure** -- if a fix can't be made green in 3 attempts, revert to avoid
  leaving the codebase in a broken state
- **Never force-push or amend** -- all fixes are new commits
