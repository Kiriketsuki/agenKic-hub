---
name: git-sync
description: Use when the user wants to sync the vault to the remote git repository. Triggers: "Sync vault", "Push changes", "Git sync".
---

## Context
Syncs the vault with the remote git repository by running the vault sync script. Stages all changes, commits with a timestamp, pulls with rebase, and pushes to main.

## Triggers
- "Sync vault", "Push changes", "Git sync"

## Workflow
1. Run the sync script:
   ```bash
   bash /home/kiriketsuki/dev/obKidian/000-System/Scripts/sync.sh /home/kiriketsuki/dev/obKidian
   ```
2. Report the output to the user. Confirm on success.

## Guidelines
- If the script fails, report the error verbatim. Do not retry.
- For cross-platform contexts, see CLAUDE.md for the canonical sync command.
