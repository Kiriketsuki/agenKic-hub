#!/bin/bash
# PreToolUse hook: Agent|TeamCreate
# Nudges agents to consider agent-route and model-route when spawning subagents.
# Uses a cooldown to avoid firing on every single Agent call in a parallel batch.

COOLDOWN_FILE="/tmp/.claude_agent_route_cooldown"
COOLDOWN_SECS=60

# Check cooldown
if [ -f "$COOLDOWN_FILE" ]; then
    LAST=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    [ $((NOW - LAST)) -lt "$COOLDOWN_SECS" ] && exit 0
fi

INPUT=$(cat)

# Extract subagent_type and model from tool input (if present)
SUBAGENT_TYPE=""
MODEL=""
if command -v jq &>/dev/null; then
    SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)
    MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // empty' 2>/dev/null)
fi

# If both are already set, skip — the caller made a deliberate choice
if [ -n "$SUBAGENT_TYPE" ] && [ -n "$MODEL" ]; then
    exit 0
fi

# Build nudge based on what's missing
NUDGE=""
if [ -z "$SUBAGENT_TYPE" ] && [ -z "$MODEL" ]; then
    NUDGE="[Agent Route] Neither subagent_type nor model specified. Consider: Explore (search, haiku), Plan (architecture, opus), diagnosis (bugs, sonnet), Senior Developer (implementation, sonnet), Code Reviewer (review, sonnet). See /agent-route for full routing. See /model-route for model selection."
elif [ -z "$SUBAGENT_TYPE" ]; then
    NUDGE="[Agent Route] No subagent_type specified — using general-purpose. Consider a specialist: Explore (search), Plan (architecture), diagnosis (bugs), Senior Developer (implementation), Code Reviewer (review). See /agent-route for full routing."
elif [ -z "$MODEL" ]; then
    NUDGE="[Model Route] No model specified. Defaults: Explore=haiku, developer/reviewer agents=sonnet, Plan/architects=opus. See /model-route for guidance."
fi

if [ -n "$NUDGE" ]; then
    echo "$NUDGE"
    date +%s > "$COOLDOWN_FILE"
fi

exit 0
