---
name: summon-reviewers
description: Use when asked to review code, a PR, staged changes, working tree, or a commit range. Triggers: "Summon reviewers", "Review this PR", "Review my changes", "Review staged changes", "Review these files".
---

## Context
Dispatches 5 parallel sub-agents to review code from distinct angles, collates their findings with confidence scoring, validates low-confidence findings via 2 additional arbitration agents, purges hallucinations, and saves the final synthesized review to a persistent file in the current working directory. For PR modes, it additionally offers to post the review as a GitHub PR comment after user confirmation.

## Triggers
- "Summon reviewers", "Review this PR", "Run parallel PR review"
- "Review PR [number]", "Review my changes"
- "Review staged changes", "Review these files", "Review working tree"

## Prerequisites
- **PR and ref modes only**: `gh` CLI installed and authenticated. Run `gh api user --jq '.login'` to confirm the active account. If the wrong account is active, invoke the `gh-auth-switch` skill before continuing.

## Workflow

### Step 1 -- Context Detection

Determine `input_mode` from the user's request:

| Mode | Description |
|:---|:---|
| `pr` | User provided an explicit PR number |
| `refs` | User provided base + head branch refs |
| `sha_range` | User provided a commit SHA range in `base..head` format |
| `staged` | Review staged changes (`git diff --cached`) |
| `working_tree` | Review unstaged working tree changes (`git diff`) |
| `files` | Review specific files against HEAD |

**If the user's intent is unambiguous** (e.g., "Review PR 42", "Review staged changes"), set `input_mode` directly and skip the menu.

**If the intent is ambiguous**: present this menu and wait for the user to choose:

```text
No specific review target detected. What would you like to review?
  (a) PR by number
  (b) Branch-to-branch diff (base ref + head ref)
  (c) Commit SHA range (base..head)
  (d) Staged changes (git diff --cached)
  (e) Working tree changes (git diff)
  (f) Specific files against HEAD
```

Accept the user's choice and collect any needed input (PR number, refs, SHA range, file paths).

**Validation per mode:**
- `refs`: both base and head must be provided and distinct. If only one is given, ask for the other. If they are identical, abort: "Base and head refs are the same. Nothing to diff."
- `sha_range`: If the input contains `...` (three dots), reject: "Three-dot ranges are not supported. Use `base..head` format." Otherwise, must contain `..`. Split on `..` to extract `base` and `head`. If the format does not contain `..`, reject and ask the user to re-enter in `base..head` format.
- `files`: at least one file path must be provided.

---

**Steps 1.1 -- 1.3 apply only for `pr` mode.**

#### Step 1.1 -- Repository Resolution
Run `gh repo view --json owner,name` to resolve the `{owner}/{repo}` slug. Store as `repo_slug`. If the command fails, print the error verbatim and abort.

#### Step 1.2 -- Permission Check
Run: `gh api repos/{repo_slug} --jq '.permissions.push'`
- `permissions.push` is used as a proxy for comment access; the GitHub API does not expose comment permission directly.
- If the result is not the literal string `true`, abort: "Write permission required to post PR comments. Aborting."
- If the command fails, abort with the error message.

#### Step 1.3 -- Record Auth Identity
Run `gh api user --jq '.login'` and store the printed username as `expected_gh_account`. If the command fails or returns empty output, abort: "Unable to determine active GitHub account. Run `gh auth login` and retry." This will be verified again before posting in Step 8 to guard against account switches mid-session.

**For `refs` and `sha_range` modes**: Steps 1.1 -- 1.3 are deferred to Step 8.3 if the user opts to post the review to a PR.

---

**For `pr` mode**: run `gh pr view <number> --json number,title,baseRefName,headRefName,url`. If this fails (non-zero exit), print the error verbatim and abort. Extract `number`, `title`, `base`, `head`, and `url`.

**For `refs` mode**: validate that both refs exist in the repository (`git rev-parse <ref>`). If either fails, abort with the error.

**For `sha_range` mode**: validate that both SHAs exist (`git rev-parse <sha>`). If either fails, abort with the error.

### Step 2 -- Diff Extraction & Size Guard

Extract the diff based on `input_mode`:

| Mode | Diff command |
|:---|:---|
| `pr` | `git diff <base>..<head>` |
| `refs` | `git diff <base>..<head>` |
| `sha_range` | `git diff <base>..<head>` |
| `staged` | `git diff --cached` |
| `working_tree` | `git diff` |
| `files` | `git diff HEAD -- <file1> <file2> ...` |

Run the corresponding stat command first (`--stat` flag) to count total lines changed. **If >5000 lines**: warn the user ("This diff is very large (N lines). Review quality may degrade. Continue? [y/N]"). Abort if declined.

If the diff is empty or produces no output, abort: "No changes detected. Nothing to review."

**Metadata gathering per mode:**
- `pr`: run `gh pr view <number> --json files,commits,body` for PR description and commit list.
- `refs` / `sha_range`: run `git log <base>..<head> --oneline` for commit list. No PR description available.
- `staged` / `working_tree` / `files`: run `git log -5 --oneline` for recent commit context. No PR description available.

**Do NOT store diff or metadata as shared context.** Embed the full diff text and metadata directly inside each sub-agent's Task prompt in Step 3.

#### Step 2.1 -- Secret Pre-Scan
Before dispatching sub-agents, scan the diff text for patterns that commonly indicate exposed secrets:

**All patterns must be matched case-insensitively.**

- API key patterns: `(api|secret|token|key)[\s_-]*(=|:)\s*['"]?[A-Za-z0-9+/]{20,}`
- AWS access keys: `AKIA[0-9A-Z]{16}`
- Bearer tokens: `Bearer\s+[A-Za-z0-9\-._~+/]+=*`
- Password assignments: `password\s*=\s*['"][^'"]{6,}['"]`
- Connection strings: `(postgres|mysql|mongodb|redis):\/\/[^\s'"]+`
- JWT tokens: `eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+`
- GitHub tokens: `gh[pousr]_[A-Za-z0-9]{36,}`
- SSH private key headers: `-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----`

If any pattern matches, warn the user:
```
WARNING: Potential secrets detected in diff (line N: [pattern type]). Review agents will see this content.
Continue anyway? [y/N]
```
Abort if declined. Store the matched patterns as `secret_patterns[]` for use in Step 7.1.

### Step 3 -- Parallel Dispatch (5 Sub-Agents)

Launch all 5 sub-agents simultaneously via the Task tool. Each agent's prompt must include:
1. The full diff text (pasted inline).
2. PR description and commit list (or "Not available" for non-PR modes).
3. Its specific role and focus (see table below).
4. The required output format.

**Note**: Sub-agents are launched with `subagent_type: general-purpose` and `model: sonnet`. If a sub-agent times out or returns a response containing neither `FINDING:` blocks nor the literal `NO FINDINGS`, it counts as a failed agent.

**Concrete prompt template** (adapt per agent role):

```yaml
subagent_type: general-purpose
model: sonnet
prompt: |
  You are a [ROLE] reviewer performing a focused code review.

  ## Review Metadata
  Input mode: [INPUT_MODE]
  [For PR mode: PR #[NUMBER]: [TITLE] | Base: [BASE_REF] -> Head: [HEAD_REF] | URL: [URL]]
  [For non-PR modes: Ref range or description of what was diffed]

  ## Description / Commit Context
  [PR_BODY or COMMIT_LIST or "Not available"]

  ## Diff
  [FULL_DIFF_TEXT]

  ## Your Task
  Review the diff above strictly from the [ROLE] perspective. Focus on: [FOCUS_AREAS].

  Output findings ONLY in this exact format (one block per finding). If you find nothing, output exactly the string NO FINDINGS and nothing else.

  FINDING: <short title>
  FILE: <file path, line range if applicable>
  DESCRIPTION: <clear explanation>
  SEVERITY: critical / high / medium / low / info
```

Replace `[ROLE]`, `[FOCUS_AREAS]`, `[INPUT_MODE]`, and all bracketed placeholders with values from the table below and the extracted context.

| Agent | Role | Focus |
|:---|:---|:---|
| Agent 1 -- Security | Security & Auth Review | Injection risks, secret exposure, auth bypasses, insecure defaults, dependency vulnerabilities |
| Agent 2 -- Logic | Logic & Correctness Review | Business logic errors, off-by-one errors, race conditions, incorrect assumptions, edge cases |
| Agent 3 -- Performance | Performance & Scalability Review | N+1 queries, unnecessary re-renders, blocking calls, memory leaks, inefficient algorithms |
| Agent 4 -- Maintainability | Code Quality & Maintainability Review | Dead code, naming clarity, duplication, test coverage gaps, documentation gaps |
| Agent 5 -- General | Overall Review | Holistic assessment -- architectural concerns, scope creep, adherence to project conventions, anything not caught by specialist agents |

**Quorum rule**: At least 4 of 5 agents must return a valid response (output containing `FINDING:` blocks or the literal `NO FINDINGS`). A "failed agent" is one whose output contains neither, or one that timed out. If fewer than 4 agents succeed, abort and notify the user: "Fewer than 4/5 review agents returned valid output. Aborting."

**Output validation**: After collecting all responses, reject any `FINDING:` block that is missing one or more of the four required fields (`FINDING`, `FILE`, `DESCRIPTION`, `SEVERITY`). Log a warning for each rejected block but continue.

### Step 4 -- All-Clear Short-Circuit

Short-circuit applies **only if all of the following are true**:
1. All 5 agents returned a valid response (none failed the output validation in Step 3).
2. All 5 valid responses contained the literal string `NO FINDINGS` (not just an absence of `FINDING:` blocks).

If fewer than 5 agents succeeded but quorum was met (4 valid), do NOT short-circuit -- proceed to Step 5 regardless of whether some agents returned `NO FINDINGS`.

**Low-confidence signal**: If exactly 4 valid agents returned `NO FINDINGS` and 1 agent failed validation, note this to the user: "4 valid agents returned NO FINDINGS; 1 agent failed validation. Confidence in the all-clear is reduced." Then proceed to Step 5 regardless.

If the short-circuit condition is met: skip Steps 5, 6, and 7 **except Step 7.1** (output sanitization still runs on the all-clear message). Compose the message: "All 5 specialist agents found no issues."

The review filename follows the same scheme as Step 8.1: `{YYYY-MM-DD-HHmmss}-{short_sha}-review.md` for PR/refs/sha_range modes, or `{YYYY-MM-DD-HHmmss}-{random_hex}-review.md` for staged/working_tree/files modes.

- **PR modes**: Ask: "Would you like me to post this to GitHub anyway?" If yes, proceed to Step 8 with this message as the review body. If no, save the all-clear message to the current working directory and end.
- **Non-PR modes**: Save the all-clear message to the current working directory and end.

### Step 5 -- Collation & Confidence Scoring

Collect all valid `FINDING:` blocks from all 5 agents. Deduplicate using this rule:

**Two findings are the same** if ALL of the following hold:
1. Same file path.
2. Line ranges overlap (or both have no line range).
3. Same severity level.
4. At least 50% of the words in their `FINDING:` titles overlap (case-insensitive, ignoring common stop words).

For each unique finding:
- **Canonical title**: use the title from the lowest-numbered agent (Agent 1 takes priority over Agent 2, etc.) that raised the finding.
- **Base confidence**: low (raised by 1 agent).
- **+1 confidence tier** for each additional agent that independently raised the same concern (by the dedup rule above).
- Findings raised by 3+ agents: **high confidence**
- Findings raised by 2 agents: **medium confidence**
- Findings raised by 1 agent only: **low confidence** -- flagged for arbitration

Group findings into:
- `high_confidence[]`
- `medium_confidence[]`
- `low_confidence[]` (these proceed to Step 6)

**Low-confidence cap**: If `low_confidence[]` contains more than 20 findings, warn the user: "N low-confidence findings generated. Only the first 20 will proceed to arbitration. Consider narrowing the scope." Findings 21 and beyond are retained in `overflow_low_confidence[]`. These flow directly into Step 7 under a separate sub-section titled "Not Arbitrated" within Low Confidence Findings, each labelled "(exceeded arbitration cap -- not reviewed)". They are never silently dropped.

### Step 6 -- Arbitration (2 Sub-Agents, Parallel)

Launch 2 independent arbitration sub-agents simultaneously. Each receives:
1. The `low_confidence[]` findings list (capped at 20).
2. Only the diff hunks that touch the files mentioned in those findings (not the full diff). Extract these hunks from the full diff before embedding.
3. Instructions to evaluate each finding for validity.

Each arbitration agent outputs (one block per finding):
```text
FINDING: <title matching the original exactly>
VERDICT: valid | hallucination | irrelevant
REASONING: <one sentence>
```

**Quorum rule**: At least 1 of 2 arbitration agents must return a valid response. If both fail (output missing `FINDING:` / `VERDICT:` blocks), retain all low-confidence findings as-is with the note "Arbitration unavailable".

**Cross-reference rules** (compare both arbitration agents' verdicts per finding):

| Agent A verdict | Agent B verdict | Action |
|:---|:---|:---|
| `valid` | `valid` | Promote to `medium_confidence[]` |
| `hallucination` | `hallucination` | Purge |
| `irrelevant` | `irrelevant` | Purge |
| `hallucination` | `irrelevant` | Purge (both agree it is not valid) |
| `irrelevant` | `hallucination` | Purge (both agree it is not valid) |
| `valid` | `hallucination` | Retain in `low_confidence[]` with note: "Arbitration inconclusive" |
| `valid` | `irrelevant` | Retain in `low_confidence[]` with note: "Arbitration inconclusive" |
| `hallucination` | `valid` | Retain in `low_confidence[]` with note: "Arbitration inconclusive" |
| `irrelevant` | `valid` | Retain in `low_confidence[]` with note: "Arbitration inconclusive" |

**Single-agent arbitration** (only 1 of 2 agents returned a valid response):
- If the sole arbitrator says `valid`: promote finding to `medium_confidence[]`.
- If the sole arbitrator says `hallucination` or `irrelevant`: retain in `low_confidence[]` with note: "Single-arbitrator rejection -- retained for manual review". Do NOT purge on a single rejection.

### Step 7 -- Final Synthesis

Merge `high_confidence[]`, `medium_confidence[]`, retained `low_confidence[]`, and `overflow_low_confidence[]` into a single structured review markdown.

Format:

```markdown
## Parallel Code Review

> Generated by summon-reviewers -- 5 specialist agents + 2 arbitration agents.
> Input mode: [INPUT_MODE]
> [For PR mode: PR #[NUMBER] | [URL]]
> [For non-PR modes: Ref range / staged / working tree / files]

### High Confidence Findings
- **[SEVERITY] Finding Title** (`file:line`)
  Description. *(Raised by N agents)*

### Medium Confidence Findings
- **[SEVERITY] Finding Title** (`file:line`)
  Description. *(Raised by N agents)*

### Low Confidence Findings
- **[SEVERITY] Finding Title** (`file:line`)
  Description. *(Arbitration inconclusive)*

#### Not Arbitrated
- **[SEVERITY] Finding Title** (`file:line`)
  Description. *(exceeded arbitration cap -- not reviewed)*

### Summary
Overall assessment in 2-3 sentences.
```

Omit any section heading if that tier has no findings. `#### Not Arbitrated` is emitted when `overflow_low_confidence[]` is non-empty, even if the main Low Confidence tier is empty.

#### Step 7.1 -- Output Sanitization

Before finalizing, scan the composed review markdown for credential-like patterns (same patterns as Step 2.1, plus any patterns stored in `secret_patterns[]`). Replace any match with `[REDACTED]`. Warn the user: "N credential patterns were redacted from the review output." This step runs unconditionally.

### Step 8 -- Persistent Output & Optional GitHub Post

#### Step 8.1 -- Determine Filename

Construct the review filename:
- **PR / refs / sha_range modes**: `{YYYY-MM-DD-HHmmss}-{short_sha}-review.md` where `short_sha` is the first 7 characters of the head commit SHA (`git rev-parse --short HEAD` or `git rev-parse --short <head>`).
- **staged / working_tree / files modes**: `{YYYY-MM-DD-HHmmss}-{random_hex}-review.md` where `random_hex` is 8 random hex characters (generate with `openssl rand -hex 4`).

Full path: `{filename}` (the agent's current working directory).

#### Step 8.2 -- Save Review File

Write the full review markdown directly to `{filename}` in the current working directory. This is a persistent file -- do NOT use `mktemp` or any temp directory. The file persists regardless of whether a GitHub comment is posted.

Print the full review markdown to the user and confirm: "Review saved to `{filename}`."

#### Step 8.3 -- GitHub Post (mode-dependent)

**PR mode**:
1. Ask: "Post this review to PR #N on GitHub? [y/N]"
2. If the user declines: end the skill. The file at `{filename}` is retained.
3. If the user confirms:
   a. Run `gh api user --jq '.login'` and verify the returned username matches `expected_gh_account` (recorded in Step 1.3). If they do not match or the command fails, abort posting: "GitHub auth mismatch. Active account differs from session start. Run the gh-auth-switch skill to switch accounts, then retry." The review file is retained regardless.
   b. Run: `gh pr comment <number> --body-file "{filename}"`
   c. If the command succeeded: confirm success and print the PR URL.
   d. If the command failed: print the error, inform the user that the review was not posted. The file at `{filename}` is retained for manual posting.

**refs / sha_range mode with no associated PR**:
1. Ask: "Do you have a PR number to post this to? If yes, provide it. If no, the review is already saved locally. [PR number or N]"
2. If the user declines: end the skill. File is already saved.
3. If the user provides a PR number, execute the following steps (these were deferred from Step 1.1--1.3):
   a. Run `gh api user --jq '.login'` to capture the current account as `expected_gh_account`. If the command fails or returns empty output, abort posting: "Unable to determine active GitHub account. Run `gh auth login` and retry." The review file is retained.
   b. Run `gh repo view --json owner,name` to resolve `repo_slug`. If it fails, abort posting with the error. The review file is retained.
   c. Run `gh api repos/{repo_slug} --jq '.permissions.push'`. If the result is not `true` or the command fails, abort: "Write permission required to post PR comments." The review file is retained.
   d. Run `gh pr view <number> --json number,url` to validate the PR exists in this repo. If it fails, abort with the error.
   e. Run `gh api user --jq '.login'` and verify the returned username matches `expected_gh_account` (captured in sub-step a). If they do not match or the command fails, abort posting: "GitHub auth mismatch. Active account differs from session start. Run the gh-auth-switch skill to switch accounts, then retry." The review file is retained.
   f. Run: `gh pr comment <number> --body-file "{filename}"`
   g. If the command succeeded: confirm success and print the PR URL.
   h. If the command failed: print the error, inform the user the review was not posted. The file at `{filename}` is retained for manual posting.

**staged / working_tree / files modes**:
1. Review file has already been saved. No GitHub posting is offered.
2. Inform the user: "Review saved to `{filename}`. No GitHub posting is available for non-PR reviews."

## Guidelines
- Never fabricate findings. If an agent has nothing to report for its domain, it outputs `NO FINDINGS`.
- Respect the Emoji Mandate: no emojis in generated review comments or review files.
- Do not post partial reviews. Only post after all agents and arbitration have completed and the user has confirmed.
- Severity definitions: `critical` = exploitable / data loss risk; `high` = likely bug or security gap; `medium` = code smell or risk under specific conditions; `low` = style or minor concern; `info` = observation only.
- If the diff is empty or there are no file changes, abort and notify the user.
- **Quorum failure**: If the specialist quorum fails (<4/5 valid), abort entirely. If the arbitration quorum fails (0/2 valid), retain low-confidence findings as-is and note "Arbitration unavailable" in the review.
- **Secret scanning**: mandatory on every run. Step 2.1 pre-scan and Step 7.1 output sanitization both run unconditionally. Never skip secret scanning.
- **Review file persistence**: The review file is always saved to the current working directory before any GitHub posting attempt. The file is never deleted after posting. No temp files are used.
- **Non-PR modes**: staged, working_tree, and files modes go through the same 5-agent + 2-arbitration pipeline as PR modes. The only differences are the diff source and the absence of GitHub posting.
- **Arbitration symmetry**: Purge requires both arbitration agents to reject (as `hallucination` or `irrelevant`). A single rejection is never sufficient to purge -- use "Single-arbitrator rejection -- retained for manual review" instead.
- **No-findings policy**: If all agents returned `NO FINDINGS`, do not post to GitHub unless the user explicitly requests it. Always save the all-clear message to a review file.
