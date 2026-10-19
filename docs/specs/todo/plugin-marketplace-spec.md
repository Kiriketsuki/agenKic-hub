# Feature: Hub Plugin Marketplace

## Overview

**User Story**: As a user of the hub, I want one install command and
marketplace updates. Hooks and workflows then wire themselves, and CI proves
the package loads.

**Problem**: The hub ships through a symlink installer. Hooks need a hand merge
into `settings.json`, and Windows needs a junction fallback. Every update means
a re-run. Nothing validates the package, and no eval checks that a skill
triggers or helps.

**Out of Scope**: The repo restructure itself. This PR delivers the spec only.
Anthropic directory submission. claude.ai and Cowork support. Hooks for Codex,
OpenCode, Pi or Hermes. A rewrite of any skill body beyond its references and
configuration lines.

---

## Success Condition

> This feature is complete when a user adds the marketplace with `claude plugin
> marketplace add Kiriketsuki/agenKic-hub` and installs the four plugins. Every
> skill, workflow and hook must then work under its namespaced name with no
> `settings.json` edit. CI must
> also pass `claude plugin validate --strict` and the core eval suite.

---

## Evidence Legend

Every claim about plugin behavior carries one of these tags.

| Tag | Meaning |
|:----|:--------|
| `[docs: page#anchor]` | A page under `code.claude.com/docs/en/` states it. Pages read on 2026-10-19 |
| `[probe]` | A scratch test on Claude Code 2.1.303 showed it on 2026-10-19. The docs do not state it |
| `[unverified]` | Neither the docs nor a probe confirm it. Treat it as an assumption |
| `[repo: path:line]` | The current repo shows it |

The probes ran in a scratch directory with `--plugin-dir` and `claude -p`. They
touched no user settings. Section 9 lists each probe and its result.

---

## Open Questions

Each question carries the recommended answer. The spec body assumes the
recommendation.

| # | Question | Recommended answer | Raised By | Resolved |
|:--|:---------|:-------------------|:----------|:---------|
| 1 | Do the plugins live in place under `skills/<group>/`, or move to `plugins/agenkic-<group>/`? | In place. Each `skills/<group>/` becomes a plugin root with `"skills": ["./"]`. A `[probe]` confirmed the layout loads. No skill path changes, so 30 README links, the docs and the vault links stay valid | Spec | [ ] |
| 2 | Do the guard-rail hooks ship in `agenkic-ops` or in a fifth plugin? | Ship them in `agenkic-ops`, with one `userConfig` toggle per blocking hook. The README already defines ops as "guard rails and repo maintenance". `agent-route-suggest.sh` ships in `agenkic-core`, beside the skills it names | Spec | [ ] |
| 3 | Do the four worked-example workflows ship as commands? | No. Move `ai-co-scientist`, `financial-data-pipeline`, `gmail-recurring-payments` and `spending-habits-categorizer` to `docs/workflows/examples/`. They are personal examples, not hub tools | Spec | [ ] |
| 4 | Does the `feature-spec` workflow keep its name? | Rename it to `spec-implement`. It moves to `agenkic-council`, so no command clash occurs. Two different things with one name still confuse users | Spec | [ ] |
| 5 | Where does each `plugin.json` take its `version`? | From the repo `VERSION` file. The version-bump workflow writes it into all four manifests. `--strict` fails on a missing version `[docs: plugins/manifest-reference#validate-the-manifest]` | Spec | [ ] |
| 6 | Does CI get an API key for `claude plugin eval`? | Yes. Add an `ANTHROPIC_API_KEY` repo secret. Run the eval job only on PRs that touch `skills/core/**` and on manual dispatch. Cap it with `--max-cost-usd 5` | Spec | [ ] |
| 7 | Does `vault_path` live in both the installer answers and `agenkic-core` `userConfig`? | Yes. The zsh alias reads the installer value. The `feature-spec` skill reads the plugin value. The two consumers differ, so both stay | Spec | [ ] |
| 8 | Does the marketplace offer an `agenkic-all` bundle plugin? | Yes, as a Nice-to-Have after step M5. A bundle is a manifest with a `dependencies` array `[docs: plugins/dependencies#bundle-plugins-for-a-team]` | Spec | [ ] |
| 9 | Which license do the manifests declare? | Add a `LICENSE` file before the marketplace goes public. Set `license` in all four manifests at the same time. The repo has no `LICENSE` file today | Spec | [ ] |
| 10 | Which skills directories do Codex and OpenCode read? | Confirm both paths against each harness's own docs in step M5. This spec does not settle them. `[unverified]` | Spec | [ ] |
| 11 | What happens to the `/instinct-status`, `/evolve` and other commands that `continuous-learning-v2` lists? | Remove the table until the commands land in the repo. No file in the repo defines them `[repo: skills/ops/continuous-learning-v2/SKILL.md:179-198]` | Spec | [ ] |
| 12 | Which Claude Code version is the stated minimum? | v2.1.303. The workflow name resolution rests on a probe at that version, not on the docs | Spec | [ ] |

---

## Scope

### Must-Have

- **Marketplace and four plugins**: `.claude-plugin/marketplace.json` at the
  repo root lists `agenkic-core`, `agenkic-council`, `agenkic-writing` and
  `agenkic-ops`. Acceptance: `claude plugin validate . --strict` exits 0.
- **Namespaced references**: every cross-skill reference names the namespaced
  skill and keeps the bare name for other harnesses. Acceptance: the
  inventory in section 2 has no open row.
- **Plugin hooks**: `hooks/hooks.json` in `agenkic-ops` and `agenkic-core`
  replaces the `settings.hooks.example.json` merge. Acceptance: a migrated
  machine runs each hook once per event.
- **Plugin workflows**: orchestration workflows ship as `.js` files in
  `agenkic-council`. They run as `/agenkic-council:<name>`. Acceptance:
  `/agenkic-council:spec-loop` starts, and its nested `council-loop` call
  resolves.
- **userConfig**: the skill settings in section 5 move to `userConfig`, with an
  environment fallback. Acceptance: `feature-spec` reads `vault_path` from the
  configure dialog.
- **Smaller installer**: the installer keeps `config/`, the external components
  and the links for non-Claude harnesses. Acceptance: no installer step writes
  into `~/.claude/hooks/` or `~/.claude/workflows/`.
- **CI**: one job runs `claude plugin validate --strict`. A second job runs
  `claude plugin eval` on four core skills. Acceptance: both jobs gate PRs.
- **Migration path**: `setup/migrate-to-plugins.sh` removes the legacy hook
  entries and links. Acceptance: a dry run lists every change, and a backup
  restores the old state.

### Should-Have

- A `SessionStart` warning in `preflight-check.sh` when `settings.json` still
  wires a hub hook.
- An `agenkic-ops` toggle that turns the `continuous-learning-v2` observer on.

### Nice-to-Have

- An `agenkic-all` bundle plugin.
- Evals for one council skill and one writing skill.

---

## Technical Plan

### 1. Plugin split and directory layout

**Decision**: each skill group directory becomes a plugin root in place. The
marketplace root is the repo root.

Evidence for the layout:

- A plugin is a directory with `.claude-plugin/plugin.json`. Only the manifest
  goes inside `.claude-plugin/` `[docs: plugins/create#plugin-layout]`.
- The `skills` key adds directories to scan, and `"."` or `"./"` names the
  plugin root `[docs: plugins/manifest-reference#path-only-fields]`.
- A marketplace entry `source` is a relative path from the marketplace root
  `[docs: plugins/create-marketplace#write-relative-paths-from-the-marketplace-root]`.
- A group root with `"skills": ["./"]` loaded its skill directories. The
  `hooks/` and `workflows/` subdirectories did not load as skills, because
  they hold no `SKILL.md` `[probe]`.
- A copied plugin loses every file outside its own directory
  `[docs: plugins/loading#in-place-and-copied-plugins]`. No skill links into
  another group today. Section 2 lists the `../` links, and all stay inside one
  group `[repo]`.

Target layout after step M5:

```text
agenKic-hub/
├── .claude-plugin/marketplace.json
├── skills/
│   ├── core/                       # plugin agenkic-core
│   │   ├── .claude-plugin/plugin.json
│   │   ├── <12 skill dirs>/SKILL.md
│   │   ├── hooks/hooks.json
│   │   ├── hooks/scripts/agent-route-suggest.sh
│   │   └── evals/<case>/prompt.md, graders/*.md
│   ├── council/                    # plugin agenkic-council
│   │   ├── .claude-plugin/plugin.json
│   │   ├── <4 skill dirs>/SKILL.md
│   │   └── workflows/*.js          # council-loop, spec-loop, feature-loop,
│   │                               # autofix-swarm, ultracode-fix,
│   │                               # ultracode-implement, spec-implement
│   ├── writing/                    # plugin agenkic-writing
│   │   ├── .claude-plugin/plugin.json
│   │   ├── <4 skill dirs>/SKILL.md
│   │   └── bin/kilint              # on the Bash tool PATH
│   └── ops/                        # plugin agenkic-ops
│       ├── .claude-plugin/plugin.json
│       ├── <6 skill dirs>/SKILL.md
│       ├── hooks/hooks.json
│       └── hooks/scripts/*.sh      # 8 hooks from harnesses/claude-code/hooks/
├── tests/workflows/*.smoke.mjs     # moved out of the plugin tree
├── docs/workflows/examples/*.js    # not shipped, see open question 3
├── config/  harnesses/  setup/  tools/
```

`marketplace.json`:

```json
{
  "name": "agenkic-hub",
  "description": "Spec-first skills, council review, prose linting and guard-rail hooks from the agenKic hub",
  "owner": { "name": "Kiriketsuki", "url": "https://github.com/Kiriketsuki" },
  "plugins": [
    { "name": "agenkic-core", "source": "./skills/core", "description": "Spec-first loop: brainstorm, spec, implement, merge, context handoff, routing" },
    { "name": "agenkic-council", "source": "./skills/council", "description": "Adversarial council review and the multi-agent orchestration workflows" },
    { "name": "agenkic-writing", "source": "./skills/writing", "description": "STE house style, the kilint linter, visual explainers, cover letters" },
    { "name": "agenkic-ops", "source": "./skills/ops", "description": "Guard-rail hooks and repo maintenance skills" }
  ]
}
```

A `[probe]` showed that `--strict` fails a marketplace without a top-level
`description`. Keep each entry `name` equal to its manifest `name`. A mismatch
breaks the install by manifest name
`[docs: plugins/create-marketplace#keep-the-entry-name-and-the-manifest-name-the-same]`.

`skills/core/.claude-plugin/plugin.json`:

```json
{
  "name": "agenkic-core",
  "displayName": "agenKic core",
  "version": "26.0.6.2",
  "description": "Spec-first loop: brainstorm, spec, implement, merge, context handoff, routing",
  "author": { "name": "Kiriketsuki", "url": "https://github.com/Kiriketsuki" },
  "homepage": "https://kiriketsuki.github.io/agenKic-hub/",
  "repository": "https://github.com/Kiriketsuki/agenKic-hub",
  "keywords": ["spec", "brainstorm", "handoff", "routing"],
  "skills": ["./"],
  "userConfig": {
    "vault_path": { "type": "directory", "title": "Notes vault", "description": "Vault root for the feature-spec daily-note step. Leave empty to skip that step", "default": "" },
    "daily_note_path": { "type": "string", "title": "Daily note path", "description": "Path pattern for today's daily note, such as <vault>/Daily/[YYYY]/[MMM]-[DD].md", "default": "" }
  }
}
```

The other three manifests follow the same shape. Their extra keys are below.

| Plugin | Extra manifest keys |
|:-------|:--------------------|
| `agenkic-council` | None. The default `workflows/` scan finds the scripts `[docs: plugins/manifest-reference#standard-layout]` |
| `agenkic-writing` | `"commands": ["./visual-explainer/commands/"]`, plus the `userConfig` keys in section 5 |
| `agenkic-ops` | The hook toggles and the `userConfig` keys in section 5 |

Plugin names start with `agenkic-`. That prefix draws no reserved-name error or
warning `[docs: plugins/manifest-reference#name]`. A `[probe]` validated
`agenkic-core` with `--strict`.

### 2. Namespacing and cross-skill references

Rules from the docs:

- A plugin skill runs as `/<plugin>:<name>`. The frontmatter `name` sets the
  last segment `[docs: skills#how-a-skill-gets-its-command-name]`.
- The docs say a bare `/<name>` also invokes a plugin skill that sets `name`,
  unless another command owns it `[docs: skills#how-a-skill-gets-its-command-name]`.
  A `claude -p` probe of a bare `/hello` did not run the plugin skill `[probe]`.
  The spec therefore uses the namespaced form everywhere.
- A command file in a subdirectory gains a segment, so `commands/db/migrate.md`
  is `/my-plugin:db:migrate` `[docs: plugins/components#commands]`.
- A manifest `commands` directory path names the commands after each file. The
  exact segment form for a listed directory is `[unverified]`.
- All 26 skills set a frontmatter `name` today `[repo]`.

Reference style for Claude Code and other harnesses:

> Use the `agenkic-core:context-handoff` skill (`/context-handoff` in a linked
> install).

Codex and OpenCode read the same `SKILL.md` through links, so the bare name
stays in parentheses.

Inventory from `rg` on the current tree. "Change" says what each reference
becomes. "Same plugin" rows keep working after the copy to the cache.

| File:line | Reference today | Kind | Change |
|:----------|:----------------|:-----|:-------|
| `skills/council/adversarial-council/SKILL.md:437` | `/context-handoff` | Cross plugin, council to core | `agenkic-core:context-handoff` skill, bare name in parentheses |
| `skills/council/adversarial-council/SKILL.md:456` | `/context-resume` | Cross plugin, council to core | `/agenkic-core:context-resume` |
| `skills/council/adversarial-council/references/findings-gate.md:178,214` | `/context-handoff` | Cross plugin | `agenkic-core:context-handoff` skill |
| `skills/council/adversarial-council/references/findings-gate.md:225` | `/context-resume` | Cross plugin, user-facing text | `/agenkic-core:context-resume` |
| `skills/council/adversarial-council/references/fix-loop.md:4` | `/context-resume` | Cross plugin | `/agenkic-core:context-resume` |
| `harnesses/claude-code/hooks/agent-route-suggest.sh:28,30,32` | `/agent-route`, `/model-route` in nudge text | Hook to core skill | Script moves into `agenkic-core`. Text names `/agenkic-core:agent-route` and `/agenkic-core:model-route` |
| `skills/council/adversarial-council/SKILL.md:67,94,97,100,105,108,113` | `/adversarial-council` usage | Self | `/agenkic-council:adversarial-council` |
| `skills/council/adversarial-council/SKILL.md:87,124` | `/parallel-fix`, `/council-supervisor` | Same plugin | Namespaced form |
| `skills/council/council-fix/SKILL.md:12,15,18,31,32,58,71,72,154,155` | `/council-fix`, `/adversarial-council`, `/council-supervisor` | Self and same plugin | Namespaced form |
| `skills/council/council-supervisor/SKILL.md:9,48,297,299` | `/adversarial-council`, `/parallel-fix` | Same plugin | Namespaced form |
| `skills/council/council-supervisor/SKILL.md:143-144` | `../adversarial-council/references/roles/`, `../adversarial-council/references/evidence-protocol.md` | Relative path, same plugin | No change. The path stays inside the plugin root |
| `skills/council/parallel-fix/SKILL.md:20,21,220` | `/parallel-fix`, `/council-supervisor` | Self and same plugin | Namespaced form |
| `skills/core/implement-spec/SKILL.md:13,215` | `/feature-spec`, `/brainstorm` | Same plugin | Namespaced form |
| `skills/core/agent-route/SKILL.md:8,70,71,97-100` | `/agent-route`, `/model-route` | Self and same plugin | Namespaced form. Keep the bare trigger phrase at line 8 |
| `skills/core/model-route/SKILL.md:8,65,71-73` | `/model-route`, `/agent-route` | Self and same plugin | Namespaced form. Keep the bare trigger phrase at line 8 |
| `skills/core/context-resume/SKILL.md:22-26,59` | `/context-resume` usage table | Self | Namespaced form |
| `skills/core/merge-next/SKILL.md:115` | `/merge-next` | Self | Namespaced form |
| `skills/core/critique-loop/SKILL.md:32,40` | `../rubric-builder/SKILL.md` | Relative path, same plugin | No change |
| `skills/core/rubric-builder/SKILL.md:11` | `../critique-loop/references/contracts.md` | Relative path, same plugin | No change |
| `skills/core/brainstorm/scripts/SERVER.md:3`, `server.cjs:2` | `../visuals.md` | Relative path, same skill | No change |
| `skills/writing/ste-writing/SKILL.md:57` and 5 lines in `references/*.md` | `../kilint/SPEC.md`, `../../kilint/reference/before-after-samples.md` | Relative path, same plugin | No change |
| `skills/writing/ste-writing/SKILL.md:66-69`, `references/kilint.md:7-10`, `skills/writing/kilint/SKILL.md:18-21` | `KILINT_BIN` fallback to `$HOME/.claude/skills/agenKic-hub/kilint/bin/kilint` | Binary lookup | `command -v kilint` finds `bin/kilint` in the plugin. The old fallback path lacks the `writing/` segment, so it is stale today. Fix it to `$AGENKIC_SKILLS_ROOT/writing/kilint/bin/kilint` |
| `skills/writing/visual-explainer/SKILL.md:22`, `commands/share.md:13-15,101,104` | `/visual-explainer:<command>` | Command names | The names the manifest `commands` key produces. Confirm with `claude plugin details` in step M2 |
| `skills/ops/continuous-learning-v2/SKILL.md:130,137` | `${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.sh` in a settings snippet | Hook path | The hook moves into `skills/ops/hooks/hooks.json` as `${CLAUDE_PLUGIN_ROOT}/continuous-learning-v2/hooks/observe.sh`. Remove both settings snippets at lines 117-165 |
| `skills/ops/repo-hooks/SKILL.md:7,26,50,51` | `/repo-hooks` | Self | Namespaced form. The skill writes lines 50-51 into each generated file, so they name `/agenkic-ops:repo-hooks` |
| `skills/ops/security-scan/SKILL.md:8` | `/security-scan` | Self trigger phrase | No change |
| `workflows/spec-loop.mjs:956,995`, `feature-loop.mjs:361`, `autofix-swarm.mjs:730` | `workflow({ scriptPath: \`${WF_DIR}/council-loop.mjs\` })` | Nested workflow | Section 4 |
| `workflows/spec-loop.mjs:464`, `feature-loop.mjs:171`, `autofix-swarm.mjs:95` | `WF_DIR` default from `process.env.HOME` | Workflow directory | Section 4 |
| `workflows/spec-loop.mjs:32-34,92`, `feature-loop.mjs:68-69`, `spec-loop.md:218`, `spec-loop-spec.md:114,249` | `~/.claude/skills/agent-route/SKILL.md` as the ROUTE table source | Comment | Point at `skills/core/agent-route/SKILL.md` in the repo |
| `workflows/feature-loop.md:17-24,112,156-161`, `feature-loop.mjs:21-26,242`, `autofix-swarm.mjs:29-33`, `feature-spec.mjs:33` | `Workflow({ scriptPath: "/absolute/path/to/.claude/workflows/<name>.mjs" })` | Invocation docs | `/agenkic-council:<name>`, or `Workflow({ name: "agenkic-council:<name>", args })` |
| `workflows/spec-loop.smoke.mjs:79-85` | `join(HERE, 'spec-loop.mjs')` and two siblings | Test path | Read `skills/council/workflows/<name>.js` |
| `.github/workflows/ci.yml:39,57` | `workflows/*.smoke.mjs`, `workflows/*.mjs` | CI glob | `tests/workflows/*.smoke.mjs`, `skills/council/workflows/*.js` |
| `docs/WALKTHROUGH.md:181,184,191,195,217,225,250,258,277,292,293,317` | 13 bare slash invocations | User docs | Namespaced form, with the linked-install name in a note |
| `setup/walkthrough.sh:501,502,510` | `/brainstorm`, `/feature-spec` | Walkthrough text | Namespaced form |
| `docs/workflows/index.md:3,9-20`, `docs/patterns/authoring-workflows.md:5,9,35,83,90,107,115,119,121,123,125` | `.mjs` file links and names | User docs | `.js` links under `skills/council/workflows/` |
| `docs/patterns/hooks.md:9,77-87`, `docs/setup/symlinks.md:10,51` | `~/.claude/hooks/` copy steps, whole-tree skill link | User docs | Plugin install steps. Keep the manual path as a fallback section |
| `README.md:137` and the installer row at line 112 | "install into `~/.claude/skills/`" | User docs | Plugin install command first, installer second |
| `README.md` (30 links), `docs/skills/index.md` (26), `docs/WALKTHROUGH.md` (8), `docs/tips/linters.md` (5), `docs/patterns/council-patterns.md` (4), `docs/patterns/gherkin-and-specs.md` (2), `docs/patterns/index.md` (1) | `skills/<group>/<name>/` links | Repo paths | No change under the in-place layout |
| `mkdocs.yml:58-59,69` | Docs nav | Docs paths | No change |

No reference crosses from `writing` or `ops` into another group `[repo]`.

### 3. Hooks

**Decision**: the hub hooks ship in plugin `hooks/hooks.json` files. Each
command reads its script through `${CLAUDE_PLUGIN_ROOT}`.

Evidence:

- `hooks/hooks.json` holds a top-level `"hooks"` key in the same shape as the
  `hooks` object in `settings.json`, so the hub entries copy in unchanged
  `[docs: plugins/components#hooks]`.
- A shell-form command wraps `${CLAUDE_PLUGIN_ROOT}` in double quotes
  `[docs: plugins/components#environment-quoting-and-matching-mcp-tools]`.
- Each hook process receives `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and one
  `CLAUDE_PLUGIN_OPTION_<KEY>` per option
  `[docs: plugins/manifest-reference#where-each-variable-resolves]`.
- Plugin hooks register at load and fire on every matching event. They do not
  wait for a skill to run `[docs: plugins/components#when-plugin-hooks-fire]`.
- A hook in both `settings.json` and `hooks/hooks.json` runs twice per event
  `[docs: plugins/create#convert-an-existing-claude-setup]`.
- A plugin `settings.json` honors only `agent` and `subagentStatusLine`
  `[docs: plugins/components#default-settings]`. The `permissions.ask` rule for
  `Bash(gh pr merge *)` therefore stays a manual settings entry.
- A `[probe]` loaded a `SessionStart` hook from `hooks/hooks.json` with a
  quoted `${CLAUDE_PLUGIN_ROOT}` path.

Placement:

| Hook script | Event | Plugin | Toggle (`userConfig`, boolean) | Default |
|:------------|:------|:-------|:-------------------------------|:--------|
| `gh-check-before-create.sh` | PreToolUse Bash | `agenkic-ops` | `enforce_naming` | `true` |
| `pre-push-auth.sh` | PreToolUse Bash, `if: Bash(git push *)` | `agenkic-ops` | `pre_push_auth` | `false`. It switches the active `gh` account, which surprises a new user |
| `lint-precommit.sh` | PreToolUse Bash, `if: Bash(git commit *)` | `agenkic-ops` | `lint_precommit` | `true` |
| `large-file-check.sh` | PreToolUse Bash, `if: Bash(git commit *)` | `agenkic-ops` | `large_file_check` | `true` |
| `preflight-check.sh` | SessionStart | `agenkic-ops` | None | Always on. It only warns |
| `python-syntax-check.sh` | PostToolUse Edit, Write | `agenkic-ops` | None | Always on. It only reports |
| `context7-suggest.sh` | PostToolUse Read | `agenkic-ops` | None | Always on. It only nudges |
| `stop-verify-gate.sh` | Stop | `agenkic-ops` | `stop_verify_gate` | `true` |
| `continuous-learning-v2/hooks/observe.sh` | PreToolUse and PostToolUse, matcher `*` | `agenkic-ops` | `observe_sessions` | `false`. It fires on every tool call |
| `agent-route-suggest.sh` | PreToolUse Agent, TeamCreate | `agenkic-core` | None | Always on. It only nudges |

Each toggled script reads its `CLAUDE_PLUGIN_OPTION_<KEY>` value first and
exits 0 when the value is `false`. Whether Claude Code exports an option the
user never set, with its `default`, is `[unverified]`. Each script therefore
treats an unset variable as the default in the table.

`skills/ops/hooks/hooks.json`, first entries:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/gh-check-before-create.sh\"", "timeout": 10 },
          { "type": "command", "if": "Bash(git push *)", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/pre-push-auth.sh\"", "timeout": 15 }
        ]
      }
    ]
  }
}
```

**Migration without double runs**. Order matters. No session runs between the
removal and the plugin install.

1. Run `setup/migrate-to-plugins.sh --dry-run`. It lists each hub entry in
   `~/.claude/settings.json`. It matches a hook command that ends in
   `hooks/<name>.sh` for the nine known names, in any directory. That match
   covers the symlink install and the copy steps in `docs/patterns/hooks.md`.
2. Run the script without `--dry-run`. It writes a backup with the installer's
   `.bak` naming. It removes the matched entries with `jq`. It removes each
   `~/.claude/hooks/<name>.sh` link that points into the repo. It keeps the
   `permissions` block.
3. Run `claude plugin install agenkic-ops@agenkic-hub` and
   `claude plugin install agenkic-core@agenkic-hub`.
4. Start a new session. Run `/hooks` or `claude --debug` to confirm one entry
   per event.

`preflight-check.sh` also warns at session start when `settings.json` still
names one of the nine scripts. The plugin itself then reports a double wiring.

**Rollback**: `claude plugin disable agenkic-ops@agenkic-hub`, then copy the
`settings.json` backup back. For one release, `harnesses/claude-code/hooks`
stays as a symlink to `../../skills/ops/hooks/scripts`. Old links into it keep
resolving. That symlink sits outside every plugin root, so the plugin cache
never sees it.

### 4. Workflows

**Decision**: the orchestration workflows move to
`skills/council/workflows/` as `.js` files. Nested calls use the namespaced
workflow name.

Evidence:

- Plugin workflows are `.js` files in `workflows/` at the plugin root
  `[docs: plugins/manifest-reference#standard-layout]`.
- Plugin workflows run as `/<plugin>:<meta.name>`
  `[docs: workflows#distribute-a-workflow-in-a-plugin]`.
- A plugin `demo.js` ran as `/agenkic-core:demo`. A plugin `demo2.mjs` did not
  resolve `[probe]`. This matches the repo note that the name registry skips
  `~/.claude/workflows/*.mjs` `[repo: workflows/feature-loop.mjs:21-23]`.
- `claude plugin validate --strict` passed a plugin with a `.mjs` workflow
  `[probe]`. Validation alone does not catch the extension.
- `workflow()` takes a registry name or `{ scriptPath }`. Nesting is one level
  deep. Scripts get no filesystem or Node.js API (bundled `/workflow-authoring`
  reference).
- Inside a plugin workflow, `workflow('agenkic-council:leaf', args)` ran a
  workflow from a second plugin and passed `args`. A bare `workflow('leaf')`
  failed, and the error listed only namespaced names `[probe]`.
- `${CLAUDE_PLUGIN_ROOT}` stayed literal inside a workflow script. The docs list
  no substitution for workflows `[probe]`,
  `[docs: plugins/manifest-reference#where-each-variable-resolves]`.
- `typeof process` was `'undefined'` inside the script `[probe]`. The current
  `WF_DIR` default therefore resolves to `/.claude/workflows` when the caller
  omits `workflowsDir` `[repo: workflows/spec-loop.mjs:464]`. That is a live bug.

Changes:

| Item | Today | After |
|:-----|:------|:------|
| Extension | `.mjs` | `.js` |
| Location | `workflows/` | `skills/council/workflows/` |
| Command | `Workflow({ scriptPath })` only | `/agenkic-council:<name>` |
| Nested call | `workflow({ scriptPath: \`${WF_DIR}/council-loop.mjs\` }, a)` | `args.workflowsDir` set: `workflow({ scriptPath: \`${dir}/council-loop.js\` }, a)`. Otherwise: `workflow('agenkic-council:council-loop', a)` |
| `WF_DIR` default | `process.env.HOME + '/.claude/workflows'` | Removed. The name path is the default |
| `feature-spec` workflow | `meta.name: 'feature-spec'` | `meta.name: 'spec-implement'`, see open question 4 |
| Worked examples | Shipped beside the tools | `docs/workflows/examples/`, see open question 3 |
| Smoke tests | `workflows/*.smoke.mjs` | `tests/workflows/*.smoke.mjs`. They stay `.mjs`, because Node runs them as modules |
| Markdown in `workflows/` | `feature-loop.md`, `spec-loop.md`, `spec-loop-spec.md` | `docs/workflows/` |

A linked install keeps working. The `workflows` installer component points at
`skills/council/workflows/` until step M5. The `.js` files there also resolve
by bare name for linked users `[docs: workflows#save-the-workflow-for-reuse]`.
A linked install has no `agenkic-council:` name, so a linked user passes
`workflowsDir` for the nested call.

Two points stay `[unverified]`. One is `Workflow({ name, resumeFromRunId })`
for a plugin workflow, because the reference shows resume with `scriptPath`.
The other is the exact allow rule `Workflow(agenkic-council:spec-loop)` for
`claude -p`.

### 5. userConfig and template variables

No skill uses a `{{variable}}` template today. Only `config/tmux/tmux.conf.tmpl`
and `config/zsh/agentic-hub.zsh.tmpl` do `[repo]`. The skills take settings as
environment-style names in a "Configuration" section instead. `userConfig`
replaces those names. The `{{variable}}` templates stay with the installer.

Evidence:

- `userConfig` options appear in the `/plugin` install dialog and in
  `/plugin configure`. `claude plugin install` in a shell never prompts, but
  takes `--config KEY=VALUE`
  `[docs: plugins/components#when-the-configuration-dialog-appears]`.
- `${user_config.KEY}` resolves in skill content for non-sensitive values only
  `[docs: plugins/manifest-reference#reference-a-saved-value]`.
- Types are `string`, `number`, `boolean`, `directory` and `file`. An unknown
  key inside an option fails validation
  `[docs: plugins/manifest-reference#user-configuration]`.
- An unset `${user_config.vault_path}` stayed literal in the skill text
  `[probe]`. The result for `"default": ""` is `[unverified]`.

Variables that move to `userConfig`:

| Today | Skill | Plugin | `userConfig` key | Type |
|:------|:------|:-------|:-----------------|:-----|
| `$VAULT_PATH` | `feature-spec` | `agenkic-core` | `vault_path` | `directory` |
| `$DAILY_NOTE_PATH` | `feature-spec` | `agenkic-core` | `daily_note_path` | `string` |
| `$LETTERS_DIR` | `cover-letter` | `agenkic-writing` | `letters_dir` | `directory` |
| `$VOICE_TEMPLATE` | `cover-letter` | `agenkic-writing` | `voice_template` | `file` |
| `$FACTS_FILE` | `cover-letter` | `agenkic-writing` | `facts_file` | `file` |
| `$INSIGHTS_ARCHIVE_DIR` | `insights-to-vault` | `agenkic-ops` | `insights_archive_dir` | `directory` |
| `config.json` `observer.enabled` | `continuous-learning-v2` | `agenkic-ops` | `observe_sessions` | `boolean` |
| None | The hooks in section 3 | `agenkic-ops` | Five hook toggles | `boolean` |

Each skill keeps an environment fallback, because Codex and OpenCode never
substitute `${user_config.*}`. The text pattern:

> Vault root: `${user_config.vault_path}`. If that value is empty, or still
> reads `${user_config.vault_path}`, use `$VAULT_PATH`. If both are unset, skip
> Step 5.

`continuous-learning-v2` edits `config.json` inside its skill directory today.
The plugin root changes on every update, so an edit there does not carry over to the next version
`[docs: plugins/manifest-reference#environment-variables]`. The observer reads
`${CLAUDE_PLUGIN_DATA}/config.json` first and seeds it from the shipped file.

Variables that stay in the installer answers file:

| Variable | Consumer |
|:---------|:---------|
| `user_name`, `accent_color`, `accent_color_secondary`, `tmux_theme_conf` | `config/tmux/tmux.conf.tmpl` |
| `node_path`, `claude_config_dir`, `vault_path`, `user_name`, `git_email` | `config/zsh/agentic-hub.zsh.tmpl` |

`KILINT_CONFIG` and `AGENKIC_SKILLS_ROOT` stay environment variables. Every
harness reads them the same way.

### 6. What stays in the installer

The installer keeps every job that a plugin cannot do.

| Component | After the change |
|:----------|:-----------------|
| `config-tmux`, `config-zsh`, `config-statusline` | Unchanged |
| `ext-statusline`, `ext-tmux-theme`, `ext-dots` | Unchanged |
| `harness-codex`, `harness-opencode`, `harness-pi`, `harness-hermes` | Unchanged. Each gains a `skills_dir=` key once open question 10 settles |
| `skills-core`, `skills-council`, `skills-writing`, `skills-ops` | Link skills into the skills directory of each selected non-Claude harness. A new `filter=SKILL.md` key links only children that hold a `SKILL.md`. Without it, `hooks/`, `workflows/`, `evals/`, `bin/` and `commands/` leak into the targets |
| `workflows` | Removed in step M5. The plugin ships the workflows |
| `harness-claude-code` | Stops copying hooks into `~/.claude/hooks/`. It prints the `permissions.ask` snippet to merge by hand |
| New `plugins-claude-code` | Runs `claude plugin marketplace add` and one `claude plugin install agenkic-<group>@agenkic-hub` per chosen group. `--dry-run` prints the commands |
| New `setup/migrate-to-plugins.sh` | The legacy cleanup in section 3, plus removal of hub skill and workflow links from `~/.claude/` |

The bash glob in `link_children` skips dot entries, so `.claude-plugin/` never
links `[repo: setup/setup.sh:379]`. `setup.ps1` calls `Get-ChildItem` without a
dot filter `[repo: setup/setup.ps1:153]`. The `filter=SKILL.md` key fixes both.

Codex and OpenCode keep the link install. A skill body that names
`${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}` or `${user_config.*}` reaches them
as literal text. Each such line therefore keeps a harness-neutral fallback, such
as a path relative to the `SKILL.md` or an environment variable.

Windows: plugins copy into the plugin cache, so Claude Code users no longer need
the junction fallback `[docs: plugins/loading#find-plugins-on-disk]`. The
Codex and OpenCode links on Windows still need it.

The author's own machine links `~/.claude/skills` to the vault Skills
directory, and the vault links each hub skill `[repo: setup/relink.sh:12-13]`.
After the plugin install, every hub skill loads twice, once bare and once
namespaced `[docs: plugins/create#convert-an-existing-claude-setup]`. Set each
hub skill to `"off"` in `skillOverrides` in `~/.claude/settings.json`.
`skillOverrides` does not touch plugin skills
`[docs: skills#override-skill-visibility-from-settings]`. Codex keeps reading
the vault links.

### 7. CI

Two new jobs in `.github/workflows/plugins.yml`.

**Job `plugin-validate`**, on every PR:

```bash
npm install -g @anthropic-ai/claude-code@2.1.303
claude plugin validate . --strict
for p in skills/core skills/council skills/writing skills/ops; do
  claude plugin validate "$p" --strict
done
test -z "$(find skills -path '*/workflows/*.mjs')"
```

- Given the marketplace root, `validate` checks the marketplace and the
  `plugin.json` of each relative-path plugin
  `[docs: plugins/create-marketplace#problems-that-validation-reports]`.
- Given one plugin root, it checks the manifest and the frontmatter of every
  skill, agent and command `[docs: plugins/create#test-and-debug]`.
- `--strict` turns warnings into failures `[docs: plugins/cli-reference#plugin-validate]`.
- The `find` line fails on a `.mjs` workflow, which `validate` lets pass
  `[probe]`.
- Whether `claude plugin validate` runs without credentials is `[unverified]`.
  Step M1 confirms it on the first CI run.

The existing `ci.yml` workflow job keeps its body-wrap syntax check. Its glob
moves to `skills/council/workflows/*.js` in step M3.

**Job `plugin-eval`**, on PRs that touch `skills/core/**` and on manual
dispatch:

```bash
claude plugin eval skills/core \
  --trust-plugin \
  --json results.json \
  --threshold 0.66 \
  --model claude-sonnet-5 \
  --no-publish \
  --max-cost-usd 5
```

- Each case runs three times with the plugin and three times without it
  `[docs: plugin-evals#how-a-case-is-scored]`.
- `--trust-plugin` keeps CI off the trust prompt, and `--json` with a non-zero
  exit gates the job `[docs: plugin-evals#run-evals-in-ci]`.
- A threshold of 0.66 lets one of three runs miss.
- A `tool_used` grader on `Skill` is a "plugin-fired indicator" in a two-arm
  run. It still counts when it is the only grader in a case
  `[docs: plugin-evals#compare-against-a-no-plugin-baseline]`.
- A no-trigger grader sets `min: 0`, `max: 0` and `arm: both`, so the baseline
  arm scores it too `[docs: plugin-evals#compare-against-a-no-plugin-baseline]`.
- All graders are `regex` or `tool_used`, so no judge call adds cost
  `[docs: plugin-evals#grade-the-result]`.

**Skills under eval**: `brainstorm`, `feature-spec`, `context-handoff` and
`agent-route`. Claude invokes each one on its own. `implement-spec` and
`merge-next` set `disable-model-invocation: true`, so a trigger eval says
nothing about them `[repo]`. The four chosen skills have neighbors that compete
for the same phrasing: `brainstorm-grill`, `brainstorm` and `model-route`.

Eight cases, one trigger case and one no-trigger case per skill:

| Case | Prompt (body of `prompt.md`) | Graders |
|:-----|:-----------------------------|:--------|
| `brainstorm-trigger` | I want to add offline sync to our notes app. Before anyone writes code, can we think through the options and trade-offs together? | `Skill` matches `brainstorm`. `Skill` matches `brainstorm-grill` with max 0 |
| `brainstorm-no-trigger` | Rename `cnt` to `count` in this line and show the result: `let cnt = items.length` | `Skill` matches any `agenkic-core` skill with max 0. Reply matches `count` |
| `feature-spec-trigger` | We agreed the CSV export design: one button, server-side generation, a 10k row cap. Spec it out so we can build it. | `Skill` matches `feature-spec`. `Skill` matches `brainstorm` with max 0 |
| `feature-spec-no-trigger` | In two sentences, what does a Gherkin Scenario Outline do? | `Skill` matches `feature-spec` with max 0. Reply matches `Examples` |
| `context-handoff-trigger` | My context is long and I have to stop for today. Write a handoff so the next session can pick this up. | `Skill` matches `context-handoff` |
| `context-handoff-no-trigger` | Which git command pushes my branch so a teammate can check it out? | `Skill` matches `context-handoff` with max 0. Reply matches `git push` |
| `agent-route-trigger` | Which subagent type should investigate why our auth middleware returns 500 errors? | `Skill` matches `agent-route` |
| `agent-route-no-trigger` | Which model tier fits a quick one-paragraph summary? | `Skill` matches `model-route`. `Skill` matches `agent-route` with max 0 |

`skills/core/evals/brainstorm-trigger/prompt.md`:

```markdown
---
description: A design question before any code should start brainstorm.
tags: [trigger, core]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

I want to add offline sync to our notes app. Before anyone writes code, can we think through the options and trade-offs together?
```

`skills/core/evals/brainstorm-trigger/graders/skill-fired.md`:

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?brainstorm"'
---
```

`skills/core/evals/brainstorm-trigger/graders/not-grill.md`:

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?brainstorm-grill"'
min: 0
max: 0
arm: both
---
```

The closing quote in each `input_match` keeps `brainstorm` from matching
`brainstorm-grill`. Add `evals/results/` to `.gitignore`
`[docs: plugin-evals#eval-suite-reference]`. The eval directory sits inside the
plugin root, so it ships to users. It holds no `SKILL.md`, so it loads no
skill `[probe]`.

### 8. Migration steps

Each step merges on its own and leaves both install paths working.

| Step | Change | Shippable state | Rollback |
|:-----|:-------|:----------------|:---------|
| M1 | Add `marketplace.json` and four `plugin.json` files with `"skills": ["./"]`. Add the `plugin-validate` job. Add `filter=SKILL.md` to both installers | Users can install the four plugins, skills only. Linked installs see no change | Revert the PR. A plugin user runs `claude plugin marketplace remove agenkic-hub`, which also uninstalls its plugins `[docs: plugins/create-marketplace#remove-the-marketplace-to-start-over]` |
| M2 | Rewrite the references in section 2. Add `userConfig` with environment fallbacks. Add `bin/kilint`. Move the visual-explainer commands through the manifest key | Plugin names resolve. Linked installs read the bare names in parentheses | Revert the PR. Skill text has no runtime state |
| M3 | Rename workflows to `.js`, move them into `skills/council/workflows/`, switch nested calls to names, move the smoke tests and the worked examples, and update `ci.yml` | `/agenkic-council:<name>` runs. The `workflows` component links the new directory for linked users | Revert the PR. A linked user re-runs `setup.sh` to restore the `.mjs` links |
| M4 | Move the hook scripts, add both `hooks.json` files and the toggles, add `migrate-to-plugins.sh` and the preflight warning. Keep the compatibility symlink | Plugin hooks fire. Legacy hooks keep resolving through the symlink until the user migrates | Disable `agenkic-ops`, restore the `settings.json` backup |
| M5 | Shrink the installer as in section 6. Rewrite the README, WALKTHROUGH, hooks and symlink docs and `walkthrough.sh` for the plugin path | The plugin path is the documented default. The installer covers `config/` and non-Claude harnesses | Revert the PR. The previous release tag still holds the full installer |
| M6 | Add the eight core eval cases and the `plugin-eval` job | Trigger regressions fail PRs | Disable the job. The cases stay as files |
| M7 | Remove the compatibility symlink. Bump the documented minimum version | Final layout | Restore the symlink from git history |

Step M6 depends only on M1, so it can merge before M3.

**Author cutover runbook**, outside the repo:

1. Run `setup/migrate-to-plugins.sh --dry-run`, then without the flag.
2. Run `claude plugin marketplace add ~/dev/Personal/agenKic-hub`. A local
   marketplace loads relative-path plugins in place, so edits apply at the next
   session `[docs: plugins/loading#in-place-and-copied-plugins]`.
3. Install the four plugins.
4. Add `skillOverrides` entries set to `"off"` for the 26 hub skill names.
5. Open `/plugin configure agenkic-core@agenkic-hub` and set the vault values.

### 9. Probe log

All probes ran on Claude Code 2.1.303 on 2026-10-19 in a scratch directory.

| # | Probe | Result |
|:--|:------|:-------|
| P1 | `claude plugin validate --strict` on a marketplace and one plugin with a skill, `hooks/hooks.json`, `bin/`, `workflows/demo.js`, `workflows/demo2.mjs` and `userConfig` | Both passed. The `.mjs` file drew no warning |
| P2 | `claude plugin details` with `--plugin-dir` | Listed 1 skill and the `SessionStart` hook. It lists no workflows |
| P3 | `claude -p "/agenkic-core:demo"` and `"/agenkic-core:demo2"` | `demo.js` ran and returned `1`. `demo2.mjs` did not resolve |
| P4 | A workflow that called `workflow('agenkic-council:leaf', {x:1})`, `workflow('leaf')` and `workflow('agenkic-core:demo')` | Namespaced calls returned. The bare call threw `no workflow with that name`, and the error listed only namespaced names. `'${CLAUDE_PLUGIN_ROOT}'` stayed literal. `typeof process` was `'undefined'` |
| P5 | `claude -p "/hello"` and `"/agenkic-core:hello"` | The bare name did not run the skill. The namespaced name ran it, with `${CLAUDE_PLUGIN_ROOT}` substituted and `${user_config.vault_path}` left literal |
| P6 | A group directory as the plugin root, with `"skills": ["./"]`, `hooks/` and `workflows/` | Two skills loaded. `hooks/` and `workflows/` loaded no skill. `--strict` on the marketplace failed until the marketplace had a top-level `description` |

**Dependencies**: Claude Code v2.1.303 or later. `jq` for the migration
script, which the safety hooks already need. An `ANTHROPIC_API_KEY` secret for
the eval job. Git 2.31 or later on the eval runner `[docs: plugin-evals#requirements]`.

**Risks**:

| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| Hooks run twice on a machine that keeps the old `settings.json` entries | High | `migrate-to-plugins.sh`, plus the preflight warning at every session start |
| Each hub skill loads twice, bare and namespaced, during the cutover. Context cost doubles and Claude may pick the legacy copy | High | `skillOverrides` set to `"off"`, or removal of the links |
| Nested workflow names rest on a probe, not on the docs. A later release may change name resolution | Medium | Keep the `workflowsDir` path. Re-run probe P4 before a minimum-version bump |
| `validate` passes a `.mjs` workflow that never loads | Medium | The `find` check in `plugin-validate` |
| A new ops user meets blocking hooks they did not expect | Medium | Toggles in section 3. `pre-push-auth` defaults to off. The README names each hook |
| An unset `userConfig` value reaches the model as literal `${user_config.KEY}` text | Medium | The fallback sentence in each skill |
| Third-party marketplaces do not auto-update by default, so users stay on old versions | Medium | The README tells users to turn on auto-update under `/plugin` Marketplaces `[docs: plugins/loading#which-marketplaces-and-plugins-auto-update]` |
| `link_children` leaks plugin directories into Codex and OpenCode skill targets | High without the fix | `filter=SKILL.md` in step M1 |
| Eval cost and flaky trigger results | Medium | Judge-free graders, a path filter, threshold 0.66, a 5 USD ceiling |
| One shared version bumps all four plugins on every hub release | Low | Accept it. Users update four small plugins |
| Codex and OpenCode skill directories differ from the assumed paths | Medium | Open question 10, settled in step M5 |

---

## Acceptance Scenarios

```gherkin
Feature: Hub Plugin Marketplace
  As a user of the hub
  I want one install command and marketplace updates
  So that hooks and workflows wire themselves and CI proves the package loads

  Background:
    Given Claude Code v2.1.303 or later
    And the user ran "claude plugin marketplace add Kiriketsuki/agenKic-hub"

  Rule: The marketplace installs and validates

    Scenario: Install the core plugin
      When the user runs "claude plugin install agenkic-core@agenkic-hub"
      Then "claude plugin details agenkic-core" lists 12 skills
      And "/agenkic-core:feature-spec" starts the feature-spec skill

    Scenario: Strict validation fails on a bad manifest
      Given a plugin.json with an unknown key inside a userConfig option
      When CI runs "claude plugin validate . --strict"
      Then the job fails and names the field

  Rule: Cross-plugin references resolve

    Scenario: Council hands off to core
      Given agenkic-core and agenkic-council are installed
      When adversarial-council reaches its findings gate and the user answers y
      Then Claude invokes the agenkic-core:context-handoff skill

    Scenario: Core is missing
      Given only agenkic-council is installed
      When adversarial-council reaches its findings gate and the user answers y
      Then Claude reports that agenkic-core:context-handoff is not installed
      And the council result file stays on disk

  Rule: Hooks run once per event

    Scenario: Migrated machine
      Given settings.json wired the nine hub hooks
      When the user runs setup/migrate-to-plugins.sh and installs agenkic-ops
      Then each hub hook runs once per matching event
      And a settings.json backup exists

    Scenario: Migration skipped
      Given settings.json still wires gh-check-before-create.sh
      And agenkic-ops is installed
      When a session starts
      Then preflight-check.sh prints a double-wiring warning

    Scenario: Blocking hook turned off
      Given the user set enforce_naming to false
      When Claude runs "git checkout -b wip"
      Then gh-check-before-create.sh exits 0

  Rule: Workflows run by namespaced name

    Scenario: Nested council loop
      Given agenkic-council is installed
      When the user runs "/agenkic-council:feature-loop" with a feature
      Then the run calls agenkic-council:council-loop as a nested workflow

    Scenario: Linked install without the plugin
      Given the workflows sit in ~/.claude/workflows as links
      And the caller passes workflowsDir
      When feature-loop reaches its council step
      Then the nested call uses the scriptPath under workflowsDir

  Rule: Configuration reaches skills on every harness

    Scenario Outline: Vault path source
      Given vault_path in userConfig is <plugin_value>
      And VAULT_PATH in the environment is <env_value>
      When feature-spec reaches Step 5
      Then it uses <result>

      Examples:
        | plugin_value | env_value | result               |
        | ~/vault      | unset     | ~/vault              |
        | unset        | ~/notes   | ~/notes              |
        | unset        | unset     | no daily-note update |

  Rule: Evals gate trigger regressions

    Scenario: Description change breaks a trigger
      Given a PR edits the brainstorm description
      When the plugin-eval job runs
      And brainstorm-trigger scores below 0.66
      Then the job exits 1 and the PR check fails
```

---

## Task Breakdown

| ID   | Task | Priority | Dependencies | Status  |
|:-----|:-----|:---------|:-------------|:--------|
| T1   | M1: marketplace.json, four plugin.json files, `filter=SKILL.md` in setup.sh and setup.ps1 | High | None | pending |
| T1.1 | M1: `plugin-validate` CI job, and a check that validate runs without credentials | High | T1 | pending |
| T2   | M2: rewrite every reference in section 2 | High | T1 | pending |
| T2.1 | M2: `userConfig` keys with fallback text, `bin/kilint`, the stale `KILINT_BIN` path fix | High | T1 | pending |
| T2.2 | M2: visual-explainer commands through the manifest key, names confirmed with `claude plugin details` | Med | T1 | pending |
| T3   | M3: `.mjs` to `.js`, move into `skills/council/workflows/`, name-based nesting, `WF_DIR` fix | High | T1 | pending |
| T3.1 | M3: move smoke tests, Markdown and worked examples, update `ci.yml` and the workflow docs | High | T3 | pending |
| T4   | M4: move hook scripts, write both hooks.json files, add the toggles to each script | High | T1 | pending |
| T4.1 | M4: `setup/migrate-to-plugins.sh` with `--dry-run`, plus the preflight double-wiring warning | High | T4 | pending |
| T5   | M5: installer components in section 6, including `plugins-claude-code` | Med | T3, T4 | pending |
| T5.1 | M5: README, WALKTHROUGH, hooks, symlinks and harness docs, plus `walkthrough.sh` | Med | T5 | pending |
| T5.2 | M5: settle Codex and OpenCode skill directories | Med | T5 | pending |
| T6   | M6: eight eval cases and the `plugin-eval` job | Med | T1 | pending |
| T7   | M7: remove the compatibility symlink | Low | T5 | pending |
| T8   | kilint pass on every changed Markdown file | Med | T2, T5.1 | pending |

---

## Exit Criteria

- [ ] `claude plugin validate --strict` passes on the marketplace root and on each plugin root in CI
- [ ] The core eval suite passes at threshold 0.66 in CI
- [ ] A clean machine installs all four plugins and runs one skill, one workflow and one hook from each plugin that has them
- [ ] A migrated machine shows one entry per hub hook in `/hooks`
- [ ] The section 2 inventory has no open row, and `rg` finds no `.mjs` under `skills/`
- [ ] A Codex link install still finds every skill
- [ ] kilint reports no errors on changed prose

---

## References

- Issue: Kiriketsuki/agenKic-hub#31. PR: #37
- Related spec: `docs/specs/todo/canon-hub-supercharge-spec.md`
- Docs read on 2026-10-19: `plugins/overview`, `plugins/create`,
  `plugins/components`, `plugins/manifest-reference`,
  `plugins/create-marketplace`, `plugins/dependencies`, `plugin-evals`,
  `plugins/loading`, `workflows`, plus `plugins/host-marketplace`,
  `plugins/marketplace-reference`, `plugins/cli-reference` and `skills` for
  cross-checks
- Bundled reference: the `/workflow-authoring` skill, for `workflow()` nesting

---
*Authored by: Clault KiperO 5.5*
