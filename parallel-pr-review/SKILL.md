---
name: parallel-pr-review
description: Use when asked to review a pull request, perform a code review, or when the user invokes /review-pr or /parallel-review. Dispatches 5 domain-specialized agents in parallel, synthesizes findings by cross-referencing agreement (confidence boosting) and resolving conflicts, then posts a master review to GitHub.
---

# Parallel PR Review

## Overview

Dispatch 5 domain-specialized review agents in parallel against a PR, then synthesize their findings into a high-confidence master review. Findings that multiple agents agree on get elevated confidence; conflicts get resolved explicitly; unique findings are preserved if credible.

**Core principle:** Independent agents reviewing the same code from different angles act as an ensemble — agreement raises confidence, disagreement surfaces ambiguity.

## When to Use

- User asks to review a PR (`/review-pr`, `/parallel-review`, "review PR #N")
- User wants high-confidence code review (more thorough than a single agent)
- PR spans multiple domains (infrastructure + frontend + tests + docs)

## The Pattern

### Step 1: Get PR Context

```bash
gh pr view <N> --json number,title,body,headRefName,baseRefName,files,additions,deletions
gh pr diff <N> | head -200   # skim to understand domains
```

### Step 2: Divide into 5 Domain Agents

Choose domains based on what the PR actually touches. Default split:

| Agent | Domain | Typical Files |
|-------|--------|---------------|
| 1 | Security & Infrastructure | Docker, CI/CD, auth configs, env files |
| 2 | Core Logic / Primary Language | Main feature code, business logic |
| 3 | Tests | Unit, integration, E2E specs, test config |
| 4 | Documentation & Scripts | README, docs, shell scripts, tooling |
| 5 | Config & Dependencies | package.json, lock files, build config, CI |

**Adapt domains to the PR.** If there's no Docker, replace with API layer, or database, etc.

### Step 3: Dispatch All 5 in Parallel

Each agent prompt must include:
- **Exact scope** — which files to `gh pr diff <N> -- <files...>`
- **Domain-specific review criteria** — what to look for in this domain
- **Relevant codebase context** — architecture decisions from CLAUDE.md
- **Output format** — CRITICAL / MAJOR / MINOR / POSITIVE sections

```markdown
You are reviewing PR #<N>. Your domain is <DOMAIN>.

Run: gh pr diff <N> -- <file1> <file2> ...
Also read: <key files>

Context: <relevant architecture facts from CLAUDE.md>

Review focus:
1. <domain-specific concern 1>
2. <domain-specific concern 2>
...

Return structured review:
- CRITICAL issues (correctness, security, data loss)
- MAJOR issues (reliability, performance, missing coverage)
- MINOR issues (style, documentation)
- POSITIVE observations
Cite file:line for each finding.
```

Launch all 5 with `run_in_background: true`.

### Step 4: Synthesize — Confidence Weighting

When all agents return, build the master review:

```
for each finding across all 5 agents:
  if N≥3 agents agree → CONSENSUS (high confidence, escalate severity)
  if N=2 agents agree → CORROBORATED (include, note agreement)
  if N=1 agent only  → UNIQUE (include if specific and credible; flag if speculative)
  if agents conflict  → CONFLICT (present both views, explain resolution)
```

**Conflict resolution rules:**
- Domain expert wins over generalist (e.g., security agent on auth config)
- More specific claim wins over vague claim (with evidence)
- If irresolvable, include both views and flag for human judgment

### Step 5: Build Master Review Comment

Structure for GitHub:

```markdown
## Code Review — PR #<N>: <Title>

> Reviewed by 5 specialized agents across: Security, Core Logic, Tests, Docs, Config.
> Agreement across agents = higher confidence. Conflicts noted explicitly.

---

### 🔴 Critical
<!-- consensus or single-agent critical findings -->

### 🟠 Major
<!-- corroborated or high-credibility unique findings -->

### 🟡 Minor
<!-- style, docs, low-risk issues -->

### ✅ Strengths
<!-- positive observations -->

---

### ⚖️ Conflicts Resolved
<!-- any findings where agents disagreed — explain resolution -->

### 🔍 Agent Coverage
| Agent | Domain | Issues Found |
|-------|--------|-------------|
| 1 | Security | ... |
| 2 | Core Logic | ... |
| 3 | Tests | ... |
| 4 | Docs | ... |
| 5 | Config | ... |
```

### Step 6: Post to GitHub

```bash
gh pr comment <N> --body "$(cat <<'EOF'
<master review>
EOF
)"
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Same domain split for every PR | Adapt domains to what the PR actually touches |
| Ignoring unique agent findings | Include if specific + credible, even if only 1 agent found it |
| Treating conflict as error | Conflicts reveal genuine ambiguity — resolve and document |
| Generic agent prompts | Each agent needs domain-specific review criteria to be useful |
| Skipping codebase context | Agents without CLAUDE.md context make irrelevant suggestions |

## Real-World Impact

- 5 parallel agents finish in roughly the same time as 1 sequential agent
- Cross-domain consensus catches issues a single reviewer misses (e.g., a test agent and security agent both flagging the same hardcoded credential)
- Conflicts between agents surface design trade-offs for human decision
