# Status

_Last updated: 2026-11-08 by Claude (Assistant on Claude CLI, Settings page, Entra External ID sign-in script)_

## Phase

Tier 1 (Iterations 1, 2, 3, and 4) is 100% complete, verified, and merged in `main`.
Tier 2 (Iterations 5, 6, and 7: Money, Daily To-Do & Habits, Food AI Connector & In-App Chat) is 100% complete, verified, and merged in `main`.
Tier 3, Iteration 8 (Wishlist & Family Business Dashboard) is 100% complete, verified, and merged in `main`.
Responsive UI/UX Overhaul (Unslop + UI-UX-Pro-Max Bento Architecture + Apple HIG) across all 7 modules is 100% complete and merged in `main` (PR #22).
Experience Elevation (Moody Minimalist Theme Option B, Blurred Modal Popups & Bottom Sheets, Command Menu ⌘K, Undo Toasts, Tabular Numbers, and 20 Precision Details) is 100% complete and verified.
Mobile-First Elevation (Native iOS Frosted Bottom Tab Bar, 54px Compact Header, Decluttered Mobile Feed, Smoked Glass Depth & Specular Highlights, Glowing Jewel Accents, Smoked Glass Sign-In) is 100% complete and verified.
Ember Design System & Navigation (dark warm graphite palette, SF Pro font, spring physics, desktop sidebar & mobile floating tab bar) is 100% complete and merged in `main` (PR #28).
Storm palette (cool graphite, steel blue accent; replaces Ember's terracotta, see `docs/decisions.md` 2026-11-05) is merged in `main` (PR #32).
UI cleanup (minimal, consistent pages; business finances removed; Tasks tabs; editable wishlist; d.m.y dates; modal fixes) is merged in `main` (PR #34).
UI polish 2 (Health page with Weight inside, editable tasks/categories/expenses/water/steps/weigh-ins, Undo on every action, no sticky hover, no zoom) is merged in `main` (PR #35). It adds migration `0010_allow_weight_update` (GRANT UPDATE on `weight_entries`); it must be applied wherever `db:migrate` runs.
Desktop dashboards (auto wishlist price ranges, Tasks Space/Today/Daily filters with a progress dashboard, spending and weight charts, 3D Gym muscle map) are merged in `main` (PR #35). They add migration `0011_todo_day_stats` (new table plus GRANT; must be applied wherever `db:migrate` runs) and the `three` dependency. Mobile redesign comes after all desktop functions are done.
Dashboards 2 (Tasks: read-only past days, bar chart periods with tap-to-open day, centred ring; Money: Tasks-style dashboard plus a category donut; Gym: routine editor, no Recent workouts, deduplicated muscle map, credit behind an info disclosure; Health: one layout system, API tab removed; animated numbers, modal and row motion, hover border; stale-module error fix in the service worker) is merged in `main` (PR #36). No migration, no new dependency.
Motion polish (page enter/exit transitions, numbers count up on every page entry, charts replay on every filter change, one subtle hover rule, proportional radii, no separators, Gym Front/Back segmented control and custom exercise inside the day editor, Health shopping list picks ingredients from recipes, muscle map credit moved to a Credits link) is merged in `main` (PR #37). No migration, no new dependency.
Wishlist polish (in-place fades with a soft blur on every list change, tab switches fade the old rows out first, Buy without the green flash, forms shrink and blur the page behind them, hover on form fields and the account card, full-width Sign out) is merged in `main` (PR #39). No migration, no new dependency.
List motion (rows open their space then fade in, fade out then close their space, a Buy animation on wishlist, lists resize smoothly on tab switches, rows replay their entrance on every tab, uniform list spacing, subtle Sign out, tinted row icon buttons, Credits link removed) is merged in `main` (PR #38). No migration, no new dependency.
Motion consistency (every card, button, tab and field grows by the same pixels with one shadow, a focused field keeps its lift, lists resize before new rows fade in, Tasks tabs and days fade the old rows out first, add/undo motion on Tasks, sign-out fades the page before the sign-in card, subtler Continue that keeps its colour while signing in) is merged in `main` (PR #40). No migration, no new dependency.
Wishlist tweaks (no shadow on fields and segmented tabs, Buy button removed, faster row fades) are merged in `main` (PR #41).
Pages polish (smooth delete and undo on Wishlist, Tasks and Money; calendar date pickers on Tasks and Money; plan one-off tasks up to 7 days ahead; streak fixes; donut hover highlight; select chevron) is merged in `main` (PR #42). No migration, no new dependency.
Pages polish 2 is merged in `main` (PR #43): Tasks repeat on chosen weekdays (`days:1,3,5`), move between days and between daily and one-off, done tasks sink in completion order, dots on days with planned tasks, past days editable in dev builds only; Wishlist sorts by price and saves without Undo; the **Money page and its code are removed** (tables stay); Health weight rows lead with the weight and the chart has 7-360 day periods; the shopping list is filled by hand with quick add from past items, same-name items merge, items and categories are editable; the Food Assistant sends a short food-only context prompt and gets a JSON answer that the app validates and logs; a Past foods sheet logs earlier foods in one tap; subtler zoom behind open forms. Adds migration `0012_shopping_history` (column `cleared_at`, merges existing duplicates); it must be applied wherever `db:migrate` runs. No new dependency.
Pages polish 3 is merged in `main` (PR #44): ticking or reopening a task has no Undo; past days can be ticked in every build, with streaks computed from the ticked days (new table `todo_completions`, streak columns dropped, existing streaks backfilled); shopping categories are managed in their own Categories card (add, rename, delete, "other" built in; new table `shopping_categories`) and picked from a select in the item form; meal types are removed everywhere (column dropped). Adds migrations `0013_todo_completions`, `0014_shopping_categories`, `0015_drop_meal_type` (GRANTs inside); they must be applied wherever `db:migrate` runs. `scripts/db-init.cjs` mirrors them. No new dependency.
Tasks reject duplicates, merged to `main` (PR #49): adding a task whose title (any case) is already on the list it would join shows an error in the form and keeps it open. No migration, no new dependency, no new endpoint. Since PR #52 (merged) rename, move and Undo are checked too, deleting a repeating task with past days only ends it (migration `0016_todo_ended_on`), and Tasks gets a Week section and a chart axis with tooltips.
Wishlist motion is merged to `main` (PR #46): adding an item shows a toast without Undo; saving an edit offers Undo (writes the old values back); toasts are as wide as their content; when a tab switch grows the list, its bottom edge fades instead of cutting rows (`AutoHeight`; since PR #48 on every page that uses it; since PR #50 it shrinks out instead of sliding; removed again in PR #52 at the user's request). No migration, no new dependency, no new endpoint.
Pages polish 4 is merged in `main` (PR #45): Past foods rows use the standard row with a boxed plus; the Food Assistant has no greeting and no suggestion chips; the Shopping tab shows the list and Categories side by side (list first); Gym training day cards lift as one card (the inner select button no longer lifts, and the row entrance animation no longer pins `transform`, which had blocked the hover scale on day cards and routine rows). Section headers wrap instead of breaking a button label. No migration, no new dependency.
Wishlist style everywhere (PR #53 and #54, merged): the Wishlist page is the signed-off reference and its buttons, spacing, fonts, motion and add/edit/delete pattern now apply to Tasks, Food, Gym, Health and the sign-in and sign-out screens; the full house style is the new `ultimate-design-skill` (`.agents/skills/ultimate-design-skill/`). No migration, no new dependency, no new endpoint.
Health tabs and Tasks forward is merged in `main` (PR #59; CI tools fix PR #60): Health Today shows Nutrition first, then Water, Weight, Steps; Water and Steps get History and Trend tabs (new owner-scoped server actions `listDailyMetricsAction`, `saveDailyMetricAction`, `clearDailyMetricAction`, with authorization tests); weight shows the 7-day average, the week start (weeks start on Sunday), the latest weigh-in, the average weekly change and the change since last week; Tasks Today moves only forward; `npm run seed:dev [-- <name>]` fills a local dev user with sample data. No migration, no new dependency.
Editable goals and fuller seed (PR #61, merged): Health Today's Nutrition card has an Edit button for the calorie, protein, carbs and fat goals, and the Water and Steps edit forms also set the daily goal; both have Undo. They use the existing owner-scoped `updateTargetsAction` (now with an authorization test). `npm run seed:dev` also fills 30 days of meals (so Past foods has entries) and a shopping list with sections, ticked items and quick-add history. No migration, no new dependency, no new endpoint.
Claude Assistant (branch `feat/claude-cli-chat`, PR open): the Health Assistant calls Claude through the Claude Code CLI with each user's own token, connected on the new Settings page (encrypted at rest, owner-only). Adds migration `0017_claude_connections` (new table plus GRANT; must be applied wherever `db:migrate` runs) and the `CLAUDE_TOKEN_KEY` environment variable. No new npm dependency. **Not deployable yet:** the container image has no `claude` CLI and `infra/main.bicep` has no `CLAUDE_TOKEN_KEY` (Key Vault); `GEMINI_API_KEY` was never wired either.
Clean Flat Polish & Centered Popups is 100% complete and merged in `main` (PR #27).
Native iOS PWA Standalone & Gesture Polish (Web Manifest, fullscreen iOS Home Screen mode, rubber-band overscroll elimination, tap delay removal, avatar circle removal, and Service Worker Cache-First shell loading) is 100% complete and merged in `main` (PR #29, PR #30).

## Current focus

Iteration 9: Final Security Hardening, Production Configuration & Azure Cloud Deployment.

## Application features (local)

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Gym module: 5-day Upper/Lower split, set logging (`reps x load`), anomaly flags `!!`, PR tracking, 5-week deload tracker.
  - Food & Nutrition module: daily targets, meal logger, Past foods sheet, water tap counter (+250ml, +500ml), steps, shopping list filled by hand with quick add from past items.
  - Money module: removed from the UI on 2026-11-06; the `expenses` tables stay in the database, unused.
  - To-Do & Habits module: automatic carry-over rollover, streak tracking, space segregation (`personal` vs `business`), Web Push notifications.
  - Food AI Connector (Claude MCP & Gemini Function Calling):
    - Dual protocols: `/api/mcp` (JSON-RPC 2.0 / MCP) and `/api/ai/food` (Google Function Calling / OpenAPI).
    - Scoped personal bearer tokens (`api_tokens` table, SHA-256 hashed, narrow scope `food`).
    - 4 isolated food tools: `log_meal`, `get_daily_food_summary`, `get_recipes`, `add_shopping_item`.
    - Strict AI Data Line Quarantine: weight, steps, gym, money, tasks, and business data are physically unreachable from the AI endpoints.
    - Automatic `isEstimated: true` flag and purple UI badge on all AI-logged meals.
    - Global kill switch via `AI_CONNECTOR_ENABLED=false`.
    - Token management UI removed on 2026-11-05 (see `docs/decisions.md`); the token backend and endpoints still work for existing tokens.
    - In-App Food AI Chat: Claude through the Claude Code CLI (`src/lib/claude-cli.ts`, `CLAUDE_MODEL`, default `sonnet`) with the user's own token from Settings (`src/lib/claude-connection.ts`); was Gemini until 2026-11-08. The system prompt (`buildFoodChatPrompt` in `src/lib/food-ai-chat.ts`) carries the day, local time, targets, meals already logged, recipes and past foods, never weight or steps; the model answers JSON `{reply, meals[]}`, each meal is validated like a hand-entered one and logged as an estimate. No shopping from the chat.
    - Comprehensive Vitest test suite (`tests/food-ai.test.ts`, `tests/food-chat.test.ts`, 60 total passing across repo).

## Verification status breakdown

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Gym module:
    - PostgreSQL schema (`exercises`, `workout_splits`, `workout_split_days`, `workout_split_day_exercises`, `workout_sessions`, `workout_sets`).
    - Seed data with default 5-day Upper/Lower split and preloaded exercises matching `gym-sample.md`.
    - Owner-scoped DAL and Server Actions (`logSetAction`, `startSessionAction`, `finishSessionAction`, `deleteSetAction`, `createCustomExerciseAction`, `getExerciseContextAction`).
    - Automatic `!!` anomaly detection when reps < target min reps, manual anomaly reason flagging.
    - In-workout context: previous session performance, PR tracking (excluding deload sessions), and progressive overload suggestion.
    - 5-week deload tracker cycle with reminder indicator.
    - Apple HIG user interface at `/gym` and segmented navigation between `/` (Weigh-ins) and `/gym`.
  - Private-network Bicep template (`infra/main.bicep`) featuring:
    - PostgreSQL Flexible Server with public network access disabled and private DNS.
    - Configurable `postgresSku` parameter (default `Standard_B1ms`).
    - Key Vault with private endpoint, RBAC and purge protection.
    - ACR Premium with private endpoint and admin user disabled.
    - Container Apps with VNet integration, HTTPS-only ingress, scale-to-zero, and user-assigned managed identity.
    - Role assignments for ACR Pull (`7f951dda-4ed3-4680-a7ca-43fe172d538d`) and Key Vault Secrets User (`4633458b-17de-408a-b874-0445c86b69e6`).
    - Explicit Bicep dependencies on `registryPrivateDnsGroup` and `vaultPrivateDnsGroup` to guarantee private DNS A-record registration prior to container image resolution.
    - Log Analytics diagnostic settings on PostgreSQL, Key Vault, ACR, and Container Apps.
    - Consumption budget alert resource (`Microsoft.Consumption/budgets`).
  - Guarded scripts: `azure-preflight.sh`, `azure-deploy.sh` (runs what-if, validates parameters and immutable digest `sha256:...`, builds and pushes amd64 image, automates database migrations via `Microsoft.App/jobs`), `azure-teardown.sh` (synchronous deletion with absence verification, targets only project resource group).
- **Verified via CI:**
  - Dependabot and Gitleaks secret scanning.
  - Syft/Anchore SPDX SBOM generation.
  - Trivy container scan for HIGH and CRITICAL vulnerabilities.
  - Bicep offline compilation and shell syntax validation (`bash -n`).
- **Verified via local tests:**
  - 14 Vitest unit, contract, and authorization tests passing.
  - Local PostgreSQL container tests passing with deterministic credentials.
  - Production container build (`linux/amd64`) and `/health` probe verified.
  - `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` (production flags) passing.
  - `npm audit --audit-level=high --omit=optional` passing (0 high/critical).
- **Verified via live Azure deployment (`italynorth`):**
  - PostgreSQL Flexible Server reachability from inside VNet: verified (`current_database()`, `current_user`).
  - Key Vault secret resolution at Container App startup: verified (`database-url`, `nextauth-secret`, `auth-azure-client-secret`).
  - Container image pull from ACR over Private Endpoint: verified (digest `sha256:75d80d6f194a410bd0d8c1f1dbfc6445ff2937c519f4bc720a6989e7cd64cb0e`).
  - Live health check over HTTPS: `GET /health` -> `200 OK`, `{"status":"ok"}`.
  - Live authorization rejection: `GET /api/weight` -> `401 Unauthorized`.
  - CSRF / Origin protection: `POST /api/weight` -> `403 Forbidden`.
  - Microsoft Entra ID OIDC flow: `POST /api/auth/signin/azure-ad` -> `302 Redirect` to `https://login.microsoftonline.com/83cf6faf-7c1d-4271-bbdb-2030c5678923/oauth2/v2.0/authorize?client_id=75ae56c6-ccc7-4081-b308-1b391deaa1f0&scope=openid%20profile%20email&...`.
  - Security headers enforced: HSTS (`max-age=31536000; includeSubDomains`), CSP, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy, Permissions-Policy.
  - Absence of public access to PostgreSQL, Key Vault, and ACR from external networks: verified (`publicNetworkAccess: "Disabled"` on all three).
  - Database schema bootstrap & migration: verified via `Microsoft.App/jobs` execution `lt-migrate-stage` (`status: Succeeded`).
- **Unverified (deferred to future iterations):**
  - Live backup retention window completion (7-day window) and point-in-time database restore.

## Regional audit and cost recalculation

- **Subscription:** Azure for Students (`rboldesco14@gmail.com`).
- **Region provisioning check (read-only):**
  - Restricted for subscription: `westeurope`, `germanywestcentral`, `eastus`, `eastus2`.
  - Permitted without restrictions: `belgiumcentral`, `northeurope`, `francecentral`, `swedencentral`, `polandcentral`, `italynorth`, `spaincentral`, `uksouth`.
  - In `belgiumcentral`, burstable SKUs are limited to `Standard_B1ms` (which previously had capacity exhaustion) and `Standard_B2s`.
  - In `northeurope` and `francecentral`, broader burstable SKUs (`Standard_B1ms`, `Standard_B2s`, `Standard_B2ms`, etc.) are available.
- **Cost recalculation:**
  - **ACR Premium:** ~$50.00 / month (~$0.07 / hour). Required because Azure only supports private endpoints on ACR Premium. For an ephemeral test run (1-2 hours), cost is ~$0.14.
  - **PostgreSQL Flexible Server B1ms:** ~$16.09 / month (~$0.022 / hour).
  - **PostgreSQL Flexible Server B2s (if B1ms capacity lacks):** ~$28.50 / month (~$0.039 / hour).
  - **Key Vault + Private Endpoint:** ~$7.30 / month (~$0.01 / hour).
  - **Container Apps (Consumption):** Scale-to-zero ($0 idle; first 180k vCPU-s free; <$0.05 per test run).
  - **Total 24/7 continuous monthly cost:** ~$80 - $90 (B1ms) or ~$92 - $102 (B2s).
  - **Total ephemeral test run cost (1-2 hours until teardown):** ~$0.20 - $0.35 total.
  - Well within course credit ($100), provided immediate teardown is enforced.

## Next

1. Iteration 9 (Final Security Hardening, Production Configuration & Azure Cloud Deployment) per `docs/roadmap.md`, only when the user starts it. It needs explicit OK before any Azure resource is created.
2. Maintain local-only verification until then (no Azure deployments).

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None for Life Tracker. All resources deployed for Iteration 2 testing were
synchronously deleted via `scripts/azure-teardown.sh stage DELETE`. The subscription's
pre-existing `NetworkWatcherRG` is not owned by this project and was intentionally left untouched.

## Session log (newest first)

- 2026-11-08 — Claude Assistant (Claude Code, branch `feat/claude-cli-chat`): Gemini replaced by the Claude Code CLI; Settings page to connect, replace or disconnect a Claude token (AES-256-GCM in `claude_connections`); new tests `tests/claude-connection.test.ts` and an updated `tests/food-chat.test.ts`. Checked in the browser at phone and desktop width: connect (invalid and valid token), the chat with a fake token (real CLI, "refused token" reply), disconnect, and a real answer through the local login. Fixed on the way: the CLI needs `USER` to find a macOS Keychain login.
- 2026-11-08 — Progress total (Claude Code, branch `fix/numbers-start-real`): "X of Y" is plain text with the real numbers; the ring fill and stat tiles keep their animation; the tween no longer dips below its start ("-5%"); the ring eases down as well as up on view changes. Checks: tsc, eslint, browser frame sampling on Tasks.
- 2026-11-08 — Tasks Progress (Claude Code, branch `fix/tasks-progress-empty`): a list with no tasks shows only the note, no ring; Progress follows the list on screen, so it no longer flashes the last day's numbers. Checks: tsc, eslint, browser frame sampling across tab and day switches.
- 2026-11-08 — Tasks review (Claude Code, branch `fix/tasks-week-button`):
  - The Week button fades out on Today and back in on Daily with the existing row motion.
  - Fixed: rollover timezone (tasks carried wrongly 00:00–02:00), server checks (no edit, move or delete of past one-off tasks, no tick on a day a repeating task is not due, list read input), stale refreshes overwriting a newer tick, a view switch landing before its day's data, rows put back onto a list that is no longer on screen.
  - Not fixed, for the user: push reminders are half-built (no sender, and the subscription the client sends does not match the server schema); the duplicate-title rule differs between one-off and repeating tasks; changing a repeating task's weekdays also changes its past days; a tab left open past midnight keeps the old "today".
  - Checks: tsc, eslint, browser runs (fast ticks, day then tab switch, delete and Undo). vitest 94 of 95; the one failure is `tests/food-ai.test.ts` taking "today" as the UTC date, a test bug between 00:00 and 02:00.
- 2026-11-08 — Undo and Tasks fixes (Claude Code, branch `fix/undo-and-tasks`), from the user's last Wishlist request and a Tasks list:
  - Wishlist: Undo of an edit no longer replays the list's entrance on the other rows (`rowRef` stops `row-in` after a row's first entrance).
  - Tasks (Personal and Business, one component): the Week strip opens without a jump; an edit that takes a task off the shown list leaves like a delete and its Undo returns like an Undo of a delete; new tasks go on top; picking a weekday keeps the date and shows that weekday's repeating tasks to edit (no ticking); Today has no Week button.
  - Checks: tsc, eslint, browser runs of every item. vitest: 92 of 94 pass; the 2 failures (a todos "first day" test and a food "defaults to today's date" test) fail the same on `main` and depend on the time of day (run after midnight), not on this change.

- 2026-11-06 — Wishlist style on every page and the `ultimate-design-skill` (Claude Code, branch `fix/tasks-and-polish`, PR #53 open), from the user's request to carry everything from the Wishlist page to all pages, redo sign-in and sign-out, and write the house style as a skill checked until a pass finds nothing:
  - Sign-in: plain card with "Welcome back" as a section title, the dev note removed; Sign out uses the tint button style; the sign-out fade blurs without scaling.
  - Every page: same buttons, hit areas, spacing and row bands; border removals; muscle chip fill; HBars labels wrap; the weekday legend reads like a field label.
  - Forms and copy: every form shows failures inline (`.error`, the form stays open); warning toasts only for actions without an open form; every submit says "Save"; toasts read `Added "X"`, `Saved "X"`, `Removed "X"`, failures `Failed to <verb> <object>`; all UI text is English (Food Assistant included); Gym's select is labelled "Exercise" so it no longer shares a label with the Add exercise button.
  - Skill: `.agents/skills/ultimate-design-skill/` (SKILL.md, `references/values.md`, `references/motion-and-crud.md`), linked from `.claude/skills/`; AGENTS.md points every UI change at it. Checked in repeated passes (conversation vs skill, code vs skill) until a pass returned nothing to add.
  - Later passes: fields disable while saving (sign-in too, and a failed sign-in request no longer hangs); `inputMode` numeric/decimal on number fields; totals next to every list title (hidden while loading); the Categories list uses the row motion with stable keys, so a rename moves like an Undo; Move and category dialogs keep their content while they fade; empty notes fade like rows; the weight trend badge is neutral; no stripe on the deload card; the More tab no longer trembles when pressed; dead CSS removed (`.tag`, `.filter-chip`, duplicate badges); the categories help note removed.
  - Checks 6–8: Undo puts the screen back before writing (water, steps, shopping edits, task delete); the Tasks list uses the Wishlist spacing (band gap .25rem, button gap .75rem, header gap); empty lists keep a 3.75rem row height by default (4.1875rem on the muscle map); the muscle map title sits outside its list, so it no longer jumps when a muscle is picked and the first row starts the stagger; long exercise names wrap; bar hover fades over `--fade`; empty stat tiles show `—` and the latest weight counts up; Tasks reminders report through toasts (the old status line is gone); the weight form's date field is labelled "Date" and disabled while saving.
  - Check 8 (code): the Gym session's exercises are plain groups, not cards inside the card; its set list is a wash list; its checkboxes disable while busy; reorder buttons use arrow icons; the Gym empty note is one sentence; a failed first load (tasks, weigh-ins) is a warning toast, not inline text; Segmented buttons share the thumb's .7rem radius; the Food Weight number counts up; the unused command menu and its CSS are deleted.
  - Check 9: the Gym session muscle badge is neutral like the preview's; the Gym "New exercise" form refuses a duplicate name and uses the shared `.form-actions`; the Food weight card drops its help note; every form error has `role="alert"`; the date steppers use chevron icons instead of `‹ ›` glyphs. The skill adds past-day read-only, list-first layout and the empty set-list exception.
  - Check 10: the Task reminders card is a house `.surface` last in the aside, so its late arrival no longer pushes the page down; the weight chart's "not enough weigh-ins" note keeps the chart's height; a selected split day keeps its fill on hover; the muscle map uses `.group-label`; the More menu is a dialog with `aria-current`; the sign-in error is `role="alert"`. The skill adds the removed features (meal types, Recent workouts, shopping from recipes) to Rejected.
  - Check 11: a chat message that fails to send is taken back into the input with a warning toast (no fake assistant reply); the Tasks week strip opens through `AutoHeight` instead of pushing the list down; Gym labels say "Extra (kg)" and "Session notes (optional)", the session date is a `card-sub`, the anomaly badge loses its "!!" prefix; the shopping modal says "Edit shopping item". The skill now states that quick-add chips wait for the server, documents the Past foods picker, the native time field, the category Delete in its form and the meal form labels.
  - Check 12: Gym "Log set" stays disabled until reps are entered (no validation toast); a weigh-in that fails on the server says "Failed to save weigh-in" instead of a validation message; the category form no longer autofocuses and its reserved-name error starts with "Please". The skill adds the shopping-item Undo exception, the refetch-page Undo order (Tasks, Gym days), the `.move-hint` help line and the Health page-level section switch.
  - Check 13: every badge wears the `--edge` border from the base `.badge` ("Carried over", "AI estimate" and weekday repeats included); the "Add again" chips get the 44pt hit area; `.tap-btn` is the compact 2.25rem height; the task and shopping forms clear their error on each submit. The skill documents `.chat-chip`, `.tap-buttons` and the muscle-chip hit-area exception.
  - Check 14: Food Categories shows "No categories yet." instead of collapsing; Move task shows its help line only for a daily task; Gym "Create and add" clears an old duplicate error; the loading skeleton stops shimmering under reduced motion. The skill documents the loading skeleton and separate empty-note ids for lists sharing one `useListMotion`.
  - Check 15 (last, stopped at the user's request): the weight form date field gets the field hover and focus fill; Safari staggers rows on first load too; Gym Training days use `AutoHeight`; the Training days focus ring sits 2px out; the chat form gap is .75rem. The skill documents Training days, the rest-day Edit, the chat and weekday values, and the muted detail gap.
  - Verified: tsc, eslint, vitest (94 passed); browser at 375px and desktop: Gym routine modal, inline reps error, Food category add, rename and delete motion, Tasks Move dialog, Tasks and meal forms, Tasks list spacing against the Wishlist, muscle map title, weight date field label. Not checked: Safari, real phone.
- 2026-11-06 — An edited Wishlist item that changes place enters its new place like a deleted item put back by Undo (Claude Code, branch `fix/tasks-and-polish`). Verified per frame in Chromium (list height constant, rows in between glide); not checked in Safari.
- 2026-11-06 — Rows appear one after another when a list shrinks too (Claude Code, branch `fix/tasks-and-polish`): JS fallback for the `sibling-index()` stagger. Verified in Chromium with the CSS delay forced to 0; not checked in Safari itself.
- 2026-11-06 — Reverted the Wishlist speed-up (Claude Code, branch `fix/tasks-and-polish`): motion and wash timings are back to the previous version.
- 2026-11-06 — Wishlist title uses the page's monospaced face (Claude Code, branch `fix/tasks-and-polish`). 60 local test items (20 per price range, boundaries 249.99 / 250 / 749.99 / 750 included) were added to the local dev database for manual testing; not in any seed file.
- 2026-11-06 — Wishlist wash on every row change, equal band spacing (Claude Code, branch `fix/tasks-and-polish`): wash out, row change, wash in on add, delete and a moving edit; card-to-band equals band-to-text (11.3 px at 562 px). Sampled per frame in the browser; undo shares the add path and was not sampled.
- 2026-11-06 — Wishlist row wash waits for the list (Claude Code, branch `fix/tasks-and-polish`): the alternating wash fades in after every row has entered. Sampled per frame on a filter switch in the browser.
- 2026-11-06 — Wishlist polish and no clipped rows (Claude Code, branch `fix/tasks-and-polish`): rows appear only once their space is open, the last row is no longer clipped during the resize, quieter field highlights, equal header buttons, actions aligned under Add item. Checked in the browser at 562px and 375px (filter switch sampled per frame, add). See `docs/decisions.md` "A row appears only once its space is there".
- 2026-11-06 — Wishlist glide fixes (Claude Code, branch `fix/tasks-and-polish`): boxes no longer start 7px off or overshoot by the column's own movement, and an interrupted glide continues from where it is. Tested in the browser: add, edit both ways, delete, undo, filter switch, 375px, reduced motion.
- 2026-11-06 — Faster list resize, gliding Wishlist boxes (Claude Code, branch `fix/tasks-and-polish`): resize 180ms; price, range and link boxes glide when the columns change. See `docs/decisions.md` "Faster list resize, gliding Wishlist boxes".
- 2026-11-06 — Stronger control fills (Claude Code, branch `fix/tasks-and-polish`): buttons, tags, chips and fields have stronger grey and tint fills so they stand out from cards. See `docs/decisions.md` "Stronger control fills".
- 2026-11-06 — No shadows, faster row entrance (Claude Code, branch `fix/tasks-and-polish`): every box-shadow removed, hover is a fill on every clickable; tab-switch rows fade in as the list starts resizing. Checked Gym, Health, Tasks, Wishlist and More in the browser at phone and desktop width. See `docs/decisions.md` "No shadows; rows enter with the resize".
- 2026-11-06 — Graphite palette (Claude Code, branch `fix/tasks-and-polish`), from the user's request "base black, grey": true black page, Apple dark system greys for cards, controls, modal, separators and text (no blue cast); accent and status colors unchanged. See `docs/decisions.md` "Graphite palette".

- 2026-11-06 — Steel blue page (Claude Code, branch `fix/tasks-and-polish`), from the user's request: the page background is a dark steel blue `#1f2b3a` (was graphite `#1b1e22`), so the graphite cards stand out; `themeColor` and the manifest match. A light blue page and a self-drawn slashless zero were tried and dropped at the user's request: Wishlist keeps Menlo's own slashed 0 (the Andale Mono zero is removed too).

- 2026-11-06 — Edge shadows, quiet form (Claude Code, branch `fix/tasks-and-polish`), from the user's request:
  - Every page: objects lose their borders (`--edge: transparent`) and carry a very slight shadow on every side (`--edge-shadow`); separators, checkbox circles, the deload accent bar and selection outlines stay. High contrast (`prefers-contrast: more`) brings the outline back.
  - Card lists: the row band stops 0.5rem from the card edge, row text keeps the card's own inset (Wishlist titles line up with the header), and a trailing icon button sits 0.5rem inside the band on every side.
  - Wishlist: the form uses the same monospace font (`Modal` takes a `className`). Tags are 0.75rem apart at every width. The sort menu is highlighted only while open or hovered (`:open`), not while focus lingers; the blur-after-pick logic is gone.
  - Form: the page no longer shrinks behind it (blur only; the form's own animation is unchanged). Field focus is a slightly lighter grey fill, no tint edge or ring. The form's close button gets a grey hover fill instead of a shadow.
  - Toast: the action button has no edge; the close X is a 0.7rem rounded square like the other small buttons, with a grey hover fill and no shadow.
  - Checked: tsc, eslint, 94 tests; in the browser Wishlist at desktop and 375px (band and button insets 8px, no horizontal scroll), Tasks insets, Health and Gym at a glance, the plain zero, the form font, Undo after a delete. Not checked: a real mouse open of the native sort menu, field focus with a real click (the pane was in the background), Safari.
- 2026-11-06 — Subtle highlights, one-line Wishlist rows (Claude Code, branch `fix/tasks-and-polish`), from the user's request:
  - Every page: highlights are subtler and come in three strengths: `--highlight` (5% grey) on clear controls, `--highlight-fill` (10% grey) on grey-filled ones, `--tint-highlight` (20% tint) on tinted buttons. Tinted buttons (Add item, the row edit/delete buttons, the toast action) lose the hover shadow. List rows keep their stripes but no longer highlight on hover. Segmented pills have a 0.25rem gap; the selection thumb follows it.
  - Wishlist sort menu (the request said Tasks, but the sort menu is on Wishlist; Tasks has none): no focus edge while open, only the highlight; after a mouse pick or Escape it drops focus, so the highlight ends unless hovered. Keyboard use keeps a focus ring.
  - Wishlist rows: on wide lists name, price, range, link and actions sit on one line in shared columns (subgrid), so every price box has the same width (text centred) and so does every range box; columns are 1rem apart, the two row buttons 0.75rem (the header's spacing). On a phone the name and buttons share the first line and the boxes go below it.
  - Checked: tsc, eslint, 94 tests, and in the browser: Wishlist at desktop and 375px (no horizontal scroll), the filtered tab without the range column, hover shadow and fill on Add item and the row buttons, the segmented gap, and the sort menu's focus after a click, Escape and a (scripted) pick. A real mouse pick in the native menu and other pages' hovers were not checked.
- 2026-11-06 — Grey highlights, smooth hover, Wishlist columns 2 (Claude Code, branch `fix/tasks-and-polish`), from the user's request:
  - Every page: one grey highlight (`--highlight`) for every hover and selection fill, replacing the blue ones; list row stripes and hover bands are grey. Hover shadows and highlights fade over 240ms on a plain `ease` (`--fade`) instead of jumping. Rows of a new page start fading in as soon as the page arrives (the `rows-go` wait after a navigation is removed).
  - Wishlist: range and link columns start right after the names (name column at most 45%) and are left-aligned; the price box fits its own text. On a phone the price takes its own line, with range and link below it.
  - Checked: tsc, eslint, 94 tests, and in the browser: Wishlist at desktop and 375px, row hover, computed transitions, and rows fading in on arrival after a Tasks → Wishlist navigation. Other pages' hovers were not checked in the browser.
- 2026-11-06 — No pulsing, Wishlist columns (Claude Code, branch `fix/tasks-and-polish`), from the user's request:
  - Every page: hover no longer scales cards and buttons (that overshoot was the "pulse"); hover is the soft shadow, fields and tabs get a highlight. Modals, toasts and the date picker enter with the plain ease, no overshoot. The press shrink and the skeleton shimmer stay.
  - Wishlist: monospaced system font on the page; the item count sits next to the Items title; the sort menu text is centred between the left edge and the chevron and highlights on hover; price is a box like the range; range, price and link have fixed widths (from the longest value shown, link capped at 24 characters) and line up down the list; range and link are centred on the whole item. On a phone the meta line wraps as before, the filter tabs use the dense size.
  - Checked: tsc, eslint, 94 tests, and in the browser: Wishlist All and Under 250 at desktop width and All at 375px; row heights match the empty note. The sort menu hover was not checked in the browser.
- 2026-11-06 — Tasks fixes and polish on every page (Claude Code, branch `fix/tasks-and-polish`), from the user's request:
  - Tasks: a repeating task starts on its first day; add and delete work in the Today tab and on any day; a deleted task no longer pops back; the Week strip shows day names; "Nothing planned" shows on every empty day.
  - Every page: hover fills on idle buttons and tabs, a very soft all-around hover shadow, list rows as alternating tinted bands with a hover band, row buttons centred on multi-line rows, uniform list spacing.
  - Motion: new rows wait for the form to close on Tasks, Health (meals, weigh-ins, shopping) and Wishlist; weigh-ins and past foods animate; the Gym day editor's exercise rows enter, leave and slide on move.
  - Checked: tsc, eslint, 94 tests, and in the browser: Tasks add and delete in Today, the Week strip, and the stripes on Tasks, Health, Gym and Wishlist. Hover states were not checked in the browser.
- 2026-11-06 — Snappier app-wide motion (Claude Code, PR #52, merged), from "everything feels sluggish". Measured first: the server answers in 20–40ms and frames hold 60fps, so the lag was motion length. A page change stacked three entrances (view transition 90ms delay + 340ms with blur, a 580ms card rise staggered up to 210ms, rows 100ms late and 40ms apart) and took about 1s to settle; hover and selection colours faded over 420ms and the press spring took 500ms.
  - New `--quick: 180ms` for colour, background, border, shadow and opacity feedback; `--lift` 320ms; movement keeps `--dur`.
  - Page change: exit 120ms, enter 260ms after 40ms, root 300ms, no blur; cards rise in `--dur` staggered 40ms; rows start 80ms in, 30ms apart; chart bars grow in `--dur`.
  - Result in dev: a page settles in 500–660ms instead of about 970ms; the transition (which blocks clicks) ends about 320ms after the page arrives.
- 2026-11-06 — Wishlist motion (Claude Code, PR #52, merged), from the user's request:
  - Deleting or restoring a list's only row keeps the box size: the row only fades and swaps with its empty note (same height, `--row-h` per tab), and AutoHeight ignores a sub-1.5px gap.
  - Every Modal now closes with the reverse of its opening (fade + scale down), and the page zoom lifts as it closes; `onExited` fires once the form has faded.
  - Wishlist add and edit wait for the form to close, then animate; an edit that changes the row's place leaves and re-enters like delete/Undo.
  - A row's space closes with an ease-in-out curve so a delete no longer looks stuck at the end.
  - Toasts pause while hovered with a mouse or focused, and resume with at least 1.5s left.
  - Delete, Undo and move no longer stall: a grid track cannot shrink below zero, so a collapsed row kept both gaps and the last 4px popped (then AutoHeight eased it). A neighbour now takes in one gap during the motion (`closeGap` in list-motion.tsx), and the space closes together with the fade.
- 2026-11-06 — Snappier task motion, chart axis, no duplicate or lost daily tasks, week section (Claude Code, PR #52, merged), from the user's request:
  - Add, delete and Undo motion drops the blur and uses opacity and transform only (space 260ms, fade-in 220ms after 120ms, fade-out 160ms); after a page change rows start 100ms into the enter transition instead of after it.
  - Tasks bar chart: 30 and 90 days were slow because the bar stagger grew with the bar count; it is now spread over the same ~0.8s for every period. New y-axis (max, half, 0) and a value tooltip on hover or focus.
  - Duplicates are refused on add, rename, move and Undo; rollover skips an overdue task already due today.
  - Deleting a repeating task that has past days ends it (`todos.ended_on`, migration `0016_todo_ended_on`, mirrored in `scripts/db-init.cjs`) so earlier days keep it; moving it into a one-off creates a new task. Undo un-ends it.
  - Week button opens a strip of the next 7 days; weekday badges sit on the title's line. Business and Personal share the same code paths.
  - Verified: tsc, eslint, vitest (92 passed, new owner/other/anonymous tests for rename, move and restore); browser: Week strip, inline badge, delete. Not checked: phone width, Safari.
- 2026-11-06 — No list gradient, rows build after a page change (Claude Code, PR #52, merged), from the user's request to delete the gradient, keep the rest of the motion, and make the row entrance visible on page loads:
  - The bottom fade is gone: `AutoHeight` no longer adds `.edge-fade` or animates `--fade`, and both are deleted from `globals.css`. The rest is unchanged: 120ms fade-out, 240ms resize with the new rows held, 180ms row-in, 40ms stagger.
  - Cause of the late entrance: on a client navigation the rows' `row-in` ran while the new page was still fading in (`page-in`, 90ms delay + 340ms), so the page was at opacity 0–0.2 while most rows appeared and only the end was visible. Rows now pause while a view transition is active (`:root:active-view-transition`) and build once the page is there. A full reload has no view transition, so it is unchanged.
  - Verified: tsc, eslint, vitest (88 passed); frame samples of Wishlist → Tasks and Tasks → Wishlist: rows at 0 until the transition ends (~560–670ms after the click), then 40ms apart, done ~300ms later; longest frame gap 18ms (34ms once); a Wishlist switch shows `.rows-wait` and no mask. Not checked: Safari, Firefox (Firefox lacks `:active-view-transition`, so rows there keep the old behaviour), phone width.
- 2026-11-06 — Rows build one after another (Claude Code, merged in PR #51), from the user's request to load list items sequentially, tried first and then kept and applied app-wide:
  - The shared `row-in` entrance (entry, item, shopping, todo, split-day and routine rows, and a list's empty note) now waits `min(sibling-index() - 1, 10) × 40ms`, so each list builds row by row on page load, on client navigation and after a switch. Capped at the 11th row (400ms), so a long list never waits and a row added with `useListMotion`'s enter (680ms) is done before its delay ends. Browsers without `sibling-index()` drop the line and show the rows at once.
  - Verified: tsc, eslint, vitest (88 passed); Wishlist 750+ → All: rows half-visible at 436, 486, 521, 554, 604, 637ms, no long animation frames; client navigation to Tasks, Gym, Food, Wishlist: rows step in 40ms apart (Gym's two lists each count from their own first row); a full reload of Wishlist and Gym caught `row-in` running with 40ms-step delays. Not checked: Safari, Firefox, phone width.
- 2026-11-06 — Switch sequence everywhere (Claude Code, merged in PR #51), from the user's request to apply the finished Tasks motion to the whole app:
  - `AutoHeight` lost its `sequential` prop: every list (Tasks, Wishlist, Food meals and the Past foods sheet, and now the Gym training day and muscle map lists) now resizes in 240ms with the new rows held, fades them in over 180ms, and shows the 120px bottom fade fading back to full opacity in 360ms, whether it grew or shrank (shrinking added the same day at the user's request). The old Food/Wishlist path (72px fade held through a 460ms growth, then shrunk) is deleted, along with `--edge`. Row add/delete motion (`useListMotion` enter/leave) and the 120ms switch fade-out are unchanged.
  - Gym had two list switches without it: the selected training day's exercises and the muscle map's group list. Both now sit in `AutoHeight`, keyed by the day or group, and fade their rows (and the empty note) out with `fadeAll` before switching. Their empty note moved inside the list, like on Tasks and Wishlist. Weight history has no switch (the range only changes the chart), so it is unchanged.
  - Gym verified in the browser: day switches (Friday → Sunday 276 → 324px, Rest → Monday) and muscle switches (Chest → Legs → Abs empty → Arms): old rows or the empty note fade to 0, resize ends at ~390–400ms, fade gone at ~760ms, no long animation frames, longest frame gap 18ms. Switching to or from a rest day mounts or removes the list, so it just appears (rows play row-in).
  - Verified: tsc, eslint, vitest; Wishlist frame samples (All ↔ 750+, All ↔ Under 250, 147–471px): rows at opacity 0 during the resize, resize ends at ~400–430ms, `--fade` 1 → 0, mask removed at ~770–780ms, no long animation frames, longest frame gap 18ms; Tasks re-sampled both ways after the shrink change: the fade also runs on Personal → Business (184 → 64px), starts after the resize (never during it), mask removed at ~780–800ms, longest frame gap 18ms (one 33ms). Not checked: Food (no view switch; its rows use enter/leave, which skip this path), Safari, Firefox, phone width.
- 2026-11-06 — Tasks switch in sequence (Claude Code, merged in PR #51), from the user's request to make the Tasks switch simple and smooth:
  - Tasks only (`<AutoHeight sequential>`): the old rows fade out (unchanged, 120ms), the box resizes in 240ms on `cubic-bezier(0.2, 0, 0, 1)` with the new rows held invisible (`.rows-wait` pauses their `row-in`), then they fade in with `row-in` shortened to 180ms. No bottom fade is drawn during the resize (the rows are invisible, so it only cost repaints); when the list grew, a 120px fade appears as the rows start fading in and, keeping its height, loses its strength in 360ms (new registered `--fade` number 1 → 0 in the mask's alphas), so the bottom rows return to full opacity. First tried 48px shrinking over 180ms (too small to see), then 120px shrinking (the user wanted it to fade, not shrink). Food and Wishlist are unchanged (460ms growth, 72px fade held then shrunk over 480ms).
  - Follow-up the same day, from the user's report that it was laggy and too long: the whole switch went from ~1.1s (grow) to ~0.6s, and the masked repaint of the glass card from ~1.2s to 360ms.
  - Verified: tsc, eslint, vitest (88 passed); Tasks frame samples both ways (Business/Daily ↔ Personal/Daily, 64 ↔ 184px), twice: resize ends at ~410–430ms after the click, `--edge` stays 120px while `--fade` goes 1 → 0.89 → 0.57 → 0.28 → 0.12 → 0.04 → 0.01, mask removed at ~780ms, no long animation frames, longest frame gap 18ms (one 33ms in an earlier run). Not checked: Safari, Firefox, phone width, a slow device; day and tab switches use the same path.
- 2026-11-06 — List fade shrinks out (Claude Code, merged in PR #50), from the user's request that the fade not stop abruptly once the list has resized, everywhere in the app:
  - The fade is now drawn by `.auto-height.edge-fade` from a registered `--edge` length (`@property`). `AutoHeight` holds it at 72px through the growth and the rows' fade-in (720ms), then animates `--edge` to 0 over 480ms on `cubic-bezier(0.4, 0, 0.2, 1)`, so the fade shrinks into the bottom edge instead of sliding away; the class is removed when it reaches 0. Applies to every `AutoHeight` list (Tasks, Food, Wishlist).
  - Verified: tsc, eslint; Tasks frame samples (Business/Daily → Personal/Daily, 64 → 184px): `--edge` 72px through the growth, then 70 → 57 → 32 → 15 → 6 → 2 → 0, class, mask and inline height cleared; no new console errors. Not checked: Safari, Firefox, phone width; Food and Wishlist not frame-sampled (same code path).
- 2026-11-06 — No duplicate tasks (Claude Code, merged in PR #49), from the user's Tasks feedback:
  - `createTodoAction` checks `hasDuplicateTodo` first and returns `{ success: false, error }` instead of creating. Same list = same user, same space, same title ignoring case, and: a one-off task meets what is due that day (one-offs and repeating tasks), a repeating task meets the other repeating tasks.
  - The New task form shows the error under the title (`aria-invalid`, `role="alert"`) and stays open; typing clears it.
  - Not covered: renaming or moving a task onto a duplicate, and two adds racing (`shortcut:` comment; a unique index cannot express the weekday rule).
  - Verified: tests/todos.test.ts 23/23 (new: duplicate rejected, other day/space/user allowed, repeating rule, anonymous denied), tsc, eslint.
- 2026-11-06 — List growth fade everywhere (Claude Code, merged in PR #48), from the user's request to apply the Wishlist motion to the other pages:
  - The `fadeEdge` prop is gone: every `AutoHeight` (Todos list, both Food lists, Wishlist) now grows over 460ms on `cubic-bezier(0.4, 0, 0.2, 1)` with the 72px bottom fade (transparent at the bottom). After user feedback that a hard line still crossed the new rows on Tasks, the fade holds at full strength for the whole growth (the new rows' 260ms fade-in ends inside it) and only then slides below the box over 260ms; a second growth cancels and restarts it. Gym does not use `AutoHeight` and is unchanged.
  - Verified: tsc, eslint; Todos and Wishlist leave no inline height or mask after a switch, no new console errors. Tasks frame samples (Business/Daily → Personal/Daily, 64 → 184px): full fade through the growth and the rows' fade-in, then it slides out, mask and inline height cleared. Food not frame-sampled (same code path). Not checked: Safari, phone width.
- 2026-11-06 — Wishlist growth smoothing (Claude Code, merged in PR #47), from the user's "still feels forced" feedback:
  - Wishlist's `AutoHeight` (`.fade-edge`) grows over 460ms on `cubic-bezier(0.4, 0, 0.2, 1)` instead of 300ms on the front-loaded `--ease`, so it opens instead of snapping. Other lists keep 300ms.
  - The edge fade is 72px with a softer middle stop and shrinks on the same curve and duration as the height (no hold-then-slide), so it is gone exactly when the list arrives.
  - Verified: tsc, eslint; browser frame samples (250–750 → All) show height and fade progress in step, mask and inline height cleared after settling. Not checked: Safari, phone width.
- 2026-11-06 — Wishlist motion (Claude Code), from the user's Wishlist feedback:
  - Add: toast without Undo (Delete is one tap away). Edit: Undo calls `updateWishlistItemAction` with the previous values; on failure the edit stays and a warning shows.
  - Toasts: no `min-width`; the container right-aligns them (centred on phones), so each is as wide as its content.
  - Tab switch from fewer to more rows: rows mounted at once and the growing `overflow: hidden` container cut them with a hard edge. `AutoHeight fadeEdge` now masks the bottom 56px with a top-to-bottom gradient while it grows; the fade holds for the first half and slides below the box, so nothing pops when it is removed.
  - Verified: 87/87 vitest, tsc, eslint; browser: edit then Undo restores the price in the database (checked after reload), add shows no Undo, toast width fits its text, a frozen frame mid-growth shows the faded edge, the mask is gone after settling. Test data restored. Not checked: toasts at phone width, Safari.
- 2026-11-06 — Pages polish 4 (Claude Code), from the user's Health and Gym feedback:
  - Past foods sheet rows reuse `.entry-row` with `delete-icon-btn edit` (the custom `past-food` button style is deleted).
  - Food Assistant: greeting and suggestion chips removed; an empty `.chat-log` collapses but stays as the live region. The client now sends only the last 10 turns (the server rejects more than 20), which fixes long chats failing.
  - Shopping tab: `dashboard-grid` with the list in the wide column and Categories in the aside; stacks below 992px.
  - Gym: `.split-day-select` is excluded from the button hover lift; `row-in` uses fill `backwards` instead of `both`.
  - Verified: 87/87 vitest, tsc, eslint; browser check of Past foods, the Assistant tab, the Shopping columns and the hover on a training day card (card scales, inner button does not). Not checked: phone width of the Shopping tab (reuses the existing grid breakpoint). Console shows a service worker "unknown error fetching the script" in the in-app browser, unrelated to this change.
- 2026-11-06 — Pages polish 3 (Claude Code), from the user's Tasks and Health feedback:
  - Tasks: toggles no longer offer Undo; past days are tickable in production (edit, move and delete stay behind `DEV_EDIT_PAST`). Streak = consecutive ticked due days (`streakOn`), computed from `todo_completions`, so unticking an old day breaks the run from that day.
  - Shopping: Categories card with add, edit (rename or merge) and delete (items go to Other); owner-scoped actions with zod; the item form uses a select. Meal types removed from UI, AI chat, MCP tool and DB.
  - Migrations `0013`-`0015` applied to the local dev and test databases.
  - Verified: 87/87 vitest, tsc, eslint; browser check of ticking a past day (streak 1 there, 2 today, no toast), category add/rename/delete, the item form select, and the Today tab without meal types. Not checked: the Food Assistant against real Gemini after the schema change (covered by unit tests only).
- 2026-11-06 — Pages polish 2 (Claude Code), from the user's Wishlist, Tasks, Money and Health feedback:
  - Tasks, Wishlist and Money removal are in commit `fae57fa`; Health weight in `8a57fbe`; shopping in `b732961` (migration `0012`, applied to the local dev and test databases; existing duplicates merged, 54 rows to 15 in dev).
  - Food Assistant: `buildFoodChatPrompt` plus a JSON response schema replace function calling; `sendFoodChatMessageAction` validates its input with zod; the Past foods sheet (`getPastFoods`, one row per name, newest first) logs a food in one tap with Undo and hides foods already logged that day. Meal type from the hour: 05-11 breakfast, 11-16 lunch, 18-22 dinner, otherwise snack.
  - Verified: 86/86 vitest, tsc, eslint; browser check of the Past foods sheet (log, hide, Undo) and one real Gemini message (two meals logged as snack, totals updated; the first try got a transient 503). Test meals removed from the dev DB afterwards.
- 2026-11-06 — Pages polish (Claude Code), from the user's Wishlist, Tasks and Money feedback:
  - Delete lag: the server call used to start only after the fade and the list waited on it. Now the delete runs during the fade and the toast appears as the row closes (~640ms in dev). Undo on Wishlist and Tasks re-inserts the **same row** (same id and createdAt, new owner-scoped `restoreTodoAction`; wishlist already had one); Money undo re-logs the expense and animates it in.
  - Tasks: the date label opens a calendar (`app/components/date-picker.tsx`, day and month modes, arrows/Escape/Today, values after `max` disabled). One-off tasks can be planned up to `PLAN_AHEAD_DAYS` = 7 days ahead (checked on the server in `assertPlannable`); Daily stays on today. Overdue tasks roll into today only, never into a future day being viewed.
  - Streak (`src/lib/streak.ts`, pure, shared by server and optimistic UI): untick on the same day restores the previous streak, a double tick does not count twice, a stale streak reads 0, and the streak changes on screen at once. The Business "No daily tasks yet." note is keyed so `fadeAll` cannot leave it invisible.
  - Money: category and date share the row's first line; the month label opens the month picker (no future months); hovering or tapping a donut slice or legend row dims the others, thickens the slice and shows its amount and share in the centre (all donuts); the select chevron is a drawn SVG aligned with the date icon; form date inputs on Money and Health weigh-ins stop at today.
  - Verified: tsc, eslint, vitest 82/84 (the 2 food-AI date tests fail the same way without these changes: they compare the local date with UTC and fail between local midnight and UTC midnight); in the browser: Tasks picker and planning, delete/undo, Business empty note, instant streak, Money row layout, donut hover, month picker, chevron, expense delete/undo. Not checked: real iOS Safari, VoiceOver, the donut by keyboard (the legend lists every value).
- 2026-11-05 — Wishlist tweaks (Claude Code): fields and segmented tabs no longer get the hover shadow (they still grow; a focused field shows only its ring), the wishlist Buy button is gone (Delete does the same), row fades are faster (out 180ms, in 260ms). Verified in the browser; tsc, eslint, 77/77 vitest.
- 2026-11-05 — Motion consistency (Claude Code), from the user's sign-in, wishlist and tasks feedback:
  - One hover for everything: `--grow` and `--press` are set per element by a `pointerover`/`focusin` listener in `app/providers.tsx` (4px wider on hover, 8px narrower on press, capped at 1.06 / 0.92 for tiny controls), because a fixed scale grew wide buttons far more than small ones. One `--hover-shadow`, one `--lift` timing. Idle segmented tabs and nav links now lift too; the selected tab stays on its thumb.
  - Focused fields stay lifted with the hover shadow plus the focus ring, so the shadow no longer drops when the pointer leaves.
  - `AutoHeight` marks `data-resizing` while its height animates; new rows wait (paused `row-in`) until the size has settled.
  - Tasks: the list follows a deferred `view` (space, tab, day) that switches only after `fadeAll`; a day change loads in parallel and swaps after the fade. Add and undo-delete call `enter`, undo-add calls `leave`; the empty note fades too. `enter` keeps an id for 2s (was 0.5s) because Tasks refetches before the row mounts.
  - Sign out fades `main > *` (320ms) while signing out, then navigates; a failed sign-out cancels the fade. Continue keeps full opacity while busy.
  - Verified in the browser: grow values per element (4px on a 949px card and a 229px tab), Tasks and Wishlist tab switch (fade 0–240ms, resize ~290–700ms, then rows fade in), focused field shadow after pointer leaves, sign-out (page gone at ~340ms, then sign-in fades in), busy Continue at opacity 1, Tasks add and undo-add (test task removed by the undo); tsc, eslint, 77 Vitest tests, production build. Not checked: real iOS Safari, VoiceOver, touch press on a phone.

- 2026-11-05 — Wishlist polish (Claude Code), from the user's wishlist feedback:
  - `useListMotion`: one in-place fade (opacity, scale 0.97, 3px blur) for every leave, including Buy (the `"buy"` variant and its green flash are gone); `enter` fades in with the reverse; new `fadeAll(then)` fades every row out before a view switch. `row-in` in `globals.css` uses the same blur. Wishlist range tabs move at once while the rows switch only after the old ones faded (`listRange` state).
  - `Modal` is portaled to `document.body`; while it is open, `body:has(> .modal-backdrop)` scales the page content to 0.96 behind the blurred backdrop (backdrop tint 0.4). Inputs, selects and textareas get the shared hover (scale plus soft shadow). The sidebar account card has the card hover, and Sign out spans its width.
  - Fix: lightningcss kept only `-webkit-backdrop-filter` when it came after the unprefixed one, and Chrome ignores the prefixed form, so the modal, tab bar and other glass blurs were missing in Chrome. The prefixed line now comes first everywhere.
  - Shared code, so Health, Money, Tasks and Gym lists also get the new fades, and every modal gets the page shrink and field hover.
  - Verified: tsc, eslint, 77 Vitest tests, production build; in the browser on Wishlist: tab-switch fade then height change, add (space opens, row fades in), Buy and Delete fades, modal blur and page scale, field hover, account card hover, full-width Sign out. Not checked: real iOS Safari, VoiceOver, the other pages by hand.

- 2026-11-05 — List motion (Claude Code), from the user's wishlist feedback:
  - New `app/components/list-motion.tsx`: `AutoHeight` (animates a list's height on any content change, follows rows that animate themselves) and `useListMotion` (`enter(id)` before adding a row, `leave(id, remove, "delete" | "buy")` instead of removing it; WAAPI, skipped under reduced motion). Used on Wishlist, Health meals, shopping and weigh-ins, Money expenses and categories, Tasks and Gym sets. Rows are wrapped in a `Fragment` keyed by the filter so the entrance replays on every tab.
  - Spacing: `--card-pad` on `.surface`; the first and last rows of a list sit the same distance from the card edges; Estimated Investment title is centred with equal spacing around the total.
  - Credits link removed from the sidebar and More menu (user's explicit choice); the attribution file moved to `docs/licenses/muscles-model.md`. Sign out is a `btn-sm`; edit/delete icon buttons use the tinted button background.
  - Verified: tsc, eslint, 77 Vitest tests, production build; in the browser, wishlist spacing (25.6px top and bottom), tab-switch height animation, add/buy grow and collapse, Tasks height animation. Not checked: real iOS Safari, VoiceOver, each page's add/delete flow by hand (only Wishlist and Tasks were exercised). Weigh-in add has no enter animation (the list reloads); whole new shopping category groups appear without the grow step.
- 2026-11-05 — UI cleanup (Claude Code), from the user's phone-test feedback:
  - Removed the Business finances page, actions, lib, validation and test (business **tasks** stay in Tasks). DB schema and migrations are untouched, so `business_incomes` and `space='business'` expenses stay as unused data.
  - Shared UI primitives in `app/globals.css` and `app/components/segmented.tsx` (sliding `Segmented` control, `.toolbar`, `.section-head`, `.btn-sm`, `.empty-note`, `.tag`) now used by every page; all `transition: all` replaced by named properties; pages lost their explanatory notes, badges and info cards (e.g. "72 hour rule").
  - Tasks: "Daily habits" is now "Tasks", with Daily / One-day tabs for Personal and Business. Wishlist: "desire" is now "item", "Bought" is "Buy", items are editable (`updateWishlistItem`, owner-scoped, tested), priority and price share a line under the name, budget and priority-count boxes removed. Money categories have no emojis; New category button restyled. Dates show as d.m.y everywhere (`formatDMY`).
  - Modals: body scroll is locked (position fixed, scroll position restored), the backdrop follows `visualViewport` so the keyboard no longer pushes the page, and inputs are at least 16px with no `autoFocus` so iOS does not zoom. Nav icons no longer blur after a tap (no transforms on `.tab-item`). Next.js dev "N" indicator disabled (`devIndicators: false`). More menu: "Life Tracker" only appears there, Sign out sits on the user's row.
  - Verified: tsc, eslint, 68 Vitest tests, production build (with dummy `AUTH_*` env; the build refuses `AUTH_DEV=true` by design), and mobile 375 px screenshots of Weight, Gym, Food, Money, Tasks, Wishlist and the More menu. Not checked: real iOS Safari (keyboard, zoom, scroll lock), desktop layouts after the cleanup, VoiceOver.
- 2026-11-05 — Phone testing over Wi-Fi (Claude Code): Next.js 16 blocks dev resources from other hosts, so a phone on `http://<LAN-IP>:3000` never hydrated and could not sign in. `next.config.ts` now sets `allowedDevOrigins: ["192.168.*.*"]` (dev only). Also: running `npm run build` while `.next` is shared with `next dev` leaves a stale cache that makes the page reload in a loop; stop dev and delete `.next` after a build.
- 2026-11-04 — Ember Design System (Claude Code):
  - Applied the user-validated artifact choices: palette Ember, SF Pro system stack, Apple spring motion, no visible scrollbars, dark only.
  - New navigation: translucent sidebar on desktop (1024 px and up); floating blurred tab bar on phones with four modules plus a More menu (Tasks, Wishlist, Business, user, Sign out).
  - All UI colors now come from tokens in `app/globals.css`; the leftover iOS hex colors in Weight, Food, Business and Wishlist were mapped to Ember tokens. Added `--on-tint`, press scale on buttons, card entrance rise, border-tint hover and a `prefers-reduced-transparency` fallback.
  - Added `.agents/skills/apple-design/references/project-design-system.md` (tokens, rules, documented deviations) and linked it from the skill; `.claude/skills/*` are symlinks, so they stay in sync.
  - Project clean-up: tracked files reviewed, nothing irrelevant to remove (`.next`, `.env*`, `tsconfig.tsbuildinfo`, `graphify-out/` are git-ignored local files and were left alone); removed the stale "Next" list and the duplicated heading in this file.
  - Verification: lint, typecheck, 67 Vitest tests and the production build (Dockerfile env) pass; checked visually in headless Chrome for Weight, Money (390 px and 1440 px), Gym and Food (1440 px). Self-review then checked Tasks, Wishlist, Business and sign-in at 1440 px, Wishlist, Business and sign-in at 375 px (no horizontal overflow), and the More menu (open, Escape and scrim close, link navigation, 44 px targets). Review fixes: sign-in card off-center (sidebar offset now scoped with `main:has(.side)`), invalid menu ARIA roles removed, last hard-coded `#000` and white border replaced by tokens, five unused CSS tokens deleted. Not checked: Safari/iOS devices, VoiceOver, Gym/Food/Weight/Money on a real phone.

- 2026-11-04 — Total De-sloppification & Native Apple HIG Vector Icons (Unslop + Impeccable + Apple HIG):
  - Completely purged emojis across all 7 modules (headers, buttons, badges, notifications, AI chat prompt pills).
  - Created `app/components/icons.tsx` providing a unified zero-dependency suite of Apple-grade SVG vector symbols (TrashIcon, PlusIcon, CloseIcon, CheckIcon, LockIcon, FlameIcon, DropIcon, FootstepsIcon, ScaleIcon, ChatIcon, InfoIcon, TagIcon, RefreshIcon, BellIcon).
  - Replaced amateur emoji buttons (`🗑️`, `➕`, `✕`, `✓`) with crisp vector action icons with responsive hover/active micro-interactions and touch targets.
  - Enriched accessible `:focus-visible` outline rings across buttons, inputs, selects, and textareas.
  - Verified 0 remaining emojis in `app/`, 0 lint/typecheck errors, 67/67 Vitest tests passing, production build passing.

- 2026-11-04 — Expense Category Concurrency & Deduplication Fix:
  - Eliminated duplicate React child key warnings (`Business Other`, `Inventory & Stock`, etc.).
  - Added PostgreSQL partial unique index `expense_categories_default_unique_idx` on `(space, name) WHERE user_id IS NULL` via migration `0009_cold_golden_guardian.sql`.
  - Added in-memory promise locking and `onConflictDoNothing()` in `ensureDefaultCategories()` to protect against parallel seeding race conditions.
  - Added defensive `Set` deduplication in `getExpenseCategories()` and React select option lists.
  - Cleaned up duplicate rows in dev and test databases; all 67 Vitest tests passing.

- 2026-11-04 — Responsive Bento UI/UX Overhaul (Unslop + UI-UX-Pro-Max + Apple HIG) merged into `main` (PR #22):
  - Fixed narrow single-column layout constraint (`main` expanded from fixed 42rem to responsive 84rem container).
  - Implemented dynamic 2-column Bento Dashboard layout (`.dashboard-grid`, `.dashboard-main`, `.dashboard-aside`) on desktop across all 7 views (Weigh-ins, Gym, Food, Money, Tasks, Wishlist, Business).
  - Modern Apple Liquid Glass aesthetic: calibrated dark/light design tokens, glassmorphism surfaces (`backdrop-filter: blur(20px)`), subtle card borders, and refined elevation shadows.
  - Upgraded Navigation: SVG icons per tab, status beacon, user profile chip, touch-friendly horizontal swipe with scroll snap on mobile, active pill elevation on desktop.
  - Verified 66/66 Vitest tests passing, 0 lint/typecheck errors, production Next.js build verified.

- 2026-11-04 — Tier 3, Iteration 8 (Wishlist & Family Business Dashboard) completed locally on `feat/iteration-8-tier-3`:
  - Schema & DB Migrations: added `wishlist_items` and `business_incomes` tables with positive check constraints and migration `0008_puzzling_screwball.sql`. Applied to both dev and test DBs with role permissions granted to `life_tracker_app`.
  - Reused existing modules per Ponytail: business expenses tracked via `expenses` table with `space = 'business'`, business tasks tracked via `todos` table with `space = 'business'`.
  - Family Business Dashboard at `/business`: monthly net profit calculation (`Net Profit = Total Incomes - Business Expenses`), profit margin %, monthly income recorder, quick business expense logger, and pending business task list.
  - Wishlist at `/wishlist`: private purchase desires with priority filtering (High/Medium/Low), total estimated cost in RON, store links, and one-tap deletion when purchased.
  - Strict AI Data Line Quarantine: verified through tests that business financial data, income records, and wishlist desires are 100% excluded and physically unreachable by Food AI tools and MCP endpoints.
  - Test suites: 66/66 Vitest tests passing across 12 test suites with multi-user isolation and authorization checks. 0 lint/typecheck errors. Production build verified. No Azure resources created.

- 2026-11-04 — Tier 2, Iteration 7 (Food AI Connector) completed locally on `feat/iteration-7-food-ai`:
  implemented dual-protocol connector (`/api/mcp` JSON-RPC 2.0 for Claude Desktop and `/api/ai/food`
  Google Function Calling / REST for Gemini). Personal scoped bearer tokens with SHA-256 storage (`api_tokens` table),
  4 isolated food tools (`log_meal`, `get_daily_food_summary`, `get_recipes`, `add_shopping_item`),
  strict AI Data Line Quarantine (weight, steps, gym, money, tasks, and business data physically unreachable),
  automatic `isEstimated: true` flag and UI badge on AI-logged meals, global kill switch (`AI_CONNECTOR_ENABLED=false`),
  Apple HIG UI under `/food` AI Connector tab with token generator, one-click copy, active token revocation,
  and copyable config snippets for Claude Desktop JSON and Gemini cURL. All 57 tests passing. No Azure resources created.

- 2026-11-04 — Tier 1 complete and Iteration 5 planned: PR #14 squashed and merged into `main` with all CI checks passing. Comprehensive verification of Tier 1 completed and polished (7-day moving average and rate of change added to weigh-in view). Created `docs/iteration-5.md` defining the Money module scope (expenses in RON, personal vs business spaces, fast 2-3 tap entry, category breakdown, strict AI quarantine). Local-first execution on branch `feat/iteration-5-money`.

- 2026-11-04 — Iteration 4 implementation: Fully implemented Food & Nutrition and Body Weight Complete module on `feat/iteration-4-food`. Defined Drizzle schema for `nutrition_targets`, `daily_metrics`, `meals`, `recipes`, `recipe_ingredients`, `meal_plans`, `meal_plan_days`, and `shopping_items` with migration `0004_left_chimera.sql`. Implemented owner-scoped DAL and Server Actions, daily metrics (water tap counter and steps), 7-day weight rolling average and weekly rate of change, smart categorized shopping list populated from recipes, and Apple HIG interface at `/food`. 31 Vitest tests pass (including authorization, math calculations, multi-user isolation), 0 lint/typecheck errors, production build verified. No Azure resources created.

- 2026-11-04 — Iteration 3 merged and Iteration 4 planned: PR #13 squashed and merged into `main` with all CI checks passing; 0 open PRs. Created `docs/iteration-4.md` defining the complete Food & Nutrition module scope (daily macros with 3350 kcal / 170g protein / 300g carbs defaults, water tap counter 3L, steps 10k, 7-day weight moving average and rate of change, weekly meal plan, and auto-generated categorized shopping list). Local-first execution on branch `feat/iteration-4-food`.

- 2026-11-03 — Iteration 3 implementation: Fully implemented the Gym module locally on `feat/iteration-3-gym`. Defined Drizzle schema for `exercises`, `workout_splits`, `workout_split_days`, `workout_split_day_exercises`, `workout_sessions`, and `workout_sets` with migration `0003_curved_lady_bullseye.sql`. Implemented seed data for the 5-day Upper/Lower split, owner-scoped DAL and Server Actions, automatic `!!` anomaly marker detection, in-workout performance context, PR calculation (excluding deload sessions), 5-week deload cycle tracker, and Apple HIG interface at `/gym`. 23 Vitest tests pass (including multi-user isolation and authorization), 0 lint/typecheck errors, production build verified. No Azure resources created.

- 2026-11-03 — Iteration 2 live deployment, verification, and teardown:
  Deployed stage environment in approved region `italynorth`.
  Resolved Bicep dependency ordering by making `containerApp` explicitly depend on
  `registryPrivateDnsGroup`, `vaultPrivateDnsGroup`, and Key Vault secrets, eliminating
  transient private DNS resolution errors (`lookup lifetrackerstageitacr.azurecr.io: no such host`).
  Automated PostgreSQL schema bootstrap and table migration via `Microsoft.App/jobs`
  (`lt-migrate-stage`), executing least-privilege role creation (`life_tracker_app`) and
  Drizzle schema creation within the private VNet.
  Verified live HTTPS endpoint (`/health` -> 200), authorization rejection (`/api/weight` -> 401),
  CSRF protection (`POST /api/weight` -> 403), security headers (HSTS, CSP, X-Frame-Options,
  Permissions-Policy), and live Microsoft Entra ID OIDC redirect (`/api/auth/signin/azure-ad` -> 302
  to `login.microsoftonline.com`). Verified network isolation (`publicNetworkAccess: Disabled` on
  PostgreSQL, Key Vault, and ACR). Completed full synchronous teardown; 0 project resources remain.
  All 14 unit and contract tests passing.

- 2026-11-03 — Phase 2B infrastructure root cause fixes and regional migration:
  evaluated `polandcentral` (Burstable unsupported on subscription policy) and
  `belgiumcentral` (Burstable capacity exhausted in data center). Cleaned up via
  synchronous teardowns. Corrected Key Vault Secrets User role definition GUID to
  `4633458b-17de-408a-b874-0445c86b69e6` (verified directly against Azure CLI role definitions).
  Generated unique deterministic Key Vault resource names (`${suffix}kv${uniqueString(rg.id)}`)
  to avoid soft-delete purge-protection retention conflicts. Added regional `registryName`
  and token-based non-interactive ACR authentication (`az acr login --expose-token`) to
  resolve global Traffic Manager DNS cache issues. User approved `italynorth` as the
  next target region. 14 local tests pass.

- 2026-11-03 — Azure 2B preparation and audit: verified read-only regional
  provisioning restrictions (`westeurope` restricted; `belgiumcentral`,
  `northeurope`, `francecentral` permitted). Recalculated ACR Premium and
  PostgreSQL B1ms/B2s costs. Enhanced `infra/main.bicep` with diagnostic settings
  for PostgreSQL, Key Vault, and ACR, consumption budget alert resource, and
  configurable `postgresSku`. Updated `scripts/azure-deploy.sh` to require what-if
  preview and multi-stage approval. 14 local tests pass. No Azure resources created.

- 2026-11-03 — Security audit fix: mutable production image tags were removed
  from the Bicep contract and deploy validation; CI SBOM/container scanning and
  deterministic test setup were added. No Azure resources created.
- 2026-11-03 — Merged Dependabot PRs #2–#4 after successful CI and verified
  post-merge `main` CI. PR #5 uses the official TypeScript 7.0/6.0
  compatibility aliases so `typescript-eslint` keeps its supported TypeScript
  6 API while `tsc` runs TypeScript 7; lint, typecheck, migration, tests,
  production build, container build, lockfile install and audit checks passed
  locally. No Azure resources created.
- 2026-11-03 — Reconciled the merged Iteration 2 plan from PR #7 with the merged local implementation in PR #8; retained the plan as the phase 2B runbook and corrected stale approval wording. No Azure resources created.
- 2026-11-03 — PR #1 CI secret scan fixed with the GitHub token, pull-request read permission and full history required for pull-request scans; local lint, typecheck, migration and authorization tests passed.
- 2026-11-03 — Iteration 1 implemented locally: security spine, weigh-in slice, PostgreSQL, tests and CI. Validation passed; no Azure resources created.
- 2026-11-03 — Detailed plan for iteration 2 added in `docs/iteration-2.md` and approved; its local 2A phase was then completed. No Azure resources created.
- 2026-11-03 — Iteration 2A completed locally: OIDC production configuration, private-network Bicep template, guarded Azure scripts and CI validation added. Lint, typecheck, production build, Bicep compile and 8 tests pass. Phase 2B paused; no Azure resources created.
- 2026-11-03 — Phase 2B deployment preview passed in `belgiumcentral`, but the approved deployment failed before completion: PostgreSQL B1ms had no regional capacity and ACR Basic rejected disabled public access. Partial resources were fully torn down; no Azure resources remain. Retry requires a cost/SKU decision.
- 2026-11-03 — Verified the Life Tracker resource group and resources are absent. `NetworkWatcherRG/NetworkWatcher_belgiumcentral` is a pre-existing subscription resource and is excluded from project teardown. Teardown script strengthened to wait for deletion and verify absence.
- 2026-11-03 — PR #8 HIGH findings fixed locally: private ACR SKU and Key Vault-backed Container App runtime contract. No Azure resources created; the revised Premium cost still requires explicit approval. Teardown script strengthened to wait for deletion and verify absence.
- 2026-11-03 — Final PR #8 review found that a system-assigned identity could race its RBAC grants during initial Container App creation. Replaced it with a pre-created user-assigned identity and made app creation wait for the ACR and Key Vault role assignments. No Azure resources created.
- 2026-11-02 — Iteration 1 plan written and approved (`docs/iteration-1.md`); the user deferred implementation. No application code yet.
- 2026-11-02 — Spec approved; threat model v1, data inventory and risk register written (`docs/threat-model.md`, `docs/security/`). No application code yet.
- 2026-11-02 — Planning Q&A for all modules, tiers, stack direction (TypeScript, Entra External ID, queue for push). Spec drafted. No application code yet.
- 2026-11-02 — Added code-review-guide, audited the 3 project skills, created project-setup, cleanup. No application code yet.
- 2026-11-02 — Initial setup (Claude Code). No application code yet.
