---
name: daily-summarizer
description: Use when the user asks to summarize a day's activities in the daily note. Triggers: "Summarize today", "Update summary", "Summarize yesterday".
---

# Daily Summarizer

## Overview

This skill synthesizes the content of a daily note (e.g., `2026-02-16.md`) into a concise, high-level summary paragraph. It is designed to help the user quickly recall the "vibe" and major achievements of a day without reading the entire log.

## Workflow

1.  **Identify the Target Note**:
    -   If the user specifies a date (e.g., "Summarize yesterday"), locate the corresponding file in `500-Chronological-Logs/510-Personal/YYYY/`.
    -   If no date is specified, default to **today's daily note**.
    -   Use `glob` or `grep_search` if the path is ambiguous.

2.  **Read the Note Content**:
    -   Use `read_file` to get the full content of the daily note.

3.  **Synthesize the Summary**:
    -   Analyze the following sections (if present):
        -   `## Active Focus (Pending)` / `## Daily Focus`
        -   `## Key Objectives (Major Projects)`
        -   `## Technical Notes & Snippets`
        -   `## Ramblings`
        -   `## Reflections`
        -   `## Meetings`
    -   **Drafting Guidelines**:
        -   **Tone**: Personal, professional, reflective. Use "I".
        -   **Length**: 1 concise paragraph (3-5 sentences).
        -   **Content**: Focus on *achievements*, *blockers*, and *significant events*. Do not just list tasks. Group related tasks into themes (e.g., "Focused on the backend migration..." instead of listing 5 backend tasks).
        -   **Personal Life**: Mention key personal events from `Ramblings` (e.g., "Went to the gym", "Bought X") if they are significant, but keep it brief.
        -   **Reflections**: Incorporate the core sentiment from `Reflections`.

4.  **Update the Note**:
    -   Use `replace` to insert the synthesized paragraph into the `## Summary` section.
    -   **Target**: The text immediately following `## Summary` and before the next header (usually `## Active Focus`).
    -   **Safety**: Ensure you do not overwrite the `## Active Focus` header.

## Example Output

> **Summary**
> Today was a heavy deep-work day focused on the [[AutoConnect]] backend migration. I successfully refactored the data layer to support PostgreSQL but hit some friction with the legacy FMS polling logic. On the personal front, I managed to get the angbao lantern done for the in-laws. Feeling productive but tired.

## Error Handling

-   If the `## Summary` section does not exist, **create it** at the top of the file (after the frontmatter and Table of Contents, if present).
-   If the file is empty or missing content, inform the user and ask if they want to run a different skill (like `daily-journal`) first.
