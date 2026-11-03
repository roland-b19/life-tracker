# Iteration 6: Daily To-Do & Task Management + Notifications Architecture (APPROVED 2026-11-04, IN PROGRESS)

**Iteration 6 is the only thing to implement now.** Later iterations exist only as an estimate in `docs/roadmap.md`; do not start any of them. When iteration 6 is done, stop and wait: the user and the agent agree the next iteration together first.

Approved by the user on 2026-11-04.
Goal: implement the complete Daily To-Do module locally (data model, automatic carry-over rollover, streak tracking for recurring habits, personal vs. business spaces, daily completion statistics, authorization tests, Apple HIG UI, and PWA Web Push service worker scaffold), verified on local PostgreSQL without intermediate Azure deployments.

Specification reference: `docs/spec.md` (Module: Daily to-do) and Tier 2 roadmap in `docs/roadmap.md`.

---

## Scope

- **In:**
  - **Database schema & migrations (Drizzle ORM):**
    - `todos`: `id`, `userId`, `space` (enum: 'personal' | 'business'), `title` (varchar 150), `isRecurring` (boolean), `recurrencePattern` (varchar 20: 'daily' | 'weekly' | 'none'), `dueDate` (date), `reminderTime` (varchar 10: e.g. "09:00"), `isCompleted` (boolean), `completedAt` (timestamp), `isCarriedOver` (boolean), `streak` (integer, default 0), `lastCompletedDate` (date), `createdAt` (timestamp).
    - `push_subscriptions`: `id`, `userId`, `endpoint`, `p256dhKey`, `authKey`, `createdAt`.
  - **Data Access Layer & Business Logic (`src/lib/todos.ts`):**
    - Owner-scoped DAL with multi-tenant isolation (`userId`).
    - Automatic rollover: when loading today's tasks, unfinished one-off tasks from past dates are automatically rolled over to today and flagged `isCarriedOver = true`.
    - Streak tracking: for recurring daily tasks, completing today's task checks if it was completed yesterday to increment streak; otherwise resets to 1. Unchecking decrements.
    - Daily statistics: total tasks, completed tasks, and completion percentage for the active day.
    - Space segregation: personal vs. business filtering.
  - **Security & Authorization:**
    - Strict owner isolation: no cross-user access to tasks or push subscriptions.
    - Input validation with Zod (`createTodoSchema`, `toggleTodoSchema`, `deleteTodoSchema`, `pushSubscriptionSchema`).
    - Full Vitest authorization and business logic test suite (`tests/todos.test.ts`).
  - **User Interface (Apple HIG):**
    - Top navigation updated to 5 tabs: **Gym Split**, **Food & Macros**, **Weigh-ins**, **Money**, **Daily Tasks**.
    - Space switcher (`Personal` vs `Business`) as segmented control.
    - Daily progress overview (visual completion rate: e.g. "4/5 completed • 80%").
    - Clean group list:
      - **Today's Tasks** (with orange badge `Carried Over` for rolled over tasks).
      - **Recurring Habits** (with badge `🔥 X days streak`).
    - Quick task creation form (title, recurrence toggle, optional reminder time).
    - Web Push subscription button & Service Worker (`public/sw.js`).
- **Out (deferred to later iterations):**
  - Cloud Azure Storage Queue / Azure Functions deploy (verified in Phase 2B/9).
  - External calendar sync (Google/Apple Calendar).

---

## Decisions Made

1. **Local-first execution:** Implemented and verified locally on PostgreSQL and Vitest.
2. **Space segregation:** Uses `space: 'personal' | 'business'` column in the shared table, allowing Tier 3 Business to reuse this module.
3. **Carry-over behavior:** Unfinished one-off tasks automatically migrate to today with `isCarriedOver = true` so nothing gets lost.
4. **Streak calculation:** Calculated deterministically based on consecutive completion dates.

---

## Runbook for the implementing agent

### 0. Pre-flight
- [x] 0.1 Create active branch `feat/iteration-6-todos` from `main` with clean working tree.
- [x] 0.2 Confirm existing 40 Vitest tests pass (`npm test`).

### 1. Database Schema & Migrations
- [x] 1.1 Define Drizzle schema in `src/db/schema.ts` for `todos` and `push_subscriptions`.
- [x] 1.2 Generate migration script via `npx drizzle-kit generate`.
- [x] 1.3 Apply migrations to local PostgreSQL test and dev databases, granting permissions to `life_tracker_app`.
- [x] 1.4 Update `scripts/db-init.cjs` for future cloud parity.

### 2. Data Access Layer & Business Logic
- [x] 2.1 Implement DAL functions in `src/lib/todos.ts`:
  - `getDailyTodos(userId, space, date)` with automatic rollover for past unfinished one-off tasks.
  - `createTodo(userId, input)`.
  - `toggleTodo(userId, todoId, isCompleted)` with streak increment/decrement logic.
  - `deleteTodo(userId, todoId)`.
  - `getTodoStats(userId, space, date)`.
  - `savePushSubscription(userId, input)`.

### 3. Server Actions & Security Layer
- [x] 3.1 Define Zod schemas in `src/lib/validations/todos.ts`.
- [x] 3.2 Implement server actions in `src/app/actions/todos.ts` guarded by `requireUser()`.
- [x] 3.3 Full Vitest authorization suite for To-Do operations in `tests/todos.test.ts`.

### 4. User Interface — Apple HIG (`/todos`)
- [x] 4.1 Update top navigation header with 5 tabs: **Gym Split**, **Food & Macros**, **Weigh-ins**, **Money**, **Daily Tasks**.
- [x] 4.2 Build `/todos` dashboard:
  - Space segmented control (`Personal` vs `Business`).
  - Daily completion statistics card.
  - Separate sections for One-off Tasks and Recurring Habits with streak badges and carry-over labels.
  - Quick task entry form.
  - Push notification toggle button.
- [x] 4.3 Add Service Worker file in `public/sw.js` for Web Push notifications.

### 5. Verification & Handoff
- [x] 5.1 Run lint (`npm run lint`), typecheck (`npm run typecheck`), and tests (`npm test`).
- [x] 5.2 Test production build (`next build`).
- [x] 5.3 Update `docs/STATUS.md` and `docs/decisions.md`.
- [x] 5.4 Commit, push, and create pull request.
