---
name: review-change
description: Reviews a finished change at the depth its risk tier needs, fixes or lists every finding with its proof and confidence, and writes the pull request body. Use before opening or updating a pull request (merge-branch runs it), when the user says "review this change" or "review the branch", and after a merge that needed conflicts resolved by hand.
---

# Review a change

A script, not the author, sets how much review a change gets, so a risky change can't be talked down. Every finding ends up in a table the user can scan on a phone: what it is, where, how sure the review is, the proof, and what was done about it.

## 1. Set the tier
1. Commit the work, so the review reads what will be merged.
2. Run `git fetch origin`, then `python3 .claude/skills/review-change/scripts/risk_tier.py`. Line 1 is the tier (Low, Medium or High); the other lines are the paths that decided it. Keep the whole output for the PR body's Risk section.
3. If it exits 1, review at High and use its error message as the reason: a failure must never lower the review. If the error is a missing "Risk tiers" entry, tell the user the KB conventions page needs one (maintain-kb's conventions template has it).

## 2. Review
- **Low** (docs, KB and tests only): no AI review. Go to step 4 and fill the proof table from the tests and checks you ran.
- **Medium:** run `/simplify`, commit its changes, then `/code-review medium <merge-base>..HEAD`.
- **High:** run `/simplify`, commit its changes, then `/code-review high <merge-base>..HEAD` and `/security-review`.

`<merge-base>` is `git merge-base origin/HEAD HEAD` (or the target the merge step uses). `/security-review` compares with origin's default branch and takes no range; with no `origin` remote it can't run: add a findings row saying so and tell the user.

## 3. Tag, prove, fix or list
For every finding, give it:
- **Where:** `file:line`.
- **Tag:**
  - Important: a bug on lines this change added or changed. Always fixed.
  - Pre-existing: a bug on lines this change did not touch. Listed, never blocks (fixing it grows the change past its scope).
  - Nit: anything else (style, naming, small cleanups). Fix at most 5 small Nits per round, in the changed files only; a small Nit is a change of a few lines in one place. List the rest with the reason "cap".
- **Confidence and proof:**
  - High: a test that fails without the fix and passes with it, or a command's output, shows it. Name the test or command.
  - Medium: confirmed by reading the code, with no test. Name what you read.
  - Low: plausible, not confirmed. Before fixing it, write a test that shows it (it becomes High); if no test can show it, list it and don't fix it.
- **Outcome:** "fixed in <commit>", or why it isn't fixed.

When you fix a finding, search the whole change for the same pattern and fix every instance: a fix covers the class of bug, not one line. Commit the round's fixes before the next round, so each round reviews a known commit.

## 4. Rounds
1. Round 1 reviews the whole change (step 2).
2. Run another round only when the last round fixed Important findings. It reviews only the fixes: `/code-review <level> <last reviewed commit>..HEAD`. Run `/security-review` again only when a security finding was fixed.
3. Never report again a finding already in the table.
4. At most 3 rounds. If round 3 still has Important findings, stop and ask the user to reconsider the approach: repeated fixes that keep breaking point to a design problem, not a review problem.
5. Run `risk_tier.py` again. If fixes moved the tier up, run the higher tier's missing reviews as a new round.

## 5. Write the PR body
1. Copy `.claude/skills/merge-branch/assets/pr-body.md` to `.pr-body.md` in the worktree's top folder (`git rev-parse --show-toplevel`; git ignores it) and fill every `<...>`:
   - Testing: each command you ran and its exact result.
   - Risk: `Tier: <tier>` and the tier script's reason lines (or its error, at High).
   - Review: one proof-table row per part of the change, then one findings-table row per finding (or "No findings."), then the rounds run.
2. Print the file's absolute path; merge-branch passes it to `gh pr create --body-file` and `gh pr edit --body-file`. A hook checks the body (every section filled, no `<...>` left outside backticks, a proof table, a tier not below the computed one) and accepts a Bash command that names the PR command only as that one plain command, optionally after `cd <absolute path> &&`; its docstring has the full rule. So put other text that mentions it, such as a commit message, in a file (`git commit -F <file>`).

## 6. Learning loop
1. Name the kind of each Important finding from this list, so the same kind is spelled the same way every time: input not checked, error not handled, path or quoting, wrong logic or condition, concurrency or ordering, resource not released, security, missing test, other (with a short label).
2. Add the line `Review: Important — <kinds, or none>` to this change's entry in the KB log. If the entry doesn't exist yet, create it in maintain-kb's log format; merge-branch's KB update extends it.
3. Search the KB log for the same kind names. When a kind appears in an earlier entry too, or a bug reached the default branch, fix it where it would have been caught (a lint rule, a test, a convention or a skill) and name that check in the log line. A finding that comes back is a missing check.

## 7. Verify before reporting
- Every finding in the table has where, tag, confidence, proof and outcome, and every Important finding is fixed or the user was asked (round 3).
- The tier in the body is the tier `risk_tier.py` prints now (or High after its error).
- `python3 .claude/skills/review-change/scripts/review_hook.py` accepts the body: write `{"tool_name": "Bash", "cwd": "<top folder>", "tool_input": {"command": "gh pr create --body-file <absolute path>"}}` to a scratch file with the Write tool, run the script with that file as its stdin (`< <file>`), and expect exit 0. Typed into the Bash command, the JSON would name the PR command, and the hook would refuse it.
