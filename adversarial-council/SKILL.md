---
name: adversarial-council
description: >
  Use when the user wants adversarial scrutiny of a decision, plan, proposal,
  or architecture. Convenes a team of advocate and critic agents for free-flowing
  debate, moderated by an arbiter who produces a structured recommendation.
  Triggers: "summon a council", "convene a council", "council this", "debate this",
  "challenge this plan", "adversarial review of", "get the council to look at".
---

## Context

Convenes an adversarial agent team to debate a motion. N advocate agents argue
FOR, N critic agents argue AGAINST, and one ARBITER monitors the free-flowing
discussion, moderates, and produces a final recommendation. The team lead
(main Claude) presents the recommendation to the user and gates action on approval.

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
  --n 2                              Agents per side (default: 2)
  --rounds 4                         Max exchange rounds -- hard ceiling (default: 4)
  --roles "adv1,adv2:crit1,crit2"   Named roles, colon-separated by side
```

Examples:

```
/adversarial-council --motion "Migrate frontend to React" --n 3 --rounds 5

/adversarial-council --motion-file docs/proposals/auth-rewrite.md --n 2

/adversarial-council \
  --motion "Use glassmorphism in dark mode" \
  --n 3 --rounds 5 \
  --roles "DARKMODE-ADVOCATE,UX-ADVOCATE,PERF-ADVOCATE:CONTRAST-CRITIC,A11Y-CRITIC,PERF-CRITIC"
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
- `N` = number of agents per side (default: 2)
- `ROUNDS` = max exchange rounds before arbiter forced to call it (default: 4)
- `ROLES` = named roles, split on `:` to get advocate names and critic names.
  If omitted, use `ADVOCATE-1..N` and `CRITIC-1..N`.

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

TaskCreate for arbiter:
  subject: "ARBITER -- moderate and synthesize"
  description: "Monitor debate, call when ready, produce recommendation."
```

Store team name and task IDs for cleanup in Step 6.

---

### Step 3 -- Agent Spawn

Spawn all agents simultaneously via the Agent tool. All use
`subagent_type: general-purpose` and `team_name: [team from Step 2]`.

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
  [List all agent names and their designation: ADVOCATE / CRITIC / ARBITER]

  ## Discussion Rules
  Every message MUST start with exactly one of these structured headers:

    POSITION: (opening statement -- broadcast to full team)
    REBUTTAL: @[AgentName] (direct response to a specific agent's point)
    CONCESSION: (point you accept from the other side)
    OBJECTION: (new challenge raised mid-discussion)

  Free prose is allowed after the header line.
  Do not repeat points you have already conceded.
  Stay in character at all times.

  ## Flow
  1. Immediately broadcast your opening POSITION statement.
  2. After critics respond, send REBUTTAL messages -- DM or broadcast.
  3. Acknowledge valid counter-points with CONCESSION where warranted.
  4. Continue exchanging until the ARBITER broadcasts "DEBATE CALLED".
  5. When you see "DEBATE CALLED", send a FINAL SUMMARY to ARBITER only.
     One paragraph. Your strongest remaining points. Nothing else.

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
  [List all agent names and their designation: ADVOCATE / CRITIC / ARBITER]

  ## Discussion Rules
  Every message MUST start with exactly one of these structured headers:

    POSITION: (opening statement -- broadcast to full team)
    REBUTTAL: @[AgentName] (direct response to a specific agent's point)
    CONCESSION: (point you accept from the other side)
    OBJECTION: (new challenge raised mid-discussion)

  Free prose is allowed after the header line.
  Do not repeat points you have already conceded.
  Stay in character at all times.

  ## Flow
  1. Wait for advocates to broadcast their opening POSITION statements.
  2. Identify the weakest points and respond with targeted REBUTTAL messages.
  3. Raise new OBJECTION points where advocates have gaps.
  4. Acknowledge valid points with CONCESSION where warranted.
  5. Continue exchanging until the ARBITER broadcasts "DEBATE CALLED".
  6. When you see "DEBATE CALLED", send a FINAL SUMMARY to ARBITER only.
     One paragraph. Your strongest remaining objections. Nothing else.

  Do NOT message the team lead directly.
  Do NOT use any header other than the five listed above.
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
  - Agents per side: [N]
  - Max rounds: [ROUNDS]
  - Advocates: [comma-separated list]
  - Critics: [comma-separated list]

  ## Team Roster
  [Full list of all agent names and designations]

  ## Your Job
  1. Monitor the discussion thread as messages arrive.
  2. When an argument is vague or unsubstantiated, ask a clarifying question:
       CLARIFY: @[AgentName] -- [your question]
  3. Call the debate when EITHER is true:
       a. Discussion has converged (both sides repeating points, concessions
          made, no new ground being covered), OR
       b. [ROUNDS] exchange rounds have elapsed (mandatory hard ceiling).
  4. On calling it:
       a. Broadcast: DEBATE CALLED: [brief reason -- converged / ceiling hit]
       b. Broadcast: FINAL SUMMARY REQUEST
          (all advocates and critics DM their closing paragraph to you)
       c. Wait for all [N*2] final summaries.
       d. Write the recommendation file to the current working directory.
       e. SendMessage to the team lead: "Council complete. Recommendation saved to: [filename]"

  ## Fix Triage Protocol (STRICTLY ENFORCED)
  When producing the recommendation, categorise every suggested fix using this
  priority order -- do NOT skip levels:

  1. **In-PR fix** (default): Can this be addressed by a small code change
     in the current PR? If yes, list it as an in-PR fix. This is the preferred
     outcome for the vast majority of council findings.
  2. **PR description update**: Does the PR's stated scope or intent need to
     be expanded, corrected, or clarified? List it as a PR description amendment.
  3. **New GitHub Issue -- future feature only** (last resort): Only propose a
     new issue if the fix is genuinely out of scope for the current PR AND
     represents a future feature or enhancement. Flag it explicitly so the team
     lead can ask the human to confirm before creating it.

  Never propose creating a new issue for something that can be fixed in the
  current PR with a small change. Never propose creating a Task issue when a
  Feature issue suffices -- remember: a Task is composed of multiple Features;
  a Feature can stand alone.

  When a new issue IS warranted, check the target repo for a `.github/ISSUE_TEMPLATE/`
  directory or `.github/workflows/` and note the appropriate template to use.

  ## Recommendation File
  Filename: [YYYY-MM-DD-HHmmss]-council-[MOTION-SLUG].md
  Location: current working directory

  Format:

  ---
  ## Adversarial Council -- [MOTION TITLE]

  > Convened: [timestamp] | Advocates: [N] | Critics: [N] | Rounds: [X]/[ROUNDS]

  ### Motion
  [Full motion text]

  ### Advocate Positions
  **[ROLE]**: [strongest points distilled from full thread]

  ### Critic Positions
  **[ROLE]**: [strongest objections distilled from full thread]

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
  Categorised by triage priority. Do not propose a higher tier if a lower one suffices.

  #### In-PR Fixes (implement now)
  - [Fix description] -- [which file/area, why it can be done in this PR]

  #### PR Description Amendments (update scope/intent)
  - [What to add/change in the PR description]

  #### New Issues (future features only -- confirm with human before creating)
  > NOTE: Only list items here that are genuinely out-of-scope future work.
  > The team lead MUST ask the human: "Is [X] meant to be a future feature,
  > or should we try to address it in this PR?" before filing any issue.
  > Use Feature issues unless the work spans multiple features, in which case use Task.
  > Check `.github/ISSUE_TEMPLATE/` in the target repo for the correct template.
  - [Issue title] -- [why it cannot be an in-PR fix] -- [Feature / Task]
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
proceeding to Step 5. Messages from advocates and critics during the debate
are informational -- the team lead does not need to respond to them.

---

### Step 5 -- Proceed Gate

When the arbiter reports "Council complete. Recommendation saved to: [filename]":

1. Read the recommendation file.
2. For any items listed under "New Issues (future features only)", ask the user
   before presenting the full summary:
   ```
   The council flagged [N] potential future-feature issue(s):
   [List each issue title]

   Are any of these meant to be addressed in the current PR instead,
   or should they be filed as future issues? (answer before we proceed)
   ```
   Adjust the fix plan based on the user's answer -- move confirmed future
   features back into the "New Issues" bucket; move anything the user wants
   addressed now into "In-PR Fixes".
3. Present the full recommendation to the user:

```
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning from the recommendation file]

In-PR Fixes ([N]):
  1. [Fix 1]
  2. [Fix 2]
  ...

PR Description Amendments ([N]):
  - [Amendment 1]
  ...

New Issues to file ([N] -- future features confirmed by you):
  - [Issue title] ([Feature / Task])
  ...

Full debate saved to: [filename]

Proceed? [y/N/modify]
```

Responses:
- `y` -- enter plan mode immediately. Present the full implementation plan
  covering all in-PR fixes, the updated PR description text, and (if any)
  steps to create new issues using the correct `.github/ISSUE_TEMPLATE/`
  template. Do NOT start executing -- stay in plan mode until the user
  approves the plan.
- `N` -- note the result, take no further action. Inform the user:
  "Council result noted. No action taken."
- `modify` -- ask the user how they want to amend the motion.
  Once clarified, return to Step 1 with the updated motion and same N and roles.
  Reuse the existing team (do not TeamDelete yet).

---

### Step 6 -- Cleanup

After the proceed gate resolves (whether `y`, `N`, or after a `modify`
reconvene completes):

1. Send shutdown requests to all remaining team members:
   ```
   SendMessage type: shutdown_request
   recipient: [each agent name]
   content: "Council concluded. Thank you."
   ```
2. Wait for all shutdown responses to arrive.
3. Call TeamDelete to remove the team and task list.

If any agent rejects shutdown (still processing), wait 10 seconds and
retry once. If still rejected after retry, call TeamDelete anyway and
inform the user: "Note: one or more agents may still be running briefly
in the background -- they will terminate shortly."
