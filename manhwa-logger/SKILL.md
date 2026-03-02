---
name: manhwa-logger
description: Use when the user mentions a manhwa, webtoon, or manga to log or update reading progress. Triggers: "Log manhwa [title]", "Reading [title]", "Finished [title] (manhwa)".
---

## Context
This skill is triggered when the user mentions a manhwa/webtoon/manga they are reading or want to log.
Triggers: "Log manhwa [title]", "New manhwa [title]", "Reading [title]", "Finished [title] (manhwa)"

## Source Locations
- User Prompt
- `001-Inbox/Scratch Book.md` (if mentioned in ramblings)
- `500-Chronological-Logs/` Daily Notes (if mentioned in ramblings or summary)

## Workflow
1. **Check**: Search `600-Interests/Manhwa/` for an existing note matching the title.
   - If found, proceed to step 4 (Update).
   - If not found, proceed to step 2 (Research).

2. **Research**: Use WebSearch to find:
   - Official synopsis / plot summary
   - Writer and artist names
   - Platform (KakaoPage, Naver, Tapas, Webtoon, etc.)
   - Genres
   - Chapter count and season breakdown (if applicable)
   - Status (ongoing / completed / hiatus)

3. **Create**: Generate a new note using this structure:
   ```yaml
   ---
   title: "[Title]"
   type: resource
   status: active
   tags:
     - personal/manhwa
     - personal/entertainment
   ---
   ```

   Sections:
   - `## Overview`: 2-3 sentence summary with writer/artist credits and platform link
   - `## Synopsis`: Plot summary (spoiler-free unless user requests otherwise)
   - `## Details`: Table with Writer, Artist, Platform, Genres, Status, Chapters
   - `## Seasons` (if applicable): Table with season number, chapter range, brief notes
   - `## Reading Log`: Timestamped entries (YYYY-MM-DD: status/note)
   - `## Notes`: Wikilink to daily note where it was first mentioned

4. **Update** (existing note):
   - Add a new entry to `## Reading Log` with today's date and the user's update
   - Update chapter count or status if the user provides new information
   - Update the `status` frontmatter field if the user says they finished it (`completed`) or dropped it (`archived`)

5. **Link**:
   - Add a wikilink to the manhwa note in today's daily note summary or ramblings
   - Format: `[[Title]]` inline where it was mentioned

## Naming Convention
- File: `600-Interests/Manhwa/[Title].md` (Title Case, no suffix)

## Guidelines
- Respect the Emoji Mandate: no emojis.
- Keep synopses spoiler-free by default. Only include spoilers if the user explicitly requests them.
- If the user mentions multiple manhwa in one message, create/update a note for each.
- If the user rates or reviews a manhwa, add it under `## Notes`.
