#!/usr/bin/env bash
# Stop hook: run the project's verify script before Claude ends its turn.
# If the project has an executable .claude/verify.sh, this hook runs it from the project root.
# On failure it returns {"decision":"block","reason":"<tail of output>"} so Claude keeps working.
# When stop_hook_active is true, Claude already continued once because of this hook.
# Then the hook allows the stop and adds a systemMessage, so a broken verify.sh cannot loop forever.
# With no verify.sh the hook exits 0 and prints nothing.
# Fails open and silent when jq is missing.

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)
[ -n "$CWD" ] && [ -d "$CWD" ] || CWD="."
ACTIVE=$(jq -r '.stop_hook_active // false' <<<"$INPUT" 2>/dev/null)

ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || ROOT="$CWD"
[ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ] && ROOT="$CLAUDE_PROJECT_DIR"

VERIFY="$ROOT/.claude/verify.sh"
[ -f "$VERIFY" ] && [ -x "$VERIFY" ] || exit 0

if OUTPUT=$(cd "$ROOT" && "$VERIFY" 2>&1); then
  exit 0
fi

TAIL=$(printf '%s\n' "$OUTPUT" | tail -n 40)

if [ "$ACTIVE" = "true" ]; then
  jq -n --arg tail "$TAIL" \
    '{systemMessage: ("verify.sh still fails. The stop is allowed to avoid a loop. Last output:\n" + $tail)}'
  exit 0
fi

jq -n --arg tail "$TAIL" \
  '{decision: "block", reason: ("verify.sh failed. Fix the failures and try again. Last output:\n" + $tail)}'
exit 0
