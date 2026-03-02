---
name: todo-capture
description: Use when the user wants to add a lightweight task or reminder to the Todo List. Triggers: "Add todo", "Remind me to...", "New task for...".
---

## Context
This skill is triggered when the user says "Add todo", "Remind me to...", "New task for...", or implies a small, actionable item.
It captures lightweight tasks directly into `001-Inbox/Todo List.md` (personal/academic) or `001-Inbox/Work Todo List.md` (Aurrigo engineering only).

## Source Locations
- User Prompt
- `001-Inbox/Scratch Book.md` (Quick Captures)

## Workflow

1. **Parse**: Extract the task description and any date/time reference (e.g., "tomorrow", "next Friday").
   - If no date is given, default to no date (Backlog/Quick Win).
   - If "today" is implied, use today's date.
   - If a specific date is found, calculate `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` if a time is specified.

2. **Route**: Determine the correct file per AGENTS.md inbox routing rules.
   - Aurrigo engineering work → `001-Inbox/Work Todo List.md`
   - Everything else → `001-Inbox/Todo List.md`

   > **Note for Work Todo List entries**: Work todos are appended as table rows with a "Due Date" column rather than inline `[YYYY-MM-DD]` brackets. For GCal sync in step 6, extract `raw_date` from the table's "Due Date" column value instead of a bracket. For `event.description`, use the full table row as `{full line}`.

3. **Categorize** (Todo List.md only):
   - **High Priority (Do Today)**: Tasks due today or marked "urgent".
   - **Upcoming (Scheduled)**: Tasks due tomorrow or on a specific future date.
   - **Quick Wins (Do Anytime)**: Short, easy tasks with no hard deadline.
   - **Backlog**: Low priority or "someday" items.

4. **Format**: Construct the todo item:
   `- [ ] [YYYY-MM-DD] Description` (or `- [ ] [YYYY-MM-DD HH:MM] Description` if timed, or `- [ ] Description` if no date).

5. **Append**: Add the line to the corresponding section. Read the file first to find the correct section header.

6. **GCal Sync**: Create a Google Calendar event for the todo.

   a. **Classify** the todo — read the description and apply judgment:
      - Has `HH:MM` in the date → **timed event** at that exact time, 30-min duration, title: `{description}`
      - Description implies an appointment, commitment, or scheduled work block (e.g., "resume X", "grade", "meeting", "outing", "call", "session") → **timed event at 20:00 SGT**, 30-min duration, title: `{description}`
      - Personal chore, errand, research, admin, reminder → **all-day event** on due date (or today if undated), title: `[R] {description}`

   b. **Create event** using `gcal_create_event`:
      - `calendarId`: `kiriketsuki@gmail.com`
      - `sendUpdates`: `none`
      - For timed events: `start.dateTime` and `end.dateTime` in RFC3339 with `+08:00` (e.g., `2026-03-04T20:00:00+08:00`)
      - For all-day events: `start.date` and `end.date` both set to the same `YYYY-MM-DD` string (GCal treats single-day all-day as inclusive)
      - `event.description`: `Vault todo: {full original todo line}`
      - The returned event ID is the `id` field of the created event resource in the response.
      - If `gcal_create_event` fails, skip step 6c entirely (do not write to the map) and proceed to step 7. The failure will be reported there.

   c. **Record mapping**: Read `001-Inbox/.todo-gcal-map.json` (create `{}` if the file does not exist OR if the file exists but contains invalid JSON — in either case, proceed with an empty map). Before creating the event, check if the key `"{raw_date}|{description}"` already exists in the map. If it does, skip GCal creation and notify the user: "Todo added to vault. GCal event already exists for this todo (skipped duplicate)." Add one entry only if the key is not already present:
      ```
      "{raw_date}|{description}": "{returned_event_id}"
      ```
      where `raw_date` is the date string extracted from inside the brackets — the content between `[` and `]`, without the brackets themselves. If no date bracket exists, use an empty string. Example: todo line `- [ ] [2026-03-01] Make red packet` → key is `"2026-03-01|Make red packet"`. The `description` is the task description text (excluding the bracket). Only write the map entry if `gcal_create_event` succeeds and returns an event ID. On failure, do not write anything to the map. Write the updated JSON back to the file.

7. **Log**: Confirm both the todo addition and the GCal event creation to the user in a single message.
   - If `gcal_create_event` fails, still confirm the todo write and note the GCal failure separately — do not block the todo capture on a GCal error.

## State File Format

`001-Inbox/.todo-gcal-map.json` (not committed to git):
```json
{
  "2026-03-01|Make custom red packet": "gcal_event_id_abc",
  "2026-03-04 12:00|Finish grades spreadsheet": "gcal_event_id_xyz",
  "|Find Chris birthday": "gcal_event_id_undated"
}
```

## Guidelines
- Do not create a full `Task` note for these items. Use `task-scaffolder` for project-level work.
- Respect the strict Emoji Mandate (no emojis anywhere — not in notes, file names, or messages).
- Keep descriptions concise.
