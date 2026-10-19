# Feature: Fork Overlay

## Overview

**User Story**: As the maintainer of both repos, I want a tool to generate
the Aurrigo fork as an overlay of a pinned hub tag. Then a hub fix
reaches the fork through a tag bump instead of a hand copy.

**Problem**: The private work fork is
a hand-copied snapshot. Its workflows lack the hub's later fixes. For example,
the fork `council-loop.mjs` differs from the hub copy in 740 diff lines, and it
lacks the model clamp and the #26 gates. The fork installer is ahead of the hub
in other places: `--uninstall`, a state ledger, `--update`, 32 template
variables with detected defaults, and Nerd Fonts. Each side drifts on its own.

**Out of Scope**:

- Any change to the fork repo in this PR. This PR delivers the spec only.
- A path rename map between hub and fork. The overlay keeps hub paths as they
  are. A file that needs a different path stays fork-owned.
- The plugin marketplace layout of #31. This spec keeps globs so that #31 only
  edits the include list.
- Hub-to-fork sync of `.github/`. Each repo keeps its own CI and automation.
- A merge of the fork `config/` tree (statusline, tmux, zsh) into the hub.
- GitNexus content in the fork. The user disabled GitNexus on 2026-09-11.

---

## Success Condition

> This feature is complete when one `fork-sync apply` run opens a fork PR
> that brings each selected hub file to the tag and passes the local gates. A second run against the same tag changes nothing.

---

## Open Questions

Every question has a recommended answer. The spec assumes the recommendation
until the maintainer overrides it.

| # | Question | Recommendation | Raised By | Resolved |
|:--|:---------|:---------------|:----------|:---------|
| 1 | The hub has no git tag. Its `release.yml` tags only on a merge into a `release` branch, and that branch does not exist. Where do tags come from? | Extend `version-bump.yml` to push an annotated `v<VERSION>` tag after each bump commit on `main`. Tag `v26.0.6.2` by hand once. Hub runners work, so the hub needs no fallback. | Spec author | [ ] |
| 2 | Where does the fork file map live? The hub is public and the fork is private. | Split it. The hub holds the generic tool and the personal deny list. The fork holds `.hub-overlay.toml` with its include list and owned paths, so no Aurrigo path name reaches the public hub. | Spec author | [ ] |
| 3 | Allowlist or denylist for the export? | Allowlist. The fork lists the hub paths it takes. The hub deny list stays as a backstop. A new hub file never reaches the fork until the fork lists it. | Spec author | [ ] |
| 4 | The fork renders `{{workflows_dir}}` in its workflow headers, but `link_children` symlinks workflows and never renders them. Keep the placeholder? | No. Fork headers use the literal `$HOME/.claude/workflows`. The sync tool fails when a header file contains `{{`. | Spec author | [ ] |
| 5 | Should the hub carry its own `CUSTOMIZE BEFORE FIRST USE` headers? | Yes. Generic headers help hub users too. The sync tool then swaps the hub header block for the fork header block by its marker line. | Spec author | [ ] |
| 6 | How does the fork bump its version while hosted runners are blocked by billing? | The sync PR carries its own bump commit while `.hub-overlay.toml` sets `version_bump = "local"`. Set it to `"actions"` when runners return, and the tool stops the bump. | Spec author | [ ] |
| 7 | Which branch type does a sync PR use in the fork? | `task/<n>-sync-hub-<tag>`. The fork already uses `task/` branches, and its bump rules map `task/*` to a patch bump. | Spec author | [ ] |
| 8 | The fork has an Aurrigo variant of `release-notes-enricher` in `skills/aurrigo/`. The hub has its own copy in `skills/ops/`. Which wins? | The fork variant wins. The fork lists the hub copy under `shadow`, so the tool skips it and the two names never collide in `~/.claude/skills`. | Spec author | [ ] |
| 9 | Do `croc-send` and `insights-to-vault` reach the fork? | No. `croc-send` assumes a personal tailscale relay. `insights-to-vault` writes into a personal vault. Both go on the hub deny list. | Spec author | [ ] |
| 10 | Should the sync tool create the fork issue itself? | Not in v1. `apply --push` requires `--issue N`. The tool prints the `gh issue create` command when the flag is missing. | Spec author | [ ] |
| 11 | Does the fork keep `config/hooks/` or adopt `harnesses/claude-code/`? | Keep `config/hooks/` fork-owned until port step P7 lands the settings merge helper in the hub. Then adopt the hub harness and keep only `gh-auth-switch.sh` fork-owned. | Spec author | [ ] |
| 12 | Fork branch protection may require status checks that cannot run while billing blocks runners. | Do not require hosted checks while billing blocks them. The PR body carries the local `fork-sync verify` report as the gate record. | Spec author | [ ] |

---

## Scope

### Must-Have

- **File map**: `.hub-overlay.toml` in the fork classifies every tracked fork
  path as hub-managed or fork-owned. Acceptance: `fork-sync plan` exits 1 and
  names each unclassified path.
- **Sanitize rules**: the hub deny list and the content patterns below block
  every personal path. Acceptance: a planted personal home path line in an
  exported file fails `plan`, `apply` and the hub `export-gate` job.
- **Installer port steps P1 to P6**: the hub gains each fork installer
  feature in its own PR. Acceptance: each step has a smoke test that runs with
  `HOME=$(mktemp -d)` in hub CI.
- **Sync tool** in `tools/fork-sync/` with `plan`, `apply`, `verify` and
  `gate`. Acceptance: a second `apply` on the same tag reports "in sync" and
  creates no branch, commit or PR.
- **Release flow**: hub tag, sync run, fork PR, fork version bump.
  Acceptance: one dry run of the full flow against a fixture fork passes in
  hub CI.
- **CI on both sides** with a local fallback for the fork. Acceptance:
  `fork-sync verify` runs every fork CI job locally with no GitHub Actions.
- **Migration steps M0 to M11**: each ships alone and has a rollback.

### Should-Have

- Port step P7: the hook settings merge helper moves into
  `harnesses/claude-code/`.
- A Windows job in hub CI that runs `setup.ps1` for each port step.
- `plan --json` output for scripts.

### Nice-to-Have

- `apply --create-issue` files the fork task issue from the fork template.
- A hub changelog section in the fork PR body, grouped by hub PR.

---

## Technical Plan

**Affected Components**: hub `tools/fork-sync/` (new), hub `setup/setup.sh`,
`setup/setup.ps1`, `setup/components/*.conf`, `setup/answers.example.yml`,
new `setup/hub.conf`, new `setup/tests/`, hub `.github/workflows/ci.yml` and
`version-bump.yml`, hub `workflows/*.mjs` headers, five hub lines with vault
paths, new `docs/tools/fork-sync.md`. Fork changes ship later, in steps M8 to
M11.

**Data Model Changes**:

- Fork `.hub-overlay.toml`: the overlay config. Schema below.
- Fork `.hub-overlay/lock.json`: the pin. It records the hub tag, the hub
  commit, the tool version and one sha256 per hub-managed file.
- Fork `.hub-overlay/headers/<workflow>.txt`: the fork workflow headers.
- Hub `setup/hub.conf`: installer brand name, banner text and state file path.
- Installer state file: `~/.claude/.<tool>-install.json`, schema 2. Schema 2
  adds a sha256 for each copy or render action.

**API Contracts**: Not applicable. The CLI contract is in the Sync Tool
section.

**Dependencies**: git, Python 3.11 or later (for `tomllib`), `gh` for `--push`,
the work `gh` account for the fork, and Node 24 for the workflow smoke tests.

### File Map

The map below comes from `diff -rq` of the two trees and from `git ls-files`
in each repo on 2026-10-19. The hub had 254 tracked files and the fork had
222. "Hub-managed" means the sync tool writes the file from the hub tag.
"Fork-owned" means the sync tool never touches the file.

**Copy as-is (hub-managed, phase A, step M8)**:

| Hub path | Note |
|:---------|:-----|
| `workflows/feature-loop.md`, `workflows/spec-loop.md` | Driver docs |
| `workflows/spec-loop.smoke.mjs`, `workflows/workflows.smoke.mjs` | Needed by fork CI |
| `skills/core/**` | Four hub core skills are new to the fork. The other eight differ from the fork copies |
| `skills/council/**` | Replaces fork `skills/core/adversarial-council` |
| `skills/writing/**` except `cover-letter` | Replaces fork `skills/core/kilint` and `skills/core/ste-writing` |
| `skills/ops/**` except `croc-send`, `insights-to-vault` and the shadowed `release-notes-enricher` | `continuous-learning-v2`, `repo-hooks`, `security-scan` |
| `docs/patterns/**` | Generic articles. Links point at the public hub |
| `tools/stream-launcher/**`, `docs/tools/stream-launcher.md` | Identical today except two links |
| `tools/fork-sync/**` | The fork CI job runs `verify` from this copy |

**Render (hub-managed with a transform)**:

| Hub path | Transform |
|:---------|:----------|
| `workflows/autofix-swarm.mjs`, `council-loop.mjs`, `feature-loop.mjs`, `spec-loop.mjs`, `ultracode-fix.mjs`, `ultracode-implement.mjs` | Header swap. The tool replaces the first comment block whose second line is ` * CUSTOMIZE BEFORE FIRST USE` with `.hub-overlay/headers/<name>.txt`. When the hub file has no such block, the tool puts the fork header above line 1. |
| `skills/**/SKILL.md` | Origin line. The tool adds `origin: https://github.com/Kiriketsuki/agenKic-hub` after the `name:` frontmatter line when no `origin:` line exists. The fork CI already allows this line. |

The tool applies no other content rewrite. A personal path in a hub file is a
hub bug. The fix lands in the hub, and the sync fails until it does.

**Copy as-is in phase B (hub-managed from step M9)**: `setup/setup.sh`,
`setup/setup.ps1`, `setup/tests/**`, and `setup/components/` for
`skills-core`, `skills-council`, `skills-writing`, `skills-ops`, `workflows`
and `harness-claude-code`. Phase B starts only after P1 to P6 ship in a hub
tag, because the fork installer must not lose a feature.

**Fork-owned (the tool never writes these)**:

| Fork path | Reason |
|:----------|:-------|
| `skills/aurrigo/**`, `skills/meetings/**`, `skills/project/**`, `skills/fun/**` | Fork skill groups |
| `setup/components/skills-aurrigo.conf`, `skills-meetings.conf`, `skills-project.conf`, `skills-fun.conf`, `config-hooks.conf` | Fork components |
| `setup/answers.example.yml`, `setup/hub.conf`, `setup/walkthrough.sh`, `setup/README.md` | Fork variables, brand and onboarding |
| `setup/**` (phase A only) | The installer stays fork-owned until phase B |
| `config/**` | Account-aware statusline, the full tmux port, the zsh fragment |
| `docs/tips/**`, `docs/WALKTHROUGH.md`, `docs/aurrigo-agentic-hub.md`, `docs/deck/**`, `docs/specs/**` | Aurrigo text |
| `README.md`, `AGENTS.md`, `VERSION`, `.gitignore`, `.github/**` | Repo identity, version and CI |
| `.hub-overlay.toml`, `.hub-overlay/**` | The overlay config, lock and headers |

**Never export (hub deny list, `tools/fork-sync/never-export.txt`)**: the
tool refuses these paths even when an include glob matches them.

```text
workflows/financial-data-pipeline.mjs
workflows/gmail-recurring-payments.mjs
workflows/spending-habits-categorizer.mjs
workflows/spec-loop-spec.md
skills/writing/cover-letter/**
skills/ops/insights-to-vault/**
skills/ops/croc-send/**
setup/relink.sh
setup/components/ext-dots.conf
docs/specs/**
docs/decks/**
docs/assets/**
docs/stylesheets/**
docs/index.md
docs/skills/index.md
docs/workflows/index.md
docs/WALKTHROUGH.md
.github/**
README.md
mkdocs.yml
VERSION
answers.yml
**/__pycache__/**
**/.pytest_cache/**
**/*.bak
.gitnexus/**
```

**Available but not selected**: `workflows/ai-co-scientist.mjs`,
`workflows/feature-spec.mjs`, `harnesses/{codex,hermes,opencode,pi}/**`,
`setup/components/ext-statusline.conf`, `setup/components/ext-tmux-theme.conf`,
`config/**` and `docs/setup/**`. The fork can add any of them to its include
list later.

**Path changes the first sync makes in the fork**:

| Fork path today | Hub path after sync |
|:----------------|:--------------------|
| `skills/core/kilint/` | `skills/writing/kilint/` |
| `skills/core/ste-writing/` | `skills/writing/ste-writing/` |
| `skills/core/adversarial-council/` | `skills/council/adversarial-council/` |

The fork must update three fork-owned files in the same PR. `AGENTS.md` names
`skills/core/kilint` and `skills/core/ste-writing`. The fork `ci.yml` jobs
`kilint-gate` and `kilint-tests` name `skills/core/kilint`. The fork
`skills-core.conf` description names kilint and ste-writing.

### Sanitize Rules

The content gate runs on every hub-managed output file before the tool
writes it. It also runs in the hub `export-gate` job on every hub file that the
deny list does not exclude. Each pattern is an extended regular expression.
The gate matches it without case.

**Tier 1, deny (error everywhere)**. Personal data must never leave the hub.
The patterns cover the personal home path, the vault name, vault-relative
paths, the personal email, the personal SSH host alias and the personal
config directory.

**Tier 2, review (error in the fork export set, warning in the hub gate)**.
Personal sibling repos are public, but the fork does not use them. The
pattern covers the dots, chrysaki and chrysaki-claude repos.

**Tier 3, reverse leak (error in hub CI on every hub PR)**. Work data must
never reach the public hub through a port step. The patterns cover the
private org name, the work GitHub account, the work SSH host alias, the work
workspace path, internal hostnames and production service names.

**Where the literal patterns live**. The public hub must not hold the literal
tier 1 and tier 3 values, because the list itself would leak them. The gate
reads them from an untracked file, `tools/fork-sync/deny-patterns.local`, on
the maintainer machine. Hub CI reads the same list from a repository secret,
`FORK_SYNC_DENY_PATTERNS`. A missing list fails the gate closed.

**Allowed lines**: an `origin:` frontmatter line or a link that names
`Kiriketsuki/agenKic-hub`. The hub is public, and the link is attribution. The
bare word "Aurrigo" stays allowed, because the hub agent catalog names the
Aurrigo Visual Explainer agent.

**Path rules**: the tool rejects a symlink, an absolute path, a path with
`..`, and any output path outside the fork root. It skips binary files in the
content gate and lists them in the plan.

**Hub hygiene before the first sync (step M1)**. The scan on 2026-10-19 found
five tier 1 hits in exportable hub files:

| File:line | Hit |
|:----------|:----|
| `skills/core/feature-spec/SKILL.md:167` | `000-System/Agents/AGENTS.md` |
| `skills/writing/kilint/SPEC.md:30` | `000-System/Scripts/kilint/` |
| `skills/writing/kilint/SPEC.md:293` | `000-System/Scripts/kilint/README.md` |
| `workflows/spec-loop.md:220` | `000-System/Agents/Claude/workflows/spec-loop.smoke.mjs` |
| `workflows/spec-loop.smoke.mjs:19` | `000-System/Agents/Claude/workflows/spec-loop.smoke.mjs` |

### Installer Port Steps

The fork `setup/setup.sh` has 816 lines and the hub copy has 498. The fork
`setup.ps1` has 612 lines and the hub copy has 228. Each step below is one hub
issue and one hub PR. Each PR changes `setup.sh` and `setup.ps1` together and
adds a smoke test to `setup/tests/`.

The port keeps every hub safety feature: `type=external`, `--force`,
`clear_target`, unique backup names, the failure count and the strict check
for unresolved placeholders. The hub already has `sed_escape`, so it needs no
port. The port must not bring back two fork defects:
`backup_if_real` deletes an older `.bak` before it moves the file, and
`do_uninstall` splits paths on spaces in a `for p in $(...)` loop.

| Step | Feature | Detail |
|:-----|:--------|:-------|
| P1 | State ledger and `--uninstall` | Record each link, copy, render, backup and external clone in a ledger. Write it to the state file named in `setup/hub.conf`. `--uninstall` removes a link only when it still points at the recorded source. It removes a copy or render only when its sha256 still matches. It restores each recorded backup by its exact path. It lists external clones and leaves them in place. `--uninstall --dry-run` changes nothing. |
| P2 | `--update`, `--repair` and stale prune | Read the answers and components back from the state file. Re-render with no questions. Remove a link that the last run made and the new run drops. |
| P3 | Non-interactive flags and manifest keys | `--answers` as an alias of `--profile`, `--components LIST`, `--list-components`, `-y` and `--yes`. Manifest keys `default=yes\|no` and `group=`. The picker shows `desc`. Skip `.gitkeep`. Set the execute bit on a rendered `.sh` file. |
| P4 | Data-driven brand and variables | `setup/hub.conf` holds `tool=`, `banner=` and `state_file=`. A `detect:<name>` value in `answers.example.yml` selects a built-in detector: `git_name`, `git_email`, `gh_user_1`, `gh_user_2`, `clipboard`, `node_bin`. This replaces the fork `VAR_KEYS` list and `default_for` case, so `setup.sh` holds no variable name. |
| P5 | `--render-skills` | Render a `link_children` tree into the target instead of a symlink. This mode substitutes known keys and warns on any other `{{...}}` token, because hub skills contain `{{text}}` and `{{variable}}` as prose. The strict check stays on for `.tmpl` files. |
| P6 | Nerd Fonts | `--fonts LIST`, `--no-fonts` and the font picker. The ledger records each font directory. `--uninstall` lists fonts and leaves them in place, as the fork does today. |
| P7 | Hook settings merge helper (Should-Have) | Move `install-hooks.sh`, `install-hooks.ps1` and the fragment format into `harnesses/claude-code/`. Each helper merges the hook fragment into `settings.json` and skips an entry that already exists. |

The fork answers file has 32 template variables plus the `components` and
`fonts` keys. The hub file has 8 variables. Three hub names differ from the
fork names: `node_path` and `node_bin`, `accent_color` and
`tmux_accent_color`, `claude_config_dir` and `personal_config_dir`. After P4,
`setup.sh` holds no variable name, so each repo keeps its own names in its own
answers file and templates. Neither repo renames a variable.

### Sync Tool

**Location**: hub `tools/fork-sync/`.

```text
tools/fork-sync/
  fork-sync              bash wrapper, runs fork_sync.py with python3 -I
  fork_sync.py           stdlib only, Python 3.11 or later
  never-export.txt       path deny list
  content-patterns.toml  tiers 1 to 3 and the allowed lines
  README.md
  tests/                 pytest, with a fixture hub and a fixture fork
```

**CLI**:

```text
fork-sync plan   --fork PATH --tag TAG [--hub PATH] [--diff] [--json]
fork-sync apply  --fork PATH --tag TAG --issue N [--hub PATH]
                 [--push] [--bump patch|minor|major] [--allow-downgrade]
fork-sync verify --fork PATH [--pr-title T --pr-body FILE]
fork-sync gate   --hub PATH [--ref REF]
```

| Command | What it does | Exit codes |
|:--------|:-------------|:-----------|
| `plan` | The dry run. It computes the output tree and prints one line per path: `add`, `modify`, `delete`, `render` or `same`. `--diff` adds a unified diff. It writes nothing. | 0 in sync, 3 changes pending, 1 gate or input error, 2 usage error |
| `apply` | It does what `plan` prints, in a temporary git worktree of the fork. It commits on the sync branch. With `--push`, it pushes and opens or updates the fork PR. | 0 done or in sync, 1 error, 2 usage error |
| `verify` | It runs every fork CI job locally, plus the lock check. | 0 pass, 1 fail |
| `gate` | The hub-side content gate on every hub file that the deny list allows. | 0 pass, 1 fail |

**Inputs**:

- `--tag`: an annotated hub tag that matches `v<YY>.<n>.<n>.<n>[suffix]`. The
  tool resolves it to a commit sha. It refuses a branch name or a bare sha.
- `--hub`: a local hub checkout. The default is the repo that holds the tool.
  The tool runs `git fetch --tags` first, then reads files with
  `git archive <tag>`, so the working tree state of the hub does not matter.
- `--fork`: a local fork checkout. The tool reads `origin/main` after a fetch.
  It ignores uncommitted work in that checkout.
- `.hub-overlay.toml` and `.hub-overlay/lock.json` from fork `origin/main`.
- `never-export.txt` and `content-patterns.toml` from the hub tag, not from the
  working tree. The rules then match the content they check.

**Overlay config** (`.hub-overlay.toml` in the fork, phase A):

```toml
schema = 1
hub_repo = "Kiriketsuki/agenKic-hub"
version_bump = "local"   # "actions" when fork runners return

[export]
include = [
  "workflows/autofix-swarm.mjs",
  "workflows/council-loop.mjs",
  "workflows/feature-loop.mjs",
  "workflows/feature-loop.md",
  "workflows/spec-loop.mjs",
  "workflows/spec-loop.md",
  "workflows/ultracode-fix.mjs",
  "workflows/ultracode-implement.mjs",
  "workflows/spec-loop.smoke.mjs",
  "workflows/workflows.smoke.mjs",
  "skills/core/**",
  "skills/council/**",
  "skills/writing/**",
  "skills/ops/**",
  "docs/patterns/**",
  "docs/tools/stream-launcher.md",
  "tools/stream-launcher/**",
  "tools/fork-sync/**",
]
exclude = []
shadow = ["skills/ops/release-notes-enricher/**"]

[fork]
owned = [
  "skills/aurrigo/**", "skills/meetings/**",
  "skills/project/**", "skills/fun/**",
  "setup/**", "config/**",
  "docs/tips/**", "docs/WALKTHROUGH.md", "docs/aurrigo-agentic-hub.md",
  "docs/deck/**", "docs/specs/**",
  "README.md", "AGENTS.md", "VERSION", ".gitignore", ".github/**",
  ".hub-overlay.toml", ".hub-overlay/**",
]

[render]
workflow_headers = ".hub-overlay/headers"
skill_origin = "origin: https://github.com/Kiriketsuki/agenKic-hub"
```

**Lock file** (`.hub-overlay/lock.json`, written by `apply`):

```json
{
  "schema": 1,
  "hub_repo": "Kiriketsuki/agenKic-hub",
  "hub_tag": "v26.1.0.0",
  "hub_commit": "<40-char sha>",
  "tool_version": "1",
  "files": {
    "workflows/council-loop.mjs": {"sha256": "<hex>", "op": "render:header"},
    "skills/core/brainstorm/SKILL.md": {"sha256": "<hex>", "op": "render:origin"},
    "docs/patterns/hooks.md": {"sha256": "<hex>", "op": "copy"}
  }
}
```

**Classification rules**, checked before any write:

1. A path in `owned` is fork-owned. An `owned` glob that also matches an
   export path is an error, unless `shadow` lists that export path.
2. A path from the export set is hub-managed. The export set is the include
   globs, minus `exclude`, minus `shadow`, minus the hub deny list.
3. When a tracked fork path is in neither class, the tool stops and names it.
4. A hub-managed fork file whose sha256 differs from the lock is drift. The
   tool stops, names the file and gives two fixes: port the edit to the hub,
   or move the path to `owned`.
5. A path in the old lock but not in the new export set gets a delete.
6. Two skill directories with the same name in two groups is an error.

**Outputs of `apply`**:

- A branch `task/<N>-sync-hub-<tag>` from fork `origin/main`, with the tag in
  kebab form, for example `task/41-sync-hub-v26-1-0-0`. The fork hosted
  runners cannot create branches, so the tool creates the branch by hand.
- Commit 1: `chore(sync): sync hub <tag>`. The body names the hub commit and
  the counts of added, changed, rendered and deleted files.
- Commit 2, only when `version_bump = "local"`: `ci: bump version to <X>
  [skip ci]`. The bump follows the fork `YY.Major.Minor.Patch[Suffix]` rules.
  The default is a patch bump. `--bump` overrides it.
- With `--push`: a push with `--force-with-lease` to the sync branch only, and
  one PR to fork `main`. The PR title is `chore(sync): sync hub <tag>`. The
  body holds `Closes #N`, the old and new tag, the hub commit subjects in that
  range for the exported paths, and the `verify` report.

**Idempotency**:

- The output is deterministic. The tool sorts paths, keeps LF line ends, and
  keeps the file mode from the hub tree.
- When the fork already matches the tag, `apply` prints "in sync", exits 0 and
  creates nothing.
- When the sync branch already exists, the tool resets it to fork
  `origin/main` and applies again. The tool owns that branch, and no person
  commits to it.
- When a PR for the branch exists, the tool edits its body. It never opens a
  second PR.
- A tag older than the lock tag needs `--allow-downgrade`. This is the
  rollback path.

**Preconditions of `apply --push`**: `gh api repos/<fork>` succeeds with the
active account, the fork issue `N` is open, and `verify` passes in the
worktree. The tool never switches the `gh` account. When the check fails, it
stops and prints the account it needs.

### Release Flow

1. A hub PR merges into `main`. The hub `version-bump.yml` bumps `VERSION`.
2. The same workflow pushes the annotated tag `v<VERSION>` (step M0).
3. The maintainer runs `fork-sync plan --tag v<VERSION> --fork <path>` and
   reads the plan. Exit 0 means nothing for the fork changed. The flow stops.
4. The maintainer files a fork task issue from the fork template:
   "Sync hub v<VERSION> into the fork".
5. The maintainer runs `fork-sync apply --tag v<VERSION> --fork <path>
   --issue <N> --push`. The tool creates the branch, both commits, the push
   and the PR.
6. The maintainer reviews the PR. The user approves the squash merge, as for
   every merge.
7. The squash commit on fork `main` carries the new fork `VERSION`. When
   `version_bump = "actions"`, the fork bot bumps the version instead.

A sync is optional per hub tag. The fork can skip tags, and the lock records
only the last tag it took.

### CI

**Hub** (hosted runners work):

| Job | Where | What it checks |
|:----|:------|:---------------|
| `fork-sync-tests` | `ci.yml` | pytest for `tools/fork-sync/tests/`. It covers classification, globs, both render ops, the lock, the content gate and a two-run idempotency test on a fixture fork |
| `export-gate` | `ci.yml` | `fork-sync gate --hub .` on every hub PR. Tiers 1 and 3 fail the job. Tier 2 warns |
| `setup-smoke` | `ci.yml` | `setup/tests/*.sh` with `HOME=$(mktemp -d)`: install, `--update`, `--uninstall`, and `--dry-run` with no disk change |
| `setup-smoke-windows` | `ci.yml` (Should-Have) | The same flow for `setup.ps1` on `windows-latest` |
| tag push | `version-bump.yml` | Pushes `v<VERSION>` after the bump commit |

**Fork** (hosted runners blocked by billing on 2026-10-13):

- `fork-sync verify` is the gate. It runs each fork `ci.yml` job locally.
  The jobs are the personal path gate, the kilint docs gate at 1.5 per 100
  words, the frontmatter check and the kilint pytest suite. The command
  also runs every workflow smoke test and the lock drift check. It runs
  `bash -n` and shellcheck on `setup/*.sh`. With `--pr-title` and
  `--pr-body`, it also runs `pr_lint.py`.
- `apply --push` runs `verify` in the worktree and stops on a failure. The PR
  body holds the report under the heading "Local CI (hosted runners blocked)".
- Step M10 adds a `hub-overlay` job to the fork `ci.yml` that runs
  `python3 tools/fork-sync/fork_sync.py verify --fork .`. The job runs when
  billing returns. Nothing in the flow waits for it.
- No fork step depends on fork Actions. The fork branch automation, version
  bump and CI all have the local path above.

### Migration Steps

Each step is one PR in one repo. Each step ships alone, and each has a
rollback. Phase A (M0 to M8) brings the workflow and skill fixes to the fork
first. Phase B (M9) moves the installer once the ports land.

| Step | Repo | Change | Ships when | Rollback |
|:-----|:-----|:-------|:-----------|:---------|
| M0 | Hub | Tag source: tag push in `version-bump.yml`, plus a manual `v26.0.6.2` tag | Any time | Delete the tags, revert the workflow PR |
| M1 | Hub | Hub hygiene: fix the five tier 1 lines. Add the hub CUSTOMIZE headers to the six workflows. | Any time | Revert the PR |
| M2 | Hub | P1: state ledger and `--uninstall` | Any time | Revert the PR. A schema 2 state file stays on disk, and the old installer ignores it |
| M3 | Hub | P2: `--update`, `--repair`, stale prune | After M2 | Revert the PR |
| M4 | Hub | P3: flags and manifest keys | After M2 | Revert the PR. The extra manifest keys are inert for the old parser |
| M5 | Hub | P4: `setup/hub.conf` and `detect:` defaults | After M4 | Revert the PR. `answers.example.yml` keeps literal defaults beside each `detect:` value |
| M6 | Hub | P5 and P6: `--render-skills` and Nerd Fonts | After M4 | Revert the PR |
| M7 | Hub | The `fork-sync` tool, its tests, `export-gate`, `fork-sync-tests` and `docs/tools/fork-sync.md` | After M0 and M1 | Revert the PR. No fork state depends on it yet |
| M8 | Fork | Bootstrap: `.hub-overlay.toml`, `.hub-overlay/headers/`, the first sync PR from a hub tag that holds M7. It regroups three skills, adds fork-owned `skills-council.conf`, `skills-writing.conf` and `skills-ops.conf`, updates `AGENTS.md` and `ci.yml` paths, and deletes the `.gitkeep` files. | After M7 is in a tag | Revert the squash commit. Each user then runs `setup/setup.sh --update`, which prunes the dangling links |
| M9 | Fork | Phase B: move `setup/setup.sh`, `setup.ps1`, `setup/tests/` and the generic component files from `owned` to `include`. Add the fork `setup/hub.conf`. Put `detect:` values in the fork `answers.example.yml`. | After M2 to M6 are in a tag | Move the paths back to `owned` and revert the squash commit |
| M10 | Fork | The `hub-overlay` CI job | After M8 | Remove the job |
| M11 | Both | Steady state: each hub tag can produce one sync PR | After M8 | Stop the sync runs. The fork keeps the last synced tree |

### Risks

| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| A personal path reaches the private fork, or an Aurrigo path reaches the public hub through a port step | Medium | Tier 1 and tier 3 gates in hub CI, in `plan` and in `apply`. The allowlist keeps new hub files out until the fork lists them |
| The first sync overwrites a fork edit to a shared file | High | Before M8, the M8 PR description lists every hub-managed path where the fork is ahead. The maintainer ports each edit to the hub or moves the path to `owned` |
| The skill regroup leaves dangling links in `~/.claude/skills` | High | The fork installer already prunes stale links on `--update`. The M8 PR body tells each user to run it |
| The fork bumps its version twice when runners return | Medium | `version_bump` in `.hub-overlay.toml` is one switch. The tool reads it on each run |
| Fork branch protection blocks a merge because hosted checks cannot run | Medium | Open question 12. The local `verify` report in the PR body is the gate record |
| The tool version differs from the tag it syncs | Low | The tool reads its rules from the tag. The lock records the tool version |
| #31 moves skills into plugin directories | Medium | The map uses globs and no rename map. #31 then edits only the include list |
| `gh` runs under the personal account and the push fails | Medium | `apply --push` checks repo access first and names the account it needs |
| `{{...}}` prose in hub skills breaks `--render-skills` | Medium | P5 renders known keys only and warns on the rest. The strict check stays on for `.tmpl` files |

---

## Acceptance Scenarios

```gherkin
Feature: Fork Overlay
  As the maintainer of the hub and the Aurrigo fork
  I want the fork generated as an overlay of a pinned hub tag
  So that a hub fix reaches the fork through a tag bump

  Background:
    Given a local hub checkout with the annotated tag v26.1.0.0
    And a local fork checkout with .hub-overlay.toml on origin/main

  Rule: The plan is a dry run

    Scenario: Plan lists every change and writes nothing
      When the maintainer runs fork-sync plan with --tag v26.1.0.0
      Then each output path shows as add, modify, delete, render or same
      And the exit code is 3
      And git status in the fork shows no change

    Scenario: Plan stops on an unclassified path
      Given the fork tracks docs/new-note.md in no owned glob and no export glob
      When the maintainer runs fork-sync plan
      Then the exit code is 1
      And the output names docs/new-note.md as unclassified

  Rule: Sanitize rules block personal and private data

    Scenario: A personal path in an exported hub file fails the sync
      Given skills/core/brainstorm/SKILL.md at the tag contains a personal home path
      When the maintainer runs fork-sync plan
      Then the exit code is 1
      And the output names the file and the line

    Scenario: A deny-listed hub file never reaches the fork
      Given the fork include list contains workflows/**
      When the maintainer runs fork-sync plan
      Then workflows/financial-data-pipeline.mjs is not in the plan

    Scenario: A reverse leak fails hub CI
      Given a hub PR adds the private org name to setup/setup.sh
      When the export-gate job runs
      Then the job fails and names the line

  Rule: Apply is idempotent

    Scenario: First apply opens one PR
      When the maintainer runs fork-sync apply with --issue 41 and --push
      Then the fork has the branch task/41-sync-hub-v26-1-0-0
      And the branch has the sync commit and the version bump commit
      And one PR to main closes issue 41

    Scenario: Second apply on the same tag changes nothing
      Given the sync PR for v26.1.0.0 is merged
      When the maintainer runs fork-sync apply with the same tag
      Then the output says in sync
      And no branch, commit or PR appears

    Scenario: Drift in a hub-managed file stops the sync
      Given a fork commit edits workflows/council-loop.mjs on main
      When the maintainer runs fork-sync apply
      Then the exit code is 1
      And the output names the file and both fixes

  Rule: Render ops shape fork files

    Scenario Outline: Render op per file type
      Given the hub tag holds <file>
      When the maintainer runs fork-sync plan --diff
      Then the fork copy of <file> shows <result>

      Examples:
        | file                             | result                                    |
        | workflows/council-loop.mjs       | the fork header from .hub-overlay/headers |
        | skills/core/brainstorm/SKILL.md  | the origin line after the name line       |
        | docs/patterns/hooks.md           | the hub bytes unchanged                   |

  Rule: The installer ports keep both trees safe

    Scenario: Uninstall reverses an install
      Given setup.sh installed skills-core and config-tmux into a temp HOME
      When the user runs setup.sh --uninstall
      Then every recorded link and rendered file is gone
      And every recorded backup is back at its original path

    Scenario: Uninstall keeps a file the user edited
      Given the user edited a rendered file after install
      When the user runs setup.sh --uninstall
      Then the edited file stays in place
      And the output names it as changed since install

  Rule: The fork flow needs no fork Actions

    Scenario: Verify runs every fork CI job locally
      Given fork hosted runners are blocked
      When the maintainer runs fork-sync verify
      Then each fork ci.yml job runs on the local machine
      And the report lands in the sync PR body
```

---

## Task Breakdown

| ID   | Task | Priority | Dependencies | Status  |
|:-----|:-----|:---------|:-------------|:--------|
| T1   | M0: tag push in hub `version-bump.yml`, manual `v26.0.6.2` tag | High | None | pending |
| T2   | M1: fix the five tier 1 lines, add hub CUSTOMIZE headers | High | None | pending |
| T3   | M2: P1 state ledger and `--uninstall`, bash and PowerShell, with smoke test | High | None | pending |
| T3.1 | M3: P2 `--update`, `--repair`, stale prune | Med | T3 | pending |
| T3.2 | M4: P3 flags and manifest keys | Med | T3 | pending |
| T3.3 | M5: P4 `setup/hub.conf` and `detect:` defaults | Med | T3.2 | pending |
| T3.4 | M6: P5 `--render-skills` and P6 Nerd Fonts | Low | T3.2 | pending |
| T3.5 | P7: hook settings merge helper (Should-Have) | Low | None | pending |
| T4   | M7: `fork-sync` plan, apply, verify and gate, with pytest fixtures | High | T1, T2 | pending |
| T4.1 | M7: `export-gate` and `fork-sync-tests` jobs in hub CI | High | T4 | pending |
| T4.2 | M7: `docs/tools/fork-sync.md` and a mkdocs nav entry | Med | T4 | pending |
| T5   | M8: fork bootstrap PR from the first tag that holds T4 | High | T4.1 | pending |
| T6   | M9: fork phase B installer switch | Med | T3.1, T3.3, T3.4, T5 | pending |
| T7   | M10: fork `hub-overlay` CI job | Low | T5 | pending |

---

## Exit Criteria

- [ ] All Must-Have scenarios pass, in hub CI where the scenario allows, and
      by a recorded manual run otherwise
- [ ] A second `apply` on the same tag is a no-op, proven in the fixture test
      and once on the real fork
- [ ] `fork-sync gate` reports zero tier 1 and tier 3 hits on hub `main`
- [ ] The fork `council-loop.mjs` matches the hub tag apart from its header
- [ ] `bash -n` and shellcheck pass on every changed shell script
- [ ] Each port step has a smoke test that passes with `HOME=$(mktemp -d)`
- [ ] `fork-sync verify` passes on fork `main` after the first sync
- [ ] kilint scores every new doc under 1.5 violations per 100 words

---

## References

- Issue: Kiriketsuki/agenKic-hub#32
- Related issues: #31 (plugin marketplace), #34 (council-loop as the single
  council engine), #26 (the council gates the fork lacks)
- Spec format: `docs/specs/todo/canon-hub-supercharge-spec.md`,
  `skills/core/feature-spec/SKILL.md`
- Fork, read only: the private work fork, its
  `setup/setup.sh`, `setup/setup.ps1`, `.github/workflows/ci.yml`
- Hub installer: `setup/setup.sh`, `setup/setup.ps1`, `setup/components/`

---
*Authored by: Clault KiperO 5.5*
