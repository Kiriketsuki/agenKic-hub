---
name: brainstorm
description: "Collaborative design exploration before implementation. Understands project context, asks the questions that matter, proposes approaches with trade-offs, and converges on an approved design. Chains into feature-spec for structured output. Use before building features, components, or making significant changes. Scales from a three-message sanity check to a full design session."
attribution: "Adapted from the claude-plugins-official repository (https://github.com/anthropics/claude-plugins-official) by Anthropic."
model: opus
---

# Brainstorming Ideas Into Designs

Turn ideas into designs through collaborative dialogue. Understand the project first, then converge on a design the user agrees to.

## Pick a depth first

Infer the depth from the request, state your pick in one line, and accept "go deeper" or "go faster" as an override at any point.

| Depth | Use when | Shape |
|---|---|---|
| Quick | One decision, or the user already knows roughly what they want | Confirm the goal, name the one real fork, recommend a side, one-paragraph design, confirm, done. 3 to 5 messages. |
| Standard (default) | A feature, a component, a change with real unknowns | Explore context, ask the questions that matter, 2 to 3 approaches, design in sections, confirm. |
| Deep | New subsystem, migration, anything expensive to get wrong | Standard, plus decomposition, plus explicit error handling, testing and rollout sections, plus per-section confirmation. |

## The one non-negotiable

State the design and get a yes before you write code or invoke an implementation skill. At Quick depth the design can be two sentences. The gate is on agreement, not on ceremony.

## The moves

A menu, not a checklist. Quick uses moves 1, 4 and 5. Standard uses all but decomposition. Deep uses all six. Use TodoWrite at Deep depth only, or when the user asks to see the plan.

1. **Explore project context** — files, docs, recent commits.
2. **Decompose** — when the request spans several independent subsystems, split it before refining details. Brainstorm the first sub-project through the normal flow.
3. **Ask clarifying questions** — purpose, constraints, success criteria.
4. **Propose approaches** — trade-offs plus your recommendation.
5. **State the design** — and get the yes.
6. **Hand off** — see Finishing. YAGNI ruthlessly along the way: cut features the design does not need.

## Questions

AskUserQuestion is the default instrument for any closed-option choice. Fall back to prose when the option set exceeds four options, or when each option needs a paragraph to explain. One question per message is the default because it keeps answers clean. Batch two or three when they are independent and the user is moving fast.

## Approaches

Propose 2 to 3 approaches when a genuine fork exists. When one obvious way exists, say so, say why, and move on. A manufactured alternative wastes a turn. Lead with your recommendation and the reasoning.

## Presenting the design

Length follows stakes, not a template. At Standard and Deep depth, use plan mode and present the design as the plan, then use ExitPlanMode as the approval gate. The plan is the design document. At Quick depth, state the design inline and ask for a yes. Cover architecture, components, data flow, error handling and testing only where each one carries a real decision. Say which of them you skip and why, so the user can pull one back in.

## Design for isolation and clarity

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

## Working in existing codebases

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## Finishing

Three named exits. Ask which ending the user wants when it is not obvious.

1. **Default:** hand the approved design to the feature-spec skill with a summary of what was decided, so it pre-fills instead of re-interviewing.
2. **Build now:** the user wants to build immediately and the design is small. Say so and stop. The user invokes the implementation skill.
3. **The brainstorm was the deliverable:** end with the decision written out in chat. No artifact is owed.

## Visuals

When a question is genuinely about something visual, show it. Climb the cheapest rung that
works: a mermaid fence or a markdown table inline in chat, an Artifact page when the user
must see something rendered, the live server when the loop needs push-reload and click
capture across several turns. Do not offer a visual companion as a formal choice and do not
script the offer. Show the thing at the rung that fits and say what you are doing. Ask first
before climbing to rung 3, because it starts a process. Details: `visuals.md`.
