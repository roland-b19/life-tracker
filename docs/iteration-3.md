# Iteration 3: Gym Module (APPROVED 2026-11-03, IN PROGRESS)

**Iteration 3 is the only thing to implement now.** Later iterations exist only as an estimate in `docs/roadmap.md`; do not start any of them. When iteration 3 is done, stop and wait: the user and the agent agree the next iteration together first.

Approved by the user on 2026-11-03.
Goal: implement the complete Gym module locally (data model, logging, business logic, authorization tests, Apple HIG UI), strictly tested and verified on local PostgreSQL without intermediate Azure deployments.

Specification reference: `docs/spec.md` (Module: Gym / sport) and sample data `docs/spec/gym-sample.md`.

---

## Scope

- **In:**
  - **Database schema & migrations (Drizzle ORM):**
    - `exercises`: preloaded common library + custom user-created exercises (muscle group, equipment type: barbell, dumbbell, cable/plates, machine, bodyweight).
    - `workout_splits` & `workout_split_days`: custom routines (seeded with the user's 5-day Upper/Lower split: Sun Upper chest, Mon Legs hamstrings, Wed Upper back, Thu Legs quads, Fri Arms).
    - `workout_split_day_exercises`: planned exercises per day with target sets and rep ranges (e.g. 2 working sets, 5–8 reps).
    - `workout_sessions`: actual performed sessions (date, duration, deload flag, notes).
    - `workout_sets`: performed sets (`reps x load`), load types (free weight in `kg`, cable/machine in `plates` + optional micro `extra_kg`, `bodyweight` + optional `extra_kg`).
    - Failure indicator (0 RIR) and partial reps toggle.
    - `!!` anomaly flag: automatic when reps < target rep range; manual with structured reason (`too_heavy`, `pain`, `form`, `other`) and optional note.
  - **In-workout context & progression logic:**
    - Display last session's performance (`reps x load`), personal record (PR), and last note when logging an exercise.
    - Progressive overload suggestion when the upper bound of the target rep range is achieved.
    - Deload counter & reminder: track weeks from last deload (5-week cycle), excluding deload sessions from progression charts.
  - **Security & Authorization:**
    - Strict multi-tenant isolation: every record scoped to `userId` from authenticated session (`requireUser()`).
    - Input validation with Zod (positive loads, non-zero reps, sanitized notes).
    - Full Vitest authorization suite: owner allowed, other user denied, unauthenticated denied.
  - **User Interface (Apple HIG):**
    - High-contrast, friction-free `/gym` dashboard and in-workout logger (large tap targets, quick entry).
    - Shared navigation between Weigh-ins (`/`) and Gym (`/gym`).
    - Split/Routine viewer and deload cycle indicator card.
- **Out (deferred to later iterations):**
  - Live Azure deployment (deferred per user instruction to save time and Azure credits; development is local-first).
  - Apple Health / Apple Fitness / Strava integrations (out of scope per `docs/spec.md`).
  - Remote MCP AI connector for workouts (deferred to Iteration 7).
  - Complex plate calculators or barbell math helpers.

---

## Decisions Made

1. **Local-first execution:** No Azure deployment during Iteration 3. All validation is performed against local PostgreSQL container, Vitest, and browser testing.
2. **Exercise Library:** Seeded with standard compound and isolation movements covering the user's 5-day split, plus full support for user-created custom exercises.
3. **Split structure:** User's 5-day Upper/Lower split seeded as the default plan template.
4. **Load model:** Exact representation of the user's log format (`kg`, `plates` + `extra_kg`, `bodyweight` + `extra_kg`).
5. **Anomaly flag (`!!`):** Automated trigger (reps < min target reps) + manual modal/dropdown with reason.

---

## Runbook for the implementing agent

Work top to bottom. Commit frequently on branch `feat/iteration-3-gym` with Conventional Commits and trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

### 0. Pre-flight
- [x] 0.1 Confirm active branch `feat/iteration-3-gym` and clean working tree.
- [x] 0.2 Verify local PostgreSQL container is running (`docker compose up -d`).
- [x] 0.3 Verify existing test suite passes (`npm test`).

### 1. Database Schema & Migrations
- [x] 1.1 Define Drizzle schema in `src/db/schema.ts` for `exercises`, `workout_splits`, `workout_split_days`, `workout_split_day_exercises`, `workout_sessions`, and `workout_sets`.
- [x] 1.2 Generate migration script via `npx drizzle-kit generate`.
- [x] 1.3 Apply migrations to local PostgreSQL test and dev databases and verify table constraints and foreign keys.

### 2. Seed Data
- [x] 2.1 Create seed helper for default exercises (covering chest, back, legs, shoulders, arms, abs, calves).
- [x] 2.2 Seed the user's default 5-day Upper/Lower split with target rep ranges and sets.

### 3. Data Access Layer & Business Logic
- [x] 3.1 Implement owner-scoped DAL functions in `src/lib/gym.ts`:
  - Fetch splits and active split days.
  - Start/finish workout session.
  - Log set with automatic `!!` anomaly detection against target range.
  - Query previous session performance and calculate progressive overload suggestion.
  - Calculate 5-week deload tracker state.
- [x] 3.2 Unit tests for business logic in `src/lib/gym.test.ts`.

### 4. Server Actions & Security Layer
- [x] 4.1 Define Zod schemas for all Gym mutations in `src/lib/validations/gym.ts`.
- [x] 4.2 Create server actions in `src/app/actions/gym.ts` (or route handlers) guarded by `requireUser()`.
- [x] 4.3 Ensure no mass-assignment vulnerabilities, sanitize user input, and preserve strict multi-user tenant isolation.

### 5. Authorization & Contract Tests
- [x] 5.1 Implement Vitest authorization tests for Gym operations:
  - User A can log, view, and modify their own workouts.
  - User B cannot read or modify User A's workout sessions, sets, or custom exercises.
  - Anonymous requests are rejected (401 / redirect).
  - Anomaly validation checks and deload calculations verified.

### 6. User Interface — Apple HIG (`/gym`)
- [ ] 6.1 Add global top navigation header connecting Weigh-ins (`/`) and Gym (`/gym`).
- [ ] 6.2 Implement `/gym` overview page:
  - Deload status card (e.g. *"Week 3 of 5 until deload"*).
  - 5-day Split view (Sun Upper, Mon Legs, Wed Upper, Thu Legs, Fri Arms).
  - Start Workout button for today's routine (or select any day).
- [ ] 6.3 Implement In-Workout Session Logger:
  - Exercise cards showing target sets x reps.
  - Contextual previous session hint ("Last time: 10 x 40 kg").
  - Fast set logger: input reps, load (`kg`, `plates`, `bodyweight`), failure toggle, partial reps toggle.
  - Visual `!!` anomaly badge and reason selector.
- [ ] 6.4 Apply Apple HIG styling: system font typography, generous touch targets ($\ge 44 \times 44\text{ pt}$), accessible contrast, keyboard-friendly navigation.

### 7. Verification & Handoff
- [ ] 7.1 Verify linting (`npm run lint`), type checking (`npm run typecheck`), and tests (`npm test`).
- [ ] 7.2 Verify local browser functionality end-to-end.
- [ ] 7.3 Update `docs/STATUS.md` and `docs/decisions.md`.
