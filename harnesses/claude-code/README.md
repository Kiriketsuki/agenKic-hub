# Claude Code

Config target: `~/.claude/` (all platforms).

Contents:

| File / dir | Purpose |
|:---|:---|
| `hooks/` | Ported PreToolUse / PostToolUse / SessionStart hook scripts |
| `settings.hooks.example.json` | Settings fragment that wires the hooks above into `~/.claude/settings.json` |
| `settings.json.tmpl` | (planned) Shared settings: statusline command, model defaults |
| `agents/` | (planned) Custom subagent definitions |
| `rules/` | (planned) Shareable rules files loaded via CLAUDE.md includes |

Ported hooks:

| Hook | Event | What it does |
|:---|:---|:---|
| `gh-check-before-create.sh` | PreToolUse (Bash) | Enforces branch, commit, PR, and issue naming. Blocks draft PR merges |
| `pre-push-auth.sh` | PreToolUse (Bash) | Switches the active `gh` account to match the remote owner before push |
| `lint-precommit.sh` | PreToolUse (Bash) | Runs the project linter before `git commit`. Auto-fixes, then blocks on remaining errors |
| `large-file-check.sh` | PreToolUse (Bash) | Blocks commits when the tree carries files over 100MB |
| `explore-suggest.sh` | PreToolUse (Grep\|Glob) | Nudges toward richer exploration tools when available |
| `agent-route-suggest.sh` | PreToolUse (Agent) | Nudges toward explicit subagent type and model selection |
| `preflight-check.sh` | SessionStart | Environment health report: package-manager locks, node path, git locks |
| `python-syntax-check.sh` | PostToolUse (Edit\|Write) | Compiles edited `.py` files. Blocks on syntax errors |
| `submodule-check.sh` | PostToolUse (Edit\|Write) | Updates git submodules when submodule files change |
| `context7-suggest.sh` | PostToolUse (Read) | Hints at Context7 docs lookup when a dependency manifest is read |

See `docs/patterns/hooks.md` for the design walkthrough and installation steps.

The skills themselves live at the repo root under `skills/` and install separately.
The statusline scripts live under `config/statusline/` and this harness wires them.

Source of truth today: the author's Linux machine (`~/.claude/`). Files land here
after sanitization. See `docs/setup/` for install instructions.
