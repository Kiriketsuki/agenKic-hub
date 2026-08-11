#!/bin/bash
# preflight-check.sh — SessionStart hook: verify environment health.
# Outputs structured [PREFLIGHT] lines for Claude to act on.
# Never exits non-zero — a SessionStart hook must not block session start.
# Add or remove checks to match your own environment.

PASS="OK"
WARN="WARNING"

check_pacman_lock() {
  # Arch Linux only. Harmless elsewhere: the lock file never exists.
  if [ -f /var/lib/pacman/db.lck ]; then
    if pgrep -x pacman &>/dev/null; then
      echo "[PREFLIGHT] pacman_lock: $WARN (lock exists and pacman is running — wait for it to finish)"
    else
      echo "[PREFLIGHT] pacman_lock: $WARN (stale lock at /var/lib/pacman/db.lck — remove with: sudo rm /var/lib/pacman/db.lck)"
    fi
  else
    echo "[PREFLIGHT] pacman_lock: $PASS"
  fi
}

check_node_path() {
  # Version managers such as nvm lazy-load node, so it can be absent from
  # PATH in a non-interactive shell. Fall back to the newest nvm install.
  if command -v node &>/dev/null; then
    echo "[PREFLIGHT] node_path: $PASS (node in PATH: $(command -v node))"
    return
  fi
  NVM_DIR="$HOME/.nvm/versions/node"
  if [ -d "$NVM_DIR" ]; then
    LATEST=$(/bin/ls "$NVM_DIR" 2>/dev/null | sort -V | tail -1)
    if [ -n "$LATEST" ] && [ -x "$NVM_DIR/$LATEST/bin/node" ]; then
      echo "[PREFLIGHT] node_path: $PASS (nvm install: $NVM_DIR/$LATEST/bin/node)"
      return
    fi
  fi
  echo "[PREFLIGHT] node_path: $WARN (node not found — use an absolute path to your node binary in hooks)"
}

check_git_lock() {
  GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)"
  if [ -z "$GIT_DIR" ]; then
    echo "[PREFLIGHT] git_lock: OK (not a git repo)"
    return
  fi
  GIT_LOCK="$GIT_DIR/index.lock"
  if [ -f "$GIT_LOCK" ]; then
    if pgrep -x git &>/dev/null; then
      echo "[PREFLIGHT] git_lock: $WARN (index.lock exists and git is running — wait)"
    else
      echo "[PREFLIGHT] git_lock: $WARN (stale index.lock — remove with: rm $GIT_LOCK)"
    fi
  else
    echo "[PREFLIGHT] git_lock: $PASS"
  fi
}

# Run all checks
check_pacman_lock
check_node_path
check_git_lock

exit 0
