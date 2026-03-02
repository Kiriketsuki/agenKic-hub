---
name: dream-logger
description: Use when the user wants to record a dream. Triggers: "I dreamt that...", "Log my dream", "Dream log".
---

## Context
This skill is triggered when the user shares a dream description (e.g., "I dreamt that...", "Log my dream: ...").
It captures the dream narrative into a structured note for future analysis.

## Source Locations
- User Prompt
- `001-Inbox/Scratch Book.md` (if a dream was captured as a rambling)

## Workflow
1. **Analyze**: Parse the user's description to extract:
   - **Date**: Usually today's date (unless specified "last night" -> verify current date).
   - **Narrative**: The core story.
   - **Characters**: People, entities, or animals.
   - **Emotions**: Feelings expressed (e.g., anxiety, joy, confusion).
   - **Symbols**: Key objects or themes (e.g., Water, Flying, Money).

2. **Draft**: Create a new note using the `Dream Entry Template` from `000-System/Templates/Dream Entry Template.md`:
   - `title`: `Dream - YYYY-MM-DD` (or `Dream - YYYY-MM-DD - Title` if distinct).
   - `type`: `dream-entry`
   - `mood`: Infer from narrative (e.g., anxious, neutral).
   - `tags`: `personal/dream` + specific themes.
   - Fill in the sections (`## Narrative`, `## Characters`, `## Emotions`, `## Symbols`).

3. **Place**: Save the new note in `700-Identity-and-Personal-Data/720-Dreams/`.

4. **Link**:
   - Add a link to the new dream entry in the daily note `500-Chronological-Logs/510-Personal/MMM-DD.md` under `## Ramblings` or a new `## Dreams` section.
   - Add a link to the project dashboard `100-Projects/120-Personal/Dream Log/Dream Log.md`.

## Guidelines
- Respect the Emoji Mandate.
- If analysis is requested, add it under `## Interpretation`.
- Maintain the user's original phrasing in the narrative.
