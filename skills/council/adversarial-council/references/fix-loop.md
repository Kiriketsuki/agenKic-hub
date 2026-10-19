# Bounded fix loop (Step 7 detail)


This step runs in a **fresh context window** after the user runs `/context-resume`
following a council-fix handoff. The handoff points to a `council-fix-manifest.json`
file that contains all fix details.

#### 7.1 -- Load Manifest

1. Read the `council-fix-manifest.json` file referenced in the handoff.
2. Read the recommendation file for full context on each finding.
3. Confirm the branch matches: `git branch --show-current` must match `manifest.branch`.
   If not, ask the user before switching.
4. If `manifest.test_command` is `null`, ask the user: "What command runs your tests?"

#### 7.2 -- Plan Presentation

Enter plan mode. Present a fix plan covering ALL fixes from the manifest:

```
# Council Fix Loop -- [motion summary]

## Fixes ([N] total)
1. [Fix 1 description] -- [file:line] -- [severity]
2. [Fix 2 description] -- [file:line] -- [severity]
...

## Approach
For each fix:
  a. Generate a regression test that FAILS on current code (proves the bug)
  b. Apply the fix
  c. Confirm the test PASSES (proves the fix)
  d. Max 3 attempts per fix -- escalate to human if still red

## Parallelization
[Which fixes touch independent files and can be done in parallel]

## Test Command
[manifest.test_command]
```

Wait for user approval before proceeding.

#### 7.3 -- Fix Iteration

Process each fix sequentially (or parallel where files are independent):

```
FOR each fix in manifest.fixes:

  ATTEMPT = 0
  MAX_ATTEMPTS = 3

  -- Phase A: Red (prove the bug exists)
  1. Read the cited file at the cited line (verify citation is still valid)
     - If file/line no longer matches: SKIP fix, report "citation stale"
  2. Write a targeted regression test that asserts the CORRECT behavior
     (which should FAIL against current buggy code)
  3. Run: [test_command] -k [test_name] (or equivalent targeted run)
  4. If test PASSES (unexpected green):
     - The bug may already be fixed, or the test is wrong
     - Report: "Test passed on current code -- fix may be unnecessary or test is incorrect"
     - SKIP this fix, move to next

  -- Phase B: Green (apply fix, confirm it works)
  5. Apply the code fix
  6. Run: [test_command] -k [test_name]
  7. If test PASSES: mark fix as DONE, move to next fix
  8. If test FAILS:
     ATTEMPT += 1
     If ATTEMPT < MAX_ATTEMPTS:
       - Read the test output, diagnose, adjust the fix
       - Go to step 5
     If ATTEMPT >= MAX_ATTEMPTS:
       - Revert the fix: git checkout -- [file]
       - Mark fix as ESCALATED
       - Report: "Fix [N] failed after 3 attempts -- needs human review"
       - Continue to next fix
```

#### 7.4 -- Simplify Pass

After you process all fixes and before running the full suite:

1. Run `/simplify` on all files changed by the fix loop
   (`git diff --name-only` against the pre-fix-loop HEAD).
2. If `/simplify` produces changes, stage them as part of the fix commit.
3. If `/simplify` finds no issues, proceed directly to 7.5.

This catches duplicate logic, dead code, and overly defensive patterns
introduced by mechanical fix application.

#### 7.5 -- Full Suite Verification & Auto-Commit

After you process and simplify all fixes:

1. Run the full test suite: `[test_command]`
2. If all green:
   - Commit all changes: `fix: apply council fixes for [motion-slug]`
   - Push to remote: `git push`
   - Report: "All tests green. Committed and pushed."
3. If any failures:
   - Report which tests failed and whether they are related to the fixes
   - Do NOT re-council. Escalate to user:
     ```
     Full suite: [X] passed, [Y] failed
     Failures related to fixes: [list or "none"]
     Pre-existing failures: [list or "none"]

     How would you like to proceed?
     ```
   - Do NOT auto-commit on failure. Wait for user direction.

#### 7.6 -- Fix Report

After the loop completes (whether all green or partially escalated), write a
fix report to the same directory as the manifest:

```markdown
# Council Fix Report -- [motion summary]

> Recommendation: [path to recommendation file]
> Branch: [branch]
> Date: [ISO 8601]

## Results

| # | Fix | File:Line | Test | Attempts | Status |
|---|-----|-----------|------|----------|--------|
| 1 | [desc] | [file:line] | [test name] | [1-3] | DONE / ESCALATED / SKIPPED |

## Summary
- Fixed: [N] / [total]
- Escalated: [N] (need human review)
- Skipped: [N] (stale citation or already fixed)

## Full Suite
- Result: [PASS / FAIL]
- [If FAIL: list failing tests]

## Escalated Fixes (human review needed)
[For each ESCALATED fix:]
- Fix [N]: [description]
  - Last error: [test output excerpt]
  - Attempts: [what was tried]
```

#### 7.7 -- Constraints

- **3-attempt ceiling per fix** -- prevents runaway token burn on edge cases
- **No re-council** -- if fixes fail, escalate to human. A full council is too expensive
  for verification when targeted tests already prove correctness
- **Red-first mandatory** -- if the regression test passes before you apply the fix,
  the test is suspect. Skip it. Do not proceed with a potentially wrong test
- **Revert on failure** -- if you cannot make a fix green in 3 attempts, revert to avoid
  leaving the codebase in a broken state
- **Never force-push or amend** -- all fixes are new commits

