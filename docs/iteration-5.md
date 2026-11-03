# Iteration 5: Money Module — Personal & Business Expenses (APPROVED 2026-11-04, IN PROGRESS)

**Iteration 5 is the only thing to implement now.** Later iterations exist only as an estimate in `docs/roadmap.md`; do not start any of them. When iteration 5 is done, stop and wait: the user and the agent agree the next iteration together first.

Approved by the user on 2026-11-04.
Goal: implement the complete Money module locally (data model, fast expense logging, personal vs. business spaces, category breakdown, monthly analytics, authorization tests, Apple HIG UI), strictly verified on local PostgreSQL without intermediate Azure deployments.

Specification reference: `docs/spec.md` (Module: Money) and Tier 2 roadmap in `docs/roadmap.md`.

---

## Scope

- **In:**
  - **Database schema & migrations (Drizzle ORM):**
    - `expenses`: `id`, `userId`, `space` (enum: 'personal' | 'business'), `amount` (numeric 10, 2), `currency` ('RON'), `category` (varchar 50), `date` (date), `notes` (varchar 255), `createdAt` (timestamp).
    - `expense_categories`: preloaded standard categories + user custom categories.
  - **Data Access Layer & Business Logic:**
    - Owner-scoped DAL with multi-tenant isolation (`userId`).
    - Support for `space` segregation: toggle between `personal` and `business` views.
    - Quick-entry helper: tracks and preselects the user's most-used category.
    - Monthly expense aggregation: total spent in the selected month and breakdown per category with percentages.
  - **Security & Authorization:**
    - Strict owner isolation: no cross-user access to financial records.
    - **AI Data Line:** finance data is strictly quarantined from any AI or MCP tool (per spec and `AGENTS.md`).
    - Input validation with Zod (positive amounts, valid space, sanitized text).
    - Full Vitest authorization suite for Money operations (owner allowed, foreign user denied, unauthenticated denied).
  - **User Interface (Apple HIG):**
    - Navigation header updated to 4 tabs: **Gym Split**, **Food & Macros**, **Weigh-ins**, and **Money**.
    - Space switcher (`Personal` vs `Business`) as a prominent segmented control.
    - Fast 2–3 tap expense logging form (large numeric amount input with "RON" suffix, preselected category, date, optional note).
    - Monthly summary card with category progress bars and totals.
    - Filterable chronological expense history with deletion.
- **Out (deferred to later iterations / out of scope):**
  - Income, budget planning, recurring subscriptions (deferred per spec).
  - Invoicing, customer management, inventory (part of Tier 3 Family Business dashboard).
  - Bank API / Plaid integration (manual tracking only per spec).
  - Live Azure deployment (local-first execution).

---

## Decisions Made

1. **Local-first execution:** Developed and verified locally on PostgreSQL and Vitest.
2. **Currency:** Strict `RON` currency format.
3. **Space segregation:** Uses `space: 'personal' | 'business'` column in the shared table, allowing Tier 3 Business to reuse this module seamlessly.
4. **AI Isolation:** Financial records are strictly quarantined and will never be exposed to any AI connector.

---

## Runbook for the implementing agent

### 0. Pre-flight
- [x] 0.1 Confirm active branch `feat/iteration-5-money` and clean working tree.
- [x] 0.2 Verify existing 31 Vitest tests pass on `life_tracker_test` (`npm test`).

### 1. Database Schema & Migrations
- [x] 1.1 Define Drizzle schema in `src/db/schema.ts` for `expenses` and `expense_categories`.
- [x] 1.2 Generate migration script via `npx drizzle-kit generate`.
- [x] 1.3 Apply migrations to local PostgreSQL test and dev databases, granting permissions to `life_tracker_app`.
- [x] 1.4 Update `scripts/db-init.cjs` for future cloud parity.

### 2. Seed Data & Preloaded Categories
- [x] 2.1 Implement seed helper in `src/lib/money-seed.ts` providing standard categories for personal and business spaces.

### 3. Data Access Layer & Business Logic
- [x] 3.1 Implement DAL functions in `src/lib/money.ts`:
  - List expenses filtered by user, space, and optional month.
  - Log, edit, and delete expense.
  - Calculate monthly summary (total, category breakdown, count).
  - Get most-used category for quick preselection.
  - Create custom expense category.
- [x] 3.2 Unit tests for monthly aggregations and calculations in `tests/money.test.ts`.

### 4. Server Actions & Security Layer
- [x] 4.1 Define Zod schemas in `src/lib/validations/money.ts`.
- [x] 4.2 Implement server actions in `src/app/actions/money.ts` guarded by `requireUser()`.
- [x] 4.3 Full Vitest authorization suite for Money operations (owner, foreign user, anonymous).

### 5. User Interface — Apple HIG (`/money`)
- [x] 5.1 Update top navigation header with 4 tabs: **Gym Split**, **Food & Macros**, **Weigh-ins**, and **Money**.
- [x] 5.2 Build `/money` dashboard:
  - Space segmented control (`Personal` vs `Business`).
  - Fast expense entry form (2–3 taps).
  - Monthly summary card (total RON spent, category distribution).
  - Expense history list with category badge and delete action.

### 6. Verification & Handoff
- [x] 6.1 Run lint (`npm run lint`), typecheck (`npm run typecheck`), and tests (`npm test`).
- [x] 6.2 Test production build (`next build`).
- [x] 6.3 Update `docs/STATUS.md` and `docs/decisions.md`.
