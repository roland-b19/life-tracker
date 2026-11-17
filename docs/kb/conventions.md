---
summary: How we work together, the project's one way to do each job, checks, risk tiers and gotchas.
last_verified: 2026-11-18
---

# Conventions

## Working together
- The owner writes Romanian: chat replies are in Romanian. Code, comments, commit messages and PRs are in English.
- Ask before changing the stack, adding a dependency, creating any Azure resource or anything that costs money. Do nothing the owner did not ask for.
- Never run a command against the live database; never ask for a connection string, token or key in chat.
- **When the user is away:** after the user says they are away or asleep, don't wait, ask questions or ask permission until they are back. At each choice take the option you would recommend, keep going, and list the choices made in the PR body and the KB log. The user's away message can allow what normally needs their word, such as merging; the safety limits still hold.

## One way to do each job
- **Planning a feature:** the plan-feature skill, before any building.
- **Finding code:** plain search (Grep, Glob, reads) for ideas and areas, starting from the KB architecture page. Where a language server plugin is installed, use the LSP tool only when an exact location is needed: a definition, every caller or reference before changing or removing something, or the exact line to edit; never to browse. Its automatic error reports stay on. No stored code indexes.
- **Finding KB facts:** INDEX first; when it names no page, the KB search (maintain-kb SKILL.md, Search), then read the sections it points to. Grep only to list every occurrence of an exact string, such as a decision's usages.
- **Writes from the UI:** a `"use server"` action in `src/app/actions/<feature>.ts` that calls `requireUser()` first, parses with zod from `src/lib/validations/`, then calls `src/lib/<feature>.ts`. Every new action ships an authorization test: owner allowed, other user denied, anonymous denied.
- **Undo:** every change has an Undo toast; the delete restores the row under its old id.
- **UI:** the Wishlist page (`app/wishlist/`, `app/globals.css`, `app/components/`) is the reference. Dark only, no animations except the existing ones.
- **Migrations:** additive Drizzle migrations with explicit GRANTs; the owner runs them on the live database before the dependent code merges.
- **Checks:** the verify skill has run at the change's test tier, the fast checks pass, and review-change has run; its PR body lists every finding as fixed or with a reason.
  - **Fast checks** (the one check command): `npm run check` (lint, typecheck, tests, KB check). Tests need Postgres, see Gotchas.
  - **One end-to-end spec:** none yet; the first UI feature adds it (see [status](status.md)).
  - **Targets:** a phone-width browser (375px) and desktop Chrome, dark only.
- **Risk tiers:** review-change's tier script reads the two lists below from the default branch's copy of this page; a changed file in neither list is Medium.
  - **Low:** `docs/**`, `**/README.md`, `tests/**`
  - **High:** `.github/**`, `.claude/settings*.json`, `**/hook-settings.json`, `**/*_hook.py`, `src/auth.ts`, `src/server/auth.ts`, `src/server/same-origin.ts`, `drizzle/**`, `drizzle.config.ts`, `infra/**`, `scripts/azure-*`, `scripts/db-init.cjs`, `Dockerfile`, `worker/**`
- **Merge on green:** off

Deprecated patterns: the weight REST API (new features use server actions), see [status](status.md), Tracked migrations.

## Gotchas
- **Next.js 16:** has breaking changes against older versions. Read the guide in `node_modules/next/dist/docs/` before changing framework-level code.
- **Postgres for tests:** `npm test` needs Postgres. Locally `docker compose up` provides it; without Docker or Postgres the DB-backed tests cannot run, and CI is the proof.
- **Time zone:** compute "today" with `src/lib/format-date.ts` (`APP_TZ`), never `new Date()` day math on the server, which runs in UTC.
- **New table:** add a GRANT for `life_tracker_app` in the migration, or the app cannot use it.
- **Postgres version:** pinned in four places that must match: `.github/workflows/ci.yml`, `.github/workflows/backup.yml`, `docker-compose.yml`, `scripts/backup-now.sh`.
- **Service worker cache:** the cache name in `app/components/page-cache.ts` must match `PAGES` in `public/sw.js`; bump `CACHE` in `public/sw.js` to refresh the muscle model.
- **Backup workflow:** `.github/workflows/backup.yml` must not be weakened; the private `age` key stays with the owner.
- **Health data:** never sent to an AI provider.
- **Other worktrees:** `.claude/worktrees/**` carry their own test copies, so lint, typecheck and Vitest exclude `.claude/**`.
