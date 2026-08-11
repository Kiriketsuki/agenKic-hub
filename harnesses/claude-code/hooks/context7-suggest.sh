#!/bin/bash
# PostToolUse hook: Read
# When a dependency manifest is read, hint to use Context7 for the listed libraries.

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('file_path', '') or '')
" 2>/dev/null || echo "")

[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

BASENAME=$(basename "$FILE")
LIBS=""

case "$BASENAME" in
  package.json)
    LIBS=$(python3 -c "
import json, sys
try:
    d = json.load(open('$FILE'))
    deps = list(d.get('dependencies', {}).keys()) + list(d.get('devDependencies', {}).keys())
    major = [p for p in deps if not p.startswith('@types/') and len(p) > 2][:8]
    print('\n'.join(major))
except Exception: pass
" 2>/dev/null)
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
with open('$FILE', 'rb') as f:
    d = tomllib.load(f)
deps = (d.get('project', {}).get('dependencies', [])
        or list(d.get('tool', {}).get('poetry', {}).get('dependencies', {}).keys()))
if isinstance(deps, list):
    libs = [p.split('[')[0].split('>=')[0].split('==')[0].strip() for p in deps if not p.startswith('python')]
else:
    libs = [k for k in deps if k != 'python']
print('\n'.join(libs[:8]))
" 2>/dev/null)
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

LIB_LIST=$(echo "$LIBS" | tr '\n' ', ' | sed 's/, $//')
echo "[Context7] Manifest opened — libraries: $LIB_LIST"
echo "Use mcp__plugin_context7_context7__query-docs before writing code against any unfamiliar library."
