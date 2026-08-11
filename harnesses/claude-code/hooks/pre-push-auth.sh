#!/bin/sh
# PreToolUse hook: Bash
# Switches the active gh account to match the repo's remote owner before any git push.
# Useful when one machine holds both a personal and a work GitHub account.
#
# Configure the owner-to-account mapping in the case block below. Each case
# pattern matches a substring of the origin remote URL. The target is the gh
# account login to switch to. Unknown remotes pass through untouched.

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

case "$cmd" in
  *"git push"*)
    remote=$(git remote get-url origin 2>/dev/null)
    case "$remote" in
      # EDIT ME: map remote owner substrings to gh account logins.
      *my-work-org*)     target="my-work-account" ;;
      *my-personal-name*) target="my-personal-account" ;;
      *)                 exit 0 ;;  # unknown remote, do not interfere
    esac
    active=$(gh api user --jq '.login' 2>/dev/null)
    if [ "$active" != "$target" ]; then
      gh auth switch --user "$target" > /dev/null 2>&1
    fi
    ;;
esac

exit 0
