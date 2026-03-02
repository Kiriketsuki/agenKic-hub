---
name: core-reviewer
description: Use when bridging an organized Scratch Book TODO item to a GitHub issue. Called automatically after core-organizer.
---

## Context
Creates a GitHub Issue from an Organized TODO item. Called automatically after core-organizer.

## Workflow
1. Identify a TODO item from `## Organized TODOs`.
2. Use run_shell_command with the GitHub CLI and capture the URL:
   `gh issue create --title "<TODO_TITLE>" --body "<TODO_DETAILS>"`
3. Move the item to the `## Pushed to GitHub` section in the Scratch Book.
4. **External Link**: Format the item with a direct markdown link:
   `- [x] [YYYY-MM-DD] <TODO_TITLE>. [GitHub Issue](<ISSUE_URL>)`

## Guidelines
- Ensure `gh auth status` is valid before attempting.
- If no repository is specified, use the current vault repository.
