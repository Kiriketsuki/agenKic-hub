# brainstorm

Collaborative design exploration before implementation. The skill understands the project, asks the questions that matter, proposes approaches with trade-offs, and converges on a design the user approves. It then chains into feature-spec for structured output.

## Depth

| Depth | Use when | Shape |
|---|---|---|
| Quick | One decision, or the user already knows roughly what they want | Confirm the goal, name the one real fork, recommend a side, one-paragraph design, confirm, done. 3 to 5 messages. |
| Standard (default) | A feature, a component, a change with real unknowns | Explore context, ask the questions that matter, 2 to 3 approaches, design in sections, confirm. |
| Deep | New subsystem, migration, anything expensive to get wrong | Standard, plus decomposition, plus explicit error handling, testing and rollout sections, plus per-section confirmation. |

## Visuals

| Rung | Mechanism | Reach for it when | Cost |
|---|---|---|---|
| 1 | Inline mermaid fence, markdown table, ASCII sketch | Structure, flow, comparison, state machine. Most visual questions. | Free, zero tool calls, stays in the transcript |
| 2 | Artifact tool, one self-contained HTML page | The user must see a rendered layout, mockup or side-by-side | One tool call, no process, the page persists at a URL |
| 3 | `scripts/start-server.sh` live server | Several rounds of iterate-and-click on the same surface | A background process, a port, a lifecycle to clean up |

## Which file gets read when

- `SKILL.md` — always.
- `visuals.md` — when a visual moment arrives.
- `scripts/SERVER.md` — only at rung 3, before starting the server.

## Environment

- `BRAINSTORM_NODE` — overrides node resolution in `scripts/start-server.sh`.

## Changes

`visual-companion.md` became `visuals.md`, with the operational server detail split out to `scripts/SERVER.md`. `spec-document-reviewer-prompt.md` was removed as unreferenced.
