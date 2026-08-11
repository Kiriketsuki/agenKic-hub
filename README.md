# agenKic sKills

A public agentic hub: Claude Code skills, multi-agent workflows, harness setups, and
terminal configs, with an installer that adapts them to your machine.

Docs site: https://kiriketsuki.github.io/agenKic-sKills/

## Quick start

```bash
git clone https://github.com/Kiriketsuki/agenKic-sKills
cd agenKic-sKills
./setup/setup.sh          # Linux / macOS / Git Bash
```

```powershell
.\setup\setup.ps1         # Windows PowerShell
```

The setup script asks which components you want (skills, workflows, harness configs,
tmux, zsh, statusline), asks for your template variables, and symlinks everything into
place. Pass `--profile setup/answers.example.yml` (copy and edit it first) for a
non-interactive run. Manual per-OS symlink commands live in
[docs/setup/symlinks.md](docs/setup/symlinks.md).

## What is here

| Directory | Contents |
|:---|:---|
| [`skills/`](skills/) | 20 Claude Code skills, install into `~/.claude/skills/` |
| [`workflows/`](workflows/) | Multi-agent Workflow scripts for the Claude Code Workflow tool |
| [`harnesses/`](harnesses/) | Per-harness setup: Claude Code, Codex, OpenCode, Pi, Hermes |
| [`config/`](config/) | Terminal environment: tmux, zsh fragments, statusline |
| [`setup/`](setup/) | Cross-platform installer with component picker and templating |
| [`docs/`](docs/) | Source for the docs site (mkdocs-material) |

New to terminal-first development? Read the
[guide slide deck](docs/guide/terminal-claude-code-deck.md). It walks from a bare
shell (Ghostty, Nerd Fonts, tmux, lazygit, Starship) to a full Claude Code workflow
(context management, hooks, STE, MCP, worktrees, CLAUDE.md).

## Skills

| Skill | What it does |
|:---|:---|
| [adversarial-council](skills/adversarial-council/) | Adversarial debate over a decision or plan: advocates, critics, questioner, arbiter |
| [agent-route](skills/agent-route/) | Recommend the right subagent type for a task |
| [brainstorm](skills/brainstorm/) | Collaborative design exploration before implementation, one question at a time |
| [brainstorm-grill](skills/brainstorm-grill/) | The relentless variant: interrogates a plan along the decision-tree frontier |
| [continuous-learning-v2](skills/continuous-learning-v2/) | Instinct-based learning system that observes sessions via hooks and evolves instincts into skills |
| [context-handoff](skills/context-handoff/) | Write a session handoff before context runs out |
| [context-resume](skills/context-resume/) | Resume work from a previous session handoff |
| [council-fix](skills/council-fix/) | One-command council review pipeline that ends in a prioritized fix plan |
| [council-supervisor](skills/council-supervisor/) | Supervised multi-round council with heartbeats, checkpoints, and agent replacement |
| [cover-letter](skills/cover-letter/) | Cover letter from a job posting, rendered as a LaTeX-quality PDF |
| [croc-send](skills/croc-send/) | Send files between machines with croc over tailscale |
| [feature-spec](skills/feature-spec/) | Interview-driven feature spec with Gherkin acceptance scenarios |
| [implement-spec](skills/implement-spec/) | Implement a written spec task by task |
| [insights-to-vault](skills/insights-to-vault/) | Archive a Claude Code Insights report into a notes vault |
| [kilint](skills/kilint/) | Prose linter for the STE house style |
| [merge-next](skills/merge-next/) | Merge the current branch and advance to the next sibling |
| [model-route](skills/model-route/) | Recommend the optimal model tier for a task |
| [parallel-fix](skills/parallel-fix/) | Fan out independent fixes to parallel worktree agents |
| [release-notes-enricher](skills/release-notes-enricher/) | Enrich git-cliff release notes with PR prose summaries |
| [repo-hooks](skills/repo-hooks/) | Install and manage the repo's git hook conventions |
| [security-scan](skills/security-scan/) | Audit Claude Code configuration for security risks with AgentShield |
| [ste-writing](skills/ste-writing/) | Rewrite AI-flavored prose into a controlled house style |
| [visual-explainer](skills/visual-explainer/) | Self-contained HTML pages that explain systems, diffs, and plans visually |

## Workflows

Scripts for the Claude Code Workflow tool: council loops, spec loops, ultracode
fix and implement pipelines, and worked examples for data pipelines. Each file
carries a header comment stating what to customize. Catalog:
[docs/workflows/index.md](docs/workflows/index.md).

## Patterns

Articles distilled from daily agentic use: the debugging protocol, workflow model
tiering, council patterns, clip-path borders, and a Gherkin primer for reading the
specs these skills produce. Start at [docs/patterns/index.md](docs/patterns/index.md).

## License and attribution

Several skills adapt upstream work and say so in their frontmatter: brainstorm
(anthropics/claude-plugins-official), brainstorm-grill (mattpocock grilling),
visual-explainer (nicobailon/visual-explainer). Keep those notices when redistributing.
