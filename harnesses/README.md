# Harnesses

Per-harness setup for the agent runtimes this hub supports. Each directory holds the
shareable configuration for one harness: settings, hooks, custom agents, and wiring
notes. The setup scripts symlink or copy these into place.

| Harness | Directory | Config target |
|:---|:---|:---|
| Claude Code | `claude-code/` | `~/.claude/` |
| Codex CLI | `codex/` | `~/.codex/` |
| OpenCode | `opencode/` | `~/.config/opencode/` |
| Pi | `pi/` | see its README |
| Hermes | `hermes/` | see its README |

## Status

`claude-code/` is the primary harness. The other directories are scaffolds: each README
documents which files belong there and where they install. Real configs land as they
are ported and sanitized.

## Adding a harness

1. Create `harnesses/<name>/` with a README that states the config target path per OS.
2. Add templates for any file that carries user-specific values. Use `{{variable}}`
   placeholders and document each variable in `setup/answers.example.yml`.
3. Register the component in `setup/components/`.
