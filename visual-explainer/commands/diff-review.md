---
description: Generate a visual HTML diff review — before/after architecture comparison with code review analysis
---
Load the visual-explainer skill, then generate a comprehensive visual diff review as a self-contained HTML page.

Follow the visual-explainer skill workflow. Read the reference template, CSS patterns, and mermaid theming references before generating. Use a GitHub-diff-inspired aesthetic with red/green before/after panels, but vary fonts and palette from previous diagrams.

**Scope detection** — determine what to diff based on `$1`:
- Branch name (e.g. `main`, `develop`): working tree vs that branch
- Commit hash: that specific commit's diff (`git show <hash>`)
- `HEAD`: uncommitted changes only (`git diff` and `git diff --staged`)
- PR number (e.g. `#42`): `gh pr diff 42`
- Range (e.g. `abc123..def456`): diff between two commits
- No argument: default to `main`

**Data gathering phase** — run these first to understand the full scope. Only read files within the current working directory — do not access paths outside the project:
- `git diff --stat <ref>` for file-level overview
- `git diff --name-status <ref> --` for new/modified/deleted files (separate src from tests)
- Line counts: compare key files between `<ref>` and working tree (`git show <ref>:file | wc -l` vs `wc -l`)
- New public API surface: grep added lines for exported symbols, public functions, classes, interfaces (adapt the pattern to the project's language — `export`/`function`/`class`/`interface` for TS/JS, `def`/`class` for Python, `func`/`type` for Go, etc.)
- Feature inventory: grep for new actions, keybindings, config fields, event types on both sides
- Read changed files in full — include surrounding code paths needed to validate behavior
- Check whether `CHANGELOG.md` has an entry for these changes
- Check whether `README.md` or `docs/*.md` need updates given any new or changed features
- Reconstruct decision rationale: read commit messages and PR descriptions for reasoning. Read plan docs or ADRs within the project directory.

**Verification checkpoint** — before generating HTML, produce a structured fact sheet of every claim you will present in the review:
- Every quantitative figure: line counts, file counts, function counts, test counts
- Every function, type, and module name you will reference
- Every behavior description: what code does, what changed, before vs. after
- For each, cite the source: the git command output that produced it, or the file:line where you read it
Verify each claim against the code. If something cannot be verified, mark it as uncertain rather than stating it as fact. This fact sheet is your source of truth during HTML generation — do not deviate from it.

**Diagram structure** — the page should include:
1. **Executive summary** — not just a dry before/after. Lead with the *intuition*: why do these changes exist? What problem were they solving, what was the core insight? Then the factual scope (X files, Y lines, Z new modules). *Visual treatment: this is the visual anchor — use hero depth (larger type 20-24px, subtle accent-tinted background, more padding than other sections).*
2. **KPI dashboard** — lines added/removed, files changed, new modules, test counts. Include a **housekeeping** indicator: whether CHANGELOG.md was updated (green/red badge) and whether docs need changes (green/yellow/red).
3. **Module architecture** — how the file structure changed, with a Mermaid dependency graph of the current state. Wrap in `.mermaid-wrap` with zoom controls (+/−/reset/expand buttons), Ctrl/Cmd+scroll zoom, click-and-drag panning, and click-to-expand (opens diagram full-size in new tab).
4. **Major feature comparisons** — side-by-side before/after panels for each significant area of change. Apply `min-width: 0` on all grid/flex children and `overflow-wrap: break-word` on panels.
5. **Flow diagrams** — Mermaid flowchart, sequence, or state diagrams for any new lifecycle/pipeline/interaction patterns.
6. **File map** — full tree with color-coded new/modified/deleted indicators. *Visual treatment: compact — consider `<details>` collapsed by default for pages with many sections.*
7. **Test coverage** — before/after test file counts and what's covered
8. **Code review** — structured Good/Bad/Ugly analysis of the changes:
   - **Good**: Solid choices, improvements, clean patterns worth calling out
   - **Bad**: Concrete issues — bugs, regressions, missing error handling, logic errors
   - **Ugly**: Subtle problems — tech debt introduced, maintainability concerns
   - **Questions**: Anything unclear or that needs the author's clarification
   - Use styled cards with green/red/amber/blue left-border accents. Each item should reference specific files and line ranges.
9. **Decision log** — for each significant design choice in the diff, a styled card with:
   - **Decision**: one-line summary of what was decided
   - **Rationale**: why this approach — constraints, trade-offs, what it enables. Pull from commit messages or infer from code structure.
   - **Alternatives considered**: what was rejected and why, if recoverable
   - **Confidence**: whether this rationale was explicitly documented (high) or inferred from code (medium). Low confidence means the rationale couldn't be recovered at all.
   - Visual treatment: High (green left border), Medium (blue left border, labeled "inferred"), Low (amber left border, "rationale not recoverable").
10. **Re-entry context** — a concise "note from present-you to future-you". *Visual treatment: compact — consider `<details>` collapsed by default.*
   - **Key invariants**: assumptions the changed code relies on that aren't enforced by types or tests
   - **Non-obvious coupling**: files or behaviors that are connected in ways not visible from imports alone
   - **Gotchas**: things that would surprise someone modifying this code in two weeks
   - **Don't forget**: follow-up work required (migration, config update, docs)

**Visual hierarchy**: Sections 1-3 should dominate the viewport on load. Sections 6+ are reference material and should feel lighter.

Include responsive section navigation. Use diff-style visual language: red for removed/before, green for added/after, yellow for modified, blue for neutral context. If `--publish` is specified, write to `./docs/visual-explainer/reviews/`. Otherwise write to `/tmp/visual-explainer/`. Open the result in the browser and tell the user the file path.

Ultrathink.

$@
