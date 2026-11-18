---
summary: What Life Tracker is, who uses it, its feature areas, domain rules, glossary and configuration values.
last_verified: 2026-11-18
---

# Product and domain

## Product
- A personal app for one user, the owner: wishlist, tasks, gym, food and health tracking. Not a public product; there is no sign-up flow for others.
- It started as a university Azure course project. Now it is live for personal use on Vercel + Neon ([D-001](decisions/general.md)). The Azure setup (`infra/`, `scripts/azure-*.sh`) is kept for course demos and deployed only on request.
- Feature areas (code map in [architecture](architecture.md)):
  - **Wishlist:** items with a price; the price range (low, medium, high) is derived from the price, never picked by hand.
  - **Tasks:** spaces personal and business, daily or weekly recurrence, optional reminder time, overdue tasks carry over.
  - **Gym:** training split with days and exercises, sessions, sets, deload weeks, progress, custom exercises, a 3D muscle map.
  - **Food and health** (route `/health`, the home page; `/food` redirects there): Today (meals, water, steps), Weight, Shopping, and an Assistant tab that turns free text into logged meals.
  - **Settings:** connect a Claude token (the page exists only with the Claude flag on). Export of all data as plain text is the "Export data" button in the navigation menu; push reminders are set on Tasks.
- The UI is dark only. The Wishlist page is the visual reference; every page matches it. Every change has an Undo toast.
- Out of scope: other users' data, light theme, sending health data to an AI provider.

## Domain rules
- Price range from price: under 250 low, under 750 medium, otherwise high (`src/lib/rules.ts`).
- Water and steps can be edited only for today and yesterday; tasks only for today and one day either side. Past days are read-only.
- Weight is one entry per day, 20 to 500 kg.
- Nothing is soft-deleted. Undo re-inserts the row under its old id.
- Export holds all of a user's data but never the Claude token or push subscriptions.
- No health data is ever sent to an AI provider. The Claude chat runs only through a local `claude` CLI, with the flag off on Vercel and Azure ([architecture](architecture.md), Flags).

## Glossary
- **Space:** a task group, `personal` or `business`.
- **Deload week:** a lighter gym week, stored per user and week start.
- **Split:** the weekly training plan; its days map to weekdays (0 is Sunday).
- **APP_TZ:** `Europe/Bucharest`, the calendar the user lives in.

## Configuration
- `APP_TZ = "Europe/Bucharest"`, a constant in `src/lib/format-date.ts`. Servers run in UTC, so "today" is computed in this zone. The week starts on Sunday. Reminder times such as 09:00 are Bucharest time.
- Query budgets per page with two years of data (gym 12 queries, food 12, todos 11, wishlist 3) protect the Neon and Vercel free-tier limits; they are enforced by `tests/query-count.test.ts`.
