---
name: core-engager
description: Use when the user says "I've engaged on [Project]" or "Formalize [Thought] into a project" to promote a captured idea into a formal project.
---

## Context
Triggered when the user says "I've engaged on [Project]" or "Formalize [Thought] into a project". Promotes a captured thought into a full project by verifying its note, linking the GitHub Issue, and cleaning the inbox.

## Workflow
1. **Verify**: Ensure a project note exists in `100-Projects/` (or create one using the `Project Template` if requested).
2. **Sync**: Ensure the GitHub Issue related to the thought is linked in the project note.
3. **Clean**: Remove the corresponding entry from `001-Inbox/Scratch Book.md` (check both `## Organized TODOs` and `## Pushed to GitHub`).
4. **Log**: (Optional) Add a "Project Initialized" entry to the Daily Note.

## Guidelines
- Always confirm with the user before deleting anything from the Scratch Book.
- Ensure the project note has `type: project` and `status: active` (or the appropriate status) in its frontmatter.
