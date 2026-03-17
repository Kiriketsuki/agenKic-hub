---
description: Generate a visual HTML project recap — rebuild mental model of a project's current state, recent decisions, and cognitive debt hotspots
---
Load the visual-explainer skill, then generate a comprehensive visual project recap as a self-contained HTML page.

Follow the visual-explainer skill workflow. Read the reference template, CSS patterns, and mermaid theming references before generating. Use a warm editorial or paper/ink aesthetic with muted blues and greens, but vary fonts and palette from previous diagrams.

**Time window** — determine the recency window from `$1`:
- Shorthand like `2w`, `30d`, `3m`: parse to git's `--since` format
- If `$1` doesn't match a time pattern, treat it as free-form context and use the default window
- No argument: default to `2w` (2 weeks)

**Data gathering phase** — only read files within the current working directory. Do not read paths outside the current project (no `~/.claude/`, `~/.agent/`, or cross-project memory paths):

1. **Project identity.** Read `README.md`, `CHANGELOG.md`, `package.json` / `Cargo.toml` / `pyproject.toml` / `go.mod` for name, description, version, dependencies. Read the top-level file structure.

2. **Recent activity.** `git log --oneline --since=<window>` for commit history. `git log --stat --since=<window>` for file-level change scope. `git shortlog -sn --since=<window>` for contributor activity. Identify which areas of the codebase were most active.

3. **Current state.** Check for uncommitted changes (`git status`). Check for stale branches (`git branch --no-merged`). Look for TODO/FIXME comments in recently changed files. Read plan docs, RFCs, or ADRs within the project directory if they exist.

4. **Decision context.** Read recent commit messages for rationale. Read any plan docs, RFCs, or ADRs in the project directory.

5. **Architecture scan.** Read key source files to understand the module structure and dependencies. Focus on entry points, public API surface, and the files most frequently changed in the time window.

**Verification checkpoint** — before generating HTML, produce a structured fact sheet of every claim you will present in the recap:
- Every quantitative figure: commit counts, file counts, line counts, branch counts
- Every module, function, and type name you will reference
- Every behavior and architecture description
- For each, cite the source: the git command output that produced it, or the file:line where you read it
Verify each claim against the code. If something cannot be verified, mark it as uncertain rather than stating it as fact.

**Diagram structure** — the page should include:
1. **Project identity** — a *current-state* summary: what this project does, who uses it, what stage it's at. Include version, key dependencies, and the one-sentence "elevator pitch."
2. **Architecture snapshot** — Mermaid diagram of the system as it exists today. Focus on the conceptual modules and their relationships. Wrap in `.mermaid-wrap` with zoom controls (+/−/reset/expand buttons), Ctrl/Cmd+scroll zoom, click-and-drag panning, and click-to-expand. *Visual treatment: this is the visual anchor — use hero depth.*
3. **Recent activity** — not raw git log. A human-readable narrative grouped by theme: feature work, bug fixes, refactors, infrastructure. Timeline visualization with the most significant changes called out.
4. **Decision log** — key design decisions from the time window. Extracted from commit messages, plan docs. Each entry: what was decided, why, what was considered.
5. **State of things** — *visual treatment: use the KPI card pattern — large hero numbers for working/broken/blocked/in-progress counts, with color-coded trend indicators.* A dashboard of:
   - What's working (stable, shipped, tested)
   - What's in progress (uncommitted work, open branches, active TODOs)
   - What's broken or degraded (known bugs, failing tests, tech debt items)
   - What's blocked (waiting on external input, dependencies, decisions)
6. **Mental model essentials** — the 5-10 things you need to hold in your head to work on this project effectively:
   - Key invariants and contracts
   - Non-obvious coupling
   - Gotchas (common mistakes, easy-to-forget requirements)
   - Naming conventions or patterns the codebase follows
7. **Cognitive debt hotspots** — *visual treatment: amber-tinted cards with severity indicators.* Areas where understanding is weakest:
   - Code that changed recently but has no documented rationale
   - Complex modules with no tests
   - Files that are frequently modified but poorly understood
   - Flag each with a severity and a concrete suggestion
8. **Next steps** — inferred from recent activity, open TODOs, project trajectory. Not prescriptive — "here's where the momentum was pointing when you left."

Include responsive section navigation. Use a warm visual language: muted blues and greens for architecture, amber callouts for cognitive debt hotspots, green/blue/amber/red for state-of-things status. If `--publish` is specified, write to `./docs/visual-explainer/recaps/`. Otherwise write to `/tmp/visual-explainer/`. Open the result in the browser and tell the user the file path.

Ultrathink.

$@
