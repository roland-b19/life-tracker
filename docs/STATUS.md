# Status

_Last updated: 2026-11-06 by Claude (pages polish 3: tick past days, no Undo on task toggles, shopping categories card, meal types removed)_

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
Pages polish 3 is on branch `feat/pages-polish-3` (PR open, not merged): ticking or reopening a task has no Undo; past days can be ticked in every build, with streaks computed from the ticked days (new table `todo_completions`, streak columns dropped, existing streaks backfilled); shopping categories are managed in their own Categories card (add, rename, delete, "other" built in; new table `shopping_categories`) and picked from a select in the item form; meal types are removed everywhere (column dropped). Adds migrations `0013_todo_completions`, `0014_shopping_categories`, `0015_drop_meal_type` (GRANTs inside); they must be applied wherever `db:migrate` runs. `scripts/db-init.cjs` mirrors them. No new dependency.
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
    - In-App Food AI Chat: Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash`) via native fetch. The system prompt (`buildFoodChatPrompt` in `src/lib/food-ai-chat.ts`) carries the day, local time, targets, meals already logged, recipes and past foods, never weight or steps; the model answers JSON `{reply, meals[]}`, each meal is validated like a hand-entered one and logged as an estimate. No shopping from the chat.
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
