---
name: release-notes-enricher
description: "Enrich git-cliff release notes with detailed prose summaries by fetching and summarizing linked PRs, issues, and commits from GitHub. Use this skill whenever the user asks to 'enrich release notes', 'add detail to release notes', 'expand release notes', 'detailed release notes', 'summarize PRs in release', or wants a richer version of existing git-cliff output. Also trigger when the user says 'cliff notes detail', 'explain the release', or 'what actually happened in this release'. ALSO handles the Aurrigo dashboards' in-app release-notes.json: trigger on 'update the in-app release notes', 'backfill release notes', 'monthly release notes', or any request to refresh what the dashboards' Release Notes modal shows — this mode UPDATES the JSON file end-to-end (generate entries, insert, test, ship)."
---

# Release Notes Enricher

Transform terse git-cliff release notes into rich, narrative-driven release documentation by fetching the full story behind each linked PR, issue, and commit.

## What This Skill Produces

Given standard git-cliff output like:
```
### Features
- Port 8 authentication primitives from design handoff (#54) by @github-actions[bot] in [#54](url)
```

It produces an enriched version with a collapsed `<details>` section containing 2-7 line prose summaries for each linked item, appended below the standard notes.

## Input Sources (flexible)

Accept input from any of these — ask if ambiguous:

1. **GitHub release** — `gh release view <tag> --repo <owner/repo>`
2. **Local markdown file** — read directly
3. **Stdout/clipboard** — user pastes or pipes in the notes

Determine the `owner/repo` from:
- The release URL if fetching from GitHub
- `git remote get-url origin` in the current repo
- User-provided repo identifier

## Workflow

### 1. Parse the Release Notes

Extract every linkable reference from the git-cliff body:

| Pattern | Type | Example |
|---------|------|---------|
| `[#N](url/pull/N)` | PR | `[#54](https://github.com/org/repo/pull/54)` |
| `(#N)` without full URL | PR or Issue | `(#54)` — resolve via API |
| `in [#N]` | PR | Explicit PR link |
| Bare commit SHAs (40-char hex) | Commit | Rare in git-cliff output but handle if present |

Collect unique references. Deduplicate — the same PR might appear in multiple bullets.

### 1b. Fallback: Resolve PRs from Time Window (when no explicit links found)

Some repos have release tags on a `release` branch with only scaffold/sync commits, while the actual feature PRs merge to `main`. When the parsed notes yield zero or very few PR/issue links:

1. Get the release dates for the current and previous tags:
   ```bash
   gh api repos/{owner}/{repo}/releases/tags/{tag} --jq .published_at
   gh api repos/{owner}/{repo}/releases/tags/{prev_tag} --jq .published_at
   ```
2. Query PRs merged to the default branch in that window:
   ```bash
   gh api 'repos/{owner}/{repo}/pulls?state=closed&base=main&per_page=50&sort=updated&direction=desc' \
     --jq '[.[] | select(.merged_at != null) | select(.merged_at >= "START" and .merged_at <= "END")]'
   ```
3. Filter out version-bump and CI-noise PRs (titles matching `ci: release version`, `chore: bump version`)
4. Treat these as the linked items for enrichment

Add a note in the output: *"The release notes contain no explicit PR links. The following summaries were resolved from PRs merged to `main` between {prev_tag} ({date}) and {tag} ({date})."*

### 2. Fetch Context for Each Reference

Use `gh api` to fetch the full context. Batch requests where possible.

**For a PR:**
```bash
gh api repos/{owner}/{repo}/pulls/{number}
gh api repos/{owner}/{repo}/pulls/{number}/comments
gh api repos/{owner}/{repo}/issues/{number}/comments
```

Read: title, body, all review comments, all issue comments, linked issues (from body text like "Closes #N" or "Fixes #N"), labels, and merge status.

**For an Issue:**
```bash
gh api repos/{owner}/{repo}/issues/{number}
gh api repos/{owner}/{repo}/issues/{number}/comments
```

Read: title, body, all comments, labels, linked PRs.

**For a Commit (rare):**
```bash
gh api repos/{owner}/{repo}/commits/{sha}
```

Read: message, associated PR (if any — follow up with PR fetch).

### 3. Summarize Each Item

For each fetched item, write a **2-7 line prose summary** that captures:

- **What** changed (the actual work, not just the title)
- **Why** it was done (motivation from issue body, PR description, or discussion)
- **Key decisions** made during review (from comments — design choices, trade-offs, rejected alternatives)
- **Impact** on the system (what users/developers gain)

Guidelines for summaries:
- Write in past tense, third person ("Added...", "Migrated...", "The team decided...")
- Skip CI noise, version bumps, and bot-generated boilerplate
- If the PR/issue has no meaningful body or comments (just a title), write 1-2 lines max
- If the discussion is rich (multiple reviewers, design debate), lean toward 5-7 lines
- Do not fabricate context — only summarize what's actually in the fetched data

### 4. Format the Enriched Output

Produce the enriched release notes in this structure:

```markdown
[... original git-cliff notes unchanged ...]

---

<details>
<summary><strong>Detailed Changes</strong></summary>

#### #54 — Port 8 authentication primitives from design handoff

Added the core authentication building blocks (login flow, token refresh, session
persistence) ported from the Phase 8 design handoff document. The implementation
follows the existing pattern from AutoConnect's auth module but adapted for the
component library's composable architecture. Review discussion centered on whether
to bundle the token store or expose it as a peer dependency — settled on bundling
for simplicity since downstream consumers all use the same store.

#### #48 — Monthly release — April 2026

Routine monthly release PR that merged the accumulated work from the development
branch into main. No functional changes beyond the version bump.

</details>
```

Rules for the `<details>` block:
- One `####` heading per linked item, format: `#### #N — Title`
- Items ordered by PR/issue number ascending
- Skip items that are pure CI/version-bump noise (use judgment — if the only content is "bump version to X", omit it)
- Keep the original git-cliff body EXACTLY as-is above the `---` separator

### 5. Output

Produce all three outputs:

1. **Stdout** — print the full enriched markdown to the conversation
2. **Local file** — write to `<repo-root>/RELEASE-NOTES-<tag>.md` (or user-specified path)
3. **GitHub release update** — ask for confirmation before running:
   ```bash
   gh release edit <tag> --repo <owner/repo> --notes "$enriched_body"
   ```
   Only update if the user confirms. Show a preview first.

## Edge Cases

- **No linked PRs/issues** — some bullets are bare commits with no link. Skip enrichment for those; note "N items had no linked PR or issue" at the bottom of the details block.
- **Private repos** — `gh api` handles auth automatically via the active `gh` session.
- **Rate limits** — if fetching >30 items, add a 1-second sleep between API calls.
- **Large threads** — if a PR has >50 comments, summarize the first 20 and last 10, noting "... [N comments omitted for brevity]".
- **Cross-repo references** — if a PR references an issue in a different repo, follow it if the user has access.

## Mode: Aurrigo In-App Release Notes (release-notes.json)

The Aurrigo dashboards (FleetManagement, BHAManagement, StandManagement — RemoteSupervisor
has no release-notes UI) ship an in-app Release Notes modal reading `src/release-notes.json`.
CI's git-cliff pipeline only feeds GitHub Releases; the in-app JSON is updated by THIS skill.
When the user asks to update/backfill the in-app notes, run this mode end-to-end — it does
the updating, not just the prose. First run shipped 2026-07-23 (Fleet #147, BHA #201,
Stand #284), covering through July 2026.

Repos live under `/home/kiriketsuki/workdev/Aurrigo/AutoConnect-SIM-Sora/int-doni/<Repo>/`.
`gh auth switch --user Jovian-Aurrigo` first. Run per-repo steps from each repo's own dir.

### 1. Gather (per repo)

- Find the newest entry in `src/release-notes.json` — its date is the window start.
- List merged PRs: `gh api 'repos/aurrigo-software-dev/<Repo>/pulls?state=closed&base=main&per_page=100' --paginate` filtered to `merged_at > start`; drop ci-bump noise (`ci: release version`, `chore: bump version`).
- Thin/empty PR bodies → fetch the linked issue body (`Closes #N`). Skip comment threads unless the body is empty.

### 2. Compose entries

- **One entry per calendar month**, newest first. Skip empty months.
- `version` = the `ci: bump version to X` commit immediately after that month's last included merge — VERIFY each version string exists in `git log origin/main` before emitting.
- Schema (match the file's existing conventions for `repo` — "Fleet"/"BHA"/"Stand" — and use only ReleaseFlat-accepted types: feature, bugfix, hotfix, breaking, chore, revert):
  ```json
  { "version": "...", "date": "<ISO of month's last merge>", "type": "monthly",
    "summaryOps": "1-3 plain-language sentences — what operators notice",
    "summaryEng": "counts by type + technical themes",
    "changes": [ { "type": "...", "title": "...", "id": "#N", "repo": "...",
                   "scope": "operator|engineering",
                   "ops": "plain-language one-liner, no jargon",
                   "eng": "technical one-liner from the PR body" } ] }
  ```
- Changes ordered features → fixes → chores; fold trivial CI/docs-only PRs into one chore line or omit. No HTML entities (`&amp;`) in titles — plain `&`.

### 3. Insert + validate

- Prepend entries to `releases` (file is newest-first). Assert: no duplicate versions, all required fields present, ISO dates, no `&amp;`. Preserve the file's indent. (Reference script pattern: parse existing file, `data["releases"] = new + old`, dump with detected indent.)
- Do this on the issue auto-branch: file one `[Task] Backfill release notes ...` issue per repo (label `task`), wait ~15-30s for the auto-branch, check it out.

### 4. Ship (established Aurrigo train)

- Gates per repo: `npx vitest run` and `npm run build` green.
- Commit `docs: backfill release notes ...` with `Closes #N`; push; `gh pr ready <PR>`; `gh pr merge <PR> --squash` (hook-gated); wait for the `ci: bump version` commit on main.
- int-doni: update submodule checkouts to main, commit gitlink bump, `git pull --rebase` before push.
- Deploy: `cd ~/workdev/Aurrigo/AutoConnect-DEP-Cloud && ./tools/act-deploy.sh deploy --role frontend --branch main --force --yes`; record the manifest.
- Cadence: monthly, ~month end. The modal's fallback banner tolerates patch-drift between runs (the merge itself bumps the version past the newest entry — expected).

## Example Invocations

```
"Enrich the release notes for v26.0.0.0 in RouteVisualiser"
"Add detailed summaries to this release" [pastes cliff notes]
"Generate detailed release notes for the latest tag in AutoConnect-MEC-Miki"
"Expand the release notes in ./RELEASE-NOTES.md"
"Update the in-app release notes for the dashboards"   → Aurrigo JSON mode, end-to-end
"Do the monthly release notes"                          → Aurrigo JSON mode, end-to-end
```
