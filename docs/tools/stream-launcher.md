# Stream launcher (WIP)

> **Work in progress.** Use this experimental tool for supervised development
> trials. Its interface can change. It is not a production supervisor or sandbox.

The launcher maps a TSV stream entry and Markdown brief to an existing Git branch,
a worktree, a setup profile, and an interactive tmux window.

Read the [configuration and tuning guide](https://github.com/Kiriketsuki/agenKic-hub/blob/main/tools/stream-launcher/README.md)
for installation, agent arguments, dependency profiles, worktree naming, tmux
placement, sharing rules, and failure recovery.

The [fictional example bundle](https://github.com/Kiriketsuki/agenKic-hub/tree/main/tools/stream-launcher/examples)
provides a starting point. Copy it outside the hub before adding real task data.

The hub installer does not install the launcher. Review its commands and use
`--dry-run` before each new configuration. Tests use dummy programs rather than
model CLIs. The tool does not change agent permissions or grant deployment approval.
