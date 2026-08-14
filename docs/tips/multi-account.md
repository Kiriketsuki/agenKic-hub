# Multi-Account Claude Code Setup

Run a personal Claude account and a work Claude account on one machine. The
account switches automatically based on the directory you launch from.

## How it works

Claude Code stores identity, tokens, and session state in a config directory.
The default is `~/.claude/`. The `CLAUDE_CONFIG_DIR` environment variable
points Claude Code at a different directory. One directory per account gives
you two isolated logins.

| Account | Config dir | Workspace |
|:---|:---|:---|
| Personal, `<you>@personal.com` | `~/.claude/` | everywhere else |
| Work, `<you>@company.com` | `~/.claude-work/` | `{{work_workspace_root}}/**` |

Replace `{{work_workspace_root}}` with your work projects root, for example
`~/work/company`.

## Step 1: Create the work config directory

```bash
mkdir -p ~/.claude-work
```

## Step 2: Add the switching function to zsh

Add this function to `~/.zshrc`. It sets `CLAUDE_CONFIG_DIR` inline at
invocation, so the account follows your current directory:

```zsh
unalias claude 2>/dev/null
function claude {
  if [[ "$PWD" == *{{work_workspace_root}}* ]]; then
    CLAUDE_CONFIG_DIR="$HOME/.claude-work" command claude "$@"
  else
    command claude "$@"
  fi
}
```

The hub ships this fragment in `config/zsh/`. Do not use direnv for
`CLAUDE_CONFIG_DIR`. A `.envrc` export has a timing race on first entry, so
the variable may never reach the session. The function approach needs no
shell restart and no per-directory setup.

## Step 3: Log in to the work account

```bash
cd {{work_workspace_root}}
claude
# Follow the login prompt. Authenticate as <you>@company.com.
```

## Step 4: Symlink shared resources

Keep only identity and state per account. Share agents, hooks, skills, and
settings across both accounts with symlinks:

```bash
for dir in agents commands hooks rules skills plugins; do
  rm -rf ~/.claude-work/$dir
  ln -sf ~/.claude/$dir ~/.claude-work/$dir
done
rm -f ~/.claude-work/settings.json
ln -sf ~/.claude/settings.json ~/.claude-work/settings.json
```

What stays per account:

| Path | Why |
|:---|:---|
| `.claude.json` | OAuth account identity |
| `.credentials.json` | OAuth tokens |
| `history.jsonl` | session history |
| `sessions/`, `cache/`, `backups/` | session state |

Everything else is a symlink, so one edit applies to both accounts.

## Step 5: Verify

```bash
cd {{work_workspace_root}}
claude /config   # should show <you>@company.com
cd ~
claude /config   # should show your personal account
```

## Account-aware statusline

The templated statusline in `config/statusline/` shows the active account
and its usage. Two details matter:

- **Per-account usage cache.** The statusline writes one cache file per
  config dir, for example `/tmp/.claude_usage_cache_.claude` and
  `/tmp/.claude_usage_cache_.claude-work`. Separate files prevent usage
  numbers from one account bleeding into the other.
- **Detect the account from `$PWD`, not from `$CLAUDE_CONFIG_DIR`.**
  Statusline and hook subprocesses do not inherit environment variables from
  the parent Claude session. The statusline script repeats the same
  workspace-path check the zsh function uses.

Fill in the `{{template_vars}}` in the statusline templates during
`setup/setup.sh`, or by hand.

## Adding a third account

1. Create the config dir: `mkdir -p ~/.claude-<name>`.
2. Log in once: `CLAUDE_CONFIG_DIR=~/.claude-<name> claude`.
3. Repeat the symlink loop against `~/.claude-<name>`.
4. Add a branch for the new workspace path to the `claude` zsh function.
5. Add the matching branch to the statusline script.

## Known limitations

- IDE extensions read `~/.claude/ide/` and ignore `CLAUDE_CONFIG_DIR`. IDE
  integration always uses the personal account. Terminal use is reliable.
- `claude --resume <id>` resumes from the config dir active at launch, not
  the dir active when you created the session. Resume from the matching
  workspace directory.
