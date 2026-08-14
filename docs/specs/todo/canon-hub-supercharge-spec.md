# Feature: Canon Hub Supercharge

## Overview

**User Story**: As the hub author, I want the canon hub to install my full
environment, skills in groups, external rice components, and a guided
onboarding path, so that a fresh machine reaches my complete setup from one
entry point.

**Problem**: The canon hub has a flat 23-skill tree with one all-or-nothing
manifest, a statusline that is only a README pointer to chrysaki-claude, no
link to the dots or chrysaki repos, and no onboarding path. The Aurrigo hub
now carries a richer, proven onboarding stack that the canon hub lacks.

**Out of Scope**: Any change to aurrigo-agentic-hub (frozen donor). Any sync
mechanism between the hubs. A backport of the Aurrigo 816-line installer
wizard. Absorbing statusline, theme, or dots content into canon (sibling
repos stay sources of truth). A Chrysaki restyle of the onboarding deck.

## Success Condition

> This feature is complete when a fresh Linux or macOS machine, using only
> canon's README.md and docs/WALKTHROUGH.md, installs chosen skill groups and
> external components (statusline, tmux theme, dots) through setup.sh,
> attaches and detaches a tmux session, opens the command palette, and
> completes a first skill run, unaided.

## Open Questions

| # | Question | Raised By | Resolved |
|:--|:---------|:----------|:---------|
| 1 | None. All decisions resolved during brainstorm. | - | [x] |

## Scope

### Must-Have
- Skills regroup: `skills/` moves from 23 flat dirs to four groups.
  Acceptance: every skill sits in exactly one group, no flat dirs remain.
  - `core/`: brainstorm, brainstorm-grill, feature-spec, implement-spec,
    merge-next, context-handoff, context-resume, agent-route, model-route
  - `council/`: adversarial-council, council-fix, council-supervisor,
    parallel-fix
  - `writing/`: ste-writing, kilint, visual-explainer, cover-letter
  - `ops/`: repo-hooks, security-scan, croc-send, release-notes-enricher,
    insights-to-vault, continuous-learning-v2
- Per-group component manifests (`skills-core.conf`, `skills-council.conf`,
  `skills-writing.conf`, `skills-ops.conf`) replace `skills.conf`.
  Acceptance: the installer picker lists the four groups, and the skills step
  re-creates per-skill symlinks from the new group paths.
- `setup/relink.sh`: one-shot script that repairs the vault symlinks
  (`000-System/Skills/<name>` targets) after the regroup. Acceptance: after a
  run, every vault skill symlink resolves.
- Grep sweep: every `skills/<name>` reference in docs, manifests, and mkdocs
  nav updates to the group path. Acceptance: no dangling reference remains.
- Installer growth on canon's own trunk (no wizard backport): a new manifest
  `type=external` with keys `repo=`, `clone_to=`, `method=script|stow`,
  `run=`. Apply clones or pulls the repo, then delegates to its own installer
  (`method=script`) or stows (`method=stow`). `--dry-run` prints the
  clone-and-run plan with no disk change. Acceptance: all three ext
  components install and dry-run cleanly.
- Three external components:
  - `ext-statusline`: clones Kiriketsuki/chrysaki-claude and runs its
    installer. The `config/statusline/` README pointer becomes a real
    install path.
  - `ext-tmux-theme`: installs the chrysaki theme into `~/.config/tmux/` and
    activates the `{{tmux_theme_conf}}` source line in the rendered conf.
  - `ext-dots`: clones Kiriketsuki/dots and applies it with stow.
- Command palette: `config/tmux/scripts/palette.sh` plus the Section 8
  binding, copied from the Aurrigo port. Acceptance: Prefix+Space opens the
  palette, and the script prints an install hint when fzf is absent.
- `setup/walkthrough.sh`: canon adaptation of the Aurrigo script. Same five
  steps, checks driven by the new group and ext manifests. The statusline
  step is ext-aware: when `ext-statusline` is not installed, it offers the
  install instead of failing. Acceptance: completes on a machine without
  gum, resumes from saved state, `--reset` clears it.
- `docs/WALKTHROUGH.md`: canon edition. Tiered path, command-first steps,
  the any-skill capstone, the 80 percent handoff trigger. The extras section
  documents the real `ext-*` components instead of prose pointers.
  Aurrigo-specific content does not carry over.
- README landing rework: Start Here table with deep links into WALKTHROUGH
  tiers plus a short quick start above the fold, catalogue below.
- `docs/tips/`: claude-md-curation, hooks, linters, multi-account, ported
  from the donor. All new docs pages wired into `mkdocs.yml` nav.

### Should-Have
- kilint pass on all new and ported prose (under 1.5 violations per 100
  words).

### Nice-to-Have
- `ext-*` components report the cloned repo's HEAD sha in the install
  summary.

## Technical Plan

**Affected Components**: `skills/` (regroup), `setup/setup.sh`,
`setup/components/` (four new skill manifests, three ext manifests,
`skills.conf` removed), new `setup/relink.sh`, new `setup/walkthrough.sh`,
`config/tmux/tmux.conf.tmpl` and new `config/tmux/scripts/palette.sh`,
`README.md`, new `docs/WALKTHROUGH.md`, new `docs/tips/` (4 files),
`mkdocs.yml`.

**Data Model Changes**: New walkthrough state file
`~/.cache/agentic-hub/walkthrough-state` (one line per completed step).
External manifests add four keys (`repo`, `clone_to`, `method`, `run`) to the
flat key=value manifest format.

**API Contracts**: Not applicable.

**Dependencies**: gh (clone path), git, stow (ext-dots only), fzf (palette
only, guarded), gum (optional), tmux. Sibling repos: Kiriketsuki/dots,
Kiriketsuki/chrysaki (submodule of dots), Kiriketsuki/chrysaki-claude. All
public.

**Risks**:
| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| Regroup breaks vault and ~/.claude skill symlinks | High | setup skills step re-links from group paths, relink.sh repairs the vault, both run in the same change |
| Ext delegate scripts change interface upstream | Medium | manifests pin the run entry point, install summary prints the repo sha |
| Walkthrough drifts from installer components | Medium | step checks derive from setup/components/ manifests, nothing hardcoded |
| Donor content carries Aurrigo references | Low | grep sweep for aurrigo, github-work, org URLs before commit |

## Acceptance Scenarios

```gherkin
Feature: Canon Hub Supercharge
  As the hub author
  I want grouped skills, external components, and a guided onboarding path
  So that a fresh machine reaches my complete setup from one entry point

  Background:
    Given a fresh Linux or macOS machine with git, tmux, and gh installed

  Rule: The installer delivers grouped skills

    Scenario: Group picker
      When the user runs setup/setup.sh
      Then the component picker lists skills-core, skills-council, skills-writing, and skills-ops
      And selecting a group symlinks each of its skills individually

    Scenario: Vault relink after regroup
      Given the vault symlinks point at the old flat paths
      When the user runs setup/relink.sh
      Then every vault skill symlink resolves to the new group path

  Rule: External components delegate, never absorb

    Scenario: Statusline via chrysaki-claude
      When the user selects ext-statusline
      Then setup clones Kiriketsuki/chrysaki-claude and runs its installer
      And the statusline renders after a Claude Code restart

    Scenario: Dry-run stays clean
      When the user runs setup/setup.sh --dry-run with ext components selected
      Then the plan prints every clone and delegate action
      And nothing on disk changes

    Scenario: Theme activation
      When the user selects ext-tmux-theme
      Then the chrysaki theme lands in ~/.config/tmux/
      And the rendered tmux.conf sources the theme file

  Rule: The onboarding path works unaided

    Scenario: Palette without fzf
      Given fzf is not installed
      When the user presses Prefix+Space
      Then tmux displays an install hint and nothing crashes

    Scenario: Ext-aware walkthrough
      Given ext-statusline is not installed
      When the walkthrough reaches the statusline step
      Then it offers the ext-statusline install instead of failing

    Scenario: Cold-start completion
      Given the user has only README.md and docs/WALKTHROUGH.md
      When they follow the Basics tier end to end
      Then the hub installs, a tmux session attaches and detaches, and a first skill run completes
      And no step required outside help
```

## Task Breakdown

| ID   | Task | Priority | Dependencies | Status  |
|:-----|:-----|:---------|:-------------|:--------|
| T1   | Regroup skills/ into core, council, writing, ops | High | None | pending |
| T1.1 | Write the four per-group manifests, remove skills.conf, update the installer skills step to per-skill symlinks | High | T1 | pending |
| T1.2 | Write setup/relink.sh and run the docs grep sweep | High | T1 | pending |
| T2   | Add type=external to setup.sh with dry-run support | High | None | pending |
| T2.1 | Write ext-statusline, ext-tmux-theme, ext-dots manifests | High | T2 | pending |
| T3   | Port palette.sh and the Section 8 binding into config/tmux | Med | None | pending |
| T4   | Adapt setup/walkthrough.sh to canon manifests with the ext-aware statusline step | High | T1.1, T2.1 | pending |
| T5   | Write docs/WALKTHROUGH.md canon edition | High | T2.1 | pending |
| T6   | Rework README.md as the Start Here landing page | Med | T5 | pending |
| T7   | Port docs/tips/ (4 files) and wire mkdocs.yml nav | Med | T5 | pending |
| T8   | kilint pass on all new prose | Med | T5, T6, T7 | pending |
| T9   | Sandbox smoke: HOME=$(mktemp -d) run of setup.sh with ext components | Med | T2.1 | pending |
| T10  | Cold-start test on a fresh machine | Med | T4, T5, T6 | pending |

## Exit Criteria

- [ ] All Must-Have scenarios pass by manual run-through
- [ ] shellcheck and bash -n clean on setup.sh, walkthrough.sh, palette.sh, relink.sh
- [ ] --dry-run exercised for every new component type with no disk change
- [ ] Vault and ~/.claude skill symlinks all resolve after the regroup
- [ ] kilint reports under 1.5 violations per 100 words on new prose
- [ ] Cold-start test passes unaided

## References

- Donor: aurrigo-agentic-hub (walkthrough.sh, WALKTHROUGH.md, palette port,
  tips docs, README pattern), frozen at main 7d7f1b0
- Sibling repos: Kiriketsuki/dots, Kiriketsuki/chrysaki,
  Kiriketsuki/chrysaki-claude
- Donor spec: aurrigo-agentic-hub docs/specs/todo/lower-barrier-onboarding-spec.md

---
*Authored by: Clault KiperF 5.0*
