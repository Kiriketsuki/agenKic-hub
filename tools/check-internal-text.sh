#!/usr/bin/env bash
# Fails when a tracked file or a commit holds text that matches a deny pattern.
# The hub is public, so work-internal text must never reach it.
#
# Usage:
#   tools/check-internal-text.sh            scan the tracked files
#   tools/check-internal-text.sh --history  scan the tracked files and every
#                                           commit (message and diff) on HEAD
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
patterns="$root/tools/internal-text.deny"
mode="${1:-tree}"

if [ ! -f "$patterns" ]; then
  echo "check-internal-text: missing $patterns" >&2
  exit 2
fi

# Drop comment and blank lines. grep -f reads the result.
clean="$(mktemp)"
trap 'rm -f "$clean"' EXIT
grep -vE '^[[:space:]]*(#|$)' "$patterns" > "$clean"

status=0

echo "check-internal-text: scanning tracked files"
if git -C "$root" grep -nIE -f "$clean"; then
  echo "::error::Tracked files match a deny pattern in tools/internal-text.deny"
  status=1
fi

if [ "$mode" = "--history" ]; then
  echo "check-internal-text: scanning commit history"
  # Only the changed lines and the messages are scanned, so each hit is a
  # line that a commit added or removed.
  if git -C "$root" log HEAD -p --no-color --format='commit %H%n%B' | grep -nE -f "$clean"; then
    echo "::error::Commit history matches a deny pattern in tools/internal-text.deny"
    status=1
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "check-internal-text: clean"
fi
exit "$status"
