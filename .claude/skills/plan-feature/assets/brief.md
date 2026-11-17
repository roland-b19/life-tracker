Owns: <the part's "Owns" cell from the work split>, and this part's own entry in the KB log

Build part <part letter> of the plan `<plan page path>`: steps <its steps>. Its branch name is `<slug>`.

1. Read the plan page first, then the KB pages it points to for these steps.
2. Build the steps in order, the way plan-feature's steps 8.2 and 8.3 say, but leave the plan page untouched, ticks included: the session that started you ticks this part's steps when the feature is finished, so only one branch at a time edits the page.
3. Change no file outside the `Owns:` line, except KB pages other than the plan page, which every part shares: update any KB page your change makes wrong. When the plan page itself is wrong, ask (rule 5).
4. When a step needs a design choice the plan doesn't settle, stop it and ask. The session that started you settles it with the user, updates the plan page and tells you to go on, quoting the user's approval.
5. "Ask" means: message the session that started you when the host gives you its id; otherwise ask the user.
6. Done means your PR is open, made with merge-branch, and its CI is green. Your last message starts with the PR link, then says what is left.
7. Merge only on the user's word. It may come forwarded, quoted, by the session that started you. Then run merge-branch's part B, which merges your PR and cleans up your branch.
8. Put large findings in the shared notes folder when the host gives you one, otherwise in the PR body.
