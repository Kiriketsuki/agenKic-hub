#!/usr/bin/env bash
# playwright-reaper.sh: closes Playwright MCP browsers that no agent uses any more.
#
# The Playwright MCP server keeps its browser open until the session ends, and it has no
# idle timeout. Each Claude session starts its own server. With 25 sessions that holds
# gigabytes of RAM. A server whose session died without cleanup stays alive as an orphan.
#
# Modes:
#   mark   PostToolUse, matcher mcp__.*playwright.*. Records the last Playwright tool call
#          of the owning Claude session.
#   sweep  Stop and SessionStart. Starts one background pass and returns at once:
#          - An MCP server with no live Claude ancestor is an orphan. The pass ends its tree.
#          - A browser whose session made no Playwright call for PW_REAPER_IDLE_SECS is
#            closed. The MCP server stays up and opens a new browser on the next call.
#   run    The pass itself, in the foreground. Use it to test.
#
# Settings (environment):
#   PW_REAPER_IDLE_SECS   idle time before a browser closes (default 600)
#   PW_REAPER_SWEEP_SECS  minimum time between two passes (default 60)
#   PW_REAPER_DRY_RUN=1   print what the pass would end, end nothing
#
# A hook must never block the session, so every failure exits 0.

set -u

MODE="${1:-sweep}"
IDLE="${PW_REAPER_IDLE_SECS:-600}"
THROTTLE="${PW_REAPER_SWEEP_SECS:-60}"
DRY="${PW_REAPER_DRY_RUN:-0}"
STATE="${XDG_RUNTIME_DIR:-/tmp/pw-reaper-$(id -u)}/pw-reaper"

# Processes that start an MCP server: npm exec, npx, node. Shells are left out, so a
# command line that only mentions Playwright, such as a pgrep, never matches.
MCP_ARGS='@playwright/mcp|playwright-mcp|mcp-server-playwright'
MCP_COMM='^(node|npm|npx|MainThread|npm exec.*)$'
# comm is cut to 15 characters, so chrome-headless-shell shows as chrome-headless.
BROWSER_COMM='^(chrome|chromium|chromium-browse|chrome-headless|headless_shell|msedge|firefox)$'

mkdir -p "$STATE" 2>/dev/null && chmod 700 "$STATE" 2>/dev/null || exit 0

# Prints the PID of the nearest ancestor named claude, or nothing.
claude_ancestor() {
  local pid="$1" comm
  while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
    comm=$(cat "/proc/$pid/comm" 2>/dev/null) || return 0
    if [ "$comm" = "claude" ]; then echo "$pid"; return 0; fi
    pid=$(awk '/^PPid:/ {print $2}' "/proc/$pid/status" 2>/dev/null)
  done
}

end_pids() {
  [ "$#" -gt 0 ] || return 0
  if [ "$DRY" = "1" ]; then echo "would end: $*"; return 0; fi
  kill -TERM "$@" 2>/dev/null
  sleep 3
  kill -KILL "$@" 2>/dev/null
  return 0
}

run_pass() {
  local now pid ppid etimes comm args
  now=$(date +%s)
  declare -A PARENT=() AGE=() ARGS=() KIDS=()
  # comm can hold spaces, so this reads args only. comm_of reads comm from /proc.
  while read -r pid ppid etimes args; do
    PARENT[$pid]=$ppid; AGE[$pid]=$etimes; ARGS[$pid]=$args
    KIDS[$ppid]+="$pid "
  done < <(ps -eo pid=,ppid=,etimes=,args= 2>/dev/null)

  comm_of() { cat "/proc/$1/comm" 2>/dev/null; }

  # Collects a process and all its descendants into the array SUBTREE.
  subtree() {
    local p="$1" k
    SUBTREE+=("$p")
    for k in ${KIDS[$p]:-}; do subtree "$k"; done
  }

  is_mcp() { [[ "${ARGS[$1]:-}" =~ $MCP_ARGS ]] && [[ "$(comm_of "$1")" =~ $MCP_COMM ]]; }

  local orphans=() idle=() owner stamp last p
  for pid in "${!ARGS[@]}"; do
    is_mcp "$pid" || continue
    # Only the top process of each server chain. Its descendants come with it.
    is_mcp "${PARENT[$pid]:-0}" && continue
    owner=$(claude_ancestor "$pid")
    SUBTREE=(); subtree "$pid"
    if [ -z "$owner" ]; then
      orphans+=("${SUBTREE[@]}")
      continue
    fi
    stamp="$STATE/$owner"
    for p in "${SUBTREE[@]}"; do
      [[ "$(comm_of "$p")" =~ $BROWSER_COMM ]] || continue
      # Only the main browser process. Its renderers end with it.
      [[ "$(comm_of "${PARENT[$p]:-0}")" =~ $BROWSER_COMM ]] && continue
      if [ -f "$stamp" ]; then
        last=$(stat -c %Y "$stamp" 2>/dev/null || echo "$now")
        [ $(( now - last )) -ge "$IDLE" ] && idle+=("$p")
      elif [ "${AGE[$p]:-0}" -ge "$IDLE" ]; then
        # No mark yet, for example a browser that predates this hook. Use its age.
        idle+=("$p")
      fi
    done
  done

  [ "${#orphans[@]}" -gt 0 ] && echo "$(date -Is) orphan servers: ${orphans[*]}"
  [ "${#idle[@]}" -gt 0 ] && echo "$(date -Is) idle browsers: ${idle[*]}"
  end_pids "${orphans[@]}" "${idle[@]}"

  # Removes the marks of sessions that have ended.
  for stamp in "$STATE"/[0-9]*; do
    [ -e "$stamp" ] || continue
    [ -d "/proc/${stamp##*/}" ] || rm -f -- "$stamp"
  done
}

case "$MODE" in
  mark)
    cat >/dev/null 2>&1
    owner=$(claude_ancestor "$PPID")
    [ -n "$owner" ] && touch "$STATE/$owner" 2>/dev/null
    ;;
  sweep)
    cat >/dev/null 2>&1
    last="$STATE/.last-sweep"
    if [ -f "$last" ] && [ $(( $(date +%s) - $(stat -c %Y "$last" 2>/dev/null || echo 0) )) -lt "$THROTTLE" ]; then
      exit 0
    fi
    touch "$last" 2>/dev/null
    # setsid detaches the pass, so the hook returns before the 3 s kill wait.
    setsid "$0" run >>"$STATE/reaper.log" 2>&1 </dev/null &
    ;;
  run)
    exec 9>"$STATE/.lock"
    flock -n 9 || exit 0
    run_pass
    ;;
esac
exit 0
