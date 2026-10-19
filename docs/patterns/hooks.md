# Claude Code hooks

Claude Code hooks are shell commands the harness runs around tool calls. They give you deterministic guard rails that do not depend on the model remembering an instruction. This article covers how hooks work, the design philosophy behind the hooks in this repo, and how to install them.

The scripts described here live in [`harnesses/claude-code/hooks/`](https://github.com/Kiriketsuki/agenKic-hub/tree/main/harnesses/claude-code/hooks).

## How hooks work

Hooks are configured in `~/.claude/settings.json` under the `hooks` key. Each entry names an event, a matcher, and one or more commands.

The main events:

| Event | When it fires | Typical use |
|:---|:---|:---|
| `PreToolUse` | Before a tool call runs | Validate, warn, or block the call |
| `PostToolUse` | After a tool call completes | Check the result, auto-format, reindex |
| `SessionStart` | When a session begins | Environment health checks, context loading |
| `Stop` | When the agent finishes a turn | Final verification, sync, cleanup |

Mechanics:

- The **matcher** is a regex against the tool name. `"Bash"` matches Bash calls. `"Edit|Write"` matches both file-write tools. An empty matcher matches every tool.
- The hook receives the tool call as **JSON on stdin**. A Bash hook reads `.tool_input.command`. A file hook reads `.tool_input.file_path`. Most scripts here extract these with `jq`.
- **Exit code 2 blocks the tool call.** For a blocking `PreToolUse` hook, write the reason to stderr. The harness surfaces stderr back to the model, which can then correct course.
- **Exit code 0 lets the call proceed.** For `PreToolUse` and `PostToolUse`, plain stdout goes to the debug log only, and the model never sees it. To reach the model, print JSON with `hookSpecificOutput.additionalContext` for a note, or `permissionDecision` (`allow`, `deny`, `ask`) for a decision. `SessionStart` stdout is the exception: the model reads it as context.
- A handler `if` field holds one permission rule, such as `"if": "Bash(git commit *)"`. It checks each part of a compound command and keeps the hook off unrelated calls.
- A `SessionStart` hook must never exit non-zero. It reports, it does not gate.

## Design philosophy

The hooks in this repo fall into three families.

**Guard rails** block actions that violate a convention or risk damage. Naming conventions, draft-PR merges, lint failures, and oversized files are all cheaper to stop before the fact than to unwind after. A guard rail prints a precise reason and an example of the correct form, so the model can retry correctly on the next attempt.

**Auth safety** removes a class of mistake entirely. When one machine holds two GitHub accounts, a push under the wrong identity is silent and hard to undo. A hook that switches the account to match the remote owner makes the mistake impossible.

**Suggestion hooks** nudge instead of block. They return the hint as `additionalContext` JSON and always exit 0. Each one carries a cooldown file so it does not fire on every matching call. The model stays free to ignore the hint when it has a reason to.

## The ported hooks

### Guard rails (PreToolUse, matcher `Bash`)

**`gh-check-before-create.sh`** enforces git and GitHub naming. Branch names must match `<type>/<issue>-<kebab-description>`. PR titles must follow conventional commits or a documented bracketed style. Both violations exit 2. Commit messages and short issue titles get warnings only. The hook also blocks merging a PR that is still in draft, and warns before branch renames and issue relabels that can trigger repo automation. It only enforces naming in repos that carry an `issue-branch-handler` workflow, so ordinary repos pass through untouched.

**`lint-precommit.sh`** intercepts `git commit` and runs the project's linter. It detects the stack from manifest files: `npm run lint` and `tsc --noEmit` for JS/TS, `ruff` or `flake8` for Python, `go vet` and `gofmt` for Go. The hook only checks. It never edits or stages files. Errors block the commit with the lint output and the command that fixes them.

**`large-file-check.sh`** blocks `git commit` when the tree carries any file over 100MB. GitHub rejects such pushes anyway, so failing early saves a wasted commit.

### Auth safety (PreToolUse, matcher `Bash`)

**`pre-push-auth.sh`** intercepts `git push`, reads the origin remote URL, and switches the active `gh` account to match the owner. The owner-to-account mapping is a small case block you edit once. Unknown remotes pass through untouched.

### Suggestion hooks

**`agent-route-suggest.sh`** (PreToolUse, matcher `Agent`) fires when a subagent is spawned without an explicit `subagent_type` or `model`. It suggests the routing skills that pick a specialist and a model tier. When both fields are set, it stays silent: the caller made a deliberate choice.

**`context7-suggest.sh`** (PostToolUse, matcher `Read`) fires when a dependency manifest is read: `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, or `Cargo.toml`. It extracts the top dependencies and hints at a docs lookup before writing code against an unfamiliar library.

### Correctness checks (PostToolUse, matcher `Edit|Write`)

**`python-syntax-check.sh`** parses any edited `.py` file with `ast`. A syntax error exits 2 with the line and message on stderr, which forces the model to fix the file before it moves on.

### Verification gate (Stop)

**`stop-verify-gate.sh`** runs the project's `.claude/verify.sh` when Claude tries to end its turn. A failure blocks the stop and returns the output tail, so Claude keeps working until the check passes. On a second consecutive block it allows the stop, so it never loops.

### Environment health (SessionStart)

**`preflight-check.sh`** prints `[PREFLIGHT]` warnings at session start: package-manager lock files, node availability, and stale git `index.lock` files. A healthy host prints nothing. It always exits 0. The model reads the report and resolves blockers before they surface mid-task.

## Not ported

The source environment also runs hooks that are too personal to publish: vault sync and auto-push hooks for a private Obsidian vault, semantic-index maintenance hooks for local services, an account-specific auth switcher, and plugin path normalizers. They follow the same patterns as the hooks above, so they are useful as categories even without the scripts: a `Stop` hook that commits and pushes a knowledge base, and `PostToolUse` hooks that keep local indexes fresh after edits.

## Installation

1. Copy the scripts into `~/.claude/hooks/` and make them executable:

   ```bash
   mkdir -p ~/.claude/hooks
   cp harnesses/claude-code/hooks/*.sh ~/.claude/hooks/
   chmod +x ~/.claude/hooks/*.sh
   ```

2. Edit `pre-push-auth.sh` and fill in your own remote-owner-to-account mapping. Skip the file entirely when you only use one GitHub account.

3. Merge the fragment in [`harnesses/claude-code/settings.hooks.example.json`](https://github.com/Kiriketsuki/agenKic-hub/blob/main/harnesses/claude-code/settings.hooks.example.json) into your `~/.claude/settings.json`. The fragment wires each script to its event and matcher.

4. Restart Claude Code. Hooks load at session start.

The scripts require `bash`, `jq`, and `git`. On Windows, Claude Code runs hooks under Git Bash, so the same scripts work unchanged.
