# Walkthrough

A tiered path from zero to a productive Claude Code session with the
agenKic-hub. Each step gives a command and one line of expected outcome.

> **Already fluent in Claude Code?** Skim Basics for the hub-specific parts
> (tmux keybindings, statusline, first skill run), then start at
> Intermediate.

On Linux or macOS, `setup/walkthrough.sh` runs the Basics tier
interactively and checks each step for you. On Windows, run `setup.ps1`
then follow this written walkthrough.

## Table of Contents

- [Basics](#basics)
  - [Install Claude Code](#install-claude-code)
  - [Install the GitHub CLI](#install-the-github-cli)
  - [Clone the hub](#clone-the-hub)
  - [Run the installer](#run-the-installer)
  - [The four skill groups](#the-four-skill-groups)
  - [tmux for agents](#tmux-for-agents)
  - [The command palette](#the-command-palette)
  - [First skill run](#first-skill-run)
- [Intermediate](#intermediate)
  - [Context management](#context-management)
  - [The full spec loop](#the-full-spec-loop)
  - [Guard-rail hooks](#guard-rail-hooks)
  - [Council and writing skills](#council-and-writing-skills)
- [Advanced](#advanced)
  - [Multi-agent workflows](#multi-agent-workflows)
  - [Adversarial council](#adversarial-council)
  - [Authoring a new skill](#authoring-a-new-skill)
- [Extras: the real rice](#extras-the-real-rice)
  - [ext-statusline](#ext-statusline)
  - [ext-tmux-theme](#ext-tmux-theme)
  - [ext-dots](#ext-dots)

---

## Basics

Adopt the hub in layers. Each layer works without the next, and each layer
builds the habits the next layer assumes. Do not install everything on day
one. This tier gets you your first productive session: install, a durable
tmux session, and a first skill run. Start here even if you already know
Claude Code, because the tmux keybindings and the skill names are specific
to this hub.

### Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```
Expected outcome: the `claude` command is on your PATH.

```bash
claude --version
```
Expected outcome: prints a version string, for example `2.x.x (Claude Code)`.

### Install the GitHub CLI

The GitHub CLI handles auth for the clone, so a fresh machine needs no
SSH alias and no manual key setup.

```bash
pacman -S github-cli   # Arch. macOS: brew install gh. Debian: apt install gh
```
Expected outcome: the `gh` command is on your PATH.

```bash
gh auth login
```
Expected outcome: an interactive login. Pick `github.com`, then SSH or
HTTPS, and finish in the browser. Run this once per machine.

### Clone the hub

```bash
gh repo clone Kiriketsuki/agenKic-hub
cd agenKic-hub
```
Expected outcome: the repo sits at `agenKic-hub/` in your current
directory.

### Run the installer

```bash
./setup/setup.sh
```
Expected outcome: an interactive picker starts. It lists every component
manifest under `setup/components/`, one line per component with its
description. Select `skills-core` and `config-tmux` for this tier, then
answer the template prompts that follow (accept the defaults on your
first run).

```bash
./setup/setup.sh --dry-run
```
Expected outcome: prints every action the picker's selection would take,
with no change on disk. Run this first if you want to preview before you
commit.

For a non-interactive run, copy `setup/answers.example.yml`, edit the
`components:` line and the template variables, then pass it back in:

```bash
./setup/setup.sh --profile setup/answers.yml
```
Expected outcome: the same install runs with no prompts.

Windows users run `pwsh setup/setup.ps1` instead, then follow the rest of
this walkthrough as written documentation, since `setup/walkthrough.sh`
covers Linux and macOS only.

### The four skill groups

Skills sit under `skills/` in four groups. Each group has its own manifest
under `setup/components/`, so the picker offers them one at a time, and
each selection symlinks that group's skills individually into
`~/.claude/skills/`.

| Group | Manifest | Skills | Buys you |
|:---|:---|:---|:---|
| `skills/core/` | `skills-core.conf` | brainstorm, brainstorm-grill, feature-spec, implement-spec, merge-next, context-handoff, context-resume, agent-route, model-route | The spec-first loop this tier's capstone runs |
| `skills/council/` | `skills-council.conf` | adversarial-council, council-fix, council-supervisor, parallel-fix | Debate a change before it merges, see Advanced |
| `skills/writing/` | `skills-writing.conf` | ste-writing, kilint, visual-explainer, cover-letter | The prose house style, and a linter that checks it |
| `skills/ops/` | `skills-ops.conf` | repo-hooks, security-scan, croc-send, release-notes-enricher, insights-to-vault, continuous-learning-v2 | Guard rails and repo maintenance |

Basics needs only `skills-core`. Install the rest as Intermediate and
Advanced call for them.

### tmux for agents

Claude Code sessions run inside a shell process. Close the terminal window
and the process dies with it. tmux keeps a session running on the machine
independent of any one terminal window. An agent keeps working while you
disconnect, close your laptop lid, or lose a network link. Reattach later
and the session is exactly where you left it.

```bash
tmux new -s hub
```
Expected outcome: a new tmux session named `hub` opens, with a status bar
at the bottom.

Start Claude Code inside that session, then detach without killing it:

```
Ctrl+a d
```
Expected outcome: you return to your normal shell. The session, and any
agent running inside it, keeps running in the background.

```bash
tmux attach -t hub
```
Expected outcome: you land back inside the same session, with the agent's
output exactly as you left it.

The hub renders `config/tmux/tmux.conf.tmpl` into `~/.config/tmux/tmux.conf`
during setup. The prefix is `Ctrl+a`, nearer your home row than the
default `Ctrl+b`.

### The command palette

```
Ctrl+a Space
```
Expected outcome: a floating command palette opens, an fzf picker over 51
tmux actions from `config/tmux/scripts/palette.sh`. Type to filter, Enter
to run, Esc to cancel. Requires `fzf` on your PATH. When fzf is absent,
the palette prints an install hint instead of opening.

### First skill run

Open Claude Code inside your tmux session and complete one skill run. Any
completed skill run finishes this tier. Any skill from any group works.
The guided example below is the spec pair from `skills-core`, but a
`/kilint` pass on a file or a `/security-scan` also counts.

```
/brainstorm
```
Expected outcome: Claude Code asks clarifying questions about what you
want to build, one at a time. It then proposes two or three approaches
and asks for your approval.

```
/feature-spec
```
Expected outcome: Claude Code interviews you section by section, then
writes a filled `docs/specs/todo/<feature-name>-spec.md` file in the
target repo. Run this after `/brainstorm` approves a design, or on its
own for a feature you already understand well.

Basics ends here. You have a working install, a durable tmux session, and
one completed skill run.

---

## Intermediate

This tier adds the habits that keep any long Claude Code session usable:
context management, the rest of the spec loop, and guard-rail hooks. A
hook enforces a rule deterministically, so it does not depend on the
model remembering the rule.

### Context management

A long session accumulates conversation history that a model eventually
must summarize or lose. The hub gives you two skills that make that
transition deliberate instead of automatic.

```
/context-handoff
```
Expected outcome: Claude Code writes a handoff file that orients a fresh
session. It states the active task, the decisions made and why, the
approaches that failed, and the concrete next steps. Run this before
`/clear` or before compaction, not after.

```
/context-resume active
```
Expected outcome: Claude Code loads the most recent handoff file, verifies
the current git state, and re-reads the key files the handoff names.

Watch the context bar in your session and hand off at about 80 percent
used. Do not ride the bar into the summarizer, since a forced summary
drops the nuance a deliberate handoff keeps.

Run `/clear` between unrelated tasks, not mid-task. A cleared context
starts a new conversation with no memory of what came before. Clear only
after a handoff exists or after a task fully lands.

### The full spec loop

The core skills from Basics start the spec-first loop: brainstorm and
feature-spec. These two finish it.

```
/implement-spec
```
Expected outcome: Claude Code reads a `*-spec.md` file, routes its tasks
to subagents, and executes them in dependency-aware waves, committing
after each logical chunk. Point it at a spec in `docs/specs/todo/`, or let
it find the most recent one.

```
/merge-next
```
Expected outcome: Claude Code commits any remaining work, pushes, and
verifies the pull request targets the correct parent branch. It then
squash merges the PR, checks out the next sibling branch, and rebases it
onto the parent. Run this when a feature, task, epic, or saga branch is
ready to ship.

### Guard-rail hooks

A hook is a shell command the harness runs around a tool call. It enforces
a rule deterministically, without depending on the model remembering an
instruction. Install `skills-ops` for `repo-hooks` once your core loop
feels routine:

```bash
./setup/setup.sh
```
Expected outcome: select `skills-ops` in the picker. The installer
symlinks `repo-hooks` into `~/.claude/skills/`. Run `/repo-hooks` from any
session afterward to wire the guard rails into that repo's
`.claude/settings.json`.

### Council and writing skills

`skills-council` and `skills-writing` add a debate loop and a prose house
style on top of the core loop. Install both once the core loop feels
routine, since council fix rounds and STE prose both assume the spec loop
already works for you.

```bash
./setup/setup.sh
```
Expected outcome: select `skills-council` and `skills-writing` in the
picker. Both groups symlink into `~/.claude/skills/`. Run `/kilint` on any
markdown file, or continue to Advanced for `/adversarial-council`.

---

## Advanced

The workflow scripts below fan out multiple agents at once. They compose
the skills from Basics and Intermediate, so confirm those already work on
your machine before you install `workflows/`.

### Multi-agent workflows

```bash
./setup/setup.sh
```
Expected outcome: select `workflows` in the picker. The installer
symlinks each `workflows/<name>` entry into `~/.claude/workflows/<name>`,
covering `spec-loop`, `feature-loop`, `council-loop`, `ultracode-fix`,
`ultracode-implement`, and further coordinator scripts for the Workflow
tool.

### Adversarial council

```
/adversarial-council
```
Expected outcome: Claude Code convenes a team of real spawned advocate
and critic agents to debate a motion. An arbiter moderates the debate and
produces a FOR, AGAINST, or CONDITIONAL recommendation with cited
rationale.

### Authoring a new skill

Study an existing skill under `skills/core/` before you write your own.
Each `SKILL.md` carries YAML frontmatter with a `name`, a `description`
that states its trigger phrases, and a body that walks the process step
by step. Place a new skill under the group it serves (`skills/core/`,
`skills/council/`, `skills/writing/`, or `skills/ops/`), then add it to
that group's manifest under `setup/components/` so the installer offers
it.

```bash
python3 skills/writing/kilint/bin/kilint skills/<group>/<your-skill>/SKILL.md
```
Expected outcome: a violation score under 1.5 per 100 words. Every skill
body follows the same STE house style as the rest of the hub's prose.

---

## Extras: the real rice

Nothing in this section is required. The three components below install
real external repos through the same `type=external` component path as
every other manifest. The installer clones or pulls the repo. It then runs
its own installer script, or applies the repo with stow. `--dry-run` prints
the clone-and-run plan for any of them. It makes no change on disk.

### ext-statusline

```bash
./setup/setup.sh
```
Expected outcome: select `ext-statusline` in the picker. The installer
clones `Kiriketsuki/chrysaki-claude` to `~/.local/share/chrysaki-claude`
and runs that repo's own `init.sh`, which installs the statusline and
wires `statusLine` into `~/.claude/settings.json`. Restart Claude Code
afterward to see it render.

### ext-tmux-theme

```bash
./setup/setup.sh
```
Expected outcome: select `ext-tmux-theme` in the picker. The installer
clones `Kiriketsuki/chrysaki` to `~/.config/tmux/chrysaki`. The rendered
`tmux.conf` already carries a guarded source line for the theme file. The
theme activates the next time you reload tmux with `Ctrl+a r`, no edit
needed.

### ext-dots

```bash
./setup/setup.sh
```
Expected outcome: select `ext-dots` in the picker. The installer clones
`Kiriketsuki/dots` to `~/dots` and applies it with `stow`, symlinking the
rest of the dotfiles into your home directory. Follow the dots repo's own
README for anything the stow pass does not cover.

---

*Authored by: Clault KiperS 4.6*
