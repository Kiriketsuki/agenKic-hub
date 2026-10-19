---
name: adversarial-council
description: "Use when the user wants adversarial scrutiny of a decision, plan, proposal, or architecture. Convenes a team of advocate and critic agents for free-flowing debate, moderated by an arbiter who produces a structured recommendation. A Socratic questioner probes unsubstantiated claims in parallel throughout the debate. Triggers: \"summon a council\", \"convene a council\", \"council this\", \"debate this\", \"challenge this plan\", \"adversarial review of\", \"get the council to look at\"."
---

## Run the debate with real agents

Run the debate with real agents spawned through `Agent` and a shared `team_name`. An
inline text debate has no independent reasoning, so it defeats the council.

- Step 2: call `TeamCreate` first.
- Step 3: call `Agent` for each debate role, all in one message.

If you catch yourself writing ADVOCATE, CRITIC or ARBITER sections as prose without
calling `Agent`, stop and restart with real agent spawns.

---

## Agent Communication Model

| Agent type | How spawned | Has SendMessage? | How results are returned |
|:---|:---|:---|:---|
| Debate agents (advocates, critics, questioner, arbiter) | `Agent` with `team_name` | Yes | Broadcast to team via SendMessage |
| Verifier (Step 5) | `Agent` standalone (no team) | **No** | Final text output → Agent tool return value |
| Parallel-fix agents | `Agent` with `isolation: worktree` | **No** | Final text output → Agent tool return value |

Do not SendMessage to a standalone agent. It cannot receive one, so read the Agent tool's return value instead.
Do not ask a standalone agent to SendMessage. Tell it to return results as final text output.

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
3. Do not proceed to Step 1. Council-supervisor will invoke this skill
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

#### Role prompt templates

Each role has its own prompt template. Read the file for the role, fill in the
placeholders, and pass the result as the `prompt` to `Agent`:

| Role | Template |
|:---|:---|
| Advocate (one per advocate) | `references/roles/advocate.md` |
| Critic (one per critic) | `references/roles/critic.md` |
| Questioner | `references/roles/questioner.md` |
| Arbiter | `references/roles/arbiter.md` |

The advocate and critic templates carry an `INSERT` marker. Replace it with the full
text of `references/evidence-protocol.md` (Evidence Requirement and Claim
Verification Protocol). One copy of that text serves both roles.

Spawn all roles in one message. Every template already holds the structured-header
rules, the scope discipline and the flow the agent follows.

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

Full procedure, templates and gate wording: `references/findings-gate.md`. Read it
when the arbiter reports "Council complete. Recommendation saved to: [filename]".
The order of work is:

1. Send a fire-and-forget `shutdown_request` to every agent, before you present anything.
2. Read the recommendation file.
3. For CODE motions with findings, run the codebase verification (extract `CITE:` lines,
   spawn one standalone `diagnosis` verifier on `MODEL_VERIFIER`, purge PHANTOM
   findings, tag UNVERIFIED and RUNTIME findings, append `### Verification Results`).
   The verifier has no SendMessage. Read its return value. Use rg and Read with line
   ranges to check each citation.
4. Output the full recommendation file verbatim, then render the findings table
   (CODE) or the action items table (GENERAL).
5. Present the proceed gate for the motion type and act on `y`, `N` or `modify`.
   On `y` for a CODE motion, write `council-fix-manifest.json` and invoke
   `/context-handoff`, so the fix loop (Step 7) runs in a fresh context window.

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

This step runs in a fresh context window after `/context-resume` loads a council-fix
handoff. Full procedure: `references/fix-loop.md`. The loop reads
`council-fix-manifest.json`, presents a plan for approval, then fixes each finding
red-first with a 3-attempt ceiling. It runs `/simplify`, runs the full suite, commits
only when green, and writes a fix report. It never re-convenes a council and never
force-pushes or amends.
