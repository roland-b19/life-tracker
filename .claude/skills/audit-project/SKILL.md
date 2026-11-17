---
name: audit-project
description: Audits the project for dead code, competing patterns, deprecated leftovers and knowledge-base drift, then cleans up what the user approves. Use when a feature or roadmap stage is finished, before building the knowledge base for an existing codebase, or when the user says "audit the project" or "find dead code".
---

# Audit the project

The goal is a codebase where every agent finds one way to do each thing and nothing dead to copy from. This is what keeps quality the same from one agent to the next.

## 1. Pick the mode and scope
- **Milestone audit** (a feature or roadmap stage is finished, or the user asks): audit what changed since the last audit. Find the last `Audit clean at <commit>` line in `docs/kb/log/` and run `git diff --stat <commit>..HEAD`. If there's no such line, audit the whole repo.
- **Initial cleanup** (the workflow is being set up in an existing codebase): audit the whole repo, except `.claude/skills/` and `.claude/agents/`, which the install just copied from the workflow's repo. The cleanup comes first, and the knowledge base is built from the clean result.

## 2. Find the problems
For more than 5 files, give the scan to Explore subagents (one per area), so file dumps stay out of this context. Ask each for findings with file paths and evidence, not file contents. Look for:
- **Dead:** unused code, files, exports, dependencies, config and feature flags, commented-out code, and TODOs for work that's done or dropped.
- **Dead branches and worktrees:** after `git fetch --prune`, branches already merged into the remote's default branch (`git branch --merged origin/<main branch>`, leaving out the main branch itself), worktrees whose branch is merged or gone (`git worktree list`), and stale worktree entries (`git worktree prune --dry-run`). A branch or worktree with unmerged work goes on the ask list, never the remove list. Remove an approved branch or worktree with the tool that made it, as the "Clean up" step of `.claude/skills/merge-branch/references/merge.md` says. If `git branch -d` refuses a branch that `--merged origin/<main branch>` listed (its upstream is pruned and the HEAD here is another branch), `git branch -D` is safe for that branch, and the user's approval of the plan is the OK.
- **Competing patterns:** two or more ways of doing the same job, such as data access, error handling, logging, state, API calls, tests, naming or folder layout.
- **Deprecated leftovers:** usages of patterns marked deprecated on the KB conventions page. Check that the list of remaining usages in status is still accurate.
- **Convention drift:** code that doesn't follow the KB conventions page.
- **KB drift** (milestone audit only; an initial cleanup has no KB yet): run the maintain-kb check script and include its errors and warnings.

Use the project's own linters and type checker. In a milestone audit, also run its dead-code tool if it has one: `.claude/skills/audit-project/references/dead-code.md` names one free tool per stack, how to run it and its usual false positives. A dead-code tool is optional, runs only here and never in the check command, and its hits are suspects for step 3, not proof.

## 3. Prove unused
Before calling anything dead, search for every kind of reference, not only imports: string-based lookups, reflection and dependency injection, config files, routes, templates, build and CI scripts, and public APIs that outside callers use. Anything you can't prove unused goes on an **ask** list instead of the remove list.

## 4. Present the plan and wait for approval
Group the findings:
- **Remove:** proven unused, with the evidence.
- **Unify:** each set of competing patterns, the one way you propose and why, and whether the migration fits in one change. If it doesn't, propose a tracked migration (golden rule 1).
- **Ask:** suspected dead code, plus any choice between patterns that needs the user's judgment.

Change nothing until the user approves. They may approve part of the plan.

## 5. Apply safely
1. Run the checks on the KB conventions page before starting (in an initial cleanup, which has no KB yet: the project's existing tests and linters), so you know which failures already existed.
2. Before restructuring an area that has no tests, add tests that capture its current behaviour.
3. Apply one group at a time, and run the checks after each.

## 6. Record
1. Commit the cleanup.
2. Record the agreed patterns and tracked migrations through maintain-kb Update. Its log entry gets the line `Audit clean at <short hash>`, so the next audit knows where to start: the hash of the cleanup commit from item 1 (a commit can't contain its own hash), or of the audited commit when nothing changed. Commit the KB changes. Merge commits keep the hash valid on main. In an initial cleanup the KB doesn't exist yet: continue with the maintain-kb init instead, which records all this in the new KB.
3. Open the PR with merge-branch part A (golden rule 4). An initial cleanup goes in the workflow setup's pull request instead.

## 7. Verify and report
Re-run the checks and the scans from step 2 on the changed areas. Report in 3–5 lines: what was removed, what was unified, what's tracked as a migration and what's still on the ask list.
