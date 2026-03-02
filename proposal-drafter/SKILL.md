---
name: proposal-drafter
description: Use when the user wants to draft a formal Proposal note from a raw idea, rambling, or direct input. Triggers: "Draft a proposal for [topic]", "Turn this into a proposal".
---

## Context
This skill is triggered when the user says "Draft a proposal for [topic]", "Turn this into a proposal", or "Write up [topic] for management".
It produces a formal Proposal note from ramblings, existing Idea notes, or direct user input.

## Source Locations (when extracting from ramblings)
- `001-Inbox/Scratch Book.md` under `## Ramblings`
- `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md` under `## Ramblings` or `## Technical Notes & Snippets`
- Existing `idea` notes (type: idea) referenced by the user

## Workflow
1. **Gather Context**: Read the source material. If the source is an Idea note, use its `## Problem / Opportunity` and `## Vision` sections as the foundation.
2. **Determine Scope**: Ask the user (or infer) which Repo/Project the proposal relates to. This determines the `parent` property and file location.
3. **Draft**: Generate a new note using the `Proposal Template` from `000-System/Templates/Proposal Template.md`:
   - `title`: Formal title (e.g., "Autonomous Fleet Architecture Modernization").
   - `type`: `proposal`
   - `status`: `draft`
   - `org`: Infer from parent context (e.g., `Aurrigo`, `NP`).
   - `parent`: Wikilink to the relevant Repo or Project note.
   - `tags`: Include `proposal` plus relevant org/tech tags.
   - Fill in sections:
     - `## 1. Executive Summary`: Distill the core pitch into one paragraph.
     - `## 2. Current State`: Describe the problem or limitation.
     - `## 3. Proposed Solution`: High-level approach. Include a Mermaid diagram if the source material has architectural details.
     - `## 4. Scope and Deliverables`: Extract concrete deliverables.
     - `## 5. Resource and Risk Assessment`: Flag risks if identifiable, otherwise leave for user.
     - `## 6. Execution Phases`: Break into phases from source material.
     - `## 7. Decision`: Leave as Pending for management.
4. **Place**: Save the new note as `[Name] - Proposal.md` inside the relevant `[RepoName] - Repo` or `[ProjectName] - Project` folder.
5. **Link Back**: If the source was an Idea note, update the Idea with `promotedTo: "[[Name - Proposal]]"` and set `status: completed`. Add `related: - "[[Name - Idea]]"` to the Proposal.
6. **Clean Source**: If extracted from Ramblings, strike through and replace:
   `- [x] [YYYY-MM-DD] Drafted as [[Name - Proposal]]`
7. **Log**: Append to current Daily Note under `## Daily Focus`:
   `- [x] Drafted proposal: [[Name - Proposal]]`

## Guidelines
- Proposals are formal documents. Use professional language, not casual shorthand.
- Always include at least a skeleton Mermaid diagram in `## 3. Proposed Solution` if the topic is architectural.
- The `## 7. Decision` section must always start as `Status: Pending`. Never pre-fill an outcome.
- If the user provides a rambling that is too informal for a proposal, suggest using the `idea-extractor` skill first, then promoting.
- Respect the Emoji Mandate: no emojis in generated notes.
- Ensure all frontmatter conforms to the schema in [[Vault Guide]].
