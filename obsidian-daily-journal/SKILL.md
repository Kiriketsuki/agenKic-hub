---
name: obsidian-daily-journal
description: Use when the user shares a fleeting thought, discovery, or reflection to categorize and log in the current day's daily note.
---

## Context
Acts as a bridge between the user's fleeting thoughts and their organized Obsidian daily log. Automatically categorizes input into the appropriate section based on content and saves it to the correct daily note path.

## Workflow
1. **Analyze Content**: Determine if the input is technical, reflective, or task-oriented.
2. **Select Heading**: Use the guidelines in [daily-note-structure.md](references/daily-note-structure.md) to choose the correct section (e.g., `## Technical Notes & Snippets`, `## Reflections`).
3. **Determine Path**: The daily note path follows the format: `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md` (e.g., for Feb 14, 2026, it is `500-Chronological-Logs/510-Personal/2026/Feb-14.md`).
4. **Log**: Use the `replace` tool to insert the new thought as a bullet point under the chosen heading in the daily note file.

## Examples

### Technical Discovery
User: "Just found out that gRPC-Web requires a proxy like Envoy to work with browser clients."
Skill Action:
1. Determine path: `500-Chronological-Logs/510-Personal/2026/Feb-14.md`
2. Use `replace` to append `- Just found out that gRPC-Web requires a proxy like Envoy to work with browser clients.` under the `## Technical Notes & Snippets` heading.

### Reflection
User: "Feeling productive today after clearing my inbox."
Skill Action:
1. Determine path: `500-Chronological-Logs/510-Personal/2026/Feb-14.md`
2. Use `replace` to append `- Feeling productive today after clearing my inbox.` under the `## Reflections` heading.

## Reference
See [daily-note-structure.md](references/daily-note-structure.md) for detailed categorization rules.
