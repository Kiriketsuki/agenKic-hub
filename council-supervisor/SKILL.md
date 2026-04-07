---
name: council-supervisor
description: >
  Wraps the full adversarial-council debate with a supervisor layer: uses TeamCreate
  to spawn all debate agents directly, runs multiple rounds of argument, monitors
  agent heartbeats, detects stalls, checkpoints state, replaces unresponsive agents,
  and produces structured council-result.json. Chains into parallel-fix for
  auto-remediation. Triggers: "supervised council", "council with supervisor",
  "/council-supervisor". Automatically invoked when /adversarial-council is run
  with --supervised or --chain-fix.
---

## Context

This skill runs the full adversarial-council debate itself — it does NOT delegate to
`/adversarial-council` as a subprocess. It spawns all agents directly via TeamCreate,
manages the multi-round exchange, and adds a supervisor layer for liveness monitoring,
stall recovery, and structured output.

The council-supervisor IS the council. The adversarial-council skill hands off here
when `--supervised` or `--chain-fix` is set, and this skill takes it from Step 1.

## Options

All adversarial-council options are accepted, plus:

```
--motion "text"                    Proposition to debate (inline)
--motion-file path                 Read motion from a file
--n 2                              Number of advocates (default: 2); critics = N-1 normally
--rounds 4                         Max exchange rounds -- hard ceiling (default: 4)
--roles "adv1,adv2:crit1"         Named roles, colon-separated by side
--skeptic                          Flip ratio: N-1 advocates, N critics
--model sonnet|opus|haiku          Override model for all debate agents
--model-advocate / --model-critic / --model-arbiter / --model-questioner
--heartbeat-interval 30            Seconds between heartbeat checks (default: 30)
--max-nudges 2                     Max nudges before replacing a stalled agent (default: 2)
--max-agents 7                     Hard cap on concurrent agents (default: 7)
--output path                      Path for council-result.json (default: .council/council-result.json)
--chain-fix                        Auto-invoke /parallel-fix on the result after debate
```

---

## Workflow

### Step 1 -- Motion Intake

Same as adversarial-council Step 1 in full:

1. Extract `--motion` text, read `--motion-file`, or ask "What is the motion to debate?"
2. Parse N, SKEPTIC, ROUNDS, ROLES. Derive ADV_COUNT and CRIT_COUNT.
   - Default: ADV_COUNT = N, CRIT_COUNT = N-1
   - If `--skeptic`: ADV_COUNT = N-1, CRIT_COUNT = N
3. Derive `motion-slug` (lowercase, spaces to hyphens, truncate at 40 chars).
4. **Prior Council Lookup**: glob `*-council-[motion-slug].md`. If found, store as `PRIOR_COUNCIL`.
5. **Fix Registry Lookup**: read `council-fix-registry.md` if it exists. Collect unresolved
   regressions as `REGRESSION_HISTORY`.
6. **Code Scan Prep** (CODE motions only): collect `SCAN_TARGETS` and/or `DIFF_CONTEXT`.

### Step 1.5 -- Model Selection

Same as adversarial-council Step 1.5 in full:

Override resolution: per-role flag > blanket `--model` > auto-complexity.

Auto-complexity table:

| Role       | Low    | Medium | High  |
|:-----------|:-------|:-------|:------|
| Advocates  | sonnet | sonnet | opus  |
| Critics    | sonnet | sonnet | opus  |
| Arbiter    | sonnet | opus   | opus  |
| Questioner | haiku  | haiku  | haiku |
| Verifier   | sonnet | sonnet | sonnet|

`--model` does NOT cascade to questioner. Report assignments to user before proceeding.

---

### Step 2 -- Pre-flight and Team Setup

1. **Agent capacity check**: Count active agents. If adding the council team would
   exceed `--max-agents`, fall back to consolidated single-agent review (see bottom).
   Report: "Agent capacity: [N] active. Council needs [M]. [Proceeding / Falling back]."

2. **Create output directory**: `mkdir -p .council/`

3. **Initialize checkpoint file** at `.council/checkpoint.json`:
   ```json
   {
     "motion": "[motion text]",
     "status": "initializing",
     "agents": {},
     "rounds_completed": 0,
     "max_rounds": N,
     "positions": [],
     "concessions": [],
     "started_at": "ISO timestamp"
   }
   ```

4. **TeamCreate**:
   ```
   TeamCreate:
     team_name: council-supervised-{YYYY-MM-DD-HHmmss}
     description: "Supervised council debating: [MOTION -- truncated to 60 chars]"
   ```
   Store team name for cleanup.

5. **TaskCreate** -- one per agent for tracking:
   - Each advocate: `[ROLE] -- advocate for motion`
   - Each critic: `[ROLE] -- critic against motion`
   - Questioner: `QUESTIONER -- Socratic probe`
   - Arbiter: `ARBITER -- moderate and synthesize`

6. Register all agents in checkpoint:
   ```json
   "agents": {
     "ADVOCATE-1": { "status": "active", "last_seen": "ISO", "nudge_count": 0 },
     "CRITIC-1":   { "status": "active", "last_seen": "ISO", "nudge_count": 0 },
     "QUESTIONER": { "status": "active", "last_seen": "ISO", "nudge_count": 0 },
     "ARBITER":    { "status": "active", "last_seen": "ISO", "nudge_count": 0 }
   }
   ```

---

### Step 3 -- Agent Spawn

Spawn all agents simultaneously via the Agent tool. All use
`subagent_type: general-purpose` and `team_name: [team from Step 2]`.

Use the same prompt templates as adversarial-council (advocate, critic, questioner,
arbiter). The prompts are identical -- the supervisor layer is external to the agents.

Key prompt fields per role:
- Motion, role designation, team roster
- PRIOR_COUNCIL block (if not null)
- REGRESSION_HISTORY block (if not null)
- Pre-Debate Scan section (CODE motions only: SCAN_TARGETS / DIFF_CONTEXT)
- Discussion Rules: POSITION, REBUTTAL, CONCESSION, OBJECTION, ANSWER headers
- Scope Discipline: only motion-relevant findings; CRITICAL DISCOVERY exception
- Evidence Requirement: cite file:line for code, named source for general
- Flow: scan → POSITION → rebuttals → respond to PROBE → CONCESSION → await DEBATE CALLED

Use the role focus map from adversarial-council when `--roles` names are provided:
PERF, SEC, UX, A11Y, SCOPE, ARCH, COST, DARKMODE, LIGHTMODE.

---

### Step 4 -- Multi-Round Debate with Heartbeat Monitoring

The supervisor drives the rounds. After spawning agents, monitor the team actively.

#### Round structure

Each round consists of:
1. All advocates and critics broadcast (POSITION in round 1; REBUTTAL/OBJECTION in later rounds)
2. QUESTIONER fires PROBEs at unsubstantiated claims; agents respond ANSWER when able
3. ARBITER monitors and may call DEBATE CALLED when it judges the exchange exhausted

The ARBITER enforces the round ceiling. After ROUNDS exchanges, send:
```
SendMessage to ARBITER:
  "SUPERVISOR: Round [N] of [MAX] is complete. If the debate is not already
   concluded, call DEBATE CALLED now and proceed to FINAL SUMMARY REQUEST."
```

#### Heartbeat monitoring

After each round of messages, for each agent:

1. **Check activity**: Has the agent sent a message since the last check?
   Update `last_seen` in checkpoint.

2. **Detect stalls** (no message for heartbeat-interval * 2):
   - **Nudge 1**: SendMessage to agent:
     `"SUPERVISOR: @[AgentName] -- your input is needed. Please broadcast your response."`
   - **Nudge 2**: SendMessage to agent:
     `"SUPERVISOR: @[AgentName] -- final notice. Respond this round or you will be replaced."`
   - **Replace** (after max-nudges exhausted):
     a. Checkpoint current debate state (all messages so far)
     b. SendMessage to team: `"SUPERVISOR: @[AgentName] replaced due to inactivity."`
     c. Spawn replacement agent with the same role prompt PLUS a context block:
        ```
        ## Debate Context (you are replacing a previous agent)
        Round [N] of [MAX]. Transcript so far:
        [All team messages in order]
        Your predecessor was [ROLE]. Continue immediately.
        ```
     d. Update checkpoint: old agent -> "replaced", new agent -> "active"

3. **ARBITER stall**: Replace after 1 nudge, not 2. A debate without an arbiter produces
   no verdict -- treat it as a critical failure.

4. **QUESTIONER stall**: Log but do not replace. Mark `"questioner_active": false`
   in checkpoint. The debate continues without probes.

5. **Context pressure detection**: If message volume is high (estimated from round count
   and agent count), broadcast to all:
   `"SUPERVISOR: Context pressure detected. Moving to early convergence.
    ARBITER, call the debate and request final summaries now."`
   Set checkpoint status to "early_convergence".

---

### Step 5 -- Collect Verdict and Verify

After the ARBITER produces its recommendation (following the same Step 5 as
adversarial-council):

1. ARBITER broadcasts "DEBATE CALLED" then requests FINAL SUMMARY from each agent.
2. ARBITER synthesizes into a recommendation: FOR / AGAINST / CONDITIONAL with findings.
3. A separate verifier agent (sonnet) reads all cited file:line references and confirms
   each finding matches the actual source. Findings that don't verify are marked phantom.
4. Parse the recommendation into structured data.

Update checkpoint status to "verdict_received".

---

### Step 6 -- Write council-result.json

Write to `--output` path (default `.council/council-result.json`):

```json
{
  "motion": "[full motion text]",
  "motion_type": "CODE|GENERAL",
  "timestamp": "ISO timestamp",
  "duration_minutes": N,
  "verdict": "FOR|AGAINST|CONDITIONAL",
  "confidence": "high|medium|low",
  "agents": {
    "ADVOCATE-1": { "status": "completed|replaced", "messages": N },
    "CRITIC-1":   { "status": "completed|replaced", "messages": N },
    "QUESTIONER": { "status": "completed|stalled",  "probes": N },
    "ARBITER":    { "status": "completed" }
  },
  "rounds_completed": N,
  "early_convergence": false,
  "fallback": false,
  "findings": [
    {
      "id": 1,
      "type": "bug|improvement|hardening|security",
      "severity": "critical|high|medium|low",
      "description": "[finding description]",
      "file": "path/to/file.ext",
      "line": 142,
      "fix_description": "[recommended fix]",
      "verification": "verified|unverified|phantom|runtime|skipped",
      "citations": ["file:line"]
    }
  ],
  "concessions": [
    {
      "agent": "CRITIC-1",
      "conceded_to": "ADVOCATE-1",
      "point": "[what was conceded]",
      "round": 2
    }
  ],
  "conditions": ["[condition for merge, if CONDITIONAL]"],
  "summary": "[ARBITER one-paragraph summary]"
}
```

---

### Step 7 -- Chain or Report

**If `--chain-fix`** and verdict is CONDITIONAL or findings exist:
```
Invoke: /parallel-fix --from-council .council/council-result.json
```
Report: "Council complete. [N] findings. Chaining to /parallel-fix for remediation."

**Otherwise**:
Report: "Council complete. Verdict: [VERDICT]. [N] findings ([M] verified).
Result: .council/council-result.json"

---

### Step 8 -- Cleanup

1. Remove `.council/checkpoint.json`
2. Retain `council-result.json` for downstream consumption
3. TeamDelete the council team
4. Mark all TaskCreate tasks as completed

---

## Consolidated Single-Agent Fallback

When agent capacity is exceeded:

1. Spawn one agent:
   ```
   You are running a consolidated adversarial review. Play all roles sequentially:
   1. ADVOCATE: Write the strongest case FOR the motion (2-3 paragraphs)
   2. CRITIC: Write the strongest case AGAINST (2-3 paragraphs)
   3. SELF-CHALLENGE: Identify the weakest points in both arguments
   4. VERDICT: Produce a recommendation (FOR / AGAINST / CONDITIONAL with rationale)
   ```
2. Parse output into the same `council-result.json` format
3. Mark `"fallback": true` in the JSON

---

## Edge Cases

- **All agents stall**: Force early convergence with replacement agents. If replacements
  also stall, fall back to consolidated review.
- **Network/tool errors on SendMessage**: Retry once. If it fails again, checkpoint
  and report the error to the user. Do not silently drop messages.
- **ARBITER stalls before DEBATE CALLED**: Replace after 1 nudge. No verdict = no result.
