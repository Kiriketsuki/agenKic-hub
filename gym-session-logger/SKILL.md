---
name: gym-session-logger
description: Use when the user describes a completed gym session in natural language. Creates an individual per-day session note and links it from today's daily note. Triggers: "Just did [split] day", "Gym done", "Finished training", "Log my workout", "Hit [exercise] today".
---

## Context

Triggered when the user describes a completed gym session, either in detail ("hit 3 sets bench at 60kg") or loosely ("push day done"). Creates a standalone session note per day under `600-Interests/Health-and-Gym/Sessions/` and writes a brief summary entry into the daily note. Jovian runs a custom **PPL UL split**: Push, Pull, Legs, Upper, Lower.

## Source Locations

- User Prompt
- `001-Inbox/Scratch Book.md` (if described in a rambling)

## Workflow

1. **Parse**: Extract from the user's message:
   - **Date**: Today's date unless specified otherwise.
   - **Session type / split label**: Must be one of `Push`, `Pull`, `Legs`, `Upper`, `Lower`. Infer from exercises if not stated explicitly (e.g., bench + OHP + triceps = Push; squat + RDL + leg press = Legs). If ambiguous, ask.
   - **Exercises**: For each exercise mentioned, extract:
     - Name (normalise casing: "Bench Press", "Lat Pulldown", "Romanian Deadlift")
     - Sets x Reps x Weight (kg). If only partial info given (e.g., "3 sets bench at 60kg"), note reps as `—` rather than guessing.
     - Any RPE or effort comment ("felt easy", "near failure", "grinded it out")
   - **Duration** (if mentioned).
   - **General notes**: fatigue, pump, mood, injuries, skipped exercises.

2. **Create session note**:
   - File path: `600-Interests/Health-and-Gym/Sessions/YYYY-MMM-DD - [Split].md` (e.g., `2026-Mar-07 - Push.md`)
   - If a file already exists for today's split (same session repeated), append to it rather than creating a duplicate.
   - Use this structure:

     ```markdown
     ---
     title: "YYYY-MMM-DD - [Split]"
     type: resource
     status: completed
     tags:
       - personal/gym
       - personal/health
       - gym/[split-lowercase]
     ---

     ## Session Info

     | Field | Value |
     |:---|:---|
     | Date | YYYY-MM-DD |
     | Split | [Split] |
     | Duration | [X min / —] |

     ## Exercises

     | Exercise | Sets | Reps | Weight (kg) | Notes |
     |:---|:---|:---|:---|:---|
     | [Exercise] | [N] | [N or —] | [N or —] | [notes] |

     ## Session Notes

     [General feel, fatigue, pump, injuries, skipped exercises, or "None."]

     ## Related

     - [[MMM-DD]] (daily note)
     - [[Gym Dashboard]]

     ---
     *Authored by: Clault KiperS 4.6*
     ```

3. **Update daily note**:
   - Resolve today's daily note: `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md`.
   - Read the file. Locate `## Health & Nutrition`.
   - Append a brief `### Gym Session` entry linking to the session note:
     ```
     ### Gym Session — [Split]

     See [[YYYY-MMM-DD - [Split]]] for full log.
     [One-line summary: "X exercises, ~Y min, felt Z."]
     ```
   - If `## Health & Nutrition` does not yet exist in the daily note, create it before `## Reflections` and add it to the Table of Contents callout.

4. **Check for PRs**: Scan the parsed exercises. If a weight appears notably high for that exercise (use the PR Tracker at `600-Interests/Health-and-Gym/PRs and Milestones.md` as reference if it exists), flag it to the user: "Possible PR on [Exercise] — run `Log PR` to record it formally."

5. **Confirm**: Reply with the session split, exercises logged, file created, and whether a PR was flagged.

## Naming Convention

- Session notes: `600-Interests/Health-and-Gym/Sessions/YYYY-MMM-DD - [Split].md`
  - Split label is exactly one of: `Push`, `Pull`, `Legs`, `Upper`, `Lower`
  - Example: `2026-Mar-07 - Push.md`, `2026-Mar-08 - Pull.md`

## Guidelines

- No emojis.
- Never guess weights or reps that were not provided — use `—` for unknown values.
- If the user gives only a loose description ("push day, went well"), create the session note with split and notes but leave the Exercises table empty rather than fabricating rows.
- Do not open a GCal event for gym sessions.
- PR detection in step 4 is best-effort. Do not make network calls to verify.
- Always include the `## Related` section linking back to the daily note and Gym Dashboard.
- Authorship attribution (`*Authored by: Clault KiperS 4.6*`) applies to session notes as they are standalone files.
