# Status

_Last updated: 2026-11-02 by Claude Code (Sonnet 5.5)_

## Phase

Setup. Repo scaffolding and agent tooling done. **App spec not provided yet.**

## Done

- Git repo, `main` branch, private GitHub repo.
- Agent-neutral setup: `AGENTS.md` is canonical; `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` point to it.
- Ponytail (coding philosophy + skills) and graphify (code knowledge graph) set up. See `docs/TOOLING.md`.

## Next

1. User provides the app description and any further setup instructions.
2. Write `docs/spec.md`, then decide the stack and IaC tool, recording them in `docs/decisions.md`.
3. First iteration: skeleton app + deploy/teardown scripts.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None. (Azure CLI is not installed on the user's machine yet.)

## Session log (newest first)

- 2026-11-02 — Initial setup (Claude Code). No application code yet.
