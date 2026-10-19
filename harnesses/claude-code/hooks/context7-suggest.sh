#!/usr/bin/env bash
# PostToolUse hook: Read
# When a dependency manifest is read, add a soft note to use Context7 for the listed libraries.
# Suggestion hook: fails open and silent when jq or python3 is missing.
# The file path always reaches Python as sys.argv[1]. It is never part of the Python source.

command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

INPUT=$(cat)
FILE=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>/dev/null)

[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

BASENAME=$(basename "$FILE")
LIBS=""

case "$BASENAME" in
  package.json)
    LIBS=$(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    deps = list(d.get('dependencies', {}).keys()) + list(d.get('devDependencies', {}).keys())
    major = [p for p in deps if not p.startswith('@types/') and len(p) > 2][:8]
    print('\n'.join(major))
except Exception: pass
" "$FILE" 2>/dev/null)
    ;;
  requirements.txt)
    LIBS=$(grep -v '^#' "$FILE" 2>/dev/null | grep -v '^$' | sed 's/[>=<!].*//' | tr -d ' ' | head -8)
    ;;
  pyproject.toml)
    LIBS=$(python3 -c "
import sys
try:
    import tomllib
except ImportError:
    try: import tomli as tomllib
    except ImportError: sys.exit(0)
with open(sys.argv[1], 'rb') as f:
    d = tomllib.load(f)
deps = (d.get('project', {}).get('dependencies', [])
        or list(d.get('tool', {}).get('poetry', {}).get('dependencies', {}).keys()))
if isinstance(deps, list):
    libs = [p.split('[')[0].split('>=')[0].split('==')[0].strip() for p in deps if not p.startswith('python')]
else:
    libs = [k for k in deps if k != 'python']
print('\n'.join(libs[:8]))
" "$FILE" 2>/dev/null)
    ;;
  go.mod)
    LIBS=$(awk '/^require/,/^\)/' "$FILE" 2>/dev/null | grep -v '^require' | grep -v '^)' | awk '{print $1}' | grep '\.' | head -8)
    ;;
  Cargo.toml)
    LIBS=$(awk '/^\[dependencies\]/,/^\[/' "$FILE" 2>/dev/null | grep '=' | awk -F'=' '{print $1}' | tr -d ' ' | grep -v '^\[' | head -8)
    ;;
  *)
    exit 0
    ;;
esac

[ -z "$LIBS" ] && exit 0

LIB_LIST=$(echo "$LIBS" | tr '\n' ',' | sed 's/,$//; s/,/, /g')
MSG="[Context7] Manifest opened. Libraries: $LIB_LIST. Use mcp__plugin_context7_context7__query-docs before you write code against an unfamiliar library."
jq -n --arg ctx "$MSG" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
exit 0
