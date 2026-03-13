---
name: adversarial-council
description: >
  Use when the user wants adversarial scrutiny of a decision, plan, proposal,
  or architecture. Convenes a team of advocate and critic agents for free-flowing
  debate, moderated by an arbiter who produces a structured recommendation.
  A Socratic questioner probes unsubstantiated claims in parallel throughout the debate.
  Triggers: "summon a council", "convene a council", "council this", "debate this",
  "challenge this plan", "adversarial review of", "get the council to look at".
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
```

## Workflow

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
The QUESTIONER uses `model: haiku`.

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

  [IF SCAN_TARGETS OR DIFF_CONTEXT IS SET:]
  ## Pre-Debate Scan
  This is a CODE motion. Before you write anything, read the following.
  [If SCAN_TARGETS set: list each file path]
  [If DIFF_CONTEXT set: "The current diff follows. Read it in full before proceeding."\n\n[DIFF_CONTEXT]]

  Read silently and independently. Do not broadcast yet.
  Your opening POSITION must be grounded in what you actually find in the code --
  not what you assume is there.
  [END IF]

  ## Discussion Rules
  Every message MUST start with exactly one of these structured headers:

    POSITION: (opening statement -- broadcast to full team)
    REBUTTAL: @[AgentName] (direct response to a specific agent's point)
    CONCESSION: (point you accept from the other side)
    OBJECTION: (new challenge raised mid-discussion)
    ANSWER: @QUESTIONER (response to a PROBE from the questioner)

  Free prose is allowed after the header line.
  Do not repeat points you have already conceded.
  Stay in character at all times.

  ## Evidence Requirement (STRICTLY ENFORCED)
  Every claim you make must be grounded. How you ground it depends on the motion:
  - **Code or file-specific motion**: cite the exact location -- `file/path.ext:LINE_NUMBER`.
    Example: "The null check is missing at src/auth/handler.py:142"
  - **Non-code motion**: name your evidence -- a data source, documented precedent,
    prior experience, or explicit reasoning chain.
  Ungrounded claims will be probed by the QUESTIONER and challenged by the ARBITER.

  ## Flow
  [IF CODE MOTION:]
  0. SCAN: Read all files/diff listed in the Pre-Debate Scan section above.
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
  Do NOT use any header other than: POSITION, REBUTTAL, CONCESSION, OBJECTION, ANSWER.
  PROBE and SATISFIED are reserved for the QUESTIONER.
```

---

#### Critic prompt template

Instantiate once per critic. Replace all `[PLACEHOLDERS]` before dispatching.

```
subagent_type: general-purpose
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

  [IF SCAN_TARGETS OR DIFF_CONTEXT IS SET:]
  ## Pre-Debate Scan
  This is a CODE motion. Before you write anything, read the following.
  [If SCAN_TARGETS set: list each file path]
  [If DIFF_CONTEXT set: "The current diff follows. Read it in full before proceeding."\n\n[DIFF_CONTEXT]]

  Read silently and independently. Do not broadcast yet.
  Your opening POSITION must be grounded in what you actually find in the code --
  not what you assume is there.
  [END IF]

  ## Discussion Rules
  Every message MUST start with exactly one of these structured headers:

    POSITION: (opening statement -- broadcast to full team)
    REBUTTAL: @[AgentName] (direct response to a specific agent's point)
    CONCESSION: (point you accept from the other side)
    OBJECTION: (new challenge raised mid-discussion)
    ANSWER: @QUESTIONER (response to a PROBE from the questioner)

  Free prose is allowed after the header line.
  Do not repeat points you have already conceded.
  Stay in character at all times.

  ## Evidence Requirement (STRICTLY ENFORCED)
  Every claim you make must be grounded. How you ground it depends on the motion:
  - **Code or file-specific motion**: cite the exact location -- `file/path.ext:LINE_NUMBER`.
    Example: "The null check is missing at src/auth/handler.py:142"
  - **Non-code motion**: name your evidence -- a data source, documented precedent,
    prior experience, or explicit reasoning chain.
  Ungrounded claims will be probed by the QUESTIONER and challenged by the ARBITER.

  ## Flow
  [IF CODE MOTION:]
  0. SCAN: Read all files/diff listed in the Pre-Debate Scan section above.
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
  Do NOT use any header other than: POSITION, REBUTTAL, CONCESSION, OBJECTION, ANSWER.
  PROBE and SATISFIED are reserved for the QUESTIONER.
```

---

#### Questioner prompt template

```
subagent_type: general-purpose
model: haiku
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

  ## When NOT to Probe

  - Claims that already cite a source, a `file:line`, or a named reasoning chain
  - CONCESSION messages (the agent is already accepting something -- no need)
  - ANSWER messages directed at you (those are responses, not new claims)
  - Claims that both sides appear to agree on

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
  1. **Bug / defect (any scope)**: Fix it unconditionally. Never punt bugs to new issues.
  2. **In-PR fix -- scoped improvement**: Addressable in current PR with small change.
  3. **PR description update**: Scope changed; note what to add/amend.
  4. **New GitHub Issue -- future feature/enhancement only** (last resort): Only if
     genuinely out of current scope. Flag for human confirmation before creating.

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

  ### Arbiter Recommendation
  **[FOR / AGAINST / CONDITIONAL]**
  [2-3 sentences citing specific debate points that drove the recommendation]

  ### Conditions (if CONDITIONAL)
  - [Condition]

  ### Suggested Fixes
  [Only present if genuine issues were raised and substantiated in the debate.
   If none, write: "No issues identified." and omit all sub-sections below.]

  #### Bug Fixes (always in-PR, regardless of original scope)
  - [Fix description] -- [file/path.ext:LINE] -- [why this is a bug]

  #### In-PR Improvements (scoped, non-bug)
  - [Fix description] -- [file/path.ext:LINE or area] -- [why it can be done in this PR]

  #### PR Description Amendments (update scope/intent)
  - [What to add/change in the PR description]

  #### New Issues (future features/enhancements only -- confirm with human before creating)
  > NEVER list bugs here. Confirm with team lead before filing.
  - [Issue title] -- [why future enhancement] -- [Feature / Task]
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
  [Only if specific follow-on steps were identified in the debate. Freeform.
   If none, write: "No action items identified."]
  - [Action item] -- [owner if discussed] -- [why this matters]
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
`ANSWER:`, `PROBE:`, `SATISFIED:`,
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

3. Present the **full findings** immediately. Output the entire recommendation
   file content verbatim.

4. Always render a findings table. Only include findings that appear in the
   recommendation file -- do NOT add items here.

   **CODE motion** -- findings table:
   ```
   | # | Severity | File | Line | Finding | Suggested Fix |
   |---|----------|------|------|---------|---------------|
   | 1 | Bug      | src/auth/handler.py | 142 | Null check missing | Add `if user is None: return 401` |
   ```
   Severity values: `Bug`, `Security`, `Improvement`, `Style`.
   If there are no code-level findings, render one row: `| -- | -- | -- | -- | No findings identified. | -- |`

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

In-PR Fixes ([N]):
  1. [Fix 1]
  ...

PR Description Amendments ([N]):
  - [Amendment 1]
  ...

New Issues flagged ([N] -- future features, need your call):
  - [Issue title] ([Feature / Task]) -- file as future issue, or address in this PR?
  ...

Full debate saved to: [filename]

Proceed? [y/N/modify]
(If new issues listed above: answer "file" or "in-PR" for each before proceeding)
```

If there are no fixes, amendments, or new issues, the CODE gate simplifies to:

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning]

No fixes identified.
Full debate saved to: [filename]

Proceed? [y/N/modify]
```

Responses (CODE):
- `y` -- enter plan mode immediately. Present the full implementation plan
  covering all in-PR fixes, the updated PR description text, and (if any)
  steps to create new issues using the correct `.github/ISSUE_TEMPLATE/`
  template. Do NOT start executing -- stay in plan mode until the user
  approves the plan.
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
