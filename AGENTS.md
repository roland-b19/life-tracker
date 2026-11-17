# AGENTS.md — Life Tracker

Single source of truth for **every** AI coding agent working in this repo (Claude Code, Codex, Cursor, ...).
`CLAUDE.md` only points here. Edit rules here, never duplicate them there.

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
- **Mandatory rules.** Apply the ponytail rules (see Coding philosophy) to every coding task.

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
