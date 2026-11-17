# Tooling

How the agent tooling is wired, and how to set it up on a new machine or with a different agent.

## Required on the machine

| Tool | Why | Install (macOS) |
|------|-----|-----------------|
| git, gh | repo and GitHub | `brew install git gh`, then `gh auth login` |
| uv | installs graphify | `brew install uv` |
| pre-commit, gitleaks | local secret scan before each commit (`.pre-commit-config.yaml`) | `brew install pre-commit gitleaks`, then `pre-commit install` |
| Azure CLI | deploy scripts (needed from the first iteration) | `brew install azure-cli`, then `az login` |
| Bicep | IaC (comes with Azure CLI, `az bicep install`) | included in `brew install azure-cli` |

## Graphify (code knowledge graph)

- Official project: <https://github.com/Graphify-Labs/graphify>, PyPI package `graphifyy` (two y's). Version used: see `docs/decisions.md` / `graphify --version`.
- Install the CLI once per machine:
  ```bash
  uv tool install graphifyy
  graphify hook install      # rebuild the graph automatically on commit/checkout/merge
  ```
- Generate or refresh the graph: ask the agent to run `/graphify .`, or run `graphify update .` (code only, no LLM needed).
- Output is in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`). It is git-ignored on purpose: it is derived, and the post-commit hook rewrites it on every commit, which would leave the tree dirty after each commit. Each machine builds its own.
- Per-agent integration files are already committed. On a fresh machine nothing more is needed except the CLI above:
  - `AGENTS.md` (`## graphify` section): the usage rules, read by every agent
  - `.claude/settings.json`: Claude Code `PreToolUse` hooks (`graphify hook-guard`)
  - `.gemini/settings.json`: Gemini CLI `BeforeTool` hook
  - `.agents/rules/graphify.md`, `.agents/workflows/graphify.md`: Google Antigravity
  - `.github/copilot-instructions.md`: GitHub Copilot
- The hooks call `graphify` from `PATH`, so the CLI must be installed on every machine where an agent runs. They only nudge the agent toward the graph; they do not block work.
- Codex: reads `AGENTS.md`, no extra files needed (graphify's Codex hook is a no-op and was not committed).
- Remove: `graphify uninstall`.

## Gotchas

- A personal global gitignore that ignores `.claude/` is overridden by `!.claude/` in this repo's `.gitignore`, so the shared Claude Code config is committed.

## Skills

2026-11-17: the project skills (ponytail x6, apple-design, ultimate-design-skill, secure-development, code-review-guide, graphify) were removed from `.agents/skills/` and `.claude/skills/` at the user's request. The ponytail rules stay inlined in `AGENTS.md`. The references they held are in git history (before this commit).

## Agent support matrix

| Agent | Reads |
|-------|-------|
| Claude Code | `CLAUDE.md` -> `AGENTS.md` |
| Gemini CLI | `GEMINI.md` -> `AGENTS.md` |
| Google Antigravity | `AGENTS.md`, `.agents/rules/` |
| GitHub Copilot (CLI, VS Code, coding agent) | `AGENTS.md`, `.github/copilot-instructions.md` |
| Codex, Cursor, others | `AGENTS.md` |
