# Findings presentation and proceed gate (Step 5 detail)


When the arbiter reports "Council complete. Recommendation saved to: [filename]":

1. **Immediately shut down the team** before presenting findings to the user:
   ```
   SendMessage type: shutdown_request
   recipient: [each agent name -- advocates, critics, questioner, arbiter]
   content: "Council concluded. Thank you."
   ```
   Do not wait for shutdown acknowledgements at this point -- fire-and-forget.
   Proceed immediately to step 2.

2. Read the recommendation file.

2.5. **[CODE motions only] Codebase Verification**: Skip this step entirely for
   GENERAL motions and if the recommendation file contains "No issues identified."
   in the Suggested Fixes section.

   **5.2.5.1 -- Extract Citations**: Parse the recommendation file for `CITE:` lines.
   Collect all citations into a list paired with their parent finding.

   Fallback regex (for non-compliant recommendations): scan the Suggested Fixes
   sections for patterns:
   - Backtick path + `line`/`L:` + number: `` `path/file.ext` L:LINE `` or `` `path/file.ext`:LINE ``
   - Colon format: `path/file.ext:LINE` (bare, no backticks)

   If you find no parseable citations after all fallback attempts, tag all findings
   "verification skipped" and proceed directly to step 3.

   **5.2.5.2 -- Spawn Verifier Agent**: Spawn a single standalone verifier agent
   (not a team member -- the team is already shut down). Use `subagent_type: diagnosis`
   and `model: [MODEL_VERIFIER]` (from Step 1.5 -- always sonnet). The `diagnosis` agent
   type reads files only and suits code investigation. That is exactly what
   verification requires.

   **Communication model**: The verifier is a standalone Agent, NOT a team member.
   It has no SendMessage. Do not use SendMessage to talk to it or ask it
   to SendMessage back. The verifier returns its results as the Agent tool's return
   value -- read the tool result directly.

   Provide the verifier with each finding and its citations. The verifier prompt MUST
   include this output instruction:

   ```
   ## Output
   You are a standalone agent. You have no SendMessage, so do not try to use it.
   Return your results as your final text output. The caller reads your response directly.
   ```

   For each citation the verifier checks:
   1. If the citation names a symbol, use rg to locate it and confirm it exists.
      Use Read with line ranges to check the claim.
   2. Attempt to read the cited file (Read tool) when needed:
      - File does not exist → verdict: `PHANTOM`
   3. If file exists, read an 11-line window centered on the cited line
      (lines LINE-5 to LINE+5, clamped to file bounds).
      - Line number is out of file range → verdict: `PHANTOM`
      - Code at the cited location matches the claim → verdict: `VERIFIED`
      - Code exists but does not match the claim → verdict: `UNVERIFIED`
   4. `CITE: RUNTIME` lines → verdict: `RUNTIME` (not file-verifiable, retain as-is)

   Verifier returns a structured verdict list as its final text output:
   ```
   Finding 1: [description]
     CITE: `src/auth/handler.py` L:142 → VERIFIED
   Finding 2: [description]
     CITE: `src/utils/empty.py` L:5 → PHANTOM
   Finding 3: [description]
     CITE: RUNTIME -- env var check → RUNTIME
   ```

   **5.2.5.3 -- Process Verdicts**:

   | Verdict | Action |
   |:---|:---|
   | All CITE lines VERIFIED | Keep finding as-is |
   | Any CITE line PHANTOM | **Purge finding** -- remove from recommendation entirely |
   | Any CITE line UNVERIFIED (file exists, claim mismatches) | **Tag finding** -- append "[UNVERIFIED -- manual review recommended]", retain |
   | CITE: RUNTIME | **Tag finding** -- append "[NOT FILE-VERIFIABLE -- runtime/external]", retain |
   | Mixed VERIFIED + UNVERIFIED | Tag with UNVERIFIED note, do not purge |

   Only PHANTOM triggers purging (deterministic: cited file/line does not exist).
   UNVERIFIED findings (file exists but claim does not match) stay for human review.

   **5.2.5.4 -- Amend Recommendation File**: Rewrite the recommendation file in place.
   - Remove purged findings from all Suggested Fixes sub-sections
   - Append tag notes to UNVERIFIED and RUNTIME findings inline
   - Append a new `### Verification Results` section at the end of the file:

   ```
   ### Verification Results
   | # | Finding | Citations | Verdict | Action |
   |---|---------|-----------|---------|--------|
   | 1 | [finding desc] | `file:line` | VERIFIED | Retained |
   | 2 | [finding desc] | `file:line` | PHANTOM | Purged |
   | 3 | [finding desc] | RUNTIME | RUNTIME | Tagged, retained |

   Verification: [X] verified, [Y] phantom (purged), [Z] unverified (retained for review)
   ```

   **5.2.5.5 -- Short-Circuit Conditions**:
   - All findings VERIFIED → append minimal note: "All findings verified against codebase."
   - All findings PHANTOM → replace Suggested Fixes content with:
     "All findings purged by verification -- no cited files/lines exist in codebase."

3. Present the **full findings** immediately. Output the entire recommendation
   file content verbatim (post-verification, amended version).

4. Always render a findings table. Only include findings that appear in the
   recommendation file -- do NOT add items here.

   **CODE motion** -- findings table:
   ```
   | # | Severity | File | Line | Finding | Suggested Fix | Status |
   |---|----------|------|------|---------|---------------|--------|
   | 1 | Bug      | src/auth/handler.py | 142 | Null check missing | Add `if user is None: return 401` | Verified |
   ```
   Severity values: `Bug`, `Security`, `Improvement`, `Style`.
   Status values: `Verified`, `Unverified`, `Runtime`, `Skipped` (verification skipped -- no citations found).
   ALL findings appear in one flat list -- there is no "follow-on" or "non-blocking" column.
   Leave purged findings out of this table entirely (document them in Verification Results section only).
   If there are no code-level findings, render one row: `| -- | -- | -- | -- | No findings identified. | -- | -- |`

   **GENERAL motion** -- action items table:
   ```
   | # | Action Item | Owner | Why It Matters |
   |---|-------------|-------|----------------|
   | 1 | [action]    | [owner or --] | [reason] |
   ```
   If there are no action items, render one row: `| -- | No action items identified. | -- | -- |`

5. Present the proceed gate appropriate to the motion type:

**CODE motion gate:**

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning from the recommendation file]

Fixes ([N] -- all applied in this PR):
  1. [Fix 1]
  ...

PR Description Amendments ([N]):
  - [Amendment 1]
  ...

[If Critical Discoveries exist:]
Critical Discoveries ([N] -- informational, not blocking):
  - [Category]: [description]
  ...

Verification: [X] verified, [Y] phantom (purged), [Z] unverified (retained for review)
[If Y > 0: Note: [Y] finding(s) cited files/lines that do not exist in the codebase and were purged.]
Full debate saved to: [filename]

Proceed? [y/N/modify]
```

If there are no fixes or amendments, the CODE gate simplifies to:

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning]

No fixes identified.
Verification: [X] verified, [Y] phantom (purged), [Z] unverified (retained for review)
Full debate saved to: [filename]

Proceed? [y/N/modify]
```

Responses (CODE):
- `y` -- write a **council-fix handoff** and invoke `/context-handoff` so the
  fix loop runs in a fresh context window. This prevents the council debate
  (which consumes significant context) from crowding out the implementation work.

  **Council-fix handoff procedure:**

  1. Write `council-fix-manifest.json` to the same directory as the recommendation file:
     ```json
     {
       "recommendation_file": "[absolute path to recommendation .md]",
       "motion": "[full motion text]",
       "arbiter_verdict": "FOR | AGAINST | CONDITIONAL",
       "branch": "[current git branch]",
       "fixes": [
         {
           "id": 1,
           "description": "[fix description]",
           "file": "[file path]",
           "line": [line number],
           "severity": "Bug | Improvement",
           "citations": ["file L:line", ...]
         }
       ],
       "pr_amendments": ["[amendment text]", ...],
       "test_command": "[detected test runner command, e.g. pytest, npm test, cargo test]",
       "created": "[ISO 8601 timestamp]"
     }
     ```

  2. Auto-detect the test command by checking for:
     - `pytest.ini` / `pyproject.toml` [tool.pytest] / `setup.cfg` [tool:pytest] → `pytest`
     - `package.json` scripts.test → `npm test`
     - `Cargo.toml` → `cargo test`
     - `Makefile` with `test` target → `make test`
     - If none found, set to `null` and flag in handoff for user input

  3. Invoke `/context-handoff` with the council-fix manifest path as the primary
     next step. The handoff's "Next Steps" section should read:
     ```
     1. Read council-fix-manifest.json at [path]
     2. Read the recommendation file for full context
     3. Enter the Bounded Fix Loop (adversarial-council skill Step 7)
     ```

  4. Report to user:
     ```
     Council complete. Fix manifest written to: [path]
     Handoff prepared. Start a new session and run `/context-resume` to begin the fix loop.
     ```

  Critical Discoveries (if any) are informational -- they are not part of the fix manifest.
- `N` -- note the result, take no further action. Inform the user:
  "Council result noted. No action taken."
- `modify` -- ask the user how they want to amend the motion.
  Once clarified, call TeamDelete on the current team, then return to Step 1
  with the updated motion and same N and roles. Step 1 creates a fresh team.

---

**GENERAL motion gate:**

```
---
Arbiter recommends: [FOR / AGAINST / CONDITIONAL]
[2-3 sentence reasoning from the recommendation file]

[If action items exist:]
Action Items ([N]):
  - [Action item]
  ...

[If Critical Discoveries exist:]
Critical Discoveries ([N] -- informational, not blocking):
  - [Category]: [description]
  ...

Full debate saved to: [filename]

Proceed? [y/N/modify]
```

Responses (GENERAL):
- `y` -- note the result. Inform the user: "Council result noted."
  If the result listed action items, ask: "Would you like to work through any of
  these action items now?"
- `N` -- note the result, take no further action. Inform the user:
  "Council result noted. No action taken."
- `modify` -- ask the user how they want to amend the motion.
  Once clarified, call TeamDelete on the current team, then return to Step 1
  with the updated motion and same N and roles. Step 1 creates a fresh team.
