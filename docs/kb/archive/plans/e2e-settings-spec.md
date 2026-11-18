---
summary: Plan for the Settings e2e spec: Playwright on /settings (Claude card with Undo, data export download, axe), with the Claude flag turned on in the e2e server.
last_verified: 2026-11-18
---

# Plan: e2e-settings-spec

## Goal
Wishlist, the weight card and Tasks have a browser spec; Settings (`/settings`) has none. It holds the connection to the owner's Claude plan, and the data export (a button in the navigation menu) belongs to it by the domain page. This adds one spec for the owner and every later change to those flows: connect, replace and disconnect the Claude token with Undo, and the export download, checked against the database through reloads.

## Scope
- In: `tests/e2e/settings.spec.ts` with four tests; two env lines in `playwright.config.ts` so the page renders (`NEXT_PUBLIC_CLAUDE_ENABLED=true` and a throwaway `CLAUDE_TOKEN_KEY`); the KB updates. No new dependency.
- Out: a real Claude token or any call to Claude (the token is stored encrypted and never verified, so a fake `sk-ant-...` value is enough); the Assistant tab on `/health` (it needs the `claude` CLI; the flag shows it, no spec opens it); the flag-off 404 (a build-time flag, covered by `tests/pages-auth.test.ts` and `tests/features.test.ts`); push (the Settings page has no push card, reminders live on Tasks behind `NEXT_PUBLIC_PUSH_ENABLED`, off in e2e); comparing the stored ciphertext (covered by `tests/claude-connection.test.ts`); other app code, `ci.yml` and `helpers.ts` changes; fixing an accessibility finding by excluding it from the scan (a real finding is fixed in the code or reported, never hidden).

## Done criteria
- [x] `npm run e2e` passes on a private database with 17 tests (12 existing plus 5 new: the three flows and the axe test on `desktop`, the axe test again on `phone`) — checked by running it and reading `17 passed`.
- [x] The connect test shows "Not connected.", refuses a malformed token with the message in the form ("Please paste the token that claude setup-token prints."), connects with a fake token (row "Claude account", the "Connected" date, toast "Connected Claude"), Undo returns to "Not connected.", and a second connect survives a reload — checked by the spec's assertions.
- [x] The replace and disconnect test replaces the token (toast "Saved the new Claude token") and Undo keeps the account connected after a reload; disconnects (toast "Disconnected Claude", "Not connected.") and Undo brings the account back after a reload — checked by the spec's assertions.
- [x] The export test clicks "Export data" in the sidebar, gets a download named `life-tracker-export-` plus the date and `.txt`, and the toast "Exported your data"; the file, read in memory, holds "Life Tracker: all your data" and does not hold the fake token — checked by the spec's assertions (nothing is written outside the test output).
- [x] axe finds no serious or critical violation on `/settings` not connected, with the "Connect Claude" form open, and connected, on `desktop` and `phone` — checked by the spec.
- [x] No waits by time, role/label/text locators only, own user per test — checked by `grep -rn "waitForTimeout\|locator(" tests/e2e` finding nothing.
- [x] The existing specs still pass with the flag on, `npm run check` passes with a private database (`CI=1`, `DATABASE_URL` and `DATABASE_URL_MIGRATE` set to it), and CI on the pull request is green.

## Decisions
- D-017: Settings e2e spec: the e2e server turns the Claude flag on with a fake key; the spec covers the Claude card and the data export
- D-012: Tasks e2e spec (the model: reload checks, `andSettle`, one `@a11y` test; already active, this plan follows it)
- D-005: End-to-end specs with Playwright Test on `next dev`, Chromium desktop and phone (already active; this plan follows it)

## Steps
1. [x] Turn the flag on for the e2e server — files: `playwright.config.ts` (change: in `webServer.env` add `NEXT_PUBLIC_CLAUDE_ENABLED: "true"` and `CLAUDE_TOKEN_KEY: Buffer.alloc(32, "e2e-only").toString("base64")` with a comment that the key is throwaway and e2e only); tests: `npm run e2e` (the 12 existing runs still pass with the flag on, because the Settings link and the Assistant tab now render).
2. [x] The Settings spec — files: `tests/e2e/settings.spec.ts` (create); tests: itself, run with `npm run e2e -- settings.spec.ts`.
   - Shared: `openSettings(page)` goes to `/settings`, expects the URL and the "Claude" region (the card is `aria-labelledby="claude-title"`: use `getByRole("region", { name: "Claude" })`). `fakeToken()` returns `sk-ant-e2e-` plus a UUID without dashes (matches `^sk-ant-[A-Za-z0-9_-]{20,500}$`); never printed. `connect(page, token)` clicks "Connect Claude", fills the dialog's `Token` field and saves through `andSettle`; a helper dismisses the toast with "Dismiss notification" before a step that makes a new Undo, as Tasks does.
   - Axe test (`@a11y`, both projects): scan not connected; open "Connect Claude" and scan with the dialog open; close it, connect, scan connected.
   - Connect test (desktop): start at `/health`, click the sidebar link "Settings" (the flag is on), expect `/settings` and "Not connected."; open the form, type `not-a-token`, Save, expect the alert text in the dialog; replace with a fake token, Save: toast "Connected Claude", row "Claude account"; Undo (through `andSettle`) gives "Not connected."; reload still "Not connected."; connect again, reload, the account is still connected.
   - Replace and disconnect test (desktop): connect once as setup; "Replace the Claude token" opens the dialog "Edit token", Save a second fake token: toast "Saved the new Claude token"; Undo; reload, still connected. Then "Disconnect Claude": toast "Disconnected Claude", "Not connected."; Undo; reload, connected again.
   - Export test (desktop): connect (so the user holds a secret), start `page.waitForEvent("download")` together with the click on the sidebar button "Export data" (a button in `nav[aria-label="Main Navigation"]`: `getByRole("button", { name: "Export data" })`); expect `suggestedFilename()` to match `/^life-tracker-export-\d{4}-\d{2}-\d{2}\.txt$/`, the toast "Exported your data", and, reading `download.createReadStream()` into a string, the text contains "Life Tracker: all your data" and does not contain the token.
   - If a name is not found as written, read the real text in `app/settings/settings-client.tsx`, `app/components/navigation.tsx` or `app/components/toast.tsx` and use it; never loosen to a CSS selector.
3. [x] KB and docs — files: `docs/kb/conventions.md`, `docs/kb/architecture.md`, `docs/kb/domain.md`, `docs/kb/status.md`, `docs/kb/log/2026-11.md`, `docs/kb/INDEX.md` (change); tests: `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`.
4. [x] Verify and hand off — files: none; tests: `npm run check` and `npm run e2e` against a private database, then the merge-branch skill opens the pull request and CI is green. Do not merge it.

## Cleanup and docs
- Nothing becomes unused: no code is replaced.
- `docs/kb/conventions.md`, End-to-end specs: list `tests/e2e/settings.spec.ts`; the run count and the number of specs; the e2e server (Gotchas, "e2e server") turns the Claude flag on with a throwaway key, which shows the Settings link and the Assistant tab in every spec.
- `docs/kb/architecture.md`, Tests section: the Settings spec next to the others, and the two env values in the `playwright.config.ts` sentence; the Flags section if it says the flag is off wherever tests run.
- `docs/kb/domain.md`: the Settings line says "enable push", but the Settings page holds only the Claude token; push reminders are set on Tasks, and the export is a button in the navigation menu. Fix the line.
- `docs/kb/status.md`: Roadmap line "Settings e2e spec (D-017)" with the plan link while in progress, then done; archive the plan when done (`git mv` to `docs/kb/archive/plans/`).
- `docs/kb/log/2026-11.md`: an entry for the plan and one for the build; `docs/kb/INDEX.md`: the current-state line mentions the Settings spec.
- Risk tier: `playwright.config.ts` is in neither the Low nor the High list, so the pull request is Medium (the other changes are `tests/**` and `docs/**`).

## Approval
Status: done 2026-11-18
