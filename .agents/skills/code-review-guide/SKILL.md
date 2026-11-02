---
name: code-review-guide
description: Code review practice for humans and AI agents, distilled from Google Engineering Practices, the Microsoft Code-With Engineering Playbook and the OWASP Code Review Guide. Use whenever you review a change, diff, pull request or commit, prepare a change for review (size, description, self-review), respond to review comments, review code written by an AI agent, review a change for security, or when the user says "review", "code review", "PR", "pull request", "check my changes", "is this ready to merge", "LGTM". Stack-neutral. Complements the ponytail-review (is every line needed) and secure-development (security requirements) skills.
---

# Code review guide

Agent-neutral and project-neutral. Lives in `.agents/skills/code-review-guide/`. Rewritten (not copied) from public sources; each reference ends with a `Sources` line (commit, licence). Project-specific rules (branch policy, required checks, style guide) belong in the project's own docs, and they win over this skill.

## Roles: pick one first

| You are... | Read |
|---|---|
| Reviewing a change (diff, PR, commit, a teammate's or your own earlier work) | `references/reviewer-guide.md`; then `references/security-review.md` if the change touches auth, input, data, dependencies, infra or CI |
| Preparing a change for review, or answering review comments | `references/author-guide.md`; description template in `templates/pull-request.md` |
| Reviewing code an AI agent wrote | `references/reviewer-guide.md` + `references/reviewing-agent-written-code.md` |
| Whole-repo audit rather than a change | Not this skill: use `ponytail-audit` |

## Procedure (reviewer)

1. Read the description and the intent before the code. If the intent is unclear, ask before reviewing details.
2. Review the design first, then the main files, then the rest. Read every line you are asked to review.
3. Run or read the tests. A review without checking the tests is incomplete; say so if you could not run them.
4. Check each item in `reviewer-guide.md` section 3, plus the other skills that apply:
   - security-relevant change: `security-review.md` and the `secure-development` references it names;
   - lean-ness (is every line needed, simpler option): `ponytail-review`;
   - UI change: the project's UI design skill, if it has one.
5. Approve when the change improves overall code health, even if it is not how you would write it. Block only on real problems, and label everything else (nit / optional / question).
6. Finish with the output format from `reviewer-guide.md`, including what you did **not** review or verify.

## Non-negotiables

- Say what you did not check. Never write "looks good" for code you did not read or tests you did not run.
- Every blocking comment names the problem, why it matters, and a direction; no bare "fix this".
- Feedback is about the code, not the author. Facts and project rules beat personal preference.
- Never approve a change that disables, skips or weakens a test, scanner or security check to pass CI unless the user explicitly decided that.
- A suspected leaked secret is escalated at once (rotate it; deleting the commit is not enough).
- Do not mix unrelated changes: ask for the diff to be split instead of reviewing a bundle.

## Refreshing the references

Re-check about once a year:

| Source | Where |
|---|---|
| Google Engineering Practices (CC BY 3.0) | https://github.com/google/eng-practices (`review/`) |
| Microsoft Code-With Engineering Playbook (CC BY 4.0) | https://github.com/microsoft/code-with-engineering-playbook (`docs/code-reviews/`) |
| OWASP Code Review Guide (CC BY-SA 4.0) | https://github.com/OWASP/www-project-code-review-guide |
| OWASP Cheat Sheets (CC BY-SA 4.0) | https://github.com/OWASP/CheatSheetSeries |

Diff the sources against the references, rewrite changed points in your own words, keep exact numbers, mark non-source statements `(note)`, update the `Sources` lines. Never paste source text wholesale.
