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
