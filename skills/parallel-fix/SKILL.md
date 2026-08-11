---
name: parallel-fix
description: >
  Spawns parallel agents in isolated worktrees to fix bugs using competing strategies
  (minimal patch, refactor, rewrite). Each agent runs the test suite independently.
  The winning fix is the smallest passing diff. Chains from council-supervisor via
  --from-council. Triggers: "parallel fix", "race fix", "/parallel-fix".
---

## Context

When a bug or failing test is identified -- either directly by the user or from a
council-result.json -- this skill spawns 3 agents in isolated git worktrees. Each
agent takes a different fix strategy, implements it, and runs the test suite. The
orchestrator compares results and presents the winning approach.

This eliminates the single-agent guess-and-iterate loop. Three strategies race in
parallel; the best one wins.

## Triggers

- "parallel fix [test/bug description]"
- "race fix this"
- `/parallel-fix [OPTIONS]`
- Automatically invoked by `/council-supervisor --chain-fix`

## Options

```
--test "test command"         Test command to validate fixes (default: auto-detect)
--file path                   File(s) to focus on (can be repeated)
--from-council path           Read findings from council-result.json
--strategies N                Number of parallel strategies (default: 3, max: 5)
--timeout 300                 Seconds before killing a slow agent (default: 300)
```

## Workflow

### Step 1 -- Intake

**Direct invocation**: The user describes the bug or failing test.
1. Read the failing test file and relevant source files
2. Run the test to confirm it fails and capture the error output
3. Identify the files in scope for fixing

**From council** (`--from-council`):
1. Read `council-result.json`
2. Extract all findings with `verification: "verified"` or `verification: "unverified"`
3. Group findings by file -- each file group becomes a fix target
4. For each finding, note the description, file, line, and recommended fix

Report: "Intake complete. [N] fix targets across [M] files. Strategies: [3]."

### Step 2 -- Auto-detect Test Command

If `--test` was not provided, detect the test framework:

| Indicator | Test Command |
|:---|:---|
| `package.json` with `jest` | `npx jest --bail` |
| `package.json` with `vitest` | `npx vitest run` |
| `go.mod` | `go test ./... -count=1` |
| `pytest.ini` or `pyproject.toml` [tool.pytest] | `python -m pytest -x` |
| `Cargo.toml` | `cargo test` |
| `Makefile` with `test` target | `make test` |

If no test framework is detected, ask the user: "No test framework detected. What
command should I use to validate fixes?"

### Step 3 -- Define Strategies

For each fix target, define 3 (or N) strategies:

| Strategy | Agent Name | Approach | Branch |
|:---|:---|:---|:---|
| Minimal Patch | `fix-minimal` | Smallest possible change to make tests pass. Change only the lines that are broken. No refactoring, no cleanup. | `fix-attempt-1` |
| Targeted Refactor | `fix-refactor` | Fix the root cause properly. May restructure the immediate code area, rename for clarity, add guard clauses. Stay within the affected function/module. | `fix-attempt-2` |
| Fresh Rewrite | `fix-rewrite` | Rewrite the affected function(s) from scratch based on the test expectations. Ignore the current implementation -- write what the tests require. | `fix-attempt-3` |

For council-sourced findings with multiple fix targets, each agent handles ALL
findings in their strategy -- not one finding per agent.

### Step 4 -- Spawn Agents in Worktrees

For each strategy, spawn an agent using the Agent tool with `isolation: "worktree"`:

```
Agent:
  subagent_type: general-purpose
  model: sonnet
  name: [AGENT_NAME]
  isolation: worktree
  prompt: |
    You are [STRATEGY_NAME], a fix agent. Your goal: make all tests pass using the
    [APPROACH] strategy.

    ## Bug / Findings
    [DESCRIPTION -- from user input or council-result.json findings]

    ## Files in Scope
    [List of files with line numbers]

    ## Test Command
    [TEST_COMMAND]

    ## Strategy: [APPROACH]
    [STRATEGY_DESCRIPTION]

    ## Instructions
    1. Read all files in scope to understand the current state
    2. Implement your fix using your assigned strategy
    3. Run the test command: `[TEST_COMMAND]`
    4. If tests pass: report SUCCESS with the list of files you changed
    5. If tests fail: iterate up to 3 times. After 3 failures, report FAILED
       with the last error output
    6. Do NOT change test files unless they contain a clear bug (wrong assertion)
    7. Do NOT make changes outside the files in scope unless necessary for compilation

    ## Output Format (final message)
    ```
    STATUS: SUCCESS|FAILED
    STRATEGY: [strategy name]
    FILES_CHANGED: [comma-separated list]
    ITERATIONS: [1-3]
    TEST_OUTPUT: [last test run output, truncated to 50 lines]
    DIFF_SUMMARY: [one-line description of what changed]
    ```
```

Spawn all agents in a single message (parallel launch).

### Step 5 -- Collect Results

Wait for all agents to complete (or timeout). For each agent:

1. Check the returned result for STATUS line
2. If the agent used a worktree and made changes, note the worktree path and branch
3. Parse FILES_CHANGED and ITERATIONS

Build a comparison table:

```
| Strategy | Status | Files Changed | Iterations | Diff Size |
|:---|:---|:---|:---|:---|
| Minimal Patch | SUCCESS | 1 | 1 | +3 -1 |
| Targeted Refactor | SUCCESS | 2 | 2 | +15 -8 |
| Fresh Rewrite | FAILED | 1 | 3 | +42 -30 |
```

### Step 6 -- Select Winner

Scoring criteria (in priority order):

1. **Tests pass** (mandatory -- failed strategies are eliminated)
2. **Smallest diff** (fewer lines changed = less risk)
3. **Fewest files changed** (smaller blast radius)
4. **Fewest iterations** (cleaner first-try solutions preferred)

If multiple strategies pass with identical diff size, prefer: minimal > refactor > rewrite.

If NO strategy passes:
1. Synthesize learnings from all three attempts:
   - What each strategy tried
   - Where each one failed
   - Common failure points across strategies
2. Spawn a 4th "synthesis" agent that receives all three agents' approaches and errors:
   ```
   Three fix strategies were attempted and all failed. Here is what each tried
   and where it broke:
   [Agent 1 approach + error]
   [Agent 2 approach + error]
   [Agent 3 approach + error]
   Synthesize these learnings into a fix that avoids all three failure modes.
   ```
3. If the synthesis agent also fails, report to the user:
   "All fix strategies failed. Manual intervention needed."
   Include the error output from the most promising attempt.

### Step 7 -- Apply Winner

1. Read the winning agent's diff from its worktree branch
2. Present the diff to the user with explanation:
   ```
   Winning strategy: [name] ([iterations] iteration(s), [diff size] lines changed)

   Why this won:
   - [reason -- e.g., "smallest diff that passes all tests"]

   Why others lost:
   - [Strategy 2]: [reason -- e.g., "tests passed but 3x larger diff"]
   - [Strategy 3]: [reason -- e.g., "failed after 3 iterations -- TypeError at line 42"]

   Diff:
   [full diff output]
   ```

3. Ask: "Apply this fix? (y/n)" -- unless `--from-council` was used with `--chain-fix`,
   in which case apply automatically.

4. If approved:
   - Cherry-pick or apply the changes from the worktree branch to the current branch
   - Run the test suite one final time to confirm
   - Report: "Fix applied. All tests passing."

### Step 8 -- Update council-result.json (if from council)

If this was invoked from a council result, update the findings:

```json
{
  "id": 1,
  "fix_applied": true,
  "fix_strategy": "minimal",
  "fix_branch": "fix-attempt-1",
  "fix_diff_size": "+3 -1",
  "fix_iterations": 1
}
```

Write the updated result back to the same path.

## Chaining from Council

When invoked via `/council-supervisor --chain-fix`:

1. Read `.council/council-result.json`
2. Filter to verified/unverified findings only (skip phantom/skipped)
3. Group by file for efficient fixing
4. Run the full parallel fix workflow
5. Update the council result with fix status
6. Report: "Council findings remediated. [N/M] findings fixed. [K] need manual review."

## Edge Cases

- **No test command and no framework detected**: Ask the user. Do not guess.
- **Tests already pass**: Report "Tests already pass -- no fix needed." Skip.
- **Worktree creation fails**: Fall back to branch-based isolation (create branch,
  stash current changes, fix on branch, restore). Less isolated but functional.
- **Agent timeout**: Kill the agent after `--timeout` seconds. Mark as FAILED with
  reason "timeout". Do not wait for it.
- **Flaky tests**: If a test passes on retry but failed initially, flag it:
  "Warning: test [name] appears flaky (passed on iteration 2 but failed on iteration 1).
  Fix may mask an intermittent issue."
- **Large number of findings**: If council result has >10 findings, batch them into
  groups of 3-5 per parallel-fix invocation to avoid overwhelming agents.
