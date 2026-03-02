---
name: repo-scaffolder
description: Use when the user wants to create or document a Repo note from an existing repository. Triggers: "Scaffold repo for [Name]", "Document repo [path]", "Create repo note for [name]".
---

## Context
This skill is triggered when the user says "Scaffold repo for [Name]", "Document repo [path]", or "Create repo note for [name]".
It produces a well-formed Repo note from a repository path, auto-detecting the repo type (frontend/backend) and populating frontmatter and content sections from real repo data.

## Inputs Required
- **Repo path**: Absolute or relative path to the repository on disk. Read from user message or ask if not provided.
- **Repo name**: Human-readable note title. Infer from the directory name if not stated.
- **Parent note**: The project or parent repo note this repo belongs to. Ask user if not clear from context.
- **Org**: `Aurrigo`, `NP`, or other. Infer from path (`<work-dir>/...`) or ask.

## Workflow

### Step 1 -- Gather
1. List the repo root directory (1-2 levels deep).
2. Read `README.md` (or `README.rst`) if it exists -- use the intro paragraph for the Overview draft.
3. Read the relevant dependency manifest: `package.json` (Node/Vue/React/Svelte), `pyproject.toml` or `requirements.txt` (Python), `pom.xml` (Java), `go.mod` (Go), `Cargo.toml` (Rust).
4. Run `git -C [repo-path] log --oneline -20` to get recent commit history.
5. Run `git -C [repo-path] rev-parse --short HEAD` to get the current git hash.

### Step 2 -- Detect Type
Classify as **frontend** if any of these are true:
- `package.json` lists a UI framework as a dependency (`vue`, `react`, `svelte`, `@angular/core`, `solid-js`, `nuxt`, `next`).
- A `src/views/`, `src/pages/`, or `src/components/` directory exists.

Classify as **backend** if any of these are true:
- `main.py`, `app.py`, `server.py`, `pom.xml`, `go.mod`, `Cargo.toml` exist at the root.
- `package.json` lists a server framework (`express`, `fastify`, `@nestjs/core`, `hapi`).
- A `src/api/`, `src/routes/`, or `src/controllers/` directory exists at any depth.

If both signals are present (monorepo or full-stack repo) or neither is clear, default to the **Universal Repo Template** and note the ambiguity in `## Notes`.

### Step 3 -- Select Template
- Frontend detected: `000-System/Templates/Frontend Repo Template.md`
- Backend detected: `000-System/Templates/Backend Repo Template.md`
- Ambiguous or universal: `000-System/Templates/Repo Template.md`

### Step 4 -- Populate Frontmatter
Replace all `{{...}}` placeholders:
- `title`: Repo name
- `org`: Detected or confirmed org (capitalize first letter: `Aurrigo`, `NP`)
- `parent`: `"[[ParentNoteName]]"` -- ask user if not determinable
- `path`: Full canonical path to repo on disk (use `\\` on Windows, `~/` or absolute on Linux/Mac)
- `techStack`: Comma-separated list of primary technologies (e.g. `Vue 3, Vite, Tailwind CSS`)
- `git-hash`: Short hash from Step 1 (quoted string)
- `last-doc-sync`: Today's date in `YYYY-MM-DD` format (quoted string)
- `tags`: At minimum `work/[org-lowercase]`. Add `tech/[framework]` tags for each main dependency detected (e.g. `tech/fastapi`, `tech/mongodb`, `tech/vue`).

### Step 5 -- Populate Content
Using information gathered in Step 1:
- **Overview**: Draft from README introduction. Extract tech stack line, version, package manager. Keep factual.
- **Tech Stack table** (backend only): Fill from dependency manifest. Map to Component | Technology | Notes columns.
- **Project Structure** (backend only): Use the directory listing to draft a 2-3 level tree. Annotate key files with inline comments.
- **Development Environment**: Extract commands from `Makefile` targets, `package.json` `scripts` block, or README "Getting Started" / "Usage" sections.
- **Changelog**: Populate from `git log --oneline -20` output. Format as the `| Hash | Author | Message |` table under a `### [today] Initial doc sync` heading.
- **All remaining architecture, API, and component sections**: Leave as `<!-- TODO: populate from code inspection -->` placeholders. Do not fabricate content.

### Step 6 -- Place Note
1. Confirm destination with user: "Placing note at `100-Projects/110-Active/[Org]/[Project]/[RepoName] - Repo/[RepoName].md`. Confirm or specify a different path."
2. Create the folder if it does not exist.
3. Write the note at the confirmed path.

### Step 7 -- Link Back
1. Open the parent project note.
2. Locate or create a `## Repos` section.
3. Append: `- [[RepoName]]`
4. Append a log entry to today's Daily Note (`500-Chronological-Logs/510-Personal/YYYY/MMM-DD.md`) under `## Daily Focus`:
   `- [x] Scaffolded repo note: [[RepoName]]`

## Guidelines
- **Do not overwrite** an existing repo note without explicit user confirmation.
- **Do not fabricate** API endpoints, component names, or service descriptions. Use `<!-- TODO -->` for anything not derivable from Step 1 sources.
- If README is absent, note this in `## Notes` and leave Overview as `<!-- TODO: no README found. Populate manually. -->`.
- If git history is unavailable, note this in the Changelog section.
- Respect the Emoji Mandate: no emojis anywhere in generated notes.
- All frontmatter must conform to the vault schema:
  - Required: `title`, `type`, `status`, `org`, `parent`, `path`, `tags`
  - Banned: `#` prefix inside tag values, inline tag arrays, `[[...]]` inside tag values, `category` property
- Bidirectional linking is mandatory: repo note links to parent, parent note links back to repo.
