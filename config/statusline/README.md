# Statusline (external)

The Claude Code statusline lives in its own repository:
[chrysaki-claude](https://github.com/Kiriketsuki/chrysaki-claude). It renders a
four-line status bar from chrysaki-core tokens, plus a stats fetcher and a
session cost exporter.

## Install

Select the `ext-statusline` component in the installer:

```bash
./setup/setup.sh
```

That component clones `Kiriketsuki/chrysaki-claude` into
`~/.local/share/chrysaki-claude`, then runs the repo's own `init.sh`. The
delegate script installs the statusline and wires `statusLine` in
`~/.claude/settings.json` for you. Restart Claude Code to see the bar.

Run `./setup/setup.sh --dry-run` first to print the clone and delegate plan
without a disk change.

## Manual install

```bash
git clone https://github.com/Kiriketsuki/chrysaki-claude ~/.local/share/chrysaki-claude
sh ~/.local/share/chrysaki-claude/init.sh
```

## Installer behavior

`ext-statusline` owns the install. The older `config-statusline` component
keeps this README as a pointer only. It writes no scripts.
