---
name: doc-sync
description: Use when the user wants to sync repository documentation changelogs to the vault. Triggers: "Sync repo docs", "Update repo changelogs", "Doc sync", "Run doc-sync".
---

## Context
Automated repository documentation sync. Detects git changes in `~/workdev/` repos and appends structured changelog entries to corresponding vault documentation files.

## Triggers
- "Sync repo docs", "Update repo changelogs"
- "Doc sync", "Run doc-sync"

## Workflow

### Automated (Systemd Timer)

Runs every 5 hours via `doc-sync.timer`. No user intervention needed.

### Manual -- All Repos

```bash
bash 000-System/Scripts/doc-sync.sh
```

Syncs all 11 mapped repositories, then runs vault `sync.sh` to commit and push.

### Manual -- Single Repo

```bash
bash 000-System/Scripts/doc-sync.sh <repo-key>
```

Valid repo keys: `aurrigo-av-dashboard`, `AutoConnect`, `BHAManagement`, `FleetManagement`, `RemoteSupervisor`, `RouteVisualiser`, `StandManagement`, `tempaur`, `auto_slack`, `auto_clock`, `tempura`

Single-repo mode skips vault sync -- commit manually if needed.

## What It Does

For each mapped repo, the script runs four phases:

**Phase 1 -- Seed** (`docs/[RepoName].md` in the repo)
- If `docs/[RepoName].md` does not exist in the repo directory, it is created:
  - If the vault doc already has substantive content (populated Overview etc.), the vault doc is copied as-is.
  - Otherwise, the script detects the repo type (frontend / backend / generic), copies the matching vault template, and populates all `{{placeholders}}` with real data (git hash, branch, tech stack from `package.json`/`pyproject.toml`, README overview, git log).
- The seeded file is committed to the repo with `docs: initial repo documentation`.

**Phase 2 -- Changelog sync**
- Reads the stored `git-hash` from `docs/[RepoName].md`.
- Compares with the repo's current `HEAD`.
- If different: generates a changelog entry (commit table, branch, diffstat, optional AI summary) and inserts it at the top of `## Changelog`.
- Updates `git-hash`, `branch`, and `last-doc-sync` in frontmatter.
- Commits the updated doc to the repo with `docs: sync to [branch]@[hash]`.

**Phase 3 -- Vault mirror**
- Copies `docs/[RepoName].md` from the repo to the corresponding vault path.
- The vault doc is always a read-only mirror of the repo doc; edits should be made in the repo.

**Phase 4 -- Review alert**
- For changes exceeding 10 commits, adds a checkbox to `001-Inbox/Todo List.md`.

## Edge Cases

- **First sync / no git-hash**: Shows last 20 commits, marked as "Initial sync"
- **History diverged** (force push / rebase): Falls back to last 20 commits with a note
- **Repo missing**: Skips with warning in log
- **Seed -- vault doc is a stub**: Creates from the matching template and populates automatically
- **Seed -- template missing**: Logs an error and skips that repo
- **Claude CLI unavailable**: Silently skips AI summary

## Logs

Output is logged to `000-System/Scripts/logs/doc-sync.log`.

## Systemd Management

```bash
# Check timer status
systemctl --user list-timers

# View service logs
journalctl --user -u doc-sync.service

# Manually trigger
systemctl --user start doc-sync.service

# Enable/disable timer
systemctl --user enable --now doc-sync.timer
systemctl --user disable doc-sync.timer
```
