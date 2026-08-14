---
name: implement-spec
description: "Implement a feature from a *-spec.md file by routing tasks to optimal subagents, executing in dependency-aware parallel waves, and committing after each logical chunk. Use whenever the user says \"implement this spec\", \"implement [name]-spec.md\", \"build from spec\", \"execute the spec\", \"start implementing\", \"implement with subagents\", or references a spec file and wants it built. Also trigger when the user pastes or points to a spec and says \"go\", \"build it\", \"make it happen\", or \"let's do this\". This is the primary skill for turning any feature spec into working code through coordinated multi-agent execution."
---

# implement-spec

Turn a feature spec into working code through coordinated subagent execution.

## Context

The user has a `*-spec.md` (from `/feature-spec`, `/brainstorm`, or hand-written) and
wants it implemented. They're already on a feature branch. The spec has a Task Breakdown
table with IDs, descriptions, priorities, and dependencies.

**Spec location**: if the user names the spec without a path, look in the repo's
`docs/specs/todo/` first (the default output location of feature-spec), then the repo
root, then `docs/specs/`. **Spec lifecycle**: when implementation is complete and the
final commit/PR is made, `git mv` the spec from `docs/specs/todo/` to `docs/specs/done/`
as part of that commit (see the repo's `docs/specs/README.md`).

## Workflow

### Phase 1: Parse and Plan

1. **Read the spec file.** Extract:
   - Task Breakdown table (ID, Task, Priority, Dependencies, Status)
   - Technical Plan (affected components, data model, API contracts)
   - Acceptance Scenarios (Gherkin blocks)
   - Exit Criteria
   - Success Condition

2. **Skip completed tasks.** Any task with Status other than "pending" is already done.

3. **Check for blockers** before proceeding:
   - Unresolved Open Questions -> stop, ask the user to resolve them first
   - Missing Task Breakdown -> stop, there's nothing to execute without tasks
   - Ambiguous dependencies (circular or referencing nonexistent IDs) -> stop, clarify

4. **Route each task to a subagent type.** Read the task description and match it
   against the routing table below. The goal: match domain to specialization so a
   database task goes to `Database Optimizer`, a UI task to `Frontend Developer`, etc.

5. **Build execution waves** using topological sort on the dependency graph:
   - Wave 1: tasks with no pending dependencies
   - Wave 2: tasks whose dependencies are all in Wave 1
   - Wave N: tasks depending only on Waves 1..N-1
   - Tasks within the same wave run in parallel (worktree isolation when >1 task)
   - Waves run sequentially

6. **Detect project tooling.** Scan the working directory for:
   - `package.json` -> extract test/build/lint scripts
   - `Makefile` / `Justfile` -> extract test/build targets
   - `pyproject.toml` / `setup.py` -> pytest or similar
   - `Cargo.toml` -> `cargo test` / `cargo build`
   - `go.mod` -> `go test ./...`
   - Store these commands for post-wave verification.

7. **Present the execution plan** and wait for approval:

   ```
   ## Execution Plan: [spec name]

   ### Wave 1 (parallel)
   - T1: [task] -> Senior Developer (sonnet)
   - T3: [task] -> Frontend Developer (sonnet)

   ### Wave 2 (after Wave 1)
   - T2: [task] -> Backend Architect (sonnet)

   ### Wave 3 (after Wave 2)
   - T4: [task] -> API Tester (sonnet)

   Build: npm run build
   Test: npm test
   Commits: after each wave
   Push: at the end
   ```

   Do NOT proceed until the user approves. They may want to reorder, skip tasks,
   override agent choices, or adjust grouping.

### Phase 2: Execute

For each wave, in order:

1. **Spawn subagents** for every task in the wave.

   Each subagent receives a self-contained prompt (see Subagent Briefing below)
   with the task, context, and enough information to work independently.

   - **Multi-task wave**: use `isolation: "worktree"` on each Agent call so agents
     work on independent branches without stepping on each other.
   - **Single-task wave**: work directly on the current branch (no worktree overhead).
   - Spawn all agents in the same turn so they run concurrently.

2. **Collect results.** When all agents in the wave complete:
   - If worktree isolation was used, review each agent's changes and apply them
     back to the current branch. Resolve conflicts if any arise.
   - Run the detected test command. If tests fail, **stop** -- show the output,
     don't commit broken code, and ask the user how to proceed.
   - Run the detected build command if separate from tests. Same stop-on-failure.

3. **Commit.** Stage changes and commit with a conventional message:
   ```
   feat(<scope>): <brief summary of what this wave accomplished>

   Tasks: T1, T3
   Spec: <spec-filename>
   ```

   Grouping logic for commits within a wave:
   - Tasks modifying the same files or feature area -> one commit
   - Unrelated tasks (different modules, no shared files) -> separate commits
   - Use judgment: if T1 adds a utility and T3 imports it, that's one chunk

4. **Update the spec file.** Mark completed tasks as "done" in the Task Breakdown
   table so progress is visible in the spec itself.

5. **Track progress.** Use TaskCreate/TaskUpdate to mirror the spec's tasks, marking
   each in_progress when its wave starts and completed when committed.

6. **Brief the next wave.** Summarize what changed (files, key decisions, new exports)
   so the next wave's agents have context from prior work.

Repeat for every wave until all tasks are done.

### Phase 3: Finalize

1. **Run exit criteria.** Go through each Exit Criteria checkbox in the spec:
   - Run test suites, grep checks, build verification
   - Flag any criteria that can't be verified automatically

2. **Push.** `git push` to remote (one push at the end, not per-commit).

3. **Report.** Summarize:
   - Tasks completed and commits made
   - Exit criteria status (pass/fail/manual)
   - Anything that needs manual attention

## Agent Routing Table

Match task description keywords to the best subagent. When a task spans multiple
domains, use the primary one. When nothing matches, default to `Senior Developer`.

| Task Domain | Keywords | subagent_type | model |
|:---|:---|:---|:---|
| Backend/API | endpoint, REST, GraphQL, server, middleware, route | `Backend Architect` | sonnet |
| Frontend/UI | component, page, UI, CSS, layout, form, modal, view | `Frontend Developer` | sonnet |
| Database | migration, schema, query, index, model, table, seed | `Database Optimizer` | sonnet |
| Testing | test, spec, coverage, e2e, integration, assertion | `API Tester` | sonnet |
| DevOps/CI | pipeline, deploy, Docker, CI, infrastructure, config | `DevOps Automator` | sonnet |
| Security | auth, CSRF, XSS, validation, permission, token, RBAC | `Security Engineer` | sonnet |
| Documentation | docs, README, reference, JSDoc, tutorial | `Technical Writer` | sonnet |
| Mobile | iOS, Android, React Native, Flutter, mobile | `Mobile App Builder` | sonnet |
| Data/ML | model training, pipeline, ETL, embeddings, inference | `AI Engineer` | sonnet |
| General | feature, logic, implementation, utility, service | `Senior Developer` | sonnet |

**Model upgrades**: For tasks involving system design, cross-cutting architectural
decisions, or changes spanning 5+ files, upgrade to opus.

## Subagent Briefing Template

Each subagent gets a prompt built from these sections. Include only what's relevant
to the specific task -- don't dump the entire spec.

```
You are implementing task [ID] from [spec-name]-spec.md.

## Your Task
[Task description from the breakdown table]

## Acceptance Criteria
[Gherkin scenarios that map to this task, if any]

## Technical Context
- Affected components: [from Technical Plan]
- Data model: [relevant schema changes]
- API contracts: [relevant endpoints]
- Dependencies: [what this task depends on]

## Prior Work (from earlier waves)
[Files changed, exports added, key decisions -- so the agent understands
what's already in place and can build on it rather than duplicate it]

## Working Agreements
- Implement fully -- working code, not stubs or TODOs
- Write tests alongside implementation when feasible
- Follow existing patterns in the codebase
- Run tests before reporting done
- Report back: files changed, tests added, decisions made, blockers hit
```

Tailor the prompt to the task's scope. A documentation task doesn't need API contracts;
a test task doesn't need data model context.

## Error Recovery

| Situation | Action |
|:---|:---|
| Subagent fails or times out | Report which task failed and why. Ask: retry, skip, or abort. |
| Tests fail after wave | Show output. Don't commit. Ask user to fix or retry. |
| Merge conflict from worktree | Report conflicting files and both sides. Ask user to resolve. |
| Build fails | Same as test failure -- pause and report. |
| Circular dependency in tasks | Stop during planning. Ask user to fix the spec. |

Never silently skip a failure or commit broken code. The user decides how to proceed.

## Boundaries

This skill does NOT:
- Create or switch branches (user is already on one)
- Run `/brainstorm` or `/feature-spec` (those happen before this skill)
- Make architectural decisions not in the spec
- Deploy, release, or create PRs
- Modify tasks the user didn't approve in the execution plan
