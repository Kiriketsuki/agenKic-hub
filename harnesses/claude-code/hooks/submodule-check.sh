#!/bin/bash
# Check if any submodule files changed and update if so
if git diff --name-only 2>/dev/null | grep -q submodule; then
  git submodule update --remote 2>/dev/null
fi
