---
name: inbox-capture
description: Use when the user wants to capture a quick thought or note into the vault inbox without organizing it. Triggers: "Capture [thought]", "Inbox [thought]", "Note this".
---

## Context
Appends a raw thought, task, or note directly to the vault inbox without organizing it.

## Triggers
- "Capture [thought]", "Inbox [thought]", "Note this: [thought]"

## Workflow
1. Append a new bullet to `## Quick Captures (Unprocessed)` in `001-Inbox/Scratch Book.md`:
   - Format: `- [ ] [YYYY-MM-DD] [Thought as written]`
2. Confirm: "Captured."

## Guidelines
- Capture verbatim. Do not rewrite, clean up, or organize the thought.
- Do not create new files or templates from a raw capture.
- To process captures, use the `core-organizer` skill.
