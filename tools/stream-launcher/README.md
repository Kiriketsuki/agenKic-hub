# Stream launcher (WIP)

> **Work in progress.** This is an experimental development tool, not a supported
> production service. Commands, configuration, and behavior can change without
> migration support. Review each configuration and brief. Start with `--dry-run`.

The launcher opens an existing Git branch in a worktree and starts an interactive
agent in a tmux window. A **stream** is one manifest entry and its Markdown brief.

The hub installer does not install this tool. Run it manually from this directory.
It does not schedule tasks, supervise agents, merge branches, or provide a security
sandbox. The agent keeps the permissions of its user and selected CLI.

## Requirements and tested scope

- Linux or a Unix environment with `fcntl` file locking.
- `uv` and Python 3.11 or later. `uv` selects a compatible interpreter.
- Git with `git worktree list --porcelain -z` support.
- tmux with direct argument execution and `remain-on-exit failed` support.
- The configured agent executable and any setup tools, available on `PATH`.
- An existing repository and an existing local or remote branch for each stream.

The launcher has no third-party Python dependencies. Local tests used Linux,
Git 2.54.0, tmux 3.6a, and Python 3.11/3.13. CI runs the regression suite on Linux.
macOS needs separate validation. Native Windows and Git Bash are not supported.
For WSL, use Linux Git, tmux, Python, and repository paths within WSL.

## Start with a private bundle

Keep real briefs and configuration outside the hub. Do not publish credentials,
internal issue details, or machine-specific paths in either hub copy.

Suggested layout:

```text
workspace/
  hub/                       # This repository
    tools/stream-launcher/
  your-repo/                 # Existing repository
  stream-bundles/
    demo/
      streams.toml
      streams.tsv
      briefs/A.md
  worktrees/                 # Launcher-managed checkouts
```

From the hub root, copy the fictional examples into a new bundle directory:

```sh
mkdir -p ../stream-bundles/demo
cp -R tools/stream-launcher/examples/. ../stream-bundles/demo/
```

Before you launch anything:

1. Edit `streams.toml` to select your repository and worktree root.
2. Replace the fictional issue number and branch in `streams.tsv`.
3. Replace `briefs/A.md` with the actual task, ownership boundaries, and test commands.
4. Check that the branch already exists. Follow your repository's issue workflow.
5. Select the setup profile and agent command described below.

List the bundle, then validate the selected stream:

```sh
tools/stream-launcher/open-stream --config ../stream-bundles/demo/streams.toml --list
tools/stream-launcher/open-stream --config ../stream-bundles/demo/streams.toml A --dry-run
```

If the plan is correct, omit `--dry-run`:

```sh
tools/stream-launcher/open-stream --config ../stream-bundles/demo/streams.toml A
```

`--list` only reads configuration and the manifest. `--dry-run` checks tools,
branches, worktrees, and tmux windows. It does not fetch, run setup, create
worktrees, acquire locks, or change tmux windows. A missing local branch can
trigger a read-only `git ls-remote` query. `uv` can initialize its own runtime cache.

Keep `open-stream` beside `open_stream.py`. Add the whole directory to `PATH` if
needed. Do not symlink only the shell wrapper into another directory.

## Tune the configuration

All path settings resolve relative to `streams.toml`, not your current directory.
The complete starting point is [examples/streams.toml](examples/streams.toml).

| Setting | Default | How to tune it |
| --- | --- | --- |
| `repo` | Required | Set an existing repository or worktree path |
| `worktree_root` | `../worktrees` | Select the parent directory for new checkouts |
| `worktree_name` | `{issue}` | Add a repository prefix to avoid cross-repo collisions |
| `manifest` | `streams.tsv` | Select the four-column TSV file |
| `brief_dir` | `briefs` | Select the folder containing `<ID>.md` |
| `remote` | `origin` | Select the remote that holds your issue branches |
| `tmux.session` | `streams` | Choose a session name with letters, digits, `_`, or `-` |
| `tmux.window_prefix` | `stream-` | Use a project or epic prefix, such as `demo-` |
| `tmux.after` | Append | Set an exact anchor window name, including spaces |
| `tmux.socket` | Default server | Set a separate `tmux -L` socket for experiments |
| `agent.command` | `["claude", "{brief}"]` | Set the agent executable and literal arguments |

### Repository and worktree naming

`worktree_name` accepts `{issue}` and `{id}`. It must produce one directory name.
For example, `demo-{issue}` gives `demo-123`, while `demo-{issue}-{id}` gives
`demo-123-A`. The launcher rejects paths that resolve outside `worktree_root`.

Git still permits only one worktree per checked-out branch. Adding `{id}` does
not let two streams check out the same branch independently. Use distinct,
existing branches for independent agents.

The launcher uses a local branch when one exists. Otherwise, it verifies the
remote branch, fetches it, and creates a local tracking checkout. It never
invents or pushes a remote branch. It does not pull, rebase, or reset an existing
checkout. Update that checkout yourself after you stop its agent.

### Manifest and briefs

The TSV columns are **ID, numeric issue, existing branch, setup profile**.
Use actual tabs, not spaces or the two characters `\t`.

```text
A	123	task/123-example	none
B	124	task/124-docs	docs
```

A header `id<TAB>issue<TAB>branch<TAB>setup` is optional. Blank lines and lines
starting with `#` are ignored. IDs must be unique. Use letters, digits, `_`, or
`-`, with a letter or digit first. Each selected ID needs a nonempty UTF-8 brief.

A brief should state the task, allowed files, excluded files, tests, and reporting
requirements. Include your commit, push, and merge policy explicitly. The launcher
does not enforce instructions written in a brief.

### Agent, model, and CLI arguments

The command must contain exactly one whole `{brief}` argument:

```toml
[agent]
command = ["claude", "{brief}"]
```

The launcher sends the brief as one argument, including quotes and newlines.
It does not use shell interpolation, `eval`, or `tmux send-keys`.

To select another agent, model, or permission mode, change this argument array.
Use the documented interactive invocation for that CLI. The launcher does not
translate model names or flags between agents. Keep permission checks enabled.
Add `--` before `{brief}` if the selected CLI supports an end-of-options marker.

Bare executable names resolve from the caller's `PATH`. Executable paths with
`/` resolve from the configuration directory. The launcher converts the executable
to an absolute path before tmux starts it. Other arguments remain literal.
Script argument paths therefore resolve from the worktree unless they are absolute.

Do not place secrets in briefs or command arguments. The agent receives the brief
on its process command line, which other authorized users on the host may inspect.
Keep briefs short enough for the operating system's argument-size limit.

### Setup profiles

| Profile | Command | Use when |
| --- | --- | --- |
| `none` | No command | No dependency setup is needed |
| `docs` | No command | The task only changes documentation |
| `uv` | `uv sync --locked` | The repository has a current `uv.lock` |
| `npm` | `npm ci` | The repository has a current npm lockfile |

Setup runs in the worktree on every new launch, even when `.venv` exists.
An already-open stream returns without another setup run. Use repeatable setup
commands. The launcher removes inherited `VIRTUAL_ENV` and
`UV_PROJECT_ENVIRONMENT` overrides from setup's environment.

Override a profile to install the test extra only when your repository defines it:

```toml
[setup.uv]
command = ["uv", "sync", "--locked", "--extra", "test"]
env_example = ".env.example"
```

`env_example` is optional. It copies a worktree-relative file to `.env` with mode
`0600` only when `.env` is absent. It never overwrites or sources an existing file.

For a repository-owned setup script, select `custom` in the TSV and configure:

```toml
[setup.custom]
command = ["sh", "scripts/bootstrap.sh"]
```

This explicitly runs your script in the worktree. Review the script first.
Command arrays can execute arbitrary programs. They are not a security boundary.
A failed setup leaves the worktree for inspection and starts no agent.

### tmux placement and sharing

The launcher creates a missing session. It appends a window if the anchor is
absent. Duplicate anchor names cause an error before setup starts.

For an isolated trial, add this setting under `[tmux]`:

```toml
socket = "stream-sandbox"
```

Use the same socket when you attach or inspect windows:

```sh
tmux -L stream-sandbox attach-session -t streams
tmux -L stream-sandbox list-windows -t streams
```

The guard checks live panes across all sessions on the selected server. A plain
shell inside the worktree can block a second stream. Managed windows retain a
worktree tag even if their panes change directory.

Use `--allow-shared` only when two streams intentionally share files. It does not
make concurrent edits safe. Other tmux servers and non-tmux processes remain
outside the guard. A repository lock serializes launcher preparation only.
It does not lock the worktree for the agent's lifetime.

## Troubleshooting and reopening

| Result | Action |
| --- | --- |
| `required executable not found` | Install the tool or correct `PATH`/`agent.command` |
| `existing branch not found` | Check the manifest and issue-created remote branch |
| `cannot verify branch` | Check remote access, authentication, and connectivity |
| `already checked out elsewhere` | Use that checkout's bundle or stop and remove it through normal Git procedures |
| `repository/branch mismatch` | Inspect the checkout before changing configuration |
| `already in use` | Check the named pane before considering `--allow-shared` |
| `already open` | Attach to the existing window. This is not an agent health check |
| `window ... has exited` | Inspect the retained failure, then close that window before retrying |
| `setup failed` | Correct the reported setup error and retry the same stream |
| `another launcher` | Wait for the other preparation process to finish |

The launcher retains failed agents in their windows. Successful agent exits close
the window normally. During initialization failures, it removes only the window
it just reserved. It does not kill unrelated windows or delete existing worktrees.

After an interrupted setup, inspect the worktree before retrying. Do not delete
the repository's `open-stream.lock` file to bypass an active process. The operating
system releases the file lock when the launcher exits.

## Test and maintain

From the hub root:

```sh
uv run --no-project --python 3.11 python -B -m unittest discover -s tools/stream-launcher/tests -v
shellcheck tools/stream-launcher/open-stream
```

The 43 regression tests use disposable Git repositories and dummy programs.
They use a private tmux server with `/dev/null` configuration. They never run a
model CLI or use the normal tmux server. CI installs Git/tmux before running them.
If Git or tmux is absent locally, the integration tests skip. Do not count skips
as a successful validation.

The launcher is a vendored snapshot in both hubs. Keep the runtime, examples,
and tests aligned when you copy fixes. Do not copy local bundles or index/cache
artifacts. The original local bundle can continue using its compatibility wrapper.

Remaining WIP gaps include native Windows support, macOS validation, CLI-version
compatibility coverage, automatic copy synchronization, and agent lifecycle supervision.
There is no stable configuration-version or migration policy yet.

## Changelog

- 2026-09-08: Publish the experimental launcher, fictional examples, tuning guide,
  and regression tests. Keep installation manual while the tool is WIP.
