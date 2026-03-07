---
name: body-metrics-logger
description: Use when the user logs a body weight reading, body measurement, or body composition metric. Updates the persistent body metrics log and today's daily note. Triggers: "Log weight", "Weighed in at", "Body weight today", "Waist is [X]cm", "Log measurements", "Body fat [X]%".
---

## Context

Triggered when the user provides a body weight reading, a tape measurement (waist, chest, arms, etc.), or a body composition figure (body fat %). Maintains a persistent log at `600-Interests/Health-and-Gym/Body Metrics Log.md` and updates today's daily note. Aware of Jovian's current context: starting weight 94.5kg (Mar 2026), goal 75kg by Nov 2026, primary metric is scale weight cross-referenced with trend.

## Source Locations

- User Prompt

## Workflow

1. **Parse**: Extract from the user's message:
   - **Date**: Today unless specified (e.g., "this morning" = today, "yesterday" = yesterday).
   - **Body weight** (kg) if provided.
   - **Body measurements** (cm) if provided: waist, chest, left arm, right arm, left thigh, right thigh, hips. Accept whichever are given — all are optional.
   - **Body fat %** if provided (from a scale, DEXA, or calipers — note the source method).
   - **Measurement conditions**: morning / evening, fasted / fed, post-workout / rest day. Infer from context if possible; otherwise leave blank.
   - **Notes**: any relevant context (bloated, water retention suspected, menstrual cycle n/a, etc.).

2. **Update Body Metrics Log**:
   - Read `600-Interests/Health-and-Gym/Body Metrics Log.md`.
   - If the file does not exist, create it (see Naming Convention).
   - Append a new row to the `## Weight Log` table if weight was provided:
     ```
     | [YYYY-MM-DD] | [Weight kg] | [Conditions] | [Notes] |
     ```
   - If measurements were provided, append a row to the `## Measurements Log` table:
     ```
     | [YYYY-MM-DD] | [Waist] | [Chest] | [L Arm] | [R Arm] | [L Thigh] | [R Thigh] | [Hips] | [BF%] | [Source] | [Notes] |
     ```
   - Use `—` for any measurement column that was not provided.

3. **Calculate delta**: Compare the new weight against the most recent previous weight row. Compute delta: `+X.Xkg` or `-X.Xkg`. If no previous row exists, delta = `—`.

4. **Update daily note**:
   - Resolve today's daily note: `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md`.
   - Read the file. Locate `## Health & Nutrition`.
   - If the section does not yet exist, create it after `## Ramblings` and before `## Reflections`, and add it to the Table of Contents callout.
   - Append or update a `### Body Metrics` subsection:
     ```
     ### Body Metrics ([Date])

     - **Weight**: [X]kg ([delta] vs previous reading) — [conditions]
     - **Waist**: [X]cm (if provided)
     - **Body Fat**: [X]% via [source] (if provided)
     - [any other measurements provided]
     ```

5. **Goal gap check**: Calculate distance to 75kg goal. Append one line to the daily note metrics block:
   ```
   - **To goal (75kg)**: [X]kg remaining
   ```

6. **Trend flag** (only if 3 or more weight rows exist in the log): Read the last 3 weight entries. If all three show the same direction (all decreasing or all increasing), note the trend inline: "3-reading trend: [down/up]." If flat (all within 0.3kg), note: "3-reading trend: flat."

7. **Confirm**: Reply with weight logged, delta, trend flag (if applicable), and distance to goal.

## Naming Convention

- Body metrics log: `600-Interests/Health-and-Gym/Body Metrics Log.md`

### Initial structure for `Body Metrics Log.md` (create only if file does not exist):

```markdown
---
title: Body Metrics Log
type: resource
status: active
tags:
  - personal/health
  - personal/gym
---

## Weight Log

| Date | Weight (kg) | Conditions | Notes |
|:---|:---|:---|:---|

## Measurements Log

| Date | Waist (cm) | Chest (cm) | L Arm (cm) | R Arm (cm) | L Thigh (cm) | R Thigh (cm) | Hips (cm) | BF% | Source | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
```

## Guidelines

- No emojis.
- Never calculate or display a calorie target, TDEE, or macro recommendation in this skill. Those belong in nutrition-logger and weekly-health-checkin.
- Always note measurement conditions (fasted/fed, time of day) when available — scale weight fluctuates 1-3kg intraday, and consistent conditions are essential for meaningful trend tracking.
- Body fat % from consumer scales (bioelectrical impedance) is unreliable in absolute terms. If BF% is from a scale, note source as `BIA scale`. Never present it as accurate; it is a trend indicator only.
- Do not alert on single-day weight spikes (water retention is normal). The 3-reading trend flag in step 6 provides appropriate signal without overreaction.
- Log entries are append-only. Never edit or delete previous rows.
- Authorship attribution does not apply to log rows — only to standalone notes.
