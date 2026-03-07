---
name: nutrition-logger
description: Use when the user logs a meal, snack, or daily nutrition summary to the Health & Nutrition section of today's daily note. Triggers: "Log meal", "Had [food] for [meal]", "Nutrition log", "Ate [food]", "Log nutrition".
---

## Context

Triggered when the user wants to log what they ate — a single meal, a full day's meals, or an estimated protein total. Updates the `## Health & Nutrition` section of today's daily note. Does not create separate nutrition files; all data lives in the daily note. Aware of Jovian's active targets: ~2,400–2,500 kcal/day, protein floor 152g (1.6g/kg at 95kg), sweet spot 171g (1.8g/kg), on Retatrutide (appetite suppression expected).

## Source Locations

- User Prompt
- `001-Inbox/Scratch Book.md` (if meal was mentioned in ramblings)

## Workflow

1. **Parse**: Extract from the user's message:
   - **Meal slot**: Breakfast, Lunch, Dinner, Snack (infer from context or time of day if ambiguous).
   - **Foods**: List of items consumed.
   - **Protein estimate** (if the user provides it, or if it can be reasonably inferred from common foods — e.g., 1 scoop whey = ~25g, 1 protein bar = ~20g, 100g chicken breast = ~31g). Mark inferred values as estimated with a `~` prefix.
   - **Calorie estimate** (if provided by the user — do not fabricate if not given).
   - **Appetite notes**: Any comment on hunger level, reta effect, eating difficulty.

2. **Resolve daily note**: `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md`.
   - Read the file.

3. **Update `## Health & Nutrition`**:
   - If the section does not yet exist, create it after `## Ramblings` and before `## Reflections`, and add it to the Table of Contents callout.
   - Locate the meal table. If the table does not yet exist in the section, create it:
     ```
     | Meal | Food | Est. Protein |
     |:---|:---|:---|
     | Breakfast | | |
     | Lunch | | |
     | Dinner | | |
     | Snacks | | |
     ```
   - Fill in or update the relevant meal row(s) with the food description and estimated protein.
   - If a row for the meal slot already has data, append to it rather than overwrite: e.g., "Chicken rice, protein bar".

4. **Update protein summary**: Find the `**Estimated protein:**` line.
   - Sum all estimated protein values visible in the meal table.
   - Update the line: `**Estimated protein: ~[total]g** (body weight: 95 kg)`
   - If the total is below 152g, append a shortfall note: `- Shortfall: ~[gap]g below floor.`
   - If the total is between 152g and 171g, append: `- At floor. Push toward 171g if appetite allows.`
   - If the total is 171g or above, append: `- Target met.`

5. **Appetite / reta note**: If the user mentions appetite suppression, low hunger, or inability to finish a meal, prepend a one-line prose note at the top of `## Health & Nutrition` (before the table). Keep it brief. Example: "Appetite suppressed -- reta effect; struggled to finish lunch."

6. **Confirm**: Reply with the meal(s) logged, estimated protein total, and a one-line note if the floor target is at risk.

## Naming Convention

No separate files. All nutrition data lives in the daily note at `500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md`.

## Guidelines

- No emojis.
- Never fabricate calorie counts. Only log calories if the user provides them or they are available on a known product label (protein bar, shake).
- Protein estimates from common Singaporean foods are acceptable and encouraged: chicken rice ~35g protein, cai png with 2 meats ~30g, roti prata (plain) ~4g, kopi-o ~0g. Mark all estimates with `~`.
- If the user logs a full day at once (all three meals), update all rows in one pass.
- Reta suppression context: low-intake days are expected. Do not flag them as problems unless protein floor is also missed. Always remind of protein priority on suppressed-appetite days.
- Do not create GCal events for meals.
