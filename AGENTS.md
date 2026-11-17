# AGENTS.md — Life Tracker

Single source of truth for **every** AI coding agent working in this repo (Claude Code, Gemini CLI, Antigravity, GitHub Copilot, Codex, Cursor, ...).
`CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` only point here. Edit rules here, never duplicate them there.

## Read first (in this order)

1. This file.
2. `docs/STATUS.md` — where we are, what is next, what is deployed right now.
3. `docs/requirements.md` — the course requirements this project is graded on.
4. `docs/decisions.md` — decisions already made (do not re-litigate) and open questions.

Nothing about this project may live only in a chat or in an agent's private memory. If it matters, it goes in the repo, so the user can switch agents at any time.

## Project

- Working name: **Life Tracker**. A university project for an Azure cloud course; after the course it becomes a personal-use app owned by the user.
- **The app's functionality is not defined yet.** The spec will arrive later as `docs/spec.md`. Until then, do not invent features and do not pick a stack: ask.
- Two phases:
  1. **Course phase (until January):** runs on Azure using course credits and meets every requirement in `docs/requirements.md`.
  2. **After the presentation:** migrate to a near-free stack for personal use.
- Consequence: prefer portable building blocks (containers, standard SQL, config through environment variables, plain HTTP and queue semantics) so phase 2 is a re-hosting, not a rewrite. No speculative abstraction layers for it (see Coding philosophy).

## Working agreement

- **Language:** the user writes Romanian, so reply in the user's language. Code, comments, docs, commit messages and PRs are in English.
- Ask before: choosing or changing the stack, adding a dependency, creating any Azure resource, anything that costs money.
- **Mandatory tools.** Apply the ponytail rules (see Coding philosophy) to every coding task, and use graphify (see `## graphify`) for every codebase question. If `graphify-out/graph.json` is missing (it is git-ignored, so a fresh clone has none), run `graphify update .` first; if the `graphify` command is not installed, tell the user instead of skipping it silently.
- **Scope guard.** Implement only the iteration that `docs/STATUS.md` marks as current. `docs/release-plan.md` is the plan the user agreed, and its later steps are not work orders until the user says so: never start a later iteration, or pull its features into the current one, until the user agrees it and it has its own plan. When the current iteration is done, stop and wait.
- Keep `docs/STATUS.md` current. Before you stop working, update it and commit (see Handoff).

## Cloud rules (Azure)

- Everything deployed is **scripted** (IaC or `az` CLI). No portal click-ops that are not captured in a script. The tool is recorded in `docs/decisions.md`.
- Resources are **ephemeral**: credit is limited. Provide a deploy script and a teardown script (delete the resource group). When an iteration ends, tear everything down. Keep "Deployed Azure resources" in `docs/STATUS.md` truthful.
- Tag every resource (`project=life-tracker`, `env=<name>`). Choose the cheapest SKU or a free tier, and state the estimated cost before deploying.
- Security is graded: no database or storage reachable from the public internet (private endpoint, VNet or firewall rules), secrets only in Key Vault or environment, managed identity over connection strings where possible, authentication **and** authorization are mandatory.
- Never run a command that creates, changes or deletes real Azure resources without the user's explicit OK in the current session. Never ask the user to paste credentials, keys or tokens into chat.

## Git

- Default branch `main` must always work. Work on short branches (`feat/...`, `fix/...`, `docs/...`) and merge through a PR; trivial doc fixes may go straight to `main`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `infra:`). Small, frequent commits.
- Never force-push `main`, never rewrite published history.
- Real personal data (the user's actual wishlist, tasks, weights, anything health-adjacent) lives only in the live database and in the gitignored `.local/` folder; `scripts/import-personal.cjs` loads it. Never commit it, never paste it into docs, PRs or issues.
- Never commit secrets, `.env` files, keys, Terraform state or Azure subscription/tenant details. `.gitignore` covers the common cases; it is not a safety net, check your diff.

## Personal deploy (variant B) is live

Vercel + Neon Free + GitHub sign-in at `https://life-tracker-robo.vercel.app` holds the user's real data. The runbook (deploy, migrations, data import, rollback, secrets, weekly encrypted backup and restore test) is in `README.md`. Rules:
- Migrations are additive and run by the user from their Mac with the owner URL typed into a hidden prompt; run them before merging code that needs them. Never ask for a connection string, token or key in chat, and never run a command against the live database yourself.
- `.github/workflows/backup.yml` makes the weekly encrypted backup; do not weaken it (no plaintext dump, no longer retention without a reason). The private `age` key is only ever with the user.
- Preview deployments get no database or auth secrets.

## Handoff protocol (agents change over time)

At the end of every working session:
1. Update `docs/STATUS.md`: what is done, what is next, open questions, what is deployed.
2. Record any new decision in `docs/decisions.md` with the date.
3. Commit and push.

When you start: read the files under "Read first", then `git log --oneline -15`, before touching anything.

## UI design

The app must feel like Apple software (Apple Human Interface Guidelines: system components, system colors and text styles before custom ones, accessibility on every screen). The house style is the Wishlist page, which the user signed off as the reference: `app/wishlist/wishlist-client.tsx`, its CSS in `app/globals.css` and the shared parts in `app/components/`. Every page must match it. The app has no animations or transitions, except the Tasks progress ring, the Wishlist total count-up and the Nutrition count-up. Decisions about the design are in `docs/decisions.md`.

## Security

Security is graded and the app will hold personal data. The plan is `docs/security-plan.md`; the standards are ASVS 5.0 target L2, OWASP Top 10:2025, NIST SSDF and MCSB for Azure.

- Security checks are part of "done" for every change, like tests.
- Never disable, skip or weaken a security check, test, scanner or hook to make something pass. Fix the cause or ask the user.
- Every new endpoint ships an authorization test: owner allowed, other user denied, anonymous denied.
- Never log, commit or paste secrets, tokens, or health/finance data.
- A new dependency, data type, external service or AI use updates `docs/threat-model.md` and `docs/security/data-inventory.md` in the same PR.
- No health data is ever sent to an AI provider (decision in `docs/decisions.md`).

## Code review

When you review a change or prepare one for review, check correctness, security, tests and whether every line is needed. Say what you did not review or verify.

## Code map (graphify)

Graphify turns the repo into a queryable knowledge graph in `graphify-out/` (not committed; rebuilt locally by git hooks, or run `graphify update .`). The rules for using it are in the `## graphify` section at the end of this file. Setup and per-agent details: `docs/TOOLING.md`.

## Coding philosophy: ponytail

Vendored from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT, commit `96608e0`), so it applies to any agent.

### Ponytail, lazy senior dev mode

You are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.

#### Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

#### The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
