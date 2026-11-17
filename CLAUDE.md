# Life Tracker

Personal life-tracking app (wishlist, tasks, gym, food, health). Started as a university Azure course project; now live for personal use on Vercel + Neon (`https://life-tracker-robo.vercel.app`). The Azure setup (`infra/`, `scripts/azure-*.sh`) is kept for course demos and is deployed only on request.

Stack: Next.js 16 (App Router), TypeScript, Drizzle ORM, Postgres, NextAuth, Vitest. A separate `worker/` (Node, Docker) sends push reminders from an Azure Storage Queue. Node version: `.nvmrc`.

## Commands

- `npm run dev` / `build` / `start`
- `npm run lint`, `npm run typecheck`, `npm test` (CI runs all three against Postgres)
- `npm run db:migrate` (Drizzle migrations), `npm run seed:dev`

Next.js 16 has breaking changes against older versions: read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level code.

## Working rules

- The user writes Romanian: reply in Romanian. Code, comments, commit messages and PRs are in English.
- Ask before: changing the stack, adding a dependency, creating any Azure resource, anything that costs money. Do nothing the user did not ask for.
- Smallest change that fully solves the task. No speculative features or abstractions.
- Every new endpoint or server action ships an authorization test: owner allowed, other user denied, anonymous denied.
- Never disable or weaken a security check, test or scanner to make something pass.
- UI: the Wishlist page (`app/wishlist/`, `app/globals.css`, `app/components/`) is the reference; every page matches it. Dark only, no animations except the existing ones, every change has an Undo toast.

## Git

- `main` must always work. Short branches (`feat/`, `fix/`, `chore/`) merged through a PR; Conventional Commits. Never force-push `main`.
- Never commit secrets, `.env*` files, keys or personal data. Real personal data lives only in the live database and the gitignored `.local/` folder.

## Live deploy (Vercel + Neon)

- Migrations are additive and run by the user from their Mac with the owner URL typed into a hidden prompt, before merging code that needs them. Never ask for a connection string, token or key in chat, and never run a command against the live database.
- `.github/workflows/backup.yml` makes the weekly encrypted backup: do not weaken it. The private `age` key stays with the user.
- Preview deployments get no database or auth secrets.
- No health data is ever sent to an AI provider.

## Azure

- Everything deployed is scripted (`infra/main.bicep`, `scripts/azure-*.sh`); no click-ops. Tag resources `project=life-tracker`, `env=<name>`; tear everything down after use (`scripts/azure-teardown.sh`).
- No database or storage reachable from the public internet; secrets only in Key Vault; managed identity over connection strings.
- Never run a command that creates, changes or deletes real Azure resources without the user's explicit OK in the current session.
