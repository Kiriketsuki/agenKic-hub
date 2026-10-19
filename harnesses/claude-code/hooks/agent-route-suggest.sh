#!/usr/bin/env bash
# PreToolUse hook: Agent|TeamCreate
# Adds a soft note about agent and model choice when a subagent starts.
# Suggestion hook: fails open and silent when jq is missing.
# A cooldown stops the note from firing on every call in a parallel batch.

command -v jq >/dev/null 2>&1 || exit 0

COOLDOWN_FILE="${XDG_RUNTIME_DIR:-/tmp}/agent-route-suggest-$UID"
COOLDOWN_SECS=60

if [ -f "$COOLDOWN_FILE" ]; then
  LAST=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  [[ "$LAST" =~ ^[0-9]+$ ]] || LAST=0
  [ $((NOW - LAST)) -lt "$COOLDOWN_SECS" ] && exit 0
fi

INPUT=$(cat)
SUBAGENT_TYPE=$(jq -r '.tool_input.subagent_type // empty' <<<"$INPUT" 2>/dev/null)
MODEL=$(jq -r '.tool_input.model // empty' <<<"$INPUT" 2>/dev/null)

# The caller already chose both, so stay quiet.
[ -n "$SUBAGENT_TYPE" ] && [ -n "$MODEL" ] && exit 0

NUDGE=""
if [ -z "$SUBAGENT_TYPE" ] && [ -z "$MODEL" ]; then
  NUDGE="[Agent Route] The call sets neither subagent_type nor model. Consider Explore (search, haiku), Plan (architecture, opus), diagnosis (bugs, sonnet), Senior Developer (implementation, sonnet) or Code Reviewer (review, sonnet). See /agent-route and /model-route."
elif [ -z "$SUBAGENT_TYPE" ]; then
  NUDGE="[Agent Route] The call sets no subagent_type, so it uses general-purpose. Consider a specialist: Explore (search), Plan (architecture), diagnosis (bugs), Senior Developer (implementation) or Code Reviewer (review). See /agent-route."
else
  NUDGE="[Model Route] The call sets no model. Defaults: Explore=haiku, developer and reviewer agents=sonnet, Plan and architects=opus. See /model-route."
fi

jq -n --arg ctx "$NUDGE" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
date +%s > "$COOLDOWN_FILE" 2>/dev/null

exit 0
