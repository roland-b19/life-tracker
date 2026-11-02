# Status

_Last updated: 2026-11-02 by Claude Code (Sonnet 5.5)_

## Phase

Planning. Repo scaffolding and agent tooling done. Module-by-module Q&A finished; `docs/spec.md` is a draft awaiting the user's review. **No implementation until the user approves the spec.**

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

- Planning Q&A done for Gym, Food + weight, Money, To-do, Wishlist, Family business; Wedding, Chess, Health, Work opportunities and Projects dropped. Draft in `docs/spec.md` (+ seed data `docs/spec/gym-sample.md`), tiers and stack direction in `docs/decisions.md`.

## Next

1. **Finish planning:** the user reviews `docs/spec.md`; remaining cross-cutting items (authorization details, notifications design, backup/export, privacy copy). Then write `docs/threat-model.md` v1 and `docs/security/data-inventory.md` from the skill templates (project files, not part of the skill).
2. Decide framework, database, compute service, queue product and IaC tool, recording them in `docs/decisions.md`. After that: CI security pipeline, pre-commit hooks, Azure hardening (`docs/security-plan.md`).
3. First iteration: skeleton app + deploy/teardown scripts.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None. (Azure CLI is not installed on the user's machine yet.)

## Session log (newest first)

- 2026-11-02 — Planning Q&A for all modules, tiers, stack direction (TypeScript, Entra External ID, queue for push). Spec drafted. No application code yet.
- 2026-11-02 — Added code-review-guide, audited the 3 project skills, created project-setup, cleanup. No application code yet.
- 2026-11-02 — Initial setup (Claude Code). No application code yet.
