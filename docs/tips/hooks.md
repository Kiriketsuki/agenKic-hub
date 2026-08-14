# Claude Code Hooks

Hooks are shell commands the harness runs around tool calls. They give you
deterministic guard rails that do not depend on the model remembering an
instruction.

## Events

| Event | When it fires | Typical use |
|:---|:---|:---|
| `PreToolUse` | Before a tool call runs | Validate, warn, or block the call |
| `PostToolUse` | After a tool call completes | Auto-format, syntax check, reindex |
| `SessionStart` | When a session begins | Environment health checks |
| `Stop` | When the agent finishes a turn | Final verification, sync, cleanup |

## Mechanics

- Hooks live in `~/.claude/settings.json` under the `hooks` key. Each entry
  names an event, a matcher, and one or more commands.
- The **matcher** is a regex against the tool name. `"Bash"` matches Bash
  calls. `"Edit|Write"` matches both file-write tools. An empty matcher
  matches every tool.
- The hook receives the tool call as **JSON on stdin**. A Bash hook reads
  `.tool_input.command` with `jq`. A file hook reads `.tool_input.file_path`.
- **Exit code 2 blocks the tool call.** Write the reason to stderr. The
  harness shows stderr to the model, which can then retry correctly.
- **Exit code 0 lets the call proceed.** The harness shows stdout to the
  model as feedback. Suggestion hooks use this to nudge without blocking.
- A `SessionStart` hook must never exit non-zero. It reports, it does not gate.

## The absolute-path rule

Hook subprocesses run in a non-interactive shell. They do not load your
`.zshrc`, so lazy-loaded tools such as an NVM-managed `node` are not on
PATH, and `~` expansion is unreliable in some contexts. Two rules:

1. Reference every hook script by absolute path in `settings.json`. Use
   `$HOME/.claude/hooks/script.sh`, not `~/.claude/hooks/script.sh`.
2. Inside a hook script, call binaries by absolute path when the tool is not
   in a standard system location. For example
   `$HOME/.nvm/versions/node/{{node_version}}/bin/node`.

## Wiring in settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/gh-check-before-create.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/python-syntax-check.sh" }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/preflight-check.sh" }
        ]
      }
    ]
  }
}
```

## Example hooks

**Guard rail: naming enforcement** (`PreToolUse`, matcher `Bash`). Intercept
`git` and `gh` create commands. Check branch names against
`<type>/<issue>-<kebab-description>` and PR titles against the team
convention. Exit 2 with a precise reason and a correct example, so the model
retries with the right form.

**Guard rail: pre-commit lint** (`PreToolUse`, matcher `Bash`). Intercept
`git commit`. Detect the stack from manifest files and run the project
linter. Auto-fix and re-stage where the tool supports it. Unfixed errors
block the commit with the full lint output.

**Auth safety: push identity** (`PreToolUse`, matcher `Bash`). Intercept
`git push`, read the origin remote URL, and switch the active `gh` account
to match the owner. Pair this with an SSH host alias per account, so the
remote URL alone selects the right identity.

**Correctness: Python syntax check** (`PostToolUse`, matcher `Edit|Write`).
Compile any edited `.py` file with `py_compile`. A syntax error exits 2,
which forces a fix before the model moves on.

**Reindex: gitnexus refresh** (`PostToolUse`, matcher `Bash`). After
`git commit` or `git merge`, rerun `npx gitnexus analyze` so the code
intelligence index stays fresh.

**Health check** (`SessionStart`). Print structured `[PREFLIGHT]` lines:
package-manager lock files, node availability, stale `.git/index.lock`
files. Always exit 0.

## Installation

1. Install the `config-hooks` component. It copies the scripts, the settings
   fragment, and the merge helpers into `~/.claude/hooks/`:

   ```bash
   ./setup/setup.sh --components config-hooks
   ```

2. Run the merge helper once. It backs up `~/.claude/settings.json` to
   `settings.json.bak`, then merges the fragment entries in:

   ```bash
   ~/.claude/hooks/install-hooks.sh
   ```

   ```powershell
   & "$HOME\.claude\hooks\install-hooks.ps1"
   ```

3. Restart Claude Code. Hooks load at session start.

The helper is idempotent. A second run reports zero changes and leaves the
file byte-identical. Hooks you wired yourself stay untouched. See
`config/hooks/README.md` for the script list and the removal steps.

The scripts require `bash`, `jq`, and `git`. On Windows, Claude Code runs
hooks under Git Bash, so the same scripts work unchanged.
