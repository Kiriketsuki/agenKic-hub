# Harnesses

The `harnesses/` directory holds shareable configuration for five agent runtimes. Each subdirectory carries the settings, hooks, and wiring notes for one harness. The setup scripts symlink or copy these into place.

| Harness | Directory | Config target |
|:---|:---|:---|
| Claude Code | `harnesses/claude-code/` | `~/.claude/` (all platforms) |
| Codex CLI | `harnesses/codex/` | `~/.codex/` (all platforms) |
| OpenCode | `harnesses/opencode/` | `~/.config/opencode/` (Linux/macOS), `%APPDATA%\opencode\` (Windows) |
| Pi | `harnesses/pi/` | Documented in its README when the config lands |
| Hermes | `harnesses/hermes/` | Documented in its README when the config lands |

## Claude Code

The primary harness. Expected contents:

| File / dir | Purpose |
|:---|:---|
| `settings.json.tmpl` | Shared settings: hooks wiring, statusline command, model defaults |
| `hooks/` | PreToolUse, PostToolUse, SessionStart, and Stop hook scripts |
| `agents/` | Custom subagent definitions |
| `rules/` | Shareable rules files loaded via CLAUDE.md includes |

The skills live at the repo root under `skills/` and install separately. The statusline scripts live under `config/statusline/`, and this harness wires them.

## Codex CLI

Expected contents:

| File | Purpose |
|:---|:---|
| `config.toml.tmpl` | Model, approval policy, sandbox settings |
| `AGENTS.md` | Shared agent instructions |

## OpenCode

Expected contents:

| File | Purpose |
|:---|:---|
| `opencode.json.tmpl` | Provider, model, and keybind settings |
| `AGENTS.md` | Shared agent instructions |

## Pi and Hermes

Scaffolds only for now. Each README gains a file table when the first config lands.

## Adding a harness

1. Create `harnesses/<name>/` with a README that states the config target path per OS.
2. Add templates for any file that carries user-specific values. Use `{{variable}}` placeholders and document each variable in `setup/answers.example.yml`.
3. Register the component in `setup/components/`.
