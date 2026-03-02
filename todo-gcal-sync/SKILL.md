---
name: todo-gcal-sync
description: EOD batch sync — creates GCal events for all open todos without one, deletes events for completed todos. Triggers: "Sync todos to GCal", "EOD sync", "GCal sync".
---

## Context
This skill performs a full sync between the vault's todo lists and Google Calendar.
It creates GCal events for open todos that have no mapping, and deletes events for todos that have been completed.
Run this at end of day, or any time you want to ensure GCal reflects the current vault state.

## State File
`001-Inbox/.todo-gcal-map.json` maps `"{raw_date}|{description}"` keys to GCal event IDs.
- `raw_date`: date string WITHOUT brackets (e.g., `2026-03-01` or `2026-03-04 12:00`), or empty string `""` for undated todos
- `description`: the task description text excluding the date bracket
- Create as `{}` if the file does not exist OR contains invalid JSON

**Key sanitization**: if `description` contains a pipe character `|`, replace all occurrences with a space before forming the key. Apply this same replacement when constructing keys for any map lookup.

## Workflow

1. **Read todo files**

   Read both files in full:
   - `001-Inbox/Todo List.md`
   - `001-Inbox/Work Todo List.md`

   From `Todo List.md`, collect lines matching:
   - `- [ ] ...` → open todo
   - `- [x] ...` → completed todo

   From `Work Todo List.md`, collect table rows where the status cell is `[ ]` (open) or `[x]` (completed). Ignore header rows and separator lines.

   For each collected line, parse into:
   - `raw_date`: for Todo List lines, extract date from inside `[...]` brackets (strip brackets). For Work Todo table rows, extract from the "Due Date" column. Empty string if absent.
   - `description`: text after the date bracket (or full task text if no bracket). For Work Todo table rows, use the Task column value (the second column, position 2).
   - `full_line`: the complete original line as it appears in the file
   - `key`: `"{raw_date}|{description}"`

2. **Load state**

   Read `001-Inbox/.todo-gcal-map.json`.
   If missing or invalid JSON, start with `{}`.

3. **Create missing events**

   For each open todo where `key` has NO entry in the map:

   a. **Classify** (read the description and apply judgment):
      - Has `HH:MM` in `raw_date` → timed event at that time, 30-min duration, title: `{description}`
      - Description implies appointment, commitment, or scheduled work block (e.g., "resume X", "grade", "meeting", "outing", "call", "session") → timed event at 20:00 SGT, 30-min duration, title: `{description}`
        > Tiebreaker: if uncertain whether something is a commitment or a chore, prefer all-day `[R]` unless there is an external party involved or an explicit time expectation.
      - Personal chore, errand, research, admin, reminder → all-day event on due date (or today if `raw_date` is empty), title: `[R] {description}`
      - **Work Todo exception**: if the todo came from `Work Todo List.md` AND `raw_date` is empty (no Due Date), skip GCal creation entirely for that row. Engineering backlog items without a date should not land in GCal.

   b. **Create** using `gcal_create_event`:
      - `calendarId`: `kiriketsuki@gmail.com`
      - `sendUpdates`: `none`
      - Timed: `start.dateTime` and `end.dateTime` in RFC3339 with `+08:00` (e.g., `2026-03-04T20:00:00+08:00`)
      - All-day: `start.date` and `end.date` both set to `YYYY-MM-DD` (same date, GCal treats as inclusive single day)
      - `event.description`: `Vault todo: {full_line}`
      - The returned event ID is the `id` field of the created event resource

   c. **Record**: add `key: event_id` to the map. Only record on successful creation — skip map write if `gcal_create_event` fails.

   d. **Track**: increment a `created_count` counter.

4. **Delete completed events**

   Completed todos with no entry in the map are ignored — there is nothing to delete.

   For each completed todo where `key` HAS an entry in the map:

   a. Call `gcal_delete_event(calendarId="kiriketsuki@gmail.com", eventId=map[key])`
   b. Remove `key` from the map regardless of whether the delete succeeded (the event may already be gone)
   c. Increment a `deleted_count` counter

5. **Save state**

   Write the updated map back to `001-Inbox/.todo-gcal-map.json`.
   Do not stage or commit this file — it is listed in `.gitignore`.

6. **Report**

   Print a summary to the user:
   ```
   GCal sync complete.
   Created: {created_count} events
   Deleted: {deleted_count} events
   ```
   If any `gcal_create_event` calls failed, list the failed todo descriptions and their errors below the summary.

## Classification Reference

| Condition | Type | Title | Start |
|:---|:---|:---|:---|
| `HH:MM` in `raw_date` | Timed event, 30 min | `{description}` | `raw_date` time at `+08:00` |
| Appointment/commitment language | Timed event, 30 min | `{description}` | 20:00 `+08:00` on due date (or today) |
| Chore/errand/research/admin | All-day | `[R] {description}` | `raw_date` date (or today if empty) |

Tiebreaker: if uncertain whether something is a commitment or a chore, prefer all-day `[R]` unless there is an external party involved or an explicit time expectation.

## Error Handling
- If `gcal_create_event` fails for a specific todo, log the failure and continue with the rest — do not abort the sync.
- If `gcal_delete_event` fails, remove the key from the map anyway (the event is likely already gone) and continue.
- Always save the map at the end, even on partial failure.
- Never abort the sync due to a single event error.

## Guidelines
- Process both todo files in a single run.
- Do not re-create events for open todos that already have a map entry (the map entry is the idempotency guard).
- Respect the strict Emoji Mandate (no emojis anywhere).
- Do not stage or commit `001-Inbox/.todo-gcal-map.json`.
