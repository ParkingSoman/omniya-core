#!/usr/bin/env bash
# Auto-commit when a task is marked complete.
#
# Wired as PreToolUse on TaskUpdate. Exits silently unless the call is actually
# flipping a task to "completed", so it stays quiet on in_progress/pending.
#
# It will NOT commit a red tree. This project's whole discipline is that a
# wrong answer is worse than an honest refusal -- Task 5a deliberately left
# work uncommitted rather than commit red -- and an auto-commit that records a
# broken state would quietly undo that. Tests must pass first; if they don't,
# the hook says so and commits nothing.
#
# Never pushes. Committing is local and cheap to undo; pushing is not.

set -uo pipefail

HOOK_DATA=$(cat)

status=$(printf '%s' "$HOOK_DATA" | jq -r '.tool_input.status // empty' 2>/dev/null)
[ "$status" = "completed" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Nothing staged, nothing modified, nothing untracked -> nothing to do.
if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null \
   && [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

emit() { printf '{"systemMessage": %s}\n' "$(printf '%s' "$1" | jq -Rs .)"; }

# Refuse to commit red. Every commit this hook makes must be verified green;
# where green cannot be verified, it says so rather than implying it.
verified="green not verified (no test script)"
if [ -f package.json ] && jq -e '.scripts.test' package.json >/dev/null 2>&1; then
  if ! test_out=$(npm test 2>&1); then
    fails=$(printf '%s' "$test_out" | grep -Eo '# fail [0-9]+|fail [0-9]+' | tail -1)
    emit "Auto-commit SKIPPED: tests are failing (${fails:-see npm test}). Nothing was committed -- the working tree is left as-is so the failure stays visible."
    exit 0
  fi
  verified="tests green"
fi

task=$(printf '%s' "$HOOK_DATA" | jq -r '.tool_input.description // .tool_input.title // .tool_input.prompt // empty' 2>/dev/null | head -c 60)
[ -n "$task" ] || task="task complete"

git add -A >/dev/null 2>&1
if git diff --cached --quiet 2>/dev/null; then exit 0; fi

if git commit -q -m "checkpoint: ${task}" \
     -m "Auto-committed by the task-complete hook with the suite green." >/dev/null 2>&1; then
  sha=$(git rev-parse --short HEAD 2>/dev/null)
  files=$(git show --stat --format= --name-only HEAD 2>/dev/null | grep -c . )
  emit "Auto-committed ${sha} (${files} file(s)) -- ${verified}. Not pushed."
else
  emit "Auto-commit failed. Working tree left untouched; commit by hand."
fi
exit 0
