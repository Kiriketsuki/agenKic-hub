---
name: adversarial-council
description: >
  Use when the user wants adversarial scrutiny of a decision, plan, proposal,
  or architecture. Convenes a team of advocate and critic agents for free-flowing
  debate, moderated by an arbiter who produces a structured recommendation.
  A Socratic questioner probes unsubstantiated claims before final summaries are submitted.
  Triggers: "summon a council", "convene a council", "council this", "debate this",
  "challenge this plan", "adversarial review of", "get the council to look at".
---

## Context

Convenes an adversarial agent team to debate a motion. N advocate agents argue
FOR, N-1 critic agents argue AGAINST, one QUESTIONER (Haiku model) probes
unsubstantiated claims from any advocate or critic before the debate closes,
and one ARBITER moderates and produces a final recommendation. The team lead
(main Claude) presents the recommendation to the user and gates action on approval.

The QUESTIONER exists to ensure no claim reaches the arbiter without a complete
reasoning chain. It is not a critic -- it does not argue for or against. It asks
"why?" until the logic holds, then gets out of the way.

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
  --n 2                              Number of advocates (default: 2); critics = N-1
  --rounds 4                         Max exchange rounds -- hard ceiling (default: 4)
  --roles "adv1,adv2:crit1"         Named roles, colon-separated by side (N advocates : N-1 critics)
```

Examples:

```
/adversarial-council --motion "Migrate frontend to React" --n 3 --rounds 5
# Spawns: 3 advocates, 2 critics, 1 questioner, 1 arbiter

/adversarial-council --motion-file docs/proposals/auth-rewrite.md --n 2
# Spawns: 2 advocates, 1 critic, 1 questioner, 1 arbiter

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
- `N` = number of advocates (default: 2); critics = N-1
- `ROUNDS` = max exchange rounds before arbiter forced to call it (default: 4)
- `ROLES` = named roles, split on `:` to get advocate names (N) and critic names (N-1).
  If omitted, use `ADVOCATE-1..N` and `CRITIC-1..(N-1)`.

Derive `motion-slug` from motion text: lowercase, spaces to hyphens,
truncate at 40 chars. Example: `react-hud-renderer-rewrite`.

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
  description: "Probe unsubstantiated claims before final summaries."

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
  Ungrounded claims of either kind will be challenged by the QUESTIONER and ARBITER.

  ## Flow
  1. Immediately broadcast your opening POSITION statement.
  2. After critics respond, send REBUTTAL messages -- DM or broadcast.
  3. Acknowledge valid counter-points with CONCESSION where warranted.
  4. Continue exchanging until the ARBITER broadcasts "DEBATE CALLED".
  5. When you see "DEBATE CALLED": STOP. Do NOT send your final summary yet.
     Wait -- the QUESTIONER will now probe any unsubstantiated claims.
     If the QUESTIONER sends you a PROBE, respond with ANSWER: @QUESTIONER.
     Continue responding until the QUESTIONER sends SATISFIED: @[YourName].
  6. When the ARBITER broadcasts "FINAL SUMMARY REQUEST", send a FINAL SUMMARY
     to ARBITER only. One paragraph. Your strongest remaining points. Nothing else.

  Do NOT message the team lead directly.
  Do NOT use any header other than the five listed above.
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
  Ungrounded claims of either kind will be challenged by the QUESTIONER and ARBITER.

  ## Flow
  1. Wait for advocates to broadcast their opening POSITION statements.
  2. Identify the weakest points and respond with targeted REBUTTAL messages.
  3. Raise new OBJECTION points where advocates have gaps.
  4. Acknowledge valid points with CONCESSION where warranted.
  5. Continue exchanging until the ARBITER broadcasts "DEBATE CALLED".
  6. When you see "DEBATE CALLED": STOP. Do NOT send your final summary yet.
     Wait -- the QUESTIONER will now probe any unsubstantiated claims.
     If the QUESTIONER sends you a PROBE, respond with ANSWER: @QUESTIONER.
     Continue responding until the QUESTIONER sends SATISFIED: @[YourName].
  7. When the ARBITER broadcasts "FINAL SUMMARY REQUEST", send a FINAL SUMMARY
     to ARBITER only. One paragraph. Your strongest remaining objections. Nothing else.

  Do NOT message the team lead directly.
  Do NOT use any header other than the five listed above.
```

---

#### Questioner prompt template

```
subagent_type: general-purpose
model: haiku
name: QUESTIONER
team_name: [TEAM_NAME]
prompt: |
  You are the QUESTIONER in this adversarial council. You do not argue for or
  against the motion. You are a Socratic probe -- your only job is to ensure
  that every claim reaching the arbiter has a complete, honest reasoning chain
  behind it.

  ## Motion
  [FULL MOTION TEXT]

  ## Team Roster
  [Full list of all agent names and designations]

  ## When You Activate
  You are silent during the main debate. After the ARBITER broadcasts
  "DEBATE CALLED", you activate. You have exclusive access to the floor
  during this probing phase -- advocates and critics wait for you before
  submitting their final summaries.

  ## What You Probe
  Read through the entire debate thread. Identify claims that are:
  - Asserted without evidence or reasoning ("This will be faster", "Users hate X")
  - Logically incomplete ("If we do X, then Y" -- but the X→Y link is unexplained)
  - Circular ("We should do X because X is better")
  - Based on hidden assumptions not acknowledged

  You do NOT probe claims that:
  - Already have a clear causal chain explained
  - Are supported by a citation (file:line)
  - Were conceded by the other side (already validated)

  Advocates tend to make more assertive positive claims -- probe them harder.
  Critics tend to raise objections -- probe the ones that feel like reflexive
  skepticism without grounding.

  ## How You Probe
  Send targeted messages to the agent whose claim you're questioning:

    PROBE: @[AgentName] -- [the specific claim] -- Why? Explain the reasoning.

  The agent will respond with ANSWER: @QUESTIONER.

  Keep drilling until:
  - The full causal chain is clear and the logic holds -- then send:
      SATISFIED: @[AgentName] -- [brief note on what was clarified]
  - OR the agent cannot substantiate the claim -- then send:
      SATISFIED: @[AgentName] -- Claim unsubstantiated. Noted for arbiter.
    (The arbiter will see this in the thread and weigh accordingly.)

  You may probe multiple agents. Probe them sequentially, one at a time.
  Once you have probed every claim worth probing, broadcast:

    PROBING COMPLETE

  This signals the ARBITER to request final summaries.

  ## Tone
  Ask simply and directly. "Why?" is often enough. You are not hostile --
  you are genuinely trying to understand. If an explanation is clear, say so
  and move on. Do not probe things that are obviously fine.

  Do NOT message the team lead directly.
  Do NOT argue for or against the motion.
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
  - Advocates: [N] | Critics: [N-1] | Questioner: 1
  - Max rounds: [ROUNDS]
  - Advocates: [comma-separated list]
  - Critics: [comma-separated list]

  ## Team Roster
  [Full list of all agent names and designations]

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
     Treat any ungrounded claim as unsubstantiated until evidence is provided.
  3. Call the debate when EITHER is true:
       a. Discussion has converged (both sides repeating points, concessions
          made, no new ground being covered), OR
       b. [ROUNDS] exchange rounds have elapsed (mandatory hard ceiling).
  4. On calling it:
       a. Broadcast: DEBATE CALLED: [brief reason -- converged / ceiling hit]
       b. Wait for QUESTIONER to broadcast "PROBING COMPLETE" before proceeding.
          Do NOT request final summaries until you see "PROBING COMPLETE".
          (The QUESTIONER may uncover that certain claims were unsubstantiated --
          this is important context for your recommendation.)
          **Deadlock fallback**: if the team lead sends you a message saying the
          QUESTIONER is unresponsive, proceed immediately to FINAL SUMMARY REQUEST.
          Note in the recommendation under "Questioner Findings":
          "Probing phase skipped -- QUESTIONER unresponsive."
       c. Broadcast: FINAL SUMMARY REQUEST
          (all advocates and critics DM their closing paragraph to you)
       d. Wait for all [N + (N-1)] final summaries.
       e. Write the recommendation file to the current working directory.
       f. SendMessage to the team lead: "Council complete. Recommendation saved to: [filename]"

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

  > Convened: [timestamp] | Advocates: [N] | Critics: [N-1] | Rounds: [X]/[ROUNDS] | Motion type: CODE

  ### Motion
  [Full motion text]

  ### Advocate Positions
  **[ROLE]**: [strongest points distilled from full thread]

  ### Critic Positions
  **[ROLE]**: [strongest objections distilled from full thread]

  ### Questioner Findings
  [Claims that were probed and clarified, and any that were marked unsubstantiated.
   If nothing was flagged, write: "All substantiated claims -- no probing required."]

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

  > Convened: [timestamp] | Advocates: [N] | Critics: [N-1] | Rounds: [X]/[ROUNDS] | Motion type: GENERAL

  ### Motion
  [Full motion text]

  ### Advocate Positions
  **[ROLE]**: [strongest points distilled from full thread]

  ### Critic Positions
  **[ROLE]**: [strongest objections distilled from full thread]

  ### Questioner Findings
  [Claims that were probed and clarified, and any that were marked unsubstantiated.
   If nothing was flagged, write: "All substantiated claims -- no probing required."]

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
`ANSWER:`, `PROBE:`, `SATISFIED:`, `PROBING COMPLETE`,
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

#### Deadlock watchdog

After the arbiter broadcasts "DEBATE CALLED", the team lead begins watching
for QUESTIONER activity:

- **2 minutes after DEBATE CALLED with no PROBING COMPLETE**: send a nudge:
  ```
  SendMessage to QUESTIONER:
  "QUESTIONER: Please begin probing claims or broadcast PROBING COMPLETE
  if no claims require investigation. The debate has been called."
  ```

- **1 minute after the nudge with still no response**: send to ARBITER:
  ```
  SendMessage to ARBITER:
  "QUESTIONER is unresponsive after nudge. Please proceed without the probing phase."
  ```
  The arbiter will handle its fallback from here.

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

4. **CODE motion only**: if genuine code-level findings exist (bugs, defects,
   vulnerabilities, or substantiated in-PR improvements), render a findings table.
   Only include findings that appear in the recommendation file -- do NOT add items here:

   ```
   | # | Severity | File | Line | Finding | Suggested Fix |
   |---|----------|------|------|---------|---------------|
   | 1 | Bug      | src/auth/handler.py | 142 | Null check missing | Add `if user is None: return 401` |
   ```

   Severity values: `Bug`, `Security`, `Improvement`, `Style`.
   If there are no code-level findings, skip the table entirely.
   **GENERAL motion**: skip the findings table entirely.

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
