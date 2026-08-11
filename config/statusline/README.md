# Statusline (scaffold)

STARTER SCAFFOLD. No scripts live here yet. The real statusline scripts await a
port from the author's Linux machine. This README describes what will land here,
so the installer and the docs stay honest until the port happens.

## Planned contents

- `statusline-command.sh.tmpl`: the Claude Code statusline entry point. It reads
  the active account from the working directory and renders model, context, and
  usage information.
- `fetch-usage.sh.tmpl`: a helper that refreshes a per-account usage cache file
  so the statusline stays fast.

## Design notes for the port

- Per-account usage caches prevent cross-account bleed. One cache file per
  config directory.
- The scripts read the account from `$PWD`, not from `CLAUDE_CONFIG_DIR`,
  because statusline subprocesses do not inherit session env vars.
- All paths are absolute. No `~` inside scripts.
- No secrets in the scripts. Tokens come from the harness credential files.

## Installer behavior

The `config-statusline` component targets `~/.claude/statusline`. While only
this README exists, the installer prints a "nothing installable yet" message
and does nothing.
