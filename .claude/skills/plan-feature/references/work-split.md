# Running a work split

Read this when an approved plan has a work split. This session, the one that planned the feature, starts a session for each part, tracks the parts, merges them in order on the user's word, and finishes the feature. Each part is a session of its own, in its own worktree, with its own PR. A session can ask the user questions, and each PR gets its own review and CI run. Subagents only read, review or build pieces inside a part.

Names used below:
- `<feature>` is the plan page's file name without `.md`.
- A part's slug is `<feature>-<part letter in lower case>`, for example `export-csv-b`. Every branch of a part carries its slug, which is how `python3 .claude/skills/plan-feature/scripts/parts_status.py docs/kb/plans/<feature>.md` finds the part (called "the status script" below).
- `<prefix>` is this session's branch prefix: the part of its branch name up to and including the last `/`, such as `claude/`. It is empty when the name has no `/`.

## 1. Plan first
New worktrees start from the default branch, so a part's session can read the plan only once the plan is merged.
1. Before anything else, note `<prefix>` from `git branch --show-current`. The cleanup in the next step removes the branch.
2. Run merge-branch on the approved plan: the plan page, its decisions and the KB status line. Tell the user that the parts start once they merge this PR.
3. After the merge, run section 2, Start.
4. Then build part A in this session, ticking its steps on the plan page as usual. Use a new branch named with its slug: `git switch -c <prefix><feature>-a <target>` in this session's folder. If merge-branch's cleanup removed the folder, use EnterWorktree with name `<feature>-a` instead.
5. When a part stops on a design choice the plan doesn't settle, settle it with the user (SKILL.md step 3). Change the plan page on this session's current branch. If this session has no branch, make a new `<prefix><feature>-plan` branch with its own PR. Then tell the part to go on, quoting the user's approval and the change. Parts start from the default branch, so until that branch merges, quote the change in the brief of every part that starts too.

## 2. Start
1. Run the status script. Its `start:` line lists the parts that can start now: their needed parts are merged, and they have no branch and no PR.
2. For each listed part other than A, fill `.claude/skills/plan-feature/assets/brief.md`: the plan page's path, the part's letter, steps and `Owns` cell, and its slug. Add, quoted, any plan change not yet on the default branch (section 1, item 5). Keep its first line, `Owns: ...`, unchanged: the guard hook refuses a brief without it.
3. **When the host has a `start_session` tool (the Claude desktop app):** call it once per part. Use:
   - `context: fresh` and `use_worktree: true`;
   - `branch_name` and `name` both set to the slug;
   - the filled brief as `prompt`;
   - the plan's goal and its decisions in a few lines as `background`.
4. **Without it (the terminal):** print each filled brief. Below it, print the command `claude --worktree <slug>` for the user to run, then tell them to paste the brief as the first message.
5. A part whose needed parts aren't merged yet does not start. When it starts after they merge, it begins from a default branch that already holds what it builds on.

## 3. Track
1. Run the status script whenever a part's session reports back or the user asks where things stand.
2. Trust the PR, not the message. Count a part as done only when the script shows its PR open with CI pass.
3. When a part asks a question only the user can answer, pass it on to the user. Then pass the user's answer back, quoted.
4. After each report, start the parts that became ready (section 2).

## 4. Merge
Parts merge strictly in the work split's order. Each session merges its own PR, so each one updates its own branch and cleans it up.
1. When the user says "merge" here, run the status script. Note the numbers of the PRs open now: the word covers only those PRs.
2. Take the part on the `merge next:` line:
   - For part A, run merge-branch's part B here.
   - For any other part, forward the user's words, quoted, to that part's session with SendMessage.
3. Wait until the status script shows that part merged, then take the next one.
4. Stop the run and tell the user when the next part:
   - has no open PR;
   - has CI other than pass;
   - has a PR that isn't among the noted numbers;
   - or its session asks again after resolving a conflict by hand.
5. Without SendMessage (the terminal), tell the user which session to say "merge" in next, and run the status script again when they come back.
6. A session in another permission mode may hold the forwarded message until its user approves it. When a part stays unmerged, say so to the user.

## 5. Finish
1. Start when the status script prints `all parts merged: finish the feature`.
2. Update local main the way merge-branch's step 6 does.
3. Cut `<prefix><feature>-finish` from the target. Use `git switch -c` in this session's folder, or EnterWorktree with name `<feature>-finish` if the folder was removed.
4. Tick the other parts' steps on the plan page. Check each part's merged PR first.
5. Tick the done criteria that now hold.
6. Go on with SKILL.md step 9.1.
