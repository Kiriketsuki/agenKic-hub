# Statusline (external)

The Claude Code statusline lives in its own repository:
[chrysaki-claude](https://github.com/Kiriketsuki/chrysaki-claude). It renders a
four-line status bar from chrysaki-core tokens, plus a stats fetcher and a
session cost exporter.

## Install

```bash
git clone https://github.com/Kiriketsuki/chrysaki-claude ~/.claude/statusline
```

Then point `statusLine` in `~/.claude/settings.json` at it:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline/statusline-command.sh"
  }
}
```

## Installer behavior

The `config-statusline` component targets `~/.claude/statusline`. Because the
scripts live in an external repository, the installer prints this pointer and
does nothing else.
