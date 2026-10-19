#!/usr/bin/env bash
# PostToolUse hook: Edit|Write
# Checks the syntax of an edited .py file. Parses the file and writes no bytecode.
# Check hook: fails open and silent when jq or python3 is missing.
# Exit 2 on PostToolUse shows stderr to Claude. The edit has already happened.

command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

INPUT=$(cat)
FILE=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>/dev/null)

[ -n "$FILE" ] && [[ "$FILE" == *.py ]] && [ -f "$FILE" ] || exit 0

# Print only the SyntaxError text, not the interpreter traceback.
CHECK='import ast,sys
try:
    ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])
except SyntaxError as e:
    print(f"line {e.lineno}: {e.msg}")
    sys.exit(1)'
if ! OUTPUT=$(python3 -c "$CHECK" "$FILE" 2>&1); then
  {
    echo "Syntax error in $FILE:"
    echo "$OUTPUT"
    echo "Fix this syntax error before you continue."
  } >&2
  exit 2
fi

exit 0
