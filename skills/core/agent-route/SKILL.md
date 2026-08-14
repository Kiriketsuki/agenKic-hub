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
| **Plugin** | Installed plugins | `subagent_type` with qualified name (e.g., `pr-review-toolkit:code-simplifier`) |

## Quick Routing Table

| Task Domain | First Choice | Fallback |
|:---|:---|:---|
| Codebase search/exploration | `Explore` (built-in) | `general-purpose` |
| Architecture/planning | `Plan` (built-in) | `Software Architect` |
| Bug investigation | `diagnosis` | `general-purpose` |
| Implementation (full-stack) | `Senior Developer` | `general-purpose` |
| Backend/API design | `Backend Architect` | `Software Architect` |
| Frontend/UI build | `Frontend Developer` | `Senior Developer` |
| Code review | `Code Reviewer` | `superpowers:code-reviewer` |
| PR review | `pr-review-toolkit:code-reviewer` | `coderabbit:code-reviewer` |
| Security analysis | `Security Engineer` | `pr-review-toolkit:silent-failure-hunter` |
| DevOps/CI/CD | `DevOps Automator` | `SRE` |
| Database work | `Database Optimizer` | `Backend Architect` |
| Documentation | `Technical Writer` | `general-purpose` |
| Testing/QA | `API Tester` or `Performance Benchmarker` | `pr-review-toolkit:pr-test-analyzer` |
| Pipeline orchestration | `Agents Orchestrator` | `general-purpose` |
| MCP server building | `MCP Builder` | `Senior Developer` |
| Claude Code questions | `claude-code-guide` (built-in) | -- |
| Type design review | `pr-review-toolkit:type-design-analyzer` | `Code Reviewer` |
| Code simplification | `pr-review-toolkit:code-simplifier` | `Code Reviewer` |

For domains not listed above (marketing, sales, game dev, XR, etc.), read `references/agent-catalog.md` for the full categorized list.

## Decision Factors

- **Scope**: Read-only investigation = `diagnosis`; implementation = developer agents; review = reviewer agents
- **Domain specificity**: Generic coding = `Senior Developer`; specialized domain (Unity, Godot, embedded) = domain-specific agent
- **Blast radius**: Narrow file search = `Explore`; multi-file refactor = `Software Architect` then `Senior Developer`
- **Pipeline stage**: Planning = `Plan`; building = developer agents; hardening = testing/QA agents; review = reviewer agents
- **Tool access**: Some agents have restricted tools (e.g., `diagnosis` is read-only). Match the agent's tool access to what the task requires.

## Model Pairing

Combine with `/model-route` for optimal cost/quality:

| Agent Category | Default Model | When to Upgrade |
|:---|:---|:---|
| `Explore`, search agents | haiku | Large or unfamiliar codebase |
| Developer agents, reviewers | sonnet | Default for implementation |
| `diagnosis`, architects, orchestrators | sonnet | Upgrade to opus for cross-cutting bugs or system design |
| `Plan`, `Software Architect` | opus | Default for architecture — downgrade to sonnet for simple plans |

## Output Format

When invoked, produce:

```
Recommended: [Agent Name]
Layer: [built-in / custom / plugin]
subagent_type: "[exact value for Agent tool]"
Model: [haiku / sonnet / opus]
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
