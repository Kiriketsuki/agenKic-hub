---
name: pb-tracker
description: Use when the user logs a new personal best (PB) on a lift. Records the PB to the persistent PB log and links it from the daily note. Triggers: "New PB", "Log PB", "Hit a new [exercise] PB", "PB on [exercise]", "New personal best".
---

## Context

Triggered when the user explicitly states or the gym-session-logger flags a new personal best on a lift. PBs are maintained in a single persistent file (`600-Interests/Health-and-Gym/PBs and Milestones.md`) organised by exercise. Each PB entry records the weight, reps, date, and any context (belt, pause, spotter, estimated 1RM).

## Source Locations

- User Prompt
- `gym-session-logger` output (when it flags a possible PB)

## Workflow

1. **Parse**: Extract from the user's message or the gym-session-logger flag:
   - **Exercise name** (normalise: "Machine Hack Squat", "45° Incline Dumbbell Press", "Seated Cable Row", etc.)
   - **Weight (kg)**
   - **Reps** performed at that weight
   - **Estimated 1RM** — calculate using Epley formula: `weight * (1 + reps / 30)`. Round to nearest 0.5 kg. If reps = 1, e1RM = weight exactly.
   - **Date** (today unless specified)
   - **Context notes**: machine setting, equipment, how it felt, etc.

2. **Read PB log**: Read `600-Interests/Health-and-Gym/PBs and Milestones.md`.
   - If the file does not exist, create it (see Naming Convention below).

3. **Check previous best**: Find the exercise section in the PB log. Compare the new e1RM against the most recent row for that exercise.
   - If the new e1RM exceeds the previous best e1RM, it is a confirmed PB.
   - If the new e1RM is equal to or lower than a previous entry, inform the user: "This does not exceed your recorded best for [Exercise] (previous best: [weight]kg x [reps] = e1RM [X]kg). Log anyway?" — proceed only if confirmed.

4. **Update PB log**:
   - Locate the `### [Exercise]` subsection. If none exists for this exercise, create it under the appropriate `## [Category]` heading.
   - Append a new row to the exercise table:
     ```
     | [YYYY-MM-DD] | [Weight]kg | [Reps] | [e1RM]kg | [Context notes] |
     ```

5. **Log to daily note**:
   - Resolve today's daily note: `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md`.
   - Locate `## Health & Nutrition`. Append a PB callout to the gym session block:
     ```
     > [!success] PB — [Exercise]
     > [Weight]kg x [Reps] reps — e1RM ~[e1RM]kg ([Date])
     ```
   - If `## Health & Nutrition` does not yet exist, create it before `## Reflections`.

6. **Confirm**: Reply with the exercise, new weight, reps, e1RM, and previous best (if one existed). State whether it is a confirmed PB or a same-tier performance.

## Naming Convention

- PB log: `600-Interests/Health-and-Gym/PBs and Milestones.md`

### Initial structure for `PBs and Milestones.md` (create only if file does not exist):

```markdown
---
title: PBs and Milestones
type: resource
status: active
tags:
  - personal/health
  - personal/gym
---

## Key Lifts

### Machine Hack Squat

| Date | Weight | Reps | e1RM | Notes |
|:---|:---|:---|:---|:---|

### 45° Incline Dumbbell Press

| Date | Weight | Reps | e1RM | Notes |
|:---|:---|:---|:---|:---|

### Seated Neutral Grip Cable Row

| Date | Weight | Reps | e1RM | Notes |
|:---|:---|:---|:---|:---|

### Seated Pin-Loaded Machine Hamstring Curl

| Date | Weight | Reps | e1RM | Notes |
|:---|:---|:---|:---|:---|

## Other Lifts

<!-- Add new exercise subsections here as needed. -->
```

## Guidelines

- No emojis.
- Always use the Epley formula for e1RM. Do not use other formulas.
- Never delete previous rows. The PB log is an append-only historical record.
- If an exercise does not fit an existing section, add it under `## Other Lifts`.
- Authorship attribution does not apply to log rows — only to standalone notes.
