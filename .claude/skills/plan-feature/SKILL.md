---
name: plan-feature
description: Plans a new feature with the user before building it: settles the design choices, writes a checklisted plan page in the KB, has a complex plan reviewed, gets it approved, then builds from it. Use at the start of a session opened for a new feature, or when the user says "plan this feature", "make a plan for X" or "let's design X".
argument-hint: "[feature name or brief]"
---

# Plan a feature

Every feature is planned the same way and judged "complete" by the same checklist, so the plan, not the chat, is what the build follows. A new session with no chat history must be able to build from the plan page alone.

Run this in the main session, as a dialogue: subagents can't ask the user questions, so they only read and review here. If the session is in plan mode, hold the dialogue there and write files only after the user approves leaving it.

## 1. Check that it needs a plan
A feature needs a plan when it adds or changes what the product or workflow does and needs a design choice the user hasn't made yet. A bug fix, a small tweak or a follow-up to current work doesn't: tell the user and do it without this skill.

## 2. Read before asking
1. Read the KB index, the pages it points to for the feature's area, the conventions page and the active decisions in that area. When the index names no page, use the KB search (maintain-kb, Search).
2. Find the code the feature touches with plain search. When that means reading more than 5 files, give the reading to Explore subagents and ask for paths, line numbers and conclusions, not file contents.
3. Note what already exists that the feature must reuse (the project's one way to do each job), so no step adds a second way.

## 3. Settle every design choice with the user
1. List each choice the feature needs: anything where two builders could reasonably build it differently.
2. For each, give 2–3 options with strengths and tradeoffs and your recommendation, based on your own research rather than the user's first idea. Put all the questions in one chat message, numbered, each a few short lines, so the user can answer them in one reply ("all recommended", "2B, rest recommended").
3. Wait. Build nothing and write no plan until the user says their questions are done.
4. Record each settled choice as a decision with maintain-kb Update, with the options not picked as rejected. When a choice changes an active decision, maintain-kb supersedes it, and the plan's cleanup step lists every usage of the old decision to migrate (golden rule 1).

## 4. Write the plan page
1. Read `.claude/skills/plan-feature/references/checklist.md`: it defines what each section must contain.
2. Copy `.claude/skills/plan-feature/assets/plan.md` to `docs/kb/plans/<feature>.md`, with `<feature>` in kebab-case, and fill every section. Keep a conditional section (work split, data migration, risks and spikes) only when its checklist condition holds: move it out of the comment and delete the rest of the comment.
3. Link the page from the feature's line on the KB status page (`[plan](plans/<feature>.md)`), adding the line if there is none, and finish maintain-kb Update for the session (log, index).

## 5. Check the plan
1. Run `python3 .claude/skills/plan-feature/scripts/check_plan.py docs/kb/plans/<feature>.md` and fix every error. The KB check runs the same checks on every plan page.
2. Walk the checklist yourself, item by item, and fix what fails.

## 6. Review a complex plan in a fresh context
A fresh review costs a subagent run, so it runs only where a builder is likely to hit what the chat explained but the page doesn't.
1. Run it when any of these holds: the plan has a work split, a data migration, or risks and spikes; it has more than 5 steps; it brings in a tool, library or service the project doesn't use yet; it changes an area the KB doesn't describe; or the user asks for it. Otherwise skip to step 7 and say in the summary that the review was skipped and why.
2. Run the review-plan agent, giving it the plan page's path. It reads only the plan, the checklist and the KB.
3. Fix every gap it lists. Take every question it raises that only the user can answer back to step 3.
4. If the fixes changed the steps, the decisions or the work split, run the review once more. After two reviews, list any findings still open to the user instead of running a third.

## 7. Get the user's approval
1. Run the check script again; it must pass.
2. Send the user a short summary: the goal, the done criteria, one line per step, the work split if any, the decisions it rests on, and the review findings you fixed or left open (or why the review was skipped). Ask them to approve.
3. Only on the user's approval in chat, set `Status: approved <today>` on the page and commit. If they ask for changes, go back to step 3 or 4. A plan with a work split then goes to its own PR right away (section 1 of the reference in step 8.1), because the parts' sessions read it from the default branch.

## 8. Build from the plan
1. **Work split:** follow `.claude/skills/plan-feature/references/work-split.md`: this session builds part A, starts a session for each other part, tracks them and merges them in the table's order on the user's word.
2. Build the steps in order. For each step, write its tests as the verify skill says, and tick its box (`[x]`) in the same commit as the step.
3. If a step turns out to need a design choice the plan doesn't settle, stop building it. Settle the choice with the user (step 3), update the plan, and get the user's approval of the change before you go on.

## 9. Finish
With a work split, first run section 5, Finish, of `.claude/skills/plan-feature/references/work-split.md`.
1. When every step and done criterion is ticked, and every part of a work split is merged, set `Status: done <today>`.
2. Archive the page with `git mv` the way maintain-kb's rule on archiving says, and update the feature's line on the KB status page to the present.
3. Run the checks on the KB conventions page, then audit-project and merge-branch, as the project's rules say for a finished feature.
