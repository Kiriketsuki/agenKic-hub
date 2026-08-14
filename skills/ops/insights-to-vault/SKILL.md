---
name: insights-to-vault
description: "Archives a Claude Code Insights report into the Obsidian vault after running /insights. Use this skill immediately whenever the user says \"copy it to the vault\", \"save to vault\", \"archive the insights\", \"add it to the vault\", or any similar phrase after running /insights. The skill copies the HTML report and creates a structured companion markdown note."
---

## Configuration

Set `$INSIGHTS_ARCHIVE_DIR` to the vault folder that holds the archived reports, for
example `~/vault/Areas/Tooling/Claude-Code/`. Every path below uses this variable.
Substitute your own absolute path wherever the variable appears.

## Context

After running `/insights`, the HTML report lands at `~/.claude/usage-data/report.html` and
the full insights JSON is present in the conversation context. This skill archives both to:

```
$INSIGHTS_ARCHIVE_DIR
```

## Step 1: Determine the file name

The naming convention is a delta window — from the previous report's end date to today:

```
Claude Code Insights — [Mon-DD] to [Mon-DD] YYYY
```

To find the start date, list existing `.html` files in the vault folder, pick the most
recent one, and extract its end date. Use today's date as the end date.

```bash
ls "$INSIGHTS_ARCHIVE_DIR/"*.html
```

Example: if the latest file is `Claude Code Insights — Mar-07 to Mar-14 2026.html`,
the new file should be `Claude Code Insights — Mar-14 to Mar-21 2026.html`.

Format dates as `Mon-DD` (e.g., `Mar-21`). Year goes at the end.

## Step 2: Copy the HTML

```bash
cp ~/.claude/usage-data/report.html \
  "$INSIGHTS_ARCHIVE_DIR/<FILENAME>.html"
```

## Step 3: Create the markdown note

Create `<FILENAME>.md` in the same folder with this exact structure:

### Frontmatter

```yaml
---
title: <FILENAME>
type: resource
tags:
  - personal
  - tech/tooling
  - claude-code
  - insights
period: "<start-date YYYY-MM-DD> to <end-date YYYY-MM-DD>"
sessions: <number from insights data>
messages: <number from insights data>
report-html: "$INSIGHTS_ARCHIVE_DIR/<FILENAME>.html"
---
```

Use the full ISO dates for `period` (e.g., `"2026-03-14 to 2026-03-21"`).
Pull `sessions` and `messages` from the insights data in the conversation.

### Body sections

Write all sections using the insights data from the conversation. Be specific — pull actual
numbers, examples, and quotes. Do not pad with generic filler.

```
## Summary

One paragraph. State the period, total sessions analyzed, messages, hours, commits.
Link to the previous report: [[Claude Code Insights — <prev start> to <prev end> YYYY]].

## Table of Contents

- [[#At a Glance]]
- [[#Project Areas]]
- [[#Interaction Style]]
- [[#What's Working]]
- [[#Friction Analysis]]
- [[#Suggestions]]
- [[#On the Horizon]]

## At a Glance

Four short paragraphs matching the at_a_glance fields:
- **What's working:** ...
- **What's hindering:** ...
- **Quick wins:** ...
- **Ambitious horizon:** ...

## Project Areas

Markdown table: Area | Sessions — sorted by session count descending.

## Interaction Style

2-3 paragraphs from interaction_style.narrative and key_pattern.

## What's Working

One subsection per item in what_works.impressive_workflows.
Each: ### Title, then a paragraph describing it with specifics.

## Friction Analysis

One subsection per category in friction_analysis.categories.
Each: ### Title, then a paragraph, then **Examples:** bullet list.

## Suggestions

### CLAUDE.md Additions
Numbered list from suggestions.claude_md_additions — one line each.

### Features to Try
Bullet list from suggestions.features_to_try — one line each.

## On the Horizon

One subsection per item in on_the_horizon.opportunities.
Each: ### Title, then a paragraph.

## Fun Fact

One paragraph from fun_ending.

---

*Authored by: Clault Kiper{S|O|H} {version}*
```

## Step 4: Create the vault symlink (if missing)

If your vault links skills by symlink, ensure the vault-side symlink for this skill
exists. Skip this step otherwise.

## Guidelines

- No emojis anywhere in the markdown output.
- Pull every number and example directly from the insights JSON — never invent stats.
- The `report-html` path in frontmatter uses the resolved absolute path (not `~`).
- If the insights data is not in the conversation context, ask the user to run `/insights` first.
- After creating both files, confirm: "Archived to vault as `<FILENAME>`."
- Sign with your current model's Clault Kiper signature per 000-System/Agents/AGENTS.md (Sonnet KiperS 4.6, Opus KiperO 4.8, Haiku KiperH 4.5) — derive from the model you are running as; never hardcode.
