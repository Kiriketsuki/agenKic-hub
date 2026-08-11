#!/usr/bin/env bash
# PostToolUse hook: check Python syntax after Edit/Write on .py files
# Receives JSON via stdin from Claude Code hook system.

INPUT=$(cat)
FILEPATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only check .py files
if [ -z "$FILEPATH" ] || [[ "$FILEPATH" != *.py ]]; then
  exit 0
fi

# Only check if file exists (Write might have failed)
if [ ! -f "$FILEPATH" ]; then
  exit 0
fi

# Run py_compile. Prefer python3 when python is absent.
PY=python
command -v python >/dev/null 2>&1 || PY=python3
OUTPUT=$("$PY" -m py_compile "$FILEPATH" 2>&1)
if [ $? -ne 0 ]; then
  echo "SYNTAX ERROR in $FILEPATH:"
  echo "$OUTPUT"
  echo "You must fix this syntax error before proceeding."
  exit 2
fi

exit 0
