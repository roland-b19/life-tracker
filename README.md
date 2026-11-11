# Life Tracker

A personal life-tracking web app (PWA): **Gym**, **Health** (meals, water, steps, weight, shopping list), **Tasks** and a **Wishlist**. Data is isolated per account. It was built as a university project for an Azure cloud course and is kept for personal use afterwards.

Stack: Next.js 16 (App Router), React 19, NextAuth v4, Drizzle ORM, PostgreSQL, Vitest. Node 24.

> Where we are and what is next: [`docs/STATUS.md`](docs/STATUS.md). The plan to the first deploy: [`docs/release-plan.md`](docs/release-plan.md).

## One codebase, two ways to run it

The variant is chosen by environment variables, not by branches.

| | A. Azure (course) | B. Free personal |
|---|---|---|
| Hosting | Container Apps, PostgreSQL Flexible Server (private), Key Vault, ACR | Vercel Hobby + Neon Free |
| Sign-in | Microsoft Entra (`AUTH_PROVIDER=azure-ad`) | GitHub OAuth with an owner allowlist (`AUTH_PROVIDER=github`, `OWNER_ALLOWLIST`) |
| Claude assistant (Health, Settings) | on (`NEXT_PUBLIC_CLAUDE_ENABLED=true`) | hidden |
| Push reminders | on (`NEXT_PUBLIC_PUSH_ENABLED=true`) | hidden |

The two `NEXT_PUBLIC_*` flags are inlined at build time, so they must be set before `next build`. All variables are documented in [`.env.example`](.env.example). Status of each variant (what is deployed, what is verified) is in [`docs/STATUS.md`](docs/STATUS.md).

## Run locally

Requirements: Node 24, Docker Desktop, npm.

```bash
cp .env.example .env
docker compose up -d
npm ci --ignore-scripts
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>. With `AUTH_DEV=true` the sign-in page takes a local user name only; this is refused when `NODE_ENV=production`. To fill a dev user with sample data (weigh-ins, meals, tasks, wishlist, 8 weeks of workouts; open Gym once first so the routine exists): `npm run seed:dev -- <name>`.

The database listens on `127.0.0.1` only. Stop it with `docker compose down`; add `-v` only to delete the local data on purpose.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use a real PostgreSQL (`DATABASE_URL_TEST`, the `life_tracker_test` database from `docker compose`) and run one file at a time. CI runs the same checks plus secret scanning, an SBOM, a container scan and a Bicep compile.

## Database migrations

Schema lives in `src/db/schema.ts`; migrations are in `drizzle/`.

```bash
npx drizzle-kit generate --name <what_changed>   # after editing the schema
npm run db:migrate                               # applies them (uses DATABASE_URL_MIGRATE, the owner role)
```

The app itself connects as a restricted role with no rights to change the schema.

## Production container (Azure variant)

The image uses Next.js standalone output, runs as the unprivileged `nextjs` user and exposes `/health`.

```bash
docker build --tag life-tracker:local .
```

Scripts in [`scripts/`](scripts/) deploy and remove the Azure environment; they never run without explicit cost and deploy confirmations:

- `scripts/azure-preflight.sh <region>`: read-only checks after `az login`.
- `scripts/azure-deploy.sh`: what-if, then deploy by immutable image digest (`sha256:...`), then run the migrations as a job.
- `scripts/azure-teardown.sh <env> DELETE`: deletes the environment's resource group and verifies it is gone. Safe to run again.

The infrastructure is [`infra/main.bicep`](infra/main.bicep). Everything is ephemeral: deploy, verify, tear down.

## Personal deploy (variant B): runbook

Live on Vercel (project `life-tracker`, region `fra1`) with a Neon Free database and GitHub sign-in. Environment variables are set in Vercel (Production only, Sensitive); never in the repo.

- **Deploy:** merging to `main` deploys to Production. A pull request preview has no database or auth secrets, so it only shows that the build works.
- **Migrations:** run before merging code that needs them, from your Mac with the Neon **owner** connection string (direct, not pooled). The hidden prompt keeps it out of your shell history.
  ```bash
  read -rs "DATABASE_URL_MIGRATE?Neon owner URL (direct): " && export DATABASE_URL_MIGRATE && npm run db:migrate; unset DATABASE_URL_MIGRATE
  ```
- **Migration `0023_meals_forgotten`** (adds `meals.forgotten`) must be run before deploying code that has Past foods delete.
- **Load your own data (one time):** `scripts/import-personal.cjs` reads the gitignored `.local/personal-data.json` (wishlist with prices, today and daily tasks, and optionally categories: a `categories` object per list, `[name, price, category]` wishlist entries, `[title, category]` daily tasks; run migration `0021` first) into your account. Sign in to the app once first. It skips anything whose name already exists, so it is safe to run again. Gym needs no import: opening Gym creates the routine.
  ```bash
  read -rs "DATABASE_URL_MIGRATE?Neon owner URL (direct): " && export DATABASE_URL_MIGRATE && node scripts/import-personal.cjs --subject <your GitHub numeric id> --dry-run; unset DATABASE_URL_MIGRATE
  ```
  Remove `--dry-run` to write.
- **Replace your shopping list (one time):** `scripts/import-shopping.cjs` reads the gitignored `.local/shopping-list.json` (`{"category": ["item", ...]}`, in walking order) and **deletes every shopping item, its history and all shopping categories of your account first**, then adds the file's. Nothing else is touched. Names are kept as written; category names are lower-cased, as the app does. Run the dry run first, it prints what it would delete and add and writes nothing.
  ```bash
  read -rs "DATABASE_URL_MIGRATE?Neon owner URL (direct): " && export DATABASE_URL_MIGRATE && node scripts/import-shopping.cjs --subject <your GitHub numeric id> --dry-run; unset DATABASE_URL_MIGRATE
  ```
  Remove `--dry-run` to write.
- **Roll back:** Vercel, Deployments, the previous deployment, Instant Rollback. A bad migration is undone from a backup (below) or Neon's history window; migrations are additive, so rolling the code back is normally enough.
- **Rotate a secret:** change it in Vercel (or GitHub for the backup), redeploy. `NEXTAUTH_SECRET` signs everyone out; the GitHub client secret is rotated in the OAuth app first, then in Vercel.
- **Free plan changes:** Neon or Vercel may change the Free terms. The weekly backup below plus `docker build` make the app movable to any host that runs Docker and PostgreSQL.
- **Ignored Build Step** (Vercel, Settings, Build and Deployment): Behavior "Custom", command `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`. Pull request previews are skipped (exit 0) and builds of `main` run (exit 1). `$VERCEL_ENV` is not set in this step, so a check on it skips production too ("Canceled by Ignored Build Step").

### Backups

`.github/workflows/backup.yml` runs every Sunday (and on demand): `pg_dump`, encrypted with `age` on the runner, uploaded as the artifact `life-tracker-backup` for 90 days. Only the public key is in the repo; the private key is kept offline by the owner and never in GitHub.

One-time setup:

1. In the Neon SQL Editor create a read-only role (use a generated password, for example from `openssl rand -base64 24 | tr -d '/+='`). If the `GRANT` is refused, use the owner string instead.
   ```sql
   CREATE ROLE life_tracker_backup LOGIN PASSWORD '<generated>';
   GRANT pg_read_all_data TO life_tracker_backup;
   ```
2. Store its **direct** connection string as the repository secret (the prompt hides the value):
   ```bash
   gh secret set BACKUP_DATABASE_URL --repo roland-b19/life-tracker
   ```
3. Run it once: `gh workflow run backup.yml --repo roland-b19/life-tracker`, then check that the run is green.

Restore test (once before relying on it, then every quarter; the dump is custom-format PostgreSQL, so `pg_restore` reads it):

```bash
gh run download --repo roland-b19/life-tracker -n life-tracker-backup -D /tmp/lt-backup
age -d -i <path to your offline age key> -o /tmp/lt-backup/restore.dump /tmp/lt-backup/life-tracker-*.dump.age
docker compose up -d
docker compose exec -T postgres createdb -U postgres lt_restore
docker compose exec -T postgres pg_restore -U postgres -d lt_restore --no-owner < /tmp/lt-backup/restore.dump
docker compose exec -T postgres psql -U postgres -d lt_restore -c "select (select count(*) from users) users, (select count(*) from todos) todos, (select count(*) from wishlist_items) wishlist"
docker compose exec -T postgres dropdb -U postgres lt_restore
rm -rf /tmp/lt-backup
```

The counts must match the live app. Also download one artifact now and then and keep it somewhere that is not GitHub.

## For people and for AI agents

- Working rules for every agent (Claude Code, Gemini, Antigravity, Copilot, Codex, ...): [`AGENTS.md`](AGENTS.md)
- Course requirements: [`docs/requirements.md`](docs/requirements.md)
- Decisions and open questions: [`docs/decisions.md`](docs/decisions.md)
- Security: [`docs/security-plan.md`](docs/security-plan.md), [`docs/threat-model.md`](docs/threat-model.md), [`docs/security/`](docs/security/)
- Tooling setup (graphify, ponytail, Azure CLI): [`docs/TOOLING.md`](docs/TOOLING.md)
