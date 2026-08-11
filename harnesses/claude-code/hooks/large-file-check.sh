#!/bin/bash
# PreToolUse hook: Bash
# Blocks git commit if any files >100MB exist in the repo tree.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only intercept git commit
echo "$CMD" | grep -qE "git commit" || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

LARGE_FILES=$(git -C "$REPO_ROOT" ls-files --others --cached --exclude-standard -z 2>/dev/null \
  | xargs -0 -I{} find "$REPO_ROOT/{}" -maxdepth 0 -size +100M 2>/dev/null)
if [ -n "$LARGE_FILES" ]; then
    echo "[large-file-check] COMMIT BLOCKED — files >100MB found:"
    echo "$LARGE_FILES"
    echo "Remove or add to .gitignore before committing."
    exit 2
fi

exit 0
