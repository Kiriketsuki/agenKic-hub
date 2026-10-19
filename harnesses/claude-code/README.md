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
| `pre-push-auth.sh` | PreToolUse (Bash, `if: Bash(git push *)`) | Switches the active `gh` account to match the remote owner before push. Reads the repo from the hook input `cwd`. Fails closed when `jq` is missing |
| `lint-precommit.sh` | PreToolUse (Bash, `if: Bash(git commit *)`) | Runs the project linter before `git commit`. Checks only. It never edits or stages files. It prints the fix command on stderr and blocks on errors |
| `large-file-check.sh` | PreToolUse (Bash, `if: Bash(git commit *)`) | Blocks commits when the tree carries files over 100MB. Uses one `stat` pass |
| `agent-route-suggest.sh` | PreToolUse (Agent) | Adds a soft `additionalContext` note about subagent type and model. Cooldown file lives in `$XDG_RUNTIME_DIR` |
| `preflight-check.sh` | SessionStart | Environment health report: package-manager locks, node path, git locks. Prints warnings only |
| `python-syntax-check.sh` | PostToolUse (Edit\|Write) | Parses edited `.py` files with `ast`. Writes no `__pycache__`. Reports syntax errors on stderr |
| `context7-suggest.sh` | PostToolUse (Read) | Adds an `additionalContext` note about Context7 docs lookup when a dependency manifest is read |
| `stop-verify-gate.sh` | Stop | Runs the executable `.claude/verify.sh` of the project, if one exists. On failure it blocks the stop and returns the tail of the output. On the second try (`stop_hook_active`) it allows the stop and adds a `systemMessage`. With no `verify.sh` it does nothing |

Output rules for PreToolUse and PostToolUse hooks: stdout on exit 0 reaches only the debug log.
Claude never sees it. A hook that blocks writes its reason to stderr and exits 2. A hook that
adds a soft note prints `hookSpecificOutput.additionalContext` JSON on stdout and exits 0.

Failure rules: a safety hook (`pre-push-auth.sh`, `lint-precommit.sh`, `large-file-check.sh`)
exits 2 with a stderr message when `jq` is missing. A suggestion or check hook exits 0 silently.

The `if` field in the settings example holds one permission rule. Claude Code checks it
against each subcommand of a compound command, so the hook skips every other Bash call.

Removed hooks: `submodule-check.sh` ran `git submodule update --remote` and moved pinned
submodules. `explore-suggest.sh` promoted a code-graph tool that the user can disable.

See `docs/patterns/hooks.md` for the design walkthrough and installation steps.

The skills themselves live at the repo root under `skills/` and install separately.
The statusline scripts live under `config/statusline/` and this harness wires them.

Source of truth today: the author's Linux machine (`~/.claude/`). Files land here
after sanitization. See `docs/setup/` for install instructions.
