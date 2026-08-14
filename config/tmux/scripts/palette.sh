#!/usr/bin/env bash
# palette.sh -- fzf command palette for the hub tmux config.
# Ported from the Chrysaki theme (Kiriketsuki/dots).
# Bound to: Prefix + Space.
# Protocol: LABEL<TAB>COMMAND. fzf shows only the label column.
#           On selection, the command goes to a temp file and runs
#           via `tmux run-shell -b` so the popup closes first.

# display-popup sometimes inherits a bare environment. Set TERM.
export TERM="${TERM:-xterm-256color}"

if ! command -v fzf &>/dev/null; then
  tmux display-message " palette: fzf not found -- install fzf (pacman -S fzf / brew install fzf / apt install fzf)"
  exit 1
fi

# 51 actions.
ENTRIES=$(cat <<'EOF'
Split pane right	split-window -h -c "#{pane_current_path}"
Split pane below	split-window -v -c "#{pane_current_path}"
Zoom / Unzoom pane (toggle fullscreen)	resize-pane -Z
Show pane numbers	display-panes
Focus pane left	select-pane -L
Focus pane right	select-pane -R
Focus pane above	select-pane -U
Focus pane below	select-pane -D
Resize pane left	resize-pane -L 5
Resize pane right	resize-pane -R 5
Resize pane up	resize-pane -U 5
Resize pane down	resize-pane -D 5
Break pane into new window	break-pane
Join pane from another window	command-prompt -p "Join from window:" "join-pane -s '%%'"
Rotate panes in window	rotate-window
Swap pane with next	swap-pane -D
Swap pane with previous	swap-pane -U
Kill current pane	kill-pane
Respawn pane (restart shell)	respawn-pane -k
Clear pane scrollback history	clear-history
Synchronize panes (type to all)	set-window-option synchronize-panes on
Unsynchronize panes	set-window-option synchronize-panes off
Pipe pane output to file	command-prompt -p "Log to file:" "pipe-pane -o 'cat >> %%'"
Stop piping pane output	pipe-pane
Layout: even horizontal	select-layout even-horizontal
Layout: even vertical	select-layout even-vertical
Layout: main horizontal	select-layout main-horizontal
Layout: main vertical	select-layout main-vertical
Layout: tiled	select-layout tiled
New window (current directory)	new-window -c "#{pane_current_path}"
Next window	next-window
Previous window	previous-window
Toggle last window	last-window
Rename current window	command-prompt -I "#W" "rename-window '%%'"
Find window by name	command-prompt -p "Find window:" "find-window -N '%%'"
Move window to index	command-prompt -p "Move to index:" "move-window -t '%%'"
Kill current window	confirm-before -p "Kill window? (y/n)" kill-window
Session picker (tree view)	choose-tree -Zs
Window picker (tree view)	choose-tree -Zw
New session	command-prompt -p "Session name:" "new-session -s '%%'"
Rename current session	command-prompt -I "#S" "rename-session '%%'"
Switch to session by name	command-prompt -p "Session name:" "switch-client -t '%%'"
Detach from session	detach-client
Kill current session	confirm-before -p "Kill session? (y/n)" kill-session
Enter copy mode	copy-mode
Enter copy mode and search	copy-mode ; send-keys /
Show clock	clock-mode
Show all keybindings	list-keys
Show tmux messages / log	show-messages
Show environment variables	show-environment
Open tmux command prompt	command-prompt
Reload tmux config	source-file ~/.config/tmux/tmux.conf
EOF
)

tmp_entries=$(mktemp /tmp/fzf-entries-XXXXXX)
tmp_sel=$(mktemp /tmp/fzf-sel-XXXXXX)
printf '%s\n' "$ENTRIES" > "$tmp_entries"

# fzf reads entries from a file (< redirect, not a pipe subshell) so it
# stays in the script's process group and can reach the popup PTY for
# rendering. stdout stays on the PTY. Enter writes the selection to
# tmp_sel via execute.
fzf \
    --ansi \
    --delimiter=$'\t' \
    --with-nth=1 \
    --layout=reverse \
    --border=sharp \
    --height=100% \
    --padding=0,1 \
    --prompt=" ❯  " \
    --pointer="▸" \
    --marker="  " \
    --header=" ↑↓ navigate  ↵ execute  esc cancel" \
    --header-first \
    --color="dark" \
    --color="bg:#0f1117,bg+:#252836" \
    --color="fg:#a0a4b8,fg+:#e0e2ea" \
    --color="hl:#1a8a6a,hl+:#1a8a6a" \
    --color="border:#363a4f,label:#1a8a6a" \
    --color="prompt:#FBB13C,pointer:#FBB13C" \
    --color="header:#6a6e82,query:#e0e2ea,gutter:#0f1117" \
    --no-sort \
    --bind "enter:execute(printf '%s' {} > '$tmp_sel')+abort" \
    --bind "esc:abort" \
    < "$tmp_entries"

rm -f "$tmp_entries"

if [[ ! -s "$tmp_sel" ]]; then
  rm -f "$tmp_sel"
  exit 0
fi

SELECTED=$(cat "$tmp_sel")
rm -f "$tmp_sel"

COMMAND=$(printf '%s' "$SELECTED" | cut -f2-)
[[ -z "$COMMAND" ]] && exit 0

# The command goes to a temp file so the popup closes before it runs.
tmp=$(mktemp /tmp/tmux-palette-XXXXXX.sh)
printf 'tmux %s\n' "$COMMAND" > "$tmp"
tmux run-shell -b "sh '$tmp'; rm -f '$tmp'"
