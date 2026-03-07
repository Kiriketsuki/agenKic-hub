---
name: weekly-health-checkin
description: Use when the user wants a structured weekly health summary covering weight, nutrition, training, and reta response. Creates a dated check-in note and appends a summary row to the weekly tracker. Triggers: "Weekly check-in", "Health check-in", "How did my week go (health)", "Weekly summary".
---

## Context

Triggered once per week (typically Friday–Sunday) to produce a structured health check-in. Scans the current week's daily notes for logged nutrition, gym sessions, and health observations, then synthesises them into a check-in note and a one-row summary in the persistent weekly tracker. Aware of Jovian's context: 95kg → 75kg goal by Nov 2026, TDEE ~2,984 kcal, intake target ~2,400–2,500 kcal, protein floor 152g/day, on Retatrutide.

## Source Locations

- Daily notes for the current week: `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md` (Mon–Sun or Mon–today)
- `600-Interests/Health-and-Gym/Gym Session Log.md`
- `600-Interests/Health-and-Gym/Weekly Health Tracker.md`
- User Prompt (for weight, body measurements if provided)

## Workflow

1. **Determine date range**: Identify the current week (Monday to today, or Monday to Sunday if run retrospectively). Collect the list of daily note paths for those days.

2. **Scan daily notes**: Read each daily note in the date range. Extract from `## Health & Nutrition` sections:
   - Each day's meal table and estimated protein total.
   - Any gym session blocks (`### Gym Session`).
   - Any appetite/reta notes.
   - Any body weight mentions.

3. **Prompt for missing data** (before generating the note): Ask the user to confirm or supply:
   - **Current body weight** (kg) if not found in any daily note this week.
   - **Any body measurements updated this week** (optional: waist cm, body fat % if measured).
   - **Subjective week rating**: How did the week feel overall? (1–5 scale, or a word: poor / okay / good / great)
   - **Reta response**: Any changes in appetite pattern, side effects, dose changes.

4. **Calculate weekly stats** from the scanned data:
   - Days with gym sessions logged (count and split types).
   - Average estimated daily protein (sum of daily totals / days logged).
   - Days protein floor (152g) was met vs missed.
   - Any PRs hit this week (scan for `[!success] PR` callouts in daily notes).
   - Weight change vs previous check-in (read last row of `## Weekly Tracker` table in `Weekly Health Tracker.md`).

5. **Create check-in note**:
   - Path: `600-Interests/Health-and-Gym/Weekly Check-Ins/Week-[YYYY-Www].md` where `Www` is the ISO week number (e.g., `Week-2026-W10.md`).
   - Frontmatter:
     ```yaml
     ---
     title: "Health Check-In — Week [Www], [YYYY]"
     type: resource
     status: completed
     tags:
       - personal/health
       - personal/gym
     ---
     ```
   - Sections (in order):
     - `## Overview`: 2-3 sentences — weight, direction of travel, week feel.
     - `## Training`: Sessions count, splits done, PRs hit, missed sessions vs plan.
     - `## Nutrition`: Avg daily protein, days floor met, notable deficit/surplus days, reta appetite pattern.
     - `## Metrics`: Table with weight, body measurements if provided, target gap.
     - `## Wins and Flags`: Bullet lists — what went well, what to adjust next week.
     - `## Next Week Focus`: 2-3 concrete action items.

6. **Append to Weekly Health Tracker**: Read `600-Interests/Health-and-Gym/Weekly Health Tracker.md` (create if not exists — see Naming Convention). Append one row to the `## Weekly Tracker` table:
   ```
   | [YYYY-Www] | [Weight kg] | [Delta vs prev] | [Gym sessions] | [Avg protein g] | [Days floor met] | [Rating] |
   ```

7. **Link from daily note**: Append a wikilink to the check-in note from today's daily note `## Reflections` section:
   ```
   Weekly health check-in: [[Health Check-In — Week Www, YYYY]]
   ```

8. **Confirm**: Reply with the key numbers: weight, delta, training sessions, avg protein, and whether protein floor was consistently met.

## Naming Convention

- Check-in notes: `600-Interests/Health-and-Gym/Weekly Check-Ins/Week-[YYYY-Www].md`
- Weekly tracker: `600-Interests/Health-and-Gym/Weekly Health Tracker.md`

### Initial structure for `Weekly Health Tracker.md` (create only if file does not exist):

```markdown
---
title: Weekly Health Tracker
type: resource
status: active
tags:
  - personal/health
  - personal/gym
---

## Weekly Tracker

| Week | Weight (kg) | Delta | Gym Sessions | Avg Protein (g) | Days Floor Met | Rating |
|:---|:---|:---|:---|:---|:---|:---|
```

## Guidelines

- No emojis.
- ISO week numbers via the formula: week 1 is the week containing the first Thursday of the year. Use `date --iso-8601=date` via Bash if unsure, or calculate manually.
- If daily notes are sparse (few health sections logged), note the data gap explicitly rather than fabricating averages.
- Weight delta: always express as `+X.Xkg` or `-X.Xkg` relative to the previous check-in row. If no previous row exists, write `—`.
- Wins and Flags should be actionable and specific to this week, not generic advice. Example win: "Hit protein floor 5/7 days". Example flag: "Two blowout days (>3,500 kcal) wiped the week's deficit."
- Reta context: if appetite was suppressed this week, note it as a positive signal but flag protein floor risk.
- Check-in notes are standalone files and require authorship attribution at the end.
