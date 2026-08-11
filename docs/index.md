# agenKic sKills

A public hub of reusable material for agentic coding. It collects skills, workflow scripts, harness configurations, and written patterns in one repository.

## What is in the repo

| Directory | Contents |
|:---|:---|
| `skills/` | 20 agent skills. Each has a `SKILL.md` with a name and trigger description. |
| `workflows/` | Background workflow scripts (`.mjs`) for multi-agent pipelines. |
| `harnesses/` | Config scaffolds for five agent runtimes: Claude Code, Codex CLI, OpenCode, Pi, and Hermes. |
| `config/` | Shell and terminal configuration: tmux, zsh, statusline. |
| `setup/` | Install scripts (`setup.sh`, `setup.ps1`) with an interactive picker and profile support. |

## Quick start

1. Clone the repository.

   ```bash
   git clone https://github.com/Kiriketsuki/agenKic-sKills.git
   cd agenKic-sKills
   ```

2. Run the installer for your platform.

   ```bash
   # Linux / macOS
   ./setup/setup.sh

   # Windows (PowerShell)
   .\setup\setup.ps1
   ```

3. Pick the components you want. The installer symlinks them into place.

See [Install](setup/install.md) for details, [Skills](skills/index.md) for the catalog, and [Patterns](patterns/index.md) for the written guides.
