# Skills

Each skill is a directory under `skills/` with a `SKILL.md` that declares its name and trigger description. Install them by symlinking the `skills/` directory into your harness's skills folder. See [Install](../setup/install.md).

| Skill | Description |
|:---|:---|
| [adversarial-council](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/adversarial-council/SKILL.md) | Convenes advocate and critic agents to debate a decision, with a Socratic questioner and an arbiter who issues a structured recommendation. |
| [agent-route](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/agent-route/SKILL.md) | Recommends the optimal agent type for a task based on domain, complexity, and available specializations. |
| [brainstorm](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/brainstorm/SKILL.md) | Collaborative design exploration before implementation. Asks clarifying questions, proposes approaches with trade-offs, and converges on an approved design. |
| [brainstorm-grill](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/brainstorm-grill/SKILL.md) | The relentless variant of brainstorm. Interrogates a plan down every branch of the decision tree and resolves each question with a recommendation. |
| [context-handoff](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/context-handoff/SKILL.md) | Writes a handoff document that preserves decisions, failed approaches, and next steps before a session ends or compacts. |
| [context-resume](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/context-resume/SKILL.md) | Resumes work from a previous session handoff, verifying git state and re-reading key files. |
| [council-fix](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/council-fix/SKILL.md) | One-command alias for the full council review pipeline. Runs a supervised council and writes a prioritised fix plan. |
| [council-supervisor](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/council-supervisor/SKILL.md) | Wraps the council debate with a supervisor layer: heartbeat monitoring, stall detection, checkpointing, and structured results. |
| [cover-letter](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/cover-letter/SKILL.md) | Writes a cover letter from a job posting in a configured personal voice and renders it as a LaTeX PDF. |
| [croc-send](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/croc-send/SKILL.md) | Sends files and directories between machines using croc over tailscale. |
| [feature-spec](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/feature-spec/SKILL.md) | Interviews the user section by section and produces a filled feature spec with Gherkin acceptance scenarios and MoSCoW scope. |
| [implement-spec](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/implement-spec/SKILL.md) | Implements a feature from a spec file by routing tasks to subagents in dependency-aware parallel waves. |
| [insights-to-vault](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/insights-to-vault/SKILL.md) | Archives a Claude Code Insights report into an Obsidian vault with a structured companion note. |
| [kilint](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/kilint/SKILL.md) | Lints prose for AI-slop patterns without rewriting it: sentence length, passive voice, filler, and punctuation. |
| [merge-next](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/merge-next/SKILL.md) | End-of-work merge and advance skill. Squash merges the current branch, then checks out and rebases the next sibling branch. |
| [parallel-fix](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/parallel-fix/SKILL.md) | Spawns parallel agents in isolated worktrees to fix a bug with competing strategies. The smallest passing diff wins. |
| [release-notes-enricher](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/release-notes-enricher/SKILL.md) | Enriches git-cliff release notes with prose summaries by fetching linked PRs, issues, and commits from GitHub. |
| [repo-hooks](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/repo-hooks/SKILL.md) | Detects languages in the current repo and configures project-scoped hooks for type-checking, linting, and tests after edits. |
| [ste-writing](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/ste-writing/SKILL.md) | Rewrites prose that reads like AI output into a controlled house style, then scores the delta with kilint. |
| [visual-explainer](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/skills/visual-explainer/SKILL.md) | Generates self-contained HTML pages that visually explain systems, code changes, plans, and data. |
