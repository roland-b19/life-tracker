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

## For people and for AI agents

- Working rules for every agent (Claude Code, Gemini, Antigravity, Copilot, Codex, ...): [`AGENTS.md`](AGENTS.md)
- Course requirements: [`docs/requirements.md`](docs/requirements.md)
- Decisions and open questions: [`docs/decisions.md`](docs/decisions.md)
- Security: [`docs/security-plan.md`](docs/security-plan.md), [`docs/threat-model.md`](docs/threat-model.md), [`docs/security/`](docs/security/)
- Tooling setup (graphify, ponytail, Azure CLI): [`docs/TOOLING.md`](docs/TOOLING.md)
