---
name: verify
description: Runs the project's committed tests at the right tier, writes the tests a change needs, and sets up testing. Use before saying a change is done or committing it, when a feature is finished, when the user says "test this", "verify" or "set up tests", and when asked to look at the running app.
---

# Verify a change

Committed tests are the "done" gate: they give the same answer on every run and stay for the next session and for CI. Each tier is one command that runs headless with no prompts, so every run, and CI for the fast checks, gives the same answer.

## 1. Find the project's checks
1. Read the Checks entry on the KB conventions page. It names the commands: the fast checks and how to run one end-to-end spec.
2. The fast checks are the project's one check command, as `.claude/skills/merge-branch/references/setup-github.md` step 2 defines it. CI runs it on every PR.
3. If the project has no tests or no Checks entry, read `.claude/skills/verify/references/setup.md` and set testing up before going on.

## 2. Write the tests the change needs
Write them before running anything, in the project's existing test style (golden rule 1).
- **New or changed behaviour:** add or update a test at the lowest level that can catch it breaking (unit before integration before end-to-end). Example: a price-rounding rule gets a unit test, not a browser test.
- **A change to a user flow** (a screen, an endpoint, a CLI command a user runs): add or update the end-to-end spec for that flow. Specs are one file per flow, named after it, so the next change can find them.
- **Bug fix:** first write a test that reproduces the bug and watch it fail, then fix the code and watch it pass. A test that never failed hasn't proven it catches the bug.
- **Docs-only or comment-only change:** no new test.

## 3. Run the tier the moment calls for
| When | Run |
|---|---|
| Every change, before saying it is done, and before a commit | The fast checks (the one check command). No end-to-end tests. |
| A feature is finished (before the PR that finishes it) | The fast checks, plus the end-to-end specs (and screenshot tests, if the project has them) for the flows this feature added or changed, on every browser engine or device the project targets, and any slow check the Checks entry moved to a feature's end. Never the whole project's end-to-end suite. |
| A change outside a feature (a bug fix, a tweak) added or changed an end-to-end spec | That one spec, once, before its commit, so it is known to pass. |

Rules for every run:
- Use the quietest reporter that still names each failure (for example `--reporter=line`, `-q`). Read the full output only for a failure, so passing runs cost almost no tokens.
- Never delete, skip or loosen a failing test, or update a screenshot baseline, to get a green run. If the test is wrong, say why and ask the user first. The test may be the only thing that knows the intended behaviour.
- A test that fails, passes on a re-run and fails again is flaky: report it to the user with the spec name. Never add retries or sleeps to hide it.
- A failure the change didn't cause (it fails on the main branch too): tell the user, and don't fix it inside this change unless they say so.

## 4. Look at the running app only when the user asks
Never start a look on your own: each costs thousands of tokens and leaves nothing behind. When the user asks, read `.claude/skills/verify/references/look.md`.

## 5. Report
Report the evidence, never just "tests pass": each command run, the tier, the pass and fail counts, any test added and the behaviour it covers, and anything not run and why (for example, no simulator on this machine).
