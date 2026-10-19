---
name: agent-route
description: >
  Recommend the optimal agent type for a task based on domain, complexity, and
  available specializations. Use when spawning subagents, building teams, or when
  the user wants to know which agent fits their task best.
  Triggers: "which agent should I use", "agent route", "pick an agent",
  "route this to an agent", "/agent-route", "what agent for this".
  Also use proactively before spawning Agent or TeamCreate when the right
  subagent_type is not obvious.
---

## How Agent Types Work

There are three layers of agents, checked in this order:

| Layer | Source | How to Use |
|:---|:---|:---|
| **Built-in** | Claude Code core | `subagent_type` param on Agent tool (e.g., `Explore`, `Plan`) |
| **Custom** | `~/.claude/agents/*.md` | `subagent_type` param matching the agent name from frontmatter |
| **Plugin** | Installed plugins | `subagent_type` with qualified name (e.g., `codex:codex-rescue`) |

Check the Agent tool's own list of agent types before you route. A name that is not
in that list does not exist, so do not recommend it. `references/agent-catalog.md`
lists the agent types that exist on the author's machine and is a snapshot, not the
source of truth.

## Quick Routing Table

| Task Domain | First Choice | Fallback |
|:---|:---|:---|
| Codebase search/exploration (read-only) | `Explore` | `general-purpose` |
| Architecture/planning (read-only) | `Plan` | `Software Architect` |
| Bug investigation (read-only, never edits) | `diagnosis` | `general-purpose` |
| Implementation (full-stack) | `Senior Developer` | `general-purpose` |
| Backend/API design and build | `Backend Architect` | `Software Architect` |
| Frontend/UI build | `Frontend Developer` | `Senior Developer` |
| Python scripts, data processing, automation | `Python Specialist` | `general-purpose` |
| Code review | `Code Reviewer` | `general-purpose` |
| Security analysis | `Security Engineer` | `Code Reviewer` |
| Git, branching, CI/CD workflow | `Git Workflow Master` | `general-purpose` |
| Documentation | `Technical Writer` | `general-purpose` |
| Testing/QA | `Code Reviewer` | `general-purpose` |
| Pipeline orchestration | `Agents Orchestrator` | `general-purpose` |
| MCP server building | `MCP Builder` | `Senior Developer` |
| Robotics, ROS, vehicle control | `Robotics & ROS Engineer` | `general-purpose` |
| Aurrigo Visual Explainer pages | `Aurrigo Visual Explainer` | `general-purpose` |
| Teaching material, lectures, assessments | `Lecturer Assistant` | `Technical Writer` |
| Note linking, knowledge base upkeep | `ZK Steward` | `general-purpose` |
| Claude Code questions | `claude-code-guide` | -- |
| Second model on a diagnosis or implementation | `codex:codex-rescue` | `clodeks:codex-exec` |
| One scripted Codex task with a JSON result | `clodeks:codex-exec` | `codex:codex-rescue` |

Gaps: no agent exists for DevOps, SRE, database tuning, API testing or performance
benchmarking. Route that work to `Backend Architect` (databases, APIs),
`Git Workflow Master` (CI/CD) or `general-purpose`. Say so in the Reason line.

For the full list with tool access, read `references/agent-catalog.md`.

## Decision Factors

- **Scope**: Read-only investigation = `diagnosis`; implementation = developer agents; review = reviewer agents
- **Read-only types**: `Explore`, `Plan` and `diagnosis` cannot edit files. Do not route build work to them.
- **Domain specificity**: Generic coding = `Senior Developer`; specialized domain (ROS, MCP, Python) = domain agent
- **Blast radius**: Narrow file search = `Explore`; multi-file refactor = `Software Architect` then `Senior Developer`
- **Pipeline stage**: Planning = `Plan`; building = developer agents; review = `Code Reviewer`
- **Tool access**: Match the agent's tool access to what the task requires.

## Model Pairing

Combine with `/model-route`, which holds the tier rule and the effort levels.
`/model-route` also links back here.

| Agent Category | Default Model | When to Change |
|:---|:---|:---|
| `Explore` and other search agents | haiku | Use sonnet for a large or unfamiliar codebase |
| Developer agents, reviewers (fan-out work) | sonnet | Use opus for a subtle or high-risk review |
| `diagnosis` | sonnet | Use opus for a root cause that survived a failed sonnet attempt |
| `Plan`, `Software Architect`, `Agents Orchestrator` | opus | Use sonnet for a simple plan |

## Output Format

When invoked, produce:

```
Recommended: [Agent Name]
Layer: [built-in / custom / plugin]
subagent_type: "[exact value for Agent tool]"
Model: [haiku / sonnet / opus]
Effort: [low / medium / high / xhigh / max]
Reason: [one sentence]
Fallback: [Agent Name] if [condition]
```

## Usage

```
/agent-route "investigate why the auth middleware is failing"
/agent-route "build a REST API for the fleet management system"
/agent-route "review the changes in this PR"
/agent-route  # describe the task and get a recommendation
```
