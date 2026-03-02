---
name: idea-extractor
description: Use when the user wants to extract structured Idea notes from vault ramblings. Triggers: "Extract ideas", "Process ramblings", "Turn this into an Idea note".
---

## Context
This skill is triggered when the user says "Extract ideas", "Process ramblings", or "Turn this into an Idea note".
It scans `## Ramblings` sections in Daily Notes or the Scratch Book and produces structured Idea notes.

## Source Locations
- `001-Inbox/Scratch Book.md` under `## Ramblings`
- `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md` under `## Ramblings`

## Workflow
1. **Scan**: Read the target `## Ramblings` section. Identify distinct thoughts that represent a personal brainstorm, side-project spark, or "what if" concept.
2. **Classify**: For each candidate, determine if it is best suited as an `idea`, `proposal`, `task`, or `feature`. If unclear, default to `idea`. If the thought references management approval, budgets, or cross-team coordination, flag it as a potential `proposal` and suggest using the `proposal-drafter` skill instead.
3. **Draft**: For each `idea` candidate, generate a new note using the `Idea Template` from `000-System/Templates/Idea Template.md`:
   - `title`: Concise name derived from the rambling.
   - `type`: `idea`
   - `status`: `draft`
   - `tags`: Infer from context (e.g., `personal`, `work/aurrigo`, `tech/python`).
   - Fill in `## Problem / Opportunity` and `## Vision` from the rambling text.
   - Leave `## Promotion Criteria` with a sensible default or blank for user review.
4. **Place**: Save the new note as `[Name] - Idea.md` in the appropriate folder:
   - Unclassified ideas: `001-Inbox/`
   - Validated / Planned ideas: `100-Projects/120-Planning/`
   - Experimental ideas: `100-Projects/130-Slow-Burn/Experiments/`
5. **Clean**: Strike through or remove the processed rambling from the source section. Add a wikilink to the new Idea note in its place:
   `- [x] [YYYY-MM-DD] Extracted to [[Name - Idea]]`
6. **Log**: Append an entry to the current Daily Note under `## Daily Focus`:
   `- [x] Extracted idea: [[Name - Idea]]`

## Guidelines
- Always confirm with the user before creating notes if more than 3 ideas are detected in a single pass.
- Never discard ramblings silently. Everything must be either extracted or left in place.
- If a rambling is too vague to form an Idea, leave it in Ramblings and append a comment: `<!-- Too vague to extract. Revisit. -->`
- Respect the Emoji Mandate: no emojis in generated notes.
- Ensure all frontmatter conforms to the schema in [[Vault Guide]].
