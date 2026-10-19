#!/usr/bin/env bash
# PreToolUse hook: enforce git/GitHub naming, block dangerous operations
# Receives JSON via stdin from Claude Code hook system.
#
# Output contract (Claude Code PreToolUse):
# - A block prints its reason to STDERR and exits 2. Claude Code shows stderr for exit 2.
#   It does not show stdout, so a reason on stdout reads as "No stderr output".
# - With AGENKIC_MERGE_GATE=ask, `gh pr merge` gets a JSON decision on stdout with
#   permissionDecision "ask" and exit 0. Without it, the merge runs and only the draft check
#   blocks. The prompt is opt-in because it also stops the merge agents of unattended runs.
# - Soft warnings go into one JSON object as additionalContext, which Claude Code passes to
#   the model. Several warnings combine into that one object.
# - No check exits early. Each check falls through to the next, so a compound command such
#   as `git branch -D x && gh pr merge 5` still reaches the merge check.
#
# For a prompt that no hook can approve, add a permissions ask rule for `Bash(gh pr merge *)`.
# An explicit ask rule prompts in every permission mode, including bypassPermissions. A hook
# allow does not override it, so it also stops every unattended workflow merge.

# The hook parses its input with jq. Without jq it cannot see the command, so it fails closed.
if ! command -v jq >/dev/null 2>&1; then
  echo "BLOCKED: gh-check-before-create.sh needs jq to read the tool input, and jq is not installed." >&2
  echo "Install jq (for example: pacman -S jq) or remove this hook from settings.json." >&2
  exit 2
fi

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$CMD" ]; then
  exit 0
fi

WARNINGS=()
ASK_REASON=""

warn() {
  WARNINGS+=("$*")
}

# Print each argument as one line on stderr, then block the tool call.
block() {
  printf '%s\n' "$@" >&2
  exit 2
}

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
BRANCH_HELP=(
  "Required format: <type>/<issue-number>-<kebab-case-description>"
  "Valid types: feature, task, bug, bugfix, hotfix, refactor, docs, test, chore, perf, ci, release, saga, epic"
  "Example: feature/159-add-council-fix-loop"
)
REMOTE_CHECK="Check if the branch already exists on the remote first: git fetch origin && git branch -r | grep <keyword>"

# Validate branch name on creation
if echo "$CMD" | grep -qE 'git\s+(checkout\s+-b|switch\s+-c)\s'; then
  if [ "$HAS_HANDLER" = true ]; then
    BRANCH=$(echo "$CMD" | grep -oE '(checkout -b|switch -c)\s+\S+' | head -1 | awk '{print $NF}')
    if [ -n "$BRANCH" ] && ! echo "$BRANCH" | grep -qE "$BRANCH_PATTERN"; then
      block "BLOCKED: Branch name '$BRANCH' does not match naming convention." "${BRANCH_HELP[@]}"
    fi
    warn "$REMOTE_CHECK"
  fi
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
          block "BLOCKED: Branch name '$NEXT' does not match naming convention." "${BRANCH_HELP[@]}"
        fi
        warn "$REMOTE_CHECK"
        ;;
    esac
  fi
fi

# Validate PR title follows conventional commits, or the bracketed style
# some repos document in CONTRIBUTING.md (Feature, Task, Bug, Hotfix).
CONVENTIONAL_PATTERN='^(feat|fix|refactor|docs|test|chore|perf|ci|hotfix|saga|epic|release)(\(.+\))?:\s'
BRACKETED_PR_PATTERN='^(Adding|Implementing|Fixing)\s+\[(Feature|Task|Bug|Hotfix)\]:\s'
if echo "$CMD" | grep -qE 'gh\s+pr\s+create'; then
  if [ "$HAS_HANDLER" = true ]; then
    TITLE=$(echo "$CMD" | grep -oP -- '--title\s+["'"'"']\K[^"'"'"']+' | head -1)
    if [ -n "$TITLE" ]; then
      if ! echo "$TITLE" | grep -qE "$CONVENTIONAL_PATTERN" && ! echo "$TITLE" | grep -qE "$BRACKETED_PR_PATTERN"; then
        block "BLOCKED: PR title '$TITLE' does not follow conventional commits or the bracketed style." \
          "Required format: <type>[(scope)]: <description>" \
          "Example: feat(council): add bounded fix loop" \
          "Or the bracketed style: <Adding|Implementing|Fixing> [<Feature|Task|Bug|Hotfix>]: <name>" \
          "Example: Fixing [Hotfix]: pin the protobuf runtime floor"
      fi
    else
      warn "Could not extract the PR title from the command, so title validation was skipped. The title must follow conventional commits (<type>[(scope)]: <description>) or the bracketed style (<Adding|Implementing|Fixing> [<Feature|Task|Bug|Hotfix>]: <name>)."
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
      warn "Commit message '$FIRST_LINE' does not follow conventional commits. Expected: <type>[(scope)]: <description>. Valid types: feat, fix, refactor, docs, test, chore, perf, ci, hotfix, saga, epic, release."
    fi
  fi
fi

# Validate issue title is descriptive (no single-word titles)
if echo "$CMD" | grep -qE 'gh\s+issue\s+(create|new)'; then
  TITLE=$(echo "$CMD" | grep -oP -- '--title\s+["'"'"']\K[^"'"'"']+' | head -1)
  if [ -n "$TITLE" ]; then
    WORD_COUNT=$(echo "$TITLE" | wc -w)
    if [ "$WORD_COUNT" -lt 3 ]; then
      warn "Issue title '$TITLE' is too short (${WORD_COUNT} words). Use a descriptive title with at least 3 words."
    fi
  fi
  warn "Verify that the issue does not already exist before you create it: gh issue list --search \"<keyword>\""
fi

# A draft PR merge is blocked outright. Other merges ask only with AGENKIC_MERGE_GATE=ask.
if echo "$CMD" | grep -qE 'gh\s+pr\s+merge'; then
  # Read the PR number from the text after `gh pr merge` only. A number earlier in a compound
  # command (a branch name such as feature/12-x) is not the PR.
  MERGE_ARGS=$(echo "$CMD" | grep -oE 'gh[[:space:]]+pr[[:space:]]+merge.*' | head -1)
  PR_NUM=$(echo "$MERGE_ARGS" | sed -E 's/^gh[[:space:]]+pr[[:space:]]+merge//' | grep -oE '(^|[[:space:]])#?[0-9]+([[:space:]]|$)' | head -1 | tr -d '# \t')
  if [ -n "$PR_NUM" ]; then
    # Honor an explicit -R/--repo flag from the command. Without it the
    # check resolves against the hook's own cwd, which can be a DIFFERENT
    # repo whose PR numbers collide.
    REPO_ARG=$(echo "$MERGE_ARGS" | grep -oE '(-R|--repo)[= ]+[^ ]+' | head -1 | sed -E 's/^(-R|--repo)[= ]+//')
    if [ -n "$REPO_ARG" ]; then
      IS_DRAFT=$(gh pr view "$PR_NUM" -R "$REPO_ARG" --json isDraft -q '.isDraft' 2>/dev/null)
    else
      IS_DRAFT=$(gh pr view "$PR_NUM" --json isDraft -q '.isDraft' 2>/dev/null)
    fi
    if [ "$IS_DRAFT" = "true" ]; then
      block "BLOCKED: PR #$PR_NUM is still in DRAFT mode — not merging." \
        "Confirm all required fixes are applied before merging." \
        "To proceed: mark the PR as ready first with 'gh pr ready $PR_NUM'"
    fi
  fi
  if ! echo "$MERGE_ARGS" | grep -qE -- '--(squash|merge|rebase)'; then
    warn "No merge strategy specified. Prefer --squash."
  fi
  # The approval prompt is opt-in. With AGENKIC_MERGE_GATE=ask the hook asks the user before
  # every merge. Without it, a merge runs and the draft check above is the only block.
  if [ "${AGENKIC_MERGE_GATE:-}" = "ask" ]; then
    ASK_REASON="PR merge requested${PR_NUM:+ for PR #$PR_NUM}. AGENKIC_MERGE_GATE=ask needs explicit user approval."
  fi
fi

# Warn: branch rename can close open PRs
if echo "$CMD" | grep -qE 'git\s+branch\s+-m\s'; then
  warn "Renaming a branch closes any PRs targeting the old name. Check for open PRs first: gh pr list --head <old-branch>"
fi

# Warn: issue relabeling can trigger automation (issue-branch-handler)
if echo "$CMD" | grep -qE 'gh\s+issue\s+edit\s.*--add-label|gh\s+issue\s+edit\s.*--remove-label'; then
  warn "Relabeling issues may trigger workflow automation (e.g. issue-branch-handler). This can create duplicate branches or ghost PRs. Check .github/workflows/ for label-triggered automation before proceeding."
fi

# Emit one JSON object that carries the ask decision and every warning.
if [ -n "$ASK_REASON" ] || [ "${#WARNINGS[@]}" -gt 0 ]; then
  CONTEXT=""
  if [ "${#WARNINGS[@]}" -gt 0 ]; then
    CONTEXT=$(printf 'WARNING: %s\n' "${WARNINGS[@]}")
  fi
  jq -n --arg reason "$ASK_REASON" --arg context "$CONTEXT" '{
    hookSpecificOutput: (
      { hookEventName: "PreToolUse" }
      + (if $reason != "" then { permissionDecision: "ask", permissionDecisionReason: $reason } else {} end)
      + (if $context != "" then { additionalContext: $context } else {} end)
    )
  }'
fi

exit 0
