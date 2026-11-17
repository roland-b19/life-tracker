---
summary: Decisions on the product's hosting and overall shape, with their reasons and rejected alternatives.
last_verified: 2026-11-18
---

# Decisions: general

Newest at the bottom. Entry format: `.claude/skills/maintain-kb/assets/decisions.md`. Superseded and obsolete decisions move to `archive/decisions.md`.

## D-001: Run live on Vercel + Neon; keep Azure for course demos only (2026-11-18)
- **Why:** Cost: Vercel and Neon free tiers cost nothing, Azure costs money. Simplicity: less infrastructure to run for one user. Recorded from the owner's answer on 2026-11-18; the move itself happened earlier in November 2026.
- **Rejected:** Running the app on Azure permanently (costs money, more to operate for personal use).
- **Status:** active. Consequences: push reminders are off on the Vercel variant (the worker needs Azure Storage Queue), and the free-tier query budgets are tested ([domain](../domain.md)).

## D-002: One check command, `npm run check`, run by the Stop hook and CI (2026-11-18)
- **Why:** The verify skill needs one headless command; CI runs it as written. It chains lint, typecheck, Vitest and the KB check, so the local hook and CI give the same answer. Vitest stays (golden rule 1: it was already the runner).
- **Rejected:** A check without tests (faster, but hides DB regressions); no Stop hook until Postgres runs locally (checks would only run in CI). The owner chose the full command and will start Postgres with `docker compose up` when working.
- **Status:** active. No end-to-end browser spec exists yet; the first UI feature adds it. Screenshot tests were not requested.
