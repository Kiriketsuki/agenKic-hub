#!/usr/bin/env bash
# PreToolUse hook: Bash
# Runs the project linter before git commit. This hook only checks. It never edits files
# and never stages anything. When a check fails, it prints the fix command on stderr.
# Safety hook: fails closed when jq is missing.
# Settings should add `"if": "Bash(git commit *)"`. The command check below is a backstop.

if ! command -v jq >/dev/null 2>&1; then
  echo "[lint-precommit] jq is missing. Install jq so this safety hook can run." >&2
  exit 2
fi

INPUT=$(cat)
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)

grep -qE '(^|[;&|(]|&&|\|\|)[[:space:]]*git[[:space:]]+commit([[:space:]]|$)' <<<"$CMD" || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

ERRORS=""

# nvm lazy-loads node, so find the newest install when node is not on PATH.
NPM_BIN="npm"
NVM_DIR="$HOME/.nvm/versions/node"
if ! command -v npm >/dev/null 2>&1 && [ -d "$NVM_DIR" ]; then
  LATEST_NODE=$(/bin/ls "$NVM_DIR" | sort -V | tail -1)
  [ -n "$LATEST_NODE" ] && NPM_BIN="$NVM_DIR/$LATEST_NODE/bin/npm"
fi

# --- JS / TS ---
if [ -f "$REPO_ROOT/package.json" ]; then
  if jq -e '.scripts.lint' "$REPO_ROOT/package.json" >/dev/null 2>&1; then
    if ! LINT_OUT=$(cd "$REPO_ROOT" && "$NPM_BIN" run lint 2>&1); then
      ERRORS="${ERRORS}
=== ESLint (fix: npm run lint -- --fix) ===
${LINT_OUT}"
    fi
  fi

  TSC_BIN="$REPO_ROOT/node_modules/.bin/tsc"
  if [ -f "$REPO_ROOT/tsconfig.json" ] && [ -x "$TSC_BIN" ]; then
    if ! TSC_OUT=$(cd "$REPO_ROOT" && "$TSC_BIN" --noEmit 2>&1); then
      ERRORS="${ERRORS}
=== TypeScript ===
${TSC_OUT}"
    fi
  fi
fi

# --- Python ---
if [ -f "$REPO_ROOT/pyproject.toml" ] || [ -f "$REPO_ROOT/setup.py" ] || [ -f "$REPO_ROOT/requirements.txt" ]; then
  RUFF_CMD=""
  if command -v ruff >/dev/null 2>&1; then
    RUFF_CMD="ruff"
  elif command -v uv >/dev/null 2>&1 && uv run ruff --version >/dev/null 2>&1; then
    RUFF_CMD="uv run ruff"
  fi

  if [ -n "$RUFF_CMD" ]; then
    if ! RUFF_OUT=$(cd "$REPO_ROOT" && $RUFF_CMD check . 2>&1); then
      ERRORS="${ERRORS}
=== Ruff (fix: $RUFF_CMD check --fix .) ===
${RUFF_OUT}"
    fi
  elif command -v flake8 >/dev/null 2>&1; then
    if ! FLAKE_OUT=$(cd "$REPO_ROOT" && flake8 . 2>&1); then
      ERRORS="${ERRORS}
=== Flake8 ===
${FLAKE_OUT}"
    fi
  fi
fi

# --- Go ---
if [ -f "$REPO_ROOT/go.mod" ] && command -v go >/dev/null 2>&1; then
  # Repos with gitignored generated code (for example protobuf gen/) need
  # `make generate` before vet can resolve packages.
  if grep -qE '^generate:' "$REPO_ROOT/Makefile" 2>/dev/null; then
    (cd "$REPO_ROOT" && PATH="$PATH:$(go env GOPATH)/bin" make generate >/dev/null 2>&1) || \
      echo "[lint-precommit] make generate failed. go vet may report missing packages." >&2
  fi
  if ! GO_OUT=$(cd "$REPO_ROOT" && go vet ./... 2>&1); then
    ERRORS="${ERRORS}
=== go vet ===
${GO_OUT}"
  fi
  FMT_OUT=$(cd "$REPO_ROOT" && gofmt -l . 2>&1)
  if [ -n "$FMT_OUT" ]; then
    ERRORS="${ERRORS}
=== gofmt (fix: gofmt -w . then git add the files) ===
${FMT_OUT}"
  fi
fi

if [ -n "$ERRORS" ]; then
  {
    echo "[lint-precommit] Commit blocked. Fix these lint errors first."
    echo "This hook checks only. It changes no files and stages nothing."
    echo "$ERRORS"
  } >&2
  exit 2
fi

exit 0
