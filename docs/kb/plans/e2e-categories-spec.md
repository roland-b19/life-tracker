---
summary: Plan for the categories e2e spec: one shared flow (add, rename, merge, delete, Undo, reload) run on Wishlist, Tasks Daily and Health shopping, plus axe with the form open.
last_verified: 2026-11-18
---

# Plan: e2e-categories-spec

## Goal
The categories card is shared by three pages the owner uses (Wishlist, the Tasks Daily list, the Health shopping list) and saves through two sets of server actions, but no browser spec covers it: D-012 left it out of the Tasks spec as "its own spec later". This adds that spec, so a change to the card or to its actions is caught on every page that uses it.

## Scope
- In: `tests/e2e/categories.spec.ts` with a driver written once for the whole flow (add a category and Undo it; rename and Undo; rename onto an existing name, which merges, and Undo; delete a category that holds an item, which moves to Other, and Undo), run as its own test on Wishlist, the Tasks Daily list (Personal space) and the Health Shopping tab's Categories card; one `@a11y` test per page; the KB updates. No new dependency (Playwright and axe exist, D-005).
- Out: the Units card on the Shopping tab (the same component with `noun: "unit"`; its own later spec if wanted); drag and keyboard reorder; folding a group; the refusals "already exists" and "other is built in"; the Business space (same actions, only the scope differs); any change to app code, `playwright.config.ts`, `ci.yml` or `tests/e2e/helpers.ts` (the driver stays in the spec; if the helpers really need a change, keep it minimal because other sessions edit that file); fixing an accessibility finding by excluding it from the scan.

## Done criteria
- [ ] `npm run e2e` passes with the three flow tests (`desktop` only) and the three `@a11y` tests (`desktop` and `phone`), on top of the 12 existing ones (21 tests on this branch: 14 on `desktop`, 7 on `phone`; the other sessions' specs add more once merged) — checked by running it against a private database (`CI=1`, `DATABASE_URL` and `DATABASE_URL_MIGRATE` set to it) and reading the `passed` line.
- [ ] On each page the flow adds category A (row in the Categories card, toast `Added "A"`), Undo removes it, also after a reload; adds A again with an item filed under it (the item's group heading shows A); renames A to A2 (toast `Renamed "A" to "A2"`, the item under heading A2), Undo puts A back with the item; adds B with its own item and renames A to B (the merge: card row A gone, both items under heading B), Undo brings A back with its item and leaves B with its own; deletes A with its item (toast `Removed "A"; its items are in Other`, the item under heading Other), Undo files the item under A again — checked by the spec's assertions, each followed by a reload that shows the same state.
- [ ] axe finds no serious or critical violation on each page with the Edit category form open and then with the New category form open, on `desktop` and `phone` — checked by the `@a11y` tests (a finding is fixed in the code, or reported in the PR when it is a real bug, never excluded).
- [ ] The spec makes no waits by time and finds elements by role, label or text only — checked by `grep -rn "waitForTimeout\|locator(" tests/e2e` finding nothing.
- [ ] The spec makes its own user and data: every test uses `signedInPage`, and its category and item names carry a random suffix — checked by reading the spec and by `--repeat-each=3` passing.
- [ ] No app code, config or CI file changed — checked by `git diff --stat origin/main` listing only `tests/e2e/categories.spec.ts` and `docs/kb/**`.
- [ ] `npm run check` passes with a private database, and CI on the pull request is green; the pull request is not merged — checked by the command output and the PR checks.

## Decisions
- D-014: Categories e2e spec: one shared flow run on Wishlist, Tasks Daily and Health shopping
- D-012: Tasks e2e spec (this is the spec it left out), D-005: Playwright specs (already active; this plan follows them)

## Steps
1. [ ] The driver and the Wishlist test — files: `tests/e2e/categories.spec.ts` (create); tests: `npm run e2e -- categories.spec.ts -g Wishlist` passes.
   - A `Surface` is `{ open(page), addItem(page, name, category?) }`: `open` goes to the page and waits for its Add-item button (Wishlist: `/wishlist`, "Add item"; Tasks: `/todos`, tab `Daily` is the one it opens on, "Add task"; Health: `/health`, tab `Shopping`, "Add item"). `addItem` opens the item form and fills it: Wishlist dialog `New item` (`Name`, `Price (RON)` = 100, `Category`), Tasks dialog `New daily task` (`Title`, `Category`), Shopping dialog `New shopping item` (`Name`, `Category`); the `Category` drop-down is picked with `selectOption({ label })` where the label is the category with a capital first letter (`categoryLabel`); Save through `andSettle` with `"name":"<item>"` (`"title":"<item>"` for Tasks) as the body piece; wait for the row (`getByText(item, { exact: true })`).
   - Names per test: `e2e-cat-<8 hex>` for A and B, `E2E item <8 hex>` for the items. Categories are stored lower case; the card row shows them as typed in lower case, the group heading as `Categoryname` with a capital (a button named after the category, `getByRole("button", { name: "E2e-cat-…", exact: true })`; it has `aria-expanded`). Look rows up inside the card: `page.getByRole("region", { name: "Categories", exact: true })` (on the Shopping tab there is also a "Units" card, so `exact` matters).
   - Driver helpers: `addCategory(name)` (button `Add category`, dialog `New category`, `Name`, Save through `andSettle` with `"name":"<name>"`, then the toast `Added "<name>"`); `renameCategory(from, to)` (button `Edit category <from>`, dialog `Edit category`, `Name`, Save through `andSettle` with `"to":"<to>"`; the Shopping and scoped actions both send `"from"`/`"to"`); `deleteCategory(name)` (button `Delete category <name>` through `andSettle` with `"name":"<name>"`); `undo()` (`getByRole("button", { name: "Undo" })` through `andSettle` with a body piece that names the Undo write: `"name":"<name>"` for the undone add (a delete), `"dropCurrent"` for the undone rename or delete (a revert)); `dismissToast(message)` (button `Dismiss notification`, then the message is hidden), called before every step that makes a new Undo, so only one Undo button exists, as the Tasks spec does; `reload()` (the surface's `open` again). Toast texts are exactly those in `categories-card.tsx`; if one differs, read the real text there, never loosen to a CSS selector.
   - Checks as `expectCategory(name, present)` (the row in the card) and `expectItemUnder(item, category)` (the item's row visible and the group heading button of that category visible; the heading shows `Other` for the fallback). After each step run the check, then `reload()` and run it again.
   - The flow, in order (each step: check, then `reload()` and check again; dismiss the toast before the next write):
     1. Add A: toast `Added "A"`, row A in the card. Undo: row gone. Reload: still gone.
     2. Add A again, then add item 1 filed under A: item 1 under heading A.
     3. Add B, then add item 2 filed under B.
     4. Merge: rename A to B (toast `Renamed "A" to "B"`): row A gone, both items under heading B. Undo: A is back with item 1, B keeps item 2.
     5. Plain rename: rename A to A2: item 1 under heading A2, row A gone. Undo: A is back with item 1.
     6. Delete A while item 1 is filed under it: toast `Removed "A"; its items are in Other`, row A gone, item 1 under heading Other. Undo: A is back with item 1 under it.
     The fixture's user deletion removes everything at the end.
   - Use real database checks only through the page (a reload), as the Tasks spec does; no direct SQL.
2. [ ] The Tasks and Health shopping tests — files: `tests/e2e/categories.spec.ts` (change: add the two surfaces and their two flow tests); tests: `npm run e2e -- categories.spec.ts` passes. On Tasks the page reloads its list after every write, so every `andSettle` here keeps its body piece (already so in step 1). Tasks: the Daily tab of the Personal space (the page opens on it); the Categories card shows only on Daily. Health: click the tab `Shopping` after `/health` loads; the Categories card has the name `Categories`.
3. [ ] The `@a11y` tests — files: `tests/e2e/categories.spec.ts` (change: add three tests, one per page, tagged `@a11y`); tests: `npm run e2e -- categories.spec.ts -g a11y` passes on both projects. Each opens the page, adds a category through the driver's `addCategory`, scans, opens `Edit category <name>` and scans with the dialog `Edit category` open, closes it (the dialog's close control; read its name in `FormModal`) and scans with `Add category`'s dialog `New category` open.
4. [ ] KB and docs — files: `docs/kb/conventions.md` (change: the e2e line lists the fourth spec and the run count; the categories sentence of D-012 no longer applies), `docs/kb/architecture.md` (change: the Tests line lists the spec), `docs/kb/status.md` (change: roadmap line), `docs/kb/log/2026-11.md` (change: entries for the plan and the build), `docs/kb/INDEX.md` (change: current state mentions the spec); tests: `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`. The run count comes from the real `npm run e2e` result at the end, not from arithmetic; the other sessions' specs add to it too, so write the number the merged tree shows or say "at least".
5. [ ] Verify and hand off — files: none; tests: `npm run e2e` and `npm run check` against a private database, `npm run e2e -- categories.spec.ts --repeat-each=3` green, then the merge-branch skill opens the pull request and CI is green. Do not merge it. Archive this plan (`git mv` to `docs/kb/archive/plans/`, `Status: done`) and update the status line before the PR.

## Cleanup and docs
- Nothing becomes unused: no code, dependency or config is added or replaced.
- `docs/kb/conventions.md`, End-to-end specs: list `tests/e2e/categories.spec.ts` (categories card on Wishlist, Tasks Daily and Health shopping, D-014) and the new run count; the Targets line's run count. `docs/kb/architecture.md` Tests line: add the spec. `docs/kb/status.md`: Roadmap line "Categories e2e spec (D-014)" with the plan link, then done with the archive link. `docs/kb/decisions/general.md`: D-012's Out list names categories "its own spec later"; D-014 is that spec, no edit of D-012 needed. `docs/kb/log/2026-11.md`, `docs/kb/INDEX.md`.
- Other sessions add specs for Gym, Health and Settings at the same time and also edit these KB pages and take decision numbers: expect merge conflicts in the KB, resolve them by merging `origin/main`, and renumber D-014 if another session took it first (update every mention in this plan and the spec comments).
- Risk tier: only `tests/**` and `docs/**` change, so Low.

## Approval
Status: draft
