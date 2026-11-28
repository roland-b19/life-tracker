# Life Tracker

Personal life-tracking app (wishlist, tasks, gym, food, health). Started as a university Azure course project; now live for personal use on Vercel + Neon (`https://life-tracker-robo.vercel.app`). The Azure setup (`infra/`, `scripts/azure-*.sh`) is kept for course demos and is deployed only on request.

Stack: Next.js 16 (App Router), TypeScript, Drizzle ORM, Postgres, NextAuth, Vitest. A separate `worker/` (Node, Docker) sends push reminders from an Azure Storage Queue. Node version: `.nvmrc`.

## Golden rules
1. **One way to do each thing.** Before writing code, find how this project already does it (KB conventions first, then the code) and do it the same way. If you find two or more ways, ask the user which one wins before writing the code. To change a pattern, propose it to the user first, then migrate every usage in the same change. If that would touch more than 20 files, ask whether to migrate now or track it: mark the old pattern deprecated in the KB conventions, list its remaining usages in the KB status, and never use it in new code.
2. **Leave nothing dead.** Every change removes the code, files, dependencies, config, comments and docs it made unused, proven by searching every kind of reference (string lookups, reflection, config, routes, templates, build and CI scripts, public APIs), not only imports.
3. **Never stop at "I can't".** When the tools or access at hand can't do something, find a tool that can (an MCP server, CLI, plugin or skill) and propose it; install only on the user's yes.
4. **Done means hand-off ready.** The checks on the KB conventions page pass and a new agent with no chat history could continue from the repo alone. Then open the pull request with merge-branch, without asking, and get CI green. Never commit to or push the default branch, never force-push without the user's OK, and merge only on the user's word.
5. **Update as you go, never later.** When a change makes a rule, skill, KB page, convention, test or doc wrong or incomplete, update it right away, in the same change. Changing a rule or a convention needs the user's OK first.
6. **New features start with a plan.** A new feature adds or changes what the product or workflow does and needs a design choice the user hasn't made. Plan it with the user using plan-feature, in this session, and build only once the user approves the plan. Bug fixes, small tweaks and follow-ups are not features.

## Model and effort
- Set `model` and `effort` on every subagent and every new session, by its task, from the table below.
- Our agents set both in their frontmatter. A built-in agent (Explore, general-purpose, Plan) gets both as Agent tool parameters. `start_session` gets the model's current id (the one this session knows from its environment, never a literal id written in a skill) and `effort`.
- When the table asks for more than the main session has, use the main session's model or effort and say so in one line.
- The main session's model and effort are the user's.

| Model | low | medium | high |
|---|---|---|---|
| Haiku | find files, simple searches, list or summarize logs, read-only sessions (status, PR lists, run the tests and report) | read many files and summarize what matters (a broad Explore) | read-only research that must reach a conclusion (docs, how a tool behaves) |
| Sonnet | mechanical edits from exact instructions (renames, moving text, a list of changes already decided) | build steps of an approved plan, small bug fixes, KB and docs, routine refactors | write tests, plan review, independent review, a bug whose cause is unknown but contained |
| Opus | short calls that need judgment but little thinking (triage, choosing an approach) | routine main-session work (small changes the user asks for, commits, PRs) | planning with the user, design decisions, hard debugging, security |

- An agent that writes code uses Sonnet or Opus.
- A review never uses Haiku.
- Retry a wrong or failed result once on the next model at the same effort (Haiku, then Sonnet, then Opus). If Opus fails, ask the user.
- Never Fable, xhigh or max.

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

- `docs/kb/` is this project's memory. Before working on an area, read the page the index points to. When it points to none, grep `docs/kb/`.
- Code wins: if the KB contradicts the code, fix the KB right away.
- Project facts go in the KB via the maintain-kb skill, never in auto memory.
