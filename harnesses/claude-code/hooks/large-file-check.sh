#!/usr/bin/env bash
# PreToolUse hook: Bash
# Blocks git commit when a tracked or untracked-but-not-ignored file exceeds 100MB.
# Safety hook: fails closed when jq is missing.
# Settings should add `"if": "Bash(git commit *)"`. The command check below is a backstop.

LIMIT_BYTES=$((100 * 1024 * 1024))

if ! command -v jq >/dev/null 2>&1; then
  echo "[large-file-check] jq is missing. Install jq so this safety hook can run." >&2
  exit 2
fi

INPUT=$(cat)
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)

# Match "git commit" as a command word, not as text inside a message.
grep -qE '(^|[;&|(]|&&|\|\|)[[:space:]]*git[[:space:]]+commit([[:space:]]|$)' <<<"$CMD" || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0
cd "$REPO_ROOT" || exit 0

# GNU stat takes -c, BSD stat takes -f. Both print "<size> <path>".
if stat -c '%s' /dev/null >/dev/null 2>&1; then
  STAT_FMT=(-c '%s %n')
else
  STAT_FMT=(-f '%z %N')
fi

# One stat pass over every candidate file. Missing files (deleted, not yet staged) are skipped.
LARGE_FILES=$(git ls-files --others --cached --exclude-standard -z 2>/dev/null \
  | xargs -0 stat "${STAT_FMT[@]}" 2>/dev/null \
  | awk -v limit="$LIMIT_BYTES" '$1 > limit { sub(/^[0-9]+ /, ""); print }')

if [ -n "$LARGE_FILES" ]; then
  {
    echo "[large-file-check] Commit blocked. These files are over 100MB:"
    echo "$LARGE_FILES"
    echo "Remove them or add them to .gitignore before you commit."
  } >&2
  exit 2
fi

exit 0
