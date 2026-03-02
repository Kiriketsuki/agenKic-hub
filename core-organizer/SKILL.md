---
name: core-organizer
description: Use when the user asks to "Organize the Scratch Book" or "Process my inbox" to promote unprocessed captures into TODOs and create GitHub issues.
---

## Context
Triggered when the user asks to "Organize the Scratch Book" or "Process my inbox". Processes all unprocessed Quick Captures, promotes them to Organized TODOs, and bridges each to a GitHub Issue via core-reviewer.

## Workflow
1. Read `001-Inbox/Scratch Book.md`.
2. Analyze items in `## Quick Captures (Unprocessed)`.
3. For each item:
   - Clean up the description and break it down into sub-tasks.
   - Move the refined item to `## Organized TODOs`.
   - **Automatic Bridge**: Immediately use the `core-reviewer` skill to create a GitHub issue and link it.
   - Move the item to `## Pushed to GitHub`.
   - **External Link**: Format the item with a direct markdown link to the GitHub URL:
     `- [x] [YYYY-MM-DD] <TODO_TITLE>. [GitHub Issue](<ISSUE_URL>)`

## Guidelines
- Maintain the `- [ ] [YYYY-MM-DD]` prefix on items until they are promoted to `[x]`.
- Ensure `gh auth status` is valid before proceeding.
- Always prefer the full HTTPS URL for the link.
