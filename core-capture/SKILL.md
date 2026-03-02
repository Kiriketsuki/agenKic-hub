---
name: core-capture
description: Use when the user says "Capture [thought]" or "Inbox [thought]" to append a raw idea to the vault Scratch Book inbox.
---

## Context
Triggered when the user says "Capture [thought]" or "Inbox [thought]". Appends the raw thought to the Quick Captures section in the Scratch Book without organizing it.

## Workflow
1. Append to `## Quick Captures (Unprocessed)` in `001-Inbox/Scratch Book.md`:
   - Format: `- [ ] [YYYY-MM-DD] [Thought Description]`
2. Confirm capture to the user.

## Guidelines
- Capture verbatim. Do not rewrite, structure, or organize the thought.
- Graduation: when the user runs `core-organizer`, these items are moved to `## Organized TODOs`.
