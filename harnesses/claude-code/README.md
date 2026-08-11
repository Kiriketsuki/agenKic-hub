# Claude Code

Config target: `~/.claude/` (all platforms).

Expected contents once ported:

| File / dir | Purpose |
|:---|:---|
| `settings.json.tmpl` | Shared settings: hooks wiring, statusline command, model defaults |
| `hooks/` | PreToolUse / PostToolUse / SessionStart / Stop hook scripts |
| `agents/` | Custom subagent definitions |
| `rules/` | Shareable rules files loaded via CLAUDE.md includes |

The skills themselves live at the repo root under `skills/` and install separately.
The statusline scripts live under `config/statusline/` and this harness wires them.

Source of truth today: the author's Linux machine (`~/.claude/`). Files land here
after sanitization. See `docs/setup/` for install instructions.
