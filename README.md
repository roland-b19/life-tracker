# Life Tracker

A personal life-tracking app, built first as a university project for an Azure cloud course, then kept for personal use.

> Status: iteration 2, production container foundation in progress. See [`docs/STATUS.md`](docs/STATUS.md).

## For people and for AI agents

- Working rules for every agent (Claude Code, Gemini, Antigravity, Copilot, Codex, ...): [`AGENTS.md`](AGENTS.md)
- Where we are and what is next: [`docs/STATUS.md`](docs/STATUS.md)
- Course requirements: [`docs/requirements.md`](docs/requirements.md)
- Decisions and open questions: [`docs/decisions.md`](docs/decisions.md)
- Tooling setup (graphify, ponytail, Azure CLI): [`docs/TOOLING.md`](docs/TOOLING.md)

## Run locally

Requirements: Node 24 LTS, Docker Desktop, and npm.

```bash
cp .env.example .env
docker compose up -d
npm ci --ignore-scripts
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>. Development sign-in accepts a local user name only; it is refused when `NODE_ENV=production`.

Checks:

```bash
npm run lint
npm run typecheck
npm test
```

The database is bound to `127.0.0.1` only. Stop it with `docker compose down`; add `-v` only when intentionally deleting local data.

## Production container

The production image uses Next.js standalone output and runs as the unprivileged
`nextjs` user. It exposes `/health` for liveness checks and does not include
tests, documentation, local configuration or development dependencies.

```bash
docker build --tag life-tracker:local .
```

Azure iteration scripts are under [`scripts/`](scripts/). Run
`scripts/azure-preflight.sh westeurope` after `az login`. The Bicep template is
compiled locally by CI and with `az bicep build`; it is not deployed in phase
2A. The deploy script refuses to continue until both explicit cost and deploy
gates are set. Teardown requires the literal confirmation argument, for
example `scripts/azure-teardown.sh dev DELETE`; it deletes the matching
resource group, waits for deletion and verifies that it is gone. It is safe to
run again when the group is already absent. It never deletes subscription
resources outside the `life-tracker-*` project naming scope.
