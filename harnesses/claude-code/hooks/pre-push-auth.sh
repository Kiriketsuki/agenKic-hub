#!/usr/bin/env bash
# PreToolUse hook: Bash
# Switches the active gh account to match the repo's remote owner before git push.
# Useful when one machine holds both a personal and a work GitHub account.
# Safety hook: fails closed when jq is missing, so a push never runs under the wrong account.
# Settings should add `"if": "Bash(git push *)"`. The case check below is a backstop.
#
# Configure the owner-to-account mapping in the case block below. Each case
# pattern matches a substring of the origin remote URL. The target is the gh
# account login to switch to. Unknown remotes pass through untouched.

if ! command -v jq >/dev/null 2>&1; then
  echo "[pre-push-auth] jq is missing. Install jq so this safety hook can run." >&2
  exit 2
fi

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // ""' <<<"$input")
[ -n "$cwd" ] && [ -d "$cwd" ] || cwd="."

case "$cmd" in
  *"git push"*)
    remote=$(git -C "$cwd" remote get-url origin 2>/dev/null)
    case "$remote" in
      # EDIT ME: map remote owner substrings to gh account logins.
      *my-work-org*)      target="my-work-account" ;;
      *my-personal-name*) target="my-personal-account" ;;
      *)                  exit 0 ;;  # unknown remote, do not interfere
    esac
    active=$(gh api user --jq '.login' 2>/dev/null)
    if [ "$active" != "$target" ]; then
      if ! gh auth switch --user "$target" >/dev/null 2>&1; then
        echo "[pre-push-auth] Could not switch gh to $target. Run: gh auth switch --user $target" >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
