---
name: merge-branch
description: Takes a finished change into the default branch through a GitHub pull request, then removes its branch and worktree. Use as soon as a change is done and its checks pass, when the user says "open a PR" or "merge this branch", or to bring in a subagent's worktree branch.
---

# Merge a branch

Every change reaches the default branch through a GitHub pull request: CI runs the project's checks on it and the user reviews the diff there. The session that made the change runs this skill, because it knows the change best. Golden rule 4 says when to commit, push, open the PR and merge. On top of it: never use `gh pr merge --admin`, and a subagent's worktree branch never gets its own PR: it is merged into this session's branch (step 1.4).

## 1. Find the branch and the target
1. Run `git worktree list --porcelain`. The first `worktree` entry is the **main folder**. Every other entry is a worktree.
2. The **target** is the remote's default branch: `git symbolic-ref --short refs/remotes/origin/HEAD` prints it, for example `origin/main`. If that fails, run `git remote set-head origin --auto` and try again. If there is no `origin` on GitHub, or `gh auth status` fails, the project isn't set up for PRs: stop, and offer the steps in `.claude/skills/merge-branch/references/setup-github.md`. Below, `<target>` is `origin/main` and `<main>` is `main`.
3. The **branch** is `git branch --show-current` in this session's folder.
   - It prints `<main>` (a session in the main folder): create the branch now, before any commit: `git switch -c claude/<short-topic>`. Uncommitted changes come with it. If `git status --porcelain` shows changes that aren't this session's, leave them to the user.
   - It prints nothing (detached HEAD): ask the user which branch the work belongs on.
4. **A subagent's worktree** (it ran with `isolation: worktree`): commit anything uncommitted in the worktree path it reported. Then, in this session's folder, run `git merge <its branch>`, `git worktree remove <its folder>` and `git branch -d <its branch>`, and go on with this session's branch.
5. `gh pr view --json number,url,state` shows this branch's PR. With no PR, part A opens one; with a merged one, the branch is done: follow `.claude/skills/merge-branch/references/merge.md` from step 6, "Update local main". With a closed one, ask the user whether to reopen it (`gh pr reopen <number>`) or leave the branch unmerged; a push doesn't reopen it.

## Part A: open or update the PR

## 2. Finish the work
1. Run the checks listed on the KB conventions page: the one check command, then `/code-review medium` on the branch. Fix what fails and each finding the review confirms. Write the PR body to `.pr-body.md` at the root of this session's folder (git ignores it), from `.claude/skills/merge-branch/assets/pr-body.md`.
2. Run the maintain-kb Update for this work if it hasn't run since the last change (golden rule 5).
3. Commit everything with a message that says what the change does and why. The commit message ends with the attribution lines the session was given. If `git status --porcelain` shows files you don't recognise as this work, ask the user before committing them.

## 3. Bring the branch up to date
The branch must already contain the target, merged locally, before the PR merges, so conflicts are resolved here and CI tests the merged result.
1. Run `git fetch origin`. If `git merge-base --is-ancestor <target> HEAD` succeeds, the branch is up to date: go to step 4.
2. **Merge the target in:** run `git merge <target>`. Merging (never rebasing) keeps the branch's history, so a pushed branch needs no force-push. Resolve each conflict by what both sides meant, never by taking one side whole:
   - **Decision pages (`docs/kb/decisions/*.md`):** keep the target's entries, then the branch's, in number order. If both sides added the same `D-NNN`, give the branch's the next free number by hand, and every reference to it.
   - **`docs/kb/status.md` and `docs/kb/INDEX.md`:** rewrite the section so it describes the state after both changes. Do this even when git merged them without a conflict: two "current state" lines that each describe one side are wrong together.
   - **Other KB pages and code:** combine both intents. When the two intents contradict each other (one side removes what the other extends, or both change one behaviour in different ways), stop and ask the user, showing both sides.

   Then run `git status`, check that no file is still unmerged, and finish with `git commit --no-edit`.
3. **Check the merged result:** run the one check command again. kb_check fails on duplicate decision numbers and leftover conflict markers, so a missed one shows up here. Fix every failure and commit. If the merge needed conflicts resolved by hand, run `/code-review medium` on `<branch's commit before the merge>..HEAD`, the range that holds the resolutions, fix what it confirms, and add its findings to the PR body's Review section.

## 4. Push and open the PR
1. Push: `git push -u origin <branch>`.
2. If the branch has no PR yet, open one: `gh pr create --base <main> --title "<what the change does>" --body-file <absolute path of .pr-body.md>`. An existing PR picks up the push by itself; when the body changed, update it with `gh pr edit <number> --body-file <absolute path of .pr-body.md>`.
3. Wait for CI. If the app running this session watches the PR's CI for you (the Claude desktop app does), leave the waiting to it. Otherwise run `gh pr checks <number> --watch --fail-fast`, in the background when CI takes more than two minutes. When a check fails, read `gh run view <run-id> --log-failed`, fix the cause, run the checks locally, commit, and go back to step 4.1.
4. Report the PR link, and the CI result once it is in. Say the PR waits for the user's review and their word to merge, or, with "Merge on green: on", go to Part B once CI is green. Post `/code-review` findings on the PR (`/code-review --comment`) only when the user asks.

## Part B: merge the PR

When the user says merge (or the KB conventions page says "Merge on green: on" and CI is green), read `.claude/skills/merge-branch/references/merge.md` and follow it.
