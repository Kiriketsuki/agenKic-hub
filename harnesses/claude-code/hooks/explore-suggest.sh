#!/bin/bash
# PreToolUse hook: Grep|Glob
# Nudge agents toward richer code-exploration tools when they are available.
# This is a suggestion hook: it prints a hint and always exits 0.
# Uses a 2-minute cooldown to avoid spamming every search.
#
# The detection blocks below cover two example tools: a semantic search CLI
# (here called "ov") and a GitNexus code-graph index. Swap in whatever
# exploration tooling your environment carries.

COOLDOWN_FILE="/tmp/.claude_explore_suggest_cooldown"
COOLDOWN_SECS=120

# Check cooldown — exit silently if recently suggested
if [ -f "$COOLDOWN_FILE" ]; then
    LAST=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    [ $((NOW - LAST)) -lt "$COOLDOWN_SECS" ] && exit 0
fi

# Detect available tools
OV_AVAILABLE=false
GN_AVAILABLE=false

if command -v ov >/dev/null 2>&1; then
    OV_AVAILABLE=true
fi

if [ -d ".gitnexus" ]; then
    GN_AVAILABLE=true
fi

# Nothing available — exit silently
[ "$OV_AVAILABLE" = false ] && [ "$GN_AVAILABLE" = false ] && exit 0

# Build one-line suggestion based on what's available
if [ "$GN_AVAILABLE" = true ] && [ "$OV_AVAILABLE" = true ]; then
    echo "[Explore] GitNexus (gitnexus_query/context/impact) and semantic search (ov_search/ov_find) are available — prefer these for concept search and code exploration over broad Grep/Glob."
elif [ "$GN_AVAILABLE" = true ]; then
    echo "[Explore] GitNexus is indexed here — prefer gitnexus_query/context for concept and symbol exploration over broad Grep/Glob."
elif [ "$OV_AVAILABLE" = true ]; then
    echo "[Explore] Semantic search is available — prefer ov_search/ov_find for document and note search over broad Grep/Glob."
fi

# Update cooldown
date +%s > "$COOLDOWN_FILE"
exit 0
