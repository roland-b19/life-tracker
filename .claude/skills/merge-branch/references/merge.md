# Part B: merge the PR

Steps 1–4 are in the merge-branch skill. `<target>`, `<main>`, `<branch>` and the main folder are as its step 1 found them.

## 5. Merge
1. Run step 3, "Bring the branch up to date", again; it stops at its first item when the target hasn't moved. If it committed anything, run step 4, "Push and open the PR" (push and wait for green CI), before going on. If it needed a conflict resolved by hand, show the user what was resolved (each file, with a line on how) and ask again before merging: their word to merge covered the change they saw, not the resolution.
2. Run `gh pr merge <number> --merge --match-head-commit "$(git rev-parse HEAD)"`. Merge commits only: they keep the branch's commit hashes.
3. If GitHub refuses because the branch is behind, go back to step 5.1. If it refuses because checks are pending or failing, go back to the CI wait in "Push and open the PR" (step 4.3). Any other refusal: report it to the user.

## 6. Update local main
1. If this session is in the main folder, run `git switch <main>` there.
2. Run `git fetch origin`. All worktrees share one set of refs, so this one fetch serves them all. Don't prune yet: step 7 needs the branch's remote-tracking ref.
3. Move local `<main>` to `<target>`, by a fast-forward only:
   - **The main folder has `<main>` checked out:** run `git -C <main folder> merge --ff-only <target>`. If local changes there would be overwritten, someone is writing in the main folder (the user, or another session): stop and tell the user which files block the update; don't touch them.
   - **It is on another branch** (its session is working on a change): run `git fetch . <target>:<main>`, a local fetch with no network round trip.

## 7. Clean up
Golden rule 2: the branch and its worktree are dead once merged. Remove the local branch with the tool that made it, so that tool's own records stay right:
- **Branch made in the main folder (step 1.3):** `git branch -d <branch>`.
- **Worktree entered with EnterWorktree:** call ExitWorktree with `remove`. It deletes the folder and the branch.
- **Desktop app session:** run `git checkout --detach` in the branch folder, then `git -C <main folder> branch -d <branch>`. Tell the user the session can be archived now; archiving removes its worktree. Skip that line when the session still has work after this merge.
- **`claude --worktree` session in the terminal:** detach and delete the branch as above. Tell the user to choose remove when Claude asks about the worktree on exit.

`git branch -d` accepts a branch merged into its upstream (the remote-tracking ref, still there because step 6 didn't prune) or into the HEAD where it runs. Never use `-D` to get past a refusal without the user's OK: it means some work may be lost.

Then run `git fetch --prune origin`, which drops the branch's remote-tracking ref; GitHub deleted the branch itself on merge (a repo setting, `.claude/skills/merge-branch/references/setup-github.md` step 6).

## 8. Verify and report
1. `git -C <main folder> rev-parse <main> <target>` prints the same commit twice.
2. `git branch --list <branch>` prints nothing, and `git worktree list` no longer lists the branch folder, unless removal waits on the user.

Report in 2–4 lines: the PR link and its merge commit, conflicts resolved and how, and any cleanup left to the user.
