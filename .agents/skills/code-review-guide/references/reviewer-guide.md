# Reviewer guide: how to review a change

## When to read this

Read this when you must REVIEW someone else's change (pull request, patch, diff, branch), or self-review before asking others. It covers the approval standard, review order, what to check, speed, comment style, pushback and emergencies. For lean-ness ("is every line needed") apply `ponytail-review` if the project has it; for security requirements use the `secure-development` references (input-api-files.md, identity-access.md, platform-data-ops.md, privacy-by-design.md, supply-chain-and-ci.md) instead of re-deriving them here. If the project has a UI design skill, apply it to every UI change.

## 1. The standard: when to approve

The purpose of review is that the overall code health of the system improves over time, without blocking progress.

- [ ] Approve once the change definitely improves overall code health, even if it is not perfect. There is no perfect code, only better code; seek continuous improvement, not polish.
- [ ] Do not approve a change that worsens code health (more complexity, less test coverage, more confusion). Small decreases add up; the only exception is an emergency (section 8).
- [ ] You may reject a change that adds a feature the system should not have, even if the code is good.
- [ ] Facts and data overrule opinion and personal preference.
- [ ] Style: the project's style guide (and its automated formatter/linter) is the authority. A style point not in the guide is preference: label it `Nit` and never block on it. If no style exists, accept the author's. Where nothing else applies, ask for consistency with the surrounding code, if that does not worsen code health.
- [ ] Design is almost never pure preference. Judge it on design principles. If the author shows (with data or sound principles) that several options are equally valid, accept the author's choice.
- [ ] Mentoring comments are fine; if purely educational and not required by the standard, mark them non-mandatory.
- [ ] Your approval means "this meets our standard". Spend enough time that you can mean it.
- [ ] Verify that the task's goals are met. Concerns about adjacent code outside the scope of the change go into a separate task (bug, debt item); do not block this change on them.

## 2. Order of review

1. **Intent and description.** Does the change make sense, and does the description say why? Do all parts belong together, or are unrelated changes mixed in? If the change should not exist at all, say so immediately, courteously, and suggest what to do instead (do not make people finish work that will be thrown away).
2. **Broadest design first.** Find the "main" file(s) (most logical change) and review them first. If you see major design problems, send those comments now, even before reading the rest: the author may be building on top of the change, and big rework takes longest. Do not spend time on details that will disappear.
3. **The rest, in a logical sequence.** Reading the tests first can show what the change is meant to do. If the change is too large to find the main part, ask the author where to start or to split it.
4. **Every line you were asked to review**, plus context: open the whole file (or check the branch out in an IDE) when the diff hides surrounding code. You can run the change when it helps understanding; it matters most for user-facing behaviour.
- [ ] Understand what every line does. Generated code and large data files may be skimmed; hand-written code may not.
- [ ] If you cannot understand code, say so and wait for clarification; if you can't follow it, future readers can't either. The usual fix is simpler code, not an explanation in the review thread.
- [ ] If you are not qualified for a part (security, concurrency, privacy, accessibility, internationalisation), make sure a qualified reviewer is on the change.
- [ ] If you review only part of a change (certain files or aspects), say which parts in a comment. If you approve relying on others for the rest, say that explicitly.
- [ ] Do not review hastily, and not too long in one sitting; take a break between reviews and take those you know best first.

## 3. What to look for (checklist)

- [ ] **Design.** Do the pieces interact sensibly? Does the change belong in this codebase (or in a library)? Does it follow existing architecture and patterns and integrate with the rest of the system? Is now the right time for it?
- [ ] **Functionality.** Does it do what the author intended, and is that good for its users (end users and future developers)? Think about edge cases, think like a user, look for bugs visible by reading. Check error handling: errors handled gracefully and explicitly where necessary.
- [ ] **User-facing behaviour.** For UI or other visible changes, see it working (demo, screenshot/recording, or run it) rather than inferring from code.
- [ ] **Concurrency and parallelism.** Read that logic carefully for races and deadlocks; these are hard to find by running code. Prefer designs that avoid the possibility.
- [ ] **System effect.** Negative effects elsewhere? Redundant calls (for example extra database round trips)? Sensitive or personal data logged or exposed? (details: `secure-development`)
- [ ] **Complexity.** Is any line, function or class hard to understand quickly, or likely to cause bugs when changed? Single responsibility; a function with more than 3 arguments is potentially too complex (playbook heuristic). Be especially strict on over-engineering: generic or future-proof code, unused functionality. Solve the problem known now, not a speculated one.
- [ ] **Tests.** Appropriate unit/integration/end-to-end tests are in the same change as the code (not "next PR"; only an emergency excuses this). Check the tests themselves: would they fail if the code broke? Could they give false positives? Simple, useful assertions; edge cases covered; tests are code that must be maintained, so do not accept complexity in them.
- [ ] **Naming.** Names long enough to say what the thing is or does, short enough to read.
- [ ] **Comments.** Clear, necessary, and explaining why, not what. If code needs a what-comment, simplify the code (exceptions: regexes, complex algorithms). Stale TODOs or advice comments made obsolete by the change should be removed. Comments differ from documentation of modules/functions (purpose, usage, behaviour).
- [ ] **Style.** Follows the style guide; no large reformatting mixed with functional changes (ask for a separate change, otherwise the diff, merges and rollbacks become hard).
- [ ] **Consistency.** Style guide wins over existing inconsistent code. When it only recommends, judge between the guide and the surroundings; bias to the guide unless the local inconsistency would confuse. Encourage a bug/TODO for cleaning old code.
- [ ] **Documentation.** If the change alters how people build, test, use or release the software, README/docs/reference are updated. If it deletes or deprecates code, remove the docs for it too.
- [ ] **Context.** Is the system as a whole more complex, less tested, harder to understand after this change?
- [ ] **Good things.** Note what is well done, especially when the author fixed your earlier comment well.
- [ ] **Team checklist.** Apply any per-language common-error checklist the team keeps. Let linters and formatters handle what they can; human attention goes to design, logic and tests.

## 4. Speed

- [ ] If not in the middle of focused work, review soon after the request arrives. One business day is the maximum time to respond (first thing the next morning). A typical change should get several review rounds within one day.
- [ ] If you are in the middle of focused work (writing code), do not interrupt yourself; respond at the next natural break.
- [ ] Response time matters more than total process time. Fast individual responses remove most complaints about a "strict" process. If you cannot review fully now, reply with when you will, suggest another reviewer, or give initial broad comments.
- [ ] Time zones: reply while the author is still working; if they have already left, finish before they start next day.
- [ ] Do not trade quality for imagined speed. Strict, fast, consistent reviews make later reviews faster as authors learn what is required.
- [ ] Large change: ask the author to split it into smaller changes that build on each other. If it truly cannot be split and you lack time, still send comments on overall design so the author is unblocked.

**Approve with comments** (approve while leaving unresolved comments) when at least one holds, and say which:
- you trust the author to address all remaining comments;
- the comments need no action;
- the suggestions are minor (sort imports, fix a nearby typo, apply a suggested fix, remove an unused dependency).
Especially useful across time zones, to avoid a one-day wait for a plain approval.

## 5. How to write comments

- [ ] Be kind and respectful. Comment on the code, never the person. Avoid "you"; prefer "this line", "we". Assume positive intent. Bad: "Why did you use threads here?" Good: "The concurrency adds complexity without a performance benefit I can see, so single-threaded is simpler."
- [ ] Explain why: the principle, risk or benefit (an example helps). Not always required, but do it when a comment may be contentious.
- [ ] Point at the problem and let the author choose the fix; the author owns fixing the change, you are not required to design the solution. Give direct instructions or code when that is clearly more helpful. Balance: pointing out problems teaches and often gives a better solution; explicit direction is faster.
- [ ] Be suggestive, not prescriptive. Ask questions rather than assert; there may be a good reason. Prefer a short specific question over "this is incomprehensible".
- [ ] Say whether a remark is fact, best practice, or personal preference.
- [ ] Label severity so required changes are distinct from suggestions. Google's examples: `Nit:` (minor; technically should fix, little impact), `Optional:` / `Consider:` (good idea, not required), `FYI:` (no action needed in this change, interesting for later). Prefix polish points with `Nit:` (playbook).
- [ ] Praise good things, with the reason.
- [ ] If you asked for an explanation, the answer should be clearer code (or a why-comment in the code), not an explanation that lives only in the review thread.
- [ ] Where the tool supports it, use suggestion blocks or a patch to the author's branch for small fixes.
- [ ] Do not hold long discussions of subjective style in the change; take them to another forum.
- [ ] Candidate convention (verified on conventionalcomments.org, 2026-11-02): `<label> [(decorations)]: <subject>` then optional discussion. Labels: praise, nitpick, suggestion, issue, todo, question, thought, chore, note, typo, polish, quibble. Decorations: `non-blocking`, `blocking`, `if-minor`; others (for example `security`, `test`) are illustrative. Nitpicks, thoughts and notes are non-blocking. Use only if the project adopts it; otherwise use the Google labels above. Keep the set small and agreed.

## 6. Handling pushback

- [ ] First check whether the author is right; they are often closer to the code. If their argument makes sense for code health, say so and drop it.
- [ ] If not, explain again why, showing you understood their reply and adding new information. Stay polite; say you hear them even if you disagree. Keep advocating when the improvement justifies the work: code health improves in small steps.
- [ ] "I'll clean it up later" usually never happens. If the change adds complexity, require the cleanup now (except in an emergency). If it only exposes pre-existing problems that cannot be fixed now, the author files a tracked item assigned to themselves and optionally adds a TODO referencing it.
- [ ] Unresolved after a few back-and-forth comments: talk synchronously (call or in person), then record the outcome and reasons in the change. Still stuck: escalate (team discussion, tech lead, code maintainer, manager). Never let a change sit because of a disagreement.

## 7. Inclusive review (Microsoft playbook, brief)

- [ ] Spread review assignments across the whole team; do not review only certain people's work, and do not rubber-stamp a senior's large change or leave a junior's unreviewed. Big changes invite this bias, another reason to ask for small ones.
- [ ] Use inclusive tone: suggest, do not prescribe; give clear, elaborated comments. Complimenting good work next to a suggestion helps newcomers.
- [ ] Remember culture and communication style differ across regions and teams; assume positive intent from both sides.
- [ ] Anyone, including newcomers, can find valuable things. Study the change, check corner cases, ask a specific question when unsure, and say when you learned something.
- [ ] Authors may thank reviewers when a review improved the code.
- [ ] Pair or mob authors: someone outside the pair reviews; for a mob, a member who spent the least time at the keyboard.
- [ ] Review is "code-focused feedback", a PR is "ready to merge": give early feedback in synchronous reviews (pairing, over-the-shoulder, draft) so the PR itself holds few surprises.
- [ ] Candidate tools (examples only): review extensions in the editor/IDE for the forge in use; blind/anonymous review tools to reduce bias; branch protection or required-reviewer policies to enforce that reviews happen.

## 8. Emergencies

An emergency is a **small** change that lets a major launch continue instead of rolling back, fixes a bug significantly affecting production users, handles a pressing legal issue, or closes a major security hole.
- [ ] Review only for speed and correctness (does it actually resolve the emergency?). It takes priority over all other reviews.
- [ ] After the emergency, review it again thoroughly (design, tests, docs, cleanup).
- [ ] Not an emergency: wanting to ship this week rather than next; author has worked long on it; reviewers are asleep or away; Friday afternoon; a manager's soft deadline; a rollback of a change that breaks tests or the build.
- [ ] Hard deadline = something disastrous happens if missed (contract, market failure, once-a-year hardware shipment). A one-week delay usually is not. If "must get in" changes keep arriving at the end of a release cycle, fix the process so large changes land early.

## 9. Reviewer output format

(note: this format is this skill's own, not from the sources.) Use it when reporting a review (unless the project has a template):

```
Summary: <approve | approve with comments | changes requested> - <one sentence: what the change does and overall judgement>
Blocking issues:
  1. <file:line> <what is wrong, why it matters, direction for a fix>
Non-blocking suggestions:
  - Nit/Optional/FYI: <file:line> <comment>
Questions:
  - <what I could not tell from the change>
Good:
  - <specific thing done well>
Not reviewed / not verified:
  - <files or aspects skipped, tests not run, behaviour not seen, areas needing another reviewer>
```
- [ ] Every blocking issue has a concrete case and a reason; if you cannot state one, it is a question or a suggestion.
- [ ] Always state what you did NOT review or run; never imply full coverage.

## Sources

- Google Engineering Practices, code review guide: `review/reviewer/{standard,navigate,looking-for,speed,comments,pushback}.md`, `review/emergencies.md` (commit 3bb3ec2, 2024-09-18; CC BY 3.0; https://google.github.io/eng-practices/review/). Their "CL" is rendered here as "change".
- Microsoft Code-With Engineering Playbook: `docs/code-reviews/{README,faq,tools,inclusion-in-code-review}.md`, `process-guidance/reviewer-guidance.md` (commit 016770e, 2025-09-26; CC BY 4.0; https://github.com/microsoft/code-with-engineering-playbook). Only language-neutral points; Azure DevOps tool specifics omitted.
- Conventional Comments (labels/decorations verified on the web 2026-11-02): https://conventionalcomments.org. Candidate convention, not a source of this guide's rules.
- Rewritten in own words with attribution as required by the licences. Nothing found outdated.
