---
marp: true
theme: default
paginate: true
---

# Developing with Claude Code and the Terminal

## From a bare shell to an agentic workflow

<!-- A tour of the terminal stack first, then Claude Code on top of it. Each layer is optional and replaceable. -->

---

## Agenda

- The Terminal and Ghostty
- Nerd Fonts
- tmux
- The Stack vs the Stock Terminal
- lazygit
- Terminal Editors
- Prompt Styling
- Claude Code Basics
- Context Management
- Hooks
- Simplified Technical English
- The GitHub CLI
- MCP
- Claude for Slack
- GitHub Actions
- Git Worktrees
- CLAUDE.md and AGENTS.md

<!-- Set expectations: the first half builds the terminal foundation, the second half builds the agentic workflow on top of it. -->

---

# The Terminal and Ghostty

---

## What Is A Terminal Emulator

- A terminal emulator is an application. It displays a shell and passes your keystrokes to it.
- The shell runs inside the emulator. The emulator only renders text and handles input.
- Your terminal choice affects speed, font rendering, and daily comfort. It does not change the shell.
- Common examples include Ghostty, WezTerm, iTerm2, and Windows Terminal.
- A fast, well-configured terminal reduces friction in a Claude Code session.

<!-- Frame the terminal as a separate layer from the shell. Developers new to serious terminal work often confuse the two. Set up this distinction before Ghostty specifics. -->

---

## Why Ghostty

- Ghostty renders text on the GPU. Scrolling and redraw stay smooth under heavy output.
- Ghostty ships as a native application on each platform. It does not rely on Electron.
- Startup time is fast. This matters when you open many terminal windows during a session.
- Ghostty reads one plain text config file. You edit it directly, with no GUI settings panel required.
- The project is open source and actively maintained by Mitchell Hashimoto and contributors.

<!-- Ghostty was released publicly in December 2023 by Mitchell Hashimoto, creator of Vagrant and Terraform. Its main pitch is native performance plus a simple config file, aimed at developers who live in the terminal. -->

---

## Installing Ghostty

- On macOS, install with Homebrew: brew install --cask ghostty.
- On Linux, install from your distribution package manager where available, or build from source.
- Ghostty has no native Windows build yet. Windows users need a stand-in terminal.
- On Windows, use WezTerm or Windows Terminal instead. Both give GPU-accelerated rendering.
- Check the Ghostty GitHub releases page for the current supported platform list before you install.

```bash
# macOS
brew install --cask ghostty

# Windows stand-in (winget)
winget install Microsoft.WindowsTerminal
# or
winget install wez.wezterm
```

<!-- Confirm platform support at install time, since this changes. State the Windows caveat plainly so nobody spends time chasing a Windows build that does not exist yet. -->

---

## The Ghostty Config File

- Ghostty reads its config from ~/.config/ghostty/config on macOS and Linux.
- The file uses a simple key equals value format. No JSON or YAML syntax is required.
- Ghostty creates no config file by default. Create the file and directory yourself.
- Reload the config from inside Ghostty with the reload-config keybind, instead of restarting the app.
- Keep this file in your dotfiles repository so your setup travels with you across machines.

```bash
mkdir -p ~/.config/ghostty
touch ~/.config/ghostty/config
```

<!-- Emphasize the config path and the fact that Ghostty starts with sane defaults, so an empty file is a valid starting point. Point out dotfiles management as a best practice tie-in. -->

---

## Key Config Options

- font-family sets the typeface. Use a Nerd Font to render icons and glyphs in prompts.
- font-size sets the point size. Increase it for screen sharing or accessibility.
- theme selects a bundled color scheme by name, or you can define custom colors directly.
- keybind maps a key combination to a Ghostty action, one line per binding.
- background-opacity and window-padding-x/y adjust transparency and internal spacing.

```
font-family = JetBrainsMono Nerd Font
font-size = 13
theme = catppuccin-mocha
keybind = cmd+shift+enter=new_split:right
```

<!-- Walk through each option live if possible. Recommend a Nerd Font explicitly, since prompt themes like Starship and Powerlevel10k depend on glyph support. -->

---

# Nerd Fonts

---

## What Is Glyph Patching?

- A Nerd Font takes a base font and adds thousands of icon glyphs to it.
- Icons come from sets such as Font Awesome, Devicons, and Powerline symbols.
- The patcher merges these icons into the font's private-use Unicode area.
- Result: one font file that renders both normal text and icons.
- Project: nerdfonts.com, maintained by the Nerd Fonts community.

<!-- Explain that patching is a build step. The Nerd Fonts project runs a script over an existing font, such as JetBrains Mono, and injects icon glyphs into unused code points. The output is a drop-in replacement font with the same text metrics. -->

---

## Why Prompts and TUIs Need Them

- Starship and p10k draw icons for git branch, OS, language version, and status.
- lazygit uses icons for file status, branches, and diff markers.
- eza (the modern ls replacement) shows a file-type icon per entry.
- Without a patched font, these render as boxes or blank tofu glyphs.
- The tool sends the correct Unicode code point. The font must supply the icon.

<!-- Make clear this is not a bug in the tool. The tool assumes the terminal font contains the icon. Any font without the patch cannot fill that code point, so the terminal shows a fallback glyph instead. -->

---

## Installing a Nerd Font

- Manual: download a font zip from nerdfonts.com and install it for your OS.
- macOS: brew install --cask font-jetbrains-mono-nerd-font
- Windows (winget): winget install DEVCOM.JetBrainsMonoNerdFont
- Arch Linux: pacman -S ttf-jetbrains-mono-nerd
- Pick one Nerd Font family and use it everywhere for consistency.

```bash
# macOS (Homebrew)
brew install --cask font-jetbrains-mono-nerd-font

# Arch Linux
sudo pacman -S ttf-jetbrains-mono-nerd

# Windows (winget)
winget install DEVCOM.JetBrainsMonoNerdFont
```

<!-- Homebrew, winget, and most Linux package managers now carry pre-patched Nerd Font packages directly, so a manual download is optional on those platforms. Confirm the package name matches the exact font family the user wants. -->

---

## Setting the Font in Ghostty

- Open the Ghostty config file, usually at ~/.config/ghostty/config.
- Add a font-family line naming the exact patched font name.
- Restart Ghostty, or reload config, for the change to apply.
- The font name must match what the OS reports as installed, exactly.

```
# ~/.config/ghostty/config
font-family = "JetBrainsMono Nerd Font"
font-size = 13
```

<!-- Stress the exact string match requirement. A slight name mismatch, such as a missing space or wrong suffix like Mono versus NF, causes Ghostty to fall back to a default font that lacks the icon glyphs. -->

---

## Verify Glyphs Render Correctly

- Run a quick icon test in the terminal to check rendering.
- Launch starship, p10k, lazygit, or eza and look for clean icons.
- A correct render shows a folder icon, a branch icon, a language logo.
- A broken render shows an empty box, a question mark box, or tofu.
- If broken, the terminal font setting is wrong, not the tool.

```bash
# Quick glyph test
echo "  "

# Or use eza to see file-type icons
eza --icons
```

<!-- Walk through the eza --icons test live if possible. It gives an immediate visual pass or fail. If icons show as boxes, the fix is always the terminal font setting, never the tool configuration. -->

---

## Common Failure: Tofu Boxes

- Symptom: prompts and TUIs show empty boxes or question-mark boxes.
- Root cause: the terminal font is not set to a patched Nerd Font.
- Confusion trap: the config file for starship or p10k is often correct.
- Fix: set font-family in the terminal, not in the shell tool config.
- Check this first before debugging shell scripts or prompt themes.

<!-- This is the single most common support issue new users hit. They spend time editing starship.toml or .p10k.zsh, when the real fix is one line in the terminal emulator config. Teach this shortcut early to save debugging time. -->

---

# tmux

---

## tmux: Sessions, Windows, Panes

- A session holds one or more windows. A window holds one or more panes.
- Sessions survive a closed terminal or a dropped SSH connection.
- Create a named session: tmux new -s work.
- List sessions: tmux ls. Kill one: tmux kill-session -t work.
- Windows work like tabs. Panes split one window into grids.

```bash
tmux new -s work
tmux ls
tmux kill-session -t work
```

<!-- Frame tmux as a terminal multiplexer, not a text editor. State the hierarchy clearly: server, then sessions, then windows, then panes. Tell the audience they will use this hierarchy every day once Claude Code runs long jobs. -->

---

## The Prefix Key

- Every tmux command starts with a prefix key, by default Ctrl-b.
- Press the prefix, release it, then press the command key.
- New window: prefix then c. Next window: prefix then n.
- Split pane vertically: prefix then percent sign.
- Split pane horizontally: prefix then double quote.

```
Ctrl-b c   # new window
Ctrl-b n   # next window
Ctrl-b %   # split vertical
Ctrl-b "   # split horizontal
```

<!-- Demonstrate the two-step rhythm live. Many new users hold the prefix down instead of tapping it. Show a full split-and-switch sequence on screen. -->

---

## Detach and Attach for Persistence

- Detach from a session: prefix then d. The session keeps running.
- Reattach from any terminal: tmux attach -t work.
- A detached session keeps running processes alive on the server.
- Closing the terminal window does not stop a detached session.
- Reconnect from a different machine and the session looks the same.

```bash
Ctrl-b d
tmux attach -t work
```

<!-- This is the payoff slide. Persistence is the entire reason to learn tmux before a long Claude Code run. Emphasize that detach is not the same as closing the terminal. -->

---

## Why Persistence Matters for Long Claude Code Runs

- A long Claude Code task over SSH dies if the SSH connection drops.
- tmux decouples the running process from the SSH connection.
- Start Claude Code inside tmux, detach, then close your laptop lid.
- Reattach later from any device and see the full scrollback.
- A dropped network link no longer kills hours of agent work.

```bash
ssh devbox
tmux new -s claude
claude
# Ctrl-b d, close laptop
ssh devbox
tmux attach -t claude
```

<!-- Walk through the failure mode without tmux: SSH drops, the remote shell exits, and Claude Code exits with it. With tmux the shell stays alive on the remote server regardless of the SSH link. -->

---

## Minimal ~/.tmux.conf Starter

- Remap the prefix to Ctrl-a. It sits closer to the home row.
- Enable mouse mode for pane resize, pane select, and scroll.
- Enable vi-style keys for copy mode navigation.
- Reload the config without restarting: prefix then r, once bound.
- Keep the file small at first. Add options only when needed.

```bash
# ~/.tmux.conf
unbind C-b
set -g prefix C-a
bind C-a send-prefix

set -g mouse on
setw -g mode-keys vi

bind r source-file ~/.tmux.conf \; display "Config reloaded"
```

<!-- Have the audience paste this file and run tmux source-file ~/.tmux.conf, or start a fresh session, to load it. Point out that mouse on lets a new user click to select a pane instead of memorizing prefix o. -->

---

## TPM: The Plugin Manager

- TPM, the Tmux Plugin Manager, installs and updates tmux plugins.
- Clone it once: git clone into ~/.tmux/plugins/tpm.
- List plugins in ~/.tmux.conf, then run prefix then capital I to install.
- Popular plugins add session persistence across a full reboot.
- Treat TPM as optional. Master the basics first.

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# in ~/.tmux.conf
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
run '~/.tmux/plugins/tpm/tpm'

# then inside tmux: prefix + I to install
```

<!-- Mention tmux-resurrect and tmux-continuum by name if time allows, since they persist sessions across a machine reboot, which plain tmux cannot do. Keep this slide brief. The audience needs the concept, not a full plugin tour. -->

---

# The Stack vs the Stock Terminal

---

## The Stack vs the Stock Terminal

- Ghostty, tmux, and Nerd Fonts are three separate layers, each replaceable on its own.
- Ghostty renders text with the GPU, using a native platform toolkit for speed.
- tmux runs sessions on the server, independent of any terminal window.
- Nerd Fonts add glyph icons that tools like starship and neovim can display.
- A stock terminal, such as Terminator or GNOME Terminal, bundles tabs, splits, and rendering into one app.
- A bare TTY has no tabs, no splits, and no custom font support.

<!-- Frame the core tradeoff early. A composable stack trades convenience for control. Each layer does one job, and a developer can swap any layer without touching the others. A stock terminal picks the tradeoffs for you. -->

---

## Comparison Table

- Setup time: stock terminal is instant. Ghostty plus tmux plus Nerd Fonts takes 15 to 30 minutes.
- Session persistence: stock terminal loses the session on window close. tmux keeps it running.
- Remote work: stock terminal needs a new SSH connection per tab. tmux reattaches to one session.
- Rendering speed: Ghostty uses the GPU. Most stock terminals use the CPU or a slower renderer.
- Customization: the stack lets you swap font, shell, and multiplexer independently. A stock terminal bundles them.
- Learning curve: stock terminal needs none. tmux needs the user to learn its prefix key and commands.

<!-- Read this table slide slowly. Each row names a concrete difference a new developer can verify themselves in five minutes. -->

---

## What tmux Actually Buys You

- A tmux session keeps running after you close the terminal window or lose the SSH connection.
- Reattach to the same panes, same running commands, same scrollback, from any terminal.
- Split panes and multiple windows work the same over SSH as on a local machine.
- A stock terminal's built-in tabs die when the terminal process dies.
- tmux adds one dependency: you must remember the prefix key, usually Ctrl-b.

```bash
tmux new -s work
# ... do work, then close the terminal window ...
tmux attach -t work
```

<!-- Emphasize that session persistence is the single strongest argument for tmux, especially for anyone who works over SSH or restarts their laptop. Show the two-command example live if time allows. -->

---

## Nerd Fonts: Small Layer, Visible Payoff

- A Nerd Font patches a base font with icon glyphs from Font Awesome, Devicons, and other sets.
- Tools such as starship, neovim, and lsd use these glyphs to show file types and git status.
- Without a Nerd Font installed, those tools render boxes or question marks instead of icons.
- Install once at the system level. Every terminal that points at the font benefits.
- A stock terminal works fine without a Nerd Font. Missing icons just fall back to plain text.

<!-- Keep this slide light. Nerd Fonts are cosmetic but widely assumed by modern CLI tooling, so skipping this step causes confusing rendering bugs later. -->

---

## When a Stock Terminal Is the Right Choice

- A one-off task on a local machine, with no need to reconnect later, does not need tmux.
- A new developer still learning the shell benefits from fewer new key bindings at once.
- Some corporate or restricted environments block custom terminal installs entirely.
- GNOME Terminal and Terminator already give you tabs and splits, which cover many daily needs.
- Do not adopt the full stack until a real pain point appears: a lost session, a slow render, or missing icons.

<!-- Close honestly. This stack is not mandatory for competent terminal use. Recommend it as a response to specific friction, not as a default install for every new developer. -->

---

## Migration Path

- Start with tmux alone. It solves the most common pain: a lost session on disconnect.
- Add a Nerd Font next. It is a five-minute install with an immediate visual payoff.
- Switch the terminal emulator last, only if rendering speed becomes a noticeable problem.
- Each step is reversible. Uninstall any single layer without breaking the other two.
- Test the new setup on a low-stakes task before relying on it for daily work.

<!-- Give the audience a low-risk order of adoption. Sequencing this way avoids the common mistake of changing three tools at once and being unable to tell which change caused a problem. -->

---

# lazygit

---

## What Is lazygit

- lazygit is a terminal UI for git. It runs inside your existing terminal.
- It shows status, files, branches, commits, and stash in one screen.
- You stage, commit, push, and pull with single keystrokes.
- It wraps the git CLI. It does not replace git, it speeds up daily use.
- Written in Go by Jesse Duffield. Actively maintained on GitHub.

<!-- Introduce lazygit as a keyboard-driven layer over git. Emphasize it stays in the terminal, so it fits a Claude Code session without switching tools. State the author and project status so the audience trusts it as a maintained dependency, not a toy. -->

---

## Install lazygit

- macOS: install with Homebrew.
- Windows: install with Scoop or Winget.
- Linux: install with your package manager, or download the binary.
- Verify the install by checking the version.
- Confirm the binary is on your PATH before you launch it.

```bash
# macOS
brew install lazygit

# Windows (Winget)
winget install JesseDuffield.lazygit

# Verify
lazygit --version
```

<!-- Walk through one install command per platform. Tell the audience to run lazygit --version right after install, to catch a broken PATH early. Point out the project README lists every package manager, including apt, dnf, pacman, and Chocolatey. -->

---

## Launch Inside a Repo

- Open a terminal inside any git repository.
- Run the command lazygit. No flags are required.
- lazygit reads the repository at your current working directory.
- Press q at any time to quit and return to the shell.
- Run it from inside a Claude Code session terminal the same way.

```bash
cd my-project
lazygit
```

<!-- Show a live launch. Stress that lazygit needs a git repository as the working directory, so cd into the repo first. Mention that many developers alias lazygit to lg for speed. -->

---

## Panel Layout

- Status panel: current branch, ahead/behind counts, and repo state.
- Files panel: unstaged and staged changes, ready to review.
- Branches panel: local and remote branches, with checkout support.
- Commits panel: commit history for the current branch.
- Stash panel: saved work-in-progress, ready to pop or apply.
- Tab or arrow keys move focus between panels.

<!-- Point at each panel on screen as you name it. Explain that focus moves with the arrow keys or number keys 1 through 5, and that each panel has its own set of contextual key commands shown at the bottom of the screen. -->

---

## Core Keys

- Space: stage or unstage the selected file or hunk.
- c: open the commit message prompt.
- p: pull from the remote.
- Shift+P: push to the remote.
- x: open the command menu for less common actions.
- Enter: expand a file to view and stage individual hunks or lines.

```
space   stage/unstage
c       commit
p       pull
P       push
x       open menu
enter   view file diff, stage hunks
```

<!-- Demonstrate each key live if possible. Note that capital P differs from lowercase p, so a careless press pushes instead of pulling. Mention that x opens a searchable menu covering rarer commands like tag, reset, or cherry-pick. -->

---

## Interactive Rebase, Visually

- Select a commit in the commits panel.
- Press r to start an interactive rebase from that commit.
- Mark commits to squash, edit, drop, or reorder with single keys.
- Move a commit up or down with Ctrl+J and Ctrl+K.
- Confirm the rebase, then review the result in the same panel.
- No manual editing of a rebase todo file in an external editor.

```
r       start interactive rebase
ctrl+j  move commit down
ctrl+k  move commit up
s       squash
e       edit
d       drop
```

<!-- This slide removes the biggest fear factor for new developers: interactive rebase. Show that lazygit turns a text-file edit into a series of key presses on a live list. Reassure the audience that a mistake is easy to abort before confirming. -->

---

## Why It Pairs Well With Claude Code

- Claude Code stages and edits files as it works on a task.
- lazygit gives you a fast visual diff of everything the agent touched.
- Review staged hunks before you approve a commit, not after.
- Split changes with Space at the hunk level, keep some, unstage others.
- Run lazygit in a second terminal pane alongside your Claude Code session.
- You stay the final reviewer. The agent proposes, you dispose.

<!-- Close on the workflow tie-in. Recommend a split terminal or tmux pane: Claude Code in one pane, lazygit in the other. Emphasize that agent-generated diffs deserve the same review discipline as a colleague's pull request, and lazygit makes that review fast rather than a chore. -->

---

# Terminal Editors

---

## Why You Need Survival-Level Editing

- The terminal often opens a file straight into an editor. You cannot avoid this.
- Git uses the terminal editor for commit messages, rebases, and merge conflicts.
- SSH sessions on remote servers rarely have a GUI editor available.
- You do not need mastery. You need enough skill to edit and exit without panic.
- Pick one editor now. Learn its exit sequence before you need it under pressure.

<!-- Frame this slide as motivation, not a sales pitch for nvim. Many new developers hit a terminal editor by accident, for example during a git commit, and freeze because they do not know how to leave. The goal of this section is to remove that fear with a short, concrete toolkit. -->

---

## Nano: The Easy Baseline

- Nano ships with most Linux distributions and is available on macOS and WSL.
- On-screen shortcuts stay visible at the bottom of the window at all times.
- Ctrl+O saves the file. Ctrl+X exits. Ctrl+K cuts a line.
- No modes to learn. You type, and the text appears, like a normal text box.
- Use nano when you need to edit a file fast and forget the details later.

```bash
nano config.yaml
```

<!-- Nano is the safe default. Its shortcuts print at the bottom of the screen, so a new developer never gets stuck. Recommend it as the first editor to reach for, before nvim, until the terminal workflow feels normal. -->

---

## Micro: A Modern, Friendly Option

- Micro behaves like a normal graphical editor, with Ctrl+S to save and Ctrl+Q to quit.
- It supports mouse clicks, text selection, and standard copy and paste.
- Micro includes syntax highlighting and multiple cursors out of the box.
- Install it once. It runs the same way on Linux, macOS, and Windows terminals.
- Choose micro over nano when you want closer parity with a desktop editor.

```bash
# Install (varies by platform)
brew install micro    # macOS
sudo apt install micro  # Debian/Ubuntu

micro config.yaml
```

<!-- Micro is worth a mention because it removes almost all of the terminal-editor learning curve. Verify the install command for the audience's platform before presenting, since package names can shift between distributions. -->

---

## Nvim Survival Kit

- Nvim opens in normal mode. Typing in normal mode runs commands, not text.
- Press i to enter insert mode. Now you can type text like any editor.
- Press Esc to leave insert mode and return to normal mode.
- Type :wq and press Enter to save the file and quit.
- Type :q! and press Enter to quit without saving, when you made a mistake.
- Memorize these five actions. They cover almost every accidental nvim session.

```
:wq   → save and quit
:q!   → quit, discard changes
i     → insert mode
Esc   → back to normal mode
```

<!-- Say these five commands out loud, twice, and encourage the audience to write them on a sticky note. This is the single most requested piece of terminal knowledge for developers new to Vim-family editors. Confirm accuracy against current Neovim documentation before presenting. -->

---

## Ready to Invest? Try a Starter Config

- kickstart.nvim gives you one readable file to learn Neovim configuration from.
- LazyVim gives you a full preconfigured IDE-like setup with plugins included.
- Both projects stay actively maintained and documented on GitHub.
- Install one only after survival-level nvim feels comfortable, not before.
- Expect a real time investment. Budget a few evenings to make it feel like home.

```bash
# kickstart.nvim (minimal, one file to read)
git clone https://github.com/nvim-lua/kickstart.nvim \
  "${XDG_CONFIG_HOME:-$HOME/.config}"/nvim

# LazyVim (fuller IDE-style setup)
# Follow the install guide at https://www.lazyvim.org
```

<!-- Verify both repository URLs and install steps against current documentation before the talk, since setup instructions change over time. Position this slide as optional. Many developers do fine forever with nano or micro. -->

---

## Honest Advice: An IDE Alongside the Terminal Is Fine

- VS Code, JetBrains, and similar tools remain excellent for daily editing.
- Use the IDE for writing and reading code. Use the terminal for commands and git.
- Most professional developers run an IDE and a terminal side by side, not one alone.
- Nvim mastery is a valid hobby, not a requirement for a serious terminal workflow.
- Pick the setup that lets you ship code. Do not let editor choice become the task.

<!-- Close this section by giving the audience explicit permission to keep their familiar IDE. The point of the terminal editor section is survival and unblocking, not converting everyone into a Vim enthusiast. Reduce anxiety, not increase it. -->

---

# Prompt Styling

---

## Why the Prompt Matters

- A plain prompt shows no branch, no status, no context.
- A good prompt shows git state, directory, and exit codes at a glance.
- Two main tools exist: Starship and Powerlevel10k.
- Both need a font patch. Plain terminal fonts lack the icons.
- Pick one prompt tool. Do not run both at once.

<!-- Set up the problem before the tools. Developers new to serious terminal work often run a bare prompt and miss context that a configured prompt gives for free. Frame Nerd Fonts as the shared prerequisite before naming individual tools. -->

---

## Nerd Fonts: the Shared Prerequisite

- Starship and Powerlevel10k both need a Nerd Font.
- A Nerd Font patches in icons: git branch, language logos, status glyphs.
- Download from nerdfonts.com or install through a package manager.
- Set the patched font in your terminal emulator, not the OS default.
- Skip this step and prompts render broken boxes or question marks.

```bash
# macOS example via Homebrew
brew install --cask font-jetbrains-mono-nerd-font
```

<!-- Emphasize this is a terminal emulator setting, not a shell setting. Many first failures come from installing the font but never selecting it in the terminal app preferences. -->

---

## Starship: Cross-Shell Prompt

- Starship works across bash, zsh, fish, PowerShell, and more.
- One binary, one config file: TOML, at ~/.config/starship.toml.
- Shows git branch, git status, language versions, and command duration.
- Renders fast. It is written in Rust and stays out of your way.
- Good default choice when you switch shells or work across machines.

```bash
# Install and enable in zsh
curl -sS https://starship.rs/install.sh | sh
echo 'eval "$(starship init zsh)"' >> ~/.zshrc
```

<!-- Starship is the recommended default for most developers because it is not tied to zsh. Mention the config file lives in one place and presets exist on starship.rs for quick starts. -->

---

## Powerlevel10k: The zsh Specialist

- Powerlevel10k runs only on zsh. It does not work on bash or fish.
- Run p10k configure to launch an interactive setup wizard.
- The wizard asks style questions and writes ~/.p10k.zsh for you.
- Instant prompt shows a cached prompt before zsh finishes loading.
- Status: maintenance mode since 2023. It still works, but expect no new features.

```bash
# After install, run the wizard
p10k configure
```

<!-- Flag maintenance mode clearly so the audience makes an informed choice. It is still widely used and stable, but Starship receives active development. Instant prompt is a strong selling point for slow zsh startups, so explain it briefly. -->

---

## oh-my-zsh vs Standalone Plugins

- oh-my-zsh bundles a plugin manager, themes, and hundreds of plugins.
- It adds startup time and complexity you may not need.
- Standalone plugin managers (zinit, zap, or manual sourcing) stay lean.
- Powerlevel10k works inside oh-my-zsh or on its own.
- Choose oh-my-zsh for convenience, standalone for speed and control.

<!-- Do not push one option as correct. New developers often install oh-my-zsh by habit. Point out that a slow shell startup is a common complaint traced back to too many oh-my-zsh plugins. -->

---

## Useful Extras for an Informative Terminal

- zoxide: a smarter cd. It learns your frequent directories.
- eza: a modern ls replacement with icons and git-aware output.
- bat: a cat replacement with syntax highlighting and line numbers.
- fzf: a fuzzy finder for files, command history, and more.
- ripgrep (rg) and fd: fast search for text and files.
- All six tools benefit from a Nerd Font for their icons.

```bash
# macOS/Homebrew example
brew install zoxide eza bat fzf ripgrep fd
```

<!-- Keep this slide as a menu, not a mandate. Recommend trying one tool at a time so muscle memory builds gradually. Reinforce that icons depend on the Nerd Font set up earlier in this section. -->

---

# Claude Code Basics

---

## Install Claude Code

- Install with npm: run npm install -g @anthropic-ai/claude-code.
- Or use the native installer for your platform. It needs no Node.js runtime.
- The native installer gives a smaller footprint and a faster start.
- Verify the install: run claude --version in a terminal.
- Node.js 18 or later is required for the npm install path.

```bash
npm install -g @anthropic-ai/claude-code
```

<!-- State both install paths plainly. The npm path suits developers who already manage Node tooling. The native installer suits users who want a standalone binary. Mention that Claude Code runs in the terminal, inside a real project directory, not in a browser. -->

---

## Run Claude Code in a Repo

- Open a terminal in your project directory.
- Type claude and press enter to start a session.
- Claude Code reads the current directory as its working context.
- It can read files, edit code, and run shell commands on your request.
- Exit a session with Ctrl+C, or type /exit.

```bash
cd my-project
claude
```

<!-- Emphasize that Claude Code operates on the real filesystem of the repo you launch it in. New users should try it first on a low-stakes project or a fresh clone. Point out that every session starts fresh unless you use session resume features. -->

---

## Permission Modes

- Claude Code asks for permission before it edits files or runs commands.
- Default mode prompts you for each new type of action.
- Auto-accept mode skips prompts for trusted, well-scoped work.
- Plan mode lets Claude propose a plan before it touches any file.
- Choose a stricter mode for exploratory or unfamiliar codebases.

<!-- Explain that permission modes exist to protect the codebase from unwanted changes. New users should start with the default prompt-based mode and move to auto-accept only after they trust the workflow. Mention that permission settings live in project or user configuration files. -->

---

## Slash Commands

- Slash commands are built-in shortcuts you type inside a session.
- /help lists all available commands and a short description of each.
- /model shows and switches the active Claude model for the session.
- /config opens configuration options, including permissions and defaults.
- Custom slash commands can be added per project or per user.

```
/help
/model
/config
```

<!-- Walk through each command live if possible. /help is the best starting point for any new user. /model matters because model choice affects cost, speed, and capability. /config is where users adjust default behavior for their workflow. -->

---

## Model Selection

- Use /model to see and choose the active model for a session.
- Different models trade off speed, cost, and reasoning depth.
- A long-context variant lets the model handle much larger inputs.
- Tip: /model claude-opus-4-6[1m] selects Opus 4.6 with a 1M-token context window.
- The [1m] suffix requests that long-context variant specifically.

```
/model claude-opus-4-6[1m]
```

<!-- Explain that the bracket suffix is a request modifier, not a separate model name. Use this when a task needs to hold a very large codebase or document set in context at once. Note that long-context requests may cost more and respond more slowly than the standard context window. -->

---

## CLAUDE.md Auto-Loading

- Claude Code automatically reads a file named CLAUDE.md at session start.
- Place it at the repo root to give Claude persistent project context.
- Use it for coding conventions, architecture notes, and setup steps.
- Nested CLAUDE.md files in subdirectories add scoped context for that area.
- Keep it concise. Claude loads and reads it on every session start.

```markdown
# CLAUDE.md
## Project conventions
- Use TypeScript strict mode
- Run tests with npm test
```

<!-- This file is the single highest-leverage setup step for a new project. It removes the need to repeat context in every session. Recommend that teams commit CLAUDE.md to version control so all contributors share the same baseline instructions. -->

---

# Context Management

---

## The Context Window: A Shrinking Budget

- The context window holds every token in the session: code, tool output, and conversation history.
- Claude Code models support large windows, up to 1M tokens on some models. The limit is not the main risk.
- Quality degrades before the window fills. Attention dilutes across a long history.
- Retrieval of early details weakens as new tokens push them further back.
- Cost rises with window size, since each turn resends the accumulated history.
- A full window is not a badge of thoroughness. It is a sign to compress.

<!-- Set the frame early. New developers assume a bigger window is strictly better. Correct that. The window is a budget, not a trophy. Everything after this slide explains how to manage the budget. -->

---

## Start Compressing Around 256k, Not at the Edge

- Do not run a session to the edge of a 1M window before you act.
- A working guideline: begin compressing context around 256k tokens.
- Past that point, added tokens buy less useful reasoning per token spent.
- Early instructions and early decisions become harder for the model to retrieve accurately.
- Compressing earlier keeps cost lower and keeps answers grounded in what matters now.
- Treat context health as an active habit, not a wait for the tool to warn you.

<!-- This guideline is a team convention, not a hard Anthropic rule. Frame it that way. Emphasize the mechanism: it is not that the model breaks at some token count, it is that quality degrades gradually as the history grows, so acting early is cheaper than acting late. -->

---

## /compact: The Built-In Option

- Claude Code ships a /compact command. It summarizes the conversation and replaces the full history with the summary.
- It works fine for light sessions: quick fixes, small scripts, short exploration.
- It loses nuance the summary does not capture.
- Failed approaches often disappear, so the next session can repeat a dead end.
- Decision rationale often disappears, so later work loses the why behind a choice.
- You do not choose what survives. The summarizer chooses for you.

```
/compact
```

<!-- Do not present /compact as bad. It is the right tool for short sessions. The problem is scale: on a long, decision-heavy session, an automatic summary is a blunt instrument. That sets up the next slide's alternative. -->

---

## The Alternative: An Explicit Handoff

- A custom context-handoff skill writes a structured file before you compact or end a session.
- The file records task state, decisions made, failed approaches, next steps, and open questions.
- A matching context-resume skill reloads that file at the start of a fresh session.
- The fresh session starts with a clean context window and the structured facts it needs.
- You write the handoff before compacting, so no decision rationale gets silently dropped.
- This pattern trades a small manual step for control over what the next session knows.

```
/context-handoff
# ... new session ...
/context-resume
```

<!-- Walk through the file contents concretely: task state, decisions and their reasoning, failed approaches and why they failed, next concrete steps, open questions for the user. This is the core teaching moment. Contrast with the compact slide: same goal, compression, but human-authored structure instead of an automatic summary. -->

---

## Choosing Between the Two

- Explicit handoff beats auto-compaction because you decide what survives.
- Use context-handoff before a long or decision-heavy session runs low on context.
- Use context-handoff before any manual compact, so the handoff captures nuance first.
- Use plain /compact for short, low-stakes sessions where nothing needs to survive.
- Both approaches are valid. Match the tool to the weight of the session.
- A habit worth building: check context usage regularly, and act before quality drops, not after.

<!-- Close with a decision rule the audience can apply immediately. Reinforce that this is about developer habit, not a hidden model behavior. Bridge to the next section of the deck if one follows. -->

---

# Hooks

---

## Hooks: Deterministic Control, Not a Suggestion

- A hook is a shell command that Claude Code runs at a fixed point in its lifecycle.
- Prompts ask the model to behave. Hooks enforce behavior outside the model.
- The model cannot skip, forget, or argue with a hook. The shell always runs it.
- Use hooks for rules that must hold every time, not most of the time.
- Configure hooks in settings.json, not in prompts or CLAUDE.md.

<!-- Frame this slide as the thesis for the whole section. Prompting steers the model's judgment. Hooks remove judgment from the loop entirely, because a hook is a real process the harness executes, not a request the model can decline. Set up the contrast early so every later example reads as an instance of the same idea. -->

---

## Hook Events: Where They Fire

- PreToolUse fires before a tool call executes, and can block or modify it.
- PostToolUse fires after a tool call succeeds, useful for cleanup or checks.
- Stop fires when the main agent finishes responding, for a final check.
- SessionStart fires when a session begins, useful for preflight setup.
- Other events exist too, such as UserPromptSubmit and SubagentStop.
- Each event receives JSON on stdin, including the tool name and its input.

<!-- List these as the vocabulary developers need before they can write a hook. Keep PreToolUse and PostToolUse as the pair developers reach for most. Mention that the full event list is larger, so this deck covers the four the audience will use first. -->

---

## Wiring a Hook in settings.json

- Hooks live under a top-level hooks key in settings.json.
- Each event maps to a list of matchers, and each matcher maps to commands.
- A matcher can target a tool name, such as Edit or Write, with a regex.
- Project settings.json is checked into git, so hooks travel with the repo.
- Personal overrides go in settings.local.json, which stays untracked.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "scripts/format-changed.sh" }
        ]
      }
    ]
  }
}
```

<!-- Walk through the shape of the config once, slowly, since everything after this slide is a variation on it. Point out that the matcher is a regex over the tool name, so one entry can cover both Edit and Write. Mention that project-level settings.json means the whole team gets the same enforcement, which is the payoff of putting rules in config instead of in a personal prompt. -->

---

## Exit Code 2: The Block Switch

- A hook command that exits 0 lets the tool call proceed as normal.
- A hook command that exits 2 blocks the tool call before it runs.
- On PreToolUse, exit code 2 stops the tool and returns stderr to Claude.
- Claude reads the stderr message and can adjust its next action.
- Any other nonzero exit code reports an error but does not block.

```bash
#!/bin/bash
# .claude/hooks/check-branch.sh
branch=$(git branch --show-current)
if [[ ! "$branch" =~ ^(feature|fix|chore)/ ]]; then
  echo "Branch name '$branch' does not match <type>/<desc>" >&2
  exit 2
fi
```

<!-- This is the mechanical detail that makes enforcement real, so slow down here. Exit code 2 is the one code with special meaning to the harness. Zero means proceed, two means block and hand the reason to Claude on stderr, anything else just logs an error without stopping the call. Tie this back to slide one: this is the mechanism behind deterministic enforcement. -->

---

## Practical Example: Auto-Format After Edit

- Register a PostToolUse hook that matches Edit and Write.
- The hook runs the project linter or formatter on the changed file.
- Claude never has to remember to format. The hook always runs.
- Failures surface immediately, before the change reaches a commit.
- Keep the hook script fast, since it runs after every matching edit.

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    { "type": "command", "command": "npx prettier --write \"$CLAUDE_FILE_PATH\"" }
  ]
}
```

<!-- Ground the abstract mechanism in the example the audience will use daily. Emphasize that this removes an entire category of review comment, the missed formatting pass, because the hook runs unconditionally after every edit or write. Note that CLAUDE_FILE_PATH and similar variables come from the hook input JSON. -->

---

## Practical Example: Block Bad Names and Preflight Checks

- A PreToolUse hook can match Bash calls to git or gh directly.
- The hook parses the command, checks branch or commit naming, and exits 2 on a mismatch.
- This blocks a bad commit or branch before git or gh ever runs.
- A SessionStart hook can run preflight checks: locks, services, stale state.
- Example: refuse to start until a required background service is running.

```bash
#!/bin/bash
# .claude/hooks/session-preflight.sh
if [ -f /var/lib/pacman/db.lck ]; then
  echo "pacman lock present. Resolve before starting." >&2
  exit 2
fi
```

<!-- Close with the two examples from the user's own workflow: naming enforcement on git and gh commands, and a SessionStart preflight for locks or services. Reinforce the closing point. A hook that checks a lock file or a branch name catches the mistake at the exact moment it would happen, with no dependence on the model remembering a rule from a prompt. -->

---

# Simplified Technical English

---

## What Is Simplified Technical English?

- ASD-STE100 is a controlled-language standard built for aircraft maintenance manuals.
- It uses short sentences, active voice, and one approved word per concept.
- It bans jargon, idioms, and long noun chains that confuse the reader.
- Agent output borrows this style, not the full aerospace dictionary.
- The goal: text a tired reviewer can parse in one pass, at 11pm, in a hurry.

<!-- Give the origin story in one sentence: ASD-STE100 comes from the aerospace industry, where a misread instruction can ground a plane. Explain that we do not adopt the full 900-word vocabulary list, only the sentence-shape rules: short sentences, active voice, one name per thing, no filler. Frame this as borrowing rigor, not copying a spec verbatim. -->

---

## Why This Matters for Agent Output

- An agent writes commits, PR bodies, and docs at high volume, unreviewed by default.
- Slop compounds. A vague commit message hides a bug for a future reader.
- Passive voice and hedging hide who did what, and why.
- Short, active sentences cut review time and catch errors faster.
- Clear text is a quality gate, not a style preference.

<!-- Make the case concrete. A human writes maybe ten PR descriptions a day. An agent can write fifty. If each one carries filler and passive voice, the reviewer pays a real tax at scale. Tie this back to the review step of the workflow: clear commits and docs are what let a human reviewer trust the agent's output without re-deriving it from the diff. -->

---

## Enforcement: The Rule File

- Write one rule file with the mechanical rules: no semicolons, no em-dashes, no contractions.
- State the positive form too: active voice, name the actor, one term per concept.
- Load it into every session, through an output style or a CLAUDE.md rule.
- Reference it from every surface it governs: commits, PRs, docs, comments.
- Split working modes by surface: strict for runbooks, flavored for docs, prose for comments.

```markdown
# CLAUDE.md excerpt
## Writing Style
Follow ste-writing.md for all commit messages, PR bodies, and docs.
No em-dash. No semicolon. No contraction. Active voice, name the actor.
```

<!-- Show the pattern from this session's own rule file as a real example: a single common/ste-writing.md file referenced from git-workflow.md, debugging.md, and every other rule file that produces prose. Explain the three working modes so the audience does not over-apply the strict runbook rule to a long-form comment. -->

---

## Enforcement: The Linter

- A rule file alone gets forgotten under context pressure. Add a linter as a backstop.
- Build a script that checks sentence length, semicolons, em-dashes, contractions, and passive voice.
- Run it in a PostToolUse hook, right after the agent writes or edits a file.
- Run it again in CI, so a slipped-through file still gets caught before merge.
- Report a score, not just a pass or fail. Track violations per 100 words over time.

```bash
# PostToolUse hook, runs after Write/Edit
python3 kilint/bin/kilint FILE.md

# CI gate
python3 kilint/bin/kilint --delta BEFORE.md AFTER.md
```

<!-- Walk through the two-layer defense: the hook catches drift the moment a file is written, and CI catches anything that slipped through a session without the hook. Mention the kilint tool by name if the audience uses this repo's setup, and show the delta mode as a way to measure improvement, not just enforce a hard gate. -->

---

## The Honest Limit

- Form linting fixes sentence shape. It cannot fix a hollow or wrong claim.
- A short, active sentence can still state something false or empty.
- Do not chase the linter score to zero. That rewrites correct sentences for no reason.
- A score under roughly 1.5 violations per 100 words is clean. Treat it as a signal.
- Human review still owns correctness. The linter only owns clarity.

<!-- Close on the caveat so nobody walks away thinking STE compliance equals correctness. A perfectly formed sentence can still be wrong, and the linter has no way to know that. Emphasize the point about not chasing a zero score. Restate the division of labor: the linter handles form, the human handles truth. -->

---

# The GitHub CLI

---

## Install the GitHub CLI

- gh is the official GitHub command line tool.
- Install with a package manager: winget, brew, apt, or scoop.
- Windows: winget install --id GitHub.cli.
- macOS: brew install gh. Linux: see cli.github.com for your distro.
- Verify the install before you continue.

```bash
winget install --id GitHub.cli
brew install gh
gh --version
```

<!-- State that gh is separate from git. Git handles commits and history. gh talks to the GitHub API for PRs, issues, and repos. Confirm the audience has a GitHub account before the auth step. -->

---

## Authenticate with gh auth login

- Run gh auth login and follow the prompts.
- Pick GitHub.com, then pick a protocol: HTTPS or SSH.
- The browser flow opens a page and pairs a one-time code. No password entry.
- HTTPS suits most setups. SSH suits users with an SSH key already configured.
- Check status any time with gh auth status.

```bash
gh auth login
gh auth status
```

<!-- Walk through the interactive prompts live if possible. Explain that the browser flow avoids typing a password or token into the terminal. Mention that SSH requires an existing key added to the GitHub account, HTTPS works out of the box with a stored token. -->

---

## Core gh commands

- gh repo clone owner/repo clones a repository by name, not full URL.
- gh pr create opens a pull request from the current branch.
- gh pr list shows open pull requests in the current repo.
- gh issue create opens a new issue with a title and body.
- gh api calls any GitHub REST or GraphQL endpoint directly.

```bash
gh repo clone anthropics/claude-code
gh pr create --fill
gh pr list --state open
gh issue create --title "Bug: login fails" --body "Steps to reproduce..."
gh api repos/{owner}/{repo}/issues
```

<!-- Point out --fill on gh pr create, it pulls title and body from the commit history. gh api is the escape hatch for anything the higher-level commands do not cover. Keep the demo short, one command per line. -->

---

## Multiple accounts with gh auth switch

- gh supports more than one logged-in account at once.
- Add a second account with gh auth login, then switch with gh auth switch.
- gh auth switch --hostname github.com --user <username> picks the active account.
- gh auth status lists every logged-in account and marks the active one.
- Useful for a personal account and a work account on the same machine.

```bash
gh auth login
gh auth switch --hostname github.com --user work-username
gh auth status
```

<!-- This maps to a common pattern: one account for personal repos, one for a work org. Show gh auth status to prove which account is active before any PR or issue command runs. -->

---

## Why Claude Code relies on gh

- Claude Code shells out to gh for PR and issue work, it does not call the GitHub API on its own.
- gh auth login must succeed once, before Claude Code can open a PR or create an issue.
- Claude Code uses gh pr create, gh pr view, gh issue create, and gh api under the hood.
- A missing or expired gh session causes those commands to fail inside a Claude Code session.
- Run gh auth status first whenever a PR or issue command fails unexpectedly.

```bash
gh auth status
gh pr create --title "feat: add council fix loop" --body "Summary..."
```

<!-- Tie this back to the earlier slides. gh is the bridge between an agent session and GitHub. If gh is not authenticated, Claude Code cannot create pull requests or issues, even though it can still run local git commands like commit and push. -->

---

# MCP

---

## MCP: One Protocol, Many Tool Servers

- MCP is the Model Context Protocol, an open standard for connecting tools to Claude Code.
- Any MCP server exposes tools, resources, and prompts through one consistent interface.
- Claude Code talks to each server the same way, regardless of the server's own language or runtime.
- A server can run locally as a process (stdio) or remotely over HTTP.

<!-- Anchor the mental model before the mechanics. MCP is not a Claude-only invention. It is an open protocol other tools and vendors also implement. Claude Code is one client among many possible clients. -->

---

## Adding a Server: claude mcp add

- Use claude mcp add to register a server. Choose stdio for a local process, HTTP for a remote endpoint.
- Stdio servers launch as a subprocess and speak over standard input and output.
- HTTP servers connect over a URL, often with an authentication token.
- Check registered servers with claude mcp list. Inspect one server with /mcp inside a session.

```bash
claude mcp add --transport stdio context7 -- npx -y @upstash/context7-mcp
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

<!-- Show both transport forms. Stdio is the common case for local tools written in Node or Python. HTTP fits a hosted or shared service. The double dash before the command separates claude mcp add flags from the server's own launch command. -->

---

## Scopes: User vs Project

- User scope registers a server for you, across every project on the machine.
- Project scope registers a server only for the current repository, stored in .mcp.json.
- Project scope lets a team share the same server list through version control.
- Pick project scope for a server only one repository needs. Pick user scope for a server you use everywhere.

```bash
claude mcp add --scope user context7 ...
claude mcp add --scope project github ...
```

<!-- This is a design decision, not a default. A broad user-scope habit adds unused tools to every project. Project scope keeps a repository's tool list matched to that repository's actual needs. -->

---

## Useful Starter Servers

- context7 fetches current library and framework documentation on demand.
- playwright drives a real browser, for UI testing and web automation tasks.
- github reads and writes issues, pull requests, and repository data directly.
- Add only the servers a given project actually needs. Each one adds real cost.

<!-- Frame these as a starting set, not a mandate. The point of the next slide is that adding servers has a cost, so recommend these as examples, not as defaults to enable everywhere. -->

---

## Hygiene Rule: Fewer Servers, Better Selection

- Every enabled server injects its full tool schema into context, on every turn.
- More tool schemas mean a longer prompt and a harder tool-selection task for the model.
- Remove a server you are not using with claude mcp remove.
- Run /mcp during a session to see which servers and tools are currently loaded.
- Scope a server to one project instead of enabling it everywhere by default.
- Fewer available tools let the model pick the right one more reliably.

```bash
claude mcp remove context7
/mcp
```

<!-- This is the core takeaway for the section. Treat MCP servers like dependencies: add on purpose, remove when done, and audit with /mcp periodically. A cluttered tool list degrades every tool call, not only the unused ones. -->

---

# Claude for Slack

---

## Claude for Slack: What It Is

- Claude for Slack is an app that brings Claude into channels and direct messages.
- A workspace admin installs it once for the whole team from the Slack App Directory.
- From Claude Code, run /install-slack-app to start the same installation flow.
- After install, members can mention @Claude in any channel it joins.
- Admins can restrict which channels or users can invoke the app.

```
/install-slack-app
```

<!-- Frame this as the first of two integration paths. This slide covers the Slack-side app. The next slides cover MCP access from inside a Claude Code session. Mention that admin approval may be required in managed workspaces, so a developer may need to ask IT first. -->

---

## What Claude in Slack Enables

- Mention @Claude in a channel to ask a question or request a summary.
- Summarize a long thread into a short digest for the channel.
- Draft a message or reply for a teammate to review and send.
- Kick off a Claude Code task from a Slack message, then track progress in Slack.
- Search and reference earlier discussion the app has access to.

<!-- Keep this practical. Show one example: paste a long thread link and ask Claude to summarize it in three bullets. Note that the app only sees channels it has been added to, not the whole workspace. -->

---

## MCP: Slack Access From a Claude Code Session

- A Slack MCP server gives a Claude Code session direct access to Slack data.
- Claude Code can search channels and messages by keyword or topic.
- Claude Code can read full threads to gather context for a task.
- Claude Code can draft and send a message to a channel or user.
- This path runs inside your terminal session, separate from the Slack app.

<!-- Distinguish clearly from slide 1. The Slack app runs inside Slack and responds to mentions. MCP runs inside a Claude Code session and lets the agent reach out to Slack as one of its tools. Both can coexist in a workflow. -->

---

## Safety Note: Sending Messages Needs Approval

- Claude Code never sends a Slack message without explicit approval from you.
- Read actions, such as search and thread reads, may proceed without a prompt.
- A send action always pauses and shows the drafted message first.
- You approve, edit, or reject the message before it reaches Slack.
- Treat this the same as any other side-effectful action in your workflow.

<!-- This is the key safety point for the audience. Emphasize that approval is per-message, not a one-time setting. Tie it back to the general principle: read is cheap, write needs a human in the loop. -->

---

# GitHub Actions

---

## Workflow Files: .github/workflows/*.yml

- Each YAML file in .github/workflows/ defines one workflow.
- A workflow holds one or more jobs. Each job runs on a fresh runner.
- Name the file for its purpose: ci.yml, claude.yml, release.yml.
- GitHub Actions reads every file in that folder automatically.
- Keep one concern per file. Do not merge CI and release logic into one file.

```
.github/workflows/
  ci.yml
  claude.yml
  release.yml
```

<!-- Orient the audience to where workflows live. Stress the one-file-one-concern habit, it keeps diffs small and logs readable later. -->

---

## Triggers: When a Workflow Runs

- push runs a workflow on a commit to a branch.
- pull_request runs a workflow when a PR opens or updates.
- schedule runs a workflow on a cron timer, in UTC.
- workflow_dispatch adds a manual Run button in the GitHub UI.
- Combine triggers in one workflow when the job fits more than one case.

```yaml
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:
```

<!-- Walk through each trigger type. Point out cron syntax uses five fields and always UTC. workflow_dispatch is handy for one-off manual runs during testing. -->

---

## A Basic CI Job

- checkout pulls the repo code onto the runner.
- setup installs the language runtime, for example Node or Python.
- lint checks code style and catches simple errors early.
- test runs the automated test suite and reports pass or fail.
- Failed steps stop the job and show red status on the PR.

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

<!-- This is the CI skeleton most repos start from. Emphasize npm ci over npm install for reproducible builds. Each step must pass before the next runs. -->

---

## Running Claude in CI with claude-code-action

- The claude-code-action lets a repo tag @claude on an issue or PR.
- Claude reads the comment, the issue, and the diff, then responds or opens a PR.
- The workflow needs the ANTHROPIC_API_KEY secret to authenticate.
- Trigger on issue_comment and pull_request_review_comment events.
- Scope permissions narrowly: contents, pull-requests, and issues as needed.

```yaml
on:
  issue_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

<!-- Show how tagging @claude turns a comment into an automated task. Point out the if condition filters events so the job does not run on every comment. -->

---

## Automating Chores and Guarding Secrets

- Use a scheduled or dispatch workflow to bump versions and draft release notes.
- Ask Claude in CI to summarize merged PRs into a changelog entry.
- Store every credential in repo or organization secrets, never in the YAML file.
- Reference a secret with the secrets context, for example secrets.ANTHROPIC_API_KEY.
- Restrict who can approve workflow runs on forked-repo pull requests.

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

<!-- Close with the secrets discipline. A secret in plain YAML leaks through git history forever. Repo settings, Secrets and variables, Actions is the only correct place to add one. -->

---

# Git Worktrees

---

## What Is a Git Worktree

- A worktree is a separate working directory linked to one shared git repository.
- Each worktree checks out one branch at a time, with its own files on disk.
- All worktrees share the same commit history, objects, and remotes.
- The main checkout is a worktree too. Add more beside it as needed.
- No duplicate .git folder per worktree. Git tracks them in one place.

```bash
git worktree add ../repo-feature feature-branch
```

<!-- Frame the mental model before commands. A worktree is not a clone. It shares one object database, so disk cost stays low and fetches stay in sync across all worktrees. -->

---

## Creating and Listing Worktrees

- Run git worktree add <path> <branch> to create a new working directory.
- Git checks out an existing branch, or add -b to create a new one.
- Run git worktree list to see every worktree and its branch.
- Each entry shows the path, the HEAD commit, and the checked-out branch.

```bash
git worktree add ../repo-feature feature-branch
git worktree add -b new-feature ../repo-new-feature
git worktree list
```

<!-- Demo add then list live. Point out the path convention: a sibling directory named after the repo and the branch keeps things easy to find in a terminal or file tree. -->

---

## Removing and Cleaning Up

- Run git worktree remove <path> once the work in that directory is done.
- Deleting the folder by hand leaves stale metadata behind. Use remove instead.
- Run git worktree prune to clear metadata for folders already deleted by hand.
- Delete the branch separately with git branch -d, after the worktree is gone.
- A dirty worktree blocks removal. Commit, stash, or pass --force to override.

```bash
git worktree remove ../repo-feature
git worktree prune
git branch -d feature-branch
```

<!-- Emphasize discipline here. A pile of stale worktrees is the main complaint developers raise. Removing worktree and branch is two separate steps, and both matter. -->

---

## Why Worktrees Beat Stash-and-Switch

- git stash and switch loses your build output, running servers, and editor state.
- A worktree keeps each branch checked out in its own folder, at the same time.
- Switch tasks by changing terminal directory. No stash, no context loss.
- Each worktree can run its own dev server, its own test watcher, its own editor window.
- Long-running or urgent branches stay checked out while you work on something else.

<!-- Ask the audience how often a stash got forgotten or conflicted on pop. Worktrees remove that failure mode entirely by giving each branch a permanent home on disk. -->

---

## The Killer Use Case: Parallel Claude Code Sessions

- Run several Claude Code sessions at once, one worktree per agent.
- Each agent edits files in its own directory. No agent overwrites another agent's edits.
- Assign one task or one branch per worktree, then merge each result independently.
- Build, test, and commit in each worktree without blocking the other sessions.
- Close a session, remove its worktree, and move to the next task cleanly.

```bash
git worktree add ../repo-agent-a task-a
git worktree add ../repo-agent-b task-b
cd ../repo-agent-a && claude
# in a second terminal:
cd ../repo-agent-b && claude
```

<!-- This is the section payoff. Without worktrees, two Claude Code sessions in one directory race on the same files and clobber each other's changes. Worktrees give each agent an isolated file system view of the same history. -->

---

# CLAUDE.md and AGENTS.md

---

## CLAUDE.md and AGENTS.md: What They Are

- CLAUDE.md is project memory that Claude Code reads at session start.
- AGENTS.md is an emerging cross-tool standard. Multiple coding agents read it.
- Some teams keep both. CLAUDE.md can import AGENTS.md to avoid duplication.
- Both files sit in the project root, or in a subfolder for scoped rules.
- Neither file replaces documentation. Each file steers agent behavior.

```markdown
# CLAUDE.md
@AGENTS.md

Claude-specific notes go below this import.
```

<!-- Introduce the two files by name before anything else. Stress that AGENTS.md is not Anthropic-specific. State the import syntax early, because it justifies the whole rest of the section. -->

---

## Short and High-Signal, Or Ignored

- Instructions compete for attention inside a limited context window.
- A bloated memory file pushes out task-relevant context each session.
- Long files train the agent to skim. Skimming drops instructions.
- Target a few dozen lines, not hundreds, for the root file.
- Every line must earn its place. Cut a line if the agent already infers it.

<!-- This is the core argument of the section. Bloat is not a style problem. Bloat is a signal problem, because it competes directly with task context for space in the window. -->

---

## What Belongs in the File

- Build, test, and lint commands the agent cannot guess from a manifest.
- Conventions the code does not show: naming rules, folder ownership, forbidden patterns.
- Hard constraints: do not touch this file, always run this check before commit.
- Non-obvious project quirks: a monorepo boundary, a codegen step, a required env var.
- Pointers to detail files for anything longer than a few lines.

```markdown
## Commands
npm run build
npm run test -- --watch=false

## Rules
- Never edit generated/**, it is codegen output.
- Run npm run lint before every commit.
```

<!-- Keep this list concrete. Commands and hard constraints are the highest-value content, because the agent cannot derive them by reading source files. -->

---

## What Does Not Belong

- Anything derivable from the code itself: file lists, function signatures, obvious structure.
- Long prose explaining architecture. Link to a docs file instead.
- Stale information: a removed script, an old branch name, a deprecated command.
- Duplicate content already in README or package.json.
- Aspirational rules nobody enforces. An unenforced rule reads as noise.

<!-- Frame this as the mirror of the previous slide. Every item here is a bloat source that crowds out the high-signal content from the prior slide. -->

---

## Structure with Imports, Not Inlining

- Claude Code supports @path imports inside CLAUDE.md, up to five hops deep.
- Split detail into topic files: testing.md, deployment.md, style.md.
- The root file stays a short index. Detail files load only when relevant.
- Use relative paths so the import works after a clone or a fork.
- Circular imports are not supported. Keep the import graph a tree.

```markdown
# CLAUDE.md
See @docs/testing.md for the test strategy.
See @docs/deploy.md for release steps.
@AGENTS.md
```

<!-- Show the import as the mechanism that makes short files sustainable. Without imports, teams inline everything and the file grows unchecked. -->

---

## Review Memory Files Like Code

- Put CLAUDE.md and AGENTS.md under version control and code review.
- A pull request that adds a rule should show why the rule exists.
- Prune during review: remove a rule the codebase no longer needs.
- Treat a memory file diff as seriously as a config change, because it changes agent behavior for every contributor.
- Revisit both files on a schedule, not only when something breaks.

<!-- Close with a habit, not a one-time setup step. Memory files rot the same way comments rot, unless someone reviews them on the same cadence as code. -->

---

## The Stack, End to End

- Terminal layer: Ghostty for GPU rendering, a Nerd Font for glyphs, tmux for session persistence.
- Git layer: lazygit for fast visual review of every diff, worktrees for parallel branches.
- Prompt layer: starship for git state and context at a glance.
- Agent layer: Claude Code, with hooks for deterministic enforcement.
- Writing layer: STE rules plus a linter, so agent prose stays reviewable.
- Context layer: handoff and resume skills instead of blind compaction.
- Memory layer: a lean CLAUDE.md, short, high-signal, and reviewed like code.

<!-- Recap the whole stack in one frame: Ghostty plus Nerd Font plus tmux plus lazygit plus starship for the terminal, then Claude Code on top with hooks, STE, handoff skills, and a lean CLAUDE.md. Remind the audience to adopt one layer at a time, in response to real friction. -->