#!/bin/bash
# PreToolUse hook: Bash
# Intercepts git commit, runs project-appropriate linter, blocks on unfixed errors.
# Auto-fixes where possible (ruff --fix, gofmt -w) and re-stages before re-checking.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    pass
" 2>/dev/null)

# Only intercept git commit
echo "$CMD" | grep -qE "git commit" || exit 0

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

ERRORS=""
# Find latest NVM node version dynamically
NVM_DIR="$HOME/.nvm/versions/node"
if [ -d "$NVM_DIR" ]; then
    LATEST_NODE=$(/bin/ls "$NVM_DIR" | sort -V | tail -1)
    NODE_BIN="$NVM_DIR/$LATEST_NODE/bin/node"
    NPM_BIN="$NVM_DIR/$LATEST_NODE/bin/npm"
else
    NODE_BIN="node"
    NPM_BIN="npm"
fi

# --- JS / TS ---
if [ -f "$REPO_ROOT/package.json" ]; then
    # ESLint via lint script
    HAS_LINT=$("$NODE_BIN" -e "
try {
  const p = require('$REPO_ROOT/package.json');
  process.exit((p.scripts && p.scripts.lint) ? 0 : 1);
} catch(e) { process.exit(1); }
" 2>/dev/null; echo $?)
    if [ "$HAS_LINT" = "0" ]; then
        echo "[lint-precommit] Running npm run lint..."
        LINT_OUT=$(cd "$REPO_ROOT" && "$NPM_BIN" run lint 2>&1)
        LINT_EXIT=$?
        if [ "$LINT_EXIT" -ne 0 ]; then
            ERRORS="${ERRORS}
=== ESLint ===
${LINT_OUT}"
        else
            echo "[lint-precommit] ESLint: OK"
        fi
    fi

    # TypeScript typecheck
    TSC_BIN="$REPO_ROOT/node_modules/.bin/tsc"
    if [ -f "$REPO_ROOT/tsconfig.json" ] && [ -f "$TSC_BIN" ]; then
        echo "[lint-precommit] Running tsc --noEmit..."
        TSC_OUT=$(cd "$REPO_ROOT" && "$TSC_BIN" --noEmit 2>&1)
        TSC_EXIT=$?
        if [ "$TSC_EXIT" -ne 0 ]; then
            ERRORS="${ERRORS}
=== TypeScript ===
${TSC_OUT}"
        else
            echo "[lint-precommit] TypeScript: OK"
        fi
    fi
fi

# --- Python ---
if [ -f "$REPO_ROOT/pyproject.toml" ] || [ -f "$REPO_ROOT/setup.py" ] || [ -f "$REPO_ROOT/requirements.txt" ]; then
    # Resolve ruff: global PATH, then uv run
    RUFF_CMD=""
    if command -v ruff >/dev/null 2>&1; then
        RUFF_CMD="ruff"
    elif command -v uv >/dev/null 2>&1 && uv run ruff --version >/dev/null 2>&1; then
        RUFF_CMD="uv run ruff"
    fi

    if [ -n "$RUFF_CMD" ]; then
        echo "[lint-precommit] Running ruff check..."
        RUFF_OUT=$(cd "$REPO_ROOT" && $RUFF_CMD check . 2>&1)
        RUFF_EXIT=$?
        if [ "$RUFF_EXIT" -ne 0 ]; then
            # Try auto-fix
            (cd "$REPO_ROOT" && $RUFF_CMD check --fix . >/dev/null 2>&1)
            git -C "$REPO_ROOT" add -u 2>/dev/null
            RUFF_OUT2=$(cd "$REPO_ROOT" && $RUFF_CMD check . 2>&1)
            RUFF_EXIT2=$?
            if [ "$RUFF_EXIT2" -ne 0 ]; then
                ERRORS="${ERRORS}
=== Ruff ===
${RUFF_OUT2}"
            else
                echo "[lint-precommit] Ruff: auto-fixed and re-staged."
            fi
        else
            echo "[lint-precommit] Ruff: OK"
        fi
    elif command -v flake8 >/dev/null 2>&1; then
        echo "[lint-precommit] Running flake8..."
        FLAKE_OUT=$(cd "$REPO_ROOT" && flake8 . 2>&1)
        FLAKE_EXIT=$?
        if [ "$FLAKE_EXIT" -ne 0 ]; then
            ERRORS="${ERRORS}
=== Flake8 ===
${FLAKE_OUT}"
        else
            echo "[lint-precommit] Flake8: OK"
        fi
    fi
fi

# --- Go ---
if [ -f "$REPO_ROOT/go.mod" ]; then
    if command -v go >/dev/null 2>&1; then
        # Repos with gitignored generated code (e.g. protobuf gen/) need
        # `make generate` before vet can resolve packages.
        if grep -qE '^generate:' "$REPO_ROOT/Makefile" 2>/dev/null; then
            echo "[lint-precommit] Running make generate..."
            (cd "$REPO_ROOT" && PATH="$PATH:$(go env GOPATH)/bin" make generate >/dev/null 2>&1) || \
                echo "[lint-precommit] make generate failed — go vet may report missing packages."
        fi
        echo "[lint-precommit] Running go vet..."
        GO_OUT=$(cd "$REPO_ROOT" && go vet ./... 2>&1)
        GO_EXIT=$?
        if [ "$GO_EXIT" -ne 0 ]; then
            ERRORS="${ERRORS}
=== go vet ===
${GO_OUT}"
        else
            echo "[lint-precommit] go vet: OK"
        fi

        FMT_OUT=$(cd "$REPO_ROOT" && gofmt -l . 2>&1)
        if [ -n "$FMT_OUT" ]; then
            gofmt -w "$REPO_ROOT" 2>/dev/null
            git -C "$REPO_ROOT" add -u 2>/dev/null
            echo "[lint-precommit] gofmt: auto-formatted and re-staged."
        fi
    fi
fi

# Block commit if unfixed errors remain
if [ -n "$ERRORS" ]; then
    echo "[lint-precommit] COMMIT BLOCKED — fix lint errors first:"
    echo "$ERRORS"
    exit 2
fi

exit 0
