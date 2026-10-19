# Agent Catalog

Agent types that exist on the author's machine. This file is a snapshot. The Agent
tool's own list of types is the source of truth. Check `~/.claude/agents/*.md` for
custom agents.

## Table of Contents

- [Built-in agents](#built-in-agents)
- [Custom agents](#custom-agents)
- [Plugin agents](#plugin-agents)
- [Read-only agents](#read-only-agents)

---

## Built-in agents

| subagent_type | Use For |
|:---|:---|
| `general-purpose` | Default. Research, multi-step tasks, anything without a specialist |
| `Explore` | Read-only codebase search and file pattern matching |
| `Plan` | Read-only implementation planning and trade-off analysis |
| `claude-code-guide` | Questions about Claude Code features, the SDK and the API |
| `statusline-setup` | Configure the status line |

## Custom agents

These come from `~/.claude/agents/*.md`.

| subagent_type | Domain |
|:---|:---|
| `Agents Orchestrator` | Pipeline management across a development workflow |
| `Aurrigo Visual Explainer` | Branded Visual Explainer HTML for Aurrigo projects |
| `Backend Architect` | Backend design, databases, APIs, cloud infrastructure |
| `Code Reviewer` | Review for correctness, maintainability, security, performance |
| `diagnosis` | Read-only root-cause analysis with a structured report |
| `Frontend Developer` | Web UI, React, Vue, Angular, performance |
| `Git Workflow Master` | Branching, commits, rebasing, worktrees, CI-friendly flow |
| `Lecturer Assistant` | Course design, lectures, assessments, feedback |
| `MCP Builder` | MCP servers, tools, resources, prompts |
| `Python Specialist` | Idiomatic Python for data, automation and APIs |
| `Robotics & ROS Engineer` | ROS and ROS2, sensor fusion, planning, vehicle control |
| `Security Engineer` | Threat modeling, vulnerability assessment, secure review |
| `Senior Developer` | General implementation, Laravel, advanced CSS, Three.js |
| `Software Architect` | System design, DDD, architectural decisions |
| `Technical Writer` | Developer docs, API references, READMEs, tutorials |
| `ZK Steward` | Zettelkasten-style knowledge base work |

## Plugin agents

| subagent_type | Domain |
|:---|:---|
| `codex:codex-rescue` | Hand a stuck or substantial task to Codex |
| `clodeks:codex-exec` | Run one task on the Codex CLI and return JSON |

## Read-only agents

`Explore`, `Plan` and `diagnosis` cannot edit files. Use them to find, plan or
diagnose. Hand the build step to a developer agent.
