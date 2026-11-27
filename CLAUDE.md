# Life Tracker

Personal life-tracking app (wishlist, tasks, gym, food, health). Started as a university Azure course project; now live for personal use on Vercel + Neon (`https://life-tracker-robo.vercel.app`). The Azure setup (`infra/`, `scripts/azure-*.sh`) is kept for course demos and is deployed only on request.

Stack: Next.js 16 (App Router), TypeScript, Drizzle ORM, Postgres, NextAuth, Vitest. A separate `worker/` (Node, Docker) sends push reminders from an Azure Storage Queue. Node version: `.nvmrc`.

## Golden rules
1. **One way to do each thing.** Before writing code, find how this project already does it (KB conventions first, then the code) and do it the same way. If you find two or more ways, ask the user which one wins before writing the code. To change a pattern, propose it to the user first, then migrate every usage in the same change. If that would touch more than 20 files, ask whether to migrate now or track it: mark the old pattern deprecated in the KB conventions, list its remaining usages in the KB status, and never use it in new code.
2. **Leave nothing dead.** Every change removes the code, files, dependencies, config, comments and docs it made unused. Prove it unused by searching every kind of reference (string lookups, reflection, config, routes, templates, build and CI scripts, public APIs), not only imports.
3. **Never stop at "I can't".** When the current tools, access or skills can't do something, run the find-or-build-tool skill.
4. **Done means hand-off ready.** The checks on the KB conventions page pass, and a new agent with no chat history could continue from the repo alone. Then open the change's pull request with the merge-branch skill, without asking, and get CI green. Never commit to or push the default branch, never force-push without the user's OK, and merge only as merge-branch allows. When a feature or roadmap stage is finished, run the audit-project skill.
5. **Update as you go, never later.** When a change makes a rule, skill, KB page, convention, test or doc wrong or incomplete, update it right away, in the same change. Changing a rule or a convention needs the user's OK first.
6. **New features start with a plan, in a new session.** A new feature is a change that adds or changes what the product or workflow does and needs a design choice or decision the user hasn't made yet. Bug fixes, small tweaks and follow-ups to the current work are not. Offer a new session with a short brief (the feature and the KB pages to read); if the user says to do it here, do it in this session. The session that builds the feature first plans and designs it with the user, with the plan-feature skill, and builds only once the user approves the plan.

## Commands

- `npm run dev` / `build` / `start`
- `npm run lint`, `npm run typecheck`, `npm test` (CI runs all three against Postgres)
- `npm run e2e` (Playwright browser spec on `next dev`; needs Postgres, see the KB conventions)
- `npm run db:migrate` (Drizzle migrations), `npm run seed:dev`

Next.js 16 has breaking changes against older versions: read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level code.

## Working rules

- The user writes Romanian: reply in Romanian. Code, comments, commit messages and PRs are in English.
- Ask before: changing the stack, adding a dependency, creating any Azure resource, anything that costs money. Do nothing the user did not ask for.
- Smallest change that fully solves the task. No speculative features or abstractions.
- Every new endpoint or server action ships an authorization test: owner allowed, other user denied, anonymous denied.
- Never disable or weaken a security check, test or scanner to make something pass.
- UI: the Wishlist page (`app/wishlist/`, `app/globals.css`, `app/components/`) is the reference; every page matches it. Dark and light modes (the system's, or a manual switch in Settings), no animations except the existing ones, every change has an Undo toast.

## Subagents

Every Agent call sets `model` and `effort`, picked from the task. Model is how strong the reasoning is; effort is how long it thinks on that model.

| Model, effort | Use it for |
|---|---|
| haiku, low | Run commands and report counts, grep sweeps, cleanup |
| haiku, medium | A known few-line edit, a rename from an exact list, removing code proven dead |
| sonnet, low | Fill a template from given facts (PR body, log entry), re-run one failing spec |
| sonnet, medium | A build from a precise brief, a routine verify, simplify |
| sonnet, high | New e2e tests, a verify with probes or mutation proofs, a fix whose cause is already found |
| opus, medium | A review of a small diff, a plan review, a design choice with clear options |
| opus, high | Subtle logic (concurrency, ordering, CSS cascade, time zones), a failure with an unclear cause, a whole-branch review or final verify |

- Never `xhigh` or `max`: they cost more tokens than the plan allows.
- Between two rows, take the higher one for reviews and verifies, the lower one for builds from an exact brief. A resumed agent keeps its model.

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

## Knowledge base
@docs/kb/INDEX.md

- `docs/kb/` is this project's memory. Before working on an area, read the page the index points to. When it points to none, find one with `python3 .claude/skills/maintain-kb/scripts/kb_search.py <words>`.
- Code wins: if the KB contradicts the code, fix the KB right away.
- Project facts go in the KB via the maintain-kb skill, never in auto memory.
