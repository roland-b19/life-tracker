# Iteration 4: Food & Nutrition + Body Weight Complete (APPROVED 2026-11-04, IN PROGRESS)

**Iteration 4 is the only thing to implement now.** Later iterations exist only as an estimate in `docs/roadmap.md`; do not start any of them. When iteration 4 is done, stop and wait: the user and the agent agree the next iteration together first.

Approved by the user on 2026-11-04.
Goal: implement the complete Food & Nutrition module and enhanced Body Weight analytics locally (data model, daily metrics, meal logging, weekly plan, auto-generated shopping list, authorization tests, Apple HIG UI), strictly verified on local PostgreSQL without intermediate Azure deployments.

Specification reference: `docs/spec.md` (Module: Food + body weight) and sample targets in `docs/spec/gym-sample.md`.

---

## Scope

- **In:**
  - **Database schema & migrations (Drizzle ORM):**
    - `nutrition_targets`: user daily targets (default 3350 kcal, 170 g protein, 300 g carbs, 80 g fat, 3000 ml water, 10000 steps).
    - `daily_metrics`: daily water consumption (ml), steps count, and optional notes scoped to user and date.
    - `meals`: daily logged meals (meal type: breakfast, lunch, dinner, snack; name, kcal, protein, carbs, fat) scoped to user and date.
    - `recipes` & `recipe_ingredients`: favorite recipes with ingredient items (name, amount, unit, category: meat, produce, dairy, bakery, pantry, other) and macros.
    - `meal_plans` & `meal_plan_days`: 7-day weekly repeating meal plan.
    - `shopping_items`: auto-generated from weekly meal plan or added manually, categorized, with checked/bought state.
    - Enhanced body weight analytics calculated over `weight_entries`: 7-day rolling average and weekly rate of change.
  - **Data Access Layer & Business Logic:**
    - Owner-scoped DAL with multi-tenant isolation (`userId`).
    - Water tracker with tap counter (+250 ml, +500 ml).
    - 7-day moving average calculation and weekly weight trend (+/- kg per week).
    - Automatic shopping list aggregation from weekly meal plan recipes.
  - **Security & Authorization:**
    - All routes and server actions guarded by `requireUser()`.
    - Input validation with Zod schemas.
    - Vitest authorization tests (owner allowed, other user denied, unauthenticated denied).
  - **User Interface (Apple HIG):**
    - Segmented navigation with 3 tabs: **Gym Split**, **Food & Macros**, **Weigh-ins**.
    - `/food` dashboard: daily macro progress cards (calories, protein, carbs, fat, water, steps), meal log by meal type, weekly meal plan viewer, categorized shopping list.
- **Out (deferred to later iterations):**
  - Remote AI / MCP connector (Iteration 7).
  - External commercial food barcode database / API.
  - Live Azure deployment (kept local-first).

---

## Decisions Made

1. **Local-first execution:** Developed and verified locally on PostgreSQL and Vitest.
2. **Nutrition defaults:** Seeded with the user's real targets: 3350 kcal, 170 g protein, 300+ g carbs, 3 L water, 10,000 steps.
3. **Weight analytics:** Non-destructive enhancement built on top of the existing `weight_entries` table.
4. **Shopping list:** Categorized list (meat, produce, dairy, bakery, pantry, other) generated directly from the weekly meal plan.

---

## Runbook for the implementing agent

### 0. Pre-flight
- [x] 0.1 Confirm active branch `feat/iteration-4-food` and clean working tree.
- [x] 0.2 Verify existing 23 Vitest tests pass on `life_tracker_test` (`npm test`).

### 1. Database Schema & Migrations
- [x] 1.1 Define Drizzle schema in `src/db/schema.ts` for `nutrition_targets`, `daily_metrics`, `meals`, `recipes`, `recipe_ingredients`, `meal_plans`, `meal_plan_days`, and `shopping_items`.
- [x] 1.2 Generate migration script via `npx drizzle-kit generate`.
- [x] 1.3 Apply migrations to local PostgreSQL test and dev databases, granting permissions to `life_tracker_app`.
- [x] 1.4 Update `scripts/db-init.cjs` for future cloud parity.

### 2. Seed Data & Defaults
- [x] 2.1 Implement seed helper in `src/lib/food-seed.ts` providing user default targets (3350 kcal, 170g protein, 300g carbs, 3000ml water, 10000 steps) and sample high-protein recipes.

### 3. Data Access Layer & Business Logic
- [x] 3.1 Implement DAL functions in `src/lib/food.ts`:
  - Daily metrics: get/update daily water, steps, macros sum.
  - Meal management: log, list, and delete meals.
  - Body weight analytics: 7-day rolling average and weekly change rate.
  - Shopping list: generate aggregated list from meal plan, toggle item, add custom item.
- [x] 3.2 Unit tests for weight trend calculations and shopping list aggregation in `tests/food.test.ts`.

### 4. Server Actions & Security Layer
- [x] 4.1 Define Zod schemas in `src/lib/validations/food.ts`.
- [x] 4.2 Implement server actions in `src/app/actions/food.ts` guarded by `requireUser()`.
- [x] 4.3 Full Vitest authorization suite for Food operations (owner, foreign user, anonymous).

### 5. User Interface — Apple HIG (`/food`)
- [x] 5.1 Update top navigation header with 3 tabs: **Gym Split**, **Food & Macros**, **Weigh-ins**.
- [x] 5.2 Build `/food` dashboard:
  - Progress summary (calories, protein, carbs, fat against targets).
  - Water quick tap counter (+250ml, +500ml) & steps logger.
  - Daily meals logger grouped by meal type.
  - 7-day weight trend card.
  - Interactive shopping list with categories and checkboxes.

### 6. Verification & Handoff
- [x] 6.1 Run lint (`npm run lint`), typecheck (`npm run typecheck`), and tests (`npm test`).
- [x] 6.2 Test production build (`next build`).
- [x] 6.3 Update `docs/STATUS.md` and `docs/decisions.md`.
