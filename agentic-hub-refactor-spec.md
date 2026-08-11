# Feature: agenKic-sKills Agentic Hub Refactor

## Context

The repo `Kiriketsuki/agenKic-sKills` (cloned at `C:\Users\Kidriel\dev\Personal\agenKic-sKills`) holds 18 skill directories at the root, a `workflows/` directory, `.github/`, and `VERSION`. The user wants it refactored into a public agentic hub: skills in a subdirectory, plus shared workflows, harness setups, terminal configs, setup scripts, and a docs site. Personal content stays in the separate `Kiriketsuki/private-sKills` repo. The design was approved in a brainstorm session; this plan formalizes it as the spec.

## Overview

**User Story**: As a public visitor, I want one hub repo with installable skills, workflows, harness configs, and guides so that I can adopt the author's agentic setup on my own machine.

**Problem**: The repo is a flat pile of skill folders. There is no install path, no docs, no shareable configs, and some content carries personal paths that block publishing.

**Out of Scope**:
- Plugin-marketplace packaging (deferred; layout keeps it possible later).
- Porting real codex / opencode / pi / hermes configs (they live on the Linux machine; this pass scaffolds structure and documents what goes where).
- Re-pointing the Linux vault symlinks (manual follow-up on that machine).

## Success Condition

> This feature is complete when a stranger can clone the repo, run `setup.sh` or `setup.ps1`, pick components, get templated configs and symlinked skills on Linux, macOS, or Windows, and browse a published GitHub Pages docs site.

## Open Questions

| # | Question | Raised By | Resolved |
|:--|:---------|:----------|:---------|
| 1 | Which private-sKills entries are promotable | audit in Phase 0 | [ ] |
| 2 | Chrysaki licence note when vendored | Claude | [ ] |

## Scope

### Must-Have
- **Phase 0 upstream sync**: forked skills updated from upstreams before restructuring.
  - brainstorm ← obra/superpowers `skills/brainstorming` (diff saved at scratchpad `upstream-brainstorming.md`; port: just-in-time visual companion offer, spec self-review step, hard terminal state wording; keep feature-spec handoff instead of writing-plans).
  - kimpeccable ← https://impeccable.style/
  - brainstorm-grill ← https://www.aihero.dev/skills-grill-me
  - visual-explainer ← https://github.com/nicobailon/visual-explainer
  - feature-spec: no upstream; instead add a user-facing explainer of Gherkin and spec concepts (docs page linked from the skill).
  - Audit https://github.com/Kiriketsuki/private-sKills for sanitizable skills to promote into this repo.
- **Layout**: `skills/` (18 moved via `git mv`), `workflows/` (stays), `harnesses/{claude-code,codex,opencode,pi,hermes}/`, `config/{tmux,zsh,statusline}/`, `setup/`, `docs/`, `mkdocs.yml`, `.github/workflows/docs.yml`.
- **Setup scripts**: `setup/setup.sh` + `setup/setup.ps1`, interactive component picker, `{{variable}}` templating from `setup/templates/`, `--profile <answers.yml>` non-interactive mode, `setup/answers.example.yml` documenting every variable. Scripts create symlinks (`ln -s` on Linux/macOS; `New-Item -ItemType SymbolicLink` on Windows with junction/copy fallback).
- **Sanitization**: no personal absolute paths, vault-specific skills generalized behind template variables, finance/gmail workflows converted to worked examples with placeholders, secrets only via env vars.
- **Docs site**: mkdocs-material on GitHub Pages. Sections: index, `setup/` (install + per-OS manual symlink guide), `skills/`, `workflows/`, `patterns/` (debugging protocol, model tiering, clip-path borders, STE writing, council patterns, Gherkin/spec explainer).

### Should-Have
- README catalog tables for skills and workflows with one-line descriptions.
- Header comment in every workflow: purpose + what to customize.
- Harness READMEs describing expected files even where content is scaffold-only.

### Nice-to-Have
- Vendored Chrysaki tmux theme copy under `config/tmux/`.
- CI lint step running kilint over docs prose.

## Technical Plan

**Affected Components**: all 18 skill dirs (move + sanitize), `workflows/*.mjs`, new `setup/`, `harnesses/`, `config/`, `docs/`, `mkdocs.yml`, `.github/workflows/docs.yml`, `README.md`.

**Data Model Changes**: none (filesystem restructure).

**Dependencies**: mkdocs-material (CI only), GitHub Pages enabled on the repo, `gh` access to private-sKills for the audit.

**Risks**:
| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| Windows symlinks need Developer Mode | High | junction/copy fallback in setup.ps1 |
| Upstream skills diverged too far to merge cleanly | Med | port targeted improvements, do not wholesale replace |
| Personal path leaks survive sanitization | Med | final grep sweep for `kiriketsuki`, `Kidriel`, `/home/`, `C:\Users` before merge |
| Linux vault symlinks break on merge | High | documented follow-up step; old paths gone only after merge |

## Acceptance Scenarios

```gherkin
Feature: Agentic hub refactor
  As a public visitor
  I want an installable hub of skills, workflows, and configs
  So that I can adopt the setup on my machine

  Rule: Installation works cross-platform

    Scenario: Interactive install on Linux
      Given a fresh clone on Linux
      When the user runs setup/setup.sh and selects only "skills"
      Then skills/* are symlinked into ~/.claude/skills/
      And no config files are written

    Scenario: Profile install on Windows without Developer Mode
      Given a fresh clone on Windows with symlinks unavailable
      When the user runs setup.ps1 --profile answers.yml
      Then components install via junction or copy fallback
      And the script reports which fallback it used

  Rule: Content is publishable

    Scenario: Sanitization sweep
      Given the refactor branch is complete
      When grepping for kiriketsuki, Kidriel, /home/, and C:\Users
      Then no matches remain outside .git

    Scenario: Docs deploy
      Given a push to main
      When the docs workflow runs
      Then the mkdocs site publishes to GitHub Pages with all five sections
```

## Task Breakdown

| ID | Task | Priority | Dependencies | Status |
|:---|:-----|:---------|:-------------|:-------|
| T0 | Branch `refactor/agentic-hub` | High | None | pending |
| T1 | Phase 0: diff + port upstream changes (brainstorm, kimpeccable, brainstorm-grill, visual-explainer) | High | T0 | pending |
| T1.1 | Audit private-sKills, promote sanitizable skills | High | T0 | pending |
| T2 | `git mv` 18 skills into `skills/` | High | T1 | pending |
| T3 | Scaffold `setup/`, `harnesses/`, `config/`, `docs/` | High | T2 | pending |
| T4 | Sanitize skills and workflows; add workflow header comments | High | T2 | pending |
| T5 | Port tmux/zsh/statusline configs as templates; vendor Chrysaki | Med | T3 | pending |
| T6 | Write setup.sh / setup.ps1 with picker, templating, symlinks, --profile | High | T3 | pending |
| T7 | Write docs content (incl. Gherkin explainer, per-OS symlink guide) + mkdocs.yml + Pages CI | High | T3 | pending |
| T8 | README rewrite with catalogs; final sanitization grep sweep | High | T4,T6,T7 | pending |
| T9 | Follow-up (Linux machine): re-point vault symlinks | Med | merge | pending |

One commit per task, conventional commit format.

## Exit Criteria

- [ ] All Must-Have scenarios pass (manual verification; no CI test suite exists)
- [ ] Sanitization grep sweep returns zero matches
- [ ] Docs site builds and deploys from CI
- [ ] setup.sh and setup.ps1 both complete a skills-only install on their platforms

## References

- Upstreams: obra/superpowers, impeccable.style, aihero.dev/skills-grill-me, nicobailon/visual-explainer
- Private source: github.com/Kiriketsuki/private-sKills
- Saved diff: scratchpad/upstream-brainstorming.md

## Verification

1. Run `setup/setup.sh` in a temp HOME on Git Bash: select skills only, confirm symlinks.
2. Run `setup.ps1 -Profile setup/answers.example.yml` on this Windows machine, confirm fallback path.
3. `mkdocs build --strict` locally or in CI.
4. Grep sweep: `rg -i "kiriketsuki|kidriel|/home/|C:\\\\Users" --glob '!.git'`.

---
*Authored by: Clault KiperS 4.6*
