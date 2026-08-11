#!/usr/bin/env bash
# PreToolUse hook: enforce git/GitHub naming, block dangerous operations
# Receives JSON via stdin from Claude Code hook system.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$CMD" ]; then
  exit 0
fi

# Only enforce naming conventions in repos with an issue-branch-handler workflow.
# All other repos get a pass on branch/PR naming.
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
HAS_HANDLER=false
if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/.github/workflows/issue-branch-handler.yml" ]; then
  HAS_HANDLER=true
fi

# --- Naming Convention: type/kebab-case-description ---
# Valid types: feature, task, bug, bugfix, hotfix, refactor, docs, test, chore, perf, ci, release, saga, epic
# task/ and bug/ match the issue-branch-handler hierarchy (Patch-level bumps).
BRANCH_PATTERN='^(feature|task|bug|bugfix|hotfix|refactor|docs|test|chore|perf|ci|release|saga|epic)/[0-9]+-[a-z0-9][a-z0-9-]+$'

# Validate branch name on creation
if echo "$CMD" | grep -qE 'git\s+(checkout\s+-b|switch\s+-c)\s'; then
  if [ "$HAS_HANDLER" = true ]; then
    BRANCH=$(echo "$CMD" | grep -oE '(checkout -b|switch -c)\s+\S+' | awk '{print $NF}')
    if [ -n "$BRANCH" ] && ! echo "$BRANCH" | grep -qE "$BRANCH_PATTERN"; then
      echo "BLOCKED: Branch name '$BRANCH' does not match naming convention."
      echo "Required format: <type>/<issue-number>-<kebab-case-description>"
      echo "Valid types: feature, task, bug, bugfix, hotfix, refactor, docs, test, chore, perf, ci, release, saga, epic"
      echo "Example: feature/159-add-council-fix-loop"
      exit 2
    fi
    echo "WARNING: Check if a branch already exists on the remote first."
    echo "Run 'git fetch origin && git branch -r | grep <keyword>' to check."
  fi
  exit 0
fi

# Validate branch name on `git branch <name>` — branch CREATION only.
# Skip deletion (-d/-D), move/copy (-m/-M/-c/-C), listing (bare/-a/-r/--list),
# and any `git branch` that is piped/redirected for listing. We extract the token
# directly after the first `branch`; if it's a flag or a shell operator, this is
# not a creation and we leave it alone. (A compound command such as
# `git branch -D foo; git branch | sed ...` must NOT be treated as a creation.)
if echo "$CMD" | grep -qE 'git\s+branch\b'; then
  if [ "$HAS_HANDLER" = true ]; then
    NEXT=$(echo "$CMD" | grep -oE 'git[[:space:]]+branch[[:space:]]+[^[:space:]]+' | head -1 | awk '{print $NF}')
    case "$NEXT" in
      ''|-*|'|'*|'&'*|';'*|'>'*|'<'*)
        : ;;  # deletion / move / listing / redirection — not a creation, skip
      *)
        if ! echo "$NEXT" | grep -qE "$BRANCH_PATTERN"; then
          echo "BLOCKED: Branch name '$NEXT' does not match naming convention."
          echo "Required format: <type>/<issue-number>-<kebab-case-description>"
          echo "Valid types: feature, task, bug, bugfix, hotfix, refactor, docs, test, chore, perf, ci, release, saga, epic"
          echo "Example: feature/159-add-council-fix-loop"
          exit 2
        fi
        echo "WARNING: Check if a branch already exists on the remote first."
        echo "Run 'git fetch origin && git branch -r | grep <keyword>' to check."
        ;;
    esac
  fi
  exit 0
fi

# Validate PR title follows conventional commits, or the bracketed style
# some repos document in CONTRIBUTING.md (Feature, Task, Bug, Hotfix).
CONVENTIONAL_PATTERN='^(feat|fix|refactor|docs|test|chore|perf|ci|hotfix|saga|epic|release)(\(.+\))?:\s'
BRACKETED_PR_PATTERN='^(Adding|Implementing|Fixing)\s+\[(Feature|Task|Bug|Hotfix)\]:\s'
if echo "$CMD" | grep -qE 'gh\s+pr\s+create'; then
  if [ "$HAS_HANDLER" = true ]; then
    TITLE=$(echo "$CMD" | grep -oP -- '--title\s+["'"'"']\K[^"'"'"']+')
    if [ -n "$TITLE" ]; then
      if ! echo "$TITLE" | grep -qE "$CONVENTIONAL_PATTERN" && ! echo "$TITLE" | grep -qE "$BRACKETED_PR_PATTERN"; then
        echo "BLOCKED: PR title '$TITLE' does not follow conventional commits or the bracketed style."
        echo "Required format: <type>[(scope)]: <description>"
        echo "Example: feat(council): add bounded fix loop"
        echo "Or the bracketed style: <Adding|Implementing|Fixing> [<Feature|Task|Bug|Hotfix>]: <name>"
        echo "Example: Fixing [Hotfix]: pin the protobuf runtime floor"
        exit 2
      fi
    else
      echo "WARNING: Could not extract PR title from command. Title validation skipped."
      echo "Ensure the PR title follows conventional commits: <type>[(scope)]: <description>"
      echo "Or the bracketed style: <Adding|Implementing|Fixing> [<Feature|Task|Bug|Hotfix>]: <name>"
    fi
  fi
fi

# Validate commit message follows conventional commits (warning only)
if echo "$CMD" | grep -qE 'git\s+commit\s'; then
  MSG=$(echo "$CMD" | grep -oP -- '-m\s+["'"'"']\K[^"'"'"']+' | head -1)
  if [ -n "$MSG" ]; then
    # Check first line only (before any newline in heredoc-style messages)
    FIRST_LINE=$(echo "$MSG" | head -1)
    if ! echo "$FIRST_LINE" | grep -qE '^(feat|fix|refactor|docs|test|chore|perf|ci|hotfix|saga|epic|release)(\(.+\))?:\s'; then
      echo "WARNING: Commit message does not follow conventional commits format."
      echo "Expected: <type>[(scope)]: <description>"
      echo "Got: '$FIRST_LINE'"
      echo "Valid types: feat, fix, refactor, docs, test, chore, perf, ci, hotfix, saga, epic, release"
    fi
  fi
fi

# Validate issue title is descriptive (no single-word titles)
if echo "$CMD" | grep -qE 'gh\s+issue\s+(create|new)'; then
  TITLE=$(echo "$CMD" | grep -oP -- '--title\s+["'"'"']\K[^"'"'"']+')
  if [ -n "$TITLE" ]; then
    WORD_COUNT=$(echo "$TITLE" | wc -w)
    if [ "$WORD_COUNT" -lt 3 ]; then
      echo "WARNING: Issue title '$TITLE' is too short (${WORD_COUNT} words)."
      echo "Use a descriptive title with at least 3 words."
      exit 0
    fi
  fi
  echo "WARNING: Verify the issue doesn't already exist before creating."
  echo "Run 'gh issue list --search \"<keyword>\"' to check."
  exit 0
fi

# Block: any PR merge requires explicit user approval
if echo "$CMD" | grep -qE 'gh\s+pr\s+merge'; then
  # Check for draft PR first
  PR_NUM=$(echo "$CMD" | grep -oE '#[0-9]+|[0-9]+' | head -1)
  if [ -n "$PR_NUM" ]; then
    PR_NUM=$(echo "$PR_NUM" | tr -d '#')
    # Honor an explicit -R/--repo flag from the command. Without it the
    # check resolves against the hook's own cwd, which can be a DIFFERENT
    # repo whose PR numbers collide.
    REPO_ARG=$(echo "$CMD" | grep -oE '(-R|--repo)[= ]+[^ ]+' | head -1 | sed -E 's/^(-R|--repo)[= ]+//')
    if [ -n "$REPO_ARG" ]; then
      IS_DRAFT=$(gh pr view "$PR_NUM" -R "$REPO_ARG" --json isDraft -q '.isDraft' 2>/dev/null)
    else
      IS_DRAFT=$(gh pr view "$PR_NUM" --json isDraft -q '.isDraft' 2>/dev/null)
    fi
    if [ "$IS_DRAFT" = "true" ]; then
      # Write the reason to STDERR: an exit-2 PreToolUse block surfaces stderr
      # (not stdout) back to the caller. Emitting on stdout produced an opaque
      # "hook error: No stderr output" with no explanation.
      echo "BLOCKED: PR #$PR_NUM is still in DRAFT mode — not merging." >&2
      echo "Confirm all required fixes are applied before merging." >&2
      echo "To proceed: mark the PR as ready first with 'gh pr ready $PR_NUM'" >&2
      exit 2
    fi
  fi
  # Default to squash merge if no merge strategy specified
  if ! echo "$CMD" | grep -qE -- '--(squash|merge|rebase)'; then
    echo "WARNING: No merge strategy specified. Prefer --squash."
  fi
  echo "WARNING: PR merge requested. Approve to proceed, deny to cancel."
  exit 0
fi

# Warn: branch rename can close open PRs
if echo "$CMD" | grep -qE 'git\s+branch\s+-m\s'; then
  echo "WARNING: Renaming a branch closes any PRs targeting the old name."
  echo "Check for open PRs first: gh pr list --head <old-branch>"
  exit 0
fi

# Warn: issue relabeling can trigger automation (issue-branch-handler)
if echo "$CMD" | grep -qE 'gh\s+issue\s+edit\s.*--add-label|gh\s+issue\s+edit\s.*--remove-label'; then
  echo "WARNING: Relabeling issues may trigger workflow automation (e.g. issue-branch-handler)."
  echo "This can create duplicate branches or ghost PRs."
  echo "Check .github/workflows/ for label-triggered automation before proceeding."
  exit 0
fi

exit 0
