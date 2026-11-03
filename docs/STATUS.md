# Status

_Last updated: 2026-11-03 by Copilot_

## Phase

Iteration 1 implementation complete locally and merged in `main`. The detailed plan for proposed iteration 2 is in `docs/iteration-2.md`; it is awaiting user approval. No Azure resources are deployed.

## Done

- Git repo, `main` branch, private GitHub repo.
- Agent-neutral setup: `AGENTS.md` is canonical; `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` point to it.
- Ponytail (coding philosophy + skills) and graphify (code knowledge graph) set up. See `docs/TOOLING.md`.

- App idea received: `docs/idea.md` (13 modules, multi-user, notifications, Apple-level design, AI integration).
- `apple-design` skill (distilled HIG) in `.agents/skills/apple-design/`.
- Security plan `docs/security-plan.md` validated by the user (2026-11-02).
- `secure-development` skill in `.agents/skills/secure-development/`: `SKILL.md`, 11 references (ASVS 5.0, Top 10:2025, SSDF, privacy, supply chain/CI, optional Azure/AI/iOS), 4 templates. References were independently fact-checked against the primary sources. Security rules added to `AGENTS.md`.

- `code-review-guide` skill (reviewer guide, author guide, security review, reviewing agent-written code, PR template); sources fact-checked. Named `-guide` because Claude Code has a built-in `code-review` skill.
- Final audit of the three skills made in this project (apple-design, secure-development, code-review-guide): frontmatter, routing, cross-references, no project-specific text, copyright overlap, usability dry-runs. Padding and duplicates removed.
- Generic `project-setup` skill outside this repo, in `~/Documents/projects/project-setup/` (script + template + the 5 skills), for starting any new project with the same structure.
- Cleanup: `.pre-commit-config.yaml` (secret scan) added; `docs/security-plan.md` marked validated. The setup is ready for implementation once the plan is approved.
- Iteration 1: Next.js 16 TypeScript app, Drizzle schema/migrations, restricted PostgreSQL roles, Auth.js local-only sign-in, weight API/UI, security headers, tests, CI and Dependabot.

- Planning Q&A done for Gym, Food + weight, Money, To-do, Wishlist, Family business; Wedding, Chess, Health, Work opportunities and Projects dropped. Draft in `docs/spec.md` (+ seed data `docs/spec/gym-sample.md`), tiers and stack direction in `docs/decisions.md`.

## Next

1. **Iteration 2 plan:** review and approve `docs/iteration-2.md`; no Azure changes happen before explicit deployment approval after the cost gate.
2. After iteration 2, stop again. Later iterations need their own user-approved plans.
3. `docs/roadmap.md` remains an estimate only and is not a work order.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None. Local PostgreSQL was used for validation and can be stopped with `docker compose down`.

## Session log (newest first)

- 2026-11-03 — PR #1 CI secret scan fixed with the GitHub token, pull-request read permission and full history required for pull-request scans; local lint, typecheck, migration and authorization tests passed.
- 2026-11-03 — Iteration 1 implemented locally: security spine, weigh-in slice, PostgreSQL, tests and CI. Validation passed; no Azure resources created.
- 2026-11-03 — Detailed plan for proposed iteration 2 added in `docs/iteration-2.md`; awaiting user approval. No Azure resources created.
- 2026-11-02 — Iteration 1 plan written and approved (`docs/iteration-1.md`); the user deferred implementation. No application code yet.
- 2026-11-02 — Spec approved; threat model v1, data inventory and risk register written (`docs/threat-model.md`, `docs/security/`). No application code yet.
- 2026-11-02 — Planning Q&A for all modules, tiers, stack direction (TypeScript, Entra External ID, queue for push). Spec drafted. No application code yet.
- 2026-11-02 — Added code-review-guide, audited the 3 project skills, created project-setup, cleanup. No application code yet.
- 2026-11-02 — Initial setup (Claude Code). No application code yet.
