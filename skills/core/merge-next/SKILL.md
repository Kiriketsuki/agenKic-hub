---
name: merge-next
user-invocable: true
argument-hint: "[optional: next branch name]"
description: "End-of-work merge and advance skill. Commits, pushes, verifies the PR targets the correct parent branch, squash merges, then checks out the next sibling branch and rebases onto the parent. Use this skill whenever the user says \"merge and next\", \"merge-next\", \"done with this feature\", \"merge this and move on\", \"advance to next feature/task/phase\", \"ship this and pick up the next one\", \"wrap up this branch\", or after a council review cycle when the user is satisfied with the work. Also use when the user wants to merge an epic into main or a saga, or any child-to-parent merge followed by advancing to the next sibling. Covers the full hierarchy: task -> feature -> epic -> saga -> main."
---

# merge-next

Handles the complete end-of-branch workflow: commit, push, verify PR, squash merge, advance
to next sibling (or return to parent if last).

## Branch Hierarchy

This skill works at every level of the branch hierarchy:

```
main
  saga/{n}-{slug}         (merges into main)
    epic/{n}-{slug}       (merges into saga, or main if no saga)
      feature/{n}-{slug}  (merges into epic)
        task/{n}-{slug}   (merges into feature)
```

The "parent" is always one level up. The "siblings" are branches at the same level under the
same parent.

## Workflow

Execute these steps in order. Each step has a checkpoint -- if something is wrong, stop and
ask the user before continuing.

### Step 1: Assess uncommitted work

Run `git status` and `git diff --stat`. If there are uncommitted changes:

- **Spec lifecycle check**: if the branch implemented a spec that sits in `docs/specs/todo/`,
  `git mv` it to `docs/specs/done/` and include the move in the final commit (see the repo's
  `docs/specs/README.md`).

- Group changes by logical unit of work (e.g., separate a bug fix from a feature addition)
- For each group, stage the relevant files and create a commit with a conventional commit
  message that reflects what that group does
- Use the branch name and any linked issue/PR for context when writing commit messages
- If all changes belong together, a single commit is fine

If everything is already committed, skip to Step 2.

### Step 2: Push to remote

Run `git push`. If the branch has no upstream, use `git push -u origin HEAD`.

### Step 3: Find or create the PR

Check for an existing PR:
```bash
gh pr view --json number,title,baseRefName,isDraft,url 2>/dev/null
```

**If no PR exists:** Create one. Determine the parent branch (see "Parent Detection" below),
then create the PR with `gh pr create` targeting the parent as base. Use conventional commit
format for the title (e.g., `feat: Trip overview navigation`).

**If a PR exists:** Verify its base branch matches the expected parent. If it doesn't, warn
the user -- this likely means the PR was auto-created with a wrong base or the parent was
renamed. Offer to update it with `gh pr edit --base <correct-parent>`.

### Step 4: Mark PR ready and squash merge

If the PR is still a draft:
```bash
gh pr ready <number>
```

Then squash merge:
```bash
gh pr merge <number> --squash
```

The hook will ask the user to approve. Wait for approval before proceeding.

After merge, delete the remote branch if GitHub didn't auto-delete it:
```bash
git push origin --delete <branch-name>
```

### Step 5: Advance to next sibling or return to parent

Determine whether there are remaining siblings (see "Sibling Detection" below).

**If there is a next sibling:**
1. Report which sibling comes next and any others remaining
2. Check out the next sibling branch:
   ```bash
   git fetch origin
   git checkout <next-sibling-branch>
   ```
3. Rebase onto the parent to pick up the just-merged work and any other previously merged
   siblings:
   ```bash
   git rebase origin/<parent-branch>
   git push --force-with-lease
   ```
4. Report: "Checked out `<branch>`. Rebased onto `<parent>`. Ready to work."

**If this was the last sibling:**
1. Report: "That was the last child of `<parent>`. Checking out parent."
2. Check out the parent branch:
   ```bash
   git fetch origin
   git checkout <parent-branch>
   git pull
   ```
3. If the parent is itself a child (e.g., an epic under a saga), mention that the user can
   run `/merge-next` again to merge the parent upward.

## Parent Detection

Determine the parent branch using these methods in priority order:

### Method 1: PR base branch
If a PR already exists for the current branch, its base branch IS the parent:
```bash
gh pr view --json baseRefName -q '.baseRefName'
```

### Method 2: GitHub issue tracking
Extract the issue number from the branch name (the first number after the prefix slash).
Query GitHub for the parent issue:
```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        trackedInIssues(first: 1) {
          nodes { number title labels(first: 10) { nodes { name } } }
        }
      }
    }
  }
' -f owner='{owner}' -f repo='{repo}' -F number=<issue-number>
```

From the parent issue, derive the parent branch name: `{parent-prefix}/{parent-number}-{slug}`.
Verify it exists on the remote before using it.

### Method 3: Branch type hierarchy fallback
If methods 1 and 2 fail, infer from the branch type:
- `task/*` -> look for a `feature/*` or `epic/*` branch that shares the prefix
- `feature/*` -> look for an `epic/*` branch
- `epic/*` -> look for a `saga/*` branch, or default to `main`
- `saga/*` -> always `main`

### Method 4: Ask the user
If none of the above produces a confident answer, ask.

## Sibling Detection

Find branches at the same level under the same parent, ordered by issue number.

### Step A: Identify the parent issue
Use the same GitHub `trackedInIssues` query from Parent Detection.

### Step B: Find all children of that parent
Query for issues that track the parent (i.e., the parent's sub-issues):
```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        trackedBy(first: 50) {
          nodes { number title state labels(first: 5) { nodes { name } } }
        }
      }
    }
  }
' -f owner='{owner}' -f repo='{repo}' -F number=<parent-issue-number>
```

### Step C: Filter and order
- Filter to issues at the same type level (if current is `feature`, only look at `feature` siblings)
- Filter to OPEN issues (closed ones are already done)
- Sort by issue number ascending
- The "next" sibling is the one with the lowest issue number that is still open and has a
  branch on the remote

### Step D: Cross-reference with specs (optional)
If a `specs.md` or similar planning doc exists in the repo root or a `docs/` folder, check
whether it defines an explicit ordering (e.g., F2.1 before F2.2). Use this to confirm or
override the issue-number ordering.

### Step E: Present choices
If there are multiple remaining siblings, show the user a numbered list and let them pick.
If there's only one, proceed automatically. If there are none, this is the last child.

## Edge Cases

**Merge conflicts during rebase:** If the rebase onto the parent produces conflicts, stop and
report them. Do not auto-resolve -- the user needs to handle these manually or with a
dedicated conflict resolution pass.

**Branch doesn't exist on remote:** If the next sibling's branch doesn't exist on the remote
yet, report this and suggest the user create the issue/branch first (the issue-branch-handler
workflow will create it automatically when the issue is labeled).

**Multiple PRs for the same branch:** Use the most recent open one. Warn if there are multiple.

**Current branch is main/saga with no parent:** This skill doesn't apply -- inform the user
that they're already at the top level.

**Dirty working tree before rebase:** Stash changes before rebasing, then pop after. Warn the
user that stashed changes were reapplied.

## What NOT to do

- Do not merge without the user's approval (the hook enforces this, but respect the intent)
- Do not force-push to the parent branch
- Do not delete local branches without asking -- only delete remote branches post-merge
- Do not skip the rebase step -- the whole point is picking up previously merged work
- Do not create issues or branches for work that doesn't exist yet
