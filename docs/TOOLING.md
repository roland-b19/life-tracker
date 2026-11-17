# Tooling

How the tooling is set up on a new machine.

## Required on the machine

| Tool | Why | Install (macOS) |
|------|-----|-----------------|
| git, gh | repo and GitHub | `brew install git gh`, then `gh auth login` |
| pre-commit, gitleaks | local secret scan before each commit (`.pre-commit-config.yaml`) | `brew install pre-commit gitleaks`, then `pre-commit install` |
| Azure CLI | deploy scripts (needed from the first iteration) | `brew install azure-cli`, then `az login` |
| Bicep | IaC (comes with Azure CLI, `az bicep install`) | included in `brew install azure-cli` |

## Skills

2026-11-17: the project skills (ponytail x6, apple-design, ultimate-design-skill, secure-development, code-review-guide) were removed from `.agents/skills/` and `.claude/skills/` at the user's request. The ponytail rules stay inlined in `AGENTS.md`. The references they held are in git history (before this commit).
