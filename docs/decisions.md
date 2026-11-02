# Decisions

Newest at the bottom of each section. Do not re-litigate a decision without the user asking; add a new dated entry that supersedes it instead.

## Made

- **2026-11-02 — Agent-neutral repo.** `AGENTS.md` is the single source of truth. `CLAUDE.md` / `GEMINI.md` import it; `.github/copilot-instructions.md` points to it. Project knowledge lives in the repo (`docs/`), never only in a chat or an agent's memory, so agents can be swapped mid-project.
- **2026-11-02 — Ponytail vendored.** Rules inlined in `AGENTS.md`, skills copied to `.agents/skills/` (upstream `DietrichGebert/ponytail` at commit `96608e0`). Chosen over the Claude-only plugin so it works for every agent and has no third-party hooks. Update procedure: `docs/TOOLING.md`.
- **2026-11-02 — Graphify installed project-scoped.** Local CLI (`graphifyy` 0.9.100 from PyPI). Code is parsed locally with tree-sitter, nothing leaves the machine. `graphify-out/` is git-ignored (derived, rewritten on every commit by the hook); each machine rebuilds it.
- **2026-11-02 — Two hosting phases.** Phase 1 (course, until January): Azure, scripted, ephemeral. Phase 2 (after the presentation): migrate to a near-free personal stack. Prefer portable building blocks now.
- **2026-11-02 — GitHub.** Private repo `life-tracker` under `roland-b19`, default branch `main`, SSH remote.
- **2026-11-02 — Docs language.** Docs, code and commits in English; the user talks to agents in Romanian.

## Open

- App description / functionality (user will provide; goes to `docs/spec.md`).
- Tech stack (language, framework, frontend or not).
- IaC tool: Terraform vs Azure CLI scripts vs Bicep/ARM (the course will discuss this in later lectures; wait unless told otherwise).
- Compute choice (App Service, Container Apps, Functions, VM, ...).
- Database / storage choice.
- Auth provider (Microsoft Entra ID / Entra External ID / own JWT) and the authorization model (roles).
- Message queue use (Service Bus / Storage Queue) and for what.
- Whether to add a mobile client (optional per the course).
- Public vs private repo, and a license, once the project is shared.
