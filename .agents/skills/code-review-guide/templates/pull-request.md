# Pull request / change description template

Copy the block below into the PR (or commit) description. Delete sections that do not apply. If the project has a title convention (e.g. Conventional Commits `<type>[scope]: <description>`), use it on the first line. Guidance: `references/author-guide.md`.

```markdown
<imperative one-line summary of what this change does>

## What and why
<What changed, the problem, why this approach, known shortcomings. Link the work item or issue.>

## Bug reproduction and verification (bugs only)
<Environment and steps to reproduce; how a teammate can confirm it is fixed.>

## Breaking change?
- [ ] No
- [ ] Yes: <impact and migration path>

## How it was tested
<Commands run, test sets, scenarios tried, environment. Attach output or screenshots.
State what was NOT tested.>

## Notes for the reviewer
<Where to look first, risky parts, trade-offs, follow-ups tracked as separate items.>

## Self-review checklist
- [ ] Change is small and does one thing; refactors are in a separate change
- [ ] I read my own full diff; no unrelated edits, debug code, or commented-out code
- [ ] Tests added or updated for the new behaviour; new and existing tests pass (I ran them)
- [ ] Linters and formatters run with no new warnings or errors
- [ ] Docs updated to match the change
- [ ] No secrets, keys, tokens, or personal data in the diff
- [ ] Project security guidance applied if the change is security-relevant
- [ ] Description still matches what the change does
- [ ] No other open PR makes the same change; work item linked
```

Sources: Microsoft Code-With Engineering Playbook `pull-request-template.md` and `pull-requests.md` (CC BY 4.0, commit 016770e, 2025-09-26); Google Engineering Practices `cl-descriptions.md` (CC BY 3.0, commit 3bb3ec2, 2024-09-18). Rewritten and adapted; the secrets, security and "what was NOT tested" items are `(note)`, not from the sources.
