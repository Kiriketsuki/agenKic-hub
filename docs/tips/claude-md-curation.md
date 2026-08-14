# CLAUDE.md Curation

CLAUDE.md files load into every Claude Code session in their scope. They
are the docs with the most impact, and the easiest to ruin. This guide
covers where they live, what belongs in each, and how to keep them short.

## The gitignored per-repo convention

Each repo carries its own CLAUDE.md at the repo root, and **every repo
gitignores it**:

```
# .gitignore
CLAUDE.md
```

Why gitignore it:

- It changes often and per developer, so it generates noisy diffs.
- It may reference local paths, accounts, and machine details that do not
  belong in the repo history.
- Tool-generated sections, such as a gitnexus index summary, rewrite
  themselves on reindex.

Version team-shared conventions in a committed file such as
`.github/copilot-instructions.md` or `CONTRIBUTING.md`. CLAUDE.md can
point at them.

## Workspace-level vs repo-level

Claude Code loads every CLAUDE.md from the current directory up to the
filesystem root. A workspace root file and a repo file both apply, so split
content by scope:

| Scope | File | Contents |
|---|---|---|
| Workspace | `<workspace>/CLAUDE.md` | Cross-repo conventions: git remote aliases, issue and branch workflow, versioning scheme, the repo directory map, package-manager policy |
| Repo | `<repo>/CLAUDE.md` | This repo only: run and test commands, architecture summary, local conventions, gotchas |

Never duplicate. A rule stated at workspace level does not repeat at repo
level. Duplication drifts, and the two copies eventually disagree.

## What belongs in a repo CLAUDE.md

- Commands: how to install, run, test, and lint, with exact invocations.
- A short architecture map: the main directories and what lives in each.
- Conventions the model would otherwise guess wrong: naming, commit
  format, protected files.
- Hard rules for tooling, such as a gitnexus impact-before-edit rule.

## What does not belong

- Anything the model can read from the code in seconds, such as a full
  API listing or a dependency inventory.
- Long prose explanations. Link to a doc in `docs/` instead.
- Stale state: version numbers, TODO lists, sprint plans.
- Generic advice the model already follows, such as "write clean code".

## Keeping them short

Every line costs context in every session. Budget accordingly:

- Aim under about 100 lines for a repo file. A workspace file can run
  longer because it serves many repos.
- Prefer tables over paragraphs. The model scans tables well.
- Review the file whenever it misleads a session. A CLAUDE.md that caused
  a wrong action is a bug. Fix it the same day.
- Delete before you add. When a section has not changed behavior in
  months, cut it or move it to `docs/`.

## Quick checklist

- [ ] CLAUDE.md is in `.gitignore`.
- [ ] No content duplicated between workspace and repo level.
- [ ] Every command in it runs as written.
- [ ] No stale versions, paths, or plans.
- [ ] Under about 100 lines, tables preferred.
