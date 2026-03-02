---
name: task-scaffolder
description: Use when the user wants to create a Task or Feature note from ramblings, ideas, or direct input. Triggers: "Create a task for [topic]", "Scaffold a task", "Break this down into work items".
---

## Context
This skill is triggered when the user says "Create a task for [topic]", "Scaffold a task", "Turn this into a task/feature", or "Break this down into work items".
It produces Task and/or Feature notes from ramblings, Ideas, Proposals, or direct user input.

## Source Locations (when extracting from ramblings)
- `001-Inbox/Scratch Book.md` under `## Ramblings` or `## Quick Captures (Unprocessed)`
- `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md` under `## Ramblings` or `## Technical Notes & Snippets`
- Existing `idea` or `proposal` notes referenced by the user

## Workflow

### Task Creation
1. **Gather Context**: Read the source material. Identify the parent Repo note this task belongs to.
2. **Draft Task**: Generate a new note using `Task Template` from `000-System/Templates/Task Template.md`:
   - `title`: Actionable name (e.g., "Fleet Architecture Modernization").
   - `type`: `task`
   - `status`: `active`
   - `org`: Infer from parent Repo.
   - `parent`: Wikilink to the Repo note.
   - `goal`: One-sentence mission statement.
   - `tags`: Relevant org/tech tags.
   - Fill in `## Objective` from source material.
   - Populate `## Features` with decomposed sub-items if identifiable.
   - Populate `## Execution Plan` with phased steps.
3. **Place Task**: Save the new note in `100-Projects/110-Active/[TaskName]/Task - [TaskName].md`. If it belongs to a specific Repo, nest it within that Repo's folder inside `110-Active`.

### Feature Creation
4. **Identify Features**: If the source material contains distinct, atomic deliverables, create Feature notes using `Feature Template` from `000-System/Templates/Feature Template.md`:
   - `title`: Specific deliverable name (e.g., "gRPC Streaming Endpoint").
   - `type`: `feature`
   - `status`: `active`
   - `parent`: Wikilink to the Task note (or Repo note if standalone).
   - `tags`: Relevant context tags.
   - Fill in `## Description` and `## Acceptance Criteria`.
5. **Place Features**: Save as `Feature-[FeatureName].md` inside the Task folder (if nested) or Repo folder (if standalone).

### Promotion Linkage
6. **Link Back**: If the source was an Idea or Proposal:
   - Update the source note with `promotedTo: "[[Task - TaskName]]"` and set `status: completed`.
   - Add `related: - "[[Source Note]]"` to the new Task/Feature.
7. **Clean Source**: If extracted from Ramblings, strike through and replace:
   `- [x] [YYYY-MM-DD] Scaffolded as [[Task - TaskName]]`
8. **Log**: Append to current Daily Note under `## Daily Focus`:
   `- [x] Scaffolded task: [[Task - TaskName]]`

## Guidelines
- A Task should represent a scoped unit of work with a clear goal and end state.
- Features are atomic deliverables. If something has acceptance criteria, it is a Feature.
- If a rambling is too large for a single Task, suggest breaking it into a Project with multiple Repos/Tasks.
- When creating both a Task and its Features in one pass, create the Task first, then the Features with `parent` pointing to the Task.
- Respect the Emoji Mandate: no emojis in generated notes.
- Ensure all frontmatter conforms to the schema in [[Vault Guide]].
